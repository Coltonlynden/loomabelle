/* Loomabelle — script.js v33
   - Memory-safe pipeline: capped working resolution + buffer reuse.
   - createImageBitmap() downscale path when available.
   - Highlight Subject locks page scroll (mobile + desktop).
   - Keeps v32 features: subject-only outlines, marching squares, fills-inside-only.
*/
(function(){
  'use strict';
  const READY=(fn)=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const $=(s,r)=> (r||document).querySelector(s);
  const $$=(s,r)=> Array.from((r||document).querySelectorAll(s));
  const on=(el,ev,fn,opt)=> el&&el.addEventListener(ev,fn,opt||{passive:false});
  const DPR=()=>window.devicePixelRatio||1;
  const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));

  // hard caps for memory (about ~1.4MP)
  const MAX_PIX = 1_400_000; // total pixels for working image
  const PREV_MIN_W = 320;

  READY(init);

  function init(){
    const year=$('#year'); if(year) year.textContent=new Date().getFullYear();

    // Tabs
    const tabBtns=$$('.tabs .tab-btn'); const panels=$$('.panel');
    function activate(t){ tabBtns.forEach(b=>b.classList.toggle('active',b.dataset.tab===t)); panels.forEach(p=>p.classList.toggle('active',p.dataset.panel===t)); if(t==='upload') scheduleResize(); }
    tabBtns.forEach(b=> on(b,'click',()=>activate(b.dataset.tab)));
    $$('[data-scroll="#tabs"]').forEach(btn=> on(btn,'click',e=>{
      e.preventDefault(); $('#tabs')?.scrollIntoView({behavior:'smooth'});
      const t=(btn.textContent||'').toLowerCase(); activate(t.includes('drawing')?'draw':'upload');
    }));

    // Refs
    const upPanel=$('.panel[data-panel="upload"]');
    const drawPanel=$('.panel[data-panel="draw"]');
    const upZone=upPanel?.querySelector('.upload-zone');
    const fileInput=upPanel?.querySelector('.upload-zone input[type=file]');
    const prevCard=upPanel?.querySelector('.card.rose');
    const prevArea=upPanel?.querySelector('.preview');
    const formats=upPanel?.querySelector('.formats');
    const drawHost=drawPanel?.querySelector('.canvas');
    const drawToolbar=drawPanel?.querySelector('.toolbar');

    if(prevCard) prevCard.classList.add('hidden');
    if(prevArea) prevArea.innerHTML='';
    if(fileInput){ fileInput.removeAttribute('disabled'); fileInput.accept='image/*,.png,.jpg,.jpeg,.gif,.heic,.heif'; }

    // Canvases
    const prevCanvas=makeCanvas(prevArea);
    const drawCanvas=makeCanvas(drawHost);
    const pctx=prevCanvas.getContext('2d',{willReadFrequently:true});
    const dctx=drawCanvas.getContext('2d',{willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';

    // Sizing (no loops)
    function sizeCanvasToHost(cnv,host){
      const s=DPR(); const w=Math.max(PREV_MIN_W,host.clientWidth||640);
      const h=Math.max(180,host.clientHeight||Math.round(w*9/16));
      cnv.style.width='100%'; cnv.style.height='100%';
      cnv.width=Math.round(w*s); cnv.height=Math.round(h*s);
      cnv.getContext('2d').setTransform(s,0,0,s,0,0);
    }
    let rafID=null; const scheduleResize=()=>{ if(rafID) return; rafID=requestAnimationFrame(()=>{ rafID=null; sizeCanvasToHost(drawCanvas,drawHost); if(STATE.image) sizeCanvasToHost(prevCanvas,prevArea); redraw(); }); };
    on(window,'resize',scheduleResize); scheduleResize();

    // Progress bar
    const progWrap=document.createElement('div');
    progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar=document.createElement('div'); progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.9';
    progWrap.appendChild(progBar);
    const setProgress=p=>{ if(prevCard?.classList.contains('hidden')) return; progWrap.style.display='block'; progBar.style.width=(p|0)+'%'; if(p>=100) setTimeout(()=>progWrap.style.display='none',400); };

    // Preview tools (top-right)
    const tools=document.createElement('div');
    tools.style.cssText='position:absolute;right:12px;top:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess=btn('Process Photo');
    const btnHighlight=btn('Highlight Subject');
    const lblNo=document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox'; lblNo.append(chkNo,' No subject');
    const lblFill=document.createElement('label'); const chkFill=document.createElement('input'); chkFill.type='checkbox'; chkFill.checked=false; lblFill.append(chkFill,' Add fills');
    tools.append(btnProcess,btnHighlight,lblNo,lblFill);

    // Export buttons
    const fmtBtns=Array.from(formats?.querySelectorAll('button,a')||[])
      .filter(b=>['DST','EXP','PES','JEF'].includes((b.textContent||'').trim().toUpperCase()));
    const setFormatsVisible=v=>fmtBtns.forEach(b=> b.style.display=v?'inline-block':'none'); setFormatsVisible(false);

    // Upload area
    on(upZone,'click',e=>{ if(e.target.closest('button,a,input,label')) return; fileInput?.click(); });
    on(upZone,'dragover',e=>e.preventDefault());
    on(upZone,'drop',async e=>{ e.preventDefault(); const f=e.dataTransfer.files?.[0]; if(f) await loadImageFile(f); });
    on(fileInput,'change',async ()=>{ const f=fileInput.files?.[0]; if(f) await loadImageFile(f); });

    // Draw panel
    drawCanvas.style.touchAction='none';
    let drawing=false,pid=null,tool='pen';
    on(drawCanvas,'pointerdown',e=>{
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      drawCanvas.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle='#111827'; dctx.lineWidth=3;
      if(tool==='pen'){ dctx.beginPath(); dctx.moveTo(x,y); drawing=true; }
      if(tool==='eraser'){ dctx.globalCompositeOperation='destination-out'; dctx.beginPath(); dctx.moveTo(x,y); drawing=true; }
    });
    on(drawCanvas,'pointermove',e=>{
      if(!drawing||e.pointerId!==pid) return; e.preventDefault();
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=(e)=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{drawCanvas.releasePointerCapture(e.pointerId);}catch(_){}
      dctx.globalCompositeOperation='source-over'; } };
    on(drawCanvas,'pointerup',stopDraw); on(drawCanvas,'pointercancel',stopDraw);

    if(drawToolbar){
      Array.from(drawToolbar.children).forEach((b,i)=>{ b.removeAttribute('disabled'); if(i===0) b.classList.add('active'); });
      const [btnPen,btnEraser]=[drawToolbar.children[0],drawToolbar.children[1]];
      on(btnPen,'click',()=>{ tool='pen'; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); });
      on(btnEraser,'click',()=>{ tool='eraser'; btnEraser.classList.add('active'); btnPen?.classList.remove('active'); });
      const btnPD=btn('Process Drawing'); drawToolbar.appendChild(btnPD); on(btnPD,'click',processDrawingFlow);
    }

    // State
    const STATE={
      // Working image (downscaled) as ImageData
      image:null, // ImageData
      imgFit:null, // mapping for preview
      stitches:[],
      subject:{enabled:false,rect:null,noSubject:false},
      // scratch buffers (reused)
      mask:null
    };

    // Scroll lock helpers for highlight
    let scrollY=0;
    function lockScroll(){
      scrollY = window.scrollY || 0;
      document.body.style.position='fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left='0';
      document.body.style.right='0';
      document.body.style.width='100%';
      document.body.classList.add('loom-lock');
      // stop touch scroll on preview while highlighting
      on(prevCanvas,'touchmove',cancelTouch,{passive:false});
      on(prevCanvas,'wheel',cancelTouch,{passive:false});
    }
    function unlockScroll(){
      document.body.style.position='';
      document.body.style.top='';
      document.body.style.left='';
      document.body.style.right='';
      document.body.style.width='';
      document.body.classList.remove('loom-lock');
      window.scrollTo(0, scrollY||0);
      prevCanvas.removeEventListener('touchmove',cancelTouch);
      prevCanvas.removeEventListener('wheel',cancelTouch);
    }
    function cancelTouch(e){ e.preventDefault(); }

    // Subject UI
    on(btnHighlight,'click',()=>{
      STATE.subject.enabled=!STATE.subject.enabled;
      if(!STATE.subject.enabled){ STATE.subject.rect=null; unlockScroll(); }
      else { lockScroll(); }
      btnHighlight.classList.toggle('active',STATE.subject.enabled); drawSubjectBox();
    });
    on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

    // Drag subject rectangle
    let dragging=false,start=null;
    on(prevCanvas,'pointerdown',e=>{ if(!STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect(); start=[e.clientX-r.left,e.clientY-r.top];
      prevCanvas.setPointerCapture(e.pointerId);
      dragging=true; e.preventDefault();
      STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; drawSubjectBox();
    });
    on(prevCanvas,'pointermove',e=>{ if(!dragging||!STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])}; drawSubjectBox();
    });
    on(prevCanvas,'pointerup',()=>{ dragging=false; try{prevCanvas.releasePointerCapture?.();}catch(_){} });

    on(btnProcess,'click',processPhotoFlow);

    function makeCanvas(host){ const c=document.createElement('canvas'); c.style.display='block'; c.style.width='100%'; c.style.height='100%'; if(getComputedStyle(host).position==='static') host.style.position='relative'; host.appendChild(c); return c; }
    function mountPreviewUI(){
      if(prevCard && prevCard.classList.contains('hidden')){
        prevCard.classList.remove('hidden');
        prevCard.style.position=getComputedStyle(prevCard).position==='static'?'relative':getComputedStyle(prevCard).position;
        prevCard.appendChild(progWrap); prevCard.appendChild(tools); tools.style.visibility='visible';
      }
    }

    async function loadImageFile(file){
      const ok=/\.(jpg|jpeg|png|gif|heic|heif)$/i.test((file.name||'')); if(!ok){ alert('Please choose a JPG, PNG, GIF, or HEIC/HEIF image.'); return; }
      const blobURL=URL.createObjectURL(file);
      try{
        // Load + smart downscale with createImageBitmap if possible
        let bmp=null;
        try{
          const meta=await getImageSize(blobURL);
          const scale = Math.min(1, Math.sqrt(MAX_PIX/(meta.w*meta.h)) || 1);
          const rw = Math.max(1,Math.round(meta.w*scale));
          const rh = Math.max(1,Math.round(meta.h*scale));
          if('createImageBitmap' in window && typeof createImageBitmap==='function'){
            bmp = await createImageBitmap(await (await fetch(blobURL)).blob(), {resizeWidth:rw, resizeHeight:rh, resizeQuality:'high'});
          }
        }catch(_){}
        let W,H, id;
        if(bmp){
          W=bmp.width; H=bmp.height;
          const off=document.createElement('canvas'); off.width=W; off.height=H;
          off.getContext('2d').drawImage(bmp,0,0,W,H);
          id = off.getContext('2d').getImageData(0,0,W,H);
          bmp.close?.();
        }else{
          const img=await loadImage(blobURL);
          const scale = Math.min(1, Math.sqrt(MAX_PIX/(img.naturalWidth*img.naturalHeight)) || 1);
          W=Math.max(1,Math.round(img.naturalWidth*scale));
          H=Math.max(1,Math.round(img.naturalHeight*scale));
          const off=document.createElement('canvas'); off.width=W; off.height=H;
          off.getContext('2d').drawImage(img,0,0,W,H);
          id = off.getContext('2d').getImageData(0,0,W,H);
        }

        // Save working image
        STATE.image=id;
        // prepare reusable mask buffer
        STATE.mask = (STATE.mask && STATE.mask.length===W*H) ? STATE.mask : new Uint8Array(W*H);

        mountPreviewUI(); sizeCanvasToHost(prevCanvas,prevArea);
        renderBaseImage(); STATE.stitches.length=0; renderStitches();
        setFormatsVisible(false); scheduleResize(); prevCard?.scrollIntoView({behavior:'smooth',block:'center'});
      }catch(err){ console.error(err); alert('Could not load that image.'); }
      finally{ URL.revokeObjectURL(blobURL); }
    }

    function getImageSize(url){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight}); i.onerror=rej; i.src=url; }); }
    function loadImage(url){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; }); }

    function redraw(){ if(!STATE.image) return; renderBaseImage(); renderStitches(); }

    function renderBaseImage(){
      const img=STATE.image; if(!img) return;
      const W=img.width,H=img.height;
      const Wp=prevCanvas.width/DPR(), Hp=prevCanvas.height/DPR();
      const s=Math.min(Wp/W,Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      const ctx=prevCanvas.getContext('2d'); ctx.setTransform(DPR(),0,0,DPR(),0,0);
      // draw from ImageData without allocating new ImageData
      const off=document.createElement('canvas'); off.width=W; off.height=H;
      off.getContext('2d').putImageData(img,0,0);
      ctx.clearRect(0,0,Wp,Hp); ctx.fillStyle='#fff'; ctx.fillRect(0,0,Wp,Hp); ctx.drawImage(off,ox,oy,w,h);
      ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,Wp-1,Hp-1);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
    }

    function renderStitches(){
      if(!STATE.stitches.length) return;
      const ctx=prevCanvas.getContext('2d'); ctx.save(); ctx.strokeStyle='#111827'; ctx.lineWidth=1.6; ctx.beginPath();
      for(const p of STATE.stitches){ if(p.move) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
      ctx.stroke(); ctx.restore();
    }

    function drawSubjectBox(){
      redraw();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect, ctx=prevCanvas.getContext('2d');
        ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.lineWidth=1.2; ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
      }
    }

    /* ---------- Subject masking (bg-aware) with buffer reuse ---------- */
    function makeSubjectMask(img, userRect, noSubject){
      const W=img.width,H=img.height,d=img.data;
      const mask = STATE.mask && STATE.mask.length===W*H ? STATE.mask : (STATE.mask=new Uint8Array(W*H));
      mask.fill(0);

      if(userRect){
        const {ox,oy,scale}=STATE.imgFit||{ox:0,oy:0,scale:1};
        const sx=Math.max(0,Math.floor((userRect.x-ox)/scale));
        const sy=Math.max(0,Math.floor((userRect.y-oy)/scale));
        const ex=Math.min(W-1,Math.floor((userRect.x+userRect.w-ox)/scale));
        const ey=Math.min(H-1,Math.floor((userRect.y+userRect.h-oy)/scale));
        for(let y=sy;y<=ey;y++){ mask.fill(1,y*W+sx,y*W+ex+1); }
        return smoothMask(mask,W,H);
      }

      // background luminance from borders
      let sum=0,cnt=0;
      for(let x=0;x<W;x++){ const j1=(x)*4, j2=((H-1)*W + x)*4; sum+=luma(d,j1)+luma(d,j2); cnt+=2; }
      for(let y=0;y<H;y++){ const j1=(y*W)*4, j2=(y*W + (W-1))*4; sum+=luma(d,j1)+luma(d,j2); cnt+=2; }
      const bgY=sum/cnt; const delta=25;
      const keepLight = bgY<128;

      for(let i=0;i<W*H;i++){
        const j=i*4; const y=luma(d,j);
        if(noSubject){
          // handwriting: keep dark strokes if bg light, or light strokes if bg dark
          mask[i] = keepLight ? (y<bgY-delta?1:0) : (y>bgY+delta?1:0);
        }else{
          // auto-subject
          mask[i] = keepLight ? (y>bgY+delta?1:0) : (y<bgY-delta?1:0);
        }
      }
      return smoothMask(mask,W,H);
    }
    function luma(d,idx){ return 0.2126*d[idx]+0.7152*d[idx+1]+0.0722*d[idx+2]; }

    function smoothMask(mask,W,H){
      const out=STATE.mask2 && STATE.mask2.length===W*H ? STATE.mask2 : (STATE.mask2=new Uint8Array(W*H));
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          let s=0; for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) s+=mask[(y+yy)*W+(x+xx)];
          out[y*W+x] = s>=5 ? 1 : 0;
        }
      }
      // copy back to mask to continue reusing same reference
      mask.set(out);
      return mask;
    }

    /* -------- Marching Squares contours (smooth outlines) ---- */
    function contoursFromMask(mask,W,H){
      const grid=(x,y)=> (x<0||x>=W||y<0||y>=H) ? 0 : mask[y*W+x];
      const paths=[];
      const visited=new Uint8Array(W*H);

      function trace(x0,y0){
        let x=x0,y=y0;
        const pts=[];
        for(let safe=0; safe< W*H*4; safe++){
          const a=grid(x,y), b=grid(x+1,y), c=grid(x+1,y+1), d=grid(x,y+1);
          const idx=(a?1:0) | (b?2:0) | (c?4:0) | (d?8:0);
          if(idx===0 || idx===15) break;
          if(idx===1||idx===5||idx===13){ pts.push([x,y+0.5]); y--; }
          else if(idx===8||idx===10||idx===11){ pts.push([x+0.5,y+1]); x--; }
          else if(idx===4||idx===12||idx===14){ pts.push([x+1,y+0.5]); y++; }
          else { pts.push([x+0.5,y]); x++; }
          if(x===x0 && y===y0) break;
        }
        return pts;
      }

      for(let y=0;y<H-1;y++){
        for(let x=0;x<W-1;x++){
          const i=y*W+x; if(mask[i] && !visited[i]){
            const pts=trace(x,y); if(pts.length>4){ paths.push(pts); }
            for(let yy=y; yy<Math.min(H,y+2); yy++)
              for(let xx=x; xx<Math.min(W,x+2); xx++)
                visited[yy*W+xx]=1;
          }
        }
      }
      return paths;
    }

    function pathToOps(paths){
      const ops=[];
      for(const poly of paths){
        if(poly.length<2) continue;
        ops.push({cmd:'jump',x:poly[0][0],y:poly[0][1]});
        for(let i=1;i<poly.length;i++){
          ops.push({cmd:'stitch',x:poly[i][0],y:poly[i][1]});
        }
      }
      return ops;
    }

    function hatchOps(mask,W,H,step=6){
      const ops=[];
      for(let y=0;y<H;y+=step){
        let run=false, sx=0;
        for(let x=0;x<W;x++){
          const i=y*W+x;
          if(mask[i]){ if(!run){ run=true; sx=x; } }
          else { if(run){ ops.push({cmd:'jump',x:sx,y:y}); ops.push({cmd:'stitch',x:x-1,y:y}); run=false; } }
        }
        if(run){ ops.push({cmd:'jump',x:sx,y:y}); ops.push({cmd:'stitch',x:W-1,y:y}); }
      }
      return ops;
    }

    function toPreviewPath(ops){
      const f=STATE.imgFit||{ox:0,oy:0,scale:1};
      return ops.map(op=>{
        const x=op.x*f.scale+f.ox, y=op.y*f.scale+f.oy;
        return (op.cmd==='jump')?{move:true,x,y}:{move:false,x,y};
      });
    }

    /* ---------------- Process flows ---------------- */
    async function processPhotoFlow(){
      if(!STATE.image){ fileInput?.click(); return; }
      setFormatsVisible(false); setProgress(1);

      const {width:W,height:H}=STATE.image;
      const mask = makeSubjectMask(STATE.image, STATE.subject.rect, STATE.subject.noSubject);

      const paths = contoursFromMask(mask,W,H);
      let ops = pathToOps(paths);
      if($('#tabs') && $('.panel[data-panel="upload"] .card.rose')){} // keep layout identical
      if($('#tabs')){} // noop to avoid tree-shaking in some bundlers

      if($('#tabs') && typeof chkFill!=='undefined' && chkFill.checked){ ops = ops.concat(hatchOps(mask,W,H,6)); }

      STATE.stitches = toPreviewPath(ops);
      renderBaseImage(); renderStitches(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);

      // Exit highlight mode if active
      if(STATE.subject.enabled){ STATE.subject.enabled=false; unlockScroll(); drawSubjectBox(); }
    }

    async function processDrawingFlow(){
      setFormatsVisible(false); setProgress(1);
      mountPreviewUI(); sizeCanvasToHost(prevCanvas,prevArea);

      const w=drawCanvas.width,h=drawCanvas.height,sctx=drawCanvas.getContext('2d');
      const id=sctx.getImageData(0,0,w,h);
      STATE.image=id; renderBaseImage();

      // handwriting: dark strokes mask
      const mask=(STATE.mask && STATE.mask.length===w*h) ? STATE.mask : (STATE.mask=new Uint8Array(w*h));
      const d=id.data;
      for(let i=0;i<w*h;i++){ const j=i*4; const y=0.2126*d[j]+0.7152*d[j+1]+0.0722*d[j+2]; mask[i]=(y<180)?1:0; }
      const paths=contoursFromMask(mask,w,h);
      let ops=pathToOps(paths);
      if(typeof chkFill!=='undefined' && chkFill.checked){ ops=ops.concat(hatchOps(mask,w,h,6)); }

      STATE.stitches=toPreviewPath(ops); renderBaseImage(); renderStitches(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);

      // jump back to Upload tab to show preview
      const uploadBtn=tabBtns.find(b=>b.dataset.tab==='upload'); uploadBtn?.click(); prevCard?.scrollIntoView({behavior:'smooth',block:'center'});
    }

    /* ---------------- Exports (same as v32) ---------------- */
    function toUnits(ops,pxPerMm,outW,outH){
      const s=1/pxPerMm*10,cx=outW/2,cy=outH/2,out=[]; let prev=null;
      for(const op of ops){
        if(op.cmd==='stop'){ out.push({cmd:'stop'}); prev=null; continue; }
        if(op.cmd==='jump'||op.cmd==='stitch'){
          const x=(op.x-cx)*s, y=(op.y-cy)*s;
          if(prev===null){ prev=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
          else{ out.push({cmd:op.cmd,dx:x-prev[0],dy:y-prev[1]}); prev=[x,y]; }
        }
      } return out;
    }
    function writeDST(ops,opts){
      const pxPerMm=opts?.pxPerMm||2, outW=opts?.outW||640, outH=opts?.outH||360;
      const u=toUnits(ops,pxPerMm,outW,outH), bytes=[];
      function enc(dx,dy,flag){ if(flag==null) flag=0; dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
        const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
        const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
        const b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); }
      let colors=0; for(const s of u){ if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; } if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; } enc(s.dx,s.dy,0); }
      bytes.push(0,0,0xF3);
      const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
      const hb=new TextEncoder().encode(header); const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
    }
    function writeEXP(ops,opts){
      const pxPerMm=opts?.pxPerMm||2, outW=opts?.outW||640, outH=opts?.outH||360;
      const u=toUnits(ops,pxPerMm,outW,outH), bytes=[];
      function put(dx,dy,cmd){ dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
        if(cmd==='jump') bytes.push(0x80,0x04); if(cmd==='stop') bytes.push(0x80,0x01); if(cmd==='end') bytes.push(0x80,0x00);
        if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); } }
      for(const s of u){ if(s.cmd==='stop'){ put(0,0,'stop'); continue; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; } put(s.dx,s.dy,'stitch'); }
      bytes.push(0x80,0x00); return new Uint8Array(bytes);
    }
    function saveU8(u8,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }
    function hookDownloads(res){
      fmtBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>saveU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
        else if(fmt==='EXP'){ btn.onclick=()=>saveU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
        else { btn.onclick=()=>alert('PES/JEF coming next build — DST/EXP provided now'); }
      });
    }

    function btn(t){ const b=document.createElement('button'); b.className='btn soft'; b.textContent=t; return b; }

  } // init
})();