// processing.js — v1.0
(function () {
  const App = (window.App = window.App || {});
  const $ = (id)=>document.getElementById(id);

  // Wire preview/processing buttons
  const btnProcess = $('btnProcess');
  const btnHighlight = $('btnHighlight');
  const optNoSubject = $('optNoSubject');

  // Worker setup
  let worker = null;
  function ensureWorker(){
    if (worker) return worker;
    worker = new Worker('scripts/processor.worker.js', { type: 'module' });
    worker.onmessage = (ev)=>{
      const msg = ev.data || {};
      if (msg.type === 'progress'){
        // optional: hook up a progress bar later
      } else if (msg.type === 'result'){
        // update palette chips
        if (msg.payload?.palette) {
          App.setSwatches(msg.payload.palette);
        }
        App.renderProcessedPreview(msg.payload);
        // enable downloads
        $('btnDst').disabled = !msg.dst;
        $('btnExport').disabled = !msg.dst;
        if (msg.dst){
          const blob = msg.dst;
          $('btnDst').onclick = ()=>downloadBlob(blob, 'loomabelle.dst');
          $('btnExport').onclick = ()=>downloadBlob(blob, 'loomabelle.dst');
        }
        btnProcess.disabled = false;
      }
    };
    return worker;
  }

  function downloadBlob(blob, name){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  }

  // Process button
  btnProcess.addEventListener('click', ()=>{
    if (!App.state.img) return;
    btnProcess.disabled = true;

    const canvas = document.createElement('canvas');
    canvas.width = App.state.imgW;
    canvas.height = App.state.imgH;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(App.state.img,0,0,canvas.width,canvas.height);
    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);

    const mask = (optNoSubject.checked ? null : (App.state.mask || null));

    ensureWorker().postMessage({
      type:'process',
      payload:{
        img:{ data: imgData.data.buffer, width: imgData.width, height: imgData.height },
        options:{
          k: 8,
          outline: document.getElementById('optOutline').checked,
          density: parseFloat(document.getElementById('optDensity').value),
          reducePalette: document.getElementById('optPalette').checked,
        },
        mask
      }
    }, [imgData.data.buffer, mask?.buffer].filter(Boolean));

  });

  // Highlight subject: jump to Draw tab with the uploaded image underneath
  btnHighlight.addEventListener('click', ()=>{
    if (!App.state.img) return;
    App.switchTab('draw');
    window.requestAnimationFrame(()=>{
      if (App.prepareDrawSurface) App.prepareDrawSurface(); // from draw.js
    });
  });

})();