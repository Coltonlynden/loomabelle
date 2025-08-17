/* Global app namespace */
window.LMB = window.LMB || {};

(function(){
  const qs = s => document.querySelector(s);
  const qsa = s => [...document.querySelectorAll(s)];

  // Year
  const yr = qs('#year'); if (yr) yr.textContent = new Date().getFullYear();

  // Smooth scroll + tab jump
  qsa('[data-scroll]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const to = btn.getAttribute('data-scroll');
      const target = document.querySelector(to);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Tabs
  const tabBtns = qsa('.tab-btn');
  const panels = qsa('.panel');
  function switchTab(name){
    tabBtns.forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    panels.forEach(p=>p.classList.toggle('active', p.dataset.panel===name));
  }
  tabBtns.forEach(b=>b.addEventListener('click', ()=>switchTab(b.dataset.tab)));

  // Preview canvas + state
  const previewHost = qs('#preview-host');
  const previewCanvas = qs('#preview-canvas');
  const pctx = previewCanvas.getContext('2d', { willReadFrequently:true });

  const state = {
    imgBitmap: null,
    imgAspect: 16/9,
    options: {
      palette: true,
      edges: true,
      density: 25,
      noSubject: false
    },
    maskPNG: null // dataURL from draw tab (user trace)
  };
  window.LMB.state = state;

  // Controls
  const optPalette = qs('#optPalette');
  const optEdges   = qs('#optEdges');
  const density    = qs('#density');
  const noSubject  = qs('#noSubject');
  [optPalette,optEdges,density,noSubject].forEach(el=>{
    if(!el) return;
    el.addEventListener('input', ()=>{
      state.options.palette  = !!optPalette.checked;
      state.options.edges    = !!optEdges.checked;
      state.options.density  = +density.value|0;
      state.options.noSubject= !!noSubject.checked;
    });
  });

  // Action buttons
  const btnProcess   = qs('#btnProcess');
  const btnHighlight = qs('#btnHighlight');
  if (btnHighlight) btnHighlight.addEventListener('click', ()=>{
    // Jump user to Draw tab to trace, then they hit "Process Selection"
    switchTab('draw');
    document.querySelector('#draw-host').scrollIntoView({behavior:'smooth', block:'start'});
  });

  // Minimal “export” buttons (stub to show UI is wired)
  ['btnDst','btnExp','btnPng'].forEach(id=>{
    const b = qs('#'+id);
    if (b) b.addEventListener('click', ()=>{
      if (!state.lastPNG) return alert('Process a photo first.');
      const a = document.createElement('a');
      a.href = state.lastPNG;
      a.download = id==='btnPng' ? 'preview.png' : (id==='btnDst'?'preview.dst':'preview.exp'); // place-holder
      a.click();
    });
  });

  // Processing worker
  const worker = new Worker('processing.js', { type:'classic' });

  function drawFit(image){
    // Fit image into previewCanvas while preserving aspect
    const { width:W, height:H } = previewCanvas;
    pctx.clearRect(0,0,W,H);

    let iw = image.width, ih = image.height;
    const s = Math.min(W/iw, H/ih);
    const dw = Math.round(iw*s), dh = Math.round(ih*s);
    const dx = Math.floor((W-dw)/2), dy = Math.floor((H-dh)/2);
    pctx.drawImage(image, dx, dy, dw, dh);
  }

  // Public API for upload & draw modules
  window.LMB.setImage = async function(imgBitmap){
    state.imgBitmap = imgBitmap;
    state.imgAspect = imgBitmap.width / imgBitmap.height;
    previewHost.classList.remove('hidden');
    drawFit(imgBitmap);
    state.lastPNG = null;
  };

  window.LMB.setMask = function(dataURL){
    state.maskPNG = dataURL; // used on next process
    // Immediately process with mask for user feedback
    processNow();
  };

  function processNow(){
    if (!state.imgBitmap) { alert('Upload a photo first.'); return; }
    btnProcess && (btnProcess.disabled = true, btnProcess.textContent = 'Processing…');

    // Pack data for worker
    const off = new OffscreenCanvas(previewCanvas.width, previewCanvas.height);
    const octx = off.getContext('2d');
    // Draw the fitted source the same way so worker gets consistent pixels
    let iw = state.imgBitmap.width, ih = state.imgBitmap.height;
    const W = off.width, H = off.height;
    const s = Math.min(W/iw, H/ih);
    const dw = Math.round(iw*s), dh = Math.round(ih*s);
    const dx = Math.floor((W-dw)/2), dy = Math.floor((H-dh)/2);
    octx.clearRect(0,0,W,H);
    octx.drawImage(state.imgBitmap, dx, dy, dw, dh);

    const src = octx.getImageData(0,0,W,H);

    worker.postMessage({
      type:'process',
      image: src,
      options: state.options,
      maskPNG: state.maskPNG
    }, [src.data.buffer]); // transfer pixels
  }

  btnProcess && btnProcess.addEventListener('click', processNow);

  worker.onmessage = (ev)=>{
    const msg = ev.data;
    if (msg.type==='result'){
      const { width, height, dataURL } = msg;
      const img = new Image();
      img.onload = ()=>{
        pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
        pctx.drawImage(img,0,0,previewCanvas.width,previewCanvas.height);
        state.lastPNG = dataURL;
        btnProcess && (btnProcess.disabled=false, btnProcess.textContent='Process Photo');
      };
      img.src = dataURL;
    } else if (msg.type==='error'){
      console.error(msg.error);
      alert('Processing failed on this device.');
      btnProcess && (btnProcess.disabled=false, btnProcess.textContent='Process Photo');
    }
  };

  // Expose for upload/draw scripts
  window.LMB._drawFit = drawFit;
})();