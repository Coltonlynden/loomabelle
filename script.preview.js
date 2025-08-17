// Preview panel actions (Process Photo, PNG export already in upload)
// Also wires "Process Photo" to worker & progress overlay
(() => {
  const $ = s => document.querySelector(s);
  const state = window.__loom = (window.__loom||{});

  const processBtn = $('#btnProcess');
  const progressOverlay = $('#progressOverlay');
  const progressFill = $('#progressFill');
  const progressText = $('#progressText');

  function showProgress(txt='Processing…'){
    progressText.textContent = txt;
    progressFill.style.width='0%';
    progressOverlay.classList.remove('hidden');
  }
  function updateProgress(p){ progressFill.style.width = `${Math.max(0, Math.min(100, p))}%`; }
  function hideProgress(){ progressOverlay.classList.add('hidden'); }

  // attach to worker wrapper so draw tab can reuse
  window.__processWithWorker = async function(opts){
    if (!state.image || !state.previewCanvas) return;
    showProgress('Processing…');
    try{
      await window.__loom_workerProcess(opts, updateProgress);
    } finally {
      hideProgress();
    }
  };

  processBtn.addEventListener('click', async ()=>{
    if (!state.image) { alert('Upload a photo first.'); return; }
    await window.__processWithWorker({
      kind:'process',
      image: state.image,
      hostCanvas: state.previewCanvas,
      rect: state.drawRect,
      density: +document.getElementById('density').value,
      edges: document.getElementById('optEdges').checked,
      posterize: document.getElementById('optPosterize').checked,
      removeBg: !document.getElementById('noSubject').checked
    });
  });

  // year
  document.getElementById('year').textContent = new Date().getFullYear();
})();