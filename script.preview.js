/* Handles preview state, painting to the preview canvas, and palette UI */
(() => {
  const $ = s => document.querySelector(s);
  const previewHost = $('#previewHost');
  const previewCanvas = $('#previewCanvas');
  const ctx = previewCanvas.getContext('2d');
  const swatches = $('#swatches');

  // public state container for other scripts
  window.LB = {
    image: null,                 // ImageBitmap of uploaded photo
    photoCanvas: null,           // scaled original
    maskCanvas: null,            // from draw tab
    previewCanvas,
    options: { reduce:true, edge:true, density:25, tint:'#000000' }
  };

  // simple thread colors
  const COLORS = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#38bdf8','#22c55e',
                  '#f59e0b','#f97316','#fb7185','#10b981','#14b8a6','#3b82f6'];
  COLORS.forEach(c=>{
    const b=document.createElement('button');
    b.className='sw'; b.style.background=c; b.title=c;
    b.addEventListener('click',()=>{ LB.options.tint=c; repaint(); });
    swatches.appendChild(b);
  });

  function sizeCanvasToHost(canvas, host){
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function clearCanvas(c){
    const x=c.getContext('2d');
    x.clearRect(0,0,c.width,c.height);
    x.fillStyle='#ffffff'; x.fillRect(0,0,c.width,c.height);
  }

  // Repaint pipeline (no flicker; uses offscreen steps)
  async function repaint(){
    if (!LB.photoCanvas){ clearCanvas(previewCanvas); return; }
    sizeCanvasToHost(previewCanvas, previewHost);

    // start with scaled photo
    let work = LB.photoCanvas;
    // apply mask if present (highlight subject)
    if (LB.maskCanvas && !$('#chkNoSubject').checked){
      work = LoomaProc.applyMask(work, LB.maskCanvas);
    }
    // reduce colors
    if ($('#optReduce')?.checked) {
      LoomaProc.quantize(work, 8);
    }
    // edge overlay
    if ($('#optEdge')?.checked){
      const edge = LoomaProc.edgeOutline(work, 0.6);
      const tctx = previewCanvas.getContext('2d');
      tctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
      tctx.drawImage(edge, 0, 0, previewCanvas.width, previewCanvas.height);
      // subtle tint
      tctx.globalCompositeOperation = 'multiply';
      tctx.fillStyle = LB.options.tint;
      tctx.fillRect(0,0,previewCanvas.width,previewCanvas.height);
      tctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
      ctx.drawImage(work,0,0,previewCanvas.width,previewCanvas.height);
    }
  }

  // Buttons
  $('#btnProcess')?.addEventListener('click', repaint);
  $('#btnHighlight')?.addEventListener('click', () => {
    document.querySelector('[data-tab="draw"]').click();
    document.querySelector('.tabs .muted').textContent = 'trace the subject, then Process Selection';
  });
  $('#chkNoSubject')?.addEventListener('change', repaint);
  $('#optReduce')?.addEventListener('change', repaint);
  $('#optEdge')?.addEventListener('change', repaint);
  $('#density')?.addEventListener('input', e => { LB.options.density=+e.target.value; });

  // Expose for upload/draw scripts
  window.LBRepaint = repaint;
  window.LBSizePreview = () => sizeCanvasToHost(previewCanvas, previewHost);
  window.LBShowPreview = (show=true) => previewHost.classList.toggle('hidden', !show);

  // init
  window.addEventListener('resize', ()=>{ if(!previewHost.classList.contains('hidden')){LBSizePreview(); repaint();} });
})();