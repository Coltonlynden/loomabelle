// Centralized upload handler
(function(){
  const main = document.getElementById('fileInput');
  const add  = document.getElementById('addElementInput');

  function fileToImage(file){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>{
        const img = new Image();
        img.onload = ()=> resolve(img);
        img.onerror = reject;
        img.src = fr.result; // data URL avoids CORS taint
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function onMainChange(e){
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const img = await fileToImage(f);
      window.dispatchEvent(new CustomEvent('editor:imageLoaded', { detail:{ img, file:f }}));
    } finally {
      e.target.value = ''; // allow same file re-select
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