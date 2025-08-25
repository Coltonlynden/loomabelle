// Single source of truth for what you see: base image + mask overlay + live preview.
(function(){
  const $ = s => document.querySelector(s);
  const S = (window.EAS ||= {}).state ||= {};

  const base = $('#canvas');           // 1024² base
  const mask = $('#mask');             // 1024² alpha mask (black in A)
  const edges= $('#edges');            // optional guide
  const stage= $('#stage').getContext('2d'); // composited on‑screen view
  const live = $('#live').getContext('2d');  // “Live preview” box

  // cute overlay color within the mask
  function drawMaskTint(ctx){
    // draw semi‑transparent peach diagonals clipped to mask alpha
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 1024;
    const t = tmp.getContext('2d');
    // pattern
    t.clearRect(0,0,1024,1024);
    t.fillStyle = '#f4c9bf88';
    for(let y= -1024; y<1024; y+=24){
      t.beginPath();
      t.moveTo(0,y); t.lineTo(1024,y+1024); t.lineTo(1024,y+1024-8); t.lineTo(0,y-8); t.closePath();
      t.fill();
    }
    // clip by mask alpha
    ctx.save();
    ctx.globalCompositeOperation='source-over';
    ctx.drawImage(tmp,0,0);
    ctx.globalCompositeOperation='destination-in';
    ctx.drawImage(mask,0,0);
    ctx.restore();
  }

  function drawText(ctx){
    const T = S.text || {};
    if(!T.content) return;
    ctx.save();
    ctx.translate(512, 760);
    ctx.rotate((T.angle||0) * Math.PI/180);
    ctx.font = `bold ${T.size||64}px ui-rounded, system-ui, -apple-system, Segoe UI`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if((T.curve||0)===0){
      ctx.fillStyle = '#5b463f';
      ctx.fillText(T.content, 0, 0);
    } else {
      const radius = 380;
      const text = T.content;
      const angle = (T.curve||0) * Math.PI/180;
      const step = angle / Math.max(1,text.length-1);
      ctx.rotate(-angle/2);
      for(let i=0;i<text.length;i++){
        const ch = text[i];
        ctx.save();
        ctx.translate(0, -radius);
        ctx.rotate(angle/2);
        ctx.fillStyle='#5b463f';
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        ctx.rotate(step);
      }
    }
    ctx.restore();
  }

  function drawDirection(ctx){
    if(!S.showDir) return;
    ctx.save();
    ctx.strokeStyle = '#d78e84';
    ctx.lineWidth = 2;
    const ang = (S.dirAngle||45) * Math.PI/180;
    // draw a small hatch overlay clipped to mask to preview direction
    ctx.beginPath();
    for(let y=-1024;y<1024;y+=28){
      const x1 = 0, y1 = y;
      const x2 = 1024, y2 = y + Math.tan(ang)*1024;
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    }
    ctx.stroke();
    ctx.globalCompositeOperation='destination-in';
    ctx.drawImage(mask,0,0);
    ctx.restore();
  }

  function renderStage(){
    const ctx = stage;
    ctx.clearRect(0,0,1024,1024);
    ctx.drawImage(base,0,0);
    drawMaskTint(ctx);
    drawText(ctx);
    drawDirection(ctx);
    if(edges.canvas.style.display!=='none') ctx.drawImage(edges,0,0);
  }

  function renderLive(){
    // show current composited image inside the “Live preview” box
    live.canvas.width = 1024; live.canvas.height = 1024;
    live.clearRect(0,0,1024,1024);
    live.drawImage(stage.canvas,0,0);
  }

  window.EAS_preview = {
    render(){
      renderStage();
      renderLive();
    }
  };

  window.addEventListener('load', ()=>window.EAS_preview.render());
})();