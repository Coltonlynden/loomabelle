// v1 — Preview controls (process / highlight / export)

const S = window.Looma;
const { getWorker, showTab } = window.LoomaAPI;
const { paintPreview, runProgress, updateProgress } = window.LoomaDraw || {};

const previewHost = document.getElementById('preview-host');
const preview = document.getElementById('lb-preview');

document.getElementById('btn-highlight').addEventListener('click', ()=>{
  if (!S.img) return;
  showTab('draw');
});

document.getElementById('btn-process').addEventListener('click', ()=>{
  if (!S.img) return;
  const worker = getWorker();
  runProgress(true, 'Processing…');

  const msg = {
    type:'process',
    image: S.work.getContext('2d').getImageData(0,0,S.work.width,S.work.height),
    mask: S.options.noSubject ? null : null, // full image unless mask from draw tab
    options: S.options
  };
  worker.onmessage = (e)=>{
    const m = e.data;
    if (m.type==='progress'){ updateProgress(m.value, m.note); }
    if (m.type==='result'){
      S.previewImage = m.preview;
      S.stitches = m.dst || null;
      paintPreview();
      runProgress(false);
      document.getElementById('btn-png').disabled = false;
      document.getElementById('btn-dst').disabled = !S.stitches;
      document.getElementById('btn-exp').disabled = true;
    }
  };
  worker.postMessage(msg, [msg.image.data.buffer]);
});

/* exports */
document.getElementById('btn-png').addEventListener('click', ()=>{
  if (!S.previewImage) return;
  const c = document.createElement('canvas');
  c.width = S.previewImage.width; c.height = S.previewImage.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.previewImage.data), c.width, c.height),0,0);
  c.toBlob(b=>{
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download='loomabelle.png'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  });
});

document.getElementById('btn-dst').addEventListener('click', ()=>{
  if (!S.stitches) return;
  const blob = new Blob([S.stitches], {type:'application/octet-stream'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='loomabelle.dst'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
});

/* keep preview hidden until first image chosen */
previewHost.classList.add('hidden');
