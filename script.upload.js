/* Upload handling + tab switching + glue logic */
(() => {
  const $ = s => document.querySelector(s);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
      document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.dataset.panel===tab));
      if (tab==='draw' && LB.photoCanvas) LBSetDrawBackground(LB.photoCanvas);
    });
  });
  document.querySelectorAll('[data-scroll]').forEach(b=>{
    b.addEventListener('click',()=>{
      const target = document.querySelector(b.dataset.scroll);
      if (b.dataset.tab) document.querySelector(`.tab-btn[data-tab="${b.dataset.tab}"]`).click();
      target?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();

  // Upload handlers (click + drag)
  const fileInput = $('#fileInput');
  const dropArea = $('#dropArea');
  ;['dragenter','dragover'].forEach(ev=>dropArea.addEventListener(ev,e=>{e.preventDefault(); dropArea.classList.add('hover');}));
  ;['dragleave','drop'].forEach(ev=>dropArea.addEventListener(ev,e=>{e.preventDefault(); dropArea.classList.remove('hover');}));
  dropArea.addEventListener('drop',e=>{
    const f=e.dataTransfer.files?.[0]; if (f) handleFile(f);
  });
  fileInput.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if (f) handleFile(f);
  });

  async function handleFile(file){
    try{
      const bmp = await createImageBitmap(file);
      LB.image = bmp;
      // scale to preview host size (logical px)
      LBShowPreview(true);
      LBSizePreview();
      const pr = document.getElementById('previewHost').getBoundingClientRect();
      const canvas = LoomaProc.scaleToFit(bmp, pr.width*2, pr.height*2); // high-res for quality
      LB.photoCanvas = canvas;
      LB.maskCanvas = null; // reset previous mask
      LBRepaint();
      // sync draw tab guide
      LBSetDrawBackground(canvas);
    }catch(err){
      console.error(err);
      alert('Sorry — could not read that image.');
    }
  }

  // Export buttons (PNG demo; others are placeholders)
  function downloadCanvasPNG(c, name='loomabelle.png'){
    const a=document.createElement('a');
    a.href = c instanceof OffscreenCanvas ? c.convertToBlob ? URL.createObjectURL(await c.convertToBlob()) : '' : c.toDataURL('image/png');
    if (!a.href){ alert('PNG export not supported in this browser'); return; }
  }

  document.getElementById('btnPNG')?.addEventListener('click', ()=>{
    const a=document.createElement('a');
    a.download='loomabelle.png';
    a.href=LB.previewCanvas.toDataURL('image/png');
    a.click();
  });

})();