// Easbroidery — tools (mask paint/erase/wand), text overlay, zoom bindings
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S  = (window.EAS ||= {}).state ||= {};

  // canvases
  const base = $('#canvas');         // photo
  const mask = $('#mask');           // user mask
  const edges = $('#edges');         // edge viz
  const overlay = $('#overlay');     // text + direction overlay on the stage
  const bctx = base.getContext('2d', { willReadFrequently: true });
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  const octx = overlay.getContext('2d');

  const W = 1024, H = 1024;
  [base, mask, edges, overlay].forEach(c => { c.width = W; c.height = H; });

  // -------- Mode tabs (Mask / Text / Direction) -----------
  const groups = {
    mask: $('.tools-mask'),
    text: $('.tools-text'),
    direction: $('.tools-direction')
  };
  function setMode(m) {
    S.mode = m;
    $$('#brush-controls .chip[data-mode]').forEach(ch => ch.classList.toggle('chip--active', ch.dataset.mode === m));
    Object.keys(groups).forEach(k => groups[k].classList.toggle('hidden', k !== m));
  }
  $$('#brush-controls .chip[data-mode]').forEach(ch => ch.addEventListener('click', () => setMode(ch.dataset.mode)));
  setMode('mask');

  // -------- Brush tools -----------
  S.tool = 'brush';
  S.brushSize = 18;
  $('#paint')?.addEventListener('click', () => S.tool = 'brush');
  $('#erase')?.addEventListener('click', () => S.tool = 'erase');
  $('#wand') ?.addEventListener('click', () => S.tool = 'wand');
  $('#brush-size')?.addEventListener('input', e => S.brushSize = +e.target.value);

  const UNDO = []; const REDO = [];
  const pushUndo = () => { try { UNDO.push(mctx.getImageData(0, 0, W, H)); if (UNDO.length > 40) UNDO.shift(); REDO.length = 0; } catch {} };
  $('#btn-undo')?.addEventListener('click', () => { if (!UNDO.length) return; REDO.push(mctx.getImageData(0,0,W,H)); mctx.putImageData(UNDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-redo')?.addEventListener('click', () => { if (!REDO.length) return; UNDO.push(mctx.getImageData(0,0,W,H)); mctx.putImageData(REDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-clear-mask')?.addEventListener('click', () => { pushUndo(); mctx.clearRect(0,0,W,H); window.EAS_preview.render(); });
  $('#btn-fill-mask') ?.addEventListener('click', () => { pushUndo(); mctx.fillStyle = '#000'; mctx.fillRect(0,0,W,H); window.EAS_preview.render(); });

  $('#toggle-mask') ?.addEventListener('change', e => mask.style.opacity = e.target.checked ? 1 : 0);
  $('#toggle-edges')?.addEventListener('change', e => edges.style.opacity = e.target.checked ? 1 : 0);

  function pos(ev, el) {
    const r = el.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height };
  }
  function dab(x, y, r, erase) {
    mctx.save();
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2); mctx.fillStyle = '#000'; mctx.fill();
    mctx.restore();
  }
  // flood fill wand with RGB tolerance
  function wandFill(x, y) {
    const id = bctx.getImageData(0, 0, W, H).data;
    const m  = mctx.getImageData(0, 0, W, H);
    const d  = m.data;
    const idx = (X, Y) => ((Y|0) * W + (X|0)) << 2;
    const i0 = idx(x|0, y|0);
    const r0 = id[i0], g0 = id[i0+1], b0 = id[i0+2];
    const tol = 35;
    const seen = new Uint8Array(W*H);
    const q = [[x|0, y|0]];
    while (q.length) {
      const [X, Y] = q.pop();
      if (X<0||Y<0||X>=W||Y>=H) continue;
      const p = (Y*W+X);
      if (seen[p]) continue; seen[p] = 1;
      const q4 = p<<2;
      const r = id[q4], g = id[q4+1], b = id[q4+2];
      if (Math.abs(r-r0) + Math.abs(g-g0) + Math.abs(b-b0) > tol) continue;
      d[q4]=0; d[q4+1]=0; d[q4+2]=0; d[q4+3]=255;
      q.push([X+1,Y],[X-1,Y],[X,Y+1],[X,Y-1]);
    }
    mctx.putImageData(m, 0, 0);
  }

  let painting = false, last = null;
  function down(ev) {
    if (S.mode !== 'mask') return;
    const p = pos(ev, mask);
    if (S.tool === 'wand') { pushUndo(); wandFill(p.x, p.y); window.EAS_preview.render(); ev.preventDefault(); return; }
    painting = true; last = p; pushUndo();
    dab(p.x, p.y, S.brushSize, S.tool === 'erase'); window.EAS_preview.render(); ev.preventDefault();
  }
  function move(ev) {
    if (!painting) return;
    const p = pos(ev, mask);
    const dx = p.x - last.x, dy = p.y - last.y, dist = Math.hypot(dx,dy);
    const steps = Math.max(1, (dist / (S.brushSize*0.5))|0);
    for (let i=1;i<=steps;i++) dab(last.x + dx*i/steps, last.y + dy*i/steps, S.brushSize, S.tool==='erase');
    last = p; window.EAS_preview.render(); ev.preventDefault();
  }
  function up(){ painting = false; }

  // pointer bindings
  mask.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  mask.addEventListener('touchstart', down, { passive:false });
  window.addEventListener('touchmove', move, { passive:false });
  window.addEventListener('touchend', up);

  // -------- Text controls (drawn on overlay + preview) ----------
  const T = (S.text ||= { content:'', curve:0, size:64, angle:0 });
  $('#text-string')?.addEventListener('input', e => { T.content = e.target.value; drawTextOverlay(); window.EAS_preview.render(); });
  $('#text-curve') ?.addEventListener('input', e => { T.curve  = +e.target.value; drawTextOverlay(); window.EAS_preview.render(); });
  $('#text-size')  ?.addEventListener('input', e => { T.size   = +e.target.value; drawTextOverlay(); window.EAS_preview.render(); });
  $('#text-angle') ?.addEventListener('input', e => { T.angle  = +e.target.value; drawTextOverlay(); window.EAS_preview.render(); });
  $('#apply-text') ?.addEventListener('click',       () => { drawTextOverlay(); window.EAS_preview.render(); });

  function drawTextOverlay() {
    octx.clearRect(0,0,W,H);
    if (!T.content) return;
    octx.save();
    octx.translate(W*0.5, H*0.80);
    octx.rotate((T.angle||0) * Math.PI/180);
    const r = 280, text = T.content, curve = T.curve || 0;
    octx.font = `bold ${T.size||64}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter`;
    octx.textAlign='center'; octx.textBaseline='middle'; octx.fillStyle='#222';
    if (Math.abs(curve) < 0.01) {
      octx.fillText(text, 0, 0);
    } else {
      const chars=[...text], arc=curve*Math.PI;
      for (let i=0;i<chars.length;i++){
        const a=-arc/2 + arc * (i/(Math.max(1,chars.length-1)));
        octx.save(); octx.rotate(a); octx.translate(0,-r); octx.rotate(Math.sign(curve)*Math.PI/2);
        octx.fillText(chars[i],0,0); octx.restore();
      }
    }
    octx.restore();
  }

  // -------- Zoom buttons -----------
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  $('#zoom-in')   ?.addEventListener('click',()=>{ S.zoom = clamp((S.zoom||1)+0.1,0.4,3);  window.EAS_processing.setShellTransform(); });
  $('#zoom-out')  ?.addEventListener('click',()=>{ S.zoom = clamp((S.zoom||1)-0.1,0.4,3);  window.EAS_processing.setShellTransform(); });
  $('#zoom-reset')?.addEventListener('click',()=>{ S.zoom = 1; S.panX=0; S.panY=0;       window.EAS_processing.setShellTransform(); });

  // paint initial overlay if text already present
  drawTextOverlay();
})();