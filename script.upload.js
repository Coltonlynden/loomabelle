// Centralized upload with guaranteed visual layer update
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
      // Set visual layer first so the user always sees the photo
      if (imgLayer) imgLayer.src = dataUrl;

      // Build an Image for canvas/processing and ensure decode
      const img = new Image();
      img.onload = ()=> window.dispatchEvent(new CustomEvent('editor:imageLoaded', { detail:{ img, file:f, dataUrl } }));
      img.onerror = ()=> window.dispatchEvent(new CustomEvent('editor:imageError',  { detail:{ file:f } }));
      if (img.decode) { img.src = dataUrl; try{ await img.decode(); }catch{} } else { img.src = dataUrl; }
      // If decode resolved already, emit now
      if (img.complete && img.naturalWidth) {
        window.dispatchEvent(new CustomEvent('editor:imageLoaded', { detail:{ img, file:f, dataUrl } }));
      }
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

  // Button that opens the picker lives in editor.ui.js; no duplicate listeners here.
})();