// Loomabelle minimal working core – v45
(() => {
  'use strict';

  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  const el = {
    year: byId('year'),
    tabUpload: byId('tabUpload'),
    tabDraw: byId('tabDraw'),
    panelUpload: byId('panelUpload'),
    panelDraw: byId('panelDraw'),

    file: byId('fileInput'),
    previewHost: byId('previewHost'),
    preview: byId('preview'),

    btnProcess: byId('btnProcess'),
    btnHighlight: byId('btnHighlight'),

    optReduce: byId('optReduce'),
    optEdge: byId('optEdge'),
    optDensity: byId('optDensity'),

    drawCanvas: byId('drawCanvas'),
    btnPen: byId('btnPen'),
    btnEraser: byId('btnEraser'),
    btnProcessSelection: byId('btnProcessSelection'),
    swatches: byId('swatches'),

    exportBtns: ['btnDST','btnEXP','btnPES','btnJEF'].map(byId),
  };

  if (el.year) el.year.textContent = new Date().getFullYear();

  /* ---------------- Tabs & header buttons ---------------- */
  function setTab(name){
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    // Keep header size stable on iOS
    document.body.scrollTop += 0; // nudge to force repaint without jumping
  }
  el.tabUpload?.addEventListener('click',()=>setTab('upload'));
  el.tabDraw?.addEventListener('click',()=>setTab('draw'));
  $$('[data-tab-target]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t = btn.getAttribute('data-tab-target');
      setTab(t || 'upload');
      document.getElementById('tabs')?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  /* ---------------- Thread palette ---------------- */
  const THREADS = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#22c55e','#f59e0b','#eab308','#e11d48','#10b981'];
  THREADS.forEach(c=>{
    const b=document.createElement('button');
    b.style.background=c;
    b.title=c;
    b.addEventListener('click',()=> state.penColor=c);
    el.swatches.appendChild(b);
  });

  /* ---------------- State & helpers ---------------- */
  const state = {
    img: null,         // HTMLImageElement
    work: document.createElement('canvas'),  // internal working canvas
    mask: null,        // user highlight mask (draw tab)
    penDown:false, penErase:false, penSize:12, penColor:'#0f172a'
  };
  const wctx = () => state.work.getContext('2d', {willReadFrequently:true});
  const pctx = () => el.preview.getContext('2d');

  function hidePreview(){ el.previewHost.dataset.empty = '1'; pctx().clearRect(0,0,el.preview.width, el.preview.height); }
  function showPreview(){ el.previewHost.dataset.empty = '0'; }

  /* ---------------- File load ---------------- */
  el.file?.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ hidePreview(); return; }

    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      state.img = img;

      // scale work canvas to a safe size for phones
      const maxSide = 1600;
      let W = img.naturalWidth, H = img.naturalHeight;
      if (Math.max(W,H) > maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
      state.work.width=W; state.work.height=H;
      wctx().clearRect(0,0,W,H);
      wctx().drawImage(img,0,0,W,H);

      // place the raw image into the preview (fits to canvas)
      fitCanvasToHost(el.preview);
      drawImageFit(el.preview, img);

      // mirror into draw tab as background
      fitCanvasToHost(el.drawCanvas);
      const dctx = el.drawCanvas.getContext('2d');
      dctx.clearRect(0,0,el.drawCanvas.width, el.drawCanvas.height);
      // faint background
      dctx.globalAlpha = 0.35;
      drawImageFit(el.drawCanvas, img);
      dctx.globalAlpha = 1;

      showPreview();
      // enable export/process buttons
      el.btnProcess.disabled = false;
      el.btnHighlight.disabled = false;
      el.exportBtns.forEach(b=>b.disabled=false);
    };
    img.onerror = () => { hidePreview(); };
    img.src = url;
  });

  /* ---------------- Preview sizing ---------------- */
  function fitCanvasToHost(canvas){
    const host = canvas.parentElement;
    const r = host.getBoundingClientRect();
    // keep a steady internal resolution ~2x CSS pixels for crispness
    const width  = Math.max(480, Math.min(1280, Math.round(r.width * (window.devicePixelRatio||1))));
    const height = Math.round(width * 9/16);
    canvas.width  = width;
    canvas.height = height;
  }
  window.addEventListener('resize', ()=>{ if(el.previewHost.dataset.empty!=='1'){ fitCanvasToHost(el.preview); drawImageFit(el.preview, state.img); } fitCanvasToHost(el.drawCanvas); });

  function drawImageFit(canvas, img){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!img) return;
    const iw=img.naturalWidth, ih=img.naturalHeight;
    const s = Math.min(canvas.width/iw, canvas.height/ih);
    const w = Math.round(iw*s), h = Math.round(ih*s);
    const x = Math.round((canvas.width - w)/2), y = Math.round((canvas.height - h)/2);
    ctx.drawImage(img, x, y, w, h);
  }

  /* ---------------- Draw & Trace (mask) ---------------- */
  (() => {
    const c = el.drawCanvas, ctx = c.getContext('2d');
    let lastX=0,lastY=0;

    const pen = (x,y) => {
      ctx.save();
      ctx.globalCompositeOperation = state.penErase ? 'destination-out' : 'source-over';
      ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.lineWidth = state.penSize;
      ctx.strokeStyle = state.penColor;
      ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.stroke();
      ctx.restore();
    };

    const pick = ev => {
      const r=c.getBoundingClientRect();
      const px=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
      const py=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top;
      const x=px*(c.width/r.width), y=py*(c.height/r.height);
      return {x,y};
    };

    const down = ev => { state.penDown=true; const p=pick(ev); lastX=p.x; lastY=p.y; pen(p.x,p.y); ev.preventDefault(); };
    const move = ev => { if(!state.penDown) return; const p=pick(ev); pen(p.x,p.y); lastX=p.x; lastY=p.y; ev.preventDefault(); };
    const up   = () => { state.penDown=false; };

    c.addEventListener('mousedown',down); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
    c.addEventListener('touchstart',down,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',up);

    el.btnPen?.addEventListener('click',()=>{ state.penErase=false; el.btnPen.classList.add('active'); el.btnEraser.classList.remove('active'); });
    el.btnEraser?.addEventListener('click',()=>{ state.penErase=true;  el.btnEraser.classList.add('active'); el.btnPen.classList.remove('active'); });

    // start with pen selected
    el.btnPen?.click();
  })();

  /* ---------------- Highlight Subject → jump to Draw tab ---------------- */
  el.btnHighlight?.addEventListener('click', ()=>{
    if(!state.img) return;
    setTab('draw');
    // ensure the preview image is used as background (already mirrored when loaded)
  });

  /* ---------------- Process Selection (uses the drawing as mask) ---------------- */
  el.btnProcessSelection?.addEventListener('click', ()=>{
    // Convert drawn strokes on drawCanvas into a binary mask
    const dc = el.drawCanvas;
    const d  = dc.getContext('2d').getImageData(0,0,dc.width,dc.height).data;
    const mask = new Uint8Array(dc.width*dc.height);
    for(let i=0;i<mask.length;i++){
      const a = d[i*4+3];
      mask[i] = a>8 ? 1 : 0;
    }
    state.mask = {data:mask, W:dc.width, H:dc.height};
    // bounce back to upload tab with a small toast via hint text
    setTab('upload');
    const hint = byId('tabHint'); if(hint){ hint.textContent = 'selection captured ✓'; setTimeout(()=>hint.textContent='ready to use', 1800); }
  });

  /* ---------------- Process photo (fast preview) ---------------- */
  el.btnProcess?.addEventListener('click', ()=>{
    if(!state.img){ return; }
    showPreview(); fitCanvasToHost(el.preview);

    const ctx = pctx();
    // Step 1: draw scaled image
    drawImageFit(el.preview, state.img);

    // Step 2: optional palette reduce (simple posterize → fast and mobile safe)
    if(el.optReduce?.checked){
      const imgData = ctx.getImageData(0,0,el.preview.width, el.preview.height);
      const d = imgData.data;
      const bucket = v => Math.round(v/36)*36; // ~7 levels/channel
      for(let i=0;i<d.length;i+=4){
        d[i]   = bucket(d[i]);
        d[i+1] = bucket(d[i+1]);
        d[i+2] = bucket(d[i+2]);
      }
      ctx.putImageData(imgData,0,0);
    }

    // Step 3: edge outline overlay (coarse Sobel) if requested
    if(el.optEdge?.checked){
      const w=el.preview.width, h=el.preview.height;
      const src=ctx.getImageData(0,0,w,h);
      const out=ctx.createImageData(w,h);
      const s=src.data, o=out.data;
      const Gx=[-1,0,1,-2,0,2,-1,0,1], Gy=[-1,-2,-1,0,0,0,1,2,1];
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          let ix=(y*w+x)*4;
          let sx=0, sy=0, k=0;
          for(let j=-1;j<=1;j++){
            for(let i=-1;i<=1;i++){
              const q=((y+j)*w+(x+i))*4;
              const g = (s[q]+s[q+1]+s[q+2])/3;
              sx += g*Gx[k]; sy += g*Gy[k]; k++;
            }
          }
          const m = Math.min(255, Math.hypot(sx,sy));
          const a = m>200 ? 255 : 0; // hard threshold for clean edges
          o[ix]=15;o[ix+1]=23;o[ix+2]=42;o[ix+3]=a; // dark navy outline
        }
      }
      ctx.putImageData(out,0,0);
    }
  });

  /* ---------------- Dummy exporters (enabled; they export the preview PNG) ---------------- */
  el.exportBtns.forEach(btn=>{
    btn?.addEventListener('click',()=>{
      if(el.previewHost.dataset.empty==='1') return;
      el.preview.toBlob(b=>{
        const a=document.createElement('a');
        a.href=URL.createObjectURL(b);
        a.download=`loomabelle-preview-${btn.textContent.toLowerCase()}.png`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      });
    });
  });

  /* ---------------- Quality-of-life ---------------- */
  // Scroll buttons (“Try it”, etc.)
  $$('[data-scroll]').forEach(b=>{
    b.addEventListener('click',()=>{
      const t=b.getAttribute('data-scroll');
      if(t) document.querySelector(t)?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  // start with preview hidden
  hidePreview();
})();