// Loomabelle - pure JS pipeline with HEIC support
// - Upload (JPG/PNG/HEIC)
// - Color reduce (k-means)
// - Hatch fill from pixel masks
// - Export Tajima .DST
// - Works on iPhone Safari

// ---------- DOM / state ----------
const $ = (s) => document.querySelector(s);
const setStatus = (m, cls = "") => { const el = $("#status"); if (el) { el.textContent = m; el.className = `status ${cls}`; } };
$("#year")?.textContent = new Date().getFullYear();

const work = $("#work");
const wctx = work.getContext("2d", { willReadFrequently: true });

const HOOP_MM = { "4x4": { w: 100, h: 100 }, "5x7": { w: 130, h: 180 } };
let img = null; // set after upload

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===============================================
// 1) UPLOAD (robust + HEIC -> JPEG)
// ===============================================

// tiny loader for HEIC -> JPEG
async function convertHeicToJpeg(file) {
  if (!window.heic2any) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.onload = res;
      s.onerror = () => rej(new Error("Failed to load HEIC converter"));
      document.head.appendChild(s);
    });
  }
  const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], (file.name || "image").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

// decode to <img>
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = reject;
    image.src = url;
  });
}

// bind file input (works on iOS)
function bindFileListener() {
  const handler = async (ev) => {
    const input = ev.target.matches('input[type="file"]') ? ev.target : null;
    if (!input) return;
    const f = input.files && input.files[0];
    if (!f) { setStatus("No file selected.", "warn"); return; }

    try {
      setStatus("Loading image…");

      let fileForDecode = f;
      const name = (f.name || "").toLowerCase();
      const mime = (f.type || "").toLowerCase();
      if (mime.includes("heic") || mime.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif")) {
        setStatus("Converting HEIC to JPEG…");
        fileForDecode = await convertHeicToJpeg(f);
      }

      img = await loadImageFromFile(fileForDecode);

      // quick preview on canvas
      const maxSide = 1200;
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const W = Math.max(1, Math.round(img.width * s));
      const H = Math.max(1, Math.round(img.height * s));
      work.width = W; work.height = H;
      wctx.clearRect(0, 0, W, H);
      wctx.drawImage(img, 0, 0, W, H);

      $("#process").disabled = false;
      setStatus(`Image ready (${W}×${H}). Tap Process.`, "ok");
    } catch (e) {
      console.error(e);
      setStatus("Could not read that image. Try a JPG/PNG.", "error");
      img = null;
      $("#process").disabled = true;
    }
  };
  document.addEventListener("change", handler, true);
  document.addEventListener("input", handler, true);
}
bindFileListener();

// ===============================================
// 2) PROCESS (pure JS hatch fill -> .DST)
// ===============================================
$("#process").addEventListener("click", async () => {
  if (!img) return;
  $("#process").disabled = true;
  setStatus("Processing…");

  try {
    const colors = clamp(Number($("#colors").value) || 4, 2, 5);
    const removeBg = $("#removeBg").checked;
    let outline = $("#outline").checked; // disabled in this fallback
    const hoop = $("#hoop").value;
    const angleDeg = Number($("#angle").value) || 45;
    const densityMM = Number($("#density").value) || 0.4;

    // 0) Draw to canvas (downscale if huge)
    const maxSide = 1200;
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const W = Math.max(1, Math.round(img.width * s));
    const H = Math.max(1, Math.round(img.height * s));
    work.width = W; work.height = H;
    wctx.clearRect(0, 0, W, H);
    wctx.drawImage(img, 0, 0, W, H);

    // 1) Color reduction
    const { indexed, palette } = reduceColors(wctx, W, H, colors, removeBg);
    if (palette.length === 0) throw new Error("No non‑background colors detected.");

    // 2) Build binary masks
    const masks = palette.map((_, ci) => {
      const m = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (indexed[i] === ci) m[i] = 1;
      return m;
    });

    // 3) Design bbox (px)
    const bbox = masks.reduce((b, m) => expandBbox(b, m, W, H), { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity });
    if (!(bbox.maxx > bbox.minx && bbox.maxy > bbox.miny)) throw new Error("Couldn’t find any solid areas.");
    const bw = bbox.maxx - bbox.minx, bh = bbox.maxy - bbox.miny;
    const cx = (bbox.minx + bbox.maxx) / 2, cy = (bbox.miny + bbox.maxy) / 2;

    // 4) scaling to hoop
    const mmPerPx = Math.min(HOOP_MM[hoop].w / bw, HOOP_MM[hoop].h / bh);
    const pxPerMM = 1 / mmPerPx;

    // 5) Hatch directly from masks; outline disabled for pure JS fallback
    if (outline) { outline = false; setStatus("Using safe fallback (no outline).", "warn"); }
    const spacingPx = Math.max(1, Math.round(densityMM * pxPerMM));
    const sampleStepPx = Math.max(1, Math.round(0.6 * pxPerMM));

    const plan = { stitches: [], colors: palette.slice() };
    for (let ci = 0; ci < masks.length; ci++) {
      if (ci > 0) plan.stitches.push({ colorChange: true, x: 0, y: 0 });
      const segs = hatchSegmentsFromMask(masks[ci], W, H, bbox, angleDeg, spacingPx, sampleStepPx);
      for (const [a, b] of segs) {
        const sMM = [(a[0] - cx) * mmPerPx, (a[1] - cy) * mmPerPx];
        const eMM = [(b[0] - cx) * mmPerPx, (b[1] - cy) * mmPerPx];
        plan.stitches.push({ x: sMM[0], y: sMM[1], jump: true });
        lineStitch(plan.stitches, sMM, eMM, 7); // 7mm max
      }
    }

    // 6) Preview + DST
    $("#preview").src = drawPreview(plan, 720, 520);
    const blob = new Blob([writeDST(plan)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = $("#download"); a.href = url; a.classList.remove("disabled");
    setStatus("Done! Download your .DST.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Processing failed.", "error");
  } finally {
    $("#process").disabled = false;
  }
});

// ===============================================
// 3) Helpers (color reduce, hatch, preview, DST)
// ===============================================

// K-means color reduction with optional border-based background removal
function reduceColors(ctx, W, H, k, removeBg) {
  const { data } = ctx.getImageData(0, 0, W, H);
  const N = W * H;
  const src = new Uint8Array(data.buffer); // RGBA

  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pts[i*3] = src[i*4];
    pts[i*3+1] = src[i*4+1];
    pts[i*3+2] = src[i*4+2];
  }

  const centers = new Float32Array(k * 3);
  for (let c = 0; c < k; c++) {
    const j = Math.floor((c + 0.5) * N / k);
    centers[c*3] = pts[j*3];
    centers[c*3+1] = pts[j*3+1];
    centers[c*3+2] = pts[j*3+2];
  }

  const assign = new Uint16Array(N);
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < N; i++) {
      let best = 0, bd = 1e12;
      const r = pts[i*3], g = pts[i*3+1], b = pts[i*3+2];
      for (let c = 0; c < k; c++) {
        const cr=centers[c*3], cg=centers[c*3+1], cb=centers[c*3+2];
        const d=(r-cr)**2+(g-cg)**2+(b-cb)**2;
        if (d < bd) { bd=d; best=c; }
      }
      assign[i] = best;
    }
    const sum = new Float32Array(k * 4);
    for (let i=0;i<N;i++){ const c=assign[i]; sum[c*4]+=pts[i*3]; sum[c*4+1]+=pts[i*3+1]; sum[c*4+2]+=pts[i*3+2]; sum[c*4+3]++; }
    for (let c=0;c<k;c++){ const cnt=sum[c*4+3]||1; centers[c*3]=sum[c*4]/cnt; centers[c*3+1]=sum[c*4+1]/cnt; centers[c*3+2]=sum[c*4+2]/cnt; }
  }

  // background via border-dominant cluster
  let bg = -1;
  if (removeBg) {
    const counts = new Uint32Array(k);
    const bump = (x,y)=>counts[assign[y*W+x]]++;
    for (let x=0;x<W;x++){ bump(x,0); bump(x,H-1); }
    for (let y=0;y<H;y++){ bump(0,y); bump(W-1,y); }
    let m=0, mi=0; for (let c=0;c<k;c++) if (counts[c]>m){ m=counts[c]; mi=c; }
    bg = mi;
  }

  const used = new Set();
  const indexed = new Uint8Array(N);
  for (let i=0;i<N;i++){ const c=assign[i]; if (c===bg) indexed[i]=255; else { indexed[i]=c; used.add(c); } }

  const list = [...used].sort((a,b)=>a-b);
  const remap = new Map(); list.forEach((c,i)=>remap.set(c,i));
  const palette = list.map(c=>[centers[c*3]|0, centers[c*3+1]|0, centers[c*3+2]|0]);
  for (let i=0;i<N;i++) if (indexed[i]!==255) indexed[i]=remap.get(indexed[i]);

  return { indexed, palette };
}

// expand bbox with a mask
function expandBbox(b, mask, W, H) {
  for (let y=0;y<H;y++){
    const row=y*W;
    for (let x=0;x<W;x++){
      if (mask[row+x]) {
        if (x<b.minx) b.minx=x; if (y<b.miny) b.miny=y;
        if (x>b.maxx) b.maxx=x; if (y>b.maxy) b.maxy=y;
      }
    }
  }
  return b;
}

// generate hatch segments directly from a binary mask
function hatchSegmentsFromMask(mask, W, H, bbox, angleDeg, spacingPx, sampleStepPx) {
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
    for (let s=-half;s<=half;s+=sampleStepPx){
      const x=Math.round(px+dir[0]*s), y=Math.round(py+dir[1]*s);
      const inside=(x>=0 && y>=0 && x<W && y<H) ? mask[y*W+x]===1 : false;
      if (inside && !start) start=[x,y];
      if ((!inside || s>=half) && start){
        const end = inside ? [x,y] : [Math.round(px+dir[0]*(s-sampleStepPx)), Math.round(py+dir[1]*(s-sampleStepPx))];
        if (distPx(start,end) >= 2) segs.push([start,end]);
        start=null;
      }
    }
  }
  return segs;
}

// add stitches along a line with max segment length
function lineStitch(out, a, b, maxStepMM){
  const len=Math.hypot(b[0]-a[0], b[1]-a[1]);
  const steps=Math.max(1, Math.ceil(len/maxStepMM));
  for (let i=1;i<=steps;i++){
    const t=i/steps;
    out.push({ x: a[0]+(b[0]-a[0])*t, y: a[1]+(b[1]-a[1])*t });
  }
}

// preview renderer
function drawPreview(plan, W, H){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for (const s of plan.stitches){
    if (s.end || s.colorChange) continue;
    if (s.x<minx) minx=s.x; if (s.y<miny) miny=s.y;
    if (s.x>maxx) maxx=s.x; if (s.y>maxy) maxy=s.y;
  }
  const bw=Math.max(1,maxx-minx), bh=Math.max(1,maxy-miny);
  const sc=0.9*Math.min(W/bw, H/bh);
  const ox=W/2 - (minx+maxx)/2*sc, oy=H/2 - (miny+maxy)/2*sc;

  const c=document.createElement("canvas"); c.width=W; c.height=H;
  const g=c.getContext("2d");
  g.fillStyle="#fff"; g.fillRect(0,0,W,H); g.strokeStyle="#111"; g.lineWidth=1;

  let last=null;
  for (const s of plan.stitches){
    if (s.colorChange || s.end){ last=null; continue; }
    if (s.jump){ last={x:s.x,y:s.y}; continue; }
    if (!last){ last={x:s.x,y:s.y}; continue; }
    g.beginPath();
    g.moveTo(ox+last.x*sc, oy+last.y*sc);
    g.lineTo(ox+s.x*sc, oy+s.y*sc);
    g.stroke();
    last={x:s.x,y:s.y};
  }
  return c.toDataURL("image/png");
}

// DST writer (minimal but valid for many machines)
function writeDST(plan){
  const recs=[]; let lx=0, ly=0;
  const to = (mm)=>Math.round(mm*10);
  const clamp121=(v)=>Math.max(-121, Math.min(121, v));

  for (const s of plan.stitches){
    if (s.end){ recs.push(0x00,0x00,0xF3); break; }
    if (s.colorChange){ recs.push(0x00,0x00,0xC3); continue; }
    const dx=clamp121(to(s.x-lx)), dy=clamp121(to(s.y-ly));
    lx=s.x; ly=s.y;
    const [b1,b2,b3]=pack(dx,dy,!!s.jump);
    recs.push(b1,b2,b3);
  }

  const header=new Uint8Array(512).fill(0x20);
  const put=(t,o)=>{ for (let i=0;i<t.length;i++) header[o+i]=t.charCodeAt(i); };
  const count=Math.floor(recs.length/3);
  put(`LA:LOOMABELLE\n`,0);
  put(`ST:${String(count).padStart(7,' ')}`,11);
  put(`CO:${String(1).padStart(7,' ')}`,24);
  put(`+X  100\n-Y  100\n`,52);
  put(`AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n`,80);
  put(`PD:******\n`,232);

  const out=new Uint8Array(512+recs.length+1);
  out.set(header,0); out.set(new Uint8Array(recs),512); out[512+recs.length]=0x1A;
  return out.buffer;
}
function pack(dx,dy,jump){
  const ax=Math.abs(dx), ay=Math.abs(dy);
  let b1=0,b2=0,b3=0;
  if(ax&1)b1|=1; if(ax&2)b1|=2; if(ax&4)b1|=4; if(ax&8)b2|=1; if(ax&16)b2|=2; if(ax&32)b2|=4; if(ax&64)b3|=1;
  if(ay&1)b1|=8; if(ay&2)b1|=16; if(ay&4)b1|=32; if(ay&8)b2|=8; if(ay&16)b2|=16; if(ay&32)b2|=32; if(ay&64)b3|=2;
  if(dx<0)b3|=0x20; if(dy<0)b3|=0x40; if(jump)b3|=0x10;
  return [b1,b2,b3];
}

const distPx = (a,b)=>Math.hypot(a[0]-b[0], a[1]-b[1]);