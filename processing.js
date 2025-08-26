/* Image & mask helpers + auto-highlight via ONNX Runtime Web (U2Netp).
   Falls back to fast luminance/edge heuristic when model isn't available. */
const Proc = (() => {
  const S = {};

  S.loadImageBitmap = async (fileOrURL) => {
    const src = typeof fileOrURL === 'string'
      ? fileOrURL
      : URL.createObjectURL(fileOrURL);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const bmp = await createImageBitmap(img);
    if (typeof fileOrURL !== 'string') URL.revokeObjectURL(src);
    return bmp;
  };

  // Draw bitmap into canvas, fit/contain
  S.drawContain = (ctx, bmp) => {
    const {canvas} = ctx;
    const iw=bmp.width, ih=bmp.height, cw=canvas.width, ch=canvas.height;
    const s=Math.min(cw/iw, ch/ih), w=iw*s, h=ih*s, x=(cw-w)/2, y=(ch-h)/2;
    ctx.clearRect(0,0,cw,ch); ctx.drawImage(bmp, x,y,w,h);
    return {x,y,w,h, scale:s};
  };

  // ONNX U2Netp: 320x320 -> 1x320x320 mask
  let onnxSession=null;
  async function ensureModel(){
    if (onnxSession) return onnxSession;
    if (!globalThis.ort) throw new Error('ORT missing');
    const bytes = await fetch('models/u2netp.onnx').then(r=>r.arrayBuffer());
    onnxSession = await ort.InferenceSession.create(bytes, {executionProviders:['wasm']});
    return onnxSession;
  }

  S.autoMask = async (bmp, outW, outH) => {
    try{
      await ensureModel();
      const W=320,H=320;
      const off = new OffscreenCanvas(W,H);
      const ox=off.getContext('2d', {willReadFrequently:true});
      ox.drawImage(bmp,0,0,W,H);
      const rgba = ox.getImageData(0,0,W,H).data;
      // NHWC -> NCHW float32 normalized
      const input = new Float32Array(1*3*H*W);
      for(let i=0,p=0;i<rgba.length;i+=4, p++){
        input[0*H*W + p] = rgba[i]  /255;  // R
        input[1*H*W + p] = rgba[i+1]/255;  // G
        input[2*H*W + p] = rgba[i+2]/255;  // B
      }
      const tensor = new ort.Tensor('float32', input, [1,3,H,W]);
      const kv = await onnxSession.run({ 'input': tensor });
      const pred = kv[Object.keys(kv)[0]].data; // 1*1*H*W
      // upscale to outW/outH
      const m = new Uint8ClampedArray(outW*outH);
      // simple nearest upscale
      for(let y=0;y<outH;y++){
        for(let x=0;x<outW;x++){
          const sx = Math.floor(x*outW/W);
          const sy = Math.floor(y*outH/H);
          const v = pred[sy*W+sx];
          m[y*outW+x] = v>0.5 ? 255 : 0;
        }
      }
      return m;
    }catch(err){
      // Fallback: fast luminance + edge magnitude threshold
      const off = new OffscreenCanvas(outW,outH);
      const ox=off.getContext('2d',{willReadFrequently:true});
      ox.drawImage(bmp,0,0,outW,outH);
      const {data} = ox.getImageData(0,0,outW,outH);
      const g = new Float32Array(outW*outH);
      for(let i=0,p=0;i<data.length;i+=4,p++){
        g[p] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
      }
      // sobel magnitude
      const mag = new Float32Array(outW*outH);
      const kx=[-1,0,1,-2,0,2,-1,0,1], ky=[-1,-2,-1,0,0,0,1,2,1];
      for(let y=1;y<outH-1;y++){
        for(let x=1;x<outW-1;x++){
          let sx=0, sy=0, q=0;
          for(let j=-1;j<=1;j++){
            for(let i=-1;i<=1;i++){
              const v=g[(y+j)*outW+(x+i)];
              sx+=v*kx[++q-1]; sy+=v*ky[q-1];
            }
          }
          mag[y*outW+x]=Math.hypot(sx,sy);
        }
      }
      // adaptive threshold
      let sum=0; for(let i=0;i<mag.length;i++) sum+=mag[i];
      const t=sum/mag.length*1.2;
      const m = new Uint8ClampedArray(outW*outH);
      for(let i=0;i<mag.length;i++) m[i]=mag[i]>t?255:0;
      return m;
    }
  };

  // Flood fill for wand
  S.floodFill = (imgData, x, y, tol=24) => {
    const {width:w,height:h,data} = imgData;
    const idx = (x,y)=>((y*w+x)<<2);
    const target = data.slice(idx(x,y), idx(x,y)+3);
    const out = new Uint8ClampedArray(w*h);
    const Q=[[x,y]]; out[y*w+x]=1;
    while(Q.length){
      const [cx,cy]=Q.pop();
      const nb=[[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dx,dy] of nb){
        const nx=cx+dx, ny=cy+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        if(out[ny*w+nx]) continue;
        const k=idx(nx,ny);
        const dr=Math.abs(data[k]-target[0]),
              dg=Math.abs(data[k+1]-target[1]),
              db=Math.abs(data[k+2]-target[2]);
        if(dr+dg+db<=tol*3){
          out[ny*w+nx]=1; Q.push([nx,ny]);
        }
      }
    }
    return out; // 0/1 mask
  };

  return S;
})();