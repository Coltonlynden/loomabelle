/* processing.js — runs in a Worker thread
   - color quantization (k-means lite)
   - Sobel edges (density controls strength)
   - background removal (border flood region)
   - optional subject mask (from Draw tab)
   Returns a PNG dataURL sized to the preview canvas.
*/
self.onmessage = async (ev)=>{
  const msg = ev.data;
  if (msg.type!=='process') return;

  try{
    const { image, options, maskPNG } = msg;
    const W = image.width, H = image.height;

    // Build a work canvas inside the worker
    const canvas = new OffscreenCanvas(W,H);
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    const src = new ImageData(new Uint8ClampedArray(image.data), W, H);
    ctx.putImageData(src,0,0);

    // Optional subject mask (user trace)
    let mask = null;
    if (maskPNG){
      const b = await (await fetch(maskPNG)).blob();
      const bmp = await createImageBitmap(b);
      const mCan = new OffscreenCanvas(W,H);
      const mCtx = mCan.getContext('2d');
      mCtx.drawImage(bmp,0,0,W,H);
      mask = mCtx.getImageData(0,0,W,H).data; // RGBA
    }

    // Get pixels
    let img = ctx.getImageData(0,0,W,H);
    let data = img.data;

    // Background remove by border sampling + flood
    if (!options?.noSubject){
      const bg = sampleBorderColors(data,W,H);
      floodRemove(data,W,H,bg, 28); // tolerance
    }

    // Color quantization (ke-means-ish)
    if (options?.palette){
      quantizeKMeans(data, 8, 6); // k, iterations
    }

    // Optional edges overlay
    if (options?.edges){
      const strength = Math.max(1, Math.round((options.density||25)/10));
      overlayEdges(data, W, H, strength);
    }

    // Apply subject mask if provided: keep only drawn region
    if (mask){
      for (let i=0;i<data.length;i+=4){
        const a = mask[i+3]; // alpha from mask
        if (a<16){ data[i+3]=0; } // transparent outside
      }
    }

    // Write back and export PNG
    ctx.putImageData(new ImageData(data, W, H),0,0);
    const blob = await canvas.convertToBlob({ type:'image/png' });
    const dataURL = await blobToDataURL(blob);
    self.postMessage({ type:'result', width:W, height:H, dataURL });
  }catch(err){
    self.postMessage({ type:'error', error: String(err?.message||err) });
  }
};

/* Helpers */

function blobToDataURL(blob){
  return new Promise(res=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.readAsDataURL(blob);
  });
}

function sampleBorderColors(data,W,H){
  // average of a 1px frame around image
  let r=0,g=0,b=0,n=0;
  function add(x,y){
    const i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++;
  }
  for (let x=0;x<W;x++){ add(x,0); add(x,H-1); }
  for (let y=1;y<H-1;y++){ add(0,y); add(W-1,y); }
  return { r:r/n, g:g/n, b:b/n };
}
function dist2(r1,g1,b1,r2,g2,b2){
  const dr=r1-r2,dg=g1-g2,db=b1-b2;
  return dr*dr+dg*dg+db*db;
}
function floodRemove(data,W,H,bg,tol){
  // Simple boundary fill to mark background by similarity to border mean color
  const th = (tol||24)**2;
  const mark = new Uint8Array(W*H);
  const q = [];
  // enqueue border
  for (let x=0;x<W;x++){ q.push(x,0, x,H-1); }
  for (let y=1;y<H-1;y++){ q.push(0,y, W-1,y); }
  while(q.length){
    const y=q.pop(); const x=q.pop();
    const idx = y*W + x;
    if (mark[idx]) continue;
    const i = idx*4;
    if (data[i+3]<10){ mark[idx]=1; continue; } // already transparent
    if (dist2(data[i],data[i+1],data[i+2],bg.r,bg.g,bg.b) > th) continue;
    mark[idx]=1;
    if (x>0) q.push(x-1,y);
    if (x<W-1) q.push(x+1,y);
    if (y>0) q.push(x,y-1);
    if (y<H-1) q.push(x,y+1);
  }
  // make marked pixels transparent
  for (let i=0;i<mark.length;i++){
    if (mark[i]) data[i*4+3]=0;
  }
}

function quantizeKMeans(data, K=8, iters=6){
  // Initialize centroids by sampling
  const cents = new Array(K).fill(0).map((_,k)=>{
    const i = ((Math.random()*((data.length/4)|0))|0)*4;
    return [data[i],data[i+1],data[i+2]];
  });
  const asn = new Uint8Array(data.length/4);

  for (let it=0;it<iters;it++){
    // assign
    for (let p=0, i=0; p<asn.length; p++, i+=4){
      let best=0, bd=1e12;
      for (let c=0;c<K;c++){
        const d = dist2(data[i],data[i+1],data[i+2], ...cents[c]);
        if (d<bd){ bd=d; best=c; }
      }
      asn[p]=best;
    }
    // update
    const sum = new Array(K).fill(0).map(()=>[0,0,0,0]);
    for (let p=0, i=0; p<asn.length; p++, i+=4){
      const c = asn[p]; const s = sum[c];
      s[0]+=data[i]; s[1]+=data[i+1]; s[2]+=data[i+2]; s[3]++;
    }
    for (let c=0;c<K;c++){
      const s=sum[c]; if (!s[3]) continue;
      cents[c]=[s[0]/s[3], s[1]/s[3], s[2]/s[3]];
    }
  }
  // paint
  for (let p=0, i=0; p<asn.length; p++, i+=4){
    const c = cents[asn[p]];
    data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2];
  }
}

function overlayEdges(data,W,H,strength){
  // Sobel
  const gray = new Uint8ClampedArray(W*H);
  for (let i=0,j=0;i<data.length;i+=4,j++){
    gray[j] = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114)|0;
  }
  const out = new Uint8ClampedArray(W*H);
  const sx = [-1,0,1,-2,0,2,-1,0,1];
  const sy = [-1,-2,-1,0,0,0,1,2,1];
  for (let y=1;y<H-1;y++){
    for (let x=1;x<W-1;x++){
      let gx=0, gy=0, k=0;
      for (let yy=-1;yy<=1;yy++){
        for (let xx=-1;xx<=1;xx++){
          const g = gray[(y+yy)*W + (x+xx)];
          gx += g * sx[k];
          gy += g * sy[k];
          k++;
        }
      }
      const mag = Math.min(255, Math.hypot(gx,gy)|0);
      out[y*W+x] = mag;
    }
  }
  // draw darker lines where edges are strong
  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++){
      const idx = y*W + x;
      const e = out[idx];
      if (e>40){
        const i = idx*4;
        data[i]   = Math.max(0, data[i]   - e/strength);
        data[i+1] = Math.max(0, data[i+1] - e/strength);
        data[i+2] = Math.max(0, data[i+2] - e/strength);
      }
    }
  }
}