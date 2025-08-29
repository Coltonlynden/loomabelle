/* Loom preview rendering */
(function(){
  function srcCanvas(){
    if(window.Stitches && Stitches.canvas) return Stitches.canvas;
    return document.getElementById('mainCanvas');
  }
  function hoop(ctx,w,h){
    const r=Math.min(w,h)*0.08;
    ctx.save();
    ctx.fillStyle='#f6e9de'; ctx.strokeStyle='#bfb7b0';
    ctx.lineWidth=Math.max(2,Math.round(Math.min(w,h)*0.02));
    ctx.beginPath();
    ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r);
    ctx.lineTo(w,h-r); ctx.quadraticCurveTo(w,h,w-r,h);
    ctx.lineTo(r,h); ctx.quadraticCurveTo(0,h,0,h-r);
    ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  window.renderLoomPreview=function(targetId){
    const t=document.getElementById(targetId); if(!t) return;
    const c=t.getContext('2d'), w=t.width, h=t.height; c.clearRect(0,0,w,h);
    hoop(c,w,h);
    const src=srcCanvas(); if(!src||!src.width) return;
    const pad=Math.round(Math.min(w,h)*0.14), tw=w-pad*2, th=h-pad*2;
    c.save(); c.translate(pad,pad);
    c.fillStyle='#f6e9de'; c.fillRect(0,0,tw,th);
    c.strokeStyle='rgba(0,0,0,.15)'; c.lineWidth=1;
    for(let i=1;i<4;i++){ const x=(tw/4)*i,y=(th/4)*i;
      c.beginPath(); c.moveTo(x,0); c.lineTo(x,th); c.stroke();
      c.beginPath(); c.moveTo(0,y); c.lineTo(tw,y); c.stroke();
    }
    try{
      if(window.Stitches && Stitches.previewBitmap) c.drawImage(Stitches.previewBitmap,0,0,tw,th);
      else c.drawImage(src,0,0,tw,th);
    }catch(e){}
    c.restore();
  };
  let raf;
  ['pointerup','keyup','tool:select','change'].forEach(ev=>{
    window.addEventListener(ev,()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{ const m=document.getElementById('loomPreviewCanvas'); if(m) renderLoomPreview('loomPreviewCanvas'); });
    },{passive:true});
  });
})();