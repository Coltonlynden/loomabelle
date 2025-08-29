// Conversion reads from <img> if canvas is empty; safe on all devices
(function () {
  const IMG_CAN = document.getElementById('imgCanvas');
  const MASK_CAN= document.getElementById('maskCanvas');
  const IMG_EL  = document.getElementById('imgLayer');

  function grabImageData(){
    const w = IMG_CAN.width, h = IMG_CAN.height;
    const ctx = IMG_CAN.getContext('2d');
    // If canvas is empty but <img> is visible, draw it in first
    try {
      const px = ctx.getImageData(0,0,1,1).data[3];
      if (IMG_EL && IMG_EL.src && px===0) ctx.drawImage(IMG_EL, 0, 0, w, h);
    } catch {}
    return ctx.getImageData(0,0,w,h);
  }

  window.convertToEmbroidery = function (){
    const w = IMG_CAN.width, h = IMG_CAN.height;
    if (!w || !h) return;
    const imgData  = grabImageData();
    const maskData = MASK_CAN.getContext('2d').getImageData(0,0,w,h);
    // Plug into your worker/pipeline here
    console.log('convert stub', {w,h,img:imgData.data.length, mask:maskData.data.length});
  };

  document.getElementById('btnConvert')?.addEventListener('click', window.convertToEmbroidery);
})();