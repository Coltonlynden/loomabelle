/* processor.js – v1
   Light client-side “preview stitch” renderer (no ML libs).
   Exposes Looma.loadImage and Looma.rasterToPreview used by script.js
*/
(function initProcessor(global){
  'use strict';
  const Looma = global.Looma || (global.Looma = {});
  const ctx = (c)=>c.getContext('2d',{willReadFrequently:true});

  Looma.loadImage = async function loadImage(file){
    const url = URL.createObjectURL(file);
    try{
      const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
      // clamp large photos for mobile memory
      const maxSide = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1400 : 2200;
      let W = img.naturalWidth, H = img.naturalHeight;
      if (Math.max(W,H) > maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
      const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
      ctx(canvas).drawImage(img,0,0,W,H);
      return { canvas, W, H };
    } finally { URL.revokeObjectURL(url); }
  };

  // Very fast edge+fill preview — not final stitch engine, just the look
  Looma.rasterToPreview = function({imgCanvas,userMask=null,k=6,outline=true,density=0.45}){
    const W=imgCanvas.width, H=imgCanvas.height;
    const out=document.createElement('canvas'); out.width=W; out.height=H; const c=ctx(out);

    // step 1: downsample & posterize
    const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; const t=ctx(tmp);
    t.drawImage(imgCanvas,0,0);
    const id=t.getImageData(0,0,W,H); const d=id.data;
    const bands = Math.max(3, Math.min(8,k));
    for(let i=0;i<d.length;i+=4){
      d[i]   = ((d[i]  /32)|0)*32;
      d[i+1] = ((d[i+1]/32)|0)*32;
      d[i+2] = ((d[i+2]/32)|0)*32;
    }
    t.putImageData(id,0,0);

    // optional user mask: zero outside to keep background clear
    if (userMask){
      const id2=t.getImageData(0,0,W,H); const d2=id2.data;
      for(let i=0;i<W*H;i++){ if(!userMask[i]) d2[i*4+3]=0; }
      t.putImageData(id2,0,0);
    }

    // step 2: faux stitch fill (angled lines clipped to posterized image)
    c.clearRect(0,0,W,H);
    c.save();
    c.drawImage(tmp,0,0); // base
    c.globalCompositeOperation='source-in';
    c.fillStyle='#0b1224'; // dark cloth
    c.fillRect(0,0,W,H);
    c.globalCompositeOperation='source-atop';
    c.strokeStyle='rgba(255,255,255,0.9)';
    c.lineWidth = Math.max(1, Math.round(1/density));
    const step = Math.max(6, Math.round(14/density));
    c.rotate(-12*Math.PI/180);
    for(let y=-W; y<H+W; y+=step){ c.beginPath(); c.moveTo(-1000,y); c.lineTo(W+1000,y); c.stroke(); }
    c.restore();

    // step 3: edges
    if(outline){
      const e=ctx(tmp);
      e.clearRect(0,0,W,H);
      e.drawImage(imgCanvas,0,0);
      const id3=e.getImageData(0,0,W,H); const px=id3.data;
      const ed=new Uint8ClampedArray(W*H);
      // sobel-ish
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          const i=(y*W+x)*4;
          const gx = px[i+4]-px[i-4] + 2*(px[i+4*W]-px[i-4*W]) + px[i+4*(W+1)]-px[i-4*(W+1)];
          const gy = px[i+4*W]-px[i-4*W] + 2*(px[i+4*(W+1)]-px[i-4*(W+1)]) + px[i+4*(W+2)]-px[i-4*(W+2)];
          ed[y*W+x] = (Math.abs(gx)+Math.abs(gy) > 200) ? 255 : 0;
        }
      }
      const edImg=e.createImageData(W,H);
      for(let i=0;i<W*H;i++){ const v=ed[i]; edImg.data[i*4+0]=0; edImg.data[i*4+1]=0; edImg.data[i*4+2]=0; edImg.data[i*4+3]=v; }
      e.putImageData(edImg,0,0);
      c.drawImage(tmp,0,0);
    }

    return { canvas: out, W, H };
  };
})(window);