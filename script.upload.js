// Handles file input, reads into ImageBitmap, reveals preview
(function(){
  const fileInput = document.getElementById('fileInput');
  const dropZone  = document.getElementById('dropZone');
  const previewHost = document.getElementById('previewHost');

  async function handleFile(file){
    if(!file) return;
    const bmp = await createImageBitmap(await blobFromFile(file));
    App.image = bmp;
    App.lastResult = null;
    App.emit('image:loaded', bmp);
    previewHost.classList.remove('hidden');
  }

  // helpers
  function blobFromFile(file){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(new Blob([r.result])); r.readAsArrayBuffer(file); }); }

  // drag/drop
  ['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();}));
  dropZone.addEventListener('drop', e=>{
    e.preventDefault();
    const f=e.dataTransfer.files?.[0];
    handleFile(f);
  });

  fileInput.addEventListener('change', e=>handleFile(e.target.files[0]));

  // tie options to App.options
  document.getElementById('optPalette').addEventListener('change', e=>App.options.palette = e.target.checked);
  document.getElementById('optEdge').addEventListener('change', e=>App.options.edge = e.target.checked);
  document.getElementById('optDensity').addEventListener('input', e=>App.options.density = +e.target.value);
})();