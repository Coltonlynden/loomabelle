/* Easbroidery editor — robust upload + draw */
(function () {
  const $ = s => document.querySelector(s);

  // DOM
  const C = {
    wrap:  $('#canvasWrap'),
    img:   $('#imgCanvas'),
    mask:  $('#maskCanvas'),
    text:  $('#textCanvas'),
    auto:  $('#autoBtn'),
    showMask:  $('#showMask'),
    showEdges: $('#showEdges'),
    textInput: $('#textInput'),
    textSize:  $('#textSize'),
    textCurve: $('#textCurve'),
    textApply: $('#textApply'),
    dirAngle:  $('#dirAngle'),
    dirPattern:$('#dirPattern'),
    fileInput: $('#fileInput')
  };

  // Canvas ctx
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctxImg  = C.img.getContext('2d');
  const ctxMask = C.mask.getContext('2d', { willReadFrequently: true });
  const ctxText = C.text.getContext('2d');

  let bmp = null; // ImageBitmap or HTMLImageElement
  const state = {
    removeBg: false,
    text: { content: '', x: .5, y: .5, px: 72, curve: 0 }
  };

  /* ---------- sizing ---------- */
  function ensureWrapHeight() {
    const avail = Math.max(240, window.innerHeight - 120); // top+bottom bars
    if (!C.wrap.style.height) C.wrap.style.height = avail + 'px';
    if (C.wrap.clientHeight < 200) C.wrap.style.height = '60vh'; // hard fallback
  }
  function fit() {
    ensureWrapHeight();
    const w = Math.max(2, C.wrap.clientWidth);
    const h = Math.max(2, C.wrap.clientHeight);
    [C.img, C.mask, C.text].forEach(c => {
      c.width  = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = '100%';
      c.style.height = '100%';
    });
    draw();
  }
  addEventListener('resize', fit);

  /* ---------- decode helpers ---------- */
  async function decodeFile(file) {
    if (!file) return null;
    const safe = /image\/(png|jpe?g|gif|webp)/i.test(file.type || '');
    if ('createImageBitmap' in window && safe) {
      try { return await createImageBitmap(file); } catch {}
    }
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = fr.result; };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    const image = await decodeFile(file);
    if (!image) return;
    bmp = image;
    // reset mask to fully opaque but keep overlay hidden unless user shows it
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.fillStyle = 'rgba(0,0,0,0.99)';
    ctxMask.fillRect(0,0,C.mask.width,C.mask.height);
    fit();           // size canvases
    draw();          // render now
  }

  /* ---------- inputs listened (all paths) ---------- */
  // 1) Direct input change
  C.fileInput && C.fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = ''; // allow same file re-select
  });
  // 2) Custom event with raw file
  window.addEventListener('editor:file', e => {
    const f = e && e.detail && e.detail.file;
    if (f) handleFile(f);
  });
  // 3) Custom event with decoded image
  window.addEventListener('editor:image', e => {
    const image = e && e.detail && e.detail.image;
    if (image) { bmp = image; fit(); draw(); }
  });

  /* ---------- toggles ---------- */
  window.addEventListener('editor:removebg', e => { state.removeBg = !!(e.detail && e.detail.enabled); draw(); });
  C.showMask && C.showMask.addEventListener('change', () => {
    const hide = !C.showMask.checked;
    C.mask.classList.toggle('is-hidden', hide);
  });
  C.showEdges && C.showEdges.addEventListener('change', draw);

  /* ---------- text ---------- */
  C.textApply && C.textApply.addEventListener('click', () => {
    state.text.content = C.textInput.value || '';
    state.text.px      = +C.textSize.value;
    state.text.curve   = +C.textCurve.value;
    draw();
  });

  /* ---------- draw ---------- */
  function draw() {
    const w = C.img.width, h = C.img.height;
    const clear = ctx => { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); };
    clear(ctxImg); clear(ctxText);

    if (!bmp) { ctxImg.fillStyle = '#fff'; ctxImg.fillRect(0,0,w,h); return; }

    ctxImg.drawImage(bmp, 0, 0, w, h);

    if (state.removeBg) {
      ctxImg.save(); ctxImg.globalCompositeOperation = 'destination-in';
      ctxImg.drawImage(C.mask, 0, 0); ctxImg.restore();
    }

    if (C.showEdges && C.showEdges.checked) {
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply';
      ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for (let i=-h;i<w;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+h,h); ctxImg.stroke(); }
      ctxImg.restore();
    }

    const t = state.text;
    if (t.content) {
      const cx = w * t.x, cy = h * t.y;
      ctxText.font = `${t.px*dpr}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle';
      ctxText.fillStyle='#222'; ctxText.strokeStyle='rgba(0,0,0,.12)'; ctxText.lineWidth=2*dpr;
      ctxText.strokeText(t.content, cx, cy); ctxText.fillText(t.content, cx, cy);
    }

    if (window.renderLoomPreview) { try { renderLoomPreview('loomPreviewCanvas'); } catch {} }
  }

  /* ---------- init ---------- */
  window.Editor = { fit, redraw: draw };
  window.addEventListener('load', () => {
    // make sure mask is hidden by default so it never covers uploads
    const sm = C.showMask; if (sm) sm.checked = false;
    $('#maskCanvas')?.classList.add('is-hidden');
    fit(); setTimeout(fit,120); // iOS toolbar settle
  });
})();