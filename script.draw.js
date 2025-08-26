import {state, getImageData, paintMask, floodWand} from './processing.js';
import {getEditContext, redraw} from './script.upload.js';

const $ = s=>document.querySelector(s);

// tabs
document.querySelectorAll('.seg-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t=b.dataset.tab;
    document.querySelectorAll('[data-pane]').forEach(p=>p.classList.add('hidden'));
    document.querySelector('#pane-'+t).classList.remove('hidden');
  });
});

const {canvas,ctx} = getEditContext();
let tool='paint';
let brushSize = +$('#brushSize').value || 28;
let drawing=false;

$('#toolPaint').onclick=()=>tool='paint';
$('#toolErase').onclick=()=>tool='erase';
$('#toolWand').onclick=()=>tool='wand';
$('#toolFill').onclick=()=>tool='fill';
$('#brushSize').oninput=e=>brushSize=+e.target.value;

const undoStack=[], redoStack=[];
function pushUndo(){
  undoStack.push(state.mask.slice());
  if(undoStack.length>20) undoStack.shift();
  redoStack.length=0;
}
$('#undo').onclick=()=>{ if(!undoStack.length) return; redoStack.push(state.mask); state.mask=undoStack.pop(); redraw(); }
$('#redo').onclick=()=>{ if(!redoStack.length) return; undoStack.push(state.mask); state.mask=redoStack.pop(); redraw(); }
$('#clear').onclick=()=>{ pushUndo(); state.mask.fill(0); redraw(); }

canvas.addEventListener('pointerdown', e=>{
  const rect=canvas.getBoundingClientRect();
  const x=Math.round((e.clientX-rect.left - state.panX)/state.zoom);
  const y=Math.round((e.clientY-rect.top  - state.panY)/state.zoom);
  drawing=true; canvas.setPointerCapture(e.pointerId);
  pushUndo();

  if(tool==='wand'){
    const id = ctx.getImageData(0,0,canvas.width,canvas.height);
    floodWand(id, Math.max(0,Math.min(canvas.width-1,x)), Math.max(0,Math.min(canvas.height-1,y)), 28);
    redraw();
    drawing=false;
    return;
  }
  if(tool==='fill'){
    state.mask.fill(255); redraw(); drawing=false; return;
  }
  drawAt(x,y);
});
canvas.addEventListener('pointermove', e=>{
  if(!drawing) return;
  const rect=canvas.getBoundingClientRect();
  const x=Math.round((e.clientX-rect.left - state.panX)/state.zoom);
  const y=Math.round((e.clientY-rect.top  - state.panY)/state.zoom);
  drawAt(x,y);
});
canvas.addEventListener('pointerup', ()=>{ drawing=false; });

function drawAt(x,y){
  paintMask(x,y,brushSize, tool==='paint'?1:0);
  redraw();
}

// text tool (drag to move)
let draggingText=null, dragDX=0, dragDY=0;
$('#applyText').onclick=()=>{
  const t=($('#textStr').value||'').trim(); if(!t) return;
  state.textLayers.push({
    text:t, x:canvas.width/2, y:canvas.height/2, size:+$('#textSize').value,
    font:$('#textFont').value, angle:+$('#textAngle').value, curve:+$('#textCurve').value, color:$('#textColor').value
  });
  renderTextOverlay();
};
function renderTextOverlay(){
  redraw();
  // draw text on top
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);
  for(const tl of state.textLayers){
    ctx.save();
    ctx.translate(tl.x, tl.y);
    ctx.rotate(tl.angle*Math.PI/180);
    ctx.font = `bold ${tl.size}px ${tl.font}`;
    ctx.fillStyle = tl.color;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    if(Math.abs(tl.curve) < 2){
      ctx.fillText(tl.text,0,0);
    }else{
      // simple arc text
      const r = 300;
      const arc = tl.curve*Math.PI/180;
      const ch = tl.text.split('');
      const step = arc/(ch.length-1);
      let a=-arc/2;
      for(const c of ch){
        ctx.save();
        ctx.rotate(a);
        ctx.fillText(c,0,-r);
        ctx.restore();
        a+=step;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
canvas.addEventListener('pointerdown', e=>{
  // hit test text layers (topmost)
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left - state.panX)/state.zoom;
  const y=(e.clientY-rect.top  - state.panY)/state.zoom;
  for(let i=state.textLayers.length-1;i>=0;i--){
    const t=state.textLayers[i];
    const w=t.size * (t.text.length*0.6);
    const h=t.size*1.2;
    if(Math.abs(x-t.x)<w/2 && Math.abs(y-t.y)<h/2){
      draggingText=t; dragDX=x-t.x; dragDY=y-t.y; canvas.setPointerCapture(e.pointerId); break;
    }
  }
});
canvas.addEventListener('pointermove', e=>{
  if(!draggingText) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left - state.panX)/state.zoom;
  const y=(e.clientY-rect.top  - state.panY)/state.zoom;
  draggingText.x=x-dragDX; draggingText.y=y-dragDY;
  renderTextOverlay();
});
canvas.addEventListener('pointerup', ()=> draggingText=null);

// show/hide overlays
$('#showMask').onchange=()=>redraw();
$('#showEdges').onchange=()=>redraw();

// expose to preview
window.addEventListener('palette:ready', ()=> renderTextOverlay());