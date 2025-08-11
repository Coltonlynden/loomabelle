/* Loomabelle Worker — heavy processing off the main thread
   Steps: bitmap → downscale → (optional bg remove)
        → quantize (k-means or manual palette) → hatch fill (+outline)
        → preview → stitches
*/
self.onmessage = async (e)=>{
  const {cmd, bitmap, options} = e.data;
  if(cmd!=='process') return;
  try{
    const res = await processBitmap(bitmap, options);
    self.postMessage({type:'result', data:res});
  }catch(err){
    log(`Processing failed: ${err?.message||err}`, 'err');
    self.postMessage({type:'result', data:{stitches:[], blocks:0, palette:[], preview:null}});
  }
};
function log(msg, level='info'){ self.postMessage({type:'log', data:{msg, level}}); }

async function processBitmap(bitmap, opt){
  const {hoopMM, maxColors, autoColors, manualPalette, removeBg, bgStrength, fillAngle, densityMM, outline, devicePixelRatio} = opt;

  // 1) Working size
  const SCALE = 10; // px per mm
  const hoopPx = {w: Math.round(hoopMM.w*SCALE), h: Math.round(hoopMM.h*SCALE)};
  const maxW = Math.max(64, Math.round(hoopPx.w / Math.max(1,devicePixelRatio)));
  const maxH = Math.max(64, Math.round(hoopPx.h / Math.max(1,devicePixelRatio)));

  const {w,h, img} = await downscaleTo(bitmap, maxW, maxH);
  log(`Working size: ${w}×${h}px`);

  // 2) Remove background (corner average, configurable strength)
  if(removeBg){ removeBackground(img, w, h, bgStrength|0); log(`Background removed (strength ${bgStrength}).`,'ok'); }

  // 3) Quantize
  let palette, indexed;
  if(!autoColors && manualPalette && manualPalette.length){
    ({palette, indexed} = quantizeToManual(img, w, h, manualPalette));
    log(`Mapped to manual palette (${palette.length} colors).`, 'ok');
  }else{
    ({palette, indexed} = quantizeKMeans(img, w, h, Math.min(Math.max(maxColors,2),6)));
    log(`Quantized to ${palette.length} colors.`, 'ok');
  }

  // 4) Stitches (hatch fill per color)
  const angle = (fillAngle % 180) * Math.PI/180;
  const spacingPx = Math.max(1, Math.round(densityMM * SCALE));
  const stitches = [];
  let blocks = 0;

  for(let ci=0; ci<palette.length; ci++){
    const mask = new Uint8Array(w*h);
    for(let i=0;i<indexed.length;i++) if(indexed[i]===ci) mask[i]=1;

    const segs = hatchFill(mask, w, h, angle, spacingPx);
    if(segs.length===0) continue;
    blocks++;

    const px2mm = 1/SCALE;
    for(const s of segs){
      stitches.push({x:s.x1*px2mm, y:s.y1*px2mm, jump:true, color:ci});
      stitches.push({x:s.x2*px2mm, y:s.y2*px2mm, jump:false, color:ci});
    }

    if(outline){
      const edgeSegs = outlineWalk(mask, w, h);
      for(const s of edgeSegs){
        stitches.push({x:s.x1*px2mm, y:s.y1*px2mm, jump:true, color:ci});
        stitches.push({x:s.x2*px2mm, y:s.y2*px2mm, jump:false, color:ci});
      }
    }
  }

  // 5) Preview raster
  const prev = new ImageData(w,h);
  for(let i=0;i<w*h;i++){
    const ci = indexed[i];
    if(ci<0){ prev.data[i*4+3]=0; continue; }
    const [r,g,b]=palette[ci];
    prev.data[i*4]=r; prev.data[i*4+1]=g; prev.data[i*4+2]=b; prev.data[i*4+3]=255;
  }
  self.postMessage({type:'preview', data:{width:w, height:h, imageData:prev.data}}, [prev.data.buffer]);

  return {stitches, blocks, palette, hoopMM, preview:{w,h}};
}

/* ---------- helpers ---------- */
async function downscaleTo(bitmap, maxW, maxH){
  const ratio = Math.min(maxW/bitmap.width, maxH/bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width*ratio));
  const h = Math.max(1, Math.round(bitmap.height*ratio));
  const off = new OffscreenCanvas(w,h);
  const ctx = off.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(bitmap,0,0,w,h);
  const img = ctx.getImageData(0,0,w,h);
  return {w,h,img};
}

// Background removal using average of corners; strength 0..100
function removeBackground(img, w, h, strength){
  const d = img.data;
  const pick = (x,y)=>{ const i=(y*w+x)*4; return [d[i],d[i+1],d[i+2]]; };
  const corners = [pick(0,0), pick(w-1,0), pick(0,h-1), pick(w-1,h-1)];
  const avg = corners.reduce((a,c)=>[a[0]+c[0],a[1]+c[1],a[2]+c[2]],[0,0,0]).map(v=>v/4);
  const thr = 8 + Math.round(strength*1.8); // 8..188
  for(let i=0;i<w*h;i++){
    const r=d[i*4], g=d[i*4+1], b=d[i*4+2], a=d[i*4+3];
    const dist = Math.abs(r-avg[0])+Math.abs(g-avg[1])+Math.abs(b-avg[2]);
    if(a<5 || dist<thr){ d[i*4+3]=0; }
  }
}

// Map to user manual palette (hex) by nearest color
function quantizeToManual(img, w, h, hexes){
  const d = img.data, N=w*h;
  const palette = hexes.map(hx => hexToRgb(hx)).filter(Boolean);
  const indexed = new Int16Array(N);
  for(let i=0;i<N;i++){
    if(d[i*4+3]<10){ indexed[i]=-1; continue; }
    let best=0, bd=1e9, r=d[i*4], g=d[i*4+1], b=d[i*4+2];
    for(let c=0;c<palette.length;c++){
      const ce=palette[c];
      const dd=(r-ce[0])**2+(g-ce[1])**2+(b-ce[2])**2;
      if(dd<bd){bd=dd; best=c;}
    }
    indexed[i]=best;
  }
  return {palette, indexed};
}
function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
}

// Fast k-means with sampling
function quantizeKMeans(img, w, h, k){
  const d = img.data;
  const N = w*h;
  const step = Math.max(1, Math.floor(Math.sqrt(N)/64));
  const points = [];
  for(let i=0;i<N;i+=step){
    const a=d[i*4+3]; if(a<10) continue;
    points.push([d[i*4], d[i*4+1], d[i*4+2]]);
  }
  // init centers
  const centers = [];
  const seen = new Set();
  for(let i=0;i<points.length && centers.length<k;i+=Math.max(1,Math.floor(points.length/k))){
    const key = points[i].join(',');
    if(!seen.has(key)) { centers.push(points[i].slice()); seen.add(key); }
  }
  while(centers.length<k && points.length){ centers.push(points[Math.floor(Math.random()*points.length)].slice()); }

  const assign = new Uint16Array(points.length);
  for(let it=0; it<8; it++){
    for(let i=0;i<points.length;i++){
      let best=0, bd=1e9; const p=points[i];
      for(let c=0;c<centers.length;c++){
        const ce=centers[c];
        const dd = (p[0]-ce[0])**2+(p[1]-ce[1])**2+(p[2]-ce[2])**2;
        if(dd<bd){ bd=dd; best=c; }
      }
      assign[i]=best;
    }
    const sum = centers.map(()=>[0,0,0,0]);
    for(let i=0;i<points.length;i++){
      const a=assign[i]; const p=points[i];
      sum[a][0]+=p[0]; sum[a][1]+=p[1]; sum[a][2]+=p[2]; sum[a][3]++;
    }
    for(let c=0;c<centers.length;c++){
      const s=sum[c];
      if(s[3]>0){ centers[c]=[s[0]/s[3]|0, s[1]/s[3]|0, s[2]/s[3]|0]; }
    }
  }

  const palette = centers;
  const indexed = new Int16Array(N);
  for(let i=0;i<N;i++){
    if(d[i*4+3]<10){ indexed[i]=-1; continue; }
    let best=0, bd=1e9, r=d[i*4], g=d[i*4+1], b=d[i*4+2];
    for(let c=0;c<palette.length;c++){
      const ce=palette[c];
      const dd=(r-ce[0])**2+(g-ce[1])**2+(b-ce[2])**2;
      if(dd<bd){bd=dd; best=c;}
    }
    indexed[i]=best;
  }
  return {palette, indexed};
}

// Hatch fill at angle, returning line segments in pixel coords
function hatchFill(mask, w, h, angle, spacing){
  const segs=[];
  const sin=Math.sin(angle), cos=Math.cos(angle);
  const cx=w/2, cy=h/2;
  function toUV(x,y){ const dx=x-cx, dy=y-cy; return {u: dx*cos + dy*sin, v: -dx*sin + dy*cos}; }
  function toXY(u,v){ const dx=u*cos - v*sin, dy=u*sin + v*cos; return {x:dx+cx, y:dy+cy}; }
  const corners=[toUV(0,0),toUV(w,0),toUV(0,h),toUV(w,h)]; let vMin=1e9, vMax=-1e9; for(const c of corners){vMin=Math.min(vMin,c.v); vMax=Math.max(vMax,c.v);}
  for(let v=Math.floor(vMin); v<=vMax; v+=spacing){
    let inRun=false, start=null;
    for(let u=-Math.max(w,h); u<=Math.max(w,h); u++){
      const {x,y}=toXY(u,v), xi=x|0, yi=y|0;
      if(xi<0||yi<0||xi>=w||yi>=h){ if(inRun){ const p2=toXY(u-1,v); segs.push({x1:start.x,y1:start.y,x2:p2.x,y2:p2.y}); inRun=false; } continue; }
      const idx=yi*w+xi;
      if(mask[idx]){ if(!inRun){ inRun=true; const p1=toXY(u,v); start={x:p1.x,y:p1.y}; } }
      else if(inRun){ const p2=toXY(u-1,v); segs.push({x1:start.x,y1:start.y,x2:p2.x,y2:p2.y}); inRun=false; }
    }
    if(inRun){ const p2=toXY(Math.max(w,h),v); segs.push({x1:start.x,y1:start.y,x2:p2.x,y2:p2.y}); }
  }
  return segs;
}

// Horizontal edge outline
function outlineWalk(mask, w, h){
  const segs=[];
  for(let y=0;y<h;y++){
    let run=false, x0=0;
    for(let x=0;x<w;x++){
      const i=y*w+x, m=mask[i];
      const nb = (!m) || (y>0 && !mask[i-w]) || (y<h-1 && !mask[i+w]) || (x>0 && !mask[i-1]) || (x<w-1 && !mask[i+1]);
      if(m && nb){ if(!run){ run=true; x0=x; } }
      else if(run){ segs.push({x1:x0,y1:y,x2:x-1,y2:y}); run=false; }
    }
    if(run) segs.push({x1:x0,y1:y,x2:w-1,y2:y});
  }
  return segs;
}