/* Loomabelle UI glue (v1) – no deps */
(function(){
  'use strict';
  const $ = (sel, el=document)=>el.querySelector(sel);
  const $$ = (sel, el=document)=>Array.from(el.querySelectorAll(sel));

  const yearEl = $('#year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Tabs
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>activateTab(btn.dataset.tab));
  });
  $$('[data-open-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>activateTab(btn.getAttribute('data-open-tab')));
  });
  function activateTab(name){
    $$('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    $$('.panel').forEach(p=>p.classList.toggle('active', p.dataset.panel===name));
  }

  const fileInput = $('#fileInput');
  const previewHost = $('#previewHost');
  const previewCanvas = $('#previewCanvas');
  const btnProcess = $('#btnProcess');
  const btnHighlight = $('#btnHighlight');
  const optNoSubject = $('#optNoSubject');
  const optReduce = $('#optReduce');
  const optOutline = $('#optOutline');
  const optDensity = $('#optDensity');

  // Draw tab
  const drawHost = $('#drawHost');
  const drawCanvas = $('#drawCanvas');
  const toolPen = $('#toolPen');
  const toolEraser = $('#toolEraser');
  const toolClear = $('#toolClear');
  const toolProcessSel = $('#toolProcessSelection');

  let currentBitmap = null;
  let originalBitmap = null;
  let drawnMask = null; // Uint8Array at image resolution
  let drawPainting=false, drawErase=false, brush=18, lx=0, ly=0;

  // Resize helper: fit canvas backing store to host size while keeping aspect ratio stable
  function fitCanvasToHost(cnv, host){
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(180, Math.floor(rect.height));
    if (cnv.width!==w || cnv.height!==h){ cnv.width=w; cnv.height=h; }
  }

  function ensureMaskSize(w,h){
    if (!drawnMask || drawnMask.length !== w*h) drawnMask = new Uint8Array(w*h);
  }

  function imageToCanvasSpace(e, cnv){
    const r = cnv.getBoundingClientRect();
    const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches? e.touches[0].clientY : e.clientY) - r.top;
    const sx = x * (cnv.width / r.width);
    const sy = y * (cnv.height / r.height);
    return {x:sx, y:sy};
  }

  // Paint on drawCanvas (at preview scale, we later scale to image mask)
  function setupDrawing(){
    const c = drawCanvas.getContext('2d');
    function start(ev){ if(!originalBitmap) return; drawPainting=true; drawErase = (ev.target===toolEraser); const p=imageToCanvasSpace(ev, drawCanvas); lx=p.x; ly=p.y; strokeTo(p.x,p.y); ev.preventDefault(); }
    function move (ev){ if(!drawPainting) return; const p=imageToCanvasSpace(ev, drawCanvas); stroke(lx,ly,p.x,p.y); lx=p.x; ly=p.y; ev.preventDefault(); }
    function end (){ drawPainting=false; }
    function strokeTo(x,y){ c.save(); c.globalCompositeOperation = drawErase?'destination-out':'source-over'; c.fillStyle='#0f172a'; c.beginPath(); c.arc(x,y,brush/2,0,Math.PI*2); c.fill(); c.restore(); }
    function stroke(x0,y0,x1,y1){ c.save(); c.globalCompositeOperation = drawErase?'destination-out':'source-over'; c.strokeStyle='#0f172a'; c.lineWidth=brush; c.lineCap='round'; c.beginPath(); c.moveTo(x0,y0); c.lineTo(x1,y1); c.stroke(); c.restore(); }
    drawCanvas.addEventListener('mousedown',start); window.addEventListener('mouseup',end); drawCanvas.addEventListener('mousemove',move);
    drawCanvas.addEventListener('touchstart',start,{passive:false}); window.addEventListener('touchend',end); drawCanvas.addEventListener('touchmove',move,{passive:false});
    toolPen.addEventListener('click',()=>{ drawErase=false; });
    toolEraser.addEventListener('click',()=>{ drawErase=true; });
    toolClear.addEventListener('click',()=>{ c.clearRect(0,0,drawCanvas.width,drawCanvas.height); if(drawnMask) drawnMask.fill(0); });
    toolProcessSel.addEventListener('click', processSelection);
  }

  setupDrawing();

  async function refreshPreview(bitmap){
    if (!bitmap) return;
    previewHost.classList.remove('hidden');
    fitCanvasToHost(previewCanvas, previewHost);
    LoomaProcessor.renderPreview(previewCanvas, bitmap);
  }

  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const {bitmap,width,height} = await LoomaProcessor.loadImage(f);
    currentBitmap = bitmap;
    originalBitmap = bitmap;
    drawnMask = new Uint8Array(width*height); // reset
    await refreshPreview(bitmap);
    // mirror into draw tab as faded background
    activateTab('upload');
    pushIntoDraw(bitmap);
  });

  function pushIntoDraw(bitmap){
    fitCanvasToHost(drawCanvas, drawHost);
    const c = drawCanvas.getContext('2d');
    c.clearRect(0,0,drawCanvas.width,drawCanvas.height);
    // show faded image to trace
    const off = document.createElement('canvas');
    off.width = drawCanvas.width; off.height = drawCanvas.height;
    const oc = off.getContext('2d');
    // draw bitmap fitted inside
    const iw=bitmap.width, ih=bitmap.height;
    const scale = Math.min(off.width/iw, off.height/ih);
    const w = Math.floor(iw*scale), h = Math.floor(ih*scale);
    const ox = (off.width - w)>>1, oy = (off.height - h)>>1;
    oc.globalAlpha = 0.25;
    oc.drawImage(bitmap, ox, oy, w, h);
    // paint onto drawCanvas
    c.drawImage(off,0,0);
  }

  // Convert the drawn mask (preview scale) into original image resolution
  function buildHighResMask(){
    if (!originalBitmap) return null;
    const W = originalBitmap.width, H = originalBitmap.height;
    ensureMaskSize(W,H);
    drawnMask.fill(0);
    // Read from drawCanvas
    const c = drawCanvas.getContext('2d');
    const id = c.getImageData(0,0,drawCanvas.width,drawCanvas.height).data;
    // Map drawCanvas coordinates to image
    const scale = Math.min(drawCanvas.width/W, drawCanvas.height/H);
    const w = Math.floor(W*scale), h = Math.floor(H*scale);
    const ox = (drawCanvas.width - w)>>1, oy = (drawCanvas.height - h)>>1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const sx = ox + x, sy = oy + y;
        const j = (sy*drawCanvas.width + sx)*4 + 3; // alpha channel
        const a = id[j];
        if (a>8){
          // map back to image pixel
          const ix = Math.floor(x/scale);
          const iy = Math.floor(y/scale);
          drawnMask[iy*W + ix] = 1;
        }
      }
    }
    return drawnMask;
  }

  async function doProcessPhoto(mask){
    if (!originalBitmap) return;
    const reduce = !!optReduce.checked;
    const outline = !!optOutline.checked;
    const density = parseFloat(optDensity.value||'0.4');
    const id = await LoomaProcessor.processImage(originalBitmap, {reduce, outline, density, mask});
    // draw onto previewCanvas letterboxed
    const c = previewCanvas.getContext('2d');
    const W = previewCanvas.width, H = previewCanvas.height;
    const iw = id.width, ih = id.height;
    const scale = Math.min(W/iw, H/ih);
    const w = Math.floor(iw*scale), h = Math.floor(ih*scale);
    const ox = (W-w)>>1, oy = (H-h)>>1;
    // blit
    const tmp = document.createElement('canvas'); tmp.width=iw; tmp.height=ih;
    tmp.getContext('2d').putImageData(id,0,0);
    c.fillStyle='#0f172a'; c.fillRect(0,0,W,H);
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, ox, oy, w, h);
  }

  btnProcess.addEventListener('click', async ()=>{
    if (!originalBitmap) return;
    const usedMask = optNoSubject.checked ? null : null;
    await doProcessPhoto(usedMask);
  });

  btnHighlight.addEventListener('click', ()=>{
    if (!originalBitmap) return;
    // switch tab and prep draw canvas
    activateTab('draw');
    pushIntoDraw(originalBitmap);
    window.scrollTo({top: $('#tabs').offsetTop-8, behavior:'smooth'});
  });

  async function processSelection(){
    const mask = buildHighResMask();
    if (!mask) return;
    await doProcessPhoto(mask);
    // switch back to upload tab to show result
    activateTab('upload');
    window.scrollTo({top: $('#tabs').offsetTop-8, behavior:'smooth'});
  }

  // Export buttons -> save preview PNG (placeholder for DST/PES etc.)
  function savePNG(){ if(!previewCanvas) return; LoomaProcessor.exportPNG(previewCanvas, 'loomabelle-preview.png'); }
  $('#btnDST').addEventListener('click', savePNG);
  $('#btnEXP').addEventListener('click', savePNG);
  $('#btnPES').addEventListener('click', savePNG);
  $('#btnJEF').addEventListener('click', savePNG);

  // Initial state
  previewHost.classList.add('hidden');

  // Smooth scroll
  $$('[data-scroll]').forEach(b=>b.addEventListener('click', (e)=>{
    const id=b.getAttribute('data-scroll'); const t=$(id); if(!t) return;
    e.preventDefault(); window.scrollTo({top:t.offsetTop-8, behavior:'smooth'});
  }));
})();
