// Handles file selection and draws into the main canvas at 1024×1024.
// Also updates filename field and triggers preview.
(function(){
  const S = window.EAS?.state || (window.EAS = { state:{} }).state;
  const fileInput = document.getElementById('file');
  const nameBox   = document.getElementById('filename');

  const base = document.getElementById('canvas');
  const bctx = base.getContext('2d', { willReadFrequently:true });
  const mask = document.getElementById('mask');
  const mctx = mask.getContext('2d', { willReadFrequently:true });

  // Ensure logical size for processing
  base.width = base.height = mask.width = mask.height = 1024;

  async function loadToCanvas(file){
    // show name
    if(nameBox) nameBox.value = file.name || 'image';

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // clear
      bctx.clearRect(0,0,1024,1024);
      mctx.clearRect(0,0,1024,1024);

      // cover-fit draw into 1024 square
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.max(1024/iw, 1024/ih);
      const dw = Math.round(iw*scale), dh = Math.round(ih*scale);
      const dx = Math.round((1024 - dw)/2), dy = Math.round((1024 - dh)/2);
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(img, dx, dy, dw, dh);

      // state
      S.hasImage = true;
      S.zoom = S.zoom || 1; S.panX = S.panX||0; S.panY=S.panY||0;

      // downstream hooks if available
      if(window.EAS_processing?.computeEdges) window.EAS_processing.computeEdges();
      if(window.EAS_processing?.renderPreview) window.EAS_processing.renderPreview(true);

      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Failed to load image'); };
    img.src = url;
  }

  fileInput?.addEventListener('change', e=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    loadToCanvas(f);
  });
})();