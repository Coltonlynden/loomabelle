// js/lib/quantize.js
import { log } from './ui.js';

/**
 * Progressive median-cut quantization in a Web Worker with progress.
 * We transfer raw buffers (ArrayBuffer) instead of ImageData to avoid huge structured clones.
 * Falls back to main-thread if workers are blocked.
 */

let WORKER_URL = null;

function makeWorkerURL(){
  if (WORKER_URL) return WORKER_URL;
  const src = `
  let data=null, W=0, H=0, mask=null;

  // Utility: split along longest axis
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
    // in-place sort slice by chosen channel (Schwartzian transform to avoid costly lambda)
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
    // process by rows in chunks to yield back to event loop
    const CHUNK = Math.max(16, Math.floor(H/60));
    const pal = palette; // Uint8
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
      // receive raw buffers as transferables
      const { width, height, rgbaBuffer, maskBuffer } = e.data;
      W = width; H = height;
      data = new Uint8ClampedArray(rgbaBuffer);
      mask = maskBuffer ? new Uint8Array(maskBuffer) : null;
      postMessage({ready:true});
      return;
    }
    if (cmd === 'quantize'){
      const { k } = e.data;

      // Build point index list (skip masked-out pixels) in chunks with progress up to 50
      const pts = new Uint32Array(W*H); let n=0;
      const STEP = Math.max(1, Math.floor(Math.sqrt((W*H)/100000))); // sample to reduce load on very large images
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

      // Build ranges
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

      // Now index whole image progressively
      indexImage(palette, Math.min(k, ranges.length));
    }
  };
  `;
  WORKER_URL = URL.createObjectURL(new Blob([src], {type:'text/javascript'}));
  return WORKER_URL;
}

export async function quantizeSafe(imgData, k, mask, onProgress){
  // Prefer worker
  try{
    const url = makeWorkerURL();
    const w = new Worker(url);

    const W = imgData.width, H = imgData.height;
    const rgba = imgData.data; // Uint8ClampedArray
    const rgbaBuf = rgba.buffer.slice(0); // copy to transferable buffer
    const maskBuf = mask ? mask.buffer.slice(0) : null;

    const p = new Promise((resolve, reject)=>{
      let palette=null, indexed=null;
      w.onmessage = (e)=>{
        const d = e.data;
        if (d.progress != null && onProgress) onProgress(d.progress);
        if (d.err) { reject(new Error(d.err)); }
        if (d.ready) return;
        if (d.palette){ palette = d.palette; return; }
        if (d.indexed){
          indexed = d.indexed;
          resolve({ indexed, palette: paletteToArray(palette), W, H });
        }
      };
      w.onerror = reject;
    });

    // init then quantize
    w.postMessage({cmd:'init', width:W, height:H, rgbaBuffer:rgbaBuf, maskBuffer:maskBuf}, maskBuf ? [rgbaBuf, maskBuf] : [rgbaBuf]);
    w.postMessage({cmd:'quantize', k});
    const out = await p;
    w.terminate();
    return out;

  }catch(err){
    log('Worker blocked or failed; using main thread quantization','warn');
    // Fallback: main-thread simplified quantize with small sampling
    return medianCutQuantizeMain(imgData, k, mask, onProgress);
  }
}

function paletteToArray(palUint){
  if (!palUint) return [];
  const out=[]; for(let i=0;i<palUint.length;i+=3) out.push([palUint[i], palUint[i+1], palUint[i+2]]);
  return out;
}

/*** Main-thread fallback with yields ***/
function medianCutQuantizeMain(imgData, k, mask, onProgress){
  const W=imgData.width,H=imgData.height,data=imgData.data;
  // sample points to avoid lock
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
    // crude poll until filled; in practice completes right after last chunk
    const t=setInterval(()=>{
      if (indexed[0]!==255 || indexed.indexOf(255)===-1){ clearInterval(t); res({indexed, palette, W, H}); }
    }, 30);
  });
}