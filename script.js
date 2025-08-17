/* Loomabelle – script.js (v1.6)
   Wires the existing layout without changing visuals.
*/

(() => {
  'use strict';

  const $ = (sel, parent=document) => parent.querySelector(sel);
  const $$ = (sel, parent=document) => Array.from(parent.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  const els = {
    tabBtns: $$('.tab-btn'),
    panels: $$('.panel'),
    uploadPanel: $('[data-panel="upload"]'),
    drawPanel: $('[data-panel="draw"]'),

    file: byId('file'),
    drop: byId('drop'),
    previewHost: byId('previewHost'),
    preview: byId('preview'),

    btnProcess: byId('btnProcess'),
    btnHighlight: byId('btnHighlight'),
    chkNoSubject: byId('chkNoSubject'),

    optPalette: byId('optPalette'),
    optOutline: byId('optOutline'),
    optDensity: byId('optDensity'),

    dlDST: byId('dlDST'),
    dlEXP: byId('dlEXP'),
    dlPES: byId('dlPES'),
    dlJEF: byId('dlJEF'),

    drawHost: byId('drawHost'),
    drawUnder: byId('drawUnder'),
    drawMask: byId('drawMask'),
    toolPen: byId('toolPen'),
    toolErase: byId('toolErase'),
    toolClear: byId('toolClear'),
    toolProcessSel: byId('toolProcessSel'),

    swatches: byId('swatches'),

    year: byId('year')
  };

  if(els.year) els.year.textContent = new Date().getFullYear();

  /* ---------- tabs (no flicker) ---------- */
  function activateTab(name){
    els.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab===name));
    els.panels.forEach(p => p.classList.toggle('active', p.dataset.panel===name));
    // keep sticky header height constant on iOS
    document.querySelector('.topnav').style.transform = 'translateZ(0)';
  }
  els.tabBtns.forEach(btn=>{
    btn.addEventListener('click', ()=> activateTab(btn.dataset.tab));
  });
  // hero CTA quick jump
  $$('[data-scroll="#tabs"]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      if(b.dataset.tab) activateTab(b.dataset.tab);
      document.getElementById('tabs').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  /* ---------- palette chips ---------- */
  const defaultPalette = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#22d3ee','#34d399','#fde047','#fca311','#fb7185','#86efac'];
  function paintSwatches(){
    els.swatches.innerHTML='';
    defaultPalette.forEach(c=>{
      const d=document.createElement('div');
      d.className='chip'; d.style.background=c;
      els.swatches.appendChild(d);
    });
  }
  paintSwatches();

  /* ---------- state ---------- */
  const state = {
    imgCanvas: null,   // source image canvas
    userMask: null,    // Uint8Array (1=subject, 0=bg)
    previewBlob: null,
  };

  /* ---------- file input / drag ---------- */
  function showPreview(on){
    els.previewHost.classList.toggle('hidden', !on);
  }
  showPreview(false);

  els.drop.addEventListener('click', ()=> els.file?.click());
  els.drop.addEventListener('dragover', (e)=>{ e.preventDefault(); els.drop.classList.add('hover'); });
  els.drop.addEventListener('dragleave', ()=> els.drop.classList.remove('hover'));
  els.drop.addEventListener('drop', async (e)=>{
    e.preventDefault(); els.drop.classList.remove('hover');
    const f = e.dataTransfer?.files?.[0]; if(f) await handleFile(f);
  });

  els.file.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    await handleFile(f);
  });

  async function handleFile(file){
    // load and downscale once; keep as canvas in state
    const {canvas:srcCanvas, W, H} = await Looma.loadImage(file);
    state.imgCanvas = document.createElement('canvas'); state.imgCanvas.width=W; state.imgCanvas.height=H;
    ctx2d(state.imgCanvas).drawImage(srcCanvas,0,0);

    // render small photo into preview so user sees something immediately
    const pctx = els.preview.getContext('2d'); 
    pctx.clearRect(0,0,els.preview.width, els.preview.height);
    pctx.drawImage(state.imgCanvas,0,0,els.preview.width, els.preview.height);
    showPreview(true);

    // also mirror it under the draw canvas
    fitDrawCanvases(W,H);
    const uctx = els.drawUnder.getContext('2d');
    uctx.clearRect(0,0,els.drawUnder.width, els.drawUnder.height);
    uctx.drawImage(state.imgCanvas,0,0,els.drawUnder.width, els.drawUnder.height);
    ctx2d(els.drawMask).clearRect(0,0,els.drawMask.width, els.drawMask.height);

    // enable action buttons
    [els.btnProcess, els.btnHighlight].forEach(b=>b.disabled=false);
    [els.dlDST,els.dlEXP,els.dlPES,els.dlJEF].forEach(b=>{ b.disabled=true; b.setAttribute('aria-disabled','true'); });
  }

  /* ---------- processing ---------- */
  function currentOptions(){
    return {
      k: els.optPalette?.checked ? 6 : 10,
      outline: !!els.optOutline?.checked,
      density: parseFloat(els.optDensity?.value || '0.45')
    };
  }

  async function doProcess(usingMask=false){
    if(!state.imgCanvas) return;

    const mask = usingMask ? extractUserMask() : (els.chkNoSubject.checked ? null : null);

    const {canvas} = Looma.rasterToPreview({
      imgCanvas: state.imgCanvas,
      userMask: mask,
      ...currentOptions()
    });

    // paint into the fixed-size preview canvas WITHOUT changing layout
    const pctx = els.preview.getContext('2d');
    pctx.clearRect(0,0,els.preview.width, els.preview.height);
    // letterbox into preview while preserving aspect
    const scale = Math.min(els.preview.width/canvas.width, els.preview.height/canvas.height);
    const w = Math.round(canvas.width*scale), h = Math.round(canvas.height*scale);
    const ox = Math.floor((els.preview.width - w)/2), oy = Math.floor((els.preview.height - h)/2);
    pctx.fillStyle = '#0a0f1d'; pctx.fillRect(0,0,els.preview.width, els.preview.height);
    pctx.drawImage(canvas, ox, oy, w, h);

    // mock downloads enabled
    enableDownloads();
  }

  function enableDownloads(){
    function dl(btn, makeBlob, name){
      btn.disabled=false; btn.removeAttribute('aria-disabled');
      btn.onclick=()=>{
        const blob = makeBlob();
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
      };
    }
    dl(els.dlDST, ()=>Looma.writeDST(), 'loomabelle.dst');
    dl(els.dlEXP, ()=>Looma.writeEXP(), 'loomabelle.exp');
    dl(els.dlPES, ()=>Looma.writePES(), 'loomabelle.pes');
    dl(els.dlJEF, ()=>Looma.writeJEF(), 'loomabelle.jef');
  }

  els.btnProcess.addEventListener('click', ()=> doProcess(false));
  els.btnHighlight.addEventListener('click', ()=>{
    activateTab('draw'); // go to drawing tab with the photo underlay shown
  });

  /* ---------- Draw & Trace (pen/eraser) ---------- */
  let drawing = false, erasing=false, lastX=0, lastY=0;
  const brush = { size: 18, color: '#0a0f1d' }; // dark navy default

  function fitDrawCanvases(W, H){
    // keep draw canvases same pixel ratio as preview canvas for crisp strokes
    const host = els.drawHost.getBoundingClientRect();
    const scale = Math.min(host.width/W, host.height/H);
    const w=Math.max(1, Math.round(W*scale)), h=Math.max(1, Math.round(H*scale));
    [els.drawUnder, els.drawMask].forEach(c=>{ c.width=w; c.height=h; });
  }
  window.addEventListener('resize', ()=>{
    if(state.imgCanvas){ fitDrawCanvases(state.imgCanvas.width, state.imgCanvas.height);
      const uctx = els.drawUnder.getContext('2d');
      uctx.drawImage(state.imgCanvas,0,0,els.drawUnder.width, els.drawUnder.height);
    }
  });

  function pos(ev, cnv){
    const r = cnv.getBoundingClientRect();
    const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
    const y = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
    return { x, y };
  }

  function startDraw(ev){
    if(!state.imgCanvas) return;
    drawing=true; document.body.classList.add('loom-lock');
    const p=pos(ev, els.drawMask); lastX=p.x; lastY=p.y;
    strokeTo(p.x, p.y, true);
    ev.preventDefault();
  }
  function moveDraw(ev){
    if(!drawing) return;
    const p=pos(ev, els.drawMask);
    strokeTo(p.x, p.y, false);
    lastX=p.x; lastY=p.y;
    ev.preventDefault();
  }
  function endDraw(){ drawing=false; document.body.classList.remove('loom-lock'); }

  function strokeTo(x,y,first){
    const c=els.drawMask.getContext('2d');
    c.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    c.lineWidth = brush.size; c.lineCap='round'; c.strokeStyle= brush.color;
    c.beginPath(); c.moveTo(lastX,lastY); c.lineTo(x,y); c.stroke();
    if(first){ c.beginPath(); c.arc(x,y,brush.size/2,0,Math.PI*2); c.fillStyle=brush.color; c.fill(); }
  }

  ['mousedown','touchstart'].forEach(ev=> els.drawMask.addEventListener(ev, startDraw, {passive:false}));
  ['mousemove','touchmove'].forEach(ev=> els.drawMask.addEventListener(ev, moveDraw, {passive:false}));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=> els.drawMask.addEventListener(ev, endDraw));

  els.toolPen.addEventListener('click', ()=>{
    erasing=false; els.toolPen.classList.add('active'); els.toolErase.classList.remove('active');
  });
  els.toolErase.addEventListener('click', ()=>{
    erasing=true; els.toolErase.classList.add('active'); els.toolPen.classList.remove('active');
  });
  els.toolClear.addEventListener('click', ()=>{
    ctx2d(els.drawMask).clearRect(0,0,els.drawMask.width, els.drawMask.height);
  });
  els.toolPen.classList.add('active'); // default tool

  function extractUserMask(){
    if(!state.imgCanvas) return null;
    const W=state.imgCanvas.width, H=state.imgCanvas.height;
    // upscale user strokes mask to original size
    const up = document.createElement('canvas'); up.width=W; up.height=H;
    const uctx = up.getContext('2d'); 
    uctx.imageSmoothingEnabled=false;
    uctx.drawImage(els.drawMask, 0,0,els.drawMask.width,els.drawMask.height, 0,0,W,H);
    const d = uctx.getImageData(0,0,W,H).data;
    const out = new Uint8Array(W*H);
    let count=0;
    for(let i=0;i<W*H;i++){ const a=d[i*4+3]; if(a>10){ out[i]=1; count++; } }
    return count>50 ? out : null;
  }

  els.toolProcessSel.addEventListener('click', ()=>{
    doProcess(true);
    // jump back to preview
    activateTab('upload');
    document.getElementById('tabs').scrollIntoView({behavior:'smooth', block:'start'});
  });

  /* ---------- small utils ---------- */
  function ctx2d(c){ return c.getContext('2d', {willReadFrequently:true}); }

})();