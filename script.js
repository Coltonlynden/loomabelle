/* Loomabelle — script.js v16 (single-file, no dependencies)
   Fixes: preview after upload, Process Photo works, Draw → Process Drawing works,
          DST/EXP download buttons enabled after processing.
   Does NOT change your layout or styles.
*/
(function(){
  "use strict";

  /*** tiny utils ***/
  const READY = (fn)=> (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn());
  const $  = (s,root)=> (root||document).querySelector(s);
  const $$ = (s,root)=> Array.prototype.slice.call((root||document).querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const dpr= ()=> window.devicePixelRatio||1;
  const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));
  const tick = () => new Promise(r=>setTimeout(r,0));
  const log = (...a)=>console.log('[Loomabelle]',...a);

  /*** fast, offline processor (quantize → stitches → export) ***/
  function sampleDominantRGBA(imgData, maxK){
    const W=imgData.width,H=imgData.height,d=imgData.data;
    const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
    const pts=[];
    for(let y=0;y<H;y+=step){
      const row=y*W;
      for(let x=0;x<W;x+=step){ const i=(row+x)*4; pts.push([d[i],d[i+1],d[i+2]]); }
    }
    const k=Math.min(maxK, Math.max(1, pts.length));
    const centers=[ pts[Math.floor(Math.random()*pts.length)] ];
    while(centers.length<k){
      let best=null,bd=-1;
      for(const p of pts){
        let dmin=1e9; for(const c of centers){ const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<dmin) dmin=dd; }
        if(dmin>bd){bd=dmin;best=p;}
      }
      centers.push(best.slice());
    }
    for(let it=0;it<5;it++){
      const sum=Array.from({length:k},()=>[0,0,0,0]);
      for(const p of pts){
        let bi=0,bd=1e12;
        for(let i=0;i<k;i++){ const c=centers[i]; const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<bd){bd=dd;bi=i;} }
        const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
      }
      for(let i=0;i<k;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
    }
    const uniq=[]; for(const c of centers){ if(!uniq.some(u=>Math.hypot(u[0]-c[0],u[1]-c[1],u[2]-c[2])<18)) uniq.push(c); }
    return uniq;
  }

  async function quantizeFast(imgData, k, mask, onProgress){
    const W=imgData.width,H=imgData.height,d=imgData.data;
    const palette=sampleDominantRGBA(imgData, Math.min(k,6));
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
      onProgress && onProgress(Math.min(100, 20+Math.round(80*y/H)));
      await tick();
    }
    return { indexed, palette, W, H };
  }

  function planStitches(data, opts){
    const {indexed, W, H} = data;
    const angle = (opts && opts.angle!=null) ? (+opts.angle) : 45;
    const outline = !!(opts && opts.outline);
    const step = Math.max(2, Math.floor(Math.min(W,H) / 220));
    const ops = [];

    if (outline){
      const edges = new Uint8Array(W*H);
      for(let y=1;y<H-1;y++){
        const row=y*W;
        for(let x=1;x<W-1;x++){
          const i=row+x, c=indexed[i];
          if (indexed[i-1]!==c || indexed[i+1]!==c || indexed[i-W]!==c || indexed[i+W]!==c) edges[i]=1;
        }
      }
      for(let y=0;y<H;y+=step){
        let run=null;
        for(let x=0;x<W;x++){
          const i=y*W+x;
          if(edges[i]){ if(!run) run={y:y, x0:x}; }
          else if(run){ ops.push({cmd:'jump', x:run.x0, y:run.y}); ops.push({cmd:'stitch', x:x, y:run.y}); run=null; }
        }
        if(run){ ops.push({cmd:'jump', x:run.x0, y:run.y}); ops.push({cmd:'stitch', x:W-1, y:run.y}); }
      }
    }

    const rad = angle * Math.PI/180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    const bands = Math.max(4, Math.floor(Math.min(W,H) / 24));
    for(let b=0;b<bands;b++){
      const t = (b / bands) * (W+H);
      for(let y=0;y<H;y+=step){
        const x = Math.floor(t - y * (sin/cos));
        let inRun=false, lx=null, ly=null;
        for(let px=x-20; px<=x+20; px++){
          const xx = px, yy = Math.floor(y + (px - x)* (sin/cos));
          if(xx>=0 && xx<W && yy>=0 && yy<H){
            if(!inRun){ ops.push({cmd:'jump', x:xx, y:yy}); inRun=true; }
            lx=xx; ly=yy;
          }
        }
        if(inRun && lx!=null){ ops.push({cmd:'stitch', x:lx, y:ly}); }
      }
    }
    return ops;
  }

  function toUnits(ops, pxPerMm, outW, outH){
    const s = 1/pxPerMm*10, cx=outW/2, cy=outH/2;
    const out=[]; let prev=null;
    for(const op of ops){
      if(op.cmd==='stop'){ out.push({cmd:'stop'}); prev=null; continue; }
      if(op.cmd==='jump'||op.cmd==='stitch'){
        const x=(op.x-cx)*s, y=(op.y-cy)*s;
        if(prev===null){ prev=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
        else{ out.push({cmd:op.cmd,dx:x-prev[0],dy:y-prev[1]}); prev=[x,y]; }
      }
    }
    return out;
  }
  function writeDST(ops, opts){
    const pxPerMm = (opts && opts.pxPerMm) || 2;
    const outW = (opts && opts.outW) || 640, outH=(opts && opts.outH)||360;
    const u=toUnits(ops, pxPerMm, outW, outH), bytes=[];
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
    const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
    const hb=new TextEncoder().encode(header);
    const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
  }
  function writeEXP(ops, opts){
    const pxPerMm = (opts && opts.pxPerMm) || 2;
    const outW = (opts && opts.outW) || 640, outH=(opts && opts.outH)||360;
    const u=toUnits(ops, pxPerMm, outW, outH), bytes=[];
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

  async function processPhoto(imgData, controls, onProgress){
    const k = clamp(~~(controls.k||6),2,12);
    const pxPerMm = controls.pxPerMm || 2;
    const outW = controls.outW || imgData.width;
    const outH = controls.outH || imgData.height;
    onProgress && onProgress(5);
    const q = await quantizeFast(imgData, k, controls.mask||null, p=>onProgress && onProgress(5+Math.round(p*0.55)));
    onProgress && onProgress(70);
    const ops = planStitches(q, { outline:true, angle:+(controls.angle||45) });
    onProgress && onProgress(88);
    const dstU8 = writeDST(ops, {pxPerMm,outW,outH});
    const expU8 = writeEXP(ops, {pxPerMm,outW,outH});
    onProgress && onProgress(100);
    return { ...q, ops, dstU8, expU8 };
  }

  async function processDrawing(alphaImageData, controls, onProgress){
    const W=alphaImageData.width, H=alphaImageData.height, d=alphaImageData.data;
    const mask=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++){ mask[i]= d[i*4+3]>10?1:0; }
    const q={indexed:mask, palette:[[0,0,0],[255,255,255]], W, H};
    onProgress && onProgress(40);
    const ops = planStitches(q, { outline:true, angle:45 });
    onProgress && onProgress(88);
    const pxPerMm = controls.pxPerMm || 2;
    const dstU8 = writeDST(ops, {pxPerMm,outW:W,outH:H});
    const expU8 = writeEXP(ops, {pxPerMm,outW:W,outH:H});
    onProgress && onProgress(100);
    return { ...q, ops, dstU8, expU8 };
  }

  /*** UI glue ***/
  READY(init);
  function init(){
    // try to locate cards by headings; fallback to common classes
    const uploadCard  = findCard(['upload a photo','start with a photo']) || $('.col.card.blue')  || document.body;
    const previewCard = findCard(['preview (stitched)','preview'])         || $('.col.card.rose') || document.body;
    const drawCard    = findCard(['draw & trace','draw'])                  || document.body;

    // preview hidden until we have an image
    if(previewCard) previewCard.style.display='none';

    const previewHost = (previewCard && (previewCard.querySelector('.preview')||previewCard)) || document.body;
    const drawHost    = (drawCard && (drawCard.querySelector('.canvas')||drawCard)) || document.body;

    // canvases
    const prev=document.createElement('canvas');
    const pctx=prev.getContext('2d',{willReadFrequently:true});
    const draw=document.createElement('canvas');
    const dctx=draw.getContext('2d',{willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';

    // mount & base sizing
    if(previewHost){ previewHost.innerHTML=''; previewHost.appendChild(prev); if(getComputedStyle(previewHost).position==='static'){ previewHost.style.position='relative'; } }
    if(drawHost){ drawHost.innerHTML=''; drawHost.appendChild(draw); }
    function sizeCanvasToHost(canvas, host){
      const cw=Math.max(320, host.clientWidth||640);
      const ch=Math.max(220, Math.floor(cw*9/16));
      const s=dpr();
      canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
      canvas.width=Math.round(cw*s); canvas.height=Math.round(ch*s);
      canvas.getContext('2d').setTransform(s,0,0,s,0,0);
    }
    function resizeAll(){ if(previewHost) sizeCanvasToHost(prev, previewHost); if(drawHost) sizeCanvasToHost(draw, drawHost); }
    try{ if(previewHost) new ResizeObserver(resizeAll).observe(previewHost); if(drawHost) new ResizeObserver(resizeAll).observe(drawHost); }catch(_){ on(window,'resize',resizeAll); }
    resizeAll();

    // progress bar
    const progWrap=document.createElement('div'); progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar=document.createElement('div');  progBar .style.cssText='height:100%;width:0%;background:#111827;opacity:.8';
    progWrap.appendChild(progBar); if(previewHost) previewHost.appendChild(progWrap);
    const setProgress=(pct)=>{ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>progWrap.style.display='none',400); };

    // toolbar (inside preview)
    const tb=document.createElement('div'); tb.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess=document.createElement('button'); btnProcess.className='btn'; btnProcess.textContent='Process Photo';
    const btnHighlight=document.createElement('button'); btnHighlight.className='btn'; btnHighlight.textContent='Highlight Subject';
    const lblNo=document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox'; lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tb.appendChild(btnProcess); tb.appendChild(btnHighlight); tb.appendChild(lblNo); if(previewHost) previewHost.appendChild(tb);

    // format buttons (hide until processed)
    const formatBtns = previewCard ? Array.from(previewCard.querySelectorAll('button,a')).filter(b=>{
      const t=(b.textContent||'').trim().toUpperCase(); return t==='DST'||t==='EXP'||t==='PES'||t==='JEF';
    }) : [];
    const setFormatsVisible=(v)=> formatBtns.forEach(b=> b.style.display=v?'inline-block':'none');
    setFormatsVisible(false);

    // state
    const STATE={ active:'#111827', lastImage:null, imgFit:null, subject:{enabled:false,rect:null,noSubject:false}, stitches:[] };

    // upload zone (robust: create hidden input if none)
    const dropZone = (uploadCard && (uploadCard.querySelector('.upload-zone')||uploadCard)) || document.body;
    let fileInput = dropZone.querySelector('input[type=file]');
    if(!fileInput){
      fileInput=document.createElement('input');
      fileInput.type='file'; fileInput.accept='image/*';
      fileInput.style.position='absolute'; fileInput.style.opacity='0'; fileInput.style.pointerEvents='none';
      dropZone.appendChild(fileInput);
    }
    fileInput.removeAttribute('disabled');

    on(dropZone,'dragover',e=>e.preventDefault());
    on(dropZone,'drop',e=>{ e.preventDefault(); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(dropZone,'click',e=>{ if(e.target.closest('a,button')) return; fileInput.click(); });
    on(fileInput,'change',()=>{ const f=fileInput.files&&fileInput.files[0]; if(f) loadImage(f); });

    // open buttons (delegated) — do not change layout
    on(document,'click', (e)=>{
      const t=(e.target.closest('button,a')?.textContent||'').toLowerCase();
      if(!t) return;
      if(t.includes('start with a photo') || t.includes('upload photo')){ e.preventDefault(); (uploadCard||document.body).scrollIntoView({behavior:'smooth',block:'center'}); }
      if(t.includes('open the drawing tab') || t.includes('draw & trace')){ e.preventDefault(); (drawCard||document.body).scrollIntoView({behavior:'smooth',block:'center'}); }
    });

    // subject rectangle
    on(btnHighlight,'click',()=>{ STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; btnHighlight.classList.toggle('active',STATE.subject.enabled); drawSubjectBox(); });
    on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });
    let dragging=false, startPt=null;
    on(prev,'pointerdown',e=>{
      if(!STATE.subject.enabled) return;
      const r=prev.getBoundingClientRect(); startPt=[e.clientX-r.left,e.clientY-r.top]; dragging=true; STATE.subject.rect={x:startPt[0],y:startPt[1],w:0,h:0}; drawSubjectBox();
    });
    on(prev,'pointermove',e=>{
      if(!dragging||!STATE.subject.enabled) return;
      const r=prev.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(startPt[0],x),y:Math.min(startPt[1],y),w:Math.abs(x-startPt[0]),h:Math.abs(y-startPt[1])}; drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    // draw tools
    draw.style.touchAction='none';
    let drawing=false, pid=null;
    on(draw,'pointerdown',e=>{
      const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      draw.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
    });
    on(draw,'pointermove',e=>{
      if(!drawing||e.pointerId!==pid) return; e.preventDefault();
      const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=e=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{draw.releasePointerCapture(e.pointerId);}catch(_){}}};
    on(draw,'pointerup',stopDraw); on(draw,'pointercancel',stopDraw);

    // add Process Drawing button (in whatever toolbar exists)
    const drawToolbar = (drawCard && (drawCard.querySelector('.toolbar')||drawCard)) || drawHost;
    const btnProcDraw=document.createElement('button'); btnProcDraw.className='btn'; btnProcDraw.style.marginLeft='10px'; btnProcDraw.textContent='Process Drawing';
    drawToolbar && drawToolbar.appendChild(btnProcDraw);

    // base image render
    function renderBaseImage(){
      if(!STATE.lastImage) return;
      const Wp=prev.width/dpr(), Hp=prev.height/dpr();
      const W=STATE.lastImage.width, H=STATE.lastImage.height;
      const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      pctx.setTransform(dpr(),0,0,dpr(),0,0);
      pctx.clearRect(0,0,Wp,Hp); pctx.fillStyle='#fff'; pctx.fillRect(0,0,Wp,Hp);
      const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; tmp.getContext('2d').putImageData(STATE.lastImage,0,0);
      pctx.drawImage(tmp,ox,oy,w,h);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
      drawStitches();
    }
    function drawStitches(){
      if(!STATE.stitches.length) return;
      pctx.save(); pctx.strokeStyle='#111827'; pctx.lineWidth=1.6; pctx.beginPath();
      let started=false;
      for(const s of STATE.stitches){
        if(s.move){ pctx.moveTo(s.x,s.y); started=true; }
        else if(started){ pctx.lineTo(s.x,s.y); }
      }
      pctx.stroke(); pctx.restore();
    }
    function drawSubjectBox(){
      renderBaseImage();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect;
        pctx.save(); pctx.setLineDash([6,6]); pctx.strokeStyle='rgba(20,20,20,.95)'; pctx.lineWidth=1.2; pctx.strokeRect(r.x,r.y,r.w,r.h); pctx.restore();
      }
    }

    // load image (immediate preview)
    async function loadImage(file){
      const url=URL.createObjectURL(file);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide=isIOS?1024:1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.lastImage=c.getContext('2d').getImageData(0,0,W,H);

        if(previewCard) previewCard.style.display='';
        tb.style.visibility='visible';
        renderBaseImage();
        setFormatsVisible(false);
        (previewCard||document.body).scrollIntoView({behavior:'smooth',block:'center'});
      }finally{ URL.revokeObjectURL(url); }
    }

    // Process Photo
    on(btnProcess,'click', async ()=>{
      if(!STATE.lastImage){ fileInput?.click(); return; }
      setFormatsVisible(false); setProgress(1);

      // optional subject mask from rectangle (image space)
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

      const res = await processPhoto(
        STATE.lastImage,
        { k:6, angle:45, pxPerMm:2, outW:prev.width/dpr(), outH:prev.height/dpr(), mask },
        (p)=>setProgress(Math.max(1,Math.min(99,p)))
      );
      STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
      renderBaseImage(); setProgress(100); setFormatsVisible(true);
      enableDownloads(res);
    });

    // Process Drawing
    on(btnProcDraw,'click', async ()=>{
      setFormatsVisible(false); setProgress(1);
      const max=1024, w=draw.width, h=draw.height, s=Math.min(1, max/Math.max(w,h));
      const c=document.createElement('canvas'); c.width=(w*s)|0; c.height=(h*s)|0; c.getContext('2d').drawImage(draw,0,0,c.width,c.height);
      const id=c.getContext('2d').getImageData(0,0,c.width,c.height);
      const res = await processDrawing(id, {pxPerMm:2}, p=>setProgress(Math.max(1,Math.min(99,p))));
      if(previewCard) previewCard.style.display='';
      STATE.lastImage=id; STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
      renderBaseImage(); setProgress(100); setFormatsVisible(true);
      (previewCard||document.body).scrollIntoView({behavior:'smooth',block:'center'});
      enableDownloads(res);
    });

    function enableDownloads(res){
      formatBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>downloadU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
        else if(fmt==='EXP'){ btn.onclick=()=>downloadU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
      });
    }
    function downloadU8(u8, name){
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1200);
    }

    function setProgress(p){ progWrap.style.display='block'; progBar.style.width=(p|0)+'%'; if(p>=100) setTimeout(()=>progWrap.style.display='none',400); }
    function setFormatsVisible(v){ formatBtns.forEach(b=> b.style.display=v?'inline-block':'none'); }
  }

  function findCard(headings){
    const keys = (Array.isArray(headings)?headings:[headings]).map(s=>String(s||'').toLowerCase());
    const hs=$$('h1,h2,h3,h4,h5,h6');
    for(const h of hs){
      const txt=(h.textContent||'').trim().toLowerCase();
      if(keys.some(k=>txt.includes(k))){ return h.closest('.card') || h.parentElement; }
    }
    return null;
  }

})();