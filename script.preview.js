// preview compositor + stitch visual
(function(){
  const S = (window.EAS ||= {}).state ||= {};
  const base = document.getElementById('canvas');
  const mask = document.getElementById('mask');
  const overlay = document.getElementById('overlay');
  const p = document.getElementById('preview');
  const s = document.getElementById('stitchvis');
  const pctx=p.getContext('2d'), sctx=s.getContext('2d');
  p.width=p.height=s.width=s.height=1024;

  function drawText(ctx){
    if(!S.text?.content) return;
    ctx.save();
    ctx.translate(512, 820);
    ctx.rotate((S.text.angle||0)*Math.PI/180);
    const r=280, t=S.text.content, curve=S.text.curve||0;
    ctx.font=`bold ${S.text.size||64}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#222';
    if(Math.abs(curve)<0.01){ ctx.fillText(t,0,0); }
    else{
      const chars=[...t], arc=curve*Math.PI;
      for(let i=0;i<chars.length;i++){
        const a=-arc/2 + arc*i/Math.max(1,chars.length-1);
        ctx.save(); ctx.rotate(a); ctx.translate(0,-r); ctx.rotate(Math.sign(curve)*Math.PI/2);
        ctx.fillText(chars[i],0,0); ctx.restore();
      }
    }
    ctx.restore();
  }

  function render(){
    pctx.clearRect(0,0,1024,1024);
    pctx.drawImage(base,0,0);
    // darken outside mask
    pctx.save();
    pctx.globalCompositeOperation='destination-over';
    pctx.fillStyle='#ffffff';
    pctx.fillRect(0,0,1024,1024);
    pctx.restore();

    // draw semi‑transparent mask overlay for feedback
    pctx.save();
    pctx.globalAlpha=0.25; pctx.drawImage(mask,0,0); pctx.restore();

    drawText(pctx);

    sctx.clearRect(0,0,1024,1024);
    if(document.getElementById('toggle-stitch')?.checked){
      const res=window.EAS_processing.hatch();
      sctx.save(); sctx.lineWidth=1; sctx.strokeStyle='#b74f49';
      for(const seg of res.paths){ sctx.beginPath(); seg.forEach((pt,i)=> i?sctx.lineTo(pt[0],pt[1]):sctx.moveTo(pt[0],pt[1])); sctx.stroke(); }
      sctx.restore();
    }

    // direction overlay if requested
    const octx = overlay.getContext('2d');
    overlay.width=overlay.height=1024; octx.clearRect(0,0,1024,1024);
    if(S.showDir){
      const ang=(S.dirAngle||45)*Math.PI/180;
      octx.save(); octx.globalAlpha=.15; octx.strokeStyle='#000';
      for(let t=-1024;t<=1024;t+=32){
        octx.beginPath();
        const x0=512+Math.cos(ang)*-1200 - Math.sin(ang)*t;
        const y0=512+Math.sin(ang)*-1200 + Math.cos(ang)*t;
        const x1=512+Math.cos(ang)* 1200 - Math.sin(ang)*t;
        const y1=512+Math.sin(ang)* 1200 + Math.cos(ang)*t;
        octx.moveTo(x0,y0); octx.lineTo(x1,y1); octx.stroke();
      }
      octx.restore();
    }
  }

  window.EAS_preview = { render, fit:render };
})();