// Centralized upload with guaranteed visual update
(function(){
  const main = document.getElementById('fileInput');
  const add  = document.getElementById('addElementInput');
  const imgLayer = document.getElementById('imgLayer');

  function fileToDataURL(file){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function onMainChange(e){
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const dataUrl = await fileToDataURL(f);

      // 1) Show photo immediately
      if (imgLayer){ imgLayer.src = dataUrl; imgLayer.style.opacity='1'; }

      // 2) Build an Image object for canvas/export and ensure decode
      const img = new Image();
      img.src = dataUrl;
      if (img.decode) { try{ await img.decode(); }catch{} }

      // 3) Notify draw pipeline
      window.dispatchEvent(new CustomEvent('editor:imageLoaded', { detail:{ img, file:f, dataUrl } }));
    } finally {
      e.target.value = '';
    }
  }

  function onAddChange(e){
    const f = e.target.files?.[0]; if(!f) return;
    window.dispatchEvent(new CustomEvent('editor:add-element', { detail:{ file:f }}));
    e.target.value = '';
  }

  main?.addEventListener('change', onMainChange);
  add?.addEventListener('change', onAddChange);
})();