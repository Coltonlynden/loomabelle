/* Loomabelle — script.js v21 (for your posted index.html)
   - No layout changes; wires the existing DOM as-is
   - Tabs: switches panels; hero CTAs scroll and activate correct tab
   - Upload zone: click/drag&drop → loads image (enables file input)
   - Preview: shows image immediately; tools inside preview:
       Process Photo, Highlight Subject, No subject, progress bar
   - Draw & Trace: freehand canvas + Process Drawing
   - Exports: DST / EXP appear only after processing
*/

(function(){
  "use strict";

  const READY = (fn)=> (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", fn, {once:true})
    : fn();

  const $  = (s,root)=> (root||document).querySelector(s);
  const $$ = (s,root)=> Array.from((root||document).querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const DPR = ()=> window.devicePixelRatio||1;
  const clamp = (v,mi,ma)=>Math.max(mi,Math.min(ma,v));
  const defer = ()=> new Promise(r=>setTimeout(r,0));

  READY(init);

  function init(){
    // year
    const y=$('#year'); if(y) y.textContent = new Date().getFullYear();

    // hide "mockup" mini note only (keep the rest of your copy)
    $$('.mini,.muted,.badge,small').forEach(el=>{
      if((el.textContent||'').toLowerCase().includes('mockup')) el.style.display='none';
    });

    // ----- tabs wiring -----
    const tabBtns = $$('.tabs .tab-btn');
    const panels  = $$('.panel');
    function activate(tab){
      tabBtns.forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
      panels.forEach(p=> p.classList.toggle('active', p.dataset.panel===tab));
    }
    tabBtns.forEach(b=> on(b,'click',()=> activate(b.dataset.tab)));

    // hero CTAs scroll + activate proper tab
    $$('[data-scroll="#tabs"]').forEach(btn=>{
      on(btn,'click', (e)=>{
        e.preventDefault();
        const t=(btn.textContent||'').toLowerCase();
        document.querySelector('#tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
        if(t.includes('drawing')) activate('draw'); else activate('upload');
      });
    });

    // quick refs to sections
    const uploadPanel  = $('.panel[data-panel="upload"]');
    const drawPanel    = $('.panel[data-panel="draw"]');
    const uploadZone   = uploadPanel?.querySelector('.upload-zone');
    const uploadInner  = uploadPanel?.querySelector('.upload-inner');
    const fileInput    = uploadPanel?.querySelector('.upload-zone input[type=file]');
    const previewCard  = uploadPanel?.querySelector('.card.rose');
    const previewArea  = previewCard?.querySelector('.preview');
    const formatsRow   = previewCard?.querySelector('.formats');
    const drawCanvasHost = drawPanel?.querySelector('.canvas');
    const drawToolbar  = drawPanel?.querySelector('.toolbar');

    // ensure preview/draw canvases exist (without changing structure)
    const previewCanvas = ensureCanvas(previewArea);
    const pctx = previewCanvas.getContext('2d', {willReadFrequently:true});
    const drawCanvas = ensureCanvas(drawCanvasHost);
    const dctx = drawCanvas.getContext('2d', {willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';

    // keep canvases sized to their host
    function fit(cnv, host){
      const w = Math.max(320, host.clientWidth || 640);
      const h = Math.max(220, Math.round(w*9/16));
      const s = DPR();
      cnv.style.width = w+'px';
      cnv.style.height = h+'px';
      cnv.width  = Math.round(w*s);
      cnv.height = Math.round(h*s);
      cnv.getContext('2d').setTransform(s,0,0,s,0,0);
    }
    const ro = new ResizeObserver(()=>{ fit(previewCanvas, previewArea); fit(drawCanvas, drawCanvasHost); redraw(); });
    if (previewArea) ro.observe(previewArea);
    if (drawCanvasHost) ro.observe(drawCanvasHost);

    // show hint until we load the first image
    let previewHasImage = false;
    function setPreviewHint(on){
      if(!previewArea) return;
      previewArea.style.position='relative';
      let hint = previewArea.querySelector('.lb-hint');
      if(on){
        if(!hint){
          hint=document.createElement('div');
          hint.className='lb-hint';
          hint.textContent='Your stitched preview appears here';
          hint.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748b';
          previewArea.appendChild(hint);
        }
      } else if(hint){ hint.remove(); }
    }
    setPreviewHint(true);

    // progress bar in preview
    const progWrap = document.createElement('div');
    progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar = document.createElement('div'); progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.9';
    progWrap.appendChild(progBar);
    ensurePosition(previewCard).appendChild(progWrap);
    const setProgress = (p)=>{ progWrap.style.display='block'; progBar.style.width=(p|0)+'%'; if(p>=100) setTimeout(()=>progWrap.style.display='none',300); };

    // preview tools bar
    const tools = document.createElement('div');
    tools.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess   = makeBtn('Process Photo');
    const btnHighlight = makeBtn('Highlight Subject');
    const lblNo = document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox';
    lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tools.append(btnProcess, btnHighlight, lblNo);
    ensurePosition(previewCard).appendChild(tools);

    // format buttons → hidden until processing finishes
    const fmtBtns = Array.from(formatsRow?.querySelectorAll('button,a')||[])
      .filter(b=>['DST','EXP','PES','JEF'].includes((b.textContent||'').trim().toUpperCase()));
    const setFormatsVisible = (v)=> fmtBtns.forEach(b=> b.style.display = v ? 'inline-block' : 'none');
    setFormatsVisible(false);

    // state
    const STATE = {
      image: null,               // ImageData (source)
      imgFit: null,              // mapping into preview canvas
      stitches: [],              // preview path after processing
      subject: { enabled:false, rect:null, noSubject:false }
    };

    // upload zone behavior — enable input and wire events
    if (fileInput) fileInput.removeAttribute('disabled');
    on(uploadZone,'click', (e)=>{
      if(e.target.closest('button,a,input,label')) return;
      fileInput?.click();
    });
    on(uploadZone,'dragover', e=>e.preventDefault());
    on(uploadZone,'drop', async (e)=>{
      e.preventDefault();
      const f=e.dataTransfer.files && e.dataTransfer.files[0];
      if(f) await loadImageFile(f);
    });
    on(fileInput,'change', async ()=>{
      const f=fileInput.files && fileInput.files[0];
      if(f) await loadImageFile(f);
    });

    // allow hero/upper buttons to scroll to tabs (already wired above)

    // draw & trace basics
    drawCanvas.style.touchAction='none';
    let drawing=false, pid=null;
    on(drawCanvas,'pointerdown',e=>{
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      drawCanvas.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle='#111827'; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
    });
    on(drawCanvas,'pointermove',e=>{
      if(!drawing || e.pointerId!==pid) return; e.preventDefault();
      const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=(e)=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{drawCanvas.releasePointerCapture(e.pointerId);}catch(_){}} };
    on(drawCanvas,'pointerup',stopDraw); on(drawCanvas,'pointercancel',stopDraw);

    // Add "Process Drawing" button into your existing toolbar (keeps style)
    if (drawToolbar) {
      const btnPD = document.createElement('button');
      btnPD.className='btn soft';
      btnPD.textContent='Process Drawing';
      // Enable toolbar buttons look/feel (don’t change others)
      Array.from(drawToolbar.children).forEach(b=> b.removeAttribute('disabled'));
      drawToolbar.appendChild(btnPD);
      on(btnPD,'click', processDrawingFlow);
    }

    // Highlight Subject toggle
    on(btnHighlight,'click',()=>{
      STATE.subject.enabled = !STATE.subject.enabled;
      if(!STATE.subject.enabled) STATE.subject.rect = null;
      btnHighlight.classList.toggle('active', STATE.subject.enabled);
      drawSubjectBox();
    });
    on(chkNo,'change',()=>{ STATE.subject.noSubject = chkNo.checked; });

    // subject rectangle drawing over preview
    let dragging=false, start=null;
    on(previewCanvas,'pointerdown',e=>{
      if(!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); start=[e.clientX-r.left,e.clientY-r.top];
      dragging=true; STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; drawSubjectBox();
    });
    on(previewCanvas,'pointermove',e=>{
      if(!dragging||!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])};
      drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    // process buttons
    on(btnProcess,'click', processPhotoFlow);

    // fit canvases once
    fit(previewCanvas, previewArea); fit(drawCanvas, drawCanvasHost);

    // ===== helpers =====
    function ensureCanvas(host){
      const c=document.createElement('canvas');
      c.style.display='block';
      host.appendChild(c);
      return c;
    }
    function ensurePosition(host){
      const cs=getComputedStyle(host); if(cs.position==='static') host.style.position='relative'; return host;
    }

    async function loadImageFile(file){
      const url = URL.createObjectURL(file);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide=isIOS?1024:1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.image=c.getContext('2d').getImageData(0,0,W,H);

        // show image in preview immediately
        previewHasImage = true;
        setPreviewHint(false);
        fit(previewCanvas, previewArea);
        redraw();
        // reveal tools
        tools.style.visibility='visible';
        // hide export buttons until processed
        setFormatsVisible(false);
        // ensure Upload tab is active (if user used hero)
        activate('upload');
        // scroll into view
        previewCard?.scrollIntoView({behavior:'smooth',block:'center'});
      }finally{ URL.revokeObjectURL(url); }
    }

    function redraw(){
      if(!STATE.image) return;
      renderBaseImage();
      renderStitches();
    }
    function renderBaseImage(){
      const img=STATE.image; if(!img) return;
      const W=img.width, H=img.height;
      const Wp=previewCanvas.width/DPR(), Hp=previewCanvas.height/DPR();
      const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
      tmp.getContext('2d').putImageData(img,0,0);
      const ctx=previewCanvas.getContext('2d'); ctx.setTransform(DPR(),0,0,DPR(),0,0);
      ctx.clearRect(0,0,Wp,Hp); ctx.fillStyle='#fff'; ctx.fillRect(0,0,Wp,Hp);
      ctx.drawImage(tmp,ox,oy,w,h);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
    }
    function renderStitches(){
      if(!STATE.stitches.length) return;
      const ctx=previewCanvas.getContext('2d'); ctx.save();
      ctx.strokeStyle='#111827'; ctx.lineWidth=1.6; ctx.beginPath();
      let started=false;
      for(const s of STATE.stitches){
        if(s.move){ ctx.moveTo(s.x,s.y); started=true; }
        else if(started){ ctx.lineTo(s.x,s.y); }
      } ctx.stroke(); ctx.restore();
    }
    function drawSubjectBox(){
      redraw();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect, ctx=previewCanvas.getContext('2d');
        ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.lineWidth=1.2; ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
      }
    }

    // ===== very fast offline processing =====
    function kmeansPalette(imgData,k,mask,onProgress){
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
          if(dd>bd){bd=dd;best=p;}
        } centers.push(best.slice());
      }
      for(let it=0;it<5;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0,bd=1e12; for(let i=0;i<centers.length;i++){
            const c=centers[i]; const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(t<bd){bd=t;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
        onProgress && onProgress(10+it*10);
      }
      return centers.slice(0,k);
    }

    async function quantizeFast(imgData,k,mask,onProgress){
      const W=imgData.width,H=imgData.height,d=imgData.data;
      const palette=kmeansPalette(imgData,Math.min(k,6),mask,onProgress);
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
              const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb; const vv=dr*dr+dg*dg+db*db;
              if(vv<bd){bd=vv;bi=c;}
            }
            indexed[i]=bi;
          }
        }
        onProgress && onProgress(60+Math.round(40*y/H));
        await defer();
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

    function hookDownloads(res){
      fmtBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>saveU8(res.dstU8,'loomabelle.dst'); }
        else if(fmt==='EXP'){ btn.onclick=()=>saveU8(res.expU8,'loomabelle.exp'); }
        else { btn.onclick=()=>alert('Coming soon'); }
      });
    }
    function saveU8(u8,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }

    // ===== flows =====
    async function processPhotoFlow(){
      if(!STATE.image){ fileInput?.click(); return; }
      setFormatsVisible(false); setProgress(1);

      // optional subject rect → mask in image space
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

      const q = await quantizeFast(STATE.image, 6, mask, p=>setProgress(Math.max(1,Math.min(95,p))));
      const ops = planStitches(q, {outline:true, angle:45});

      STATE.stitches = toPreviewPath(ops);
      redraw(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8,expU8});
      setFormatsVisible(true);
    }

    async function processDrawingFlow(){
      setFormatsVisible(false); setProgress(1);
      const w=drawCanvas.width, h=drawCanvas.height, sctx=drawCanvas.getContext('2d');
      const id=sctx.getImageData(0,0,w,h);
      // show drawing in preview then process as mask
      STATE.image=id; fit(previewCanvas, previewArea); setPreviewHint(false); redraw();

      const mask=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){ mask[i]= id.data[i*4+3] > 10 ? 1 : 0; }
      const q={indexed:mask, palette:[[0,0,0],[255,255,255]], W:w, H:h};
      const ops=planStitches(q,{outline:true, angle:45});
      STATE.stitches=toPreviewPath(ops); redraw(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);
      previewCard?.scrollIntoView({behavior:'smooth',block:'center'});
      activate('upload'); // jump to preview after drawing process
    }

    function setFormatsVisible(v){ fmtBtns.forEach(b=> b.style.display = v ? 'inline-block' : 'none'); }
  }

})();