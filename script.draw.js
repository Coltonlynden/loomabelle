// Drawing & highlight subject
(() => {
  const $ = s => document.querySelector(s);
  const state = window.__loom = (window.__loom||{});

  const drawHost = $('#drawHost');
  const penBtn = $('#penBtn');
  const eraserBtn = $('#eraserBtn');
  const clearBtn = $('#clearBtn');
  const processSelectionBtn = $('#processSelectionBtn');
  const highlightBtn = $('#btnHighlight');

  // build layers
  const bg = document.createElement('canvas'); bg.className = 'canvas-layer canvas-bg';
  const pen = document.createElement('canvas'); pen.className = 'canvas-layer canvas-pen';
  drawHost.append(bg, pen);
  const bgx = bg.getContext('2d');
  const px = pen.getContext('2d');
  let drawing=false, erasing=false, last=null;

  function resizeLayers(){
    const rect = drawHost.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width));
    const h = Math.max(10, Math.floor(rect.height));
    [bg,pen].forEach(c=>{
      const data = (c===pen)? c.toDataURL() : null;
      c.width = w; c.height = h;
      if (c===pen && data){
        const img = new Image(); img.onload = ()=>px.drawImage(img,0,0,w,h); img.src = data;
      }
    });
    if (state.image) paintBgFromUpload();
  }
  window.addEventListener('resize', resizeLayers);
  setTimeout(resizeLayers, 0);

  function paintBgFromUpload(){
    if (!state.image) return;
    const {image} = state;
    const wr = bg.width / image.width, hr = bg.height / image.height;
    const r = Math.min(wr, hr);
    const w = Math.round(image.width * r), h = Math.round(image.height * r);
    const x = Math.round((bg.width - w)/2), y = Math.round((bg.height - h)/2);
    bgx.clearRect(0,0,bg.width,bg.height);
    bgx.fillStyle='#fff'; bgx.fillRect(0,0,bg.width,bg.height);
    bgx.drawImage(image, x, y, w, h);
    state.drawBgRect = {x,y,w,h};
    // dim outside pen later
  }

  // Highlight Subject -> switch tab and show image to trace
  highlightBtn.addEventListener('click', ()=>{
    if (!state.image){
      toast('Upload a photo first.');
      return;
    }
    // switch to draw tab
    document.querySelector('.tab-btn[data-tab="draw"]').click();
    paintBgFromUpload();
    document.querySelector('[data-panel="draw"]').scrollIntoView({behavior:'smooth',block:'start'});
  });

  // Pen / Eraser
  function begin(e){
    drawing = true;
    erasing = penBtn.classList.contains('active') ? false : true;
    last = pos(e);
    px.lineCap='round';
    px.lineJoin='round';
    px.lineWidth = Math.max(4, Math.floor(pen.width/120));
    px.globalCompositeOperation = erasing? 'destination-out' : 'source-over';
  }
  function move(e){
    if (!drawing) return;
    const p = pos(e);
    px.beginPath();
    px.moveTo(last.x,last.y);
    px.lineTo(p.x,p.y);
    px.strokeStyle = '#0f172a';
    px.stroke();
    last = p;
  }
  function end(){ drawing=false; last=null; }
  const ev = (el, m, fn, opt)=>el.addEventListener(m, fn, opt);
  const P = ['mousedown','touchstart'], M=['mousemove','touchmove'], E=['mouseup','mouseleave','touchend','touchcancel'];
  P.forEach(m=>ev(pen,m, e=>{e.preventDefault(); begin(e.touches?.[0]||e);},{passive:false}));
  M.forEach(m=>ev(pen,m, e=>{e.preventDefault(); move(e.touches?.[0]||e);},{passive:false}));
  E.forEach(m=>ev(pen,m, e=>{e.preventDefault(); end();},{passive:false}));

  function pos(e){
    const r = pen.getBoundingClientRect();
    return {x:(e.clientX - r.left) * (pen.width/r.width), y:(e.clientY - r.top) * (pen.height/r.height)};
  }

  penBtn.addEventListener('click', ()=>{penBtn.classList.add('active'); eraserBtn.classList.remove('active');});
  eraserBtn.addEventListener('click', ()=>{eraserBtn.classList.add('active'); penBtn.classList.remove('active');});
  clearBtn.addEventListener('click', ()=>{px.clearRect(0,0,pen.width,pen.height);});

  // Process only inside the drawn outline (simple mask)
  processSelectionBtn.addEventListener('click', async ()=>{
    const stateGlobal = window.__loom;
    if (!stateGlobal.image){ toast('Upload a photo first.'); return; }
    const mask = pen; // use drawn strokes as mask
    await window.__processWithWorker({
      kind:'process',
      image: stateGlobal.image,
      hostCanvas: stateGlobal.previewCanvas,
      rect: stateGlobal.drawRect,
      density: +document.getElementById('density').value,
      edges: document.getElementById('optEdges').checked,
      posterize: document.getElementById('optPosterize').checked,
      removeBg:true,
      maskCanvas: mask
    });
    document.querySelector('.tab-btn[data-tab="upload"]').click();
    document.getElementById('previewHost').classList.remove('hidden');
    document.querySelector('[data-panel="upload"]').scrollIntoView({behavior:'smooth', block:'start'});
  });

  // swatches (visual only)
  const sw = document.getElementById('swatches');
  const colors = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#93c5fd','#67e8f9','#22d3ee','#86efac','#84cc16','#fde047','#fb923c','#fda4af','#34d399'];
  colors.forEach(c=>{
    const d = document.createElement('button');
    d.className='sw'; d.style.background=c; d.title=c; d.type='button';
    sw.appendChild(d);
  });

  function toast(msg){
    alert(msg);
  }

  // expose for upload tab to call when image loads
  window.__loom_draw_resize = resizeLayers;
})();