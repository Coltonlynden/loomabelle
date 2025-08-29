// Renders the hoop preview from imgCanvas; called after redraw
(function(){
  function render(targetId){
    const can = document.getElementById(targetId);
    if (!can) return;
    const ctx = can.getContext('2d');
    const w = can.width, h = can.height;
    ctx.clearRect(0,0,w,h);

    // simple hoop + grid + miniature
    ctx.fillStyle='#f6e9de'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#bfb7b0'; ctx.lineWidth=18; ctx.strokeRect(14,14,w-28,h-28);
    ctx.strokeStyle='rgba(0,0,0,.18)'; ctx.lineWidth=1;
    for (let x=40;x<w-40;x+= (w-80)/4){ ctx.beginPath(); ctx.moveTo(x,40); ctx.lineTo(x,h-40); ctx.stroke(); }
    for (let y=40;y<h-40;y+= (h-80)/3){ ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(w-40,y); ctx.stroke(); }

    // mini image
    try{
      const src = document.getElementById('imgCanvas');
      ctx.drawImage(src, 40, 40, w-80, h-80);
    }catch{}
  }

  window.renderLoomPreview = render;
})();