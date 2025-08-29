// Draw pipeline using an <img> base layer for display
(function(){
  const $ = s => document.querySelector(s);
  const wrap  = $('#canvasWrap');
  const imgEl = $('#imgLayer');          // new display layer
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
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const r = Math.min(cw/iw, ch/ih);
    return { w: Math.max(2, Math.floor(iw*r)), h: Math.max(2, Math.floor(ih*r)) };
  }

  function resizeAll(w, h){
    // size display image box via CSS; canvases match pixel size
    if (imgEl){ imgEl.style.width = w+'px'; imgEl.style.height = h+'px'; }
    [imgC,maskC,textC].forEach(c=>{
      c.width  = Math.round(w*dpr);
      c.height = Math.round(h*dpr);
      c.style.width = w+'px';
      c.style.height= h+'px';
    });
  }

  function redraw(){
    const w = imgC.width, h = imgC.height;
    const clear = ctx => { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); };
    clear(ctxImg); clear(ctxText);

    // base bitmap is visually shown by <img>; keep a copy in imgCanvas for export if needed
    if (currentImg && currentImg.naturalWidth){
      ctxImg.imageSmoothingEnabled = true;
      ctxImg.drawImage(currentImg, 0, 0, w, h);
    } else {
      ctxImg.fillStyle='#fff'; ctxImg.fillRect(0,0,w,h);
    }

    if (showEdges && showEdges.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply';
      ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for (let i=-h;i<w;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+h,h); ctxImg.stroke(); }
      ctxImg.restore();
    }

    if (state.text.content){
      const cx = w*state.text.x, cy = h*state.text.y;
      ctxText.font = `${state.text.px*dpr}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle';
      ctxText.fillStyle='#222'; ctxText.strokeStyle='rgba(0,0,0,.12)'; ctxText.lineWidth=2*dpr;
      ctxText.strokeText(state.text.content, cx, cy); ctxText.fillText(state.text.content, cx, cy);
    }

    if (window.renderLoomPreview) { try { renderLoomPreview('loomPreviewCanvas'); } catch{} }
  }

  // Upload event
  window.addEventListener('editor:imageLoaded', e=>{
    const img = e?.detail?.img; if(!img) return;
    currentImg = img;
    hideMask();

    const {w,h} = computeFitDims(img);
    resizeAll(w,h);
    requestAnimationFrame(redraw);
  });

  // toggles
  showMask && showMask.addEventListener('change', ()=> maskC.classList.toggle('is-hidden', !showMask.checked));
  textApply && textApply.addEventListener('click', ()=>{
    state.text.content = textInput?.value || '';
    state.text.px      = +(textSize?.value || 72);
    state.text.curve   = +(textCurve?.value || 0);
    redraw();
  });
  window.addEventListener('resize', ()=>{ if (!currentImg) return; const {w,h}=computeFitDims(currentImg); resizeAll(w,h); requestAnimationFrame(redraw); });

  // init
  window.addEventListener('load', ()=>{
    const cw = Math.max(320, wrap?.clientWidth || 800);
    const ch = Math.max(220, wrap?.clientHeight || 600);
    resizeAll(cw, ch);
    hideMask();
    redraw();
  });

  // expose
  window.Editor = { redraw };
})();