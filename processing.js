// Very lightweight, device-safe “stitch look” pipeline with progress reporting.
// - If mask is provided: background is removed (outside mask becomes transparent)
// - Palette reduction + edge outline + cross-hatch shading preview
// - Returns an ImageBitmap to keep memory lower across iOS

const Processing = (()=>{

  // utils
  function createCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function drawToFit(srcBmp, w, h){
    const c=createCanvas(w,h), x=c.getContext('2d', {willReadFrequently:true});
    // scale to fit (no letterbox: fill)
    const s = Math.min(w/srcBmp.width, h/srcBmp.height);
    const dw = Math.round(srcBmp.width*s), dh=Math.round(srcBmp.height*s);
    const dx=(w-dw)>>1, dy=(h-dh)>>1;
    x.drawImage(srcBmp,0,0,srcBmp.width,srcBmp.height, dx,dy,dw,dh);
    return c;
  }

  function report(cb, p, label){ if(cb) cb(p,label); }

  // naive palette reduce (bucketize)
  function paletteReduce(img, levels){
    const {width:w,height:h}=img;
    const ctx=img.getContext('2d'); const id=ctx.getImageData(0,0,w,h); const d=id.data;
    const step = Math.max(2, Math.floor(256/levels));
    for(let i=0;i<d.length;i+=4){
      d[i]  = Math.min(255, Math.floor(d[i]/step)*step);
      d[i+1]= Math.min(255, Math.floor(d[i+1]/step)*step);
      d[i+2]= Math.min(255, Math.floor(d[i+2]/step)*step);
    }
    ctx.putImageData(id,0,0); return img;
  }

  // Sobel edge (grayscale)
  function sobelEdges(img){
    const {width:w,height:h}=img;
    const c=createCanvas(w,h), ctx=c.getContext('2d');
    ctx.drawImage(img,0,0);
    const src=ctx.getImageData(0,0,w,h); const d=src.data;
    // grayscale
    const g=new Uint8ClampedArray(w*h);
    for(let i=0,j=0;i<d.length;i+=4,j++){ g[j]=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0; }
    const out=createCanvas(w,h); const octx=out.getContext('2d'); const oid=octx.createImageData(w,h); const od=oid.data;
    const kx=[-1,0,1,-2,0,2,-1,0,1], ky=[-1,-2,-1,0,0,0,1,2,1];
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        let ix=y*w+x, sx=0, sy=0, n=0;
        for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
          const v=g[(y+j)*w+(x+i)];
          sx+=v*kx[++n-1]; sy+=v*ky[n-1];
        }
        const mag=Math.min(255, Math.hypot(sx,sy)|0);
        const p=(ix<<2); od[p]=od[p+1]=od[p+2]=mag; od[p+3]=255;
      }
    }
    octx.putImageData(oid,0,0); return out;
  }

  // hatch overlay (angle based on density)
  function hatch(img, density=3){
    const {width:w,height:h}=img;
    const ctx=img.getContext('2d');
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle='#0f172a';
    ctx.lineWidth = Math.max(1, Math.floor(Math.max(w,h)/800));
    const step = Math.max(6, 18 - density*2);
    for(let y=-h; y<h; y+=step){
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo(w, y+h);
      ctx.stroke();
    }
    ctx.restore();
    return img;
  }

  // apply mask: outside transparent
  function applyMask(img, mask){
    const {width:w,height:h}=img;
    const ctx=img.getContext('2d'); const id=ctx.getImageData(0,0,w,h); const d=id.data;
    const mx = mask.getContext('2d'); const md = mx.getImageData(0,0,mask.width,mask.height).data;
    // assume same size; if not, scale mask
    if(mask.width!==w || mask.height!==h){
      const scaled=createCanvas(w,h); const sx=scaled.getContext('2d'); sx.drawImage(mask,0,0,w,h); mask=scaled;
    }
    const mscaled = mask.getContext('2d').getImageData(0,0,w,h).data;
    for(let i=0;i<d.length;i+=4){
      const a = mscaled[i+3]; // alpha from drawing
      if(a<10){ d[i+3]=0; } // hide outside
    }
    ctx.putImageData(id,0,0); return img;
  }

  async function toBitmap(canvas){
    // convert to ImageBitmap to lighten memory on iOS when re-drawing
    return await createImageBitmap(canvas);
  }

  // Public
  async function processImage(srcBmp, maskCanvas, opts, onProgress){
    const density = Math.max(1, Math.min(8, opts?.density ?? 3));
    const W = Math.min(1600, srcBmp.width);
    const H = Math.round(srcBmp.height * (W/srcBmp.width));
    report(onProgress, 0.05, 'Scaling…');
    let work = drawToFit(srcBmp, W, H);

    if(maskCanvas && !opts?.noSubject){
      report(onProgress, 0.15, 'Applying selection…');
      work = applyMask(work, maskCanvas);
    }

    if(opts?.palette){
      report(onProgress, 0.35, 'Reducing colors…');
      work = paletteReduce(work, 12 - density); // fewer levels at higher density
    }

    let edgeLayer=null;
    if(opts?.edge){
      report(onProgress, 0.55, 'Finding edges…');
      edgeLayer = sobelEdges(work);
    }

    report(onProgress, 0.7, 'Adding stitches…');
    work = hatch(work, density);

    if(edgeLayer){
      const ctx = work.getContext('2d');
      ctx.globalAlpha = 0.75; ctx.globalCompositeOperation='multiply';
      ctx.drawImage(edgeLayer,0,0);
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
    }

    report(onProgress, 0.95, 'Finalizing…');
    const bmp = await toBitmap(work);
    report(onProgress, 1, 'Done');
    return bmp;
  }

  return { processImage };
})();
