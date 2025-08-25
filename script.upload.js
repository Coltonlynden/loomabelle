// Upload + SMART auto-highlight + edges preview
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const S = (window.EAS ||= {}).state ||= {};

  const base = $('#canvas');
  const bctx = base.getContext('2d', { willReadFrequently: true });
  const edges = $('#edges').getContext('2d');
  const maskCtx = $('#mask').getContext('2d');

  base.width = base.height = 1024;

  function drawEdgesFromBase() {
    edges.canvas.width = edges.canvas.height = 1024;
    const src = bctx.getImageData(0, 0, 1024, 1024);
    const d = src.data;
    const out = edges.createImageData(1024, 1024);
    for (let y = 1; y < 1023; y++) {
      for (let x = 1; x < 1023; x++) {
        const i = (y * 1024 + x) * 4;
        const ix = i - 4, iy = i - 4096;
        const dx =
          Math.abs(d[i] - d[ix]) +
          Math.abs(d[i + 1] - d[ix + 1]) +
          Math.abs(d[i + 2] - d[ix + 2]);
        const dy =
          Math.abs(d[i] - d[iy]) +
          Math.abs(d[i + 1] - d[iy + 1]) +
          Math.abs(d[i + 2] - d[iy + 2]);
        const v = (dx + dy) >> 1;
        out.data[i + 3] = v > 60 ? 90 : 0;
      }
    }
    edges.putImageData(out, 0, 0);
  }

  function fitAndDraw(img) {
    bctx.clearRect(0, 0, 1024, 1024);
    // letterbox-fit to 1024×1024 without cropping
    const r = img.width / img.height;
    let w, h, x, y;
    if (r > 1) { // wide
      w = 1024; h = (1024 / r) | 0; x = 0; y = (1024 - h) / 2;
    } else {    // tall
      h = 1024; w = (1024 * r) | 0; y = 0; x = (1024 - w) / 2;
    }
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, 1024, 1024);
    bctx.drawImage(img, x, y, w, h);

    // store ORIGINAL pixels for all later steps
    S.srcData = bctx.getImageData(0, 0, 1024, 1024);

    drawEdgesFromBase();
    maskCtx.clearRect(0, 0, 1024, 1024);
    window.EAS_preview.render();
  }

  $('#file').addEventListener('change', (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const img = new Image();
    img.onload = () => fitAndDraw(img);
    img.src = URL.createObjectURL(f);
  });

  // --- SMART AUTO HIGHLIGHT ---
  // Finds a strong-detail center and lays a feathered ellipse there.
  function smartAutoMask() {
    if (!S.srcData) return;
    const W = 1024, H = 1024;
    const src = S.srcData.data;

    // Sobel magnitude on a 256×256 downsample for speed
    const SZX = 256, SZY = 256, step = 4;
    const mag = new Float32Array(SZX * SZY);
    for (let y = 1; y < SZY - 1; y++) {
      for (let x = 1; x < SZX - 1; x++) {
        // sample from 1024 image
        const sx = (x * (W / SZX)) | 0;
        const sy = (y * (H / SZY)) | 0;
        const i = (sy * W + sx) << 2;

        const gx =
          -src[i - (W << 2) - 4] - 2 * src[i - 4] - src[i + (W << 2) - 4] +
           src[i - (W << 2) + 4] + 2 * src[i + 4] + src[i + (W << 2) + 4];

        const gy =
          -src[i - (W << 2) - 4] - 2 * src[i - (W << 2)] - src[i - (W << 2) + 4] +
           src[i + (W << 2) - 4] + 2 * src[i + (W << 2)] + src[i + (W << 2) + 4];

        mag[y * SZX + x] = Math.hypot(gx, gy);
      }
    }

    // Find window with highest summed magnitude (avoid borders)
    let best = { s: -1, x: 128, y: 128 };
    const R = 18;
    for (let y = 24; y < SZY - 24; y++) {
      for (let x = 24; x < SZX - 24; x++) {
        let sum = 0;
        for (let j = -R; j <= R; j += 6)
          for (let i = -R; i <= R; i += 6)
            sum += mag[(y + j) * SZX + (x + i)];
        if (sum > best.s) best = { s: sum, x, y };
      }
    }
    const cx = best.x * (W / SZX);
    const cy = best.y * (H / SZY);

    // Draw feathered ellipse around the found center
    const rx = W * 0.33, ry = H * 0.33;     // size
    const feather = 64;                     // softness

    const md = maskCtx.createImageData(W, H);
    const m = md.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy); // 1 at edge
        let a = (1 - (d - 1) * (1024 / feather)); // linear feather
        if (a < 0) a = 0; if (a > 1) a = 1;
        m[(y * W + x) * 4 + 3] = (a * 255) | 0;
      }
    }
    maskCtx.putImageData(md, 0, 0);
  }

  $('#autohighlight').addEventListener('click', () => {
    smartAutoMask();
    window.EAS_preview.render();
  });
})();