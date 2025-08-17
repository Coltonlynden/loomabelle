// Preview handling + tab switching + scroll helpers
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const previewHost = $('#previewHost');
  const previewCanvas = $('#previewCanvas');
  const processBtn = $('#btnProcess');
  const pngBtn = $('#btnPng');
  const highlightBtn = $('#btnHighlight');
  const noSubjectChk = $('#noSubject');

  const optPalette = $('#optPalette');
  const optEdge = $('#optEdge');
  const density = $('#density');

  // global-ish state container
  window.Looma = {
    imageBitmap: null,      // original photo
    maskCanvas: null,       // from draw tool
    processedCanvas: null,  // last result
    setMaskFrom(drawCanvas){
      if (!drawCanvas) { this.maskCanvas = null; return; }
      // Clone to same size as preview canvas
      const c = document.createElement('canvas');
      c.width = drawCanvas.width; c.height = drawCanvas.height;
      c.getContext('2d').drawImage(drawCanvas,0,0);
      this.maskCanvas = c;
    }
  };

  // Resize canvas to host size (CSS → backing pixels)
  function fitCanvasToHost(canvas, host){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = host.clientWidth;
    const h = host.clientHeight;
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
    canvas.style.width = w+'px';
    canvas.style.height = h+'px';
    return {w:canvas.width, h:canvas.height, dpr};
  }

  async function drawIntoPreview(bitmapOrCanvas){
    previewHost.classList.remove('hidden');
    const {w,h,dpr} = fitCanvasToHost(previewCanvas, previewHost);
    const ctx = previewCanvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // letterbox fit
    const srcW = bitmapOrCanvas.width;
    const srcH = bitmapOrCanvas.height;
    const scale = Math.min(w/srcW, h/srcH);
    const dw = Math.round(srcW*scale);
    const dh = Math.round(srcH*scale);
    const dx = Math.round((w-dw)/2);
    const dy = Math.round((h-dh)/2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmapOrCanvas, 0,0,srcW,srcH, dx,dy,dw,dh);
  }

  // Buttons
  processBtn.addEventListener('click', async ()=>{
    if (!window.Looma.imageBitmap) return;
    processBtn.disabled = true;
    try{
      const useMask = !noSubjectChk.checked && window.Looma.maskCanvas;
      const maskBitmap = useMask ? await createImageBitmap(window.Looma.maskCanvas) : null;
      const out = await window.LoomaProcessing.process(
        window.Looma.imageBitmap,
        { palette: optPalette.checked, edge: optEdge.checked, density: +density.value, maskBitmap }
      );
      window.Looma.processedCanvas = out;
      await drawIntoPreview(out);
    }finally{
      processBtn.disabled = false;
    }
  });

  pngBtn.addEventListener('click', ()=>{
    const src = window.Looma.processedCanvas || previewCanvas;
    window.LoomaProcessing.savePNG(src, 'loomabelle.png');
  });

  // Highlight Subject → jump to drawing tab and overlay the photo as guide
  highlightBtn.addEventListener('click', ()=>{
    $('#tabDraw').click();
    window.dispatchEvent(new CustomEvent('loom:draw:showGuide'));
  });

  // Expose helpers for other modules
  window.addEventListener('loom:preview:showOriginal', async ()=>{
    if (window.Looma.imageBitmap) await drawIntoPreview(window.Looma.imageBitmap);
  });

  window.addEventListener('loom:preview:showProcessed', async ()=>{
    if (window.Looma.processedCanvas) await drawIntoPreview(window.Looma.processedCanvas);
  });

  // Tabs
  function activate(panel){
    $$('.panel').forEach(p=>p.classList.remove('active'));
    $(`.panel[data-panel="${panel}"]`).classList.add('active');
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    (panel==='upload' ? $('#tabUpload') : $('#tabDraw')).classList.add('active');
  }
  $('#tabUpload').addEventListener('click', ()=>activate('upload'));
  $('#tabDraw').addEventListener('click', ()=>activate('draw'));

  // Smooth scroll helpers
  $$('[data-scroll]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sel = btn.getAttribute('data-scroll');
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  // Year
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  // public for upload module
  window.LoomaPreview = { drawIntoPreview, fitCanvasToHost, previewHost, previewCanvas };
})();