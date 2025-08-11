// js/lib/quantize.js
import { log } from './ui.js';

/** ----------------------------------------------------------------
 * sampleDominant(canvas, maxK)
 * Simple k-means-ish dominant color sampler for seeding UI pickers.
 * ---------------------------------------------------------------- */
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
  for(let it=0; it<6; it++){
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
  return uniq.sort((a,b)=>(0.2126*a[0]+0.7152*a[1]+0.0722*a[2])-(0.2126*b[0]+0.7152*b[1]+0.0722*b[2]));
}

/** ----------------------------------------------------------------
 * quantizeSafe(imgData, k, mask, onProgress)
 * Progressive median-cut in a Worker (transfer raw buffers), with yieldy fallback.
 * onProgress(p) receives 0..100 updates (we use ~18..99 in app.js).
 * ---------------------------------------------------------------- */
let WORKER_URL = null;

function makeWorkerURL(){
  if (WORKER_URL) return WORKER_URL;
  const src = `
  let data=null, W=0, H=0, mask=null;

  function splitBox(pts, lo, hi){
    let rmin=255,rmax=0,gmin=255,gmax=0,bmin=255,bmax=0;
    for(let i=lo;i<hi;i++){
      const j=pts[i];
      const r=data[j], g=data[j+1], b=data[j+2];
      if(r<rmin)rmin=r; if(r>rmax)rmax=r;
      if(g<gmin)gmin=g; if(g>gmax)gmax=g;
      if(b<bmin)bmin=b; if(b>bmax)bmax=b;
    }
    const dr=rmax-rmin,dg=gmax-gmin,db=bmax-bmin;
    const ch=(dr>=dg&&dr>=db)?0:(dg>=db?1:2);
    const slice = [];
    for(let i=lo;i<hi;i++){ const j=pts[i]; slice.push([data[j+ch], j]); }
    slice.sort((A,B)=>A[0]-B[0]);
    for(let i=lo;i<hi;i++){ pts[i] = slice[i-lo][1]; }
    const mid=(lo+hi)>>1; return [[lo,mid],[mid,hi]];
  }

  function buildPalette(pts, ranges){
    const palette = new Uint8Array(ranges.length*3);
    for(let idx=0; idx<ranges.length; idx++){
      const [lo,hi] = ranges[idx];
      let rs=0,gs=0,bs=0,c=0;
      for(let i=lo;i<hi;i++){
        const j=pts[i]; rs+=data[j]; gs+=data[j+1]; bs+=data[j+2]; c++;
      }
      if(!c) c=1;
      const base = idx*3;
      palette[base  ] = (rs/c)|0;
      palette[base+1] = (gs/c)|0;
      palette[base+2] = (bs/c)|0;
    }
    return palette;
  }

  function indexImage(palette, k){
    const indexed = new Uint8Array(W*H).fill(255);
    const CHUNK = Math.max(16, Math.floor(H/60));
    const pal = palette;
    function workRow(y0){
      const yMax = Math.min(H, y0 + CHUNK);
      for(let y=y0; y<yMax; y++){
        const row = y*W;
        for(let x=0; x<W; x++){
          const i = (row + x);
          if (mask && mask[i] === 0) { indexed[i]=255; continue; }
          const j = i*4;
          let bi=0, bd=1e12;
          for(let c=0;c<k;c++){
            const base=c*3;
            const pr=pal[base], pg=pal[base+1], pb=pal[base+2];
            const dr=data[j]-pr, dg=data[j+1]-pg, db=data[j+2]-pb;
            const d=dr*dr+dg*dg+db*db;
            if(d<bd){ bd=d; bi=c; }
          }
          indexed[i]=bi;
        }
      }
      const progress = Math.round(60 + 40 * (yMax / H)); // 60..100
      postMessage({progress});
      if (yMax < H) {
        setTimeout(()=>workRow(yMax), 0);
      } else {
        postMessage({indexed}, [indexed.buffer]);
      }
    }
    workRow(0);
  }

  onmessage = (e)=>{
    const { cmd } = e.data;
    if (cmd === 'init'){
      const { width, height, rgbaBuffer, maskBuffer } = e.data;
      W = width; H = height;
      data = new Uint8ClampedArray(rgbaBuffer);
      mask = maskBuffer ? new Uint8Array(maskBuffer) : null;
      postMessage({ready:true});
      return;
    }
    if (cmd === 'quantize'){
      const { k } = e.data;
      const pts = new Uint32Array(W*H); let n=0;
      const STEP = Math.max(1, Math.floor(Math.sqrt((W*H)/100000)));
      for(let y=0;y<H;y+=STEP){
        const row=y*W;
        for(let x=0;x<W;x+=STEP){
          const i=row+x;
          if (mask && mask[i]===0) continue;
          pts[n++] = i*4;
        }
        if ((y & 31) === 0) postMessage({progress: Math.round( (y/H) * 40 )}); // 0..40
      }
      if (n===0){ postMessage({err:'empty'}); return; }
      const ptsView = pts.subarray(0,n);

      let ranges = [[0,n]];
      while (ranges.length < k){
        const r = ranges.shift();
        if (!r || r[1]-r[0] < 2) break;
        const s = splitBox(ptsView, r[0], r[1]);
        ranges.push(s[0], s[1]);
        ranges.sort((A,B)=>(B[1]-B[0])-(A[1]-A[0]));
        if (ranges.length % 2 === 0) postMessage({progress: 40 + Math.min(20, ranges.length)}); // 40..60
      }

      const palette = buildPalette(ptsView, ranges);
      postMessage({palette, k});

      indexImage(palette, Math.min(k, ranges.length));
    }
  };
  `;
  WORKER_URL = URL.createObjectURL(new Blob([src], {type:'text/javascript'}));
  return WORKER_URL;
}

export async function quantizeSafe(imgData, k, mask, onProgress){
  try{
    const url = makeWorkerURL();
    const w = new Worker(url); // classic worker

    const W = imgData.width, H = imgData.height;
    const rgba = imgData.data;
    const rgbaBuf = rgba.buffer.slice(0); // transferable copy
    const maskBuf = mask ? mask.buffer.slice(0) : null;

    const p = new Promise((resolve, reject)=>{
      let palette=null;
      w.onmessage = (e)=>{
        const d = e.data;
        if (d.progress != null && onProgress) onProgress(d.progress);
        if (d.err) { reject(new Error(d.err)); }
        if (d.ready) return;
        if (d.palette){ palette = d.palette; return; }
        if (d.indexed){
          resolve({ indexed: d.indexed, palette: paletteToArray(palette), W, H });
        }
      };
      w.onerror = reject;
    });

    w.postMessage({cmd:'init', width:W, height:H, rgbaBuffer:rgbaBuf, maskBuffer:maskBuf}, maskBuf ? [rgbaBuf, maskBuf] : [rgbaBuf]);
    w.postMessage({cmd:'quantize', k});
    const out = await p;
    w.terminate();
    return out;

  }catch(err){
    log('Worker blocked or failed; using main thread quantization','warn');
    return medianCutQuantizeMain(imgData, k, mask, onProgress);
  }
}

function paletteToArray(palUint){
  if (!palUint) return [];
  const out=[]; for(let i=0;i<palUint.length;i+=3) out.push([palUint[i], palUint[i+1], palUint[i+2]]);
  return out;
}

/** Main-thread fallback with yields */
function medianCutQuantizeMain(imgData, k, mask, onProgress){
  const W=imgData.width,H=imgData.height,data=imgData.data;
  const STEP = Math.max(1, Math.floor(Math.sqrt((W*H)/100000)));
  const pts=[];
  for(let y=0;y<H;y+=STEP){
    const row=y*W;
    for(let x=0;x<W;x+=STEP){
      const i=row+x;
      if(mask && mask[i]===0) continue;
      pts.push([data[i*4],data[i*4+1],data[i*4+2]]);
    }
  }
  function splitBox(arr, lo, hi){
    let rmin=255,rmax=0,gmin=255,gmax=0,bmin=255,bmax=0;
    for(let i=lo;i<hi;i++){const p=arr[i];
      if(p[0]<rmin)rmin=p[0]; if(p[0]>rmax)rmax=p[0];
      if(p[1]<gmin)gmin=p[1]; if(p[1]>gmax)gmax=p[1];
      if(p[2]<bmin)bmin=p[2]; if(p[2]>bmax)bmax=p[2];}
    const dr=rmax-rmin,dg=gmax-gmin,db=bmax-bmin; const ch=(dr>=dg&&dr>=db)?0:(dg>=db?1:2);
    arr.slice(lo,hi).sort((a,b)=>a[ch]-b[ch]).forEach((p,i)=>{arr[lo+i]=p});
    const mid=(lo+hi)>>1; return [[lo,mid],[mid,hi]];
  }
  let ranges=[[0,pts.length]];
  while(ranges.length<k){const r=ranges.shift(); if(!r||r[1]-r[0]<2)break; const s=splitBox(pts,r[0],r[1]); ranges.push(s[0],s[1]); ranges.sort((A,B)=>(B[1]-B[0])-(A[1]-A[0]));}
  const palette=ranges.map(([lo,hi])=>{let rs=0,gs=0,bs=0,c=0; for(let i=lo;i<hi;i++){const p=pts[i]; rs+=p[0]; gs+=p[1]; bs+=p[2]; c++; } if(!c)c=1; return [ (rs/c)|0, (gs/c)|0, (bs/c)|0 ];});

  const indexed=new Uint8Array(W*H).fill(255);
  const CHUNK=Math.max(16, Math.floor(H/60));
  function indexChunk(y0){
    const yMax=Math.min(H, y0+CHUNK);
    for(let y=y0;y<yMax;y++){
      const row=y*W;
      for(let x=0;x<W;x++){
        const i=row+x;
        if(mask && mask[i]===0){indexed[i]=255; continue;}
        const j=i*4; const r=data[j],g=data[j+1],b=data[j+2]; let bi=0,bd=1e12;
        for(let c=0;c<palette.length;c++){
          const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2];
          const dr=r-pr,dg=g-pg,db=b-pb; const d=dr*dr+dg*dg+db*db;
          if(d<bd){bd=d;bi=c;}
        }
        indexed[i]=bi;
      }
    }
    if (onProgress) onProgress(Math.round(60 + 40*(yMax/H)));
    if (yMax < H) setTimeout(()=>indexChunk(yMax),0);
  }
  indexChunk(0);
  return new Promise(res=>{
    const t=setInterval(()=>{
      // crude completion check; resolves when last chunk finished
      if (indexed[0]!==255 || indexed.indexOf(255)===-1){ clearInterval(t); res({indexed, palette, W, H}); }
    }, 30);
  });
}