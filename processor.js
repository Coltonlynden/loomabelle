/* Loomabelle processor – offline, fast, no deps (v1)
   - loadImage(file) -> {image, bitmap, width, height}
   - renderPreview(canvas, imageBitmap)
   - processImage(imageBitmap, {reduce, outline, density, mask}) -> ImageData
   - simple exportPNG(canvas) helper
*/
(function(global){
  'use strict';
  const Proc = {};

  const ua = navigator.userAgent||'';
  const IS_IOS = /(iPhone|iPad|iPod)/i.test(ua);
  const MAX_SIDE = IS_IOS ? 1280 : 2000;

  function clamp(v,mi,ma){ return Math.max(mi, Math.min(ma, v)); }

  Proc.loadImage = async function(file){
    // HEIC handling skipped for simplicity; browsers usually convert via picker
    const url = URL.createObjectURL(file);
    try{
      const img = await createImageBitmap(file, {premultiplyAlpha:'premultiply'}).catch(async()=>{
        const im = new Image(); im.decoding='async'; im.src = url;
        await im.decode(); return await createImageBitmap(im);
      });
      let W = img.width, H = img.height;
      if (Math.max(W,H)>MAX_SIDE){ const r=MAX_SIDE/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
      const off = new OffscreenCanvas? new OffscreenCanvas(W,H) : (function(){const c=document.createElement('canvas');c.width=W;c.height=H;return c;})();
      const c = off.getContext('2d', {willReadFrequently:true});
      c.drawImage(img, 0,0, W,H);
      const bitmap = await (off.convertToBlob? createImageBitmap(await off.convertToBlob()): Promise.resolve(img));
      return { image:file, bitmap, width:W, height:H };
    } finally { URL.revokeObjectURL(url); }
  };

  Proc.renderPreview = function(canvas, bitmap){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    // letterbox fit
    const iw = bitmap.width, ih = bitmap.height;
    const scale = Math.min(W/iw, H/ih);
    const w = Math.max(1, Math.floor(iw*scale)), h = Math.max(1, Math.floor(ih*scale));
    const ox = (W-w)>>1, oy = (H-h)>>1;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,W,H);
    ctx.drawImage(bitmap, ox, oy, w, h);
  };

  // Simple quantizer + edge overlay + diagonal hatch fill
  Proc.processImage = async function(bitmap, opts){
    const {reduce=true, outline=true, density=0.4, mask=null, canvasSize=[640,360]} = opts||{};
    const W = bitmap.width, H = bitmap.height;
    const work = new OffscreenCanvas? new OffscreenCanvas(W,H) : (function(){const c=document.createElement('canvas');c.width=W;c.height=H;return c;})();
    const cx = work.getContext('2d', {willReadFrequently:true});
    cx.drawImage(bitmap,0,0,W,H);
    let img = cx.getImageData(0,0,W,H);
    const d = img.data;

    // Optional mask: zero alpha where mask==0
    if (mask && mask.length===W*H){
      for(let i=0;i<W*H;i++){ if(!mask[i]) d[i*4+3]=0; }
    }

    // Quantize by cube rounding
    if (reduce){
      const step = 36; // ~7 levels per channel
      for(let i=0;i<d.length;i+=4){
        d[i]   = Math.round(d[i]  /step)*step;
        d[i+1] = Math.round(d[i+1]/step)*step;
        d[i+2] = Math.round(d[i+2]/step)*step;
      }
    }

    // Edge outline via Sobel
    if (outline){
      const gx=[-1,0,1,-2,0,2,-1,0,1], gy=[-1,-2,-1,0,0,0,1,2,1];
      const gray=new Uint8ClampedArray(W*H);
      for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ const i=(y*W+x)*4; gray[y*W+x]=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0; } }
      const edge=new Uint8ClampedArray(W*H);
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          let sx=0, sy=0, k=0;
          for(let yy=-1;yy<=1;yy++){ for(let xx=-1;xx<=1;xx++){ const v=gray[(y+yy)*W+(x+xx)]; sx+=v*gx[k]; sy+=v*gy[k]; k++; } }
          const mag=Math.sqrt(sx*sx+sy*sy);
          edge[y*W+x]= mag>120 ? 255 : 0;
        }
      }
      // draw edge in dark
      for(let i=0;i<W*H;i++){
        if(edge[i]>0){
          const j=i*4; d[j]=20; d[j+1]=24; d[j+2]=34; d[j+3]=255;
        }
      }
    }

    // Diagonal hatch overlay that scales with density
    const ctx2 = work.getContext('2d');
    ctx2.putImageData(img,0,0);
    const hatch = document.createElement('canvas'); hatch.width=64; hatch.height=64;
    const hctx = hatch.getContext('2d');
    hctx.fillStyle='rgba(0,0,0,0)'; hctx.fillRect(0,0,64,64);
    hctx.strokeStyle='rgba(20,24,34,0.25)';
    hctx.lineWidth = Math.max(1, Math.floor(3 - density*2));
    hctx.beginPath();
    for(let x=-64;x<64*2;x+=Math.max(6, Math.floor(16 - density*10))){
      hctx.moveTo(x,0); hctx.lineTo(x+64,64);
    }
    hctx.stroke();
    const pattern = ctx2.createPattern(hatch,'repeat');
    ctx2.globalCompositeOperation='multiply';
    ctx2.fillStyle=pattern;
    ctx2.fillRect(0,0,W,H);
    ctx2.globalCompositeOperation='source-over';

    // If mask provided, make outside white
    if (mask){
      const id = ctx2.getImageData(0,0,W,H);
      const dd=id.data;
      for(let i=0;i<W*H;i++){
        if(!mask[i]){
          const j=i*4; dd[j]=dd[j+1]=dd[j+2]=255; dd[j+3]=255;
        }
      }
      ctx2.putImageData(id,0,0);
    }

    return ctx2.getImageData(0,0,W,H);
  };

  Proc.exportPNG = function(canvas, name='loomabelle.png'){
    canvas.toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); });
  };

  global.LoomaProcessor = Proc;
})(window);
