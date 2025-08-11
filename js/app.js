import { writeDST } from './dst.js';

const $ = (s)=>document.querySelector(s);
const els = {
  // core
  fileInput: $('#fileInput'),
  preview: $('#preview'),
  log: $('#log'),
  // draw
  tabs: document.querySelectorAll('.tab'),
  drawCanvas: $('#drawCanvas'),
  drawClear: $('#drawClear'),
  brushSize: $('#brushSize'),
  // options
  toggleOptions: $('#toggleOptions'),
  optionsPanel: $('#optionsPanel'),
  preset: $('#preset'),
  hoop: $('#hoop'),
  hoopW: $('#hoopW'),
  hoopH: $('#hoopH'),
  customHoopFields: $('#customHoopFields'),
  maxColors: $('#maxColors'),
  fillAngle: $('#fillAngle'),
  density: $('#density'),
  autoColors: $('#autoColors'),
  autoEmb: $('#autoEmb'),
  removeBg: $('#removeBg'),
  outline: $('#outline'),
  // actions
  btnProcess: $('#btnProcess'),
  btnDownloadDST: $('#btnDownloadDST'),
  btnDownloadPalette: $('#btnDownloadPalette'),
  brotherDialog: $('#brotherDialog'),
  btnBrotherTips: $('#btnBrotherTips'),
};

function log(message, level='info'){
  const line = document.createElement('div');
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${message}`;
  line.className = level==='ok' ? 'ok' : level==='warn' ? 'warn' : level==='err' ? 'err' : '';
  els.log.prepend(line);
}

/* ---------- state ---------- */
const state = { srcImage:null, lastResult:null, hoopMM:{w:130,h:180}, busy:false };
const worker = new Worker('./js/worker.js', {type:'module'});
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
function postToWorker(payload){ worker.postMessage(payload, payload.transfer || []); }

/* ---------- Tabs (Draw tab content only when active) ---------- */
els.tabs.forEach(btn=>{
  btn.addEventListener('click',()=>{
    els.tabs.forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected','true');
    document.querySelectorAll('.tab-body').forEach(b=>b.classList.remove('active'));
    const t = document.getElementById(`tab-${btn.dataset.tab}`);
    t.classList.add('active');
    // a11y
    document.getElementById('tab-upload').setAttribute('aria-hidden', btn.dataset.tab!=='upload');
    document.getElementById('tab-draw').setAttribute('aria-hidden', btn.dataset.tab!=='draw');
    syncProcessEnabled();
  });
});

/* ---------- Options show/hide ---------- */
els.toggleOptions.addEventListener('change', ()=>{
  const show = els.toggleOptions.checked;
  els.optionsPanel.classList.toggle('hidden', !show);
  els.optionsPanel.setAttribute('aria-hidden', (!show).toString());
});

/* ---------- Preset & hoop ---------- */
els.preset.addEventListener('change',()=>{
  setHoopPreset(els.preset.value==='brother-se2000' ? '130x180' : '100x100');
});
function setHoopPreset(val){ els.hoop.value = val; els.hoop.dispatchEvent(new Event('change')); }
els.hoop.addEventListener('change', ()=>{
  if(els.hoop.value==='custom'){
    els.customHoopFields.classList.remove('hidden');
  }else{
    els.customHoopFields.classList.add('hidden');
    const [w,h] = els.hoop.value.split('x').map(Number);
    state.hoopMM = {w,h};
  }
});
['hoopW','hoopH'].forEach(id=> els[id]?.addEventListener('input', ()=>{
  state.hoopMM = {w:Number(els.hoopW.value||130), h:Number(els.hoopH.value||180)};
}));

/* ---------- Upload UX (drag & drop supported) ---------- */
const dz = document.getElementById('dz');
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.add('dz-on'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e=>{ dz.classList.remove('dz-on'); }));
dz.addEventListener('drop', e=>{
  e.preventDefault();
  const file = e.dataTransfer.files?.[0]; if(file) loadFile(file);
});
els.fileInput.addEventListener('change', e=>{
  const file = e.target.files?.[0]; if(file) loadFile(file);
});
async function loadFile(file){
  try{
    log(`Loaded: ${file.name} (${Math.round(file.size/1024)} KB)`);
    const bmp = await createImageBitmap(file);
    state.srcImage = bmp; syncProcessEnabled(); drawImageQuick(bmp);
  }catch(err){ log(`Load failed: ${String(err)}`,'err'); }
}

/* ---------- Draw tools (only when tab is active) ---------- */
const dctx = els.drawCanvas?.getContext('2d', {willReadFrequently:true});
let drawing=false;
function setBrush(){ if(!dctx) return; dctx.lineCap='round'; dctx.lineJoin='round'; dctx.strokeStyle='#333'; dctx.lineWidth=Number(els.brushSize.value); }
if(dctx){ setBrush(); els.brushSize.addEventListener('input', setBrush); }
function canvasPos(e){ const r=els.drawCanvas.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x:x*(els.drawCanvas.width/r.width), y:y*(els.drawCanvas.height/r.height)}; }
function drawLine(e){ if(!drawing) return; const {x,y}=canvasPos(e); dctx.lineTo(x,y); dctx.stroke(); e.preventDefault(); }
['mousedown','touchstart'].forEach(v=>els.drawCanvas?.addEventListener(v,(e)=>{ drawing=true; const {x,y}=canvasPos(e); dctx.beginPath(); dctx.moveTo(x,y); drawLine(e); }));
['mousemove','touchmove'].forEach(v=>els.drawCanvas?.addEventListener(v, drawLine));
['mouseup','mouseleave','touchend','touchcancel'].forEach(v=>els.drawCanvas?.addEventListener(v,()=>{ if(!drawing) return; drawing=false; cacheCanvasAsImage(); }));
els.drawClear?.addEventListener('click',()=>{ dctx.clearRect(0,0,els.drawCanvas.width,els.drawCanvas.height); cacheCanvasAsImage(); });
function cacheCanvasAsImage(){ els.drawCanvas.toBlob(async (b)=>{ if(!b) return; const bmp=await createImageBitmap(b); state.srcImage=bmp; syncProcessEnabled(); drawImageQuick(bmp); }); }

/* ---------- Preview ---------- */
const pctx = els.preview.getContext('2d', {alpha:false, desynchronized:true});
function drawImageQuick(bitmap){
  const c = els.preview;
  const s = Math.min(c.width/bitmap.width, c.height/bitmap.height);
  const w = Math.floor(bitmap.width*s), h = Math.floor(bitmap.height*s);
  pctx.fillStyle = '#0c1221'; pctx.fillRect(0,0,c.width,c.height);
  pctx.drawImage(bitmap, (c.width-w)>>1, (c.height-h)>>1, w, h);
}
function drawPreview({width,height,imageData}){
  const c = els.preview; c.width = width; c.height = height;
  pctx.putImageData(new ImageData(imageData,width,height),0,0);
}

/* ---------- Enable/Busy ---------- */
function syncProcessEnabled(){ els.btnProcess.disabled = !state.srcImage || state.busy; }
function setBusy(b){ state.busy=b; els.btnProcess.disabled=b||!state.srcImage; document.body.style.cursor=b?'progress':'auto'; }

/* ---------- Process ---------- */
els.btnProcess.addEventListener('click', ()=>{
  if(!state.srcImage) return;
  setBusy(true); els.btnDownloadDST.disabled = true; els.btnDownloadPalette.disabled = true;

  const hoop = (els.hoop.value==='custom')
    ? {w:Number(els.hoopW.value||130), h:Number(els.hoopH.value||180)}
    : (()=>{ const [w,h]=els.hoop.value.split('x').map(Number); return {w,h}; })();

  postToWorker({
    cmd:'process',
    options:{
      hoopMM: hoop,
      maxColors: clampInt(els.maxColors?.value||4,2,6),
      fillAngle: clampInt(els.fillAngle?.value||45,0,180),
      densityMM: clampNumber(els.density?.value||0.4,0.25,1.5),
      autoColors: els.autoColors?.checked ?? true,
      autoEmb: els.autoEmb?.checked ?? true,
      removeBg: els.removeBg?.checked ?? true,
      outline: els.outline?.checked ?? true,
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1)
    },
    bitmap: state.srcImage
  }, {transfer:[state.srcImage]});

  state.srcImage = null; syncProcessEnabled();
});
function clampInt(v,a,b){ v=Number(v|0); return Math.max(a,Math.min(b,v)); }
function clampNumber(v,a,b){ v=Number(v); return Math.max(a,Math.min(b,v)); }

/* ---------- Downloads ---------- */
els.btnDownloadDST.addEventListener('click', ()=>{
  if(!state.lastResult) return;
  const {stitches, hoopMM} = state.lastResult;
  const bytes = writeDST(stitches, hoopMM, {insertColorStops:true});
  const blob = new Blob([bytes], {type:'application/octet-stream'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='loomabelle.dst'; a.click(); URL.revokeObjectURL(a.href);
});
els.btnDownloadPalette.addEventListener('click', ()=>{
  if(!state.lastResult) return;
  const {palette}=state.lastResult;
  const text = palette.map((c,i)=>`${i+1}\t#${hex(c[0])}${hex(c[1])}${hex(c[2])}`).join('\n')+'\n';
  const b = new Blob([text], {type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='palette.txt'; a.click(); URL.revokeObjectURL(a.href);
});
function hex(n){ return n.toString(16).padStart(2,'0'); }

/* ---------- Brother tips ---------- */
els.btnBrotherTips.addEventListener('click', ()=> els.brotherDialog.showModal());

log('Ready. Upload or switch to Draw, then Process.','ok');