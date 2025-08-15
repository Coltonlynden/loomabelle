export function kmeansQuantize(ctx, k=8, iters=6){
  const {width:w,height:h}=ctx.canvas;
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  const centers=[];
  for(let i=0;i<k;i++){ const p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); }
  const labels=new Uint8Array(w*h);
  for(let it=0; it<iters; it++){
    for(let i=0;i<w*h;i++){
      const r=d[i*4], g=d[i*4+1], b=d[i*4+2];
      let best=0, bd=Infinity;
      for(let c=0;c<k;c++){ const cc=centers[c]; const dist=(r-cc[0])**2+(g-cc[1])**2+(b-cc[2])**2; if(dist<bd){bd=dist; best=c;} }
      labels[i]=best;
    }
    const sums=Array.from({length:k},()=>[0,0,0,0]);
    for(let i=0;i<w*h;i++){ const c=labels[i],p=i*4; sums[c][0]+=d[p]; sums[c][1]+=d[p+1]; sums[c][2]+=d[p+2]; sums[c][3]++; }
    for(let c=0;c<k;c++){ if(sums[c][3]) centers[c]=[sums[c][0]/sums[c][3], sums[c][1]/sums[c][3], sums[c][2]/sums[c][3]]; }
  }
  return {labels, centers};
}