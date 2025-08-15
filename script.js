/* Loomabelle — script.js v20 (single-file, mobile-first, no deps)
   - Wires the existing mockup without changing your layout
   - Upload photo → shows in Preview instantly
   - Preview tools: Process Photo, Highlight Subject, No subject
   - Draw & Trace canvas + Process Drawing
   - DST / EXP downloads enabled AFTER processing
*/
(function(){
  "use strict";

  const READY=(fn)=>document.readyState==='loading'
      ? document.addEventListener('DOMContentLoaded',fn,{once:true})
      : fn();
  const $  = (s,root)=> (root||document).querySelector(s);
  const $$ = (s,root)=> Array.from((root||document).querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const DPR= ()=> window.devicePixelRatio||1;
  const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));
  const defer = () => new Promise(r=>setTimeout(r,0));

  READY(init);

  function init(){
    $('#year') && ($('#year').textContent = new Date().getFullYear());

    // Hide any “mockup only” hint text
    $$('.badge,.muted,small').forEach(el=>{
      if((el.textContent||'').toLowerCase().includes('mockup')) el.style.display='none';
    });

    const uploadCard  = $('#upload-card')  || findCardByHead(['upload a photo','start with a photo']);
    const previewCard = $('#preview-card') || findCardByHead(['preview (stitched)','preview']);
    const drawCard    = $('#draw-card')    || findCardByHead(['draw & trace','draw']);

    // In-case headings differ in your theme the findCardByHead fallback will still work.
    function findCardByHead(keys){
      const want=(Array.isArray(keys)?keys:[keys]).map(s=>String(s||'').toLowerCase());
      for(const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')){
        const t=(h.textContent||'').trim().toLowerCase();
        if(want.some(k=>t.includes(k))) return h.closest('.card') || h.parentElement;
      } return null;
    }

    // ----- canvases in-place -----
    const previewCanvas = makeCanvas(previewCard);
    const pctx = previewCanvas.getContext('2d',{willReadFrequently:true});
    previewCard && (previewCard.style.display='none'); // hide until image selected

    const drawCanvas = makeCanvas(drawCard);
    const dctx = drawCanvas.getContext('2d',{willReadFrequently:true});
    dctx.lineCap='round'; dctx.lineJoin='round';

    sizeToHost(previewCanvas, previewCard);
    sizeToHost(drawCanvas, drawCard);
    const ro = new ResizeObserver(()=>{ sizeToHost(previewCanvas, previewCard); sizeToHost(drawCanvas, drawCard); redraw(); });
    previewCard && ro.observe(previewCard);
    drawCard && ro.observe(drawCard);

    // ----- upload zone -----
    const dropZone = $('#upload-drop') || uploadCard || document.body;
    let fileInput = dropZone.querySelector('input[type=file]');
    if(!fileInput){
      fileInput=document.createElement('input');
      fileInput.type='file';
      fileInput.accept='image/*,.heic,.heif';
      fileInput.style.position='absolute';
      fileInput.style.opacity='0';
      fileInput.style.pointerEvents='none';
      (uploadCard||document.body).appendChild(fileInput);
    }

    on(dropZone,'click', (e)=> {
      if(e.target.closest('button,a,input,label')) return;
      fileInput.click();
    });
    on(dropZone,'dragover', e=>e.preventDefault());
    on(dropZone,'drop', async e=>{
      e.preventDefault();
      const f=e.dataTransfer.files && e.dataTransfer.files[0];
      if(f) await loadImageFile(f);
    });
    on(fileInput,'change', async ()=>{
      const f=fileInput.files && fileInput.files[0];
      if(f) await loadImageFile(f);
    });

    // Top CTAs → smooth scroll
    on($('#go-upload'),'click', ()=> uploadCard.scrollIntoView({behavior:'smooth',block:'center'}));
    on($('#go-draw'),  'click', ()=> drawCard.scrollIntoView({behavior:'smooth',block:'center'}));
    // Hero buttons (text-based)
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

    // ----- preview toolbar inside the preview card -----
    const tools = document.createElement('div');
    tools.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess   = uiBtn('Process Photo');
    const btnHighlight = uiBtn('Highlight Subject');
    const lblNo = document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox';
    lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tools.append(btnProcess, btnHighlight, lblNo);
    ensurePosition(previewCard).appendChild(tools);

    // progress bar
    const barWrap=document.createElement('div'); barWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const bar=document.createElement('div'); bar.style.cssText='height:100%;width:0%;background:#111827;opacity:.9'; barWrap.appendChild(bar);
    ensurePosition(previewCard).appendChild(barWrap);
    const setProgress=(pct)=>{ barWrap.style.display='block'; bar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>barWrap.style.display='none',300); };

    // format buttons present in your card
    const formatsRow = $('#format-row') || previewCard;
    const formatBtns = Array.from(formatsRow.querySelectorAll('button,a')).filter(b=>{
      const t=(b.textContent||'').trim().toUpperCase(); return t==='DST'||t==='EXP'||t==='PES'||t==='JEF';
    });
    const setFormatsVisible = (v)=> formatBtns.forEach(b=> b.style.display = v?'inline-block':'none');
    setFormatsVisible(false);

    // ----- Draw & Trace tools -----
    const drawToolbar = $('#draw-toolbar') || drawCard;
    const btnProcDraw = uiBtn('Process Drawing'); btnProcDraw.style.marginTop='8px';
    drawToolbar.appendChild(btnProcDraw);
    drawCanvas.style.touchAction='none';
    let drawing=false, pid=null;
    on(drawCanvas,'pointerdown',e=>{
      const r=drawCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      drawCanvas.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle='#111827'; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
    });
    on(drawCanvas,'pointermove',e=>{
      if(!drawing || e.pointerId!==pid) return; e.preventDefault();
      const r=drawCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=(e)=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{drawCanvas.releasePointerCapture(e.pointerId);}catch(_){}} };
    on(drawCanvas,'pointerup',stopDraw); on(drawCanvas,'pointercancel',stopDraw);

    // ----- state -----
    const STATE = {
      image: null,               // ImageData at source resolution
      imgFit: null,              // mapping into preview canvas
      stitches: [],              // preview path (after processing)
      subject: { enabled:false, rect:null, noSubject:false }
    };

    on(btnHighlight,'click',()=>{
      STATE.subject.enabled=!STATE.subject.enabled;
      if(!STATE.subject.enabled) STATE.subject.rect=null;
      btnHighlight.classList.toggle('active', STATE.subject.enabled);
      drawSubjectBox();
    });
    on(chkNo,'change',()=>{ STATE.subject.noSubject = chkNo.checked; });

    // subject rectangle on preview
    let dragging=false, start=null;
    on(previewCanvas,'pointerdown',e=>{
      if(!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); start=[e.clientX-r.left, e.clientY-r.top];
      dragging=true; STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; drawSubjectBox();
    });
    on(previewCanvas,'pointermove',e=>{
      if(!dragging||!STATE.subject.enabled) return;
      const r=previewCanvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])}; drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    // process actions
    on(btnProcess,'click', processPhotoFlow);
    on(btnProcDraw,'click', processDrawingFlow);

    // ============================================================
    // helpers
    function ensurePosition(host){
      const cs=getComputedStyle(host); if(cs.position==='static') host.style.position='relative'; return host;
    }
    function uiBtn(t){ const b=document.createElement('button'); b.className='btn'; b.textContent=t; return b; }
    function makeCanvas(host){
      const c=document.createElement('canvas'); c.style.display='block'; host.appendChild(c); return c;
    }
    function sizeToHost(cnv, host){
      const w=Math.max(320, (host.clientWidth||640)); const h=Math.max(220, Math.round(w*9/16));
      const s=DPR(); cnv.style.width=w+'px'; cnv.style.height=h+'px'; cnv.width=Math.round(w*s); cnv.height=Math.round(h*s);
      cnv.getContext('2d').setTransform(s,0,0,s,0,0);
    }

    async function loadImageFile(file){
      const url=URL.createObjectURL(file);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide=isIOS?1024:1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.image=c.getContext('2d').getImageData(0,0,W,H);

        previewCard.style.display='';
        tools.style.visibility='visible';
        sizeToHost(previewCanvas, previewCard);
        redraw();
        setFormatsVisible(false);
        previewCard.scrollIntoView({behavior:'smooth',block:'center'});
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
      const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; tmp.getContext('2d').putImageData(img,0,0);
      const ctx=previewCanvas.getContext('2d'); ctx.setTransform(DPR(),0,0,DPR(),0,0);
      ctx.clearRect(0,0,Wp,Hp); ctx.fillStyle='#fff'; ctx.fillRect(0,0,Wp,Hp); ctx.drawImage(tmp,ox,oy,w,h);
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

    // ===== processing core (fast, offline) =====
    function kmeansPalette(imgData,k,mask,onProgress){
      const W=imgData.width,H=imgData.height,d=imgData.data;
      const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
      const pts=[];
      for(let y=0;y<H;y+=step){
        const row=y*W;
        for(let x=0;x<W;x+=step){
          const i=row+x; if(mask&& !mask[i]) continue;
          const j=i*4; pts.push([d[j],d[j+1],d[j+2]]);
        }
      }
      const K=Math.min(k,Math.max(1,pts.length));
      const centers=[pts[Math.floor(Math.random()*pts.length)]];
      while(centers.length<K){
        let best=null,bd=-1;
        for(const p of pts){
          let dd=1e9; for(const c of centers){ const t=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(t<dd) dd=t; }
          if(dd>bd){ bd=dd; best=p;}
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
      const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
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

    // ===== flows =====
    async function processPhotoFlow(){
      if(!STATE.image){ (dropZone.querySelector('input[type=file]')||fileInput).click(); return; }
      setFormatsVisible(false); setProgress(1);

      // optional subject mask from rectangle
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

      const dstU8 = writeDST(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      const expU8 = writeEXP(ops, {pxPerMm:2, outW:previewCanvas.width/DPR(), outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8,expU8});
      setFormatsVisible(true);
    }

    async function processDrawingFlow(){
      setFormatsVisible(false); setProgress(1);
      const w=drawCanvas.width, h=drawCanvas.height, sctx=drawCanvas.getContext('2d');
      const id=sctx.getImageData(0,0,w,h);
      previewCard.style.display='';
      STATE.image=id; sizeToHost(previewCanvas, previewCard); redraw();

      // treat alpha as mask → plan quick stitches
      const mask=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){ mask[i] = id.data[i*4+3] > 10 ? 1 : 0; }
      const q={indexed:mask, palette:[[0,0,0],[255,255,255]], W:w, H:h};
      const ops=planStitches(q, {outline:true, angle:45});
      STATE.stitches = toPreviewPath(ops);
      redraw(); setProgress(100);

      const dstU8=writeDST(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      const expU8=writeEXP(ops,{pxPerMm:2,outW:previewCanvas.width/DPR(),outH:previewCanvas.height/DPR()});
      hookDownloads({dstU8,expU8}); setFormatsVisible(true);
      previewCard.scrollIntoView({behavior:'smooth',block:'center'});
    }

    function toPreviewPath(ops){
      const fit=STATE.imgFit || {ox:0,oy:0,scale:1};
      return ops.map(op=>{
        const x = op.x*fit.scale + fit.ox;
        const y = op.y*fit.scale + fit.oy;
        return (op.cmd==='jump') ? {move:true,x,y} : {move:false,x,y};
      });
    }
    function hookDownloads(res){
      formatBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>saveU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
        else if(fmt==='EXP'){ btn.onclick=()=>saveU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
        else { btn.onclick=()=>alert('Coming soon'); } // PES/JEF
      });
    }
    function saveU8(u8,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }

    // keep formats hidden until ready
    function setFormatsVisible(v){ formatBtns.forEach(b=> b.style.display=v?'inline-block':'none'); }

    // expose for debugging
    window.__loomabelle = { processPhotoFlow, processDrawingFlow };
  }
})();