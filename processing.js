// Web Worker bootstrap + image processing wrapper
(() => {
  const workerSrc = `
  let post = (t)=>postMessage(t);
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rgb2lab(r,g,b){
    // quick Lab conversion for edge weight (approx)
    const srgb = [r/255, g/255, b/255].map(v => v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
    let [x,y,z] = [
      (srgb[0]*0.4124 + srgb[1]*0.3576 + srgb[2]*0.1805)/0.95047,
      (srgb[0]*0.2126 + srgb[1]*0.7152 + srgb[2]*0.0722)/1.00000,
      (srgb[0]*0.0193 + srgb[1]*0.1192 + srgb[2]*0.9505)/1.08883
    ];
    [x,y,z] = [x,y,z].map(v => v>0.008856 ? Math.pow(v,1/3) : (7.787*v)+16/116);
    return [116*y-16, 500*(x-y), 200*(y-z)];
  }
  function sobelGray(w,h,data){
    const out = new Uint8ClampedArray(w*h);
    const gxK=[-1,0,1,-2,0,2,-1,0,1], gyK=[-1,-2,-1,0,0,0,1,2,1];
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        let gx=0, gy=0, p=0;
        for(let ky=-1; ky<=1; ky++){
          for(let kx=-1; kx<=1; kx++){
            const ix=(x+kx), iy=(y+ky);
            const o=(iy*w+ix)*4;
            // intensity = L from Lab
            const L = rgb2lab(data[o],data[o+1],data[o+2])[0];
            const idx=(ky+1)*3+(kx+1);
            gx += L*gxK[idx]; gy += L*gyK[idx];
          }
        }
        const mag = Math.sqrt(gx*gx + gy*gy);
        out[y*w+x] = clamp(mag*3, 0, 255);
      }
    }
    return out;
  }
  function posterize(data, levels){
    const step = 255/Math.max(1,levels-1);
    for(let i=0;i<data.length;i+=4){
      data[i]   = Math.round(data[i]/step)*step;
      data[i+1] = Math.round(data[i+1]/step)*step;
      data[i+2] = Math.round(data[i+2]/step)*step;
    }
  }
  function removeBgByCorner(data,w,h,fade=true){
    // sample corners -> most common color -> alpha out similar colors
    const samples = [];
    const take = (x,y)=>{ const o=(y*w+x)*4; samples.push([data[o],data[o+1],data[o+2]]); };
    const N = Math.max(1, Math.floor(Math.min(w,h)/10));
    for(let i=0;i<N;i++){ take(1+i,1); take(w-2-i,1); take(1+i,h-2); take(w-2-i,h-2); }
    // average
    let r=0,g=0,b=0; samples.forEach(s=>{r+=s[0];g+=s[1];b+=s[2];});
    r/=samples.length; g/=samples.length; b/=samples.length;
    for(let i=0;i<w*h;i++){
      const o=i*4;
      const dr=data[o]-r, dg=data[o+1]-g, db=data[o+2]-b;
      const d=Math.sqrt(dr*dr+dg*dg+db*db);
      // distance threshold
      const t=60;
      if (d<t) {
        data[o+3] = fade? Math.max(0, 255*(d/t)*0.5) : 0;
      }
    }
  }
  onmessage = async (e)=>{
    const m = e.data;
    if (m.type==='process'){
      const {imageBitmap, width, height, density, edges, posterizeLevels, removeBg, mask} = m;
      const off = new OffscreenCanvas(width,height);
      const ctx = off.getContext('2d', {willReadFrequently:true});
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(imageBitmap, 0,0,width,height);
      let img = ctx.getImageData(0,0,width,height);
      post({type:'progress', p:10});

      if (removeBg){ removeBgByCorner(img.data, width, height, true); }
      if (posterizeLevels>0){ posterize(img.data, posterizeLevels); }
      post({type:'progress', p:45});

      if (edges){
        const grayEdges = sobelGray(width,height,img.data);
        for(let i=0;i<grayEdges.length;i++){
          const ed = grayEdges[i];
          if (ed>140){
            const o=i*4;
            img.data[o]=20; img.data[o+1]=20; img.data[o+2]=20; img.data[o+3]=255;
          }
        }
      }
      post({type:'progress', p:70});

      if (mask){
        // keep only masked region (strokes), thicken
        const mctx = new OffscreenCanvas(width,height).getContext('2d');
        mctx.drawImage(mask,0,0,width,height);
        const md = mctx.getImageData(0,0,width,height).data;
        for(let i=0;i<width*height;i++){
          const a = md[i*4+3];
          if (a<40){ img.data[i*4+3] = Math.min(img.data[i*4+3], 30); } // fade out
        }
        post({type:'progress', p:85});
      }

      ctx.putImageData(img,0,0);
      const final = await off.convertToBlob({type:'image/png'});
      post({type:'done', blob:final});
    }
  };
  `;
  const blob = new Blob([workerSrc], {type:'application/javascript'});
  const worker = new Worker(URL.createObjectURL(blob));

  // Pipeline wrapper called by preview/draw scripts
  window.__loom_workerProcess = async (opts, onProgress) => {
    const {image, hostCanvas, rect, density, edges, posterize, removeBg, maskCanvas} = opts;
    // draw subset of original image into an offscreen area matching hostCanvas
    const c = document.createElement('canvas');
    c.width = hostCanvas.width; c.height = hostCanvas.height;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);

    const ib = await createImageBitmap(c);
    const posterizeLevels = posterize? 8 : 0;

    const p = new Promise((resolve,reject)=>{
      const onMsg = async ev => {
        const d = ev.data;
        if (d.type==='progress'){ onProgress?.(d.p); }
        if (d.type==='done'){
          worker.removeEventListener('message', onMsg);
          const img = new Image();
          img.onload = ()=>{
            const hctx = hostCanvas.getContext('2d');
            hctx.clearRect(0,0,hostCanvas.width,hostCanvas.height);
            hctx.drawImage(img, 0,0);
            resolve();
          };
          img.src = URL.createObjectURL(d.blob);
        }
      };
      worker.addEventListener('message', onMsg);
      worker.postMessage({
        type:'process',
        imageBitmap: ib,
        width: c.width,
        height: c.height,
        density,
        edges,
        posterizeLevels,
        removeBg,
        mask: maskCanvas || null
      }, [ib]);
    });
    return p;
  };
})();