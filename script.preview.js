/* Easbroidery — wire existing UI to the path engine.
   Layout is unchanged. This file only finds your current elements and attaches handlers.
*/
(function () {
  const P = (window.EAS && window.EAS.paths) || {};
  if (!P.generate) return;

  // tolerate your original ids/classes
  const q = (selArr) => {
    for (const s of selArr) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  // canvases already present in your layout
  const maskCanvas = q(['#editCanvas', '#maskCanvas', '#mask', 'canvas.edit']);
  const liveCanvas = q(['#previewCanvas', '#liveCanvas', '#live', 'canvas.live']);

  // optional controls (if absent, defaults are used)
  const angleInput   = q(['#angle',   'input[name="angle"]']);
  const spacingInput = q(['#spacing', 'input[name="spacing"]']);
  const stepInput    = q(['#step',    'input[name="step"]']);

  // buttons that already exist in your layout
  const btnGen  = q(['#btn-generate', '.btn-generate']);
  const btnPNG  = q(['#btn-png', '.btn-png']);
  const btnSVG  = q(['#btn-svg', '.btn-svg']);
  const btnJSON = q(['#btn-json', '.btn-json']);
  const btnDST  = q(['#btn-dst', '.btn-dst']);

  const showPreviewChk = q(['#toggle-stitch', 'input[name="showStitch"]']);

  let last = null;

  function currentOpts() {
    const angle = angleInput ? Number(angleInput.value || angleInput.dataset.value || 45) : 45;
    const spacing = spacingInput ? Number(spacingInput.value || spacingInput.dataset.value || 6) : 6;
    const step = stepInput ? Number(stepInput.value || stepInput.dataset.value || 3) : 3;
    return { angleDeg: angle, hatchSpacing: spacing, step };
  }

  function generate() {
    if (!maskCanvas) return;
    last = P.generate(maskCanvas, currentOpts());
    if (liveCanvas && (!showPreviewChk || showPreviewChk.checked)) {
      P.preview(liveCanvas, last);
    } else if (liveCanvas) {
      const ctx = liveCanvas.getContext('2d');
      ctx.clearRect(0,0,liveCanvas.width, liveCanvas.height);
    }
  }

  // wire events
  if (btnGen) btnGen.addEventListener('click', generate);
  [angleInput, spacingInput, stepInput].forEach((el)=> el && el.addEventListener('input', generate));
  if (showPreviewChk) showPreviewChk.addEventListener('change', () => { if (last && liveCanvas && showPreviewChk.checked) P.preview(liveCanvas, last); });

  function download(name, blob) {
    const a = document.createElement('a');
    a.download = name; a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  if (btnPNG) btnPNG.addEventListener('click', () => {
    if (!liveCanvas || !last) return;
    // redraw once at full resolution
    const temp = document.createElement('canvas');
    temp.width = last.stats.w; temp.height = last.stats.h;
    P.preview(temp, last);
    temp.toBlob((b)=> download('easbroidery.png', b), 'image/png');
  });

  if (btnSVG) btnSVG.addEventListener('click', () => {
    if (!last) return;
    const svg = P.exportSVG(last);
    download('easbroidery.svg', new Blob([svg], { type: 'image/svg+xml' }));
  });

  if (btnJSON) btnJSON.addEventListener('click', () => {
    if (!last) return;
    const json = P.exportJSON(last);
    download('stitches.json', new Blob([json], { type: 'application/json' }));
  });

  if (btnDST) btnDST.addEventListener('click', () => {
    if (!last) return;
    const u8 = P.exportDST(last);
    download('easbroidery.dst', new Blob([u8], { type: 'application/octet-stream' }));
  });

  // run once if the page already has a mask
  if (maskCanvas && maskCanvas.width && maskCanvas.height) generate();
})();