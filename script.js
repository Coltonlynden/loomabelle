/* Loomabelle — script.js v17 (single-file, no dependencies)
   Purpose: Make the existing mockup functional without changing layout.
   What it does:
     - Lets user pick a photo (tap/click the upload card)
     - Shows that photo immediately in the Preview card (no “mockup” text)
     - Adds “Process Photo” & “Highlight Subject / No subject” tools inside Preview
     - “Draw & Trace” canvas with “Process Drawing”
     - Exports DST / EXP after processing
   Assumptions:
     - Your page has one “Upload a photo” card and one “Preview (stitched)” card
       with visible headings. We DO NOT change your HTML.
*/

(function () {
  "use strict";

  const READY = (fn)=> (document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn, {once:true})
    : fn());

  const $  = (s,root)=> (root||document).querySelector(s);
  const $$ = (s,root)=> Array.from((root||document).querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const DPR = ()=> window.devicePixelRatio||1;

  READY(init);

  function init(){
    // 0) Remove any “mockup only” hints visually (no DOM changes)
    $$('.badge, .note, small, .text-muted, .muted').forEach(el=>{
      if((el.textContent||'').toLowerCase().includes('mockup')) el.style.display='none';
    });

    // 1) Find the three areas by their headings (so we don’t touch layout)
    const uploadCard  = findCardByHeading(['upload a photo','start with a photo']) || document.body;
    const previewCard = findCardByHeading(['preview (stitched)','preview']) || document.body;
    const drawCard    = findCardByHeading(['draw & trace','draw']) || document.body;

    // 2) Build canvases INSIDE the card boxes (no structural changes)
    // PREVIEW CANVAS (hidden until an image is chosen)
    const previewHost = previewCard;
    const previewCanvas = ensureCanvas(previewHost);
    const pctx = previewCanvas.getContext('2d', {willReadFrequently:true});
    previewCard.style.display = 'none'; // don’t show until something to show

    // DRAW & TRACE CANVAS
    const drawHost = drawCard;
    const drawCanvas = ensureCanvas(drawHost);
    const dctx = drawCanvas.getContext('2d', {willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';

    // keep canvases sized to their box
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
    const ro = new ResizeObserver(()=>{ fit(previewCanvas, previewHost); fit(drawCanvas, drawHost); redraw(); });
    ro.observe(previewHost); ro.observe(drawHost);

    // 3) Upload zone – we don’t alter the box; we attach to clicks/drops
    const dropZone = uploadCard;
    let fileInput = dropZone.querySelector('input[type=file]');
    if(!fileInput){
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,.heic,.heif';
      fileInput.style.position='absolute';
      fileInput.style.opacity='0';
      fileInput.style.pointerEvents='none';
      dropZone.appendChild(fileInput);
    }
    on(dropZone,'click', (e)=> {
      // ignore clicks on real buttons/links in that card
      if(e.target.closest('a,button,input,select,label')) return;
      fileInput.click();
    });
    on(dropZone,'dragover', e=>e.preventDefault());
    on(dropZone,'drop', async (e)=>{
      e.preventDefault();
      const f=e.dataTransfer.files && e.dataTransfer.files[0];
      if(f) await loadImageFile(f);
    });
    on(fileInput,'change', async ()=>{
      const f=fileInput.files && fileInput.files[0];
      if(f) await loadImageFile(f);
    });

    // 4) Top CTA buttons just scroll to sections (no layout change)
    on(document,'click',(e)=>{
      const t=(e.target.closest('button,a')?.textContent||'').toLowerCase();
      if(!t) return;
      if(t.includes('start with a photo') || t.includes('upload photo')){
        e.preventDefault(); uploadCard.scrollIntoView({behavior:'smooth',block:'center'});
      }
      if(t.includes('open the drawing tab') || t.includes('draw & trace')){
        e.preventDefault(); drawCard.scrollIntoView({behavior:'smooth',block:'center'});
      }
    });

    // 5) Preview toolbar (buttons are created inside preview card)
    const tools = document.createElement('div');
    tools.style.cssText = 'position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess   = makeBtn('Process Photo');
    const btnHighlight = makeBtn('Highlight Subject');
    const lblNo = document.createElement('label');
    const chkNo = document.createElement('input'); chkNo.type='checkbox';
    lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tools.append(btnProcess, btnHighlight, lblNo);
    previewHost.style.position = getComputedStyle(previewHost).position==='static' ? 'relative' : getComputedStyle(previewHost).position;
    previewHost.appendChild(tools);

    // Loading/progress bar (inside preview card)
    const progWrap=document.createElement('div');
    progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar=document.createElement('div');
    progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.8';
    progWrap.appendChild(progBar);
    previewHost.appendChild(progWrap);
    const setProgress=(pct)=>{ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>progWrap.style.display='none',300); };

    // Find export buttons in your card and keep them hidden until ready
    const exportBtns = Array.from(previewCard.querySelectorAll('button,a')).filter(b=>{
      const t=(b.textContent||'').trim().toUpperCase();
      return t==='DST'||t==='EXP'||t==='PES'||t==='JEF';
    });
    const setExportsVisible = (v)=> exportBtns.forEach(b=> b.style.display = v ? 'inline-block' : 'none');
    setExportsVisible(false);

    // 6) Draw & Trace — simple drawing UX; no layout changes
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

    // Add a “Process Drawing” button at the end of the draw card (no restyle)
    const drawBtn = makeBtn('Process Drawing');
    drawBtn.style.marginTop = '10px';
    drawCard.appendChild(drawBtn);

    // 7) STATE + processing
    const STATE = {
      image: null,              // ImageData at source resolution
      imgFit: null,             // how source maps into preview canvas
      stitches: [],             // preview path
      subject: { enabled:false, rect:null, noSubject:false }
    };

    on(btnHighlight,'click',()=>{
      STATE.subject.enabled = !STATE.subject.enabled;
      if(!STATE.subject.enabled) STATE.subject.rect = null;
      btnHighlight.classList.toggle('active', STATE.subject.enabled);
      drawSubjectBox();
    });
    on(chkNo,'change',()=>{ STATE.subject.noSubject = chkNo.checked; });

    // draw subject rectangle on preview
    let dragging=false, startPt=null;
    on(previewCanvas,'pointerdown',e=>{
      if(!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); startPt=[e.clientX-r.left,e.clientY-r.top];
      dragging=true; STATE.subject.rect={x:startPt[0],y:startPt[1],w:0,h:0}; drawSubjectBox();
    });
    on(previewCanvas,'pointermove',e=>{
      if(!dragging||!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(startPt[0],x),y:Math.min(startPt[1],y),w:Math.abs(x-startPt[0]),h:Math.abs(y-startPt[1])};
      drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    // process buttons
    on(drawBtn,'click', doProcessDrawing);
    on(btnProcess,'click', doProcessPhoto);

    // ===== helpers =====
    function ensureCanvas(host){
      // don’t break your layout; place a canvas over existing dotted area
      const c = document.createElement('canvas');
      c.style.display='block';
      c.style.width='100%'; c.style.height='auto';
      // we’ll size with ResizeObserver
      host.appendChild(c);
      // transparent “Your stitched preview appears here” text removal:
      host.querySelectorAll('*').forEach(el=>{
        if((el.textContent||'').toLowerCase().includes('your stitched preview')) el.style.visibility='hidden';
        if((el.textContent||'').toLowerCase().includes('drag & drop') && (el.tagName!=='INPUT')) el.style.pointerEvents='none';
      });
      return c;
    }

    function redraw(){
      if(!STATE.image) return;
      renderBaseImage();
      renderStitches();
    }

    function renderBaseImage(){
      const img = STATE.image; if(!img) return;
      const W=img.width, H=img.height;
      const Wp=previewCanvas.width / DPR(), Hp=previewCanvas.height / DPR();
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
      }
      ctx.stroke(); ctx.restore();
    }

    function drawSubjectBox(){
      redraw();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect, ctx=previewCanvas.getContext('2d');
        ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.lineWidth=1.2;
        ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
      }
    }

    async function loadImageFile(file){
      const url = URL.createObjectURL(file);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
        // mobile-friendly clamp
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide = isIOS ? 1024 : 1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.image = c.getContext('2d').getImageData(0,0,W,H);

        previewCard.style.display='';
        tools.style.visibility='visible';
        fit(previewCanvas, previewHost);
        redraw();
        // exports hidden until we run processing
        setExportsVisible(false);
        previewCard.scrollIntoView({behavior:'smooth',block:'center'});
      }finally{ URL.revokeObjectURL(url); }
    }

    // ===== lightweight processor (fast, offline) =====
    function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
    async function quantizeFast(imgData, k, mask, onProgress){
      const W=imgData.width,H=imgData.height,d=imgData.data;
      const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
      // seed centers
      const pts=[];
      for(let y=0;y<H;y+=step){
        const row=y*W;
        for(let x=0;x<W;x+=step){
          const i=(row+x)*4; if(mask && !mask[row+x]) continue;
          pts.push([d[i],d[i+1],d[i+2]]);
        }
      }
      const K=Math.min(k,Math.max(1,pts.length));
      const centers=[pts[Math.floor(Math.random()*pts.length)]];
      while(centers.length<K){
        let best=null,bd=-1;
        for(const p of pts){
          let dd=1e9; for(const c of centers){ const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(t<dd) dd=t; }
          if(dd>bd){bd=dd;best=p;}
        }
        centers.push(best.slice());
      }
      for(let it=0;it<5;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0,bd=1e12;
          for(let i=0;i<centers.length;i++){
            const c=centers[i]; const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
            if(t<bd){bd=t;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
        onProgress && onProgress(10+it*10);
        await new Promise(r=>setTimeout(r,0));
      }
      const palette=centers.slice(0,k);
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
        await new Promise(r=>setTimeout(r,0));
      }
      return { indexed, palette, W, H };
    }

    function planStitches(data, opts){
      const {indexed, W, H} = data;
      const angle = +((opts && opts.angle)!=null ? opts.angle : 45);
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

    async function doProcessPhoto(){
      if(!STATE.image){ fileInput.click(); return; }
      setExportsVisible(false); setProgress(1);

      // optional subject rectangle → mask in image space
      let mask=null;
      if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){
        const {ox,oy,scale,iw,ih}=STATE.imgFit;
        const sx=Math.max(0, Math.floor((STATE.subject.rect.x-ox)/scale));
        const sy=Math.max(0, Math.floor((STATE.subject.rect.y-oy)/scale));
        const ex=Math.min(iw-1, Math.floor((STATE.subject.rect.x+STATE.subject.rect.w-ox)/scale));
        const ey=Math.min(ih-1, Math.floor((STATE.subject.rect.y+STATE.subject.h-oy)/scale));
        mask=new Uint8Array(iw*ih);
        for(let y=sy;y<=ey;y++){ mask.fill(1, y*iw+sx, y*iw+ex+1); }
      }

      const q = await quantizeFast(STATE.image, 6, mask, p=>setProgress(Math.max(1,Math.min(95,p))));
      // super-fast stitches for preview
      const ops = planStitches(q, { outline:true, angle:45 });

      // show lines on preview
      STATE.stitches = toPreviewPath(ops);
      redraw();
      setProgress(100);

      // enable downloads
      const dstU8 = writeDST(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      const expU8 = writeEXP(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8, expU8});
      setExportsVisible(true);
    }

    async function doProcessDrawing(){
      // use the drawing alpha as mask
      const w=drawCanvas.width, h=drawCanvas.height, sctx=drawCanvas.getContext('2d');
      const id=sctx.getImageData(0,0,w,h);
      // preview becomes the drawing
      previewCard.style.display='';
      STATE.image = id;
      fit(previewCanvas, previewHost);
      redraw();

      setExportsVisible(false); setProgress(1);
      // treat alpha as binary mask → plan simple stitches
      const mask = new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){ mask[i]= id.data[i*4+3] > 10 ? 1 : 0; }
      const q = { indexed:mask, palette:[[0,0,0],[255,255,255]], W:w, H:h };
      const ops = planStitches(q, { outline:true, angle:45 });

      STATE.stitches = toPreviewPath(ops);
      redraw();
      setProgress(100);

      const dstU8 = writeDST(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      const expU8 = writeEXP(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8, expU8});
      setExportsVisible(true);

      previewCard.scrollIntoView({behavior:'smooth',block:'center'});
    }

    function toPreviewPath(ops){
      // map to preview coordinates so we can draw them
      const fit=STATE.imgFit || {ox:0,oy:0,scale:1};
      return ops.map(op=>{
        const x = op.x*fit.scale + fit.ox;
        const y = op.y*fit.scale + fit.oy;
        return (op.cmd==='jump') ? {move:true,x,y} : {move:false,x,y};
      });
    }

    function hookDownloads(res){
      exportBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>downloadU8(res.dstU8,'loomabelle.dst'); }
        if(fmt==='EXP'){ btn.onclick=()=>downloadU8(res.expU8,'loomabelle.exp'); }
        // PES/JEF placeholders: you can hide them or wire later
        if(fmt==='PES'||fmt==='JEF'){ btn.onclick=()=>alert('Coming soon'); }
      });
    }
    function downloadU8(u8, name){
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1200);
    }

    function setProgress(p){ progWrap.style.display='block'; progBar.style.width=(p|0)+'%'; if(p>=100) setTimeout(()=>progWrap.style.display='none',300); }

  } // init end

  function findCardByHeading(keys){
    const want = (Array.isArray(keys)?keys:[keys]).map(s=>String(s||'').toLowerCase());
    const hs = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for(const h of hs){
      const txt=(h.textContent||'').trim().toLowerCase();
      if(want.some(k=>txt.includes(k))){
        return h.closest('.card') || h.parentElement;
      }
    }
    return null;
  }

})();