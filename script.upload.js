import {state,setImage,getImageData,autoMask,buildPalette} from './processing.js';

const $ = s => document.querySelector(s);

const fileInput = $('#file');
const editCanvas = $('#editCanvas');
const ectx = editCanvas.getContext('2d',{willReadFrequently:true});
let imgData=null;

let isPanning=false, startX=0,startY=0;
state.zoom=1; state.panX=0; state.panY=0;

function fitAndDraw(){
  if(!state.img) return;
  const w=editCanvas.clientWidth, ratio = state.img.height/state.img.width;
  editCanvas.height = Math.round(editCanvas.clientWidth*ratio);
  // clear
  ectx.clearRect(0,0,editCanvas.width,editCanvas.height);
  // draw image
  ectx.save();
  ectx.translate(state.panX, state.panY);
  ectx.scale(state.zoom, state.zoom);
  ectx.drawImage(state.img, 0,0, editCanvas.width, editCanvas.height);
  // mask overlay (cute pink)
  if($('#showMask').checked && state.mask){
    const m = new ImageData(new Uint8ClampedArray(editCanvas.width*editCanvas.height*4), editCanvas.width, editCanvas.height);
    for(let i=0;i<state.mask.length;i++){
      const a = state.mask[i]? 70:0;
      const j=i*4; m.data[j]=236;m.data[j+1]=122;m.data[j+2]=133;m.data[j+3]=a;
    }
    ectx.putImageData(m,0,0);
  }
  ectx.restore();

  imgData = ectx.getImageData(0,0,editCanvas.width,editCanvas.height);
}
window.addEventListener('resize', fitAndDraw);

fileInput.addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  const bmp = await createImageBitmap(await f.arrayBuffer().then(b=>new Blob([b])));
  setImage(bmp);
  state.zoom=1; state.panX=0; state.panY=0;
  fitAndDraw();
});

$('#auto').addEventListener('click', async ()=>{
  if(!state.img) return;
  await autoMask(imgData||ectx.getImageData(0,0,editCanvas.width,editCanvas.height));
  fitAndDraw();
  // initial palette
  buildPalette(ectx.getImageData(0,0,editCanvas.width,editCanvas.height), +$('#kColors').value || 6);
  document.getElementById('palette').hidden=false;
  window.dispatchEvent(new CustomEvent('palette:ready'));
});

// zoom + pan (desktop + touch)
$('#zoomIn').onclick=()=>{state.zoom=Math.min(6,state.zoom*1.2); fitAndDraw(); $('#zoomPct').textContent=((state.zoom*100)|0)+'%';}
$('#zoomOut').onclick=()=>{state.zoom=Math.max(0.2,state.zoom/1.2); fitAndDraw(); $('#zoomPct').textContent=((state.zoom*100)|0)+'%';}

editCanvas.addEventListener('pointerdown', e=>{
  if(e.altKey){ isPanning=true; startX=e.clientX-state.panX; startY=e.clientY-state.panY; editCanvas.setPointerCapture(e.pointerId); return; }
});
editCanvas.addEventListener('pointermove', e=>{
  if(isPanning){ state.panX=e.clientX-startX; state.panY=e.clientY-startY; fitAndDraw(); }
});
editCanvas.addEventListener('pointerup', ()=>{ isPanning=false; });

// Lock page scroll while interacting
['touchstart','touchmove','wheel'].forEach(ev=>{
  editCanvas.addEventListener(ev, e=>{ e.preventDefault(); }, {passive:false});
});

// Expose canvas utilities to drawing script
export function getEditContext(){ return {canvas:editCanvas, ctx:ectx}; }
export function redraw(){ fitAndDraw(); }