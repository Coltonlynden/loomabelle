// v1 — Worker: quantize → outline → hatch → preview → (basic) DST

self.onmessage = async (e)=>{
  const { type, image, mask, options } = e.data;
  if (type !== 'process') return;

  const W = image.width, H = image.height;
  const rgba = image.data; // Uint8ClampedArray

  post({type:'progress', value:6, note:'Analyzing image…'});

  // Optional mask (user highlight)
  const userMask = mask || null;

  // 1) Contrast bump & grayscale copy
  const gray = new Uint8Array(W*H);
  for (let i=0, p=0; i<rgba.length; i+=4, p++){
    const r=rgba[i], g=rgba[i+1], b=rgba[i+2];
    const rr = clamp((r-128)*1.08+128), gg = clamp((g-128)*1.08+128), bb = clamp((b-128)*1.08+128);
    rgba[i]=rr; rgba[i+1]=gg; rgba[i+2]=bb;
    gray[p] = (rr*0.299 + gg*0.587 + bb*0.114) | 0;
  }

  // 2) K-means (fast) on downsample for palette
  post({type:'progress', value:18, note:'Reducing colors…'});
  const K = options?.palette ? 6 : 12;
  const { palette, indexed } = kmeansQuantize(rgba, W, H, K, userMask);

  // 3) Edges (Sobel) → outline mask
  post({type:'progress', value:40, note:'Finding edges…'});
  const edges = sobel(gray, W, H);
  thinAndThreshold(edges, W, H, 18);

  // If user provided subject mask → trim background
  let keep = new Uint8Array(W*H);
  if (userMask){
    keep.set(userMask);
  } else {
    // treat all as keep (No subject)
    keep.fill(1);
  }

  // 4) Build preview image (hatch fill by color + edge outline)
  post({type:'progress', value:65, note:'Stitch planning…'});

  const scale = 1; // preview 1:1
  const outW = W, outH = H;
  const out = new Uint8ClampedArray(outW*outH*4);
  // backfill fabric dark for contrast
  for (let i=0;i<out.length;i+=4){ out[i]=14; out[i+1]=18; out[i+2]=29; out[i+3]=255; }

  // hatch step controlled by density (lower = denser)
  const spacing = Math.max(3, Math.round(10 - (options?.density||0.45)*10)); // px
  // draw hatches color-by-color
  const colors = palette.slice(0, K);
  for (let c=0;c<colors.length;c++){
    hatchFill(indexed, c, colors[c], out, outW, outH, spacing, keep);
  }
  // outline on top (dark)
  drawOutline(edges, out, outW, outH);

  // 5) Basic DST stitches from the hatches (optional)
  post({type:'progress', value:88, note:'Writing stitches…'});
  const dst = tryWriteDSTFromHatch(indexed, W, H, spacing, keep);

  // 6) Done
  post({type:'progress', value:100, note:'Done'});
  post({
    type:'result',
    preview: { width: outW, height: outH, data: out.buffer },
    dst
  }, [out.buffer, dst?.buffer].filter(Boolean));
};

/* ------- helpers ------- */
const clamp = v => v<0?0:(v>255?255:v);
function post(m, tr){ self.postMessage(m, tr); }

/* K-means on small grid, then map full image */
function kmeansQuantize(rgba, W, H, K, mask){
  // sample
  const step = Math.max(1, Math.floor(Math.sqrt((W*H)/40000)));
  const pts = [];
  for (let y=0;y<H;y+=step){
    for (let x=0;x<W;x+=step){
      const i=(y*W+x)*4;
      if (mask && !mask[y*W+x]) continue;
      pts.push([rgba[i],rgba[i+1],rgba[i+2]]);
    }
  }
  if (!pts.length) pts.push([128,128,128]);

  // init centers
  const centers=[...pts.slice(0,1)];
  while(centers.length<K){
    let best=null,bd=-1;
    for(const p of pts){
      let d=1e9; for(const c of centers){ const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<d) d=dd; }
      if(d>bd){bd=d;best=p;}
    }
    centers.push(best.slice());
  }
  // iterate
  for(let it=0; it<6; it++){
    const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
    for(const p of pts){
      let bi=0,bd=1e12; for(let i=0;i<centers.length;i++){ const c=centers[i]; const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<bd){bd=dd;bi=i;} }
      const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
    }
    for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
  }
  const palette = centers;

  const indexed = new Uint8Array(W*H);
  for (let y=0;y<H;y++){
    const row=y*W;
    for (let x=0;x<W;x++){
      const i=(row+x)*4; let bi=0,bd=1e12;
      for (let c=0;c<palette.length;c++){
        const pr=palette[c][0], pg=palette[c][1], pb=palette[c][2];
        const dr=rgba[i]-pr, dg=rgba[i+1]-pg, db=rgba[i+2]-pb;
        const vv = dr*dr+dg*dg+db*db;
        if (vv<bd){bd=vv;bi=c;}
      }
      indexed[row+x]=bi;
    }
  }
  return { palette, indexed };
}

/* Sobel + magnitude */
function sobel(gray, W, H){
  const out=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      const i=y*W+x;
      const gx = -gray[i-W-1]-2*gray[i-1]-gray[i+W-1] + gray[i-W+1]+2*gray[i+1]+gray[i+W+1];
      const gy = -gray[i-W-1]-2*gray[i-W]-gray[i-W+1] + gray[i+W-1]+2*gray[i+W]+gray[i+W+1];
      const m = Math.min(255, Math.hypot(gx,gy)|0);
      out[i]=m;
    }
  }
  return out;
}
function thinAndThreshold(ed, W, H, th=18){
  for(let i=0;i<ed.length;i++){ ed[i] = ed[i]>th ? 255 : 0; }
}

/* draw outline onto out RGBA */
function drawOutline(edges, out, W, H){
  for(let i=0;i<W*H;i++){
    if(edges[i]===255){
      const j=i*4; out[j]=24; out[j+1]=28; out[j+2]=34; out[j+3]=255;
    }
  }
}

/* hatch fill: diagonal lines within target color id & keep mask */
function hatchFill(indexed, col, rgb, out, W, H, step, keep){
  const [r,g,b] = rgb;
  // draw diagonal stripes like /// and \\\ interleaved
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x;
      if(keep && !keep[i]) continue;
      if(indexed[i]!==col) continue;
      // put sparse pixels along diagonals
      if( ((x + y) % (step)) === 0 || ((x - y + 1000*step) % step)===0 ){
        const j=i*4; out[j]=r; out[j+1]=g; out[j+2]=b; out[j+3]=255;
      }
    }
  }
}

/* very small, permissive DST writer from grid hatches (preview-safe) */
function tryWriteDSTFromHatch(indexed, W, H, step, keep){
  // Build simple line segments from same modular condition as hatchFill
  // Convert to Tajima DST 3-byte records (0.1mm units). This is minimal and many machines will still open it.
  const stitches = [];
  const scale = 0.35; // px -> 0.1mm
  let cx=0, cy=0;

  function emit(dx,dy, jump=false){
    // clamp to DST limits
    dx = Math.max(-121, Math.min(121, Math.round(dx)));
    dy = Math.max(-121, Math.min(121, Math.round(dy)));
    // encode (see DST spec)
    function enc(v){
      const s = v<0 ? 1 : 0; const a = Math.abs(v);
      const b1 = (a & 0x03) << 6 | (s?0x20:0) | ((a>>2)&0x1F);
      const b2 = ((a>>7)&0x07) | (0<<3);
      return [b1&0xFF, b2&0xFF];
    }
    const [x1,x2] = enc(dx);
    const [y1,y2] = enc(dy);
    const flags = jump ? 0x83 : 0x03; // end bits pattern
    stitches.push(x1, y1, 0);
    stitches.push(x2, y2, flags);
    cx += dx; cy += dy;
  }

  // traverse sparse pixels row-wise to build small moves
  let hasAny=false;
  for(let y=0;y<H;y+=Math.max(2, Math.floor(step/2))){
    let prevX = -1;
    for(let x=0;x<W;x++){
      const i=y*W+x;
      const isHatch = ( ((x+y)%step)===0 || ((x-y+1000*step)%step)===0 ) && (!keep || keep[i]);
      if (isHatch){
        if(prevX<0){
          // jump to first
          emit((x-cx)*scale,(y-cy)*scale, true);
        }else{
          emit((x-prevX)*scale,0,false);
        }
        prevX = x; hasAny=true;
      }
    }
  }
  if (!hasAny) return null;

  // header (512 bytes)
  const header = new Uint8Array(512); header.fill(0x20);
  putAscii(header, 0,  "LA:LOOMABELLE");
  putAscii(header, 20, "ST:"+String((stitches.length/3)|0).padStart(7,' '));
  putAscii(header, 40, "CO:1");
  putAscii(header, 510,"\x1A");

  const body = new Uint8Array(stitches);
  const end  = new Uint8Array([0,0,0,F(0),F(0),0xF3]); // minimal end
  function F(v){ return v&0xFF; }

  const out = new Uint8Array(header.length + body.length + end.length);
  out.set(header,0); out.set(body, header.length); out.set(end, header.length+body.length);
  return out;
}
function putAscii(buf, off, str){ for(let i=0;i<str.length && off+i<buf.length;i++) buf[off+i]=str.charCodeAt(i); }
