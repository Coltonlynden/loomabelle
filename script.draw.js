/* script.draw.js
   Shows the right tool group when you click Mask / Text / Direction.
   Also sets up minimal state so other scripts can read it.
*/

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const add  = (el, cls) => el && el.classList.add(cls);
  const rm   = (el, cls) => el && el.classList.remove(cls);
  const hide = el => add(el, 'hidden');
  const show = el => rm(el, 'hidden');

  // ----- global state container (lightweight) -----
  const EAS = (window.EAS ||= {});
  const S = (EAS.state ||= {
    brushMode: 'mask',
    tool: 'brush',
    brushSize: 20,
    zoom: 1, panX: 0, panY: 0,
    text: { content: '', curve: 0, size: 60, angle: 0 },
    dirAngle: 45, dirPattern: 'fill'
  });

  // ----- canvas defaults so the stage is visible -----
  const CAN = {
    base: $('#canvas'),
    mask: $('#mask'),
    preview: $('#preview')
  };
  for (const k of Object.values(CAN)) {
    if (!k) continue;
    if (!k.width)  k.width  = 1024;
    if (!k.height) k.height = 1024;
  }

  // ----- MODE TOGGLING -----
  const chips = $$('#brush-controls .chip[data-mode]');
  const grpMask = $('.tools-mask');
  const grpText = $('.tools-text');
  const grpDir  = $('.tools-direction');

  function setMode(mode) {
    S.brushMode = mode;

    // visual chip state
    chips.forEach(c => rm(c, 'chip--active'));
    const active = chips.find(c => c.dataset.mode === mode);
    if (active) add(active, 'chip--active');

    // show the matching group
    if (mode === 'mask') { show(grpMask); hide(grpText); hide(grpDir); }
    if (mode === 'text') { hide(grpMask); show(grpText); hide(grpDir); }
    if (mode === 'direction') { hide(grpMask); hide(grpText); show(grpDir); }
  }

  chips.forEach(c => c.addEventListener('click', () => setMode(c.dataset.mode)));
  setMode('mask'); // default on load

  // ----- MASK tool buttons (only affects state; your processing code can read S.tool) -----
  $('#brush-size')?.addEventListener('input', e => (S.brushSize = +e.target.value));
  $('#paint')?.addEventListener('click', () => (S.tool = 'brush'));
  $('#erase')?.addEventListener('click', () => (S.tool = 'erase'));
  $('#wand') ?.addEventListener('click', () => (S.tool = 'wand'));

  // ----- TEXT controls -> update state then let preview script redraw -----
  $('#text-string')?.addEventListener('input', e => (S.text.content = e.target.value));
  $('#apply-text')?.addEventListener('click', () => {
    // downstream script.preview.js should read S.text and draw
    if (window.EAS_preview?.render) window.EAS_preview.render();
  });
  $('#text-curve')?.addEventListener('input', e => {
    S.text.curve = +e.target.value; window.EAS_preview?.render?.();
  });
  $('#text-size')?.addEventListener('input', e => {
    S.text.size = +e.target.value; window.EAS_preview?.render?.();
  });
  $('#text-angle')?.addEventListener('input', e => {
    S.text.angle = +e.target.value; window.EAS_preview?.render?.();
  });

  // ----- DIRECTION controls -----
  $('#pattern')?.addEventListener('change', e => {
    S.dirPattern = e.target.value; window.EAS_preview?.render?.();
  });
  $('#show-dir')?.addEventListener('change', () => window.EAS_preview?.render?.());

  // ----- Zoom buttons (optional but harmless) -----
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  $('#zoom-in')   ?.addEventListener('click', () => { S.zoom = clamp((S.zoom||1)+0.1, 0.4, 3);  window.EAS_preview?.fit?.(); });
  $('#zoom-out')  ?.addEventListener('click', () => { S.zoom = clamp((S.zoom||1)-0.1, 0.4, 3);  window.EAS_preview?.fit?.(); });
  $('#zoom-reset')?.addEventListener('click', () => { S.zoom = 1; S.panX = 0; S.panY = 0;     window.EAS_preview?.fit?.(); });

  // expose for other scripts
  window.EAS_draw = { setMode };
})();