/* Loomabelle — script.js v12
   - Works with existing design/markup (no visual changes)
   - Upload card mockup is auto-wired (creates hidden <input type="file"> if missing)
   - Preview card stays fully hidden until a photo is chosen
   - Progress bar, subject highlight / no-subject in preview
   - Draw tab: default pen, long strokes, page doesn’t scroll while drawing
   - Calls Looma.processPhoto / Looma.processDrawing from js/processor.js
*/
(function(){
  const $=(s,el)=> (el||document).querySelector(s);
  const $$=(s,el)=> Array.prototype.slice.call((el||document).querySelectorAll(s));
  const on=(el,ev,fn,opts)=> el&&el.addEventListener(ev,fn,opts||{passive:false});
  const dpr=()=>window.devicePixelRatio||1;

  // -------- basic guards --------
  if(!window.Looma){ console.error('processor.js not loaded. Make sure <script src="js/processor.js" defer></script> comes BEFORE <script src="script.js" defer></script>.'); }

  // hide any “mockup only” labels
  $$('.text-muted,.muted,.note,small,.badge').forEach(el=>{
    if((el.textContent||'').toLowerCase().includes('mockup')) el.style.display='none';
  });

  // ------- find panels (keep your layout) -------
  const uploadPanel = $('.panel[data-panel="upload"]') || document.body; // container of upload/preview row
  const previewCard = uploadPanel.querySelector('.col.card.rose') || $('.col.card.rose'); // right card
  const previewHost = previewCard ? (previewCard.querySelector('.preview') || previewCard) : null;

  const drawPanel = $('.panel[data-panel="draw"]') || document.body;
  const drawHost = drawPanel.querySelector('.canvas') || $('.canvas');

  if(!previewHost || !drawHost){ console.error('Missing preview or draw host'); return; }

  // Entire preview card remains hidden until an image is chosen
  previewCard.style.display = 'none';

  // ------- canvases -------
  const prev=document.createElement('canvas');
  const pctx=prev.getContext('2d',{willReadFrequently:true});
  const draw=document.createElement('canvas');
  const dctx=draw.getContext('2d',{willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';

  // mount canvases
  previewHost.innerHTML=''; previewHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);

  // progress bar (inside preview card)
  const progWrap=document.createElement('div');
  progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
  const progBar=document.createElement('div');
  progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.7';
  progWrap.appendChild(progBar);
  if(getComputedStyle(previewHost).position==='static'){ previewHost.style.position='relative'; }
  previewHost.appendChild(progWrap);
  const setProgress=(pct)=>{ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>progWrap.style.display='none',400); };

  // sizing
  function sizeCanvasToHost(canvas, host){
    const cw=Math.max(320, host.clientWidth||640);
    const ch=Math.max(220, Math.floor(cw*9/16));
    const scale=dpr();
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width=Math.round(cw*scale); canvas.height=Math.round(ch*scale);
    canvas.getContext('2d').setTransform(scale,0,0,scale,0,0);
  }
  function resizeAll(){ sizeCanvasToHost(prev,previewHost); sizeCanvasToHost(draw,drawHost); }
  try{ new ResizeObserver(resizeAll).observe(previewHost); new ResizeObserver(resizeAll).observe(drawHost); }catch(_){ window.addEventListener('resize', resizeAll); }
  resizeAll();

  // -------- state --------
  const STATE={active:'#111827', subject:{enabled:false,rect:null,noSubject:false}, lastImage:null, imgFit:null, stitches:[]};

  // -------- upload zone: wire mockup card --------
  const uploadCard = uploadPanel.querySelector('.col.card.blue') || $('.col.card.blue');
  const dropZone = uploadCard ? (uploadCard.querySelector('.upload-zone') || uploadCard) : document.body;

  // ensure a hidden input exists even if mockup omitted it
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

  on(dropZone,'click',e=>{
    // Only trigger if the user clicked the inner area, not links/buttons
    if(e.target.closest('button,a')) return;
    fileInput.click();
  });
  on(dropZone,'dragover',e=>e.preventDefault());
  on(dropZone,'drop',e=>{
    e.preventDefault();
    const f=e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) loadImage(f);
  });
  on(fileInput,'change',()=>{ const f=fileInput.files && fileInput.files[0]; if(f) loadImage(f); });

  // -------- toolbar inside preview (Process / Highlight / No subject) --------
  const tb=document.createElement('div'); tb.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
  const btnProcess=document.createElement('button'); btnProcess.className='btn'; btnProcess.textContent='Process Photo';
  const btnHighlight=document.createElement('button'); btnHighlight.className='btn'; btnHighlight.textContent='Highlight Subject';
  const lblNo=document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox'; lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
  tb.appendChild(btnProcess); tb.appendChild(btnHighlight); tb.appendChild(lblNo); previewHost.appendChild(tb);
  on(btnHighlight,'click',()=>{ STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; btnHighlight.classList.toggle('active',STATE.subject.enabled); drawSubjectBox(); });
  on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

  // subject box draw/drag
  let dragging=false, startPt=null;
  on(prev,'pointerdown',e=>{
    if(!STATE.subject.enabled) return;
    const r=prev.getBoundingClientRect(); startPt=[e.clientX-r.left,e.clientY-r.top]; dragging=true; STATE.subject.rect={x:startPt[0],y=startPt[1],w:0,h:0}; drawSubjectBox();
  });
  on(prev,'pointermove',e=>{
    if(!dragging||!STATE.subject.enabled) return;
    const r=prev.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
    STATE.subject.rect={x:Math.min(startPt[0],x),y:Math.min(startPt[1],y),w:Math.abs(x-startPt[0]),h:Math.abs(y-startPt[1])}; drawSubjectBox();
  });
  on(window,'pointerup',()=>{ dragging=false; });

  function drawSubjectBox(){
    if(!STATE.lastImage){ return; }
    renderBaseImage();
    if(STATE.subject.enabled && STATE.subject.rect){
      const r=STATE.subject.rect;
      pctx.save(); pctx.setLineDash([6,6]); pctx.strokeStyle='rgba(20,20,20,.95)'; pctx.lineWidth=1.2; pctx.strokeRect(r.x,r.y,r.w,r.h); pctx.restore();
    }
    drawStitches();
  }

  // -------- draw tools (defaults) --------
  draw.style.touchAction='none'; // prevent page scroll while drawing
  let tool='pen', drawing=false, pid=null;
  const toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
  const toolMap=['pen','eraser','fill','fabric','guides','undo'];
  toolBtns.forEach((b,i)=>{
    const t=toolMap[i]||'pen'; b.dataset.tool=t; b.removeAttribute('disabled');
    on(b,'click',()=>{
      if(t==='undo'){ dctx.clearRect(0,0,draw.width,draw.height); return; }
      if(t==='guides'){ // just toggle background dots via class if you have one; here we simply ignore
        return;
      }
      if(t==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return; }
      tool=t;
    });
  });
  tool='pen';

  on(draw,'pointerdown',e=>{
    const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    draw.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
    if(tool==='fill'){ floodFill(dctx,x|0,y|0,STATE.active); return; }
    dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
  });
  on(draw,'pointermove',e=>{
    if(!drawing || e.pointerId!==pid) return; e.preventDefault();
    const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(tool==='pen'){ dctx.lineTo(x,y); dctx.stroke(); }
    else if(tool==='eraser'){ dctx.clearRect(x-6,y-6,12,12); }
  });
  const stopDraw=e=>{ if(e.pointerId===pid){ drawing=false; pid=null; try{draw.releasePointerCapture(e.pointerId);}catch(_){}}};
  on(draw,'pointerup',stopDraw); on(draw,'pointercancel',stopDraw);

  function floodFill(ctx,x,y,hex){
    const toRGB=(h)=>{h=String(h||'').replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255];};
    const [r,g,b]=toRGB(hex);
    const w=ctx.canvas.width,h=ctx.canvas.height;
    const id=ctx.getImageData(0,0,w,h), d=id.data;
    const idx=(a,b)=>(b*w+a)*4;
    const t=[d[idx(x,y)], d[idx(x,y)+1], d[idx(x,y)+2], d[idx(x,y)+3]];
    const q=[[x,y]], seen=new Uint8Array(w*h);
    while(q.length){
      const [cx,cy]=q.pop(); if(cx<0||cy<0||cx>=w||cy>=h) continue;
      const i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
      if(d[i]!==t[0]||d[i+1]!==t[1]||d[i+2]!==t[2]||d[i+3]!==t[3]) continue;
      d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
      q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(id,0,0);
  }

  // -------- tab switching helpers (use your existing buttons text) --------
  function switchTo(tabName){
    const target=$('.tab-btn[data-tab="'+tabName+'"]'); if(!target) return;
    const tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(b=>b.classList.toggle('active', b===target));
    panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===tabName));
    requestAnimationFrame(resizeAll);
  }
  $$('a,button').forEach(el=>{
    const t=(el.textContent||'').toLowerCase();
    if(t.includes('start with a photo') || t.includes('upload photo')){
      on(el,'click',e=>{ e.preventDefault(); switchTo('upload'); });
    }
    if(/open.*draw|open.*drawing|draw & trace/.test(t)){
      on(el,'click',e=>{ e.preventDefault(); switchTo('draw'); });
    }
  });

  // -------- image loading + instant preview --------
  async function loadImage(file){
    // heic → jpeg if needed via Looma.heicToJpeg
    let chosen=file;
    const name=(file.name||'').toLowerCase();
    const type=(file.type||'').toLowerCase();
    if((type.includes('heic')||type.includes('heif')||name.endsWith('.heic')||name.endsWith('.heif')) && window.Looma?.heicToJpeg){
      try{ chosen = await window.Looma.heicToJpeg(file); }catch(_){}
    }
    const url=URL.createObjectURL(chosen);
    try{
      const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
      // downscale for speed
      const isIOS = /\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'');
      const maxSide = isIOS ? 1024 : 1600;
      let W=img.naturalWidth, H=img.naturalHeight;
      if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
      const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H);
      STATE.lastImage = c.getContext('2d').getImageData(0,0,W,H);
      // show preview card and draw the image
      previewCard.style.display='';
      tb.style.visibility='visible';
      renderBaseImage();
      setFormatsVisible(false);
      switchTo('upload');
    }finally{ URL.revokeObjectURL(url); }
  }

  function renderBaseImage(){
    const imgData = STATE.lastImage; if(!imgData) return;
    const Wp=prev.width/dpr(), Hp=prev.height/dpr();
    const W=imgData.width, H=imgData.height;
    const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
    // paint background then image
    pctx.setTransform(dpr(),0,0,dpr(),0,0);
    pctx.clearRect(0,0,Wp,Hp); pctx.fillStyle='#fff'; pctx.fillRect(0,0,Wp,Hp);
    // draw via temp canvas for speed
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

  // formats hidden until processed
  const formatBtns=$$('.col.card.rose .formats .btn');
  const setFormatsVisible=(v)=> formatBtns.forEach(b=> b.style.display = v?'inline-block':'none');
  setFormatsVisible(false);

  // process photo
  on(btnProcess,'click', async ()=>{
    if(!STATE.lastImage){ const f=fileInput?.files?.[0]; if(f) await loadImage(f); }
    if(!STATE.lastImage) return alert('Choose a photo first.');
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

    const res = await window.Looma.processPhoto(
      STATE.lastImage,
      { k:6, autoColors:true, outline:true, angle:45, density:0.40, pxPerMm:2, outW:prev.width/dpr(), outH:prev.height/dpr(), mask },
      p=>setProgress(Math.max(1,Math.min(99,p)))
    );

    // convert ops to preview-able polylines
    STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
    renderBaseImage(); drawStitches();
    setProgress(100); setFormatsVisible(true);

    // enable downloads (DST/EXP)
    hookDownloads(res);
  });

  // add "Process Drawing" in draw toolbar
  (function addProcessDrawing(){
    const row=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    const btn=document.createElement('button'); btn.className='btn'; btn.style.marginLeft='10px'; btn.textContent='Process Drawing';
    row && row.appendChild(btn);
    on(btn,'click', async ()=>{
      setFormatsVisible(false); setProgress(1);
      // downscale for speed
      const max=1024, w=draw.width, h=draw.height, s=Math.min(1, max/Math.max(w,h));
      const c=document.createElement('canvas'); c.width=(w*s)|0; c.height=(h*s)|0;
      c.getContext('2d').drawImage(draw,0,0,c.width,c.height);
      const id=c.getContext('2d').getImageData(0,0,c.width,c.height);
      const res = await window.Looma.processDrawing(id, {pxPerMm:2}, p=>setProgress(Math.max(1,Math.min(99,p))));
      // visualize in preview card
      previewCard.style.display='';
      STATE.lastImage = id; // so base image exists (blank)
      renderBaseImage();
      STATE.stitches = res.ops.map(op => (op.cmd==='jump') ? {move:true,x:op.x,y:op.y} : {move:false,x:op.x,y:op.y});
      drawStitches();
      setProgress(100); setFormatsVisible(true);
      switchTo('upload'); // show preview
    });
  })();

  // downloads
  function hookDownloads(res){
    formatBtns.forEach(btn=>{
      const fmt=btn.textContent.replace(/\s+/g,'').toUpperCase();
      if(fmt==='DST'){ btn.onclick=()=>downloadU8(res.dstU8,'loomabelle.dst'); btn.style.display='inline-block'; }
      else if(fmt==='EXP'){ btn.onclick=()=>downloadU8(res.expU8,'loomabelle.exp'); btn.style.display='inline-block'; }
      // PES/JEF can be wired to your AI endpoint later if desired
    });
  }
  function downloadU8(u8, name){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  }
})();
