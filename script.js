/* Loomabelle — script.js v39
   - Draw tab now has its own "Process Selection" button.
   - Highlight Subject switches to Draw, shows the photo beneath the canvas,
     and auto-disables "No subject" so your traced mask is used.
   - Processing pipeline is shared by both tabs. Keeps your HTML/CSS/layout unchanged.
*/

(function () {
  'use strict';

  const READY = (fn) =>
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const DPR = () => window.devicePixelRatio || 1;

  READY(() => {
    /* Year */
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    /* Tabs */
    const tabs = $$('.tabs .tab-btn');
    const panels = $$('.panel');
    function activateTab(key) {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
      panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
    }
    tabs.forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
    $$('[data-scroll="#tabs"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        $('#tabs')?.scrollIntoView({ behavior: 'smooth' });
        const label = (btn.textContent || '').toLowerCase();
        activateTab(label.includes('drawing') ? 'draw' : 'upload');
      });
    });

    /* Upload panel wiring */
    const upPanel = $('.panel[data-panel="upload"]');
    const upZone = upPanel?.querySelector('.upload-zone');
    const upInput = upZone?.querySelector('input[type="file"]');
    const prevCard = upPanel?.querySelector('.card.rose');
    const prevHost = upPanel?.querySelector('.preview');
    const fmtBar = upPanel?.querySelector('.formats');

    if (!upZone || !upInput || !prevCard || !prevHost || !fmtBar) {
      console.warn('[Loomabelle] Upload panel structure not found.');
      return;
    }

    // enable file input
    upInput.removeAttribute('disabled');
    upInput.accept = 'image/*,.jpg,.jpeg,.png,.gif,.heic,.heif';

    // hide preview + export row initially
    prevCard.classList.add('hidden');
    fmtBar.style.display = 'none';

    // preview canvas
    const prevCanvas = document.createElement('canvas');
    prevCanvas.style.width = '100%';
    prevCanvas.style.height = '100%';
    prevHost.innerHTML = '';
    prevHost.appendChild(prevCanvas);
    const pctx = prevCanvas.getContext('2d', { willReadFrequently: true });

    // control row above export buttons (upload panel)
    const ctrlRow = document.createElement('div');
    ctrlRow.style.display = 'flex';
    ctrlRow.style.flexWrap = 'wrap';
    ctrlRow.style.gap = '10px';
    ctrlRow.style.marginTop = '10px';

    const processBtn = Object.assign(document.createElement('button'), {
      className: 'btn soft',
      textContent: 'Process Photo',
      disabled: true
    });
    const highlightBtn = Object.assign(document.createElement('button'), {
      className: 'btn soft',
      textContent: 'Highlight Subject'
    });

    const noSubjectWrap = document.createElement('label');
    noSubjectWrap.style.display = 'flex';
    noSubjectWrap.style.alignItems = 'center';
    noSubjectWrap.style.gap = '6px';
    const noSubjectChk = Object.assign(document.createElement('input'), {
      type: 'checkbox',
      checked: true
    });
    noSubjectWrap.append(noSubjectChk, document.createTextNode('No subject'));

    const fillsWrap = document.createElement('label');
    fillsWrap.style.display = 'flex';
    fillsWrap.style.alignItems = 'center';
    fillsWrap.style.gap = '6px';
    const fillsChk = Object.assign(document.createElement('input'), {
      type: 'checkbox',
      checked: true
    });
    fillsWrap.append(fillsChk, document.createTextNode('Add fills'));

    ctrlRow.append(processBtn, highlightBtn, noSubjectWrap, fillsWrap);
    fmtBar.parentNode.insertBefore(ctrlRow, fmtBar);
    ctrlRow.style.display = 'none';

    /* Draw panel wiring */
    const drawPanel = $('.panel[data-panel="draw"]');
    const drawHost = drawPanel?.querySelector('.canvas');
    const toolsBar = drawPanel?.querySelector('.toolbar');

    const drawCanvas = document.createElement('canvas');
    drawCanvas.style.width = '100%';
    drawCanvas.style.height = '100%';
    drawHost.innerHTML = '';
    drawHost.appendChild(drawCanvas);
    const dctx = drawCanvas.getContext('2d', { willReadFrequently: true });

    // small control row for draw panel
    const drawCtrl = document.createElement('div');
    drawCtrl.style.display = 'flex';
    drawCtrl.style.flexWrap = 'wrap';
    drawCtrl.style.gap = '10px';
    drawCtrl.style.marginTop = '10px';
    const processSelectionBtn = Object.assign(document.createElement('button'), {
      className: 'btn soft',
      textContent: 'Process Selection'
    });
    drawCtrl.append(processSelectionBtn);
    toolsBar.parentNode.insertBefore(drawCtrl, toolsBar.nextSibling);

    /* shared state */
    const STATE = {
      bmp: null,
      iw: 0,
      ih: 0,
      drawMaskDirty: false
    };

    function fitCanvasToHost(canvas, host) {
      const s = DPR();
      const w = host.clientWidth || 640;
      const h = host.clientHeight || Math.round((w * 9) / 16);
      canvas.width = Math.max(1, Math.round(w * s));
      canvas.height = Math.max(1, Math.round(h * s));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function drawPreview() {
      if (!STATE.bmp) return;
      fitCanvasToHost(prevCanvas, prevHost);
      const W = prevCanvas.width / DPR();
      const H = prevCanvas.height / DPR();
      const scale = Math.min(W / STATE.iw, H / STATE.ih);
      const w = Math.max(1, Math.round(STATE.iw * scale));
      const h = Math.max(1, Math.round(STATE.ih * scale));
      const ox = (W - w) / 2,
        oy = (H - h) / 2;

      pctx.imageSmoothingEnabled = true;
      pctx.clearRect(0, 0, W, H);
      pctx.drawImage(STATE.bmp, ox, oy, w, h);
      pctx.strokeStyle = 'rgba(0,0,0,.08)';
      pctx.lineWidth = 1;
      pctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
    window.addEventListener('resize', () => requestAnimationFrame(drawPreview));

    function sizeDraw(keep) {
      const s = DPR();
      const w = drawHost.clientWidth || 640;
      const h = drawHost.clientHeight || Math.round((w * 9) / 16);
      let old = null;
      if (keep) {
        try {
          old = dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
        } catch (_) {}
      }
      drawCanvas.width = Math.max(1, Math.round(w * s));
      drawCanvas.height = Math.max(1, Math.round(h * s));
      dctx.setTransform(s, 0, 0, s, 0, 0);
      dctx.lineCap = 'round';
      dctx.lineJoin = 'round';
      dctx.lineWidth = 4;
      dctx.strokeStyle = '#111827';
      if (old && old.width && old.height) {
        const tmp = document.createElement('canvas');
        tmp.width = old.width;
        tmp.height = old.height;
        tmp.getContext('2d').putImageData(old, 0, 0);
        dctx.drawImage(tmp, 0, 0, w, h);
      } else {
        dctx.clearRect(0, 0, w, h);
      }
    }
    window.addEventListener('resize', () => requestAnimationFrame(() => sizeDraw(true)));
    sizeDraw(false);

    // enable Pen/Eraser
    const [penBtn, eraserBtn] = Array.from(toolsBar.children);
    [penBtn, eraserBtn].forEach((b) => b.removeAttribute('disabled'));
    penBtn.classList.add('active');
    let tool = 'pen';
    penBtn.addEventListener('click', () => {
      tool = 'pen';
      penBtn.classList.add('active');
      eraserBtn.classList.remove('active');
    });
    eraserBtn.addEventListener('click', () => {
      tool = 'eraser';
      eraserBtn.classList.add('active');
      penBtn.classList.remove('active');
    });

    // drawing interactions
    drawCanvas.style.touchAction = 'none';
    let drawing = false,
      pid = null;
    function pt(ev, el) {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    drawCanvas.addEventListener('pointerdown', (ev) => {
      const p = pt(ev, drawCanvas);
      drawCanvas.setPointerCapture(ev.pointerId);
      pid = ev.pointerId;
      drawing = true;
      ev.preventDefault();
      dctx.beginPath();
      dctx.moveTo(p.x, p.y);
      dctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    });
    drawCanvas.addEventListener('pointermove', (ev) => {
      if (!drawing || ev.pointerId !== pid) return;
      ev.preventDefault();
      const p = pt(ev, drawCanvas);
      dctx.lineTo(p.x, p.y);
      dctx.stroke();
      STATE.drawMaskDirty = true;
    });
    const endDraw = (ev) => {
      if (ev.pointerId !== pid) return;
      drawing = false;
      pid = null;
      try {
        drawCanvas.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      dctx.globalCompositeOperation = 'source-over';
    };
    drawCanvas.addEventListener('pointerup', endDraw);
    drawCanvas.addEventListener('pointercancel', endDraw);

    /* load image helpers */
    async function fileToBitmap(file) {
      try {
        return await createImageBitmap(file);
      } catch (_) {
        const url = URL.createObjectURL(file);
        const img = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = url;
        });
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        off.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        return await createImageBitmap(off);
      }
    }

    async function handleFile(file) {
      STATE.bmp = await fileToBitmap(file);
      STATE.iw = STATE.bmp.width;
      STATE.ih = STATE.bmp.height;
      STATE.drawMaskDirty = false;

      prevCard.classList.remove('hidden');
      ctrlRow.style.display = 'flex';
      processBtn.disabled = false;
      fmtBar.style.display = 'none';

      // clear previous draw
      sizeDraw(false);
      drawHost.style.backgroundImage = 'none';

      drawPreview();
    }

    // upload events
    upZone.addEventListener('click', (e) => {
      if (e.target.closest('input,button,a,label')) return;
      upInput.click();
    });
    upZone.addEventListener('dragover', (e) => e.preventDefault());
    upZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) await handleFile(f);
    });
    upInput.addEventListener('change', async () => {
      const f = upInput.files && upInput.files[0];
      if (f) await handleFile(f);
    });

    /* Highlight Subject → go to draw with faint photo underlay, auto-use mask */
    highlightBtn.addEventListener('click', () => {
      activateTab('draw');
      if (!STATE.bmp) return;
      // ensure mask will be used
      noSubjectChk.checked = false;

      const w = drawHost.clientWidth || 640,
        h = drawHost.clientHeight || Math.round((w * 9) / 16);
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const o = off.getContext('2d');
      o.fillStyle = '#fff';
      o.fillRect(0, 0, w, h);
      const scale = Math.min(w / STATE.iw, h / STATE.ih);
      const dw = Math.round(STATE.iw * scale),
        dh = Math.round(STATE.ih * scale);
      const ox = (w - dw) / 2,
        oy = (h - dh) / 2;
      o.imageSmoothingEnabled = true;
      o.globalAlpha = 0.75;
      o.drawImage(STATE.bmp, ox, oy, dw, dh);
      drawHost.style.backgroundImage = `url(${off.toDataURL('image/png')})`;
      drawHost.style.backgroundPosition = 'center';
      drawHost.style.backgroundRepeat = 'no-repeat';
      drawHost.style.backgroundSize = 'contain';
    });

    /* ---- processing helpers (shared) ---- */
    function previewBoxDims() {
      const W = prevCanvas.width / DPR(),
        H = prevCanvas.height / DPR();
      const scale = Math.min(W / STATE.iw, H / STATE.ih);
      const w = Math.max(1, Math.round(STATE.iw * scale));
      const h = Math.max(1, Math.round(STATE.ih * scale));
      const ox = (W - w) / 2,
        oy = (H - h) / 2;
      return { W, H, w, h, ox, oy };
    }

    function getUserMaskAtSize(w, h) {
      if (!STATE.drawMaskDirty) return null;
      const m = document.createElement('canvas');
      m.width = w;
      m.height = h;
      const mc = m.getContext('2d');
      mc.drawImage(drawCanvas, 0, 0, w, h);
      const id = mc.getImageData(0, 0, w, h);
      const d = id.data;
      let c = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = a > 24 ? 255 : 0;
        if (a > 24) c++;
      }
      if (c < 40) return null;
      mc.putImageData(id, 0, 0);
      return m;
    }

    function sobel(imgData) {
      const { width: w, height: h, data: d } = imgData;
      const g = new Uint8ClampedArray(w * h);
      const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let sx = 0,
            sy = 0,
            n = 0;
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
              const ix = ((y + j) * w + (x + i)) << 2;
              const L = lum(d[ix], d[ix + 1], d[ix + 2]);
              sx += gx[n] * L;
              sy += gy[n] * L;
              n++;
            }
          g[y * w + x] = Math.min(255, Math.hypot(sx, sy) | 0);
        }
      }
      return g;
    }

    function posterize(imgData, levels) {
      const { width: w, height: h, data: d } = imgData;
      const step = 255 / Math.max(2, levels);
      const q = (x) => (Math.round(x / step) * step) | 0;
      const out = new ImageData(w, h);
      for (let i = 0; i < d.length; i += 4) {
        out.data[i] = q(d[i]);
        out.data[i + 1] = q(d[i + 1]);
        out.data[i + 2] = q(d[i + 2]);
        out.data[i + 3] = d[i + 3];
      }
      return out;
    }

    function fitPreviewCanvas() {
      fitCanvasToHost(prevCanvas, prevHost);
      return previewBoxDims();
    }

    async function processCurrent() {
      if (!STATE.bmp) return;

      // ensure host sized and clean
      const box = fitPreviewCanvas();
      const W = prevCanvas.width / DPR(),
        H = prevCanvas.height / DPR();

      // working canvas at preview content size
      const off = document.createElement('canvas');
      off.width = box.w;
      off.height = box.h;
      const o = off.getContext('2d', { willReadFrequently: true });
      o.imageSmoothingEnabled = true;
      o.drawImage(STATE.bmp, 0, 0, box.w, box.h);

      // optional mask from draw tab
      let maskCanvas = null;
      if (!noSubjectChk.checked) {
        maskCanvas = getUserMaskAtSize(box.w, box.h);
      }
      if (maskCanvas) {
        o.globalCompositeOperation = 'destination-in';
        o.drawImage(maskCanvas, 0, 0);
        o.globalCompositeOperation = 'source-over';
      }

      // outline + optional fill
      const id = o.getImageData(0, 0, box.w, box.h);

      // paint to visible preview
      pctx.clearRect(0, 0, W, H);
      pctx.save();
      pctx.translate(box.ox, box.oy);

      if (fillsChk.checked) {
        const fill = posterize(id, 5);
        o.putImageData(fill, 0, 0);
        pctx.drawImage(off, 0, 0);
      }

      const edges = sobel(id);
      const line = o.createImageData(box.w, box.h);
      for (let i = 0; i < edges.length; i++) {
        const v = edges[i];
        const j = i * 4;
        const a = v > 96 ? 255 : 0; // keep bg clean
        line.data[j] = 20;
        line.data[j + 1] = 24;
        line.data[j + 2] = 31;
        line.data[j + 3] = a;
      }
      o.putImageData(line, 0, 0);
      pctx.drawImage(off, 0, 0);

      pctx.restore();
      pctx.strokeStyle = 'rgba(0,0,0,.08)';
      pctx.lineWidth = 1;
      pctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      // show export buttons now that we have a result
      fmtBar.style.display = 'flex';
    }

    // hook up both buttons
    processBtn.addEventListener('click', () => processCurrent());
    processSelectionBtn.addEventListener('click', () => {
      // make sure preview card is visible when processing from draw tab
      prevCard.classList.remove('hidden');
      ctrlRow.style.display = 'flex';
      fmtBar.style.display = 'none';
      $('#tabs').scrollIntoView({ behavior: 'smooth' });
      activateTab('upload'); // results always render in the preview box
      requestAnimationFrame(processCurrent);
    });

    // resize reactions
    window.addEventListener('resize', () => {
      if (STATE.bmp) drawPreview();
    });
  });
})();