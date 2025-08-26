/* Handles file input, zoom/pan, and keeps a master bitmap + mask */
const EditorState = {
  bmp:null,
  zoom:1, offX:0, offY:0,
  drawRect:{x:0,y:0,w:0,h:0,scale:1},
  tool:'paint',
  size:24,
  mask:null, // Uint8ClampedArray (0/255)
  history:[], redoStack:[],
  textLayers:[],
  directionAngle:45
};

document.addEventListener('DOMContentLoaded', () => {
  const file = document.getElementById('file');
  const edit = document.getElementById('edit');
  const ctx = edit.getContext('2d',{willReadFrequently:true});

  function redraw(){
    ctx.save();
    ctx.clearRect(0,0,edit.width,edit.height);
    if (EditorState.bmp){
      EditorState.drawRect = Proc.drawContain(ctx, EditorState.bmp);
    } else {
      ctx.fillStyle="#fff"; ctx.fillRect(0,0,edit.width,edit.height);
    }
    drawMaskOverlay(ctx);
    drawTextLayers(ctx);
    ctx.restore();
  }

  file.addEventListener('change', async e=>{
    const f = e.target.files[0];
    if (!f) return;
    EditorState.bmp = await Proc.loadImageBitmap(f);
    // init mask for canvas size
    EditorState.mask = new Uint8ClampedArray(edit.width*edit.height);
    EditorState.history=[]; EditorState.redoStack=[];
    redraw();
  });

  // zoom/pan
  const zoomPct = document.getElementById('zoomPct');
  document.getElementById('zoomIn').onclick = ()=>{EditorState.zoom=Math.min(3,EditorState.zoom+0.1); zoomPct.textContent=Math.round(EditorState.zoom*100)+'%';};
  document.getElementById('zoomOut').onclick= ()=>{EditorState.zoom=Math.max(0.5,EditorState.zoom-0.1); zoomPct.textContent=Math.round(EditorState.zoom*100)+'%';};

  // expose redraw for other modules
  window.__redraw = redraw;
  redraw();
});

function drawMaskOverlay(ctx){
  const showMask = document.getElementById('showMask')?.checked;
  const showEdges = document.getElementById('showEdges')?.checked;
  const {canvas} = ctx;
  if (!EditorState.mask || !showMask) return;
  const w=canvas.width,h=canvas.height;
  const id = ctx.getImageData(0,0,w,h);
  for (let i=0,p=0;i<id.data.length;i+=4,p++){
    if (EditorState.mask[p]===255){
      id.data[i+0] = id.data[i+0]*.5 + 220*.5;
      id.data[i+1] = id.data[i+1]*.5 + 120*.5;
      id.data[i+2] = id.data[i+2]*.5 + 120*.5;
    }
  }
  ctx.putImageData(id,0,0);
  if (showEdges){
    ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.lineWidth=1;
    ctx.setLineDash([6,4]);
    // quick edge contour
    const w4=w<<0; ctx.beginPath();
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const p=y*w+x;
        if (EditorState.mask[p]!==EditorState.mask[p+1]){ ctx.moveTo(x,y); ctx.lineTo(x+1,y); }
        if (EditorState.mask[p]!==EditorState.mask[p+w]){ ctx.moveTo(x,y); ctx.lineTo(x,y+1); }
      }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawTextLayers(ctx){
  if (!EditorState.textLayers.length) return;
  ctx.save();
  ctx.fillStyle='#000'; ctx.globalAlpha=.8; ctx.textAlign='center';
  for (const t of EditorState.textLayers){
    ctx.font = `${t.size}px serif`;
    ctx.translate(t.x, t.y);
    if (t.angle) ctx.rotate(t.angle*Math.PI/180);
    ctx.fillText(t.text, 0, 0);
    ctx.setTransform(1,0,0,1,0,0);
  }
  ctx.restore();
}