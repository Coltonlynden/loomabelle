import {state, getImageData, buildPalette, hatchStitches, writeSVG, writeDST} from './processing.js';

const $ = s=>document.querySelector(s);
const pCanvas = $('#previewCanvas');
const pctx = pCanvas.getContext('2d',{willReadFrequently:true});

const kSlider = $('#kColors'), kOut = $('#kOut');
kSlider.oninput = ()=>{ kOut.textContent=kSlider.value; };

let stitches=[];

function drawHoopBG(){
  // grid for scale
  pctx.clearRect(0,0,pCanvas.width,pCanvas.height);
  const W=pCanvas.width,H=pCanvas.height;
  pctx.fillStyle='#fff'; pctx.fillRect(20,20,W-40,H-40);
  pctx.strokeStyle='#eadbd0'; pctx.lineWidth=1;
  for(let y=40;y<H-40;y+=20){ pctx.beginPath(); pctx.moveTo(40,y); pctx.lineTo(W-40,y); pctx.stroke(); }
  for(let x=40;x<W-40;x+=20){ pctx.beginPath(); pctx.moveTo(x,40); pctx.lineTo(x,H-40); pctx.stroke(); }
}

function rebuildPalette(){
  const ec = document.getElementById('editCanvas');
  const id = ec.getContext('2d').getImageData(0,0,ec.width,ec.height);
  buildPalette(id, +kSlider.value);
  const sw = $('#swatches');
  sw.innerHTML='';
  state.palette.forEach((rgb,i)=>{
    const b=document.createElement('button');
    b.style.background=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    b.title=`#${rgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
    b.onclick=()=>{ state.enabled[i]=!state.enabled[i]; b.classList.toggle('off', !state.enabled[i]); };
    sw.appendChild(b);
  });
  document.getElementById('palette').hidden=false;
}
$('#recompute').onclick=rebuildPalette;
window.addEventListener('palette:ready', rebuildPalette);

// Generate
$('#make').onclick=()=>{
  if(!state.img || !state.mask) return;
  const ec = document.getElementById('editCanvas');
  const W=ec.width, H=ec.height;
  drawHoopBG();
  // optional direction overlay
  if($('#dirOverlay').checked){
    const a = +document.getElementById('angle').value;
    pctx.save();
    pctx.globalAlpha=.12; pctx.translate(20,20);
    pctx.fillStyle='#333';
    const step=24;
    for(let y=0;y<H;y+=step){
      pctx.save(); pctx.translate(0,y); pctx.rotate(a*Math.PI/180);
      pctx.fillRect(-W, -1, W*2, 2);
      pctx.restore();
    }
    pctx.restore();
  }
  // stitches
  const spacingMM = +document.getElementById('spacing').value;
  // convert mm to px inside preview by simple scale assumption (pCanvas draws 1:1 with edit canvas inside frame)
  const spacingPx = Math.max(1, Math.round(spacingMM * 3)); // approx 3 px per mm
  const ang = +document.getElementById('angle').value;
  stitches = hatchStitches(state.mask, W, H, spacingPx, ang, state.dirFld);

  // draw simulation
  pctx.save(); pctx.translate(20,20);
  pctx.strokeStyle='#3b3b3b'; pctx.lineWidth=1;
  pctx.beginPath();
  for(let i=0;i<stitches.length;i++){
    const [x,y]=stitches[i];
    if(i===0) pctx.moveTo(x,y); else pctx.lineTo(x,y);
  }
  pctx.stroke();
  pctx.restore();
};

// downloads
$('#dlPNG').onclick=()=>{
  const a=document.createElement('a');
  a.download='preview.png';
  a.href=pCanvas.toDataURL('image/png');
  a.click();
};
$('#dlSVG').onclick=()=>{
  const ec = document.getElementById('editCanvas');
  const svg = writeSVG(stitches, ec.width, ec.height);
  const a=document.createElement('a'); a.download='stitches.svg';
  a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})); a.click();
};
$('#dlJSON').onclick=()=>{
  const a=document.createElement('a'); a.download='stitches.json';
  a.href=URL.createObjectURL(new Blob([JSON.stringify({stitches}),{type:'application/json'}])); a.click();
};
$('#dlDST').onclick=()=>{
  const bin = writeDST(stitches);
  const a=document.createElement('a'); a.download='stitches.dst';
  a.href=URL.createObjectURL(new Blob([bin],{type:'application/octet-stream'})); a.click();
};