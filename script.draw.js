// Draw pipeline: listens to editor:imageLoaded and sizes canvases from the image.
(function(){
  const $ = s => document.querySelector(s);
  const wrap = $('#canvasWrap');
  const imgC = $('#imgCanvas');
  const maskC= $('#maskCanvas');
  const textC= $('#textCanvas');
  const showMask = $('#showMask');
  const showEdges= $('#showEdges');
  const textInput= $('#textInput');
  const textSize = $('#textSize');
  const textCurve= $('#textCurve');
  const textApply= $('#textApply');

  const dpr = Math.max(1, window.devicePixelRatio||1);
  const ctxImg  = imgC.getContext('2d');
  const ctxMask = maskC.getContext('2d', { willReadFrequently:true });
  const ctxText = textC.getContext('2d');

  let currentImg = null; // HTMLImageElement
  const state = { removeBg:false, text:{content:'', x:.5, y:.5, px:72, curve:0} };

  // Always keep mask transparent and hidden unless user shows it
  function initMask(){
    maskC.classList.add('is-hidden');
    if (showMask) showMask.checked = false;
    ctxMask.setTransform(1,0,0,1,0,0);
    ctxMask.clearRect(0,0,maskC.width,maskC.height);
  }

  function fitToImage(img){
    const cw = Math.max(320, wrap?.clientWidth || 800);
    const ch = Math.max(220, wrap?.clientHeight || 600);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const r = Math.min(cw/iw, ch/ih);
    const w = Math.max(2, Math.floor(iw*r));
    const h = Math.max(2, Math.floor(ih*r));
    [imgC,maskC,textC].forEach(c=>{
      c.width  = Math.round(w*dpr);
      c.height = Math.round(h*dpr);
      c.style.width = w+'px';
      c.style.height = h+'px';
    });
  }

  function draw(){
    const w = imgC.width, h = imgC.height;
    const clear = ctx => { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); };
    clear(ctxImg); clear(ctxText);

    if (!currentImg){
      ctxImg.fillStyle = '#fff'; ctxImg.fillRect(0,0,w,h);
      return;
    }

    // base
    ctxImg.drawImage(currentImg, 0, 0, w, h);

    // optional grid
    if (showEdges && showEdges.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply';
      ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for (let i=-h;i<w;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+h,h); ctxImg.stroke(); }
      ctxImg.restore();
    }

    // text
    if (state.text.content){
      const cx = w*state.text.x, cy = h*state.text.y;
      ctxText.font = `${state.text.px*dpr}px serif`;
      ctxText.textAlign='center'; ctxText.textBaseline='middle';
      ctxText.fillStyle='#222'; ctxText.strokeStyle='rgba(0,0,0,.12)'; ctxText.lineWidth=2*dpr;
      ctxText.strokeText(state.text.content, cx, cy);
      ctxText.fillText(state.text.content, cx, cy);
    }

    if (window.renderLoomPreview) { try { renderLoomPreview('loomPreviewCanvas'); } catch{} }
  }

  // Upload event (from script.upload.js)
  window.addEventListener('editor:imageLoaded', e=>{
    const img = e?.detail?.img;
    if (!img) return;
    currentImg = img;
    fitToImage(img);
    initMask();
    draw();
  });

  // Show/hide mask overlay
  if (showMask) showMask.addEventListener('change', ()=>{
    maskC.classList.toggle('is-hidden', !showMask.checked);
  });

  // Remove background toggle (only impacts export preview elsewhere)
  window.addEventListener('editor:removebg', e=>{ state.removeBg = !!e?.detail?.enabled; draw(); });

  // Text
  if (textApply) textApply.addEventListener('click', ()=>{
    state.text.content = textInput?.value || '';
    state.text.px      = +(textSize?.value || 72);
    state.text.curve   = +(textCurve?.value || 0);
    draw();
  });

  // Resize redraw
  window.addEventListener('resize', ()=>{ if(currentImg){ fitToImage(currentImg); draw(); } });

  // Init
  window.addEventListener('load', ()=>{ initMask(); if(!imgC.width){ // first-time size for empty stage
    const w = wrap?.clientWidth || 800, h = wrap?.clientHeight || 600;
    [imgC,maskC,textC].forEach(c=>{ c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); c.style.width=w+'px'; c.style.height=h+'px'; });
    draw();
  }});
})();