/* Handles file upload & reveals preview */
(function(){
  const fileInput = document.getElementById('file-input');
  const zone = document.getElementById('upload-zone');

  // Click anywhere on the zone triggers file chooser
  zone.addEventListener('click', (e)=>{
    if (e.target !== fileInput) fileInput.click();
  });

  // Drag & drop
  ;['dragenter','dragover','dragleave','drop'].forEach(ev=>{
    zone.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, false);
  });
  zone.addEventListener('dragover', ()=> zone.classList.add('active'));
  ;['dragleave','drop'].forEach(ev=> zone.addEventListener(ev, ()=> zone.classList.remove('active')));

  zone.addEventListener('drop', (e)=>{
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', ()=>{
    const file = fileInput.files && fileInput.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file){
    if (!file.type.startsWith('image/')) { alert('Please choose an image.'); return; }
    const url = URL.createObjectURL(file);
    const img = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha:'premultiply' });
    URL.revokeObjectURL(url);
    window.LMB.setImage(img);
  }
})();