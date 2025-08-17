/* Drawing tab: pen/eraser/clear + Process Selection */
(function(){
  const host   = document.getElementById('draw-host');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently:true });

  let drawing = false;
  let mode = 'pen';
  let stroke = '#1f2937';
  let lastX=0, lastY=0;

  // tool buttons
  const bPen = document.getElementById('toolPen');
  const bErs = document.getElementById('toolErase');
  const bClr = document.getElementById('toolClear');
  const bProc= document.getElementById('toolProcessSel');

  function setActive(btn){
    [bPen,bErs,bClr,bProc].forEach(b=>b && b.classList.remove('active'));
    btn && btn.classList.add('active');
  }

  bPen.addEventListener('click', ()=>{ mode='pen'; setActive(bPen); });
  bErs.addEventListener('click', ()=>{ mode='erase'; setActive(bErs); });
  bClr.addEventListener('click', ()=>{ clearMask(); setActive(bClr); });
  bProc.addEventListener('click', ()=> exportMaskAndProcess());

  // Swatches set pen color
  document.getElementById('swatches').addEventListener('click', (e)=>{
    const b = e.target.closest('.sw'); if (!b) return;
    stroke = b.dataset.color || '#1f2937';
    setActive(bPen); mode='pen';
  });

  // Keep canvas pixel size in sync with CSS box
  function fitCanvas(){
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(180, Math.floor(rect.height));
    if (canvas.width!==w || canvas.height!==h){
      const prev = ctx.getImageData(0,0,canvas.width,canvas.height);
      canvas.width = w; canvas.height = h;
      // repaint previous content scaled to new size
      const tmp = document.createElement('canvas');
      tmp.width = prev.width; tmp.height = prev.height;
      tmp.getContext('2d').putImageData(prev,0,0);
      ctx.drawImage(tmp,0,0,w,h);
    }
  }
  new ResizeObserver(fitCanvas).observe(host);
  fitCanvas();

  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - r.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - r.top;
    return {x, y};
  }

  function begin(e){
    drawing = true;
    const {x,y} = pointerPos(e); lastX=x; lastY=y;
    e.preventDefault();
  }
  function move(e){
    if(!drawing) return;
    const {x,y} = pointerPos(e);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10; // feel like a marker
    if (mode==='erase'){
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke;
    }
    ctx.beginPath();
    ctx.moveTo(lastX,lastY);
    ctx.lineTo(x,y);
    ctx.stroke();
    lastX=x; lastY=y;
    e.preventDefault();
  }
  function end(){ drawing=false; }

  // Pointer + touch
  canvas.addEventListener('pointerdown', begin);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  canvas.addEventListener('touchstart', begin, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  window.addEventListener('touchend', end);

  function clearMask(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function exportMaskAndProcess(){
    // Export a transparent PNG where drawn strokes mark the subject.
    // Thicken the path into a filled region by drawing the current
    // canvas onto itself with a fat shadow (simple “dilate”).
    const work = document.createElement('canvas');
    work.width = canvas.width; work.height = canvas.height;
    const wctx = work.getContext('2d');
    wctx.drawImage(canvas,0,0);
    wctx.globalCompositeOperation='source-over';
    wctx.filter='blur(6px)'; // soft dilate
    wctx.drawImage(work,0,0);

    const maskDataURL = work.toDataURL('image/png');
    // Jump back to upload tab + process
    document.querySelector('.tab-btn[data-tab="upload"]').click();
    document.querySelector('#preview-host').scrollIntoView({behavior:'smooth', block:'start'});
    window.LMB.setMask(maskDataURL);
  }
})();