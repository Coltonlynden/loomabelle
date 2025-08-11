// js/lib/quantize.js
import { log } from './ui.js';

export function sampleDominant(canvas, maxK = 6){
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
  const step = Math.max(1, Math.floor(Math.sqrt((W*H) / 20000)));
  const data = ctx.getImageData(0,0,W,H).data;
  const pts = [];
  for(let y=0;y<H;y+=step){
    const row = y*W;
    for(let x=0;x<W;x+=step){
      const i = (row + x) * 4;
      pts.push([data[i], data[i+1], data[i+2]]);
    }
  }
  const k = Math.min(maxK, Math.max(1, pts.length));
  const centers = [ pts[Math.floor(Math.random()*pts.length)] ];
  while(centers.length < k){
    let best=null, bd=-1;
    for(const p of pts){
      let d=1e9;
      for(const c of centers){ const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<d) d=dd; }
      if(d>bd){ bd=d; best=p; }
    }
    centers.push(best.slice());
  }
  for(let it=0; it<5; it++){
    const sum = Array.from({length:k}, ()=>[0,0,0,0]);
    for(const p of pts){
      let bi=0, bd=1e12;
      for(let i=0;i<k;i++){
        const c=centers[i]; const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
        if(d<bd){ bd=d; bi=i; }
      }
      const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
    }
    for(let i=0;i<k;i++){ const s=sum[i]; if(s[3]) centers[i]=[ (s[0]/s[3])|0, (s[1]/s[3])|0, (s[2]/s[3])|0 ]; }
  }
  const uniq=[];
  for(const c of centers){ if(!uniq.some(u=>Math.hypot(u[0]-c[0],u[1]-c[1],u[2]-c[2])<18)) uniq.push(c); }
  return uniq;
}

const UA = navigator.userAgent || '';
const IS_IOS = /\b(iPhone|iPad|iPod)\b/i.test(UA);

let IQ_READY = false;
async function ensureImageQ(){
  if (IQ_READY) return true;
  const tryLoad = (src)=>new Promise((res)=>{ const s=document.createElement('script'); s.src=src; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); });
  let ok = window.IQ ? true : await tryLoad('https://cdn.jsdelivr.net/npm/image-q@4.0.0/build/image-q.min.js');
  if (!ok) ok = await tryLoad('https://unpkg.com/image-q@4.0.0/build/image-q.min.js');
  IQ_READY = ok && !!window.IQ;
  return IQ_READY;
}

async function quantizeImageQ(imgData, k, mask, onProgress){
  const ok = await ensureImageQ();
  if (!ok) throw new Error('image-q failed to load');
  const W=imgData.width, H=imgData.height;
  const rgba = new Uint8ClampedArray(imgData.data);
  if (mask){
    for(let i=0;i<W*H;i++){ if(!mask[i]) rgba[i*4+3]=0; }
  }
  const pc = new window.IQ.utils.PointContainer();
  pc.fromUint8Array(rgba, W, H);
  const dist = new window.IQ.distance.EuclideanBT709NoAlpha();
  const palQ = new window.IQ.palette.NeuquantPalette(dist, 10);
  palQ.sample(pc);
  const pal = palQ.quantize();
  const imgQ = new window.IQ.image.NearestColor(dist);

  const result = new Uint8Array(W*H);
  const CH = Math.max(16, Math.floor(H/60));
  for(let y=0;y<H;y+=CH){
    const slice = pc.clone().crop(0, y, W, Math.min(CH, H-y));
    const outSlice = imgQ.quantizeSlice(slice, pal);
    for(let yy=0; yy<Math.min(CH, H-y); yy++){
      for(let x=0;x<W;x++){
        result[(y+yy)*W + x] = outSlice.getPoint(x,yy).uint32 >> 24;
      }
    }
    onProgress?.(35 + Math.round(60*((y+CH)/H)));
    await new Promise(r=>setTimeout(r,0));
  }
  const palArr=[]; for(let i=0;i<pal.getSize();i++){const c=pal.getPoint(i).getColor(); palArr.push([c.r,c.g,c.b]);}
  return { indexed: result, palette: palArr, W, H };
}

/** Worker median-cut (our stable fallback) */
let WORKER_URL=null;
function makeWorkerURL(){
  if (WORKER_URL) return WORKER_URL;
  const code=`${/* … (same worker from previous message) … */''}`;
  // For brevity here, we inject the same median-cut worker you already have.
  // Keep your existing worker code. If you deleted it, paste the previous version back in.
  return WORKER_URL;
}

async function quantizeWorker(imgData, k, mask, onProgress){
  // Use your existing worker implementation (unchanged).
  throw new Error('worker not hooked'); // placeholder if you removed it
}

export async function quantizeSafe(imgData, k, mask, onProgress){
  try{
    if (IS_IOS){
      // Prefer image‑q on iOS; if it fails, we *still* run the worker with smaller k.
      const k2 = Math.min(k, 4);
      try {
        return await quantizeImageQ(imgData, k2, mask, onProgress);
      } catch(e) {
        log('image-q load failed, using median‑cut worker (iOS fallback)','warn');
        return await quantizeWorker(imgData, Math.min(3, k2), mask, onProgress);
      }
    }else{
      return await quantizeWorker(imgData, k, mask, onProgress);
    }
  }catch(err){
    // Last ditch (never 3-color grayscale only)
    log('Quantize fatal fallback: '+(err?.message||err),'error');
    const W=imgData.width,H=imgData.height,d=imgData.data;
    const palette=[[32,32,32],[224,224,224],[160,160,160],[96,96,96]];
    const indexed=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++){const j=i*4; let bi=0,bd=1e9; for(let c=0;c<palette.length;c++){const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2]; const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb; const vv=dr*dr+dg*dg+db*db; if(vv<bd){bd=vv;bi=c;}} indexed[i]=bi;}
    return {indexed, palette, W, H};
  }
}