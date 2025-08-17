// Handles upload + shows preview image
(() => {
  const $ = s => document.querySelector(s);
  const state = window.__loom = (window.__loom||{});

  const fileInput = $('#fileInput');
  const uploadZone = $('#uploadZone');
  const previewHost = $('#previewHost');
  const btnProcess = $('#btnProcess');
  const btnHighlight = $('#btnHighlight');
  const btnPng = $('#btnPng');

  // scroll helpers
  document.querySelectorAll('[data-scroll]').forEach(b=>{
    b.addEventListener('click', () => {
      const t = b.dataset.activate === 'draw' ? '[data-panel="draw"]' : b.dataset.scroll;
      const el = document.querySelector(t);
      el?.scrollIntoView({behavior:'smooth', block:'start'});
      if (b.dataset.activate === 'draw') switchTab('draw');
    });
  });

  // Tabs
  function switchTab(name){
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab===name);
    });
    document.querySelectorAll('.panel').forEach(p=>{
      p.classList.toggle('active', p.dataset.panel===name);
    });
  }
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click', ()=>switchTab(b.dataset.tab));
  });

  // Handle file choose/drag
  uploadZone.addEventListener('dragover', e=>{e.preventDefault(); uploadZone.classList.add('drag');});
  uploadZone.addEventListener('dragleave', ()=>uploadZone.classList.remove('drag'));
  uploadZone.addEventListener('drop', e=>{
    e.preventDefault(); uploadZone.classList.remove('drag');
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e=>{
    const f = e.target.files?.[0]; if (f) handleFile(f);
  });

  async function handleFile(file){
    try{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        state.image = img;
        URL.revokeObjectURL(url);
        ensurePreviewCanvas();
        drawPreview(img);
        previewHost.classList.remove('hidden');
        btnProcess.disabled = false;
        btnHighlight.disabled = false;
        btnPng.disabled = false;
      };
      img.src = url;
    }catch(err){
      console.error(err);
      alert('Could not read that image.');
    }
  }

  function ensurePreviewCanvas(){
    if (!state.previewCanvas){
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 800;
      previewHost.innerHTML = '';
      previewHost.appendChild(c);
      state.previewCanvas = c;
    }
  }

  function drawPreview(img){
    const c = state.previewCanvas;
    const ctx = c.getContext('2d');
    // fit image
    const wr = c.width / img.width, hr = c.height / img.height;
    const r = Math.min(wr, hr);
    const w = Math.round(img.width * r), h = Math.round(img.height * r);
    const x = Math.round((c.width - w)/2), y = Math.round((c.height - h)/2);
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(img, x, y, w, h);
    // keep rect for worker
    state.drawRect = {x,y,w,h};
  }

  // Export PNG
  btnPng.addEventListener('click', ()=>{
    if (!state.previewCanvas) return;
    const url = state.previewCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'loomabelle-preview.png'; a.click();
  });
})();