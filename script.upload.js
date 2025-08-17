// Handles file input & initial preview
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const input = $('#fileInput');

  input.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Load as ImageBitmap (fast)
    const blobURL = URL.createObjectURL(file);
    const img = await fetch(blobURL).then(r=>r.blob()).then(createImageBitmap);
    URL.revokeObjectURL(blobURL);

    window.Looma.imageBitmap = img;

    // Reset mask & processed canvas
    window.Looma.maskCanvas = null;
    window.Looma.processedCanvas = null;

    // Show original in preview and enable things
    await window.LoomaPreview.drawIntoPreview(img);
  });

  // Also allow clicking hero buttons to scroll to tabs
  document.querySelectorAll('[data-scroll]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sel = btn.getAttribute('data-scroll');
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({behavior:'smooth'});
    });
  });
})();