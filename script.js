/* Loomabelle — script.js v29
   Fixes:
   - Prevent preview canvas infinite growth (no host minHeight writes; stable sizing).
   - Hide Preview card until an image/drawing exists.
   - Keeps all features: upload → preview → process → export; drawing; subject box; thread palette.
*/
(function(){
  'use strict';

  const READY = (fn)=>document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',fn,{once:true})
    : fn();
  const $  = (s,root)=> (root||document).querySelector(s);
  const $$ = (s,root)=> Array.from((root||document).querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const DPR= ()=> window.devicePixelRatio||1;
  const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));

  READY(init);

  function init(){
    // Year
    const year=$('#year'); if(year) year.textContent=new Date().getFullYear();

    // Tabs
    const tabBtns = $$('.tabs .tab-btn');
    const panels  = $$('.panel');
    function activate(tabName){
      tabBtns.forEach(b=> b.classList.toggle('active', b.dataset.tab===tabName));
      panels.forEach(p=> p.classList.toggle('active', p.dataset.panel===tabName));
      if(tabName==='upload') queueResize();
    }
    tabBtns.forEach(b=> on(b,'click', ()=> activate(b.dataset.tab)));

    // Hero CTAs
    $$('[data-scroll="#tabs"]').forEach(btn=>{
      on(btn,'click',(e)=>{
        e.preventDefault();
        $('#tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
        const t=(btn.textContent||'').toLowerCase();
        activate(t.includes('drawing')?'draw':'upload');
      });
    });

    // DOM refs
    const upPanel    = $('.panel[data-panel="upload"]');
    const drawPanel  = $('.panel[data-panel="draw"]');

    const upZone     = upPanel?.querySelector('.upload-zone');
    const fileInput  = upPanel?.querySelector('.upload-zone input[type=file]');
    const prevCard   = upPanel?.querySelector('.card.rose');   // whole preview card
    const prevArea   = upPanel?.querySelector('.preview');     // preview canvas host
    const formats    = upPanel?.querySelector('.formats');

    const drawHost   = drawPanel?.querySelector('.canvas');
    const drawToolbar= drawPanel?.querySelector('.toolbar');
    const swatchesBox= drawPanel?.querySelector('.swatches');

    // Hide preview card until there is content
    if (prevCard) prevCard.classList.add('hidden');

    // Enable file input
    if (fileInput){
      fileInput.removeAttribute('disabled');
      fileInput.accept='image/*,.png,.jpg,.jpeg,.gif,.heic,.heif';
    }

    // Canvases
    const prevCanvas = ensureCanvas(prevArea);
    const pctx = prevCanvas.getContext('2d',{willReadFrequently:true});

    const drawCanvas = ensureCanvas(drawHost);
    const dctx = drawCanvas.getContext('2d',{willReadFrequently:true});
    dctx.lineCap='round'; dctx.lineJoin='round';

    // Stable sizing — NO writes to host minHeight to avoid feedback loops
    function fitCanvasToHost(cnv, host){
      // Use host width; compute height only for canvas (don’t change host size)
      const w = Math.max(320, host.clientWidth || 640);
      const h = Math.max(220, Math.round(w * 9/16));
      const s = DPR();
      cnv.style.width  = w+'px';
      cnv.style.height = h+'px';
      cnv.width  = Math.round(w*s);
      cnv.height = Math.round(h*s);
      const c = cnv.getContext('2d');
      c.setTransform(s,0,0,s,0,0);
    }

    function queueResize(){
      // Only resize drawing canvas always; preview canvas only when content exists
      setTimeout(()=>{
        fitCanvasToHost(drawCanvas, drawHost);
        if (STATE.image) fitCanvasToHost(prevCanvas, prevArea);
        redraw();
      }, 0);
    }

    // Observe host sizes safely
    const ro = new ResizeObserver(()=>{
      fitCanvasToHost(drawCanvas, drawHost);
      if (STATE.image) fitCanvasToHost(prevCanvas, prevArea);
      redraw();
    });
    if (drawHost) ro.observe(drawHost);
    // NOTE: we do NOT observe prevArea until image/drawing exists, to avoid resize loops.

    // Progress bar in the preview card (when visible)
    const progWrap=document.createElement('div');
    progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar=document.createElement('div');
    progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.9';
    progWrap.appendChild(progBar);
    // Add later when preview card is shown

    const setProgress=(p)=>{
      if (!prevCard || prevCard.classList.contains('hidden')) return;
      progWrap.style.display='block';
      progBar.style.width=(p|0)+'%';
      if(p>=100) setTimeout(()=>progWrap.style.display='none',400);
    };

    // Preview tools
    const tools=document.createElement('div');
    tools.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess   = makeBtn('Process Photo');
    const btnHighlight = makeBtn('Highlight Subject');
    const lblNo = document.createElement('label');
    const chkNo=document.createElement('input'); chkNo.type='checkbox';
    lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tools.append(btnProcess, btnHighlight, lblNo);

    // Export buttons
    const fmtBtns = Array.from(formats?.querySelectorAll('button,a')||[])
      .filter(b=>['DST','EXP','PES','JEF'].includes((b.textContent||'').trim().toUpperCase()));
    const setFormatsVisible = (v)=> fmtBtns.forEach(b=> b.style.display = v?'inline-block':'none');
    setFormatsVisible(false);

    // Upload zone behavior
    on(upZone,'click',(e)=>{ if(e.target.closest('button,a,input,label')) return; fileInput?.click(); });
    on(upZone,'dragover', e=>e.preventDefault());
    on(upZone,'drop', async (e)=>{ e.preventDefault(); const f=e.dataTransfer.files?.[0]; if(f) await loadImageFile(f); });
    on(fileInput,'change', async ()=>{ const f=fileInput.files?.[0]; if(f) await loadImageFile(f); });

    // Draw canvas behavior
    drawCanvas.style.touchAction='none';
    let drawing=false, pid=null, tool='pen';
    on(drawCanvas,'pointerdown',e=>{
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      drawCanvas.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle='#111827'; dctx.lineWidth=3;
      if(tool==='pen'){ dctx.beginPath(); dctx.moveTo(x,y); drawing=true; }
      if(tool==='eraser'){ dctx.globalCompositeOperation='destination-out'; dctx.beginPath(); dctx.moveTo(x,y); drawing=true; }
    });
    on(drawCanvas,'pointermove',e=>{
      if(!drawing || e.pointerId!==pid) return; e.preventDefault();
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=(e)=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{drawCanvas.releasePointerCapture(e.pointerId);}catch(_){}
      dctx.globalCompositeOperation='source-over'; } };
    on(drawCanvas,'pointerup',stopDraw); on(drawCanvas,'pointercancel',stopDraw);

    if (drawToolbar){
      Array.from(drawToolbar.children).forEach((b,i)=>{ b.removeAttribute('disabled'); if(i===0) b.classList.add('active'); });
      const [btnPen, btnEraser] = [drawToolbar.children[0], drawToolbar.children[1]];
      on(btnPen,'click',()=>{ tool='pen'; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); });
      on(btnEraser,'click',()=>{ tool='eraser'; btnEraser.classList.add('active'); btnPen?.classList.remove('active'); });
      const btnPD=document.createElement('button'); btnPD.className='btn soft'; btnPD.textContent='Process Drawing';
      drawToolbar.appendChild(btnPD); on(btnPD,'click', processDrawingFlow);
    }

    // Subject box + state
    const STATE = {
      image:null, imgFit:null, stitches:[],
      subject:{enabled:false,rect:null,noSubject:false},
      palette:[]
    };
    on(btnHighlight,'click',()=>{
      STATE.subject.enabled=!STATE.subject.enabled;
      if(!STATE.subject.enabled) STATE.subject.rect=null;
      btnHighlight.classList.toggle('active', STATE.subject.enabled);
      drawSubjectBox();
    });
    on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

    let dragging=false, start=null;
    on(prevCanvas,'pointerdown',e=>{
      if(!STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect(); start=[e.clientX-r.left,e.clientY-r.top];
      dragging=true; STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; drawSubjectBox();
    });
    on(prevCanvas,'pointermove',e=>{
      if(!dragging||!STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])};
      drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    // Buttons
    on(btnProcess,'click', processPhotoFlow);

    // Helpers
    function ensureCanvas(host){
      const c=document.createElement('canvas'); c.style.display='block';
      // DO NOT modify host minHeight here (prevents growth loop)
      if(getComputedStyle(host).position==='static') host.style.position='relative';
      host.appendChild(c); return c;
    }
    function ensurePosition(host){
      const cs=getComputedStyle(host); if(cs.position==='static') host.style.position='relative'; return host;
    }

    async function loadImageFile(file){
      if (!/\.(jpg|jpeg|png|gif|heic|heif)$/i.test((file.name||''))) {
        alert('Please choose a JPG, PNG, GIF, or HEIC/HEIF image.');
        return;
      }
      const url=URL.createObjectURL(file);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });

        // Show preview card now, attach progress/tools exactly once
        if (prevCard && prevCard.classList.contains('hidden')){
          prevCard.classList.remove('hidden');
          ensurePosition(prevCard).appendChild(progWrap);
          ensurePosition(prevCard).appendChild(tools);
        }

        // Observe prevArea size now that it’s visible
        ro.observe(prevArea);

        // Downscale large images for memory/speed
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide=isIOS?1024:1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if (Math.max(W,H) > maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H;
        c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.image=c.getContext('2d').getImageData(0,0,W,H);

        // Fit preview canvas only now (prevents growth on empty state)
        fitCanvasToHost(prevCanvas, prevArea);
        renderBaseImage(); STATE.stitches.length=0; renderStitches();
        tools.style.visibility='visible'; setFormatsVisible(false);
        prevCard?.scrollIntoView({behavior:'smooth',block:'center'});
      }catch(err){ console.error('loadImage error',err); alert('Could not load that image.'); }
      finally{ URL.revokeObjectURL(url); }
    }

    function redraw(){ if(!STATE.image) return; renderBaseImage(); renderStitches(); }

    function renderBaseImage(){
      const img=STATE.image; if(!img) return;
      // (prevCanvas already sized at load or on resize)
      const W=img.width, H=img.height;
      const Wp=prevCanvas.width/DPR(), Hp=prevCanvas.height/DPR();
      const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
      tmp.getContext('2d').putImageData(img,0,0);
      const ctx=prevCanvas.getContext('2d'); ctx.setTransform(DPR(),0,0,DPR(),0,0);
      ctx.clearRect(0,0,Wp,Hp); ctx.fillStyle='#fff'; ctx.fillRect(0,0,Wp,Hp); ctx.drawImage(tmp,ox,oy,w,h);
      ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,Wp-1,Hp-1);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
    }

    function renderStitches(){
      if(!STATE.stitches.length) return;
      const ctx=prevCanvas.getContext('2d'); ctx.save();
      ctx.strokeStyle='#111827'; ctx.lineWidth=1.6; ctx.beginPath();
      let started=false;
      for(const s of STATE.stitches){
        if(s.move){ ctx.moveTo(s.x,s.y); started=true; }
        else if(started){ ctx.lineTo(s.x,s.y); }
      }
      ctx.stroke(); ctx.restore();
    }

    function drawSubjectBox(){
      redraw();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect, ctx=prevCanvas.getContext('2d');
        ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.lineWidth=1.2; ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
      }
    }

    // === Simple quant + stitch plan ===
    function kmeansPalette(imgData,k,mask){
      const W=imgData.width,H=imgData.height,d=imgData.data;
      const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
      const pts=[];
      for(let y=0;y<H;y+=step){
        const row=y*W;
        for(let x=0;x<W;x+=step){
          const i=row+x; if(mask && !mask[i]) continue;
          const j=i*4; pts.push([d[j],d[j+1],d[j+2]]);
        }
      }
      const K=Math.min(k,Math.max(1,pts.length));
      const centers=[pts[Math.floor(Math.random()*pts.length)]];
      while(centers.length<K){
        let best=null,bd=-1;
        for(const p of pts){
          let dd=1e9; for(const c of centers){ const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(t<dd) dd=t; }
          if(dd>bd){ bd=dd; best=p; }
        }
        centers.push(best.slice());
      }
      for(let it=0;it<5;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0,bd=1e12; for(let i=0;i<centers.length;i++){
            const c=centers[i]; const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(t<bd){ bd=t; bi=i; }
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
      }
      return centers.slice(0,k);
    }

    async function quantizeFast(imgData,k,mask){
      const W=imgData.width,H=imgData.height,d=imgData.data;
      const palette=kmeansPalette(imgData,Math.min(k,6),mask);
      const indexed=new Uint8Array(W*H);
      const CH=Math.max(16,Math.floor(H/60));
      for(let y=0;y<H;y+=CH){
        for(let yy=y;yy<Math.min(H,y+CH);yy++){
          const row=yy*W;
          for(let x=0;x<W;x++){
            const i=row+x; if(mask && !mask[i]){ indexed[i]=0; continue; }
            const j=i*4; let bi=0,bd=1e12;
            for(let c=0;c<palette.length;c++){
              const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2];
              const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb; const vv=dr*dr+dg*dg+db*db; if(vv<bd){bd=vv;bi=c;}
            }
            indexed[i]=bi;
          }
        }
        await new Promise(r=>setTimeout(r,0));
      }
      return {indexed,palette,W,H};
    }

    function planStitches(data, opts){
      const {indexed,W,H}=data;
      const angle=+(opts?.angle ?? 45);
      const outline=!!(opts?.outline);
      const step=Math.max(2,Math.floor(Math.min(W,H)/220));
      const ops=[];

      if(outline){
        const edges=new Uint8Array(W*H);
        for(let y=1;y<H-1;y++){
          const row=y*W;
          for(let x=1;x<W-1;x++){
            const i=row+x, c=indexed[i];
            if(indexed[i-1]!==c||indexed[i+1]!==c||indexed[i-W]!==c||indexed[i+W]!==c) edges[i]=1;
          }
        }
        for(let y=0;y<H;y+=step){
          let run=null;
          for(let x=0;x<W;x++){
            const i=y*W+x;
            if(edges[i]){ if(!run) run={y:y,x0:x}; }
            else if(run){ ops.push({cmd:'jump',x:run.x0,y:run.y}); ops.push({cmd:'stitch',x:x,y:run.y}); run=null; }
          }
          if(run){ ops.push({cmd:'jump',x:run.x0,y:run.y}); ops.push({cmd:'stitch',x:W-1,y:run.y}); }
        }
      }

      const rad=angle*Math.PI/180, sin=Math.sin(rad), cos=Math.cos(rad);
      const bands=Math.max(4,Math.floor(Math.min(W,H)/24));
      for(let b=0;b<bands;b++){
        const t=(b/bands)*(W+H);
        for(let y=0;y<H;y+=step){
          const x0=Math.floor(t - y*(sin/cos));
          let inRun=false,lx=null,ly=null;
          for(let px=x0-20; px<=x0+20; px++){
            const xx=px, yy=Math.floor(y + (px-x0)*(sin/cos));
            if(xx>=0&&xx<W&&yy>=0&&yy<H){
              if(!inRun){ ops.push({cmd:'jump',x:xx,y:yy}); inRun=true; }
              lx=xx; ly=yy;
            }
          }
          if(inRun && lx!=null){ ops.push({cmd:'stitch',x:lx,y:ly}); }
        }
      }
      return ops;
    }

    function toPreviewPath(ops){
      const fit=STATE.imgFit || {ox:0,oy:0,scale:1};
      return ops.map(op=>{
        const x = op.x*fit.scale + fit.ox;
        const y = op.y*fit.scale + fit.oy;
        return (op.cmd==='jump') ? {move:true,x,y} : {move:false,x,y};
      });
    }

    // Exports
    function toUnits(ops, pxPerMm, outW, outH){
      const s=1/pxPerMm*10, cx=outW/2, cy=outH/2;
      const out=[]; let prev=null;
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
      let colors=0;
      for(const s of u){
        if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; }
        if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; }
        enc(s.dx,s.dy,0);
      }
      bytes.push(0,0,0xF3);
      const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"
        +"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
      const hb=new TextEncoder().encode(header);
      const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
    }
    function writeEXP(ops,opts){
      const pxPerMm=opts?.pxPerMm||2, outW=opts?.outW||640, outH=opts?.outH||360;
      const u=toUnits(ops,pxPerMm,outW,outH), bytes=[];
      function put(dx,dy,cmd){
        dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
        if(cmd==='jump') bytes.push(0x80,0x04);
        if(cmd==='stop') bytes.push(0x80,0x01);
        if(cmd==='end')  bytes.push(0x80,0x00);
        if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); }
      }
      for(const s of u){
        if(s.cmd==='stop'){ put(0,0,'stop'); continue; }
        if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; }
        put(s.dx,s.dy,'stitch');
      }
      bytes.push(0x80,0x00);
      return new Uint8Array(bytes);
    }
    function saveU8(u8,name){
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8]));
      a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200);
    }

    function hookDownloads(res){
      fmtBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>saveU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
        else if(fmt==='EXP'){ btn.onclick=()=>saveU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
        else { btn.onclick=()=>alert('PES/JEF coming next build — DST/EXP provided now'); }
      });
    }

    // Flows
    async function processPhotoFlow(){
      if(!STATE.image){ fileInput?.click(); return; }
      setFormatsVisible(false); setProgress(1);

      // optional subject rect → mask
      let mask=null;
      if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){
        const {ox,oy,scale,iw,ih}=STATE.imgFit;
        const sx=Math.max(0, Math.floor((STATE.subject.rect.x-ox)/scale));
        const sy=Math.max(0, Math.floor((STATE.subject.rect.y-oy)/scale));
        const ex=Math.min(iw-1, Math.floor((STATE.subject.rect.x+STATE.subject.rect.w-ox)/scale));
        const ey=Math.min(ih-1, Math.floor((STATE.subject.rect.y+STATE.subject.rect.h-oy)/scale));
        mask=new Uint8Array(iw*ih);
        for(let y=sy;y<=ey;y++){ mask.fill(1, y*iw+sx, y*iw+ex+1); }
      }

      const q = await quantizeFast(STATE.image, 6, mask);
      STATE.palette = q.palette.slice(); paintSwatches(STATE.palette);
      const ops = planStitches(q,{ outline:true, angle:45 });

      STATE.stitches = toPreviewPath(ops);
      renderBaseImage(); renderStitches(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);
    }

    async function processDrawingFlow(){
      setFormatsVisible(false); setProgress(1);

      // Reveal preview card if still hidden
      if (prevCard && prevCard.classList.contains('hidden')){
        prevCard.classList.remove('hidden');
        ensurePosition(prevCard).appendChild(progWrap);
        ensurePosition(prevCard).appendChild(tools);
        ro.observe(prevArea);
        fitCanvasToHost(prevCanvas, prevArea);
      }

      const w=drawCanvas.width, h=drawCanvas.height, sctx=drawCanvas.getContext('2d');
      const id=sctx.getImageData(0,0,w,h);
      STATE.image=id; renderBaseImage();

      // treat drawn alpha as mask → 2-color preview
      const mask=new Uint8Array(w*h); for(let i=0;i<w*h;i++){ mask[i]= id.data[i*4+3] > 10 ? 1 : 0; }
      const q={indexed:mask, palette:[[0,0,0],[255,255,255]], W:w, H:h};
      STATE.palette = [[34,34,34],[220,220,220]]; paintSwatches(STATE.palette);

      const ops=planStitches(q,{outline:true, angle:45});
      STATE.stitches=toPreviewPath(ops); renderStitches(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:prevCanvas.width/DPR(),outH:prevCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);

      // focus back to upload/preview tab
      const uploadBtn = $$('.tabs .tab-btn').find(b=>b.dataset.tab==='upload'); uploadBtn?.click();
      prevCard?.scrollIntoView({behavior:'smooth',block:'center'});
    }

    // Thread palette UI
    function paintSwatches(pal){
      if(!swatchesBox) return;
      swatchesBox.innerHTML='';
      pal.forEach((c,i)=>{
        const sw=document.createElement('button'); sw.className='swatch';
        const [r,g,b]=c; const hex = '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
        sw.title=`Color ${i+1}: rgb(${r},${g},${b})`;
        sw.style.cssText=`width:36px;height:36px;border-radius:10px;border:2px solid rgba(0,0,0,.08);background:${hex};cursor:pointer`;
        sw.onclick=()=>{ navigator.clipboard?.writeText(hex).catch(()=>{}); swatchesBox.querySelectorAll('.swatch').forEach(el=>el.style.outline=''); sw.style.outline='3px solid rgba(0,0,0,.25)'; };
        swatchesBox.appendChild(sw);
      });
    }

  } // init

  // helpers (kept outside for clarity)
  function ensureCanvas(host){
    const c=document.createElement('canvas'); c.style.display='block';
    if(getComputedStyle(host).position==='static') host.style.position='relative';
    host.appendChild(c); return c;
  }
  function ensurePosition(host){
    const cs=getComputedStyle(host); if(cs.position==='static') host.style.position='relative'; return host;
  }
  function makeBtn(t){ const b=document.createElement('button'); b.className='btn soft'; b.textContent=t; return b; }

})();
