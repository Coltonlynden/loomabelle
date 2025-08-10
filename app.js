// ---------- DOM / state ----------
const $ = (s) => document.querySelector(s);
const setStatus = (m, cls = "") => { const el = $("#status"); if (el) { el.textContent = m; el.className = `status ${cls}`; } };
$("#year")?.textContent = new Date().getFullYear();

const canvas = $("#work");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const HOOP_MM = { "4x4": { w: 100, h: 100 }, "5x7": { w: 130, h: 180 } };
let img = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- file load ----------
$("#file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (!/image\/(png|jpeg)/.test(f.type)) { setStatus("Please upload a JPG or PNG.", "error"); return; }
  setStatus("Loading image…");

  img = await new Promise((res, rej) => {
    const u = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = rej;
    im.src = u;
  });

  $("#process").disabled = false;
  setStatus("Image ready. Tap Process.", "ok");
});

// ---------- main pipeline (pure JS, no imports) ----------
$("#process").addEventListener("click", async () => {
  if (!img) return;
  $("#process").disabled = true;
  setStatus("Processing…");

  try {
    const colors = clamp(Number($("#colors").value) || 4, 2, 5);
    const removeBg = $("#removeBg").checked;
    let outline = $("#outline").checked; // may be disabled in fallback
    const hoop = $("#hoop").value;
    const angleDeg = Number($("#angle").value) || 45;
    const densityMM = Number($("#density").value) || 0.40;

    // 0) Draw to canvas (downscale if huge to keep it fast on mobile)
    const maxSide = 1200; // smaller than before for reliability on iPhone
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const W = Math.max(1, Math.round(img.width * s));
    const H = Math.max(1, Math.round(img.height * s));
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    // 1) Color reduction (k‑means)
    const { indexed, palette } = reduceColors(ctx, W, H, colors, removeBg);
    if (palette.length === 0) throw new Error("No non‑background colors detected.");

    // 2) Build binary masks for each color
    const masks = palette.map((_, ci) => {
      const m = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (indexed[i] === ci) m[i] = 1;
      return m;
    });

    // 3) Overall design bbox (in pixels)
    const bbox = masks.reduce((b, m) => expandBbox(b, m, W, H), { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity });
    if (!(bbox.maxx > bbox.minx && bbox.maxy > bbox.miny)) throw new Error("Couldn’t find any solid areas.");
    const bw = bbox.maxx - bbox.minx, bh = bbox.maxy - bbox.miny;
    const cx = (bbox.minx + bbox.maxx) / 2, cy = (bbox.miny + bbox.maxy) / 2;

    // 4) Pixel→mm scale to fit hoop
    const mmPerPx = Math.min(HOOP_MM[hoop].w / bw, HOOP_MM[hoop].h / bh);
    const pxPerMM = 1 / mmPerPx;

    // 5) Hatch fill directly on masks (no vectorization). Outline disabled.
    if (outline) {
      outline = false;
      setStatus("Using safe fallback (no outline).", "warn");
    }

    const spacingPx = Math.max(1, Math.round(densityMM * pxPerMM));      // distance between hatch lines in px
    const sampleStepPx = Math.max(1, Math.round(0.6 * pxPerMM));          // sampling step along a line

    const plan = { stitches: [], colors: palette.slice() };
    for (let ci = 0; ci < masks.length; ci++) {
      if (ci > 0) plan.stitches.push({ colorChange: true, x: 0, y: 0 });

      const segs = hatchSegmentsFromMask(masks[ci], W, H, bbox, angleDeg, spacingPx, sampleStepPx);

      // Convert pixel segments → mm stitches
      for (const [a, b] of segs) {
        const sMM = [(a[0] - cx) * mmPerPx, (a[1] - cy) * mmPerPx];
        const eMM = [(b[0] - cx) * mmPerPx, (b[1] - cy) * mmPerPx];
        plan.stitches.push({ x: sMM[0], y: sMM[1], jump: true });
        lineStitch(plan.stitches, sMM, eMM, 7); // 7mm max stitch
      }
    }

    // 6) Preview + DST
    $("#preview").src = drawPreview(plan, 720, 520);

    const blob = new Blob([writeDST(plan)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = $("#download");
    a.href = url;
    a.classList.remove("disabled");

    setStatus("Done! Download your .DST.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Processing failed.", "error");
  } finally {
    $("#process").disabled = false;
  }
});

// ---------- helpers ----------

// K‑means color reduction with optional border‑based background removal
function reduceColors(ctx, W, H, k, removeBg) {
  const { data } = ctx.getImageData(0, 0, W, H);
  const N = W * H;
  const src = new Uint8Array(data.buffer); // RGBA contiguous

  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i*3] = src[i*4]; pts[i*3+1] = src[i*4+1]; pts[i*3+2] = src[i*4+2]; }

  const centers = new Float32Array(k * 3);
  for (let c = 0; c < k; c++) { const j = Math.floor((c + 0.5) * N / k);
    centers[c*3] = pts[j*3]; centers[c*3+1] = pts[j*3+1]; centers[c*3+2] = pts[j*3+2];
  }
  const assign = new Uint16Array(N);

  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < N; i++) {
      let best = 0, bd = 1e12, r = pts[i*3], g = pts[i*3+1], b = pts[i*3+2];
      for (let c = 0; c < k; c++) {
        const cr = centers[c*3], cg = centers[c*3+1], cb = centers[c*3+2];
        const d = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sum = new Float32Array(k * 4);
    for (let i = 0; i < N; i++) { const c = assign[i]; sum[c*4] += pts[i*3]; sum[c*4+1] += pts[i*3+1]; sum[c*4+2] += pts[i*3+2]; sum[c*4+3]++; }
    for (let c = 0; c < k; c++) { const cnt = sum[c*4+3] || 1;
      centers[c*3] = sum[c*4] / cnt; centers[c*3+1] = sum[c*4+1] / cnt; centers[c*3+2] = sum[c*4+2] / cnt;
    }
  }

  // Background as border‑dominant cluster
  let bg = -1;
  if (removeBg) {
    const counts = new Uint32Array(k);
    const bump = (x, y) => counts[assign[y*W + x]]++;
    for (let x = 0; x < W; x++) { bump(x, 0); bump(x, H-1); }
    for (let y = 0; y < H; y++) { bump(0, y); bump(W-1, y); }
    let m = 0, mi = 0; for (let c = 0; c < k; c++) if (counts[c] > m) { m = counts[c]; mi = c; }
    bg = mi;
  }

  const used = new Set();
  const indexed = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const c = assign[i]; if (c === bg) indexed[i] = 255; else { indexed[i] = c; used.add(c); } }

  const list = [...used].sort((a, b) => a - b);
  const remap = new Map(); list.forEach((c, i) => remap.set(c, i));
  const palette = list.map(c => [centers[c*3]|0, centers[c*3+1]|0, centers[c*3+2]|0]);

  for (let i = 0; i < N; i++) if (indexed[i] !== 255) indexed[i] = remap.get(indexed[i]);

  return { indexed, palette };
}

// Expand bbox with mask's on‑pixels
function expandBbox(b, mask, W, H) {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask[row + x]) {
        if (x < b.minx) b.minx = x;
        if (y < b.miny) b.miny = y;
        if (x > b.maxx) b.maxx = x;
        if (y > b.maxy) b.maxy = y;
      }
    }
  }
  return b;
}

// Hatch segments directly from a binary mask (no polygons)
function hatchSegmentsFromMask(mask, W, H, bbox, angleDeg, spacingPx, sampleStepPx) {
  const segs = [];
  const dir = [Math.cos(angleDeg*Math.PI/180), Math.sin(angleDeg*Math.PI/180)];
  const nrm = [-dir[1], dir[0]];

  const bw = bbox.maxx - bbox.minx;
  const bh = bbox.maxy - bbox.miny;
  const cx = (bbox.minx + bbox.maxx) / 2;
  const cy = (bbox.miny + bbox.maxy) / 2;
  const half = Math.hypot(bw, bh) * 0.75; // generous half-length

  const range = Math.ceil((Math.hypot(bw, bh)) / spacingPx) + 2;

  for (let k = -range; k <= range; k++) {
    const off = k * spacingPx;
    const px = cx + nrm[0] * off, py = cy + nrm[1] * off;
    // sample along the line
    let start = null;
    for (let s = -half; s <= half; s += sampleStepPx) {
      const x = Math.round(px + dir[0] * s);
      const y = Math.round(py + dir[1] * s);
      const inside = (x >= 0 && y >= 0 && x < W && y < H) ? mask[y*W + x] === 1 : false;

      if (inside && !start) start = [x, y];
      if ((!inside || s >= half) && start) {
        const end = inside ? [x, y] : [Math.round(px + dir[0] * (s - sampleStepPx)), Math.round(py + dir[1] * (s - sampleStepPx))];
        if (distPx(start, end) >= 2) segs.push([start, end]);
        start = null;
      }
    }
  }
  return segs;
}

// Add stitches along a segment with a max stitch length
function lineStitch(out, aMM, bMM, maxStepMM) {
  const len = Math.hypot(bMM[0]-aMM[0], bMM[1]-aMM[1]);
  const steps = Math.max(1, Math.ceil(len / maxStepMM));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: aMM[0] + (bMM[0]-aMM[0]) * t, y: aMM[1] + (bMM[1]-aMM[1]) * t });
  }
}

// Preview renderer
function drawPreview(plan, W, H) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of plan.stitches) {
    if (s.end || s.colorChange) continue;
    if (s.x < minx) minx = s.x; if (s.y < miny) miny = s.y;
    if (s.x > maxx) maxx = s.x; if (s.y > maxy) maxy = s.y;
  }
  const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
  const sc = 0.9 * Math.min(W / bw, H / bh);
  const ox = W/2 - (minx + maxx)/2 * sc, oy = H/2 - (miny + maxy)/2 * sc;

  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#111"; g.lineWidth = 1;

  let last = null;
  for (const s of plan.stitches) {
    if (s.colorChange || s.end) { last = null; continue; }
    if (s.jump) { last = { x: s.x, y: s.y }; continue; }
    if (!last) { last = { x: s.x, y: s.y }; continue; }
    g.beginPath();
    g.moveTo(ox + last.x * sc, oy + last.y * sc);
    g.lineTo(ox + s.x * sc, oy + s.y * sc);
    g.stroke();
    last = { x: s.x, y: s.y };
  }
  return c.toDataURL("image/png");
}

// ---------- DST writer ----------
function writeDST(plan) {
  const recs = [];
  let lx = 0, ly = 0;
  const to = (mm) => Math.round(mm * 10);
  const clamp121 = (v) => Math.max(-121, Math.min(121, v));

  for (const s of plan.stitches) {
    if (s.end) { recs.push(0x00, 0x00, 0xF3); break; }
    if (s.colorChange) { recs.push(0x00, 0x00, 0xC3); continue; }
    const dx = clamp121(to(s.x - lx)), dy = clamp121(to(s.y - ly));
    lx = s.x; ly = s.y;
    const [b1, b2, b3] = pack(dx, dy, !!s.jump);
    recs.push(b1, b2, b3);
  }

  const header = new Uint8Array(512).fill(0x20);
  const put = (t, o) => { for (let i = 0; i < t.length; i++) header[o + i] = t.charCodeAt(i); };
  const count = Math.floor(recs.length / 3);
  put(`LA:LOOMABELLE\n`, 0);
  put(`ST:${String(count).padStart(7, " ")}`, 11);
  put(`CO:${String(1).padStart(7, " ")}`, 24);
  put(`+X  100\n-Y  100\n`, 52);
  put(`AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n`, 80);
  put(`PD:******\n`, 232);

  const out = new Uint8Array(512 + recs.length + 1);
  out.set(header, 0); out.set(new Uint8Array(recs), 512); out[512 + recs.length] = 0x1A;
  return out.buffer;
}
function pack(dx, dy, jump) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let b1 = 0, b2 = 0, b3 = 0;
  if (ax & 1) b1 |= 1; if (ax & 2) b1 |= 2; if (ax & 4) b1 |= 4; if (ax & 8) b2 |= 1;
  if (ax & 16) b2 |= 2; if (ax & 32) b2 |= 4; if (ax & 64) b3 |= 1;
  if (ay & 1) b1 |= 8; if (ay & 2) b1 |= 16; if (ay & 4) b1 |= 32; if (ay & 8) b2 |= 8;
  if (ay & 16) b2 |= 16; if (ay & 32) b2 |= 32; if (ay & 64) b3 |= 2;
  if (dx < 0) b3 |= 0x20; if (dy < 0) b3 |= 0x40; if (jump) b3 |= 0x10;
  return [b1, b2, b3];
}

const distPx = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);