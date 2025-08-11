import { $ } from './ui.js';

let drawCv, dctx;

export function initDrawTab(onUse){
  drawCv = $('#draw'); dctx = drawCv.getContext('2d', {willReadFrequently:true});
  // init canvas
  $('#dClear').onclick=()=>{ dctx.fillStyle='#fff'; dctx.fillRect(0,0,drawCv.width,drawCv.height); dctx.fillStyle='#000'; };
  $('#dClear').click();
  $('#dBrush').oninput=e=>{ dctx.lineWidth=+e.target.value };
  $('#dColor').oninput=e=>{ dctx.strokeStyle=e.target.value };
  dctx.lineCap='round'; dctx.lineJoin='round'; dctx.lineWidth=10; dctx.strokeStyle='#000';

  let drawing=false;
  const dXY = e => { const r=drawCv.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return [x,y]; };
  drawCv.addEventListener('mousedown',e=>{drawing=true;const [x,y]=dXY(e);dctx.beginPath();dctx.moveTo(x,y)});
  drawCv.addEventListener('mousemove',e=>{if(!drawing)return;const [x,y]=dXY(e);dctx.lineTo(x,y);dctx.stroke()});
  window.addEventListener('mouseup',()=>drawing=false);
  drawCv.addEventListener('touchstart',e=>{drawing=true;const [x,y]=dXY(e);dctx.beginPath();dctx.moveTo(x,y);e.preventDefault()},{passive:false});
  drawCv.addEventListener('touchmove',e=>{if(!drawing)return;const [x,y]=dXY(e);dctx.lineTo(x,y);dctx.stroke();e.preventDefault()},{passive:false});
  window.addEventListener('touchend',()=>drawing=false);

  $('#dUse').onclick=()=>onUse && onUse();
}

export function getDrawCanvas(){ return drawCv; }
