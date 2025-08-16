/* Loomabelle runtime — v34
   - Keeps the site’s visuals/HTML unchanged.
   - Wires Upload → Preview, Highlight Subject → Draw, Process → Stitched preview.
   - Mobile-safe (downscale, touch/scroll lock), no server required.
*/

(() => {
  "use strict";

  /* ------------------------- Helpers ------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dpr = () => (window.devicePixelRatio || 1);

  // Find key containers by data attributes already in your HTML
  const panels = {
    upload: $('.panel[data-panel="upload"]'),
    draw:   $('.panel[data-panel="draw"]')
  };
  const tabsBar = $('#tabs') || document.body; // for scrolling targets

  // Upload area
  const uploadZone   = panels.upload?.querySelector('.upload-zone');
  const uploadInput  = uploadZone?.querySelector('input[type="file"]');
  const reduceChk    = panels.upload?.querySelector('label:has(input[type="checkbox"]) input') || null; // first checkbox = Reduce to stitch palette
  const outlineChk   = panels.upload?.querySelectorAll('label input[type="checkbox"]')[1] || null;       // second checkbox = Edge outline
  const densitySlider= panels.upload?.querySelector('input[type="range"]') || null;

  // Preview area (stitched)
  const previewCard  = panels.upload?.querySelector('.card.rose');
  const previewHost  = previewCard?.querySelector('.preview');
  const btnProcess   = previewCard?.querySelector('button:has(+ *) , .formats') ? previewCard.querySelector('button') : null; // first button under preview = Process Photo
  const btnHighlight = previewCard?.querySelector('button:nth-of-type(2)'); // Highlight Subject
  const noSubjectChk = previewCard?.querySelector('input[type="checkbox"]'); // No subject (if present)
  const addFillsChk  = previewCard?.querySelector('input[type="checkbox"] ~ *') ? previewCard.querySelectorAll('input[type="checkbox"]')[1] : null;
  // export buttons (if any)
  const exportRow    = previewCard?.querySelector('.formats');

  // Draw & Trace area
  const drawCard     = panels.draw?.querySelector('.card.violet');
  const drawHost     = drawCard?.querySelector('.canvas');
  const btnPen       = drawCard?.querySelector('button:nth-of-type(1)');
  const btnEraser    = drawCard?.querySelector('button:nth-of-type(2)');
  const btnProcessSel= drawCard?.querySelector('button:nth-of-type(3)'); // “Process Selection”

  /* ------------------------- State --------------------------- */
  const State = {
    image: null,         // HTMLImageElement of the uploaded image
    work:  null,         // offscreen canvas of the image (RGBA)
    mask:  null,         // user mask canvas (same px size as work)
    hasMask: false,
    preview: null,       // preview <canvas> inserted into .preview
    drawBG: null,        // faint background on draw panel
    pen: {size: 18, erase:false, down:false, lastX:0, lastY:0},
    settings: {
      k: 6,
      outline: true,
      density: 0.4,
      addFills: true,
      ignoreSubject: false
    }
  };

  /* ------------------ Canvas utilities ----------------------- */
  function makeCanvas(w, h, scaleToDPR = true) {
    const c = document.createElement('canvas');
    const ratio = scaleToDPR ? dpr() : 1;
    c.width = Math.max(1, Math.round(w * ratio));
    c.height = Math.max(1, Math.round(h * ratio));
    c.style.width = `${Math.round(w)}px`;
    c.style.height= `${Math.round(h)}px`;
    return c;
  }

  function fitInside(maxW, maxH, w, h) {
    const s = Math.min(maxW / w, maxH / h, 1);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }

  function drawImageScaled(dst, img) {
    const ctx = dst.getContext('2d', { willReadFrequently:true });
    ctx.clearRect(0,0,dst.width,dst.height);
    const scale = Math.min(dst.width / img.naturalWidth, dst.height / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const x = (dst.width - w) >> 1;
    const y = (dst.height - h) >> 1;
    ctx.drawImage(img, x, y, w, h);
  }

  /* ------------------- HEIC → JPEG (iOS) --------------------- */
  async function heicToJpeg(file) {
    const name = (file.name||'image').replace(/\.\w+$/, '');
    // lightweight CDN; if it fails we just return the original file
    try {
      if (!window.heic2any) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
      }
      const out = await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
      const blob = Array.isArray(out) ? out[0] : out;
      return new File([blob], `${name}.jpg`, { type:'image/jpeg' });
    } catch {
      return file;
    }
  }

  /* -------------------- UI bootstrapping --------------------- */
  function ensurePreviewCanvas() {
    if (State.preview) return;
    // keep host size stable; just create one canvas inside it
    const hostRect = previewHost.getBoundingClientRect();
    const cw = Math.max(300, Math.floor(hostRect.width));
    const ch = Math.max(180, Math.floor(hostRect.width * 9/16));
    const c = makeCanvas(cw, ch, false);
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height= '100%';
    previewHost.innerHTML = '';
    previewHost.appendChild(c);
    State.preview = c;
  }

  function ensureDrawLayers() {
    if (State.drawBG && State.mask) return;
    // background (faint image)
    const bg = makeCanvas(640, 360, false);
    bg.style.width = '100%'; bg.style.height = '100%';
    bg.style.display = 'block';
    bg.style.position = 'absolute';
    bg.style.inset = '0';
    bg.style.opacity = '0.45';
    // mask (user strokes)
    const mk = makeCanvas(640, 360, false);
    mk.style.width = '100%'; mk.style.height = '100%';
    mk.style.display = 'block';
    mk.style.position = 'relative';
    // host
    drawHost.innerHTML = '';
    drawHost.style.position = 'relative';
    drawHost.appendChild(bg);
    drawHost.appendChild(mk);
    State.drawBG = bg;
    State.mask = mk;

    bindDraw(mk);
  }

  /* --------------------- File upload ------------------------- */
  function bindUpload() {
    if (!uploadInput || !uploadZone) return;
    uploadZone.addEventListener('click', () => uploadInput.click());

    uploadInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      let file = f;
      const isHeic = /heic|heif/i.test(f.type) || /\.heic$/i.test(f.name) || /\.heif$/i.test(f.name);
      if (isHeic) file = await heicToJpeg(f);

      // Load image
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);

        // Downscale to iOS-safe max side 1280
        const maxSide = 1280;
        let W = img.naturalWidth, H = img.naturalHeight;
        if (Math.max(W, H) > maxSide) {
          const s = maxSide / Math.max(W, H);
          W = (W * s) | 0;
          H = (H * s) | 0;
        }
        const work = makeCanvas(W, H, false);
        work.getContext('2d').drawImage(img, 0, 0, W, H);
        State.image = img;
        State.work  = work;
        State.hasMask = false;

        // preview shows the raw image immediately
        ensurePreviewCanvas();
        renderImagePreview(State.preview, work);

        // prepare the draw tab with the image underneath
        ensureDrawLayers();
        placeImageOnDrawBG(img);

        // enable buttons
        btnProcess && (btnProcess.disabled = false);
        btnHighlight && (btnHighlight.disabled = false);
        btnProcessSel && (btnProcessSel.disabled = false);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
  }

  /* --------------- Drawing (mask) interactions ---------------- */
  function bindDraw(maskCnv) {
    const ctx = maskCnv.getContext('2d', { willReadFrequently:true });

    function canvasPoint(ev) {
      const r = maskCnv.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
      return { x: x * (maskCnv.width / r.width), y: y * (maskCnv.height / r.height) };
    }

    function strokeTo(x, y) {
      ctx.globalCompositeOperation = State.pen.erase ? 'destination-out' : 'source-over';
      ctx.lineWidth = State.pen.size;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(State.pen.lastX, State.pen.lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      State.pen.lastX = x;
      State.pen.lastY = y;
      State.hasMask = true;
    }

    const start = (ev) => {
      if (!State.work) return;
      State.pen.down = true;
      const p = canvasPoint(ev);
      State.pen.lastX = p.x;
      State.pen.lastY = p.y;
      strokeTo(p.x, p.y);
      ev.preventDefault();
    };
    const move = (ev) => {
      if (!State.pen.down) return;
      strokeTo(...Object.values(canvasPoint(ev)));
      ev.preventDefault();
    };
    const end = () => { State.pen.down = false; };

    // touch: keep screen from scrolling while drawing
    drawHost.style.touchAction = 'none';

    maskCnv.addEventListener('mousedown', start);
    maskCnv.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    maskCnv.addEventListener('touchstart', start, { passive:false });
    maskCnv.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend', end);

    btnPen && (btnPen.onclick = () => { State.pen.erase = false; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); });
    btnEraser && (btnEraser.onclick = () => { State.pen.erase = true;  btnEraser.classList.add('active'); btnPen?.classList.remove('active'); });
  }

  function placeImageOnDrawBG(img) {
    if (!State.drawBG) return;
    const bg = State.drawBG;
    // match BG & mask to work resolution
    const W = State.work.width, H = State.work.height;
    bg.width = W; bg.height = H;
    State.mask.width = W; State.mask.height = H;
    // paint
    const c = bg.getContext('2d');
    c.clearRect(0,0,W,H);
    c.drawImage(img, 0, 0, W, H);
    // make mask empty
    const m = State.mask.getContext('2d');
    m.clearRect(0,0,W,H);
    State.hasMask = false;
  }

  /* ------------------ Simple processing ---------------------- */
  // Fast preview: reduce to k colors, optional edge outline, optional fills
  function processToPreview() {
    if (!State.work) return;
    const k =  clamp(6, 2, 10);
    const outline = !!(outlineChk?.checked ?? true);
    const addFills = !!(addFillsChk?.checked ?? true);
    const ignoreSubject = !!(noSubjectChk?.checked);

    const W = State.work.width, H = State.work.height;
    // read image data
    const src = State.work.getContext('2d').getImageData(0,0,W,H);
    const hasMask = State.hasMask && !ignoreSubject;
    const maskA = hasMask ? State.mask.getContext('2d').getImageData(0,0,W,H).data : null;

    // Build a light working set (downsample if still large)
    const step = Math.max(1, Math.floor(Math.sqrt((W*H)/250000))); // ~250k samples
    const pts = [];
    for (let y=0;y<H;y+=step) {
      const row = y*W;
      for (let x=0;x<W;x+=step) {
        const i = row+x, j = i*4;
        if (maskA && maskA[j+3] < 12) continue; // outside mask
        pts.push([src.data[j],src.data[j+1],src.data[j+2]]);
      }
    }
    // k-means-ish
    const centers = [];
    if (pts.length === 0) { centers.push([0,0,0]); }
    else {
      centers.push(pts[Math.floor(Math.random()*pts.length)]);
      while (centers.length < k && centers.length < pts.length) {
        let best = null, bd = -1;
        for (const p of pts) {
          let d = 1e9;
          for (const c of centers) {
            const dx = p[0]-c[0], dy=p[1]-c[1], dz=p[2]-c[2];
            const dd = dx*dx+dy*dy+dz*dz;
            if (dd < d) d = dd;
          }
          if (d > bd) { bd = d; best = p; }
        }
        centers.push(best.slice());
      }
      for (let it=0; it<4; it++) {
        const sum = Array.from({length:centers.length}, ()=>[0,0,0,0]);
        for (const p of pts) {
          let bi=0, bd=1e12;
          for (let i=0;i<centers.length;i++){
            const c=centers[i], dx=p[0]-c[0], dy=p[1]-c[1], dz=p[2]-c[2];
            const dd=dx*dx+dy*dy+dz*dz; if (dd<bd){bd=dd;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for (let i=0;i<centers.length;i++){
          const s=sum[i]; if (s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0];
        }
      }
    }
    // paint preview
    ensurePreviewCanvas();
    const dst = State.preview;
    const ctx = dst.getContext('2d');
    ctx.clearRect(0,0,dst.width,dst.height);
    // background: empty if mask used or "no subject" set, else keep full image reduced
    const scale = Math.min(dst.width/W, dst.height/H);
    const w = (W*scale)|0, h = (H*scale)|0, ox = (dst.width - w)>>1, oy = (dst.height - h)>>1;

    // quantize and draw to preview
    const out = ctx.createImageData(w, h);
    for (let y=0;y<h;y++){
      const sy = Math.min(H-1, Math.floor(y/scale));
      const row = sy*W;
      for (let x=0;x<w;x++){
        const sx = Math.min(W-1, Math.floor(x/scale));
        const i = row+sx, j=i*4;
        if (hasMask && maskA[j+3] < 12) {
          // transparent background when subject highlighted
          out.data[(y*w+x)*4+3] = 0;
          continue;
        }
        const r = src.data[j], g=src.data[j+1], b=src.data[j+2];
        let bi=0, bd=1e12;
        for (let c=0;c<centers.length;c++){
          const pr=centers[c][0],pg=centers[c][1],pb=centers[c][2];
          const dx=r-pr,dy=g-pg,dz=b-pb; const dd=dx*dx+dy*dy+dz*dz;
          if (dd<bd){bd=dd;bi=c;}
        }
        const o = (y*w+x)*4;
        out.data[o]   = centers[bi][0];
        out.data[o+1] = centers[bi][1];
        out.data[o+2] = centers[bi][2];
        out.data[o+3] = 255;
      }
    }
    // put image
    ctx.save();
    ctx.translate(ox, oy);
    ctx.putImageData(out, 0, 0);

    // simple stroke outline from mask (if any)
    if (outline && hasMask) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(20,24,38,0.95)';
      ctx.lineWidth = Math.max(1, Math.round(2*scale));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // trace contour quickly by stepping pixels (cheap)
      const mw = W, mh = H;
      const m = State.mask.getContext('2d').getImageData(0,0,mw,mh).data;
      ctx.beginPath();
      for (let y=0;y<mh;y+=3){
        for (let x=0;x<mw;x+=3){
          const j = (y*mw+x)*4 + 3;
          const on = m[j] > 10;
          if (!on) continue;
          // check a neighbour to form tiny segments (rough silhouette)
          const nn = ((y*mw+Math.min(mw-1,x+3))*4+3);
          if ((m[nn]||0) > 10) {
            const px = Math.round(x*scale), py = Math.round(y*scale);
            const px2= Math.round((x+3)*scale), py2= py;
            ctx.moveTo(px,py); ctx.lineTo(px2,py2);
          }
        }
      }
      ctx.stroke();
    }

    ctx.restore();

    // enable export row if present (hook your real exporters later)
    if (exportRow) exportRow.style.pointerEvents = 'auto';
  }

  function renderImagePreview(canvas, workCanvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // letterbox draw
    const scale = Math.min(canvas.width/workCanvas.width, canvas.height/workCanvas.height);
    const w = (workCanvas.width*scale)|0, h=(workCanvas.height*scale)|0;
    const x = (canvas.width-w)>>1, y=(canvas.height-h)>>1;
    ctx.drawImage(workCanvas, x, y, w, h);
  }

  /* --------------------- Wire buttons ------------------------ */
  function bindButtons() {
    if (btnHighlight) {
      btnHighlight.onclick = () => {
        // switch to draw tab
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.panel').forEach(p => p.classList.remove('active'));
        $('.tab-btn[data-tab="draw"]')?.classList.add('active');
        panels.draw?.classList.add('active');
        ensureDrawLayers();
        if (State.image) placeImageOnDrawBG(State.image);

        // scroll to draw block
        panels.draw?.scrollIntoView({ behavior:'smooth', block:'start' });
        btnPen?.click(); // default to pen
      };
    }
    if (btnProcessSel) {
      btnProcessSel.onclick = () => {
        // Use the painted mask from draw panel and process
        State.hasMask = true;
        processToPreview();
        // jump back to preview area for continuity
        previewCard?.scrollIntoView({ behavior:'smooth', block:'start' });
      };
    }
    if (btnProcess) {
      btnProcess.onclick = () => {
        State.settings.outline = !!(outlineChk?.checked ?? true);
        State.settings.addFills = !!(addFillsChk?.checked ?? true);
        State.settings.ignoreSubject = !!(noSubjectChk?.checked);
        processToPreview();
      };
    }
  }

  /* ------------------------ Init ----------------------------- */
  function init() {
    if (!panels.upload || !panels.draw) return;
    ensurePreviewCanvas();   // stable preview area from the start
    ensureDrawLayers();      // prepare draw layers

    bindUpload();
    bindButtons();

    // Keep preview host from growing: CSS already constrains height,
    // but we also keep its child canvas in sync on resize.
    window.addEventListener('resize', () => {
      if (!State.preview) return;
      const hostRect = previewHost.getBoundingClientRect();
      const cw = Math.max(300, Math.floor(hostRect.width));
      const ch = Math.max(180, Math.floor(hostRect.width * 9/16));
      State.preview.width = cw; State.preview.height = ch;
      State.preview.style.width = '100%';
      State.preview.style.height= '100%';
      if (State.work) renderImagePreview(State.preview, State.work);
    }, { passive:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();