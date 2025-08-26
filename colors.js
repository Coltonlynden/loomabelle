// Color helpers and simple k-means quantization

export function rgbToLab([r,g,b]){
  // sRGB -> XYZ -> Lab (approx, good enough for palette)
  const srgb = [r,g,b].map(v=>{
    v/=255;
    return v<=0.04045? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
  });
  const x = (0.4124*srgb[0] + 0.3576*srgb[1] + 0.1805*srgb[2]) / 0.95047;
  const y = (0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2]) / 1.00000;
  const z = (0.0193*srgb[0] + 0.1192*srgb[1] + 0.9505*srgb[2]) / 1.08883;
  const f = t => t>0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
  const fx=f(x), fy=f(y), fz=f(z);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}

export function kmeansQuantize(imgData, k=6, maxIter=12){
  const {data,width,height} = imgData;
  // sample pixels for speed
  const step = Math.max(1, Math.floor((width*height)/24000));
  const pts=[], labs=[];
  for(let i=0;i<data.length;i+=4*step){
    const p=[data[i],data[i+1],data[i+2]];
    pts.push(p);
    labs.push(rgbToLab(p));
  }

  // init centers by spread
  const centers = [];
  for(let i=0;i<k;i++){
    centers.push(labs[Math.floor(i*(labs.length-1)/Math.max(1,k-1))].slice());
  }

  const assign = new Array(labs.length).fill(0);
  for(let it=0; it<maxIter; it++){
    // assign
    for(let i=0;i<labs.length;i++){
      let best=0,bd=1e9, li=labs[i];
      for(let c=0;c<centers.length;c++){
        const ce=centers[c];
        const d = (li[0]-ce[0])**2+(li[1]-ce[1])**2+(li[2]-ce[2])**2;
        if(d<bd){bd=d;best=c;}
      }
      assign[i]=best;
    }
    // move
    const sum=new Array(k).fill(0).map(()=>[0,0,0,0]);
    for(let i=0;i<labs.length;i++){
      const a=assign[i]; const l=labs[i];
      sum[a][0]+=l[0]; sum[a][1]+=l[1]; sum[a][2]+=l[2]; sum[a][3]++;
    }
    for(let c=0;c<k;c++){
      if(sum[c][3]) centers[c]=[sum[c][0]/sum[c][3],sum[c][1]/sum[c][3],sum[c][2]/sum[c][3]];
    }
  }

  // palette (use original RGB of closest)
  const palette = centers.map(()=>[0,0,0,0]);
  for(let c=0;c<k;c++){
    palette[c]=[0,0,0,0];
  }
  for(let i=0;i<pts.length;i++){
    const a=assign[i];
    const p=pts[i];
    const t=palette[a];
    t[0]+=p[0]; t[1]+=p[1]; t[2]+=p[2]; t[3]++;
  }
  for(let c=0;c<k;c++){
    const t=palette[c];
    if(t[3]) palette[c]=[Math.round(t[0]/t[3]),Math.round(t[1]/t[3]),Math.round(t[2]/t[3])];
    else palette[c]=[200,200,200];
  }

  // full-image map
  const map=new Uint8Array(width*height);
  for(let y=0,idx=0;y<height;y++){
    for(let x=0;x<width;x++,idx++){
      const i=idx*4;
      const lab = rgbToLab([data[i],data[i+1],data[i+2]]);
      let best=0,bd=1e9;
      for(let c=0;c<centers.length;c++){
        const ce=centers[c];
        const d=(lab[0]-ce[0])**2+(lab[1]-ce[1])**2+(lab[2]-ce[2])**2;
        if(d<bd){bd=d;best=c;}
      }
      map[idx]=best;
    }
  }
  return {palette, map};
}