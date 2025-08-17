// upload.js — v1.0
(function(){
  const App = (window.App = window.App || {});
  const $ = (id)=>document.getElementById(id);

  const fileInput = $('fileInput');
  const uploadZone = $('uploadZone');

  // make upload box clickable
  uploadZone.addEventListener('click', (e)=>{
    if (e.target !== fileInput) fileInput.click();
  });

  // HEIC support (lazy loaded)
  async function heicToJpeg(file){
    if (!window.heic2any) {
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    const out = await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], (file.name||'image').replace(/\.\w+$/,'')+'.jpg', { type:'image/jpeg' });
  }

  async function pickFile(file) {
    let chosen=file;
    const name=(file.name||'').toLowerCase();
    const type=(file.type||'').toLowerCase();
    if(type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')){
      try{ chosen = await heicToJpeg(file); }catch(e){}
    }
    const url = URL.createObjectURL(chosen);
    try{
      const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
      // fit image into ~1600px max side
      const MAX = 1600;
      let W = img.naturalWidth, H = img.naturalHeight;
      if (Math.max(W,H) > MAX){ const r=MAX/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }

      // keep an ImageBitmap for fast draw
      const bmp = await createImageBitmap(img, { resizeWidth: W, resizeHeight: H, resizeQuality:'high' });

      // store
      App.state.img = bmp; App.state.imgW = W; App.state.imgH = H; App.state.mask = null;

      // render raw preview and enable buttons
      App.renderRawToPreview();
      $('btnProcess').disabled = false;
      $('btnHighlight').disabled = false;
      $('btnPng').disabled = true; // will enable after processing

      // prep draw surface (so pen works immediately when they switch)
      if (App._draw_bindPointers) App._draw_bindPointers();

    }finally{
      URL.revokeObjectURL(url);
    }
  }

  fileInput.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    pickFile(f);
  });

})();