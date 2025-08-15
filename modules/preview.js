export function renderPreview(STATE){
  const { prev, prevCtx, draw } = STATE.canvases; if(!prevCtx) return;
  try{ prevCtx.fillStyle=getComputedStyle(draw).background || '#ffffff'; }catch{ prevCtx.fillStyle='#ffffff'; }
  prevCtx.clearRect(0,0,prev.width,prev.height); prevCtx.fillRect(0,0,prev.width,prev.height);
  prevCtx.strokeStyle='#111827'; prevCtx.lineWidth=1; prevCtx.beginPath();
  for(const s of STATE.stitches){ if(s.cmd==='stitch') prevCtx.lineTo(s.x,s.y); else if(s.cmd==='jump') prevCtx.moveTo(s.x,s.y); }
  prevCtx.stroke();
  if(STATE.guides){ const hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm;
    prevCtx.save(); prevCtx.strokeStyle='rgba(0,0,0,.22)'; prevCtx.setLineDash([6,6]);
    prevCtx.strokeRect((prev.width-hoopW)/2,(prev.height-hoopH)/2, hoopW, hoopH); prevCtx.restore(); }
}