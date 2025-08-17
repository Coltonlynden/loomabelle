// Lightweight image processing (client-only) with guardrails for memory.
// Exposes window.LoomaProcessing with process() and savePNG()

(function(){
  const MAX_SIDE = 1280; // mobile-safe cap

  function createCanvas(w,h){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function downscaleToSafe(bitmap){
    let {width:w, height:h} = bitmap;
    if (Math.max(w,h) > MAX_SIDE){
      const scale = MAX_SIDE / Math.max(w,h);
      w = Math.round(w*scale); h = Math.round(h*scale);
    }
    const c = createCanvas(w,h);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap,0,0,w,h);
    return c;
  }

  // Simple palette reduction (posterize) + optional Sobel edges + optional mask
  function processCanvas(srcCanvas, {palette=true, edge=true, density=20, maskCanvas=null}={}){
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = createCanvas(w,h);
    const octx = out.getContext('2d');
    octx.drawImage(srcCanvas,0,0);
    let img = octx.getImageData(0,0,w,h);
    const d = img.data;

    // Posterize
    if (palette){
      const steps = Math.max(2, Math.round(8 - (density/100)*6)); // 2..8
      const stepSize = Math.floor(256/steps);
      for (let i=0;i<d.length;i+=4){
        d[i]   = Math.floor(d[i]  /stepSize)*stepSize;
        d[i+1] = Math.floor(d[i+1]/stepSize)*stepSize;
        d[i+2] = Math.floor(d[i+2]/stepSize)*stepSize;
      }
    }

    // Optional subject mask: keep drawn area, fade background
    if (maskCanvas){
      const mctx = maskCanvas.getContext('2d');
      const m = mctx.getImageData(0,0,w,h).data;
      for (let i=0;i<d.length;i+=4){
        const a = m[i+3]; // alpha
        if (a < 10){ // background
          // fade toward fabric color (light)
          d[i] = d[i]*0.1 + 245*0.9;
          d[i+1] = d[i+1]*0.1 + 240*0.9;
          d[i+2] = d[i+2]*0.1 + 235*0.9;
        }
      }
    }

    // Edge overlay (cheap)
    if (edge){
      const e = createCanvas(w,h);
      const ex = e.getContext('2d');
      ex.drawImage(srcCanvas,0,0);
      const ei = ex.getImageData(0,0,w,h);
      const ed = ei.data;
      // Luma + 3x3 Sobel-ish
      const gx = [-1,0,1,-2,0,2,-1,0,1];
      const gy = [-1,-2,-1,0,0,0,1,2,1];
      function lumAt(x,y){
        const p=(y*w+x)*4;
        return 0.2126*ed[p]+0.7152*ed[p+1]+0.0722*ed[p+2];
      }
      for (let y=1;y<h-1;y++){
        for (let x=1;x<w-1;x++){
          let sx=0,sy=0,k=0;
          for (let j=-1;j<=1;j++){
            for (let i=-1;i<=1;i++){
              const L = lumAt(x+i,y+j);
              sx += L*gx[k]; sy += L*gy[k]; k++;
            }
          }
          const mag = Math.min(255, Math.hypot(sx,sy));
          const p=(y*w+x)*4;
          const v = 255 - mag; // dark lines
          d[p] = v; d[p+1]=v; d[p+2]=v;
        }
      }
    }

    octx.putImageData(img,0,0);
    return out;
  }

  async function process(bitmap, opts){
    const base = downscaleToSafe(bitmap);
    let mask = null;
    if (opts && opts.maskBitmap){
      // Ensure mask matches size
      mask = createCanvas(base.width, base.height);
      mask.getContext('2d').drawImage(opts.maskBitmap,0,0,base.width,base.height);
    }
    const result = processCanvas(base, {
      palette: !!opts.palette,
      edge: !!opts.edge,
      density: opts.density ?? 20,
      maskCanvas: mask
    });
    return result;
  }

  function savePNG(canvas, name='loomabelle.png'){
    canvas.toBlob((blob)=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=name;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  window.LoomaProcessing = { process, savePNG };
})();