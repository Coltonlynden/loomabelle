// Painting tools (fixed) + wand + text + direction + zoom
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S = (window.EAS ||= {}).state ||= {};

  // defaults
  Object.assign(S, { mode: 'mask', tool: 'paint', brushSize: 22, dirAngle: 45, showDir: true, zoom: 1, panX: 0, panY: 0 });

  const baseCtx = $('#canvas').getContext('2d', { willReadFrequently: true });
  const mask = $('#mask');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  mask.width = mask.height = 1024;
  mctx.imageSmoothingEnabled = false;

  // mode buttons visibility
  const chips = $$('#brush-controls .chip[data-mode]');
  const gMask = $('.tools-mask'), gText = $('.tools-text'), gDir = $('.tools-direction');
  function setMode(m) {
    S.mode = m;
    chips.forEach(c => c.classList.toggle('chip--active', c.dataset.mode === m));
    gMask.classList.toggle('hidden', m !== 'mask');
    gText.classList.toggle('hidden', m !== 'text');
    gDir.classList.toggle('hidden', m !== 'direction');
  }
  chips.forEach(c => c.addEventListener('click', () => setMode(c.dataset.mode)));
  setMode('mask');

  // tool selection
  function setTool(t) {
    S.tool = t;
    ['paint', 'erase', 'wand'].forEach(id => $('#' + id).classList.toggle('chip--active', id === t));
  }
  $('#paint').addEventListener('click', () => setTool('paint'));
  $('#erase').addEventListener('click', () => setTool('erase'));
  $('#wand').addEventListener('click', () => setTool('wand'));
  $('#brush-size').addEventListener('input', e => S.brushSize = +e.target.value);

  $('#toggle-mask').addEventListener('change', e => $('#overlay').style.display = e.target.checked ? 'block' : 'none');
  $('#toggle-edges').addEventListener('change', e => $('#edges').style.display = e.target.checked ? 'block' : 'none');

  // --- painting on mask (now reliable) ---
  const pos = (ev, el) => {
    const r = el.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    const x = (p.clientX - r.left) * 1024 / r.width;
    const y = (p.clientY - r.top) * 1024 / r.height;
    return { x, y };
  };
  function dab(x, y, r, erase) {
    mctx.save();
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fillStyle = '#000';
    mctx.fill();
    mctx.restore();
  }

  const UNDO = []; const REDO = [];
  function pushUndo() {
    try { UNDO.push(mctx.getImageData(0, 0, 1024, 1024)); if (UNDO.length > 40) UNDO.shift(); REDO.length = 0; } catch {}
  }
  $('#btn-undo').addEventListener('click', () => { if (!UNDO.length) return; REDO.push(mctx.getImageData(0, 0, 1024, 1024)); mctx.putImageData(UNDO.pop(), 0, 0); window.EAS_preview.render(); });
  $('#btn-redo').addEventListener('click', () => { if (!REDO.length) return; UNDO.push(mctx.getImageData(0, 0, 1024, 1024)); mctx.putImageData(REDO.pop(), 0, 0); window.EAS_preview.render(); });
  $('#btn-clear-mask').addEventListener('click', () => { pushUndo(); mctx.clearRect(0, 0, 1024, 1024); window.EAS_preview.render(); });
  $('#btn-fill-mask').addEventListener('click', () => { pushUndo(); mctx.globalCompositeOperation = 'source-over'; mctx.fillStyle = '#000'; mctx.fillRect(0, 0, 1024, 1024); window.EAS_preview.render(); });

  let painting = false, last = null;
  function down(ev) {
    if (S.mode !== 'mask') return; // only paint in mask mode
    ev.preventDefault();
    if (S.tool === 'wand') {
      const p = pos(ev, mask);
      floodWand(p.x | 0, p.y | 0);
      window.EAS_preview.render();
      return;
    }
    pushUndo();
    painting = true;
    last = pos(ev, mask);
    dab(last.x, last.y, S.brushSize, S.tool === 'erase');
    window.EAS_preview.render();
  }
  function move(ev) {
    if (!painting) return;
    ev.preventDefault();
    const p = pos(ev, mask);
    const dx = p.x - last.x, dy = p.y - last.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, (dist / (S.brushSize * 0.4)) | 0);
    for (let i = 1; i <= steps; i++) {
      dab(last.x + dx * i / steps, last.y + dy * i / steps, S.brushSize, S.tool === 'erase');
    }
    last = p;
    window.EAS_preview.render();
  }
  function up() { painting = false; }

  mask.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);

  mask.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up, { passive: false });

  // --- flood wand uses ORIGINAL src so it’s stable ---
  function floodWand(x, y) {
    if (!S.srcData) return;
    pushUndo();
    const W = 1024, H = 1024;
    const src = S.srcData.data;
    const out = mctx.getImageData(0, 0, W, H);
    const m = out.data;
    const seen = new Uint8Array(W * H);
    const q = [[x, y]];
    const i0 = ((y * W + x) << 2);
    const r0 = src[i0], g0 = src[i0 + 1], b0 = src[i0 + 2];
    const tol = 38;
    const idx = (X, Y) => ((Y * W + X) << 2);
    while (q.length) {
      const [X, Y] = q.pop();
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const p = Y * W + X;
      if (seen[p]) continue; seen[p] = 1;
      const i = idx(X, Y);
      const r = src[i], g = src[i + 1], b = src[i + 2];
      if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > tol) continue;
      m[i] = 0; m[i + 1] = 0; m[i + 2] = 0; m[i + 3] = 255;
      q.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]);
    }
    mctx.putImageData(out, 0, 0);
  }

  // text + direction + zoom (unchanged hookups)
  const T = (S.text ||= { content: '', curve: 0, size: 64, angle: 0 });
  $('#text-string').addEventListener('input', e => { T.content = e.target.value; window.EAS_preview.render(); });
  $('#text-curve').addEventListener('input', e => { T.curve = +e.target.value; window.EAS_preview.render(); });
  $('#text-size').addEventListener('input', e => { T.size = +e.target.value; window.EAS_preview.render(); });
  $('#text-angle').addEventListener('input', e => { T.angle = +e.target.value; window.EAS_preview.render(); });
  $('#apply-text').addEventListener('click', () => window.EAS_preview.render());

  const dirA = $('#dir-angle'), dirV = $('#dir-angle-value'), dirT = $('#toggle-dir');
  dirA.addEventListener('input', e => { S.dirAngle = +e.target.value; dirV.textContent = S.dirAngle + '°'; window.EAS_preview.render(); });
  dirT.addEventListener('change', () => { S.showDir = dirT.checked; window.EAS_preview.render(); });

  $('#zoom-in').addEventListener('click', () => { S.zoom = Math.min((S.zoom || 1) + 0.1, 3); window.EAS_processing.setShellTransform(); });
  $('#zoom-out').addEventListener('click', () => { S.zoom = Math.max((S.zoom || 1) - 0.1, 0.4); window.EAS_processing.setShellTransform(); });
  $('#zoom-reset').addEventListener('click', () => { S.zoom = 1; S.panX = 0; S.panY = 0; window.EAS_processing.setShellTransform(); });

  // exports + generate (delegated)
  $('#btn-make').addEventListener('click', () => window.EAS_processing.generate());
  $('#dl-png').addEventListener('click', () => window.EAS_processing.exportPNG());
  $('#dl-svg').addEventListener('click', () => window.EAS_processing.exportSVG());
  $('#dl-json').addEventListener('click', () => window.EAS_processing.exportJSON());
  $('#dl-dst').addEventListener('click', () => window.EAS_processing.exportDST());
})();