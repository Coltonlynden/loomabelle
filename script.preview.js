// compose preview + stitch preview
(function(){
  const S = (window.EAS ||= {}).state ||= {};
  const base = document.getElementById('canvas');
  const mask = document.getElementById('mask');
  const overlay = document.getElementById('overlay');
  const preview = document.getElementById('preview');
  const stitchvis = document.getElementById('stitchvis');
  const pctx = preview.getContext('2d');
  const sctx = stitchvis.getContext('2d');

  preview.width = preview.height = stitchvis.width = stitchvis.height = 1024;

  function drawText(ctx){
    if(!S.text?.content) return;
    ctx.save();
    ctx.translate(512, 820);
    ctx.rotate((S.text.angle||0)*Math.PI/180);
    const r = 280;
    ctx.font = `bold ${S.text.size||64}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const t=S.text.content;
    const curve=S.text.curve||0;
    if(Math.abs(curve)<0.01){ ctx.fillStyle='#222'; ctx.fillText(t,0,0); }
    else{
      const chars=[...t]; const w=chars.length;
      const arc=curve*Math.PI; // radians spanned
      for(let i=0;i<w;i++){
        const a = -arc/2 + arc*i/(Math.max(1,w-1));
        ctx.save(); ctx.rotate(a); ctx.translate(0,-r);
        ctx.rotate(Math.sign(curve)*Math.PI/2);
        ctx.fillStyle='#222'; ctx.fillText(chars[i],0,0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function render(force){
    const showStitches = document.getElementById('toggle-stitch')?.checked;
    pctx.clearRect(0,0,1024,1024);
    pctx.drawImage(base,0,0);
    // dim non‑selected area
    const m = mask;
    pctx.save();
    pctx.globalAlpha = 0.35;
    pctx.globalCompositeOperation='destination-over';
    pctx.fillStyle='#fff';
    pctx.fillRect(0,0,1024,1024);
    pctx.restore();

    // mask outline
    pctx.save();
    pctx.globalAlpha=0.25;
    pctx.drawImage(m,0,0);
    pctx.restore();

    drawText(pctx);

    sctx.clearRect(0,0,1024,1024);
    if(showStitches){
      const res = window.EAS_processing.hatch();
      // draw paths
      sctx.save();
      sctx.lineWidth=1; sctx.strokeStyle='#b74f49';
      for(const seg of res.paths){
        sctx.beginPath();
        seg.forEach((p,i)=> i? sctx.lineTo(p[0],p[1]) : sctx.moveTo(p[0],p[1]));
        sctx.stroke();
      }
      sctx.restore();
    }
  }

  window.EAS_preview = { render, fit:render };
})();