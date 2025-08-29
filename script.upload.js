(function(){
  const main = document.getElementById('fileInput');
  if(main){
    main.addEventListener('change', (e)=>{
      const f = e.target?.files?.[0]; if(!f) return;
      window.dispatchEvent(new CustomEvent('editor:file', { detail: { file: f }}));
    });
  }

  const add = document.getElementById('addElementInput');
  if(add){
    add.addEventListener('change', (e)=>{
      const f = e.target?.files?.[0]; if(!f) return;
      window.dispatchEvent(new CustomEvent('editor:add-element', { detail: { file: f }}));
    });
  }
})();