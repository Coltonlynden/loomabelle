// v1 — Draw / highlight subject

const S = window.Looma;
const { getWorker, showTab } = window.LoomaAPI;

const bg = document.getElementById('lb-draw-bg');
const cnv = document.getElementById('lb-draw');

let tool = 'pen';
let size = 18;
let drawing = false, lx=0, ly=0;

function pointerXY(ev){
  const r = cnv.getBoundingClientRect();
  const px = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  const py = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
  return { x: px * (cnv.width / r.width), y: py * (cnv.height / r.height) };
}

function begin(ev){
  if (!S.img) return;
  drawing = true;
  document.body.style.overscrollBehavior = 'none';
  const {x,y} = pointerXY(ev); lx=x; ly=y;
  drawDot(x,y);
  ev.preventDefault();
}
function move(ev){
  if (!drawing) return;
  const {x,y} = pointerXY(ev);
  const c = cnv.getContext('2d');
  c.lineWidth = size;
  c.lineCap = 'round';
  c.globalCompositeOperation = (tool==='eraser') ? 'destination-out' : 'source-over';
  c.strokeStyle = (tool==='eraser') ? '#000' : 'rgba(0,0,0,0.95)';
  c.beginPath(); c.moveTo(lx,ly); c.lineTo(x,y); c.stroke();
  lx=x; ly=y; ev.preventDefault();
}
function end(){ drawing=false; document.body.style.overscrollBehavior='auto'; }
function drawDot(x,y){
  const c = cnv.getContext('2d');
  c.globalCompositeOperation = (tool==='eraser') ? 'destination-out' : 'source-over';
  c.fillStyle = 'rgba(0,0,0,0.95)';
  c.beginPath(); c.arc(x,y,size/2,0,Math.PI*2); c.fill();
}

cnv.addEventListener('mousedown', begin);
window.addEventListener('mouseup', end);
cnv.addEventListener('mousemove', move);
cnv.addEventListener('touchstart', begin, {passive:false});
window.addEventListener('touchend', end);
cnv.addEventListener('touchmove', move, {passive:false});

document.getElementById('tool-pen').addEventListener('click', ()=>{
  tool='pen';
  document.getElementById('tool-pen').classList.add('active');
  document.getElementById('tool-eraser').classList.remove('active');
});
document.getElementById('tool-eraser').addEventListener('click', ()=>{
  tool='eraser';
  document.getElementById('tool-eraser').classList.add('active');
  document.getElementById('tool-pen').classList.remove('active');
});
document.getElementById('btn-clear').addEventListener('click', ()=>{
  cnv.getContext('2d').clearRect(0,0,cnv.width,cnv.height);
});

document.getElementById('btn-process-selection').addEventListener('click', async ()=>{
  if (!S.img) return;
  // collect mask
  const id = cnv.getContext('2d').getImageData(0,0,cnv.width,cnv.height).data;
  const mask = new Uint8Array(cnv.width*cnv.height);
  for(let i=0;i<mask.length;i++){ mask[i] = id[i*4+3] > 8 ? 1 : 0; }

  const worker = getWorker();
  runProgress(true, 'Processing selection…');

  const msg = {
    type:'process',
    image: S.work.getContext('2d').getImageData(0,0,S.work.width,S.work.height),
    mask, options: S.options
  };
  worker.onmessage = (e)=>{
    const m = e.data;
    if (m.type==='progress'){ updateProgress(m.value, m.note); }
    if (m.type==='result'){
      S.previewImage = m.preview;
      S.stitches = m.dst || null;
      paintPreview();
      runProgress(false);
      // go back to upload/preview tab
      showTab('upload');
      // enable exports
      document.getElementById('btn-png').disabled = false;
      document.getElementById('btn-dst').disabled = !S.stitches;
      document.getElementById('btn-exp').disabled = true;
    }
  };
  worker.postMessage(msg, [msg.image.data.buffer, mask.buffer]);
});

/* palette swatches */
const THREADS = [
  '#ef4444','#f472b6','#a78bfa','#60a5fa','#38bdf8','#22d3ee',
  '#34d399','#a3e635','#facc15','#fb923c','#f87171','#16a34a'
];
const palWrap = document.getElementById('palette');
THREADS.forEach(c=>{
  const b = document.createElement('button');
  b.style.background = c;
  b.title = c;
  palWrap.appendChild(b);
});
/* util shared with preview */
function paintPreview(){
  const host = document.getElementById('preview-host');
  const cv = document.getElementById('lb-preview');
  host.classList.remove('hidden');
  cv.width = S.previewImage.width;
  cv.height = S.previewImage.height;
  const ctx = cv.getContext('2d');
  const id = new ImageData(new Uint8ClampedArray(S.previewImage.data), S.previewImage.width, S.previewImage.height);
  ctx.putImageData(id,0,0);
}

function runProgress(on, note){
  const box = document.getElementById('progress');
  const bar = document.getElementById('pbar');
  const txt = document.getElementById('ptext');
  if (on){ box.classList.remove('hidden'); bar.style.width='6%'; txt.textContent = note||''; }
  else   { box.classList.add('hidden');  bar.style.width='0'; txt.textContent=''; }
}
function updateProgress(v,note){
  const bar = document.getElementById('pbar');
  const txt = document.getElementById('ptext');
  bar.style.width = Math.max(6, Math.min(100, v)) + '%';
  if (note) txt.textContent = note;
}

/* expose */
window.LoomaDraw = { paintPreview, runProgress, updateProgress };
