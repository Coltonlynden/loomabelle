/* emb-worker.js v34
   Runs off-main-thread. Receives an ImageBitmap and options.
   Returns {paths, dstU8, expU8}.
*/
self.onmessage = async (e)=>{
  const {type, bitmap, options} = e.data||{};
  if(type!=='process') return;
  try{
    post({type:'progress', data:25});
    const {img, data, w, h} = await bitmapToImageData(bitmap);
    // subject mask (rect, noSubject, or bg-aware)
    const mask = makeMask(data, w, h, options);
    post({type:'progress', data:45});

    // outline from mask
    const paths = marchPaths(mask, w, h);
    const opsOutline = toOps(paths);

    // optional hatch fills inside mask
    let ops = opsOutline.slice(0);
    if(options.addFills){
      const hatch = hatchOps(mask, w, h, options.hatchStep||6, 45);
      ops = ops.concat(hatch);
    }

    // scale ops to preview coords later; for file formats we convert to units here
    post({type:'progress', data:75});
    const dstU8 = writeDST(ops, {pxPerMm:2, outW:w, outH:h});
    const expU8 = writeEXP(ops, {pxPerMm:2, outW:w, outH:h});

    // build preview polylines (pixel space; UI will map to canvas)
    const previewPaths = opsToPreviewPaths(ops);

    post({type:'result', data:{ paths: previewPaths, dstU8, expU8 }});
  }catch(err){
    post({type:'error', data: (err&&err.message)||String(err)});
  }
};

function post(msg){ self.postMessage(msg); }

async function bitmapToImageData(bmp){
  const off = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = off.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(bmp,0,0);
  const id = ctx.getImageData(0,0,off.width,off.height);
  return {img:off, data:id.data, w:off.width, h:off.height};
}

// ------------------ SUBJECT MASK ------------------
function makeMask(d, W, H, opt){
  const out = new Uint8Array(W*H);
  // User rectangle?
  if(opt.rect){
    const {x,y,w,h}=opt.rect;
    for(let yy=y; yy<y+h && yy<H; yy++){
      const row=yy*W;
      out.fill(1, row + x, row + Math.min(W, x+w));
    }
    return smooth(out, W, H);
  }
  // “No subject” → handwriting: keep dark strokes on light bg (or inverse)
  // Estimate bg brightness from borders
  let sum=0,cnt=0;
  for(let x=0;x<W;x++){ let j=(x)*4; sum+=luma(d,j); j=((H-1)*W+x)*4; sum+=luma(d,j); cnt+=2; }
  for(let y=0;y<H;y++){ let j=(y*W)*4; sum+=luma(d,j); j=(y*W+(W-1))*4; sum+=luma(d,j); cnt+=2; }
  const bg = sum/cnt, keepLight = bg<128, delta = 24;

  for(let i=0;i<W*H;i++){
    const j=i*4, y = luma(d,j);
    if(opt.noSubject){
      out[i] = keepLight ? (y<bg-delta?1:0) : (y>bg+delta?1:0);
    }else{
      out[i] = keepLight ? (y>bg+delta?1:0) : (y<bg-delta?1:0);
    }
  }
  return smooth(out,W,H);
}
function luma(d,j){ return 0.2126*d[j] + 0.7152*d[j+1] + 0.0722*d[j+2]; }
function smooth(a,W,H){
  // 3x3 close (dilate then erode)
  const t=new Uint8Array(a.length);
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      let v=0; for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) v|=a[(y+yy)*W+(x+xx)];
      t[y*W+x]=v?1:0;
    }
  }
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      let v=1; for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) v&=t[(y+yy)*W+(x+xx)];
      a[y*W+x]=v?1:0;
    }
  }
  return a;
}

// ------------------ OUTLINES (Marching Squares) ------------------
function marchPaths(mask,W,H){
  const grid=(x,y)=> (x<0||x>=W||y<0||y>=H)?0:mask[y*W+x];
  const seen=new Uint8Array(W*H), paths=[];
  function trace(x0,y0){
    let x=x0,y=y0; const pts=[];
    for(let safe=0; safe < W*H*4; safe++){
      const a=grid(x,y), b=grid(x+1,y), c=grid(x+1,y+1), d=grid(x,y+1);
      const idx=(a?1:0)|(b?2:0)|(c?4:0)|(d?8:0);
      if(idx===0 || idx===15) break;
      if(idx===1||idx===5||idx===13){ pts.push([x,y+0.5]); y--; }
      else if(idx===8||idx===10||idx===11){ pts.push([x+0.5,y+1]); x--; }
      else if(idx===4||idx===12||idx===14){ pts.push([x+1,y+0.5]); y++; }
      else { pts.push([x+0.5,y]); x++; }
      if(x===x0&&y===y0) break;
    }
    return simplify(pts, 0.9);
  }
  for(let y=0;y<H-1;y++){
    for(let x=0;x<W-1;x++){
      const i=y*W+x; if(mask[i] && !seen[i]){
        const p=trace(x,y); if(p.length>4) paths.push(p);
        for(let yy=y; yy<Math.min(H,y+2); yy++)
          for(let xx=x; xx<Math.min(W,x+2); xx++) seen[yy*W+xx]=1;
      }
    }
  }
  return paths;
}
function simplify(pts, eps){
  if(pts.length<3) return pts;
  const out=[pts[0]];
  let ax=pts[0][0], ay=pts[0][1];
  for(let i=1;i<pts.length-1;i++){
    const bx=pts[i][0], by=pts[i][1], cx=pts[i+1][0], cy=pts[i+1][1];
    const abx=bx-ax, aby=by-ay, bcx=cx-bx, bcy=cy-by;
    const ang=Math.abs(Math.atan2(aby,abx)-Math.atan2(bcy,bcx));
    if(ang>eps) out.push(pts[i]);
  }
  out.push(pts[pts.length-1]);
  return out;
}
function toOps(paths){
  const ops=[];
  for(const p of paths){
    ops.push({cmd:'jump', x:p[0][0], y:p[0][1]});
    for(let i=1;i<p.length;i++){ ops.push({cmd:'stitch', x:p[i][0], y:p[i][1]}); }
  }
  return ops;
}
function hatchOps(mask,W,H,step=6,deg=45){
  const ops=[]; const rad=deg*Math.PI/180;
  // simple horizontal hatch rotated by angle → we’ll keep 0deg here (worker simplicity),
  // UI is preview only; stitch files don’t need rotation for the look.
  for(let y=0;y<H;y+=step){
    let run=false, sx=0;
    for(let x=0;x<W;x++){
      const i=y*W+x;
      if(mask[i]){ if(!run){ run=true; sx=x; } }
      else { if(run){ ops.push({cmd:'jump',x:sx,y}); ops.push({cmd:'stitch',x:x-1,y}); run=false; } }
    }
    if(run){ ops.push({cmd:'jump',x:sx,y}); ops.push({cmd:'stitch',x:W-1,y}); }
  }
  return ops;
}

// ------------------ PREVIEW + FILE WRITERS ------------------
function opsToPreviewPaths(ops){
  const out=[]; let moving=true;
  for(const o of ops){
    if(o.cmd==='jump'){ out.push({move:true,x:o.x,y:o.y}); moving=false; }
    else if(o.cmd==='stitch'){ out.push({move:false,x:o.x,y:o.y}); moving=true; }
  }
  return out;
}
function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }

function toUnits(ops,pxPerMm,outW,outH){
  const s=1/pxPerMm*10, cx=outW/2, cy=outH/2, out=[];
  let prev=null;
  for(const op of ops){
    if(op.cmd==='jump'||op.cmd==='stitch'){
      const x=(op.x-cx)*s, y=(op.y-cy)*s;
      if(prev===null){ prev=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
      else { out.push({cmd:op.cmd,dx:x-prev[0],dy:y-prev[1]}); prev=[x,y]; }
    }
  }
  return out;
}
function writeDST(ops,opts){
  const pxPerMm=opts?.pxPerMm||2, outW=opts?.outW||640, outH=opts?.outH||360;
  const u=toUnits(ops,pxPerMm,outW,outH), bytes=[];
  function enc(dx,dy,flag){ if(flag==null) flag=0;
    dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
    const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
    const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
    const b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); }
  let colors=0; for(const s of u){ if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); } else { enc(s.dx,s.dy,0); } }
  bytes.push(0,0,0xF3);
  const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
  const hb=new TextEncoder().encode(header); const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
}
function writeEXP(ops,opts){
  const pxPerMm=opts?.pxPerMm||2, outW=opts?.outW||640, outH=opts?.outH||360;
  const u=toUnits(ops,pxPerMm,outW,outH), bytes=[];
  function put(dx,dy,cmd){ dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
    if(cmd==='jump') bytes.push(0x80,0x04);
    if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); } }
  for(const s of u){ if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); } else { put(s.dx,s.dy,'stitch'); } }
  bytes.push(0x80,0x00); return new Uint8Array(bytes);
}
