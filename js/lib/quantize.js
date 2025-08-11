import { log } from './ui.js';

export function sampleDominant(canvas,maxK=6){
  const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d'); const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
  const pts=[],dat=ctx.getImageData(0,0,W,H).data;
  for(let y=0;y<H;y+=step) for(let x=0;x<W;x+=step){const i=(y*W+x)*4; pts.push([dat[i],dat[i+1],dat[i+2]]);}
  const k=maxK, centers=[pts[Math.floor(Math.random()*pts.length)]];
  while(centers.length<k){let best=null,bd=-1;for(const p of pts){let d=1e9;for(const c of centers){const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(dd<d)d=dd;} if(d>bd){bd=d;best=p;}} centers.push(best.slice());}
  for(let it=0;it<6;it++){const sum=Array.from({length:k},()=>[0,0,0,0]);
    for(const p of pts){let bi=0,bd=1e12;for(let i=0;i<k;i++){const c=centers[i];const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(d<bd){bd=d;bi=i;}} sum[bi][0]+=p[0];sum[bi][1]+=p[1];sum[bi][2]+=p[2];sum[bi][3]++}
    for(let i=0;i<k;i++){const s=sum[i]; if(s[3]) centers[i]=[s[0]/s[3]|0,s[1]/s[3]|0,s[2]/s[3]|0];}
  }
  const uniq=[]; for(const c of centers){if(!uniq.some(u=>Math.hypot(u[0]-c[0],u[1]-c[1],u[2]-c[2])<18)) uniq.push(c);}
  return uniq.sort((a,b)=>(0.2126*a[0]+0.7152*a[1]+0.0722*a[2])-(0.2126*b[0]+0.7152*b[1]+0.0722*b[2]));
}

function medianCutQuantize(imgData,k,mask){
  const W=imgData.width,H=imgData.height,data=imgData.data;
  const pts=[]; for(let i=0;i<W*H;i++){ if(mask&&mask[i]===0) continue; const j=i*4; pts.push([data[j],data[j+1],data[j+2]]); }
  if(pts.length===0) return {indexed:new Uint8Array(W*H).fill(255),palette:[],W,H};
  function splitBox(lo,hi){
    let rmin=255,rmax=0,gmin=255,gmax=0,bmin=255,bmax=0;
    for(let i=lo;i<hi;i++){const p=pts[i]; if(p[0]<rmin)rmin=p[0]; if(p[0]>rmax)rmax=p[0]; if(p[1]<gmin)gmin=p[1]; if(p[1]>gmax)gmax=p[1]; if(p[2]<bmin)bmin=p[2]; if(p[2]>bmax)bmax=p[2];}
    const dr=rmax-rmin,dg=gmax-gmin,db=bmax-bmin; const ch=(dr>=dg&&dr>=db)?0:(dg>=db?1:2);
    pts.slice(lo,hi).sort((a,b)=>a[ch]-b[ch]).forEach((p,i)=>{pts[lo+i]=p}); const mid=(lo+hi)>>1; return [[lo,mid],[mid,hi]];
  }
  const ranges=[[0,pts.length]];
  while(ranges.length<k){const r=ranges.shift(); if(!r||r[1]-r[0]<2)break; const s=splitBox(r[0],r[1]); ranges.push(s[0],s[1]); ranges.sort((A,B)=>(B[1]-B[0])-(A[1]-A[0]));}
  const palette=ranges.map(([lo,hi])=>{let rs=0,gs=0,bs=0,c=0; for(let i=lo;i<hi;i++){const p=pts[i]; rs+=p[0]; gs+=p[1]; bs+=p[2]; c++; } if(!c)c=1; return [ (rs/c)|0, (gs/c)|0, (bs/c)|0 ];});
  const indexed=new Uint8Array(W*H).fill(255);
  for(let i=0;i<W*H;i++){
    if(mask&&mask[i]===0){indexed[i]=255; continue;}
    const j=i*4; const r=data[j],g=data[j+1],b=data[j+2]; let bi=0,bd=1e12;
    for(let c=0;c<palette.length;c++){const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2]; const d=(r-pr)**2+(g-pg)**2+(b-pb)**2; if(d<bd){bd=d;bi=c;}}
    indexed[i]=bi;
  }
  return {indexed,palette,W,H};
}

export async function quantizeSafe(imgData,k,mask){
  if(!window._qWorkerURL){
    window._qWorkerURL=URL.createObjectURL(new Blob([`
      self.onmessage=(e)=>{const {img,k,mask}=e.data; const W=img.width,H=img.height,data=new Uint8ClampedArray(img.data);
        const pts=[]; for(let i=0;i<W*H;i++){ if(mask&&mask[i]===0) continue; const j=i*4; pts.push([data[j],data[j+1],data[j+2]]);}
        if(pts.length===0){ self.postMessage({err:'empty'}); return;}
        function split(lo,hi){let rmin=255,rmax=0,gmin=255,gmax=0,bmin=255,bmax=0;
          for(let i=lo;i<hi;i++){const p=pts[i]; if(p[0]<rmin)rmin=p[0]; if(p[0]>rmax)rmax=p[0];
            if(p[1]<gmin)gmin=p[1]; if(p[1]>gmax)gmax=p[1]; if(p[2]<bmin)bmin=p[2]; if(p[2]>bmax)bmax=p[2];}
          const dr=rmax-rmin,dg=gmax-gmin,db=bmax-bmin; const ch=(dr>=dg&&dr>=db)?0:(dg>=db?1:2);
          pts.slice(lo,hi).sort((a,b)=>a[ch]-b[ch]).forEach((p,i)=>{pts[lo+i]=p}); const mid=(lo+hi)>>1; return [[lo,mid],[mid,hi]];
        }
        const ranges=[[0,pts.length]]; while(ranges.length<k){const r=ranges.shift(); if(!r||r[1]-r[0]<2)break;
          const s=split(r[0],r[1]); ranges.push(s[0],s[1]); ranges.sort((A,B)=>(B[1]-B[0])-(A[1]-A[0]));}
        const palette=ranges.map(([lo,hi])=>{let rs=0,gs=0,bs=0,c=0; for(let i=lo;i<hi;i++){const p=pts[i]; rs+=p[0]; gs+=p[1]; bs+=p[2]; c++; } if(!c)c=1; return [rs/c|0,gs/c|0,bs/c|0];});
        const indexed=new Uint8Array(W*H).fill(255);
        for(let i=0;i<W*H;i++){ if(mask&&mask[i]===0){indexed[i]=255; continue;}
          const j=i*4; const r=data[j],g=data[j+1],b=data[j+2]; let bi=0,bd=1e12;
          for(let c=0;c<palette.length;c++){const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2]; const d=(r-pr)**2+(g-pg)**2+(b-pb)**2; if(d<bd){bd=d;bi=c;}}
          indexed[i]=bi;} self.postMessage({indexed,palette,W,H});};`],{type:'text/javascript'}));
  }
  try{
    const worker=new Worker(window._qWorkerURL);
    const p=new Promise((res,rej)=>{worker.onmessage=e=>{if(e.data.err) rej(e.data.err); else res(e.data)}; worker.onerror=rej;});
    worker.postMessage({img:imgData,k,mask}); const out=await p; worker.terminate(); return out;
  }catch(err){ log('Worker blocked; using main thread','warn'); return medianCutQuantize(imgData,k,mask); }
}
