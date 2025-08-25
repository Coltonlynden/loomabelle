// Upload + subject segmentation (U2Netp ONNX) + edges
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const S = (window.EAS ||= {}).state ||= {};
  const base = $('#canvas').getContext('2d', { willReadFrequently: true });
  const edges = $('#edges').getContext('2d');
  const mctx  = $('#mask').getContext('2d', { willReadFrequently: true });
  const stage = $('#stage').getContext('2d');

  // keep 1024² working size
  const W = 1024, H = 1024;
  [base.canvas, edges.canvas, mctx.canvas, stage.canvas].forEach(c => { c.width = W; c.height = H; });

  // draw Sobel edges for visual guidance
  function drawEdges() {
    const src = base.getImageData(0, 0, W, H);
    const d = src.data;
    const out = edges.createImageData(W, H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = (y * W + x) * 4;
        const ix = idx - 4, iy = idx - W * 4;
        const dx = Math.abs(d[idx] - d[ix]) + Math.abs(d[idx + 1] - d[ix + 1]) + Math.abs(d[idx + 2] - d[ix + 2]);
        const dy = Math.abs(d[idx] - d[iy]) + Math.abs(d[idx + 1] - d[iy + 1]) + Math.abs(d[idx + 2] - d[iy + 2]);
        const v = (dx + dy) >> 1;
        out.data[idx + 3] = v > 60 ? 90 : 0;
      }
    }
    edges.putImageData(out, 0, 0);
  }

  function letterboxDraw(img) {
    base.fillStyle = '#fff';
    base.fillRect(0, 0, W, H);
    const r = img.width / img.height;
    let w, h, x, y;
    if (r > 1) { w = W; h = (W / r) | 0; x = 0; y = (H - h) / 2; }
    else { h = H; w = (H * r) | 0; y = 0; x = (W - w) / 2; }
    base.drawImage(img, x, y, w, h);
    S.srcData = base.getImageData(0, 0, W, H);
    drawEdges();
  }

  // -------- Segmentation with U2Netp ----------
  let sessionPromise;
  async function ensureSession() {
    if (!sessionPromise) {
      sessionPromise = ort.InferenceSession.create('models/u2netp.onnx', { executionProviders: ['wasm'] });
    }
    return sessionPromise;
  }

  async function segmentU2Net() {
    if (!S.srcData) return null;
    const sz = 320; // model input
    // to NHWC float32 [1,320,320,3] 0..1
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = sz;
    tmp.getContext('2d').drawImage($('#canvas'), 0, 0, sz, sz);
    const d = tmp.getContext('2d').getImageData(0, 0, sz, sz).data;
    const input = new Float32Array(sz * sz * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      input[j] = d[i] / 255; input[j + 1] = d[i + 1] / 255; input[j + 2] = d[i + 2] / 255;
    }
    const tensor = new ort.Tensor('float32', input, [1, sz, sz, 3]);
    const sess = await ensureSession();
    const out = await sess.run({ input: tensor });
    const key = Object.keys(out)[0];
    const prob = out[key].data; // 1x1x320x320 or 1x320x320x1
    // normalize and upsample to 1024²
    const md = mctx.createImageData(W, H);
    const m = md.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.floor(x * sz / W);
        const sy = Math.floor(y * sz / H);
        const p = prob[sy * sz + sx]; // 0..1
        const a = Math.max(0, Math.min(255, (p * 255) | 0));
        const i = (y * W + x) * 4;
        m[i] = m[i + 1] = m[i + 2] = 0; m[i + 3] = a;
      }
    }
    mctx.putImageData(md, 0, 0);
    return true;
  }

  // Fallback mask: feathered ellipse on maximum-detail area
  function fallbackMask() {
    const W2 = 256, H2 = 256, step = 4;
    const md = new Float32Array(W2 * H2);
    // coarse gradient magnitude
    for (let y = 1; y < H2 - 1; y++) {
      for (let x = 1; x < W2 - 1; x++) {
        const sx = (x * 4) | 0, sy = (y * 4) | 0;
        const i = (sy * W + sx) * 4;
        const ix = i - 4, iy = i - W * 4;
        const dx = Math.abs(S.srcData.data[i] - S.srcData.data[ix]);
        const dy = Math.abs(S.srcData.data[i] - S.srcData.data[iy]);
        md[y * W2 + x] = dx + dy;
      }
    }
    // find best window
    let best = { s: -1, x: 128, y: 128 };
    for (let y = 20; y < H2 - 20; y++) {
      for (let x = 20; x < W2 - 20; x++) {
        let s = 0;
        for (let j = -12; j <= 12; j += 4)
          for (let i = -12; i <= 12; i += 4) s += md[(y + j) * W2 + (x + i)];
        if (s > best.s) best = { s, x, y };
      }
    }
    const cx = best.x * (W / W2), cy = best.y * (H / H2);
    const rx = W * 0.33, ry = H * 0.33, feather = 64;

    const out = mctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        let a = (1 - (d - 1) * (1024 / feather)); a = a < 0 ? 0 : a > 1 ? 1 : a;
        out.data[(y * W + x) * 4 + 3] = (a * 255) | 0;
      }
    }
    mctx.putImageData(out, 0, 0);
  }

  async function autoHighlight() {
    try {
      const ok = await segmentU2Net();
      if (!ok) fallbackMask();
    } catch (e) {
      console.warn('segmentation failed, using fallback', e);
      fallbackMask();
    }
    window.EAS_preview.render();
  }

  $('#file').addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return;
    const img = new Image();
    img.onload = () => { letterboxDraw(img); mctx.clearRect(0,0,W,H); window.EAS_preview.render(); };
    img.src = URL.createObjectURL(f);
  });
  $('#autohighlight').addEventListener('click', autoHighlight);

  // toggle visibility
  $('#toggle-mask').addEventListener('change', e => { $('#mask').style.display = e.target.checked ? 'block' : 'none'; window.EAS_preview.render(); });
  $('#toggle-edges').addEventListener('change', e => { $('#edges').style.display = e.target.checked ? 'block' : 'none'; window.EAS_preview.render(); });

  // initial blank render
  window.addEventListener('load', () => window.EAS_preview.render());
})();