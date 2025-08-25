/* Easbroidery — stitch path generator (layout untouched) */
(function () {
  const E = (window.EAS ||= {});
  const P = (E.paths ||= {});

  const DEF = { angleDeg: 45, hatchSpacing: 6, step: 3, minSeg: 8, maxStitch: 12 };
  const toRad = (a) => (a * Math.PI) / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function maskSampler(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    return (x, y) => {
      x = (x + 0.5) | 0; y = (y + 0.5) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      return data[(y * W + x) * 4 + 3]; // use alpha as mask
    };
  }

  function splitRun(ax, ay, bx, by, maxLen) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L <= maxLen) return [[bx, by]];
    const n = Math.ceil(L / maxLen), out = [];
    for (let i = 1; i <= n; i++) out.push([ax + (dx * i) / n, ay + (dy * i) / n]);
    return out;
  }

  P.generate = function (maskCanvas, opts = {}) {
    const cfg = { ...DEF, ...opts };
    const W = maskCanvas.width, H = maskCanvas.height;
    const alpha = maskSampler(maskCanvas);

    // rotate a virtual grid, scanline fill, then rotate lines back
    const ang = toRad(cfg.angleDeg), s = Math.sin(ang), c = Math.cos(ang);
    const cx = W / 2, cy = H / 2;
    const R = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * c + dy * s, -dx * s + dy * c]; };
    const Rinv = (u, v) => [u * c - v * s + cx, u * s + v * c + cy];

    const corners = [[0,0],[W,0],[0,H],[W,H]].map(([x,y])=>R(x,y));
    const umin = Math.min(...corners.map(p=>p[0])) - 2;
    const umax = Math.max(...corners.map(p=>p[0])) + 2;
    const vmin = Math.min(...corners.map(p=>p[1])) - 2;
    const vmax = Math.max(...corners.map(p=>p[1])) + 2;

    const segments = [];
    for (let v = vmin; v <= vmax; v += cfg.hatchSpacing) {
      let inside = false, u0 = umin;
      for (let u = umin; u <= umax; u += 1) {
        const [x,y] = Rinv(u, v);
        const on = alpha(x, y) > 127;
        if (!inside && on) { inside = true; u0 = u; }
        else if (inside && !on) {
          inside = false;
          const a = Rinv(u0, v), b = Rinv(u, v);
          if (Math.hypot(b[0]-a[0], b[1]-a[1]) >= cfg.minSeg) segments.push([a,b]);
        }
      }
      if (inside) {
        const a = Rinv(u0, v), b = Rinv(umax, v);
        if (Math.hypot(b[0]-a[0], b[1]-a[1]) >= cfg.minSeg) segments.push([a,b]);
      }
    }

    // serpentine ordering + point sampling
    const points = [];
    let flip = false;
    for (let [a,b] of segments) {
      if (flip) [a,b] = [b,a];
      flip = !flip;
      const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy);
      const steps = Math.max(1, Math.round(L / cfg.step));
      for (let i=0;i<=steps;i++) points.push([a[0]+dx*i/steps, a[1]+dy*i/steps]);
    }

    // enforce max stitch
    const stitched = [];
    if (points.length) {
      let [px,py]=points[0]; stitched.push([px,py]);
      for (let i=1;i<points.length;i++) {
        const [nx,ny]=points[i];
        for (const p of splitRun(px,py,nx,ny,cfg.maxStitch)) stitched.push(p);
        [px,py]=[nx,ny];
      }
    }

    return { points: stitched, segments, stats:{ w:W, h:H, count: stitched.length, segs: segments.length } };
  };

  P.preview = function (canvas, res, opts = {}) {
    if (!canvas || !res) return;
    const stroke = opts.stroke || '#c06458', seg = opts.seg || '#e4b1aa';
    const ctx = canvas.getContext('2d');
    const W = res.stats.w, H = res.stats.h;

    // fit to element box, not layout
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) { canvas.width = r.width; canvas.height = r.height; }
    const k = Math.min((canvas.width||W)/W, (canvas.height||H)/H) || 1;

    ctx.setTransform(k,0,0,k,0,0);
    ctx.clearRect(0,0,W,H);

    // light hatch lines
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = seg;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (const [[x1,y1],[x2,y2]] of res.segments){ ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); }
    ctx.stroke();

    // stitch path
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4 / k;
    ctx.beginPath();
    let first = true;
    for (const [x,y] of res.points) { if (first){ctx.moveTo(x,y); first=false;} else ctx.lineTo(x,y); }
    ctx.stroke();
  };

  P.exportJSON = (res) =>
    JSON.stringify({ width: res.stats.w, height: res.stats.h, points: res.points }, null, 2);

  P.exportSVG = function (res) {
    const d = [];
    if (res.points.length) {
      const [x0,y0]=res.points[0]; d.push(`M${x0.toFixed(1)} ${y0.toFixed(1)}`);
      for (let i=1;i<res.points.length;i++){ const [x,y]=res.points[i]; d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`); }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${res.stats.w} ${res.stats.h}"><path d="${d.join(' ')}" fill="none" stroke="#c06458" stroke-width="1.2"/></svg>`;
  };

  P.exportDST = function (res) {
    // compact, JUMP-less straight-runner for demo
    const scale = 1000 / Math.max(res.stats.w, res.stats.h);
    const pts = res.points.map(([x,y]) => [x*scale, y*scale]);

    const header = new Uint8Array(512);
    const put = (s,o)=>{ for(let i=0;i<s.length;i++) header[o+i]=s.charCodeAt(i); };
    put('LA:Easbroidery',0);
    put(`ST:${String(pts.length).padStart(7,' ')}`,0x2E);
    header[511]=0x1A;

    const bytes = [];
    const enc = (dx,dy)=>{
      dx = clamp(Math.round(dx),-121,121);
      dy = clamp(Math.round(dy),-121,121);
      const b1 = ((dx & 0x1F) | ((dy & 0x1F) << 5)) & 0xFF;
      const b2 = (((dx >> 5) & 0x03) | (((dy >> 5) & 0x03) << 2)) & 0xFF;
      bytes.push(b1,b2,0);
    };
    let [px,py]=pts[0]||[0,0];
    for (let i=1;i<pts.length;i++){ const [nx,ny]=pts[i]; enc(nx-px, ny-py); [px,py]=[nx,ny]; }
    bytes.push(0,0,0xF3);

    const body = new Uint8Array(bytes);
    const out = new Uint8Array(512 + body.length);
    out.set(header,0); out.set(body,512);
    return out;
  };
})();