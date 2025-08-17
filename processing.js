/* Lightweight in-browser "processing" helpers.
   - scaleToFit
   - quantize (median-cut-ish simple reducer)
   - edgeOutline (Sobel)
   - applyMask (remove background)
*/
window.LoomaProc = (() => {
  const scaleToFit = (img, maxW, maxH) => {
    const r = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = Math.max(1, Math.round(img.width * r));
    const h = Math.max(1, Math.round(img.height * r));
    const c = new OffscreenCanvas ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  };

  // simple color key (k-means-ish with fixed seeds)
  const quantize = (canvas, k = 8) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width:w, height:h } = canvas;
    const img = ctx.getImageData(0,0,w,h);
    const d = img.data;

    // init seeds by sampling
    const seeds = [];
    const step = Math.max(1, Math.floor((w*h)/k));
    for (let i=0;i<k;i++){
      const idx = (i*step*4) % d.length;
      seeds.push([d[idx], d[idx+1], d[idx+2]]);
    }

    for (let iter=0; iter<3; iter++){
      const sum = seeds.map(()=>[0,0,0,0]);
      for (let i=0;i<d.length;i+=4){
        let best=0, bd=1e9;
        for (let s=0;s<k;s++){
          const [r,g,b]=seeds[s];
          const dr=d[i]-r, dg=d[i+1]-g, db=d[i+2]-b;
          const dist = dr*dr+dg*dg+db*db;
          if (dist<bd){bd=dist;best=s;}
        }
        const t=sum[best]; t[0]+=d[i];t[1]+=d[i+1];t[2]+=d[i+2];t[3]++;
      }
      for (let s=0;s<k;s++){
        const t=sum[s]; if (t[3]) seeds[s]=[t[0]/t[3]|0,t[1]/t[3]|0,t[2]/t[3]|0];
      }
    }

    // map to palette
    for (let i=0;i<d.length;i+=4){
      let best=0, bd=1e9;
      for (let s=0;s<k;s++){
        const [r,g,b]=seeds[s];
        const dr=d[i]-r, dg=d[i+1]-g, db=d[i+2]-b;
        const dist = dr*dr+dg*dg+db*db;
        if (dist<bd){bd=dist;best=s;}
      }
      const [r,g,b]=seeds[best];
      d[i]=r;d[i+1]=g;d[i+2]=b;
    }
    ctx.putImageData(img,0,0);
    return { canvas, palette: seeds };
  };

  const edgeOutline = (canvas, scale=1) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width:w, height:h } = canvas;
    const src = ctx.getImageData(0,0,w,h);
    const dst = ctx.createImageData(w,h);
    const s = src.data, d = dst.data;
    const gx = [-1,0,1,-2,0,2,-1,0,1];
    const gy = [-1,-2,-1,0,0,0,1,2,1];
    const at = (x,y,c)=>s[(y*w+x)*4+c];

    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        let sx=0,sy=0;
        let i=0;
        for(let yy=-1;yy<=1;yy++){
          for(let xx=-1;xx<=1;xx++){
            const r = at(x+xx,y+yy,0)*0.3 + at(x+xx,y+yy,1)*0.59 + at(x+xx,y+yy,2)*0.11;
            sx += r * gx[i]; sy += r * gy[i]; i++;
          }
        }
        const g = Math.min(255, Math.hypot(sx,sy)*scale);
        const o = (y*w+x)*4;
        d[o]=d[o+1]=d[o+2]=255-g; d[o+3]=255;
      }
    }
    ctx.putImageData(dst,0,0);
    return canvas;
  };

  const applyMask = (photoCanvas, maskCanvas) => {
    const w = photoCanvas.width, h = photoCanvas.height;
    const out = new (window.OffscreenCanvas ? OffscreenCanvas : HTMLCanvasElement)(w,h);
    if (!(out instanceof OffscreenCanvas)) out.width=w, out.height=h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(photoCanvas,0,0);
    const img = ctx.getImageData(0,0,w,h);
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const mask = mctx.getImageData(0,0,w,h);
    for (let i=0;i<img.data.length;i+=4){
      const a = mask.data[i+3]; // alpha of mask
      if (a<20){ img.data[i+3] = 0; } // make background transparent
    }
    ctx.clearRect(0,0,w,h);
    ctx.putImageData(img,0,0);
    return out;
  };

  return { scaleToFit, quantize, edgeOutline, applyMask };
})();