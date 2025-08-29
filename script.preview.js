/* =============== Loom preview rendering =============== */
(function () {
  function getSourceCanvas() {
    if (window.Stitches && Stitches.canvas) return Stitches.canvas; // stitched bitmap
    return document.getElementById('mainCanvas');                    // edit canvas fallback
  }

  function drawHoopFrame(ctx, w, h) {
    const r = Math.min(w, h) * 0.08;
    ctx.save();
    ctx.fillStyle = '#f6e9de';
    ctx.strokeStyle = '#bfb7b0';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  window.renderLoomPreview = function renderLoomPreview(targetId) {
    const t = document.getElementById(targetId);
    if (!t) return;
    const ctx = t.getContext('2d');
    const w = t.width, h = t.height;
    ctx.clearRect(0,0,w,h);

    drawHoopFrame(ctx, w, h);

    const src = getSourceCanvas();
    if (!src || !src.width) return;

    const pad = Math.round(Math.min(w, h) * 0.14);
    const tw = w - pad * 2, th = h - pad * 2;

    // grid
    ctx.save();
    ctx.translate(pad, pad);
    ctx.fillStyle = '#f6e9de';
    ctx.fillRect(0, 0, tw, th);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    const cells = 4;
    for (let i = 1; i < cells; i++) {
      const x = (tw / cells) * i, y = (th / cells) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, th); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tw, y); ctx.stroke();
    }
    // content
    try {
      if (window.Stitches && Stitches.previewBitmap) {
        ctx.drawImage(Stitches.previewBitmap, 0, 0, tw, th);
      } else {
        ctx.drawImage(src, 0, 0, tw, th);
      }
    } catch (e) {}
    ctx.restore();
  };

  // Re-render after interactions
  let raf;
  ['pointerup','keyup','tool:select','change'].forEach(ev=>{
    window.addEventListener(ev, ()=> {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=> {
        const c = document.getElementById('loomPreviewCanvas');
        if (c) window.renderLoomPreview('loomPreviewCanvas');
      });
    }, {passive:true});
  });
})();