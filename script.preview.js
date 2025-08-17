// preview.js — v1.0
(function () {
  const App = (window.App = window.App || {});
  App.state = App.state || {
    img: null,             // ImageBitmap
    imgW: 0, imgH: 0,
    mask: null,            // Uint8Array (1 inside subject)
    indexed: null,         // Uint8 indices after processing
    palette: [],           // [[r,g,b],...]
    result: null           // {W,H,indexed,palette}
  };

  const previewHost = document.getElementById('previewHost');

  function ensureCanvas(host) {
    let c = host.querySelector('canvas');
    if (!c) {
      c = document.createElement('canvas');
      c.width = 640; c.height = 360;
      host.appendChild(c);
    }
    return c;
  }

  App.renderRawToPreview = function renderRawToPreview() {
    if (!App.state.img) return;
    previewHost.classList.remove('hidden');
    const c = ensureCanvas(previewHost);
    const ctx = c.getContext('2d');
    // letterbox into canvas
    const W = c.width, H = c.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0,0,W,H);
    const iw = App.state.imgW, ih = App.state.imgH;
    const s = Math.min(W/iw, H/ih);
    const w = Math.round(iw*s), h = Math.round(ih*s);
    const x = (W - w) >> 1, y = (H - h) >> 1;
    ctx.drawImage(App.state.img, x, y, w, h);
  };

  App.renderProcessedPreview = function renderProcessedPreview(result) {
    // result: {W,H,indexed, palette}
    App.state.result = result;
    previewHost.classList.remove('hidden');

    const c = ensureCanvas(previewHost);
    const ctx = c.getContext('2d', { willReadFrequently: true });

    const W = c.width, H = c.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0b1222';
    ctx.fillRect(0,0,W,H);

    // scale image -> canvas
    const s = Math.min(W/result.W, H/result.H);
    const w = Math.max(1, Math.floor(result.W*s));
    const h = Math.max(1, Math.floor(result.H*s));
    const offX = (W-w)>>1, offY = (H-h)>>1;

    // paint quantized fills with diagonal stitch pattern
    const img = ctx.createImageData(w, h);
    const data = img.data;

    function colorAt(idx) {
      const c = result.palette[idx] || [0,0,0];
      return c;
    }

    for (let y=0; y<h; y++) {
      for (let x=0; x<w; x++) {
        const sx = Math.min(result.W-1, Math.floor(x/s));
        const sy = Math.min(result.H-1, Math.floor(y/s));
        const k = result.indexed[sy*result.W + sx];
        const [r,g,b] = colorAt(k);
        const i = (y*w + x)*4;
        // subtle hatch shading
        const hatch = ((x + y) % 6) < 3 ? -14 : 0;
        data[i]   = Math.max(0, r + hatch);
        data[i+1] = Math.max(0, g + hatch);
        data[i+2] = Math.max(0, b + hatch);
        data[i+3] = 255;
      }
    }
    ctx.putImageData(img, offX, offY);

    // light hoop frame
    ctx.save();
    ctx.translate(offX, offY);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w-16, h-16);
    ctx.restore();

    // enable exports
    document.getElementById('btnPng').disabled = false;
  };

  // PNG export
  document.getElementById('btnPng').addEventListener('click', () => {
    const c = previewHost.querySelector('canvas');
    if (!c) return;
    const link = document.createElement('a');
    link.download = 'loomabelle-preview.png';
    link.href = c.toDataURL('image/png');
    link.click();
  });

  // Palette chips (dummy colors initially)
  const swatches = document.getElementById('swatches');
  App.setSwatches = function(colors = [[255,99,132],[255,168,212],[165,180,252],[147,197,253],[134,239,172],[248,250,109],[251,191,36],[248,113,113],[110,231,183]]) {
    swatches.innerHTML = '';
    colors.forEach(c=>{
      const el = document.createElement('div');
      el.className = 'chip';
      el.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      swatches.appendChild(el);
    });
  };
  App.setSwatches();

  // simple smooth scroll + tab switch
  document.querySelectorAll('[data-scroll]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const t = btn.getAttribute('data-scroll');
      const wantsTab = btn.getAttribute('data-tab');
      if (wantsTab) App.switchTab(wantsTab);
      document.querySelector(t)?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  // Tab switching
  App.switchTab = function(to){
    document.querySelectorAll('.tab-btn').forEach(b=>{
      const hit = b.dataset.tab === to;
      b.classList.toggle('active', hit);
    });
    document.querySelectorAll('.panel').forEach(p=>{
      const hit = p.dataset.panel === to;
      p.classList.toggle('active', hit);
    });
  };

  // year
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
})();