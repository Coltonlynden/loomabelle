// Draw pipeline with deferred render to avoid races
(function(){
  const $ = s => document.querySelector(s);
  const wrap  = $('#canvasWrap');
  const imgC  = $('#imgCanvas');
  const maskC = $('#maskCanvas');
  const textC = $('#textCanvas');
  const showMask  = $('#showMask');
  const showEdges = $('#showEdges');
  const textInput = $('#textInput');
  const textSize  = $('#textSize');
  const textCurve = $('#textCurve');
  const textApply = $('#textApply');

  const dpr = Math.max(1, window.devicePixelRatio||1);
  const ctxImg  = imgC.getContext('2d');
  const ctxMask = maskC.getContext('2d', { willReadFrequently:true });
  const ctxText = textC.getContext('2d');

  let currentImg = null;
  const state = { text:{content:'', x:.5, y:.5, px:72, curve:0}, removeBg:false };

  function hideMask(){
    maskC.classList.add('is-hidden');
    if (showMask) showMask.checked = false;
    ctxMask.setTransform(1,0,0,1,0,0);
    ctxMask.clearRect(0,0,maskC.width,maskC.height);
  }

  function computeFitDims(img){
    const cw = Math.max(320, wrap?.clientWidth || 800);
    const ch = Math.max(220, wrap?.clientHeight || 600);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const r = Math.min(cw/iw, ch/ih);
    return { w: Math.max(2, Math.floor(iw*r)), h: Math.max(2, Math.floor(ih*r)) };
  }

  function resizeCanvases(w, h){
    [imgC,maskC,textC].forEach(c=>{
      c.width  = Math.round(w*dpr);
      c.height = Math.round(h*dpr);
      c.style.width = w+'px';
      c.style.height= h+'px';
    });
  }

  function draw(){
    const w = imgC.width, h = imgC.height;
    const clear = ctx => { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); };
    clear(ctxImg); clear(ctxText);

    if (!currentImg){
      ctxImg.fillStyle='#fff'; ctxImg.fillRect(0,0,w,h);
      return;
    }

    // base image
    ctxImg.imageSmoothingEnabled = true;
    ctxImg.drawImage(currentImg, 0, 0, w, h);

    // optional grid
    if (showEdges && showEdges.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply';
      ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for (let i=-h;i<w;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+h,h); ctxImg.stroke(); }
      ctxImg.restore();
    }

    if (window.renderLoomPreview) { try { renderLoomPreview('loomPreviewCanvas'); } catch{} }
  }

  // Upload event
  window.addEventListener('editor:imageLoaded', e=>{
    const img = e?.detail?.img; if(!img) return;
    currentImg = img;

    // ensure mask cannot cover image
    hideMask();

    // 1) compute new canvas size from image
    const {w,h} = computeFitDims(img);
    resizeCanvases(w,h);

    // 2) defer draw to next frame to avoid race with layout
    requestAnimationFrame(draw);
  });

  // Mask overlay manual toggle
  showMask && showMask.addEventListener('change', ()=>{
    maskC.classList.toggle('is-hidden', !showMask.checked);
  });

  // Text
  textApply && textApply.addEventListener('click', ()=>{
    state.text.content = textInput?.value || '';
    state.text.px      = +(textSize?.value || 72);
    state.text.curve   = +(textCurve?.value || 0);
    draw();
  });

  // Resize -> refit to current image
  window.addEventListener('resize', ()=>{
    if (!currentImg) return;
    const {w,h} = computeFitDims(currentImg);
    resizeCanvases(w,h);
    requestAnimationFrame(draw);
  });

  // Init
  window.addEventListener('load', ()=>{
    // initial blank stage sized to container
    const cw = Math.max(320, wrap?.clientWidth || 800);
    const ch = Math.max(220, wrap?.clientHeight || 600);
    resizeCanvases(cw, ch);
    hideMask();
    draw();
  });
})();