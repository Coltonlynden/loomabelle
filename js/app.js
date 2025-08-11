
/* -------------------------------------------------------
   Loomabelle — UI, state, and worker orchestration
   ----------------------------------------------------- */

import { writeDST } from './dst.js';

const els = {
  fileInput: document.getElementById('fileInput'),
  drawCanvas: document.getElementById('drawCanvas'),
  drawClear: document.getElementById('drawClear'),
  brushSize: document.getElementById('brushSize'),
  tabs: document.querySelectorAll('.tab'),
  tabBodies: {
    upload: document.getElementById('tab-upload'),
    draw: document.getElementById('tab-draw')
  },
  hoop: document.getElementById('hoop'),
  hoopW: document.getElementById('hoopW'),
  hoopH: document.getElementById('hoopH'),
  customHoopFields: document.getElementById('customHoopFields'),
  maxColors: document.getElementById('maxColors'),
  fillAngle: document.getElementById('fillAngle'),
  density: document.getElementById('density'),
  autoColors: document.getElementById('autoColors'),
  autoEmb: document.getElementById('autoEmb'),
  removeBg: document.getElementById('removeBg'),
  outline: document.getElementById('outline'),
  refine: document.getElementById('refine'),
  btnProcess: document.getElementById('btnProcess'),
  btnDownloadDST: document.getElementById('btnDownloadDST'),
  btnDownloadPalette: document.getElementById('btnDownloadPalette'),
  preview: document.getElementById('preview'),
  log: document.getElementById('log')
};

/* -------- logging -------- */
function log(message, level='info'){
  const line = document.createElement('div');
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${message}`;
  line.className = level==='ok' ? 'ok' : level==='warn' ? 'warn' : level==='err' ? 'err' : '';
  els.log.prepend(line);
}

/* -------- state -------- */
const state = {
  mode: 'upload',
  srcImage: null,          // ImageBitmap or null
  srcFromCanvas: false,
  lastResult: null,        // {stitches, palette, preview}
  hoopMM: {w:100,h:100},
  busy: false
};

const worker = new Worker('./js/worker.js', {type:'module'});

/* Worker message handling */
worker.onmessage = (e)=>{
  const {type, data} = e.data;
  if(type==='log'){ log(data.msg, data.level); return; }
  if(type==='preview'){ drawPreview(data); return; }
  if(type==='result'){
    state.lastResult = data;
    log(`Done. ${data.stitches.length} stitches in ${data.blocks} color block(s).`, 'ok');
    els.btnDownloadDST.disabled = false;
    els.btnDownloadPalette.disabled = false;
    setBusy(false);
  }
};

function postToWorker(payload){
  worker.postMessage(payload, payload.transfer || []);
}

/* ---- Tabs ---- */
els.tabs.forEach(btn=>{
  btn.addEventListener('click',()=>{
    els.tabs.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    state.mode = tab;
    document.querySelectorAll('.tab-body').forEach(b=>b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    syncProcessEnabled();
  });
});

/* ---- Hoop ---- */
els.hoop.addEventListener('change', ()=>{
  if(els.hoop.value==='custom'){
    els.customHoopFields.classList.remove('hidden');
  }else{
    els.customHoopFields.classList.add('hidden');
    const [w,h] = els.hoop.value.split('x').map(Number);
    state.hoopMM = {w,h};
  }
});
['hoopW','hoopH'].forEach(id=>{
  els[id].addEventListener('input', ()=>{
    state.hoopMM = {w: Number(els.hoopW.value||100), h: Number(els.hoopH.value||100)};
  });
});

/* ---- Upload ---- */
els.fileInput.addEventListener('change', async (ev)=>{
  const file = ev.target.files?.[0];
  if(!file){ syncProcessEnabled(); return; }
  try{
    log(`Loaded file: ${file.name} (${Math.round(file.size/1024)} KB)`);
    const bitmap = await createImageBitmap(file);
    state.srcImage = bitmap;
    state.srcFromCanvas = false;
    syncProcessEnabled();
    drawImageQuick(bitmap);
  }catch(err){
    log(`Failed to load image: ${String(err)}`, 'err');
  }
});

/* ---- Draw ---- */
const dctx = els.drawCanvas.getContext('2d', {willReadFrequently:true});
let drawing = false;
function setBrush(){
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  dctx.strokeStyle = '#333';
  dctx.lineWidth = Number(els.brushSize.value);
}
setBrush();
els.brushSize.addEventListener('input', setBrush);
function canvasPos(e){
  const r = els.drawCanvas.getBoundingClientRect();
  const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left;
  const y = (e.touches? e.touches[0].clientY : e.clientY) - r.top;
  return {x: x*(els.drawCanvas.width/r.width), y: y*(els.drawCanvas.height/r.height)};
}
function drawLine(e){
  if(!drawing) return;
  const {x,y} = canvasPos(e);
  dctx.lineTo(x,y); dctx.stroke();
  e.preventDefault();
}
['mousedown','touchstart'].forEach(ev=>els.drawCanvas.addEventListener(ev,(e)=>{
  drawing = true; const {x,y}=canvasPos(e); dctx.beginPath(); dctx.moveTo(x,y); drawLine(e);
}));
['mousemove','touchmove'].forEach(ev=>els.drawCanvas.addEventListener(ev, drawLine));
['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>els.drawCanvas.addEventListener(ev,()=>{
  if(!drawing) return; drawing=false; cacheCanvasAsImage();
}));
els.drawClear.addEventListener('click',()=>{
  dctx.clearRect(0,0,els.drawCanvas.width,els.drawCanvas.height);
  cacheCanvasAsImage();
});
function cacheCanvasAsImage(){
  els.drawCanvas.toBlob(async (blob)=>{
    if(!blob) return;
    const bmp = await createImageBitmap(blob);
    state.srcImage = bmp; state.srcFromCanvas = true;
    syncProcessEnabled(); drawImageQuick(bmp);
  });
}

/* ---- Preview ---- */
const pctx = els.preview.getContext('2d', {alpha:false, desynchronized:true});
function drawImageQuick(bitmap){
  const c = els.preview;
  const scale = Math.min(c.width/bitmap.width, c.height/bitmap.height);
  const w = Math.floor(bitmap.width*scale), h = Math.floor(bitmap.height*scale);
  pctx.fillStyle = '#0c1221'; pctx.fillRect(0,0,c.width,c.height);
  pctx.drawImage(bitmap, (c.width-w)>>1, (c.height-h)>>1, w, h);
}
function drawPreview({width,height,imageData}){
  const c = els.preview;
  c.width = width; c.height = height;
  pctx.putImageData(new ImageData(imageData, width, height), 0, 0);
}

/* ---- Enable/disable Process ---- */
function syncProcessEnabled(){
  els.btnProcess.disabled = !state.srcImage || state.busy;
}

/* ---- Busy UI ---- */
function setBusy(b){
  state.busy = b;
  els.btnProcess.disabled = b || !state.srcImage;
  document.body.style.cursor = b? 'progress':'auto';
}

/* ---- Process ---- */
els.btnProcess.addEventListener('click', async ()=>{
  if(!state.srcImage) return;
  setBusy(true); els.btnDownloadDST.disabled = true; els.btnDownloadPalette.disabled = true;

  const hoop = (els.hoop.value==='custom')
    ? {w: Number(els.hoopW.value||100), h: Number(els.hoopH.value||100)}
    : (()=>{ const [w,h]=els.hoop.value.split('x').map(Number); return {w,h}; })();

  postToWorker({
    cmd:'process',
    options:{
      hoopMM: hoop,
      maxColors: clampInt(els.maxColors.value,2,6),
      fillAngle: clampInt(els.fillAngle.value,0,180),
      densityMM: clampNumber(els.density.value,0.25,1.5),
      autoColors: els.autoColors.checked,
      autoEmb: els.autoEmb.checked,
      removeBg: els.removeBg.checked,
      outline: els.outline.checked,
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1)
    },
    bitmap: state.srcImage
  }, {transfer: [state.srcImage]});

  state.srcImage = null;
  syncProcessEnabled();
});

function clampInt(v, a, b){ v=Number(v|0); return Math.max(a,Math.min(b,v)); }
function clampNumber(v, a, b){ v=Number(v); return Math.max(a,Math.min(b,v)); }

/* ---- Downloads ---- */
els.btnDownloadDST.addEventListener('click', ()=>{
  if(!state.lastResult) return;
  const {stitches, hoopMM} = state.lastResult;
  const bytes = writeDST(stitches, hoopMM);
  const blob = new Blob([bytes], {type:'application/octet-stream'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'loomabelle.dst'; a.click();
  URL.revokeObjectURL(a.href);
});
els.btnDownloadPalette.addEventListener('click', ()=>{
  if(!state.lastResult) return;
  const {palette} = state.lastResult;
  const text = palette.map((c,i)=>`${i+1}\t#${hex(c[0])}${hex(c[1])}${hex(c[2])}`).join('\n')+'\n';
  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palette.txt'; a.click();
  URL.revokeObjectURL(a.href);
});
function hex(n){ return n.toString(16).padStart(2,'0'); }

/* ---- Start ---- */
log('Ready. Upload or draw to begin.', 'ok');