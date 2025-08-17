// Preview: show image/result, process, and enable lasso highlighting
(function(){
  const c    = document.getElementById('previewCanvas');
  const ctx  = c.getContext('2d');
  const host = document.getElementById('previewHost');

  const btnProcess   = document.getElementById('btnProcess');
  const btnHighlight = document.getElementById('btnHighlight');
  const chkNoSubject = document.getElementById('chkNoSubject');

  const pWrap = document.getElementById('progressWrap');
  const pBar  = document.getElementById('progressBar');
  const pLab  = document.getElementById('progressLabel');

  function fitCanvas(){
    if(!host) return;
    const r = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(r.width  * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (c.width!==w || c.height!==h){
      c.width = w; c.height = h;
      c.style.width  = r.width  + 'px';
      c.style.height = r.height + 'px';
    }
  }

  function drawBitmap(bmp){
    if(!bmp) return;
    fitCanvas();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,c.width,c.height);
    const scale = Math.min(c.width / bmp.width, c.height / bmp.height);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const x = (c.width - w) >> 1, y = (c.height - h) >> 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bmp, 0,0,bmp.width,bmp.height, x,y,w,h);
  }

  // Display original upload immediately
  App.on('image:loaded', (bmp)=>{ drawBitmap(bmp); });

  // Keep preview crisp on resize
  window.addEventListener('resize', ()=>{
    if(App.lastResult || App.image) drawBitmap(App.lastResult || App.image);
  });

  // Progress helpers
  function showProgress(label){ pWrap.classList.remove('hidden'); setProgress(0,label); }
  function setProgress(v,label){
    if (pBar) pBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, v)) + ')';
    if(label && pLab) pLab.textContent = label;
  }
  function hideProgress(){ pWrap.classList.add('hidden'); }

  // Process Photo (no mask)
  if (btnProcess) btnProcess.addEventListener('click', async ()=>{
    if(!App.image){ toast('Upload a photo first.'); return; }
    showProgress('Preparing…');
    const opts = Object.assign({}, App.options, { noSubject: chkNoSubject && chkNoSubject.checked });
    const bmp = await Processing.processImage(App.image, null, opts, (p,l)=>setProgress(p,l));
    hideProgress();
    App.lastResult = bmp;
    drawBitmap(bmp);
  });

  // Highlight Subject → open Draw in LASSO mode
  if (btnHighlight) btnHighlight.addEventListener('click', ()=>{
    if(!App.image){ toast('Upload a photo first.'); return; }
    // switch tab
    const btn = document.querySelector('.tab-btn[data-tab="draw"]');
    if (btn) btn.click();
    else switchTo('draw');
    // tell draw module to load background and enter lasso mode
    App.emit('draw:bg', {bmp: App.lastResult || App.image});
    App.emit('draw:lasso', true);
  });

  // Export PNG
  const pngBtn = document.getElementById('btnPng');
  if(pngBtn) pngBtn.addEventListener('click', ()=>{
    const url = c.toDataURL('image/png');
    const a=document.createElement('a'); a.href=url; a.download='loomabelle.png'; a.click();
  });

  // Fallback tab switcher (if no .tab-btn click handler available)
  function switchTo(name){
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.dataset.panel===name));
  }

  function toast(msg){
    if(!pWrap) return;
    if(pLab) pLab.textContent = msg;
    pWrap.classList.remove('hidden');
    setProgress(0);
    setTimeout(()=>pWrap.classList.add('hidden'), 1500);
  }
})();