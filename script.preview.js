/* Easbroidery — wire the existing buttons to the new path engine.
   Layout is unchanged. This only attaches listeners to your
   existing canvases and buttons by id/data attributes.
*/

(function () {
  const E = (window.EAS ||= {});
  const P = E.paths;

  // Resolve canvases without changing HTML
  function byAny(ids) {
    for (const id of ids) {
      const el = document.getElementById(id) || document.querySelector(id);
      if (el) return el;
    }
    return null;
  }

  // Expected existing elements
  const maskCanvas = byAny(['mask','canvas-mask','#mask']);
  const liveCanvas = byAny(['live','liveCanvas','#live','#preview']);
  const btnGen  = document.querySelector('[data-action="gen"]') || document.getElementById('btn-generate');
  const btnPNG  = document.querySelector('[data-action="png"]') || document.getElementById('btn-png');
  const btnSVG  = document.querySelector('[data-action="svg"]') || document.getElementById('btn-svg');
  const btnJSON = document.querySelector('[data-action="json"]')|| document.getElementById('btn-json');
  const btnDST  = document.querySelector('[data-action="dst"]') || document.getElementById('btn-dst');
  const angleInp = document.querySelector('[data-angle]');
  const spaceInp = document.querySelector('[data-spacing]');
  const stepInp  = document.querySelector('[data-step]');

  let lastResult = null;

  function gatherOpts() {
    const o = {};
    if (angleInp) o.angleDeg = +angleInp.value || 45;
    if (spaceInp) o.hatchSpacing = +spaceInp.value || 6;
    if (stepInp)  o.step = +stepInp.value || 3;
    return o;
  }

  function ensureLiveSize() {
    if (!liveCanvas) return;
    const rect = liveCanvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      liveCanvas.width  = rect.width  | 0;
      liveCanvas.height = rect.height | 0;
    }
  }

  async function generate() {
    if (!maskCanvas) return;
    ensureLiveSize();
    lastResult = P.generate(maskCanvas, gatherOpts());
    if (liveCanvas) {
      P.preview(liveCanvas, lastResult);
    }
  }

  // Buttons
  if (btnGen)  btnGen.addEventListener('click', generate);
  if (angleInp) angleInp.addEventListener('input', generate);
  if (spaceInp) spaceInp.addEventListener('input', generate);
  if (stepInp)  stepInp.addEventListener('input', generate);

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  if (btnPNG && liveCanvas) {
    btnPNG.addEventListener('click', () => {
      liveCanvas.toBlob(b => download('stitches.png', b), 'image/png');
    });
  }

  if (btnSVG) {
    btnSVG.addEventListener('click', () => {
      if (!lastResult) return;
      const svg = P.exportSVG(lastResult);
      download('stitches.svg', new Blob([svg], {type:'image/svg+xml'}));
    });
  }

  if (btnJSON) {
    btnJSON.addEventListener('click', () => {
      if (!lastResult) return;
      const json = P.exportJSON(lastResult);
      download('stitches.json', new Blob([json], {type:'application/json'}));
    });
  }

  if (btnDST) {
    btnDST.addEventListener('click', () => {
      if (!lastResult) return;
      const dst = P.exportDST(lastResult);
      download('stitches.dst', new Blob([dst], {type:'application/octet-stream'}));
    });
  }

  // expose for other modules without touching layout
  E.preview = { generate: () => generate(), last: () => lastResult };
})();