// Handles file input, reads into ImageBitmap, reveals preview
(function(){
  const fileInput  = document.getElementById('fileInput');
  const dropZone   = document.getElementById('dropZone');
  const previewHost= document.getElementById('previewHost');
  const previewCard= document.getElementById('previewCard');

  async function handleFile(file){
    if(!file) return;
    // Create an ImageBitmap directly from the File (no FileReader needed)
    const bmp = await createImageBitmap(file);
    App.image = bmp;
    App.lastResult = null;

    // reveal preview (card + canvas host)
    if (previewCard) previewCard.style.display = '';
    if (previewHost) previewHost.classList.remove('hidden');

    // notify listeners (preview/draw modules)
    App.emit('image:loaded', bmp);
  }

  // drag/drop
  ['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();}));
  dropZone.addEventListener('drop', e=>{
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    handleFile(f);
  });

  // file picker
  fileInput.addEventListener('change', e=>handleFile(e.target.files && e.target.files[0]));

  // tie options to App.options
  document.getElementById('optPalette').addEventListener('change', e=>App.options.palette = e.target.checked);
  document.getElementById('optEdge').addEventListener('change', e=>App.options.edge = e.target.checked);
  document.getElementById('optDensity').addEventListener('input', e=>App.options.density = +e.target.value);
})();
