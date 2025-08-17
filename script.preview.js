// Renders into preview canvas, highlight subject → switches to draw
(function(){
  const c = document.getElementById('previewCanvas');
  const ctx = c.getContext('2d');
  const host = document.getElementById('previewHost');

  const btnProcess = document.getElementById('btnProcess');
  const btnHighlight = document.getElementById('btnHighlight');
  const chkNoSubject = document.getElementById('chkNoSubject');

  const pWrap = document.getElementById('progressWrap');
  const pBar  = document.getElementById('progressBar');
  const pLab  = document.getElementById('progressLabel');

  // fit canvas to host
  function fitCanvas(){
    const r = host.getBoundingClientRect();
    c.width = Math.floor(r.width * devicePixelRatio);
    c.height= Math.floor(r.height* devicePixelRatio);
    c.style.width = r.width+'px';
    c.style.height= r.height+'px';
  }

  // draw an ImageBitmap into preview canvas (letterbox)
  function drawBitmap(bmp){
    fitCanvas();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,c.width,c.height);
    const scale = Math.min(c.width/bmp.width, c.height/bmp.height);
    const w = Math.floor(bmp.width*scale), h = Math.floor(bmp.height*scale);
    const x = (c.width - w)>>1, y = (c.height - h)>>1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bmp, 0,0,bmp.width,bmp.height, x,y,w,h);
  }

  // Listen for new image
  App.on('image:loaded', (bmp)=>drawBitmap(bmp));
  window.addEventListener('resize', ()=>{ if(App.image || App.lastResult) drawBitmap(App.lastResult||App.image); });

  // Progress helpers
  function showProgress(label){ pWrap.classList.remove('hidden'); setProgress(0,label); }
  function setProgress(v,label){ pBar.style.transform = `scaleX(${Math.max(0,Math.min(1,v))})`; if(label) pLab.textContent = label; }
  function hideProgress(){ pWrap.classList.add('hidden'); }

  // Process Photo
  btnProcess.addEventListener('click', async ()=>{
    if(!App.image){ toast('Upload a photo first.'); return; }
    showProgress('Preparing…');
    const opts = {...App.options, noSubject: chkNoSubject.checked };
    const bmp = await Processing.processImage(App.image, null, opts, (p,l)=>setProgress(p,l));
    hideProgress();
    App.lastResult = bmp;
    drawBitmap(bmp);
  });

  // Highlight Subject → open Draw tab and paint bgCanvas
  btnHighlight.addEventListener('click', ()=>{
    if(!App.image){ toast('Upload a photo first.'); return; }
    // switch tab
    document.querySelector('.tab-btn[data-tab="draw"]').click();
    // tell draw module to load background
    App.emit('draw:bg', {bmp: App.lastResult || App.image});
  });

  // export PNG quick demo (placeholders for DST/EXP buttons)
  document.getElementById('btnPng').addEventListener('click', ()=>{
    const url = c.toDataURL('image/png');
    const a=document.createElement('a'); a.href=url; a.download='loomabelle.png'; a.click();
  });

  // tiny toast
  function toast(msg){
    pLab.textContent = msg;
    pWrap.classList.remove('hidden');
    setProgress(0);
    setTimeout(()=>pWrap.classList.add('hidden'), 1500);
  }
})();
