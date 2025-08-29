// Universal upload: decodes with FileReader → HTMLImageElement.
// Emits an event and also draws immediately as a hard fallback.
(function(){
  const fileInput   = document.getElementById('fileInput');
  const uploadBtn   = document.getElementById('uploadMainBtn');

  if (uploadBtn && fileInput) uploadBtn.addEventListener('click', ()=> fileInput.click());

  async function toImage(file){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function handle(e){
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try{
      const img = await toImage(f);
      // Broadcast to the editor
      window.dispatchEvent(new CustomEvent('editor:imageLoaded', { detail:{ img, file:f }}));
      // Hard fallback: draw now in case listeners are missing
      const c = document.getElementById('imgCanvas');
      if (c && c.getContext){
        const dpr = Math.max(1, window.devicePixelRatio||1);
        const {w,h} = fitDims(img.naturalWidth||img.width, img.naturalHeight||img.height, c.parentElement);
        c.width = Math.round(w*dpr); c.height = Math.round(h*dpr);
        c.style.width = w+'px'; c.style.height = h+'px';
        const ctx = c.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,c.width,c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      }
    }catch(err){
      console.error('Upload decode failed', err);
    }finally{
      e.target.value = ''; // allow re-select same file
    }
  }

  function fitDims(iw, ih, container){
    const cw = Math.max(320, container?.clientWidth || 800);
    const ch = Math.max(220, container?.clientHeight || 600);
    const r = Math.min(cw/iw, ch/ih);
    return { w: Math.max(2, Math.floor(iw*r)), h: Math.max(2, Math.floor(ih*r)) };
  }

  if (fileInput) fileInput.addEventListener('change', handle);
})();