// --- tiny dom helpers ---
const $ = (s) => document.querySelector(s)
const setStatus = (msg, kind = 'info') => {
  const el = $('#status'); if (!el) return
  el.textContent = msg
  el.className = `status ${kind}`
}

// footer year
$('#year').textContent = new Date().getFullYear()

// elements / state
const HOOP_MM = { '4x4': { w: 100, h: 100 }, '5x7': { w: 130, h: 180 } }
const work = $('#work')
const ctx = work.getContext('2d', { willReadFrequently: true })
let loadedImg = null

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const setBusy = (b) => {
  $('#process').disabled = b || !loadedImg
  document.body.style.cursor = b ? 'progress' : 'default'
}

// ---------- robust dynamic loaders ----------
async function tryImport(urls) {
  let lastErr
  for (const url of urls) {
    try { return await import(url) } catch (e) { lastErr = e }
  }
  throw lastErr
}
async function loadPotrace() {
  // Try a few ESM CDNs
  return (await tryImport([
    'https://esm.run/potrace-wasm@2',
    'https://cdn.jsdelivr.net/npm/potrace-wasm@2/dist/index.min.mjs',
    'https://unpkg.com/potrace-wasm@2/dist/index.min.mjs'
  ]))
}
async function loadSimplify() {
  const mod = await tryImport([
    'https://esm.run/simplify-js@1',
    'https://cdn.jsdelivr.net/npm/simplify-js@1.2.4/index.js',
    'https://unpkg.com/simplify-js@1.2.4/index.js'
  ])
  // jsdelivr/unpkg serve CJS; wrap default if needed
  return mod.default || mod
}

// ---------- image loading (with HEIC warning) ----------
function looksLikeHeic(file) {
  const name = (file?.name || '').toLowerCase()
  return file?.type === 'image/heic' || file?.type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')
}
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

// ---------- UI events ----------
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]
  if (!f) return
  if (looksLikeHeic(f)) {
    setStatus('HEIC images are not supported by most browsers. Please upload a JPG or PNG.', 'warn')
    $('#process').disabled = true
    loadedImg = null
    return
  }
  try {
    setStatus('Loading image…')
    loadedImg = await loadImg(f)
    $('#process').disabled = false
    setStatus('Image ready. Click “Process”.', 'ok')
  } catch (err) {
    console.error(err)
    setStatus('Could not load that image. Try a JPG/PNG.', 'error')
  }
})

$('#process').addEventListener('click', async () => {
  if (!loadedImg) return
  setBusy(true)
  setStatus('Processing… this may take a few seconds.')
  try {
    const colors = clamp(Number($('#colors').value) || 4, 2, 5)
    const removeBg = $('#removeBg').checked
    const outline = $('#outline').checked
    const hoop = $('#hoop').value
    const angle = Number($('#angle').value) || 45
    const density = Number($('#density').value) || 0.4

    // draw image (downscale if huge)
    const maxSide = 2600
    const scale = Math.min(1, maxSide / Math.max(loadedImg.width, loadedImg.height))
    const W = Math.max(1, Math.round(loadedImg.width * scale))
    const H = Math.max(1, Math.round(loadedImg.height * scale))
    work.width = W; work.height = H
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(loadedImg, 0, 0, W, H)

    // 1) color reduce
    const { indexed, palette } = reduceColors(ctx, W, H, colors, removeBg)

    // 2) vectorize by color (Potrace via CDN) + simplify
    const regsPx = await vectorizeByColor(indexed, palette, W, H)

    // 3) fit to hoop (px→mm)
    const regsMM = fitRegionsToHoop(regsPx, HOOP_MM[hoop])

    // 4) plan stitches
    const plan = planStitches(regsMM, { densityMM: density, angleDeg: angle, outline, maxStitchMM: 7 })

    // 5) preview
    $('#preview').src = drawPreview(plan, 760, 520)

    // 6) export DST
    const blob = new Blob([writeDST(plan)], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = $('#download')
    a.href = url
    a.classList.remove('disabled')

    setStatus('Done! Preview updated. You can download the .DST file.', 'ok')
  } catch (err) {
    console.error(err)
    setStatus(String(err?.message || err || 'Something went wrong.'), 'error')
  } finally {
    setBusy(false)
  }
})

// ========== Color reduction (k-means) ==========
function reduceColors(ctx, W, H, k, removeBg) {
  const { data } = ctx.getImageData(0, 0, W, H)
  const N = W * H
  const px = new Uint8Array(data.buffer) // RGBA
  const pts = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    pts[i * 3] = px[i * 4]
    pts[i * 3 + 1] = px[i * 4 + 1]
    pts[i * 3 + 2] = px[i * 4 + 2]
  }
  k = clamp(Math.floor(k), 2, 5)

  const centers = new Float32Array(k * 3)
  for (let c = 0; c < k; c++) {
    const idx = Math.floor((c + 0.5) * N / k)
    centers[c * 3] = pts[idx * 3]
    centers[c * 3 + 1] = pts[idx * 3 + 1]
    centers[c * 3 + 2] = pts[idx * 3 + 2]
  }

  const assign = new Uint16Array(N)
  for (let it = 0; it < 8; it++) {
    for (let i = 0; i < N; i++) {
      let best = 0, bd = 1e12
      const r = pts[i * 3], g = pts[i * 3 + 1], b = pts[i * 3 + 2]
      for (let c = 0; c < k; c++) {
        const cr = centers[c * 3], cg = centers[c * 3 + 1], cb = centers[c * 3 + 2]
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
        if (d < bd) { bd = d; best = c }
      }
      assign[i] = best
    }
    const sum = new Float32Array(k * 4)
    for (let i = 0; i < N; i++) {
      const c = assign[i]
      sum[c * 4] += pts[i * 3]
      sum[c * 4 + 1] += pts[i * 3 + 1]
      sum[c * 4 + 2] += pts[i * 3 + 2]
      sum[c * 4 + 3]++
    }
    for (let c = 0; c < k; c++) {
      const cnt = sum[c * 4 + 3] || 1
      centers[c * 3] = sum[c * 4] / cnt
      centers[c * 3 + 1] = sum[c * 4 + 1] / cnt
      centers[c * 3 + 2] = sum[c * 4 + 2] / cnt
    }
  }

  // background = border-dominant cluster
  let bg = -1
  if (removeBg) {
    const counts = new Uint32Array(k)
    const push = (x, y) => { const id = y * W + x; counts[assign[id]]++ }
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
    let maxc = 0, maxi = 0
    for (let c = 0; c < k; c++) if (counts[c] > maxc) { maxc = counts[c]; maxi = c }
    bg = maxi
  }

  const used = new Set()
  const indexed = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const c = assign[i]
    if (c === bg) indexed[i] = 255
    else { indexed[i] = c; used.add(c) }
  }

  const list = [...used].sort((a, b) => a - b)
  const remap = new Map()
  list.forEach((c, i) => remap.set(c, i))
  const palette = list.map(c => [centers[c * 3] | 0, centers[c * 3 + 1] | 0, centers[c * 3 + 2] | 0])
  for (let i = 0; i < N; i++) if (indexed[i] !== 255) indexed[i] = remap.get(indexed[i])

  return { indexed, palette }
}

// ========== Vectorize using Potrace (CDN) ==========
async function vectorizeByColor(indexed, palette, W, H) {
  const { trace } = await loadPotrace()
  const simplify = await loadSimplify()

  const out = []
  for (let c = 0; c < palette.length; c++) {
    const mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) mask[i] = indexed[i] === c ? 255 : 0

    const d = await trace(mask, { width: W, height: H, threshold: 128, turdSize: 40 })
    const polys = []
    const subpaths = d.match(/M[^M]+/g) || []

    for (const sd of subpaths) {
      const pts = samplePath(sd, 1.5)
      const simp = simplify(pts.map(p => ({ x: p[0], y: p[1] })), 1.0, true).map(p => [p.x, p.y])
      if (polygonArea(simp) > 50 && simp.length > 2) polys.push(simp)
    }
    if (polys.length) out.push({ color: palette[c], polys })
  }
  return out
}
function samplePath(d, stepPx = 2) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  const len = path.getTotalLength()
  const pts = []
  for (let s = 0; s <= len; s += stepPx) {
    const p = path.getPointAtLength(s)
    pts.push([p.x, p.y])
  }
  return pts
}
function polygonArea(poly) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

// ========== Fit to hoop (px→mm) ==========
function fitRegionsToHoop(regs, hoop) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  regs.forEach(r => r.polys.forEach(poly => poly.forEach(([x, y]) => {
    if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y
  })))
  const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny)
  const s = Math.min(hoop.w / bw, hoop.h / bh)
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  return regs.map(r => ({
    color: r.color,
    polys: r.polys.map(poly => poly.map(([x, y]) => [(x - cx) * s, (y - cy) * s]))
  }))
}

// ========== Stitch planning ==========
function planStitches(regs, p) {
  const stitches = [], colors = []
  for (let ci = 0; ci < regs.length; ci++) {
    const r = regs[ci]
    colors.push(r.color)
    if (ci > 0) stitches.push({ x: 0, y: 0, colorChange: true })
    for (const poly of r.polys) {
      const lines = hatchLines(poly, p.densityMM, p.angleDeg)
      for (const [a, b] of lines) {
        const segs = insideSegments(a, b, poly, 0.6)
        for (const [s, e] of segs) {
          stitches.push({ x: s[0], y: s[1], jump: true })
          lineStitch(stitches, s, e, p.maxStitchMM)
        }
      }
      if (p.outline) {
        const n = poly.length
        stitches.push({ x: poly[0][0], y: poly[0][1], jump: true })
        for (let i = 1; i <= n; i++) {
          lineStitch(stitches, poly[(i - 1) % n], poly[i % n], p.maxStitchMM)
        }
      }
    }
  }
  stitches.push({ x: 0, y: 0, end: true })
  return { stitches, colors }
}
function hatchLines(poly, spacing, angleDeg) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const [x, y] of poly) { if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y }
  const ang = angleDeg * Math.PI / 180
  const dir = [Math.cos(ang), Math.sin(ang)], nrm = [-dir[1], dir[0]]
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  const diag = Math.hypot(maxx - minx, maxy - miny), half = diag
  const lines = [], range = Math.ceil(diag / spacing) + 2
  for (let k = -range; k <= range; k++) {
    const off = k * spacing
    const px = cx + nrm[0] * off, py = cy + nrm[1] * off
    lines.push([[px - dir[0] * half, py - dir[1] * half], [px + dir[0] * half, py + dir[1] * half]])
  }
  return lines
}
function insideSegments(a, b, poly, sampleMM) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(2, Math.floor(len / sampleMM))
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  const segs = []
  let cur = null
  for (let i = 0; i < pts.length; i++) {
    const inside = pointInPolygon(pts[i], poly)
    if (inside && !cur) cur = pts[i]
    if ((!inside || i === pts.length - 1) && cur) {
      const end = inside ? pts[i] : pts[i - 1]
      if (distance(cur, end) > 0.5) segs.push([cur, end])
      cur = null
    }
  }
  return segs
}
function lineStitch(out, a, b, maxStep) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(1, Math.ceil(len / maxStep))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t })
  }
}
function pointInPolygon(p, poly) {
  let c = false, j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    const intersect = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)
    if (intersect) c = !c
    j = i
  }
  return c
}
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])

// ========== Minimal DST writer ==========
function writeDST(plan) {
  const recs = []
  let lastX = 0, lastY = 0
  const toDst = (mm) => Math.round(mm * 10)
  const clampDelta = (v) => Math.max(-121, Math.min(121, v))
  for (const s of plan.stitches) {
    if (s.end) { recs.push(0x00, 0x00, 0xF3); break }
    if (s.colorChange) { recs.push(0x00, 0x00, 0xC3); continue }
    const dx = clampDelta(toDst(s.x - lastX)), dy = clampDelta(toDst(s.y - lastY))
    lastX = s.x; lastY = s.y
    const [b1, b2, b3] = packRecord(dx, dy, !!s.jump)
    recs.push(b1, b2, b3)
  }
  const header = new Uint8Array(512).fill(0x20)
  const put = (txt, off) => { for (let i = 0; i < txt.length; i++) header[off + i] = txt.charCodeAt(i) }
  const stCount = Math.floor(recs.length / 3)
  const colChanges = Math.max(1, 1 + plan.stitches.filter(s => s.colorChange).length)
  put(`LA:EMBROIDERY\n`, 0)
  put(`ST:${String(stCount).padStart(7, ' ')}`, 11)
  put(`CO:${String(colChanges).padStart(7, ' ')}`, 24)
  put(`+X  100\n-Y  100\n`, 52)
  put(`AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n`, 80)
  put(`PD:******\n`, 232)
  const out = new Uint8Array(512 + recs.length + 1)
  out.set(header, 0); out.set(new Uint8Array(recs), 512); out[512 + recs.length] = 0x1A
  return out.buffer
}
function packRecord(dx, dy, jump) {
  const sx = Math.abs(dx), sy = Math.abs(dy)
  let b1 = 0, b2 = 0, b3 = 0
  if (sx & 1) b1 |= 1; if (sx & 2) b1 |= 2; if (sx & 4) b1 |= 4; if (sx & 8) b2 |= 1; if (sx & 16) b2 |= 2; if (sx & 32) b2 |= 4; if (sx & 64) b3 |= 1
  if (sy & 1) b1 |= 8; if (sy & 2) b1 |= 16; if (sy & 4) b1 |= 32; if (sy & 8) b2 |= 8; if (sy & 16) b2 |= 16; if (sy & 32) b2 |= 32; if (sy & 64) b3 |= 2
  if (dx < 0) b3 |= 0x20; if (dy < 0) b3 |= 0x40; if (jump) b3 |= 0x10
  return [b1, b2, b3]
}

// ---------- Preview renderer ----------
function drawPreview(plan, W, H) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const s of plan.stitches) {
    if (s.end || s.colorChange) continue
    if (s.x < minx) minx = s.x; if (s.y < miny) miny = s.y
    if (s.x > maxx) maxx = s.x; if (s.y > maxy) maxy = s.y
  }
  const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny)
  const scale = 0.9 * Math.min(W / bw, H / bh)
  const offx = W / 2 - (minx + maxx) / 2 * scale, offy = H / 2 - (miny + maxy) / 2 * scale

  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H
  const c = cvs.getContext('2d')
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H)
  c.strokeStyle = '#111'; c.lineWidth = 1

  let last = null
  for (const s of plan.stitches) {
    if (s.colorChange || s.end) { last = null; continue }
    if (s.jump) { last = { x: s.x, y: s.y }; continue }
    if (!last) { last = { x: s.x, y: s.y }; continue }
    c.beginPath()
    c.moveTo(offx + last.x * scale, offy + last.y * scale)
    c.lineTo(offx + s.x * scale, offy + s.y * scale)
    c.stroke()
    last = { x: s.x, y: s.y }
  }
  return cvs.toDataURL('image/png')
}