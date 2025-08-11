// Loomabelle: pure-JS embroidery pipeline (+ HEIC support)
// Outline underlay → Inset hatch fill → Satin border
// Exports .DST + palette.txt and shows color preview

// ---------- DOM ----------
const $ = (s)=>document.querySelector(s);
$('#year').textContent = new Date().getFullYear();
const statusEl = $('#status');
const setStatus = (m, cls='') => { statusEl.textContent = m; statusEl.className = `status ${cls}`; };

const fileInput = $('#file');
const processBtn = $('#process');
const dlDst = $('#download');
const dlPal = $('#downloadPalette');
const preview = $('#preview');

const work = $('#work');
const ctx = work.getContext('2d', { willReadFrequently:true });

const HOOP_MM = { '4x4': { w:100, h:100 }, '5x7': { w:130, h:180 } };
let img = null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ---------- HEIC support (on demand) ----------
async function heicToJpeg(file){
  if (!window.heic2any){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('HEIC converter failed to load'));
      document.head.appendChild(s);
    });
  }
  const out = await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
  const b = Array.isArray(out) ? out[0] : out;
  return new File([b], (file.name||'image').replace(/\.\w+$/,'')+'.jpg', { type:'image/jpeg' });
}
function loadImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im) };
    im.onerror = reject;
    im.src = url;
  });
}

// ---------- File select ----------
fileInput.addEventListener('change', async ()=>{
  const f = fileInput.files?.[0];
  if (!f) return;
  try{
    setStatus('Loading image…');
    let chosen = f;
    const name = (f.name||'').toLowerCase();
    const mime = (f.type||'').toLowerCase();
    if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')){
      setStatus('Converting HEIC to JPEG…');
      chosen = await heicToJpeg(f);
    }
    img = await loadImageFromFile(chosen);

    // quick preview draw
    const maxSide = 1200;
    const s = Math.min(1, maxSide/Math.max(img.width, img.height));
    const W = Math.round(img.width*s), H = Math.round(img.height*s);
    work.width=W; work.height=H; ctx.clearRect(0,0,W,H); ctx.drawImage(img,0,0,W,H);
    preview.src = work.toDataURL('image/png');

    processBtn.disabled = false;
    dlDst.classList.add('disabled'); dlPal.classList.add('disabled');
    setStatus(`Image ready (${W}×${H}). Tap Process.`, 'ok');
  }catch(e){
    console.error(e);
    processBtn.disabled = true; img = null;
    setStatus('Could not read that image. Try a JPG/PNG.', 'error');
  }
});

// ---------- Process ----------
processBtn.addEventListener('click', async ()=>{
  if (!img) return;
  processBtn.disabled = true; dlDst.classList.add('disabled'); dlPal.classList.add('disabled');
  setStatus('Processing…');

  try{
    const colors = clamp(Number($('#colors').value)||4, 2, 5);
    const removeBg = $('#removeBg').checked;
    const wantOutline = $('#outline').checked;
    const hoop = $('#hoop').value;
    const angleDeg = Number($('#angle').value)||45;
    const densityMM = Number($('#density').value)||0.40;

    // draw base
    const maxSide = 1200, s = Math.min(1, maxSide/Math.max(img.width,img.height));
    const W = Math.round(img.width*s), H = Math.round(img.height*s);
    work.width=W; work.height=H; ctx.clearRect(0,0,W,H); ctx.drawImage(img,0,0,W,H);

    // 1) color reduction
    const { indexed, palette } = reduceColors(ctx, W, H, colors, removeBg);
    if (!palette.length) throw new Error('No non‑background colors detected.');

    // 2) masks
    const masks = palette.map((_, ci)=>{
      const m = new Uint8Array(W*H);
      for (let i=0;i<W*H;i++) if (indexed[i]===ci) m[i]=1;
      return m;
    });

    // 3) bbox + scaling
    const bbox = masks.reduce((b,m)=>expandBbox(b,m,W,H), {minx:Infinity,miny:Infinity,maxx:-Infinity,maxy:-Infinity});
    if (!(bbox.maxx>bbox.minx && bbox.maxy>bbox.miny)) throw new Error('Couldn’t find any solid areas.');
    const bw=bbox.maxx-bbox.minx, bh=bbox.maxy-bbox.miny;
    const cx=(bbox.minx+bbox.maxx)/2, cy=(bbox.miny+bbox.maxy)/2;
    const mmPerPx = Math.min(HOOP_MM[hoop].w/bw, HOOP_MM[hoop].h/bh);
    const pxPerMM = 1/mmPerPx;

    // 4) stitch plan
    const spacingPx = Math.max(1, Math.round(densityMM * pxPerMM));   // hatch spacing in px
    const sampleStepPx = Math.max(1, Math.round(0.6 * pxPerMM));      // sampling step for hatch
    const insetPx = Math.max(1, Math.round(0.5 * pxPerMM));           // ~0.5mm inset for fill
    const plan = { stitches: [], colors: palette.slice() };

    for (let ci=0; ci<masks.length; ci++){
      if (ci>0) plan.stitches.push({ colorChange:true, x:0, y:0 });

      // --- Outline from original mask ---
      const outlinePtsPx = marchingSquaresOutline(masks[ci], W, H);
      const outlinePtsMM = outlinePtsPx.map(([x,y])=>[(x-cx)*mmPerPx, (y-cy)*mmPerPx]);

      // Running-stitch underlay (edge stabilization)
      runningOutline(plan.stitches, outlinePtsMM, 3); // 3mm step

      // --- Inset fill (erode mask then hatch) ---
      const maskInset = erodeMask(masks[ci], W, H, insetPx);
      const segs = hatchSegmentsFromMask(maskInset, W, H, bbox, angleDeg, spacingPx, sampleStepPx);
      for (const [a,b] of segs){
        const sMM = [(a[0]-cx)*mmPerPx, (a[1]-cy)*mmPerPx];
        const eMM = [(b[0]-cx)*mmPerPx, (b[1]-cy)*mmPerPx];
        plan.stitches.push({ x:sMM[0], y:sMM[1], jump:true });
        lineStitch(plan.stitches, sMM, eMM, 7); // 7mm max stitch
      }

      // --- Satin border (simple zig-zag along outline) ---
      if (wantOutline && outlinePtsMM.length > 4){
        satinOutline(plan.stitches, outlinePtsMM, 0.8 /*width mm*/, 0.6 /*step mm*/);
      }
    }
    plan.stitches.push({ end:true, x:0, y:0 });

    // 5) preview + downloads
    preview.src = drawPreviewColored(plan, 720, 520);

    const dstBlob = new Blob([writeDST(plan)], { type:'application/octet-stream' });
    dlDst.href = URL.createObjectURL(dstBlob);
    dlDst.classList.remove('disabled');

    const palText = plan.colors.map((rgb,i)=>`Color ${i+1}: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`).join('\n');
    const palBlob = new Blob([palText], { type:'text/plain' });
    dlPal.href = URL.createObjectURL(palBlob);
    dlPal.classList.remove('disabled');

    setStatus('Done! Download your .DST and palette.txt.', 'ok');
  }catch(e){
    console.error(e);
    setStatus(e.message || 'Processing failed.', 'error');
  }finally{
    processBtn.disabled = false;
  }
});

// ---------- Color reduction (k-means) ----------
function reduceColors(ctx, W, H, k, removeBg){
  const { data } = ctx.getImageData(0,0,W,H);
  const N = W*H; const src = new Uint8Array(data.buffer);
  const pts = new Float32Array(N*3);
  for (let i=0;i<N;i++){ pts[i*3]=src[i*4]; pts[i*3+1]=src[i*4+1]; pts[i*3+2]=src[i*4+2]; }

  const centers = new Float32Array(k*3);
  for (let c=0;c<k;c++){ const j=Math.floor((c+0.5)*N/k);
    centers[c*3]=pts[j*3]; centers[c*3+1]=pts[j*3+1]; centers[c*3+2]=pts[j*3+2]; }

  const assign = new Uint16Array(N);
  for (let it=0; it<6; it++){
    for (let i=0;i<N;i++){
      let best=0, bd=1e12, r=pts[i*3], g=pts[i*3+1], b=pts[i*3+2];
      for (let c=0;c<k;c++){
        const cr=centers[c*3], cg=centers[c*3+1], cb=centers[c*3+2];
        const d=(r-cr)**2 + (g-cg)**2 + (b-cb)**2;
        if (d<bd){ bd=d; best=c; }
      }
      assign[i]=best;
    }
    const sum=new Float32Array(k*4);
    for (let i=0;i<N;i++){ const c=assign[i]; sum[c*4]+=pts[i*3]; sum[c*4+1]+=pts[i*3+1]; sum[c*4+2]+=pts[i*3+2]; sum[c*4+3]++; }
    for (let c=0;c<k;c++){ const cnt=sum[c*4+3]||1;
      centers[c*3]=sum[c*4]/cnt; centers[c*3+1]=sum[c*4+1]/cnt; centers[c*3+2]=sum[c*4+2]/cnt; }
  }

  // background by border majority
  let bg=-1;
  if (removeBg){
    const counts=new Uint32Array(k);
    const bump=(x,y)=>counts[assign[y*W+x]]++;
    for (let x=0;x<W;x++){ bump(x,0); bump(x,H-1); }
    for (let y=0;y<H;y++){ bump(0,y); bump(W-1,y); }
    let m=0,mi=0; for(let c=0;c<k;c++) if (counts[c]>m){ m=counts[c]; mi=c; }
    bg=mi;
  }

  const used=new Set(); const indexed=new Uint8Array(N);
  for (let i=0;i<N;i++){ const c=assign[i]; if (c===bg) indexed[i]=255; else { indexed[i]=c; used.add(c); } }

  const list=[...used].sort((a,b)=>a-b); const remap=new Map(); list.forEach((c,i)=>remap.set(c,i));
  const palette=list.map(c=>[centers[c*3]|0, centers[c*3+1]|0, centers[c*3+2]|0]);
  for (let i=0;i<N;i++) if (indexed[i]!==255) indexed[i]=remap.get(indexed[i]);

  return { indexed, palette };
}

// ---------- BBox from mask ----------
function expandBbox(b, mask, W, H){
  for (let y=0;y<H;y++){ const row=y*W;
    for (let x=0;x<W;x++) if (mask[row+x]) {
      if (x<b.minx) b.minx=x; if (y<b.miny) b.miny=y;
      if (x>b.maxx) b.maxx=x; if (y>b.maxy) b.maxy=y;
    }
  }
  return b;
}

// ---------- Hatch directly from mask ----------
function hatchSegmentsFromMask(mask, W, H, bbox, angleDeg, spacingPx, stepPx){
  const segs=[];
  const dir=[Math.cos(angleDeg*Math.PI/180), Math.sin(angleDeg*Math.PI/180)];
  const nrm=[-dir[1], dir[0]];
  const bw=bbox.maxx-bbox.minx, bh=bbox.maxy-bbox.miny;
  const cx=(bbox.minx+bbox.maxx)/2, cy=(bbox.miny+bbox.maxy)/2;
  const half=Math.hypot(bw,bh)*0.75;
  const range=Math.ceil(Math.hypot(bw,bh)/spacingPx)+2;

  for (let k=-range;k<=range;k++){
    const off=k*spacingPx;
    const px=cx+nrm[0]*off, py=cy+nrm[1]*off;
    let start=null;
    for (let s=-half; s<=half; s+=stepPx){
      const x=Math.round(px+dir[0]*s), y=Math.round(py+dir[1]*s);
      const inside=(x>=0 && y>=0 && x<W && y<H) ? mask[y*W+x]===1 : false;
      if (inside && !start) start=[x,y];
      if ((!inside || s>=half) && start){
        const end = inside ? [x,y] : [Math.round(px+dir[0]*(s-stepPx)), Math.round(py+dir[1]*(s-stepPx))];
        if (Math.hypot(end[0]-start[0], end[1]-start[1])>=2) segs.push([start,end]);
        start=null;
      }
    }
  }
  return segs;
}

// ---------- Marching squares (simple edge trace) ----------
function marchingSquaresOutline(mask, W, H){
  // find a starting edge pixel (left edge of a filled pixel)
  let sx=-1, sy=-1;
  for (let y=1;y<H-1 && sy<0;y++){
    for (let x=1;x<W-1;x++){
      if (mask[y*W+x] && !mask[y*W+(x-1)]) { sx=x; sy=y; break; }
    }
  }
  if (sx<0) return [];

  const pts=[];
  let x=sx, y=sy;
  const maxSteps=W*H*4;
  for (let step=0; step<maxSteps; step++){
    pts.push([x,y]);
    // 2x2 neighborhood
    const a = mask[(y-1)*W + (x-1)] ? 1:0;
    const b = mask[(y-1)*W + (x  )] ? 1:0;
    const c = mask[(y  )*W + (x-1)] ? 1:0;
    const d = mask[(y  )*W + (x  )] ? 1:0;
    const code = (a<<3)|(b<<2)|(c<<1)|d;

    // crude but serviceable edge-follow
    if (code===0) { x++; }           // empty → move right
    else if (code===1 || code===3 || code===9 || code===11){ x++; }        // go right
    else if (code===2 || code===6 || code===7 || code===14){ y++; }        // go down
    else if (code===4 || code===12 || code===13 || code===8){ x--; }       // go left
    else { y--; } // default up

    if (x===sx && y===sy && pts.length>12) break;
    x = Math.max(1, Math.min(W-2, x));
    y = Math.max(1, Math.min(H-2, y));
  }
  // decimate a bit
  const out=[]; for (let i=0;i<pts.length;i+=2) out.push(pts[i]);
  return out;
}

// ---------- Morphology: erode (shrink) mask by r pixels ----------
function erodeMask(mask, W, H, rPx){
  if (rPx <= 0) return mask;
  let cur = mask;
  for (let t=0; t<rPx; t++){
    const out = new Uint8Array(W*H);
    for (let y=1; y<H-1; y++){
      const row = y*W;
      for (let x=1; x<W-1; x++){
        if (!cur[row+x]) continue;
        let keep = true;
        for (let dy=-1; dy<=1 && keep; dy++){
          for (let dx=-1; dx<=1; dx++){
            if (!cur[(y+dy)*W + (x+dx)]) { keep = false; break; }
          }
        }
        if (keep) out[row+x] = 1;
      }
    }
    cur = out;
  }
  return cur;
}

// ---------- Outline stitches ----------
function runningOutline(stitches, ptsMM, maxStepMM=3){
  if (!ptsMM.length) return;
  stitches.push({ x: ptsMM[0][0], y: ptsMM[0][1], jump: true });
  for (let i=1; i<=ptsMM.length; i++){
    const a = ptsMM[i-1], b = ptsMM[i % ptsMM.length];
    lineStitch(stitches, a, b, maxStepMM);
  }
}
function satinOutline(stitches, ptsMM, widthMM=0.8, stepMM=0.6){
  if (ptsMM.length < 3) return;
  const half = widthMM/2;
  let left = true;
  stitches.push({ x: ptsMM[0][0], y: ptsMM[0][1], jump: true });
  for (let i=1; i<ptsMM.length; i++){
    const a = ptsMM[i-1], b = ptsMM[i];
    const dx=b[0]-a[0], dy=b[1]-a[1];
    const len=Math.hypot(dx,dy)||1;
    const nx=-dy/len, ny=dx/len; // outward-ish normal
    const seg = Math.max(1, Math.ceil(len/stepMM));
    for (let k=0;k<seg;k++){
      const t = k/seg;
      const cx = a[0] + dx*t, cy = a[1] + dy*t;
      const off = left ? half : -half;
      stitches.push({ x: cx + nx*off, y: cy + ny*off });
      left = !left;
    }
  }
}

// ---------- Line stitch helper ----------
function lineStitch(out, aMM, bMM, maxStepMM){
  const len=Math.hypot(bMM[0]-aMM[0], bMM[1]-aMM[1]);
  const steps=Math.max(1, Math.ceil(len/maxStepMM));
  for (let i=1;i<=steps;i++){
    const t=i/steps;
    out.push({ x:aMM[0]+(bMM[0]-aMM[0])*t, y:aMM[1]+(bMM[1]-aMM[1])*t });
  }
}

// ---------- Color preview ----------
function drawPreviewColored(plan, W, H){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for (const s of plan.stitches){
    if (s.end || s.colorChange) continue;
    if (s.x<minx) minx=s.x; if (s.y<miny) miny=s.y;
    if (s.x>maxx) maxx=s.x; if (s.y>maxy) maxy=s.y;
  }
  const bw=Math.max(1,maxx-minx), bh=Math.max(1,maxy-miny);
  const sc=0.9*Math.min(W/bw,H/bh), ox=W/2-(minx+maxx)/2*sc, oy=H/2-(miny+maxy)/2*sc;

  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,W,H); g.lineWidth=1;

  let last=null, ci=0;
  const toCss=(rgb)=>`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.strokeStyle = toCss(plan.colors[ci] || [30,30,30]);

  for (const s of plan.stitches){
    if (s.colorChange){ last=null; ci=Math.min(ci+1, plan.colors.length-1); g.strokeStyle=toCss(plan.colors[ci]||[30,30,30]); continue; }
    if (s.end) break;
    if (s.jump){ last={x:s.x,y:s.y}; continue; }
    if (!last){ last={x:s.x,y:s.y}; continue; }
    g.beginPath();
    g.moveTo(ox+last.x*sc, oy+last.y*sc);
    g.lineTo(ox+s.x*sc, oy+s.y*sc);
    g.stroke();
    last={x:s.x,y:s.y};
  }
  return c.toDataURL('image/png');
}

// ---------- DST writer ----------
function writeDST(plan){
  const recs=[]; let lx=0, ly=0;
  const to10th=(mm)=>Math.round(mm*10);
  const clamp121=(v)=>Math.max(-121, Math.min(121, v));

  for (const s of plan.stitches){
    if (s.end){ recs.push(0x00,0x00,0xF3); break; }
    if (s.colorChange){ recs.push(0x00,0x00,0xC3); continue; }
    const dx=clamp121(to10th(s.x-lx)), dy=clamp121(to10th(s.y-ly));
    lx=s.x; ly=s.y;
    const [b1,b2,b3]=packRecord(dx,dy,!!s.jump);
    recs.push(b1,b2,b3);
  }

  const header=new Uint8Array(512).fill(0x20);
  const put=(t,o)=>{ for (let i=0;i<t.length;i++) header[o+i]=t.charCodeAt(i); };
  const count=Math.floor(recs.length/3);
  put(`LA:LOOMABELLE\n`,0);
  put(`ST:${String(count).padStart(7,' ')}`,11);
  put(`CO:${String(Math.max(1, plan.colors.length)).padStart(7,' ')}`,24);
  put(`+X  100\n-Y  100\n`,52);
  put(`AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n`,80);
  put(`PD:******\n`,232);

  const out=new Uint8Array(512+recs.length+1);
  out.set(header,0); out.set(new Uint8Array(recs),512); out[512+recs.length]=0x1A;
  return out.buffer;
}
function packRecord(dx,dy,jump){
  const ax=Math.abs(dx), ay=Math.abs(dy);
  let b1=0,b2=0,b3=0;
  if(ax&1)b1|=1; if(ax&2)b1|=2; if(ax&4)b1|=4; if(ax&8)b2|=1; if(ax&16)b2|=2; if(ax&32)b2|=4; if(ax&64)b3|=1;
  if(ay&1)b1|=8; if(ay&2)b1|=16; if(ay&4)b1|=32; if(ay&8)b2|=8; if(ay&16)b2|=16; if(ay&32)b2|=32; if(ay&64)b3|=2;
  if(dx<0)b3|=0x20; if(dy<0)b3|=0x40; if(jump)b3|=0x10;
  return [b1,b2,b3];
}