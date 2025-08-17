// Preview: show image/result, process, and enable lasso highlighting
(function(){
  const canvas = document.getElementById('previewCanvas');
  const ctx    = canvas.getContext('2d');
  const host   = document.getElementById('previewHost');

  const btnProcess   = document.getElementById('btnProcess');
  const btnHighlight = document.getElementById('btnHighlight');
  const chkNoSubject = document.getElementById('chkNoSubject');

  const pWrap = document.getElementById('progressWrap');
  const pBar  = document.getElementById('progressBar');
  const pLab  = document.getElementById('progressLabel');

  function dpr(){ return window.devicePixelRatio || 1; }

  function fitCanvas(){
    if(!host) return;
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width  * dpr()));
    const h = Math.max(1, Math.floor(r.height * dpr()));
    if (canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      canvas.style.width  = r.width  + 'px';
      canvas.style.height = r.height + 'px';
    }
  }

  function drawBitmap(bmp){
    if(!bmp) return;
    fitCanvas();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const x = (canvas.width - w) >> 1, y = (canvas.height - h) >> 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bmp, 0,0,bmp.width,bmp.height, x,y,w,h);
  }

  // ------ Tab switching helper (no dependency on external click handlers)
  function activateTab(name){
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach(p=>{
      p.classList.toggle('active', p.dataset.panel === name);
    });
    if(name === 'upload'){
      const card = document.getElementById('previewCard');
      if(card) card.style.display = '';
      if(host) host.classList.remove('hidden');
      // scroll preview into view on mobile
      const tabs = document.getElementById('tabs');
      if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({behavior:'smooth', block:'start'});
    }
  }

  // Display original upload immediately
  App.on('image:loaded', (bmp)=>{ activateTab('upload'); drawBitmap(bmp); });

  // Keep preview crisp on resize
  window.addEventListener('resize', ()=>{
    if(App.lastResult || App.image) drawBitmap(App.lastResult || App.image);
  });

  // Progress helpers
  function showProgress(label){ if(pWrap){ pWrap.classList.remove('hidden'); setProgress(0,label); } }
  function setProgress(v,label){
    if (pBar) pBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, v)) + ')';
    if(label && pLab) pLab.textContent = label;
  }
  function hideProgress(){ if(pWrap) pWrap.classList.add('hidden'); }

  // Process Photo (no mask)
  if (btnProcess) btnProcess.addEventListener('click', async ()=>{
    if(!App.image){ toast('Upload a photo first.'); return; }
    activateTab('upload'); // ensure preview area is visible before we render
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
    App.emit('draw:bg', {bmp: App.lastResult || App.image});
    App.emit('draw:lasso', true);
    activateTab('draw');
  });

  // Export PNG
  const pngBtn = document.getElementById('btnPng');
  if(pngBtn) pngBtn.addEventListener('click', ()=>{
    const url = canvas.toDataURL('image/png');
    const a=document.createElement('a'); a.href=url; a.download='loomabelle.png'; a.click();
  });

  function toast(msg){
    if(!pWrap) return;
    if(pLab) pLab.textContent = msg;
    pWrap.classList.remove('hidden');
    setProgress(0);
    setTimeout(()=>pWrap.classList.add('hidden'), 1500);
  }
})();