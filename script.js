/* Loomabelle — script.js v13
 * Robust glue that does NOT change your layout.
 * - Binds by heading text (“Upload a photo”, “Preview (stitched)”, “Draw & Trace”)
 * - Uses event delegation so clicks work even if markup shifts
 * - Creates hidden file input if the upload card is a mockup
 * - Hides Preview card until a photo exists
 * - Instant image preview, optional subject box, progress bar
 * - Draw tab: pen by default, long strokes, no page scroll
 * - Calls window.Looma.processPhoto / processDrawing from js/processor.js
 */

(function(){
  const READY = (fn)=> (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn());
  READY(init);

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $$(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||{passive:false});
  const dpr = ()=> window.devicePixelRatio || 1;
  const warn = (...a)=> console.warn('[Loomabelle]', ...a);

  // -------- helpers: locate cards by heading text --------
  function findCardByHeading(text){
    const els = $$('h1,h2,h3,h4,h5,h6');
    for(const h of els){
      if((h.textContent||'').trim().toLowerCase().includes(text)){
        // prefer the nearest “card” container, else the heading’s parent
        const card = h.closest('.card') || h.parentElement;
        if(card) return card;
      }
    }
    return null;
  }

  function init(){
    if(!window.Looma){ console.error('processor.js not loaded. Ensure <script src="js/processor.js" defer></script> is BEFORE this file.'); return; }

    // ---- find main areas (by heading text) ----
    const uploadCard  = findCardByHeading('upload a photo');
    const previewCard = findCardByHeading('preview (stitched)') || findCardByHeading('preview');
    const drawCard    = findCardByHeading('draw & trace') || findCardByHeading('draw');

    if(!uploadCard || !previewCard || !drawCard){
      console.error('Could not locate one of the main cards by heading text.');
      warn('Found?', {uploadCard:!!uploadCard, previewCard:!!previewCard, drawCard:!!drawCard});
      return;
    }

    // Hide preview card until an image exists
    previewCard.style.display = 'none';

    // ---- canvases ----
    const prev = document.createElement('canvas');
    const pctx = prev.getContext('2d', {willReadFrequently:true});
    const draw = document.createElement('canvas');
    const dctx = draw.getContext('2d', {willReadFrequently:true});
    dctx.lineCap='round'; dctx.lineJoin='round';

    // mount canvases into the content area of each card
    const previewHost = previewCard.querySelector('canvas, .preview, .content') || previewCard;
    const drawHost    = drawCard.querySelector('canvas, .canvas, .content') || drawCard;
    previewHost.innerHTML = ''; previewHost.appendChild(prev);
    drawHost.innerHTML    = ''; drawHost.appendChild(draw);

    // progress bar (in preview)
    if(getComputedStyle(previewHost).position==='static'){ previewHost.style.position='relative'; }
    const progWrap=document.createElement('div');
    progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
    const progBar=document.createElement('div'); progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.75';
    progWrap.appendChild(progBar); previewHost.appendChild(progWrap);
    const setProgress=(pct)=>{ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>progWrap.style.display='none',400); };

    // size canvases to their hosts
    function sizeCanvasToHost(canvas, host){
      const cw=Math.max(320, host.clientWidth||640);
      const ch=Math.max(220, Math.floor(cw*9/16));
      const s=dpr();
      canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
      canvas.width=Math.round(cw*s); canvas.height=Math.round(ch*s);
      canvas.getContext('2d').setTransform(s,0,0,s,0,0);
    }
    function resizeAll(){ sizeCanvasToHost(prev, previewHost); sizeCanvasToHost(draw, drawHost); }
    try{ new ResizeObserver(resizeAll).observe(previewHost); new ResizeObserver(resizeAll).observe(drawHost); }
    catch(_){ on(window,'resize',resizeAll); }
    resizeAll();

    // ---- upload zone (create hidden input if missing) ----
    const dropZone = uploadCard.querySelector('.upload-zone') || uploadCard;
    let fileInput = dropZone.querySelector('input[type=file]');
    if(!fileInput){
      fileInput = document.createElement('input');
      fileInput.type='file';
      fileInput.accept='image/*,.heic,.heif';
      fileInput.style.position='absolute';
      fileInput.style.opacity='0';
      fileInput.style.pointerEvents='none';
      dropZone.appendChild(fileInput);
    }
    fileInput.removeAttribute('disabled');

    // show preview controls inside preview card
    const tb=document.createElement('div'); tb.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
    const btnProcess=document.createElement('button'); btnProcess.className='btn'; btnProcess.textContent='Process Photo';
    const btnHighlight=document.createElement('button'); btnHighlight.className='btn'; btnHighlight.textContent='Highlight Subject';
    const lblNo=document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox'; lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
    tb.appendChild(btnProcess); tb.appendChild(btnHighlight); tb.appendChild(lblNo); previewHost.appendChild(tb);

    // hide format buttons until processed
    const formatBtns = Array.from(previewCard.querySelectorAll('button, a')).filter(b=>{
      const t=(b.textContent||'').trim().toUpperCase();
      return t==='DST'||t==='EXP'||t==='PES'||t==='JEF';
    });
    const setFormatsVisible=(v)=> formatBtns.forEach(b=> b.style.display = v?'inline-block':'none');
    setFormatsVisible(false);

    // -------- state --------
    const STATE={
      active:'#111827',
      lastImage:null,      // ImageData at image resolution
      imgFit:null,         // {ox,oy,scale,iw,ih} mapping to preview
      subject:{enabled:false,rect:null,noSubject:false},
      stitches:[]
    };

    // ---------- simple tab switching by button text (delegated) ----------
    on(document,'click', (e)=>{
      const t=(e.target.closest('button,a')?.textContent||'').toLowerCase();
      if(!t) return;
      if(t.includes('start with a photo') || t.includes('upload photo')){
        // show upload/preview row (no DOM changes needed for your layout)
        e.preventDefault();
        uploadCard.scrollIntoView({behavior:'smooth', block:'center'});
      }
      if(t.includes('open the drawing tab') || t.includes('draw & trace')){
        e.preventDefault();
        drawCard.scrollIntoView({behavior:'smooth', block:'center'});
      }
    });

    // ---------- Upload handlers ----------
    on(dropZone,'dragover',(e)=>e.preventDefault());
    on(dropZone,'drop',(e)=>{ e.preventDefault(); const f=e.dataTransfer.files && e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(dropZone,'click',(e)=>{ if(e.target.closest('a,button')) return; fileInput.click(); });
    on(fileInput,'change',()=>{ const f=fileInput.files && fileInput.files[0]; if(f) loadImage(f); });

    async function loadImage(file){
      let chosen=file;
      const name=(file.name||'').toLowerCase();
      const type=(file.type||'').toLowerCase();
      if((type.includes('heic')||type.includes('heif')||name.endsWith('.heic')||name.endsWith('.heif')) && window.Looma?.heicToJpeg){
        try{ chosen = await window.Looma.heicToJpeg(file); }catch(_){}
      }
      const url=URL.createObjectURL(chosen);
      try{
        const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
        const isIOS=/\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
        const maxSide=isIOS?1024:1600;
        let W=img.naturalWidth, H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
        STATE.lastImage=c.getContext('2d').getImageData(0,0,W,H);

        // show preview card and paint image
        previewCard.style.display='';
        tb.style.visibility='visible';
        renderBaseImage();
        setFormatsVisible(false);
        // bring into view
        previewCard.scrollIntoView({behavior:'smooth', block:'center'});
      }finally{ URL.revokeObjectURL(url); }
    }

    // ---------- Subject rectangle ----------
    let dragging=false, startPt=null;
    on(btnHighlight,'click',()=>{ STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; btnHighlight.classList.toggle('active',STATE.subject.enabled); drawSubjectBox(); });
    on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

    on(prev,'pointerdown',(e)=>{
      if(!STATE.subject.enabled) return;
      const r=prev.getBoundingClientRect(); startPt=[e.clientX-r.left,e.clientY-r.top]; dragging=true;
      STATE.subject.rect={x:startPt[0],y:startPt[1],w:0,h:0}; drawSubjectBox();
    });
    on(prev,'pointermove',(e)=>{
      if(!dragging || !STATE.subject.enabled) return;
      const r=prev.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect={x:Math.min(startPt[0],x),y:Math.min(startPt[1],y),w:Math.abs(x-startPt[0]),h:Math.abs(y-startPt[1])}; drawSubjectBox();
    });
    on(window,'pointerup',()=>{ dragging=false; });

    function drawSubjectBox(){
      if(!STATE.lastImage) return;
      renderBaseImage();
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect;
        pctx.save(); pctx.setLineDash([6,6]); pctx.strokeStyle='rgba(20,20,20,.95)'; pctx.lineWidth=1.2; pctx.strokeRect(r.x,r.y,r.w,r.h); pctx.restore();
      }
      drawStitches();
    }

    // ---------- Draw canvas tools (pen default) ----------
    draw.style.touchAction='none'; // lock page scrolling while drawing on touch
    let tool='pen', drawing=false, pid=null;

    // default pen
    tool='pen';

    on(draw,'pointerdown',(e)=>{
      const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      draw.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
      dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
    });
    on(draw,'pointermove',(e)=>{
      if(!drawing || e.pointerId!==pid) return; e.preventDefault();
      const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
      dctx.lineTo(x,y); dctx.stroke();
    });
    const stopDraw=(e)=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{draw.releasePointerCapture(e.pointerId);}catch(_){}}};
    on(draw,'pointerup',stopDraw); on(draw,'pointercancel',stopDraw);

    // Add “Process Drawing” button next to whatever draw toolbar you have
    const drawToolbar = drawCard.querySelector('.toolbar') || drawCard;
    const btnProcDraw=document.createElement('button'); btnProcDraw.className='btn'; btnProcDraw.style.marginLeft='10px'; btnProcDraw.textContent='Process Drawing';
    drawToolbar.appendChild(btnProcDraw);

    // ---------- Render helpers ----------
    function renderBaseImage(){
      const imgData=STATE.lastImage; if(!imgData) return;
      const Wp=prev.width/dpr(), Hp=prev.height/dpr();
      const W=imgData.width, H=imgData.height;
      const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      pctx.setTransform(dpr(),0,0,dpr(),0,0);
      pctx.clearRect(0,0,Wp,Hp); pctx.fillStyle='#fff'; pctx.fillRect(0,0,Wp,Hp);
      const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; tmp.getContext('2d').putImageData(imgData,0,0);
      pctx.drawImage(tmp,ox,oy,w,h);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
    }
    function drawStitches(){
      if(!STATE.stitches.length) return;
      pctx.save(); pctx.strokeStyle=STATE.active; pctx.lineWidth=1.6; pctx.beginPath();
      let started=false;
      for(const s of STATE.stitches){
        if(s.move){ pctx.moveTo(s.x,s.y); started=true; }
        else if(started){ pctx.lineTo(s.x,s.y); }
      }
      pctx.stroke(); pctx.restore();
    }

    // ---------- Process Photo ----------
    on(btnProcess,'click', async ()=>{
      if(!STATE.lastImage){ fileInput?.click(); return; }
      setFormatsVisible(false); setProgress(1);

      // build mask from subject rect (image-space)
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

      const res = await window.Looma.processPhoto(
        STATE.lastImage,
        { k:6, autoColors:true, outline:true, angle:45, density:0.40, pxPerMm:2, outW:prev.width/dpr(), outH:prev.height/dpr(), mask },
        (p)=>setProgress(Math.max(1,Math.min(99,p)))
      );

      STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
      renderBaseImage(); drawStitches();
      setProgress(100); setFormatsVisible(true);
      enableDownloads(res);
    });

    // ---------- Process Drawing ----------
    on(btnProcDraw,'click', async ()=>{
      setFormatsVisible(false); setProgress(1);
      const max=1024, w=draw.width, h=draw.height, s=Math.min(1, max/Math.max(w,h));
      const c=document.createElement('canvas'); c.width=(w*s)|0; c.height=(h*s)|0;
      c.getContext('2d').drawImage(draw,0,0,c.width,c.height);
      const id=c.getContext('2d').getImageData(0,0,c.width,c.height);

      const res = await window.Looma.processDrawing(id, {pxPerMm:2}, p=>setProgress(Math.max(1,Math.min(99,p))));
      previewCard.style.display='';
      STATE.lastImage=id; renderBaseImage();
      STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
      drawStitches(); setProgress(100); setFormatsVisible(true);
      previewCard.scrollIntoView({behavior:'smooth', block:'center'});
      enableDownloads(res);
    });

    function enableDownloads(res){
      formatBtns.forEach(btn=>{
        const fmt=(btn.textContent||'').trim().toUpperCase();
        if(fmt==='DST'){ btn.onclick=()=>downloadU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
        else if(fmt==='EXP'){ btn.onclick=()=>downloadU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
        // PES/JEF can be wired to an AI endpoint later.
      });
    }
    function downloadU8(u8, name){
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1200);
    }
  }
})();
