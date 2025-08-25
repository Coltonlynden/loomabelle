/* Easbroidery — stitch path generation + exporters
   Pure logic. No DOM shape changes.

   Public API:
     window.EAS.paths.generate(maskCanvas, opts?)
       -> { points, segments, stats }
     window.EAS.paths.preview(canvas, result, opts?)
     window.EAS.paths.exportSVG(result, w, h)
     window.EAS.paths.exportJSON(result)
     window.EAS.paths.exportDST(result, w, h)
*/

(function () {
  const root = (window.EAS ||= {});
  const P = (root.paths ||= {});

  // ---------- defaults ----------
  const DEF = {
    angleDeg: 45,        // hatch angle
    hatchSpacing: 6,     // px between hatch lines
    step: 3,             // px between stitches on a hatch
    minSeg: 8,           // ignore very tiny segments (px)
    maxStitch: 12,       // split long moves into sub-stitches (px)
  };

  // ---------- helpers ----------
  function toRad(a) { return (a * Math.PI) / 180; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function maskSampler(maskCanvas) {
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const { width: W, height: H } = maskCanvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    return (x, y) => {
      x = (x + 0.5) | 0;
      y = (y + 0.5) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      return data[(y * W + x) * 4 + 3]; // alpha
    };
  }

  // Split long move into sub-stitches
  function splitRun(ax, ay, bx, by, maxLen) {
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L <= maxLen) return [[bx, by]];
    const n = Math.ceil(L / maxLen);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      out.push([ax + dx * t, ay + dy * t]);
    }
    return out;
  }

  // ---------- core: build hatch segments inside mask ----------
  function generate(maskCanvas, opts = {}) {
    const cfg = { ...DEF, ...opts };
    const W = maskCanvas.width;
    const H = maskCanvas.height;

    const alpha = maskSampler(maskCanvas);
    const ang = toRad(cfg.angleDeg);
    const s = Math.sin(ang), c = Math.cos(ang);

    // Rotate a point around image center into hatch space
    const cx = W / 2, cy = H / 2;
    function R(x, y) {
      const dx = x - cx, dy = y - cy;
      return [ dx * c + dy * s, -dx * s + dy * c ];
    }
    function Rinv(u, v) {
      const x = u * c - v * s + cx;
      const y = u * s + v * c + cy;
      return [x, y];
    }

    // extents in hatch coordinates
    const corners = [[0,0],[W,0],[0,H],[W,H]].map(([x,y])=>R(x,y));
    const umin = Math.min(...corners.map(p=>p[0]));
    const umax = Math.max(...corners.map(p=>p[0]));
    const vmin = Math.min(...corners.map(p=>p[1]));
    const vmax = Math.max(...corners.map(p=>p[1]));

    const segments = []; // each = [[x1,y1],[x2,y2]]

    // march horizontally in hatch-space (v changes)
    for (let v = vmin - 2; v <= vmax + 2; v += cfg.hatchSpacing) {
      // line param u from umin..umax
      let inside = false;
      let u0 = umin - 2;

      function test(u) {
        const [x,y] = Rinv(u, v);
        // sample with small stride for robustness
        return alpha(x|0, y|0) > 127;
      }

      for (let u = umin - 2; u <= umax + 2; u += 1) {
        const t = test(u);
        if (!inside && t) {
          inside = true;
          u0 = u;
        } else if (inside && !t) {
          inside = false;
          const u1 = u;
          // map back to image coords
          const a = Rinv(u0, v);
          const b = Rinv(u1, v);
          const L = Math.hypot(b[0]-a[0], b[1]-a[1]);
          if (L >= cfg.minSeg) segments.push([a, b]);
        }
      }
      if (inside) {
        const a = Rinv(u0, v);
        const b = Rinv(umax + 2, v);
        const L = Math.hypot(b[0]-a[0], b[1]-a[1]);
        if (L >= cfg.minSeg) segments.push([a,b]);
      }
    }

    // convert segments into running-stitch points, serpentine order to minimize jumps
    const points = [];
    let toggle = false;
    for (const seg of segments) {
      let [a, b] = seg;
      if (toggle) { const t=a; a=b; b=t; }
      toggle = !toggle;

      const dx = b[0]-a[0], dy=b[1]-a[1];
      const L = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.round(L / cfg.step));
      for (let i=0;i<=steps;i++) {
        const t = i/steps;
        points.push([a[0]+dx*t, a[1]+dy*t]);
      }
    }

    // split long edges (machine-friendly)
    const stitched = [];
    if (points.length) {
      let [px,py] = points[0];
      stitched.push([px,py]);
      for (let i=1;i<points.length;i++) {
        const [nx,ny] = points[i];
        const mids = splitRun(px,py,nx,ny,cfg.maxStitch);
        for (const m of mids) stitched.push(m);
        [px,py] = [nx,ny];
      }
    }

    return {
      points: stitched,     // [[x,y],...]
      segments,             // raw hatch spans for overlay
      stats: { count: stitched.length, segs: segments.length, w: W, h: H }
    };
  }

  // ---------- preview draw ----------
  function preview(canvas, res, opts = {}) {
    if (!canvas || !res) return;
    const cfg = Object.assign({ stroke: '#c06458', seg: '#e4b1aa' }, opts);
    canvas.width = canvas.clientWidth || canvas.width;
    canvas.height = canvas.clientHeight || canvas.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // scale to fit
    const sx = canvas.width / res.stats.w;
    const sy = canvas.height / res.stats.h;
    const k = Math.min(sx, sy);
    ctx.setTransform(k,0,0,k,0,0);

    // segments (light)
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = cfg.seg;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (const [[x1,y1],[x2,y2]] of res.segments) {
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    }
    ctx.stroke();

    // stitch path
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cfg.stroke;
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    let first = true;
    for (const [x,y] of res.points) {
      if (first) { ctx.moveTo(x,y); first=false; }
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  // ---------- exporters ----------
  function exportJSON(res) {
    return JSON.stringify({
      width: res.stats.w, height: res.stats.h,
      stitchCount: res.stats.count,
      points: res.points
    }, null, 2);
  }

  function exportSVG(res, w, h) {
    w = w || res.stats.w; h = h || res.stats.h;
    const d = [];
    if (res.points.length) {
      const [x0,y0] = res.points[0];
      d.push(`M${x0.toFixed(1)} ${y0.toFixed(1)}`);
      for (let i=1;i<res.points.length;i++) {
        const [x,y] = res.points[i];
        d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    }
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${res.stats.w} ${res.stats.h}">
  <path d="${d.join(' ')}" fill="none" stroke="#c06458" stroke-width="1.2"/>
</svg>`.trim();
  }

  // Minimal DST writer (absolute → relative, 0.1 mm units approx)
  function exportDST(res, w, h) {
    // scale to 0.1mm-ish: assume 1024px ≈ 100mm → 0.1mm units = *10
    const scale = 1000 / Math.max(res.stats.w, res.stats.h);
    const pts = res.points.map(([x,y]) => [x*scale, y*scale]);
    let bytes = [];

    function enc(dx, dy, flags) {
      // DST encodes in 0.1mm steps using 7-bit signed for dx,dy split across 3 bytes.
      // This is a compact, minimal writer that clamps values.
      dx = clamp(Math.round(dx), -121, 121);
      dy = clamp(Math.round(dy), -121, 121);
      // 3-byte stitch record
      const b1 = ((dx & 0x1F) | ((dy & 0x1F) << 5)) & 0xFF;
      const b2 = (((dx >> 5) & 0x03) | (((dy >> 5) & 0x03) << 2) | (flags || 0)) & 0xFF;
      const b3 = 0; // simple
      bytes.push(b1, b2, b3);
    }

    // header 512 bytes (ASCII)
    const header = new Uint8Array(512);
    const encASCII = (str, off) => {
      for (let i=0;i<str.length && off+i<header.length;i++) header[off+i]=str.charCodeAt(i);
    };
    encASCII(`LA:Easbroidery`, 0);
    encASCII(`ST:${String(pts.length).padStart(7,' ')}`, 0x2E);
    encASCII(`+X:0000`, 0x38); encASCII(`-X:0000`, 0x40);
    encASCII(`+Y:0000`, 0x48); encASCII(`-Y:0000`, 0x50);
    encASCII(`AX:+0000`, 0x58); encASCII(`AY:+0000`, 0x62);
    encASCII(`MX:+0000`, 0x6C); encASCII(`MY:+0000`, 0x76);
    encASCII(`PD:******`, 0x80);
    encASCII(String.fromCharCode(0x1A), 0x200 - 1); // EOF in header

    // stitches as deltas
    let [px,py] = pts[0];
    for (let i=1;i<pts.length;i++) {
      const [nx,ny] = pts[i];
      enc(nx-px, ny-py, 0);
      [px,py]=[nx,ny];
    }
    // END record
    bytes.push(0x00, 0x00, 0xF3);

    const body = new Uint8Array(bytes);
    const out = new Uint8Array(header.length + body.length);
    out.set(header,0); out.set(body,header.length);
    return out;
  }

  // expose
  P.generate = generate;
  P.preview = preview;
  P.exportJSON = exportJSON;
  P.exportSVG = exportSVG;
  P.exportDST = exportDST;
})();