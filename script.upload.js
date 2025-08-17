// v1 — Upload + global state + tabs

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

window.Looma = window.Looma || {
  img: null,           // ImageBitmap
  work: document.createElement('canvas'),
  mask: document.createElement('canvas'),
  options: { palette:true, outline:true, density:0.45, addFills:true, noSubject:false },
  stitches: null,      // Uint8Array (DST)
  previewImage: null,  // ImageData
  worker: null,
};

const state = window.Looma;

const year = $('#year'); if (year) year.textContent = new Date().getFullYear();

/* smooth scroll */
$$('[data-scroll]').forEach(b=>{
  b.addEventListener('click', e=>{
    const t = $(b.getAttribute('data-scroll'));
    if (t) t.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

/* tabs */
const tabUpload = $('#tab-upload');
const tabDraw   = $('#tab-draw');
const panels = $$('.panel');

function showTab(name){
  panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===name));
  tabUpload.classList.toggle('active', name==='upload');
  tabDraw.classList.toggle('active', name==='draw');
}
tabUpload.addEventListener('click', ()=>showTab('upload'));
tabDraw  .addEventListener('click', ()=>showTab('draw'));

/* options → state */
$('#opt-palette').addEventListener('change', e=> state.options.palette = e.target.checked);
$('#opt-outline').addEventListener('change', e=> state.options.outline = e.target.checked);
$('#opt-density').addEventListener('input',  e=> state.options.density = +e.target.value);
$('#opt-nosubject').addEventListener('change', e=> state.options.noSubject = e.target.checked);

/* worker */
function getWorker(){
  if (!state.worker){
    state.worker = new Worker('processing.js', { type:'module' });
  }
  return state.worker;
}

/* canvas helpers */
function fitSize(w,h,maxW=1600,maxH=1600){
  const r = Math.min(maxW/w, maxH/h, 1);
  return { W:Math.round(w*r), H:Math.round(h*r) };
}
function drawFit(src, dst){
  const d = dst.getContext('2d', { willReadFrequently:true });
  d.clearRect(0,0,dst.width,dst.height);
  const scale = Math.min(dst.width/src.width, dst.height/src.height);
  const w = Math.round(src.width*scale), h = Math.round(src.height*scale);
  const x = ((dst.width - w) >> 1), y = ((dst.height - h) >> 1);
  d.drawImage(src, x, y, w, h);
}

/* upload */
const input = $('#lb-file');
const previewHost = $('#preview-host');
const preview = $('#lb-preview');

input.addEventListener('change', async (e)=>{
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  const url = URL.createObjectURL(f);
  try{
    const img = await createImageBitmap(await fetch(url).then(r=>r.blob()));
    const { W,H } = fitSize(img.width, img.height, 1600, 1600);

    state.work.width = W; state.work.height = H;
    state.mask.width = W; state.mask.height = H;

    const ctx = state.work.getContext('2d', { willReadFrequently:true });
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(img, 0, 0, W, H);
    state.img = img;

    // show immediate preview of original image
    previewHost.classList.remove('hidden');
    preview.width = 1000; preview.height = 560;
    drawFit(state.work, preview);

    // mirror into draw panel bg
    const bg = $('#lb-draw-bg'); bg.width = W; bg.height = H;
    bg.getContext('2d').drawImage(state.work,0,0);
    const overlay = $('#lb-draw'); overlay.width = W; overlay.height = H;
    overlay.getContext('2d').clearRect(0,0,W,H);

    // enable controls
    $('#btn-process').disabled = false;
    $('#btn-highlight').disabled = false;
    $('#btn-png').disabled = true;
    $('#btn-dst').disabled = true;
    $('#btn-exp').disabled = true;
  } finally {
    URL.revokeObjectURL(url);
  }
});

/* expose minimal API for other modules */
window.LoomaAPI = {
  showTab,
  drawFit,
  getWorker
};
