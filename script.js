/* Loomabelle – client logic (v46)
   - Keeps visuals untouched
   - Tabs, upload, preview, draw/trace, highlight subject
   - Preview hidden until an image is chosen
   - iOS-safe sizing (no growing canvases)
*/

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- elements ---------- */
const el = {
  year: byId('year'),

  // tabs
  btnTabUpload: byId('btnTabUpload'),
  btnTabDraw: byId('btnTabDraw'),
  panelUpload: byId('panelUpload'),
  panelDraw: byId('panelDraw'),

  // upload / options
  drop: byId('drop'),
  file: byId('file'),
  optPalette: byId('optPalette'),
  optOutline: byId('optOutline'),
  optDensity: byId('optDensity'),

  // preview
  cardPreview: byId('cardPreview'),
  previewHost: byId('previewHost'),
  preview: byId('preview'),
  btnProcess: byId('btnProcess'),
  btnMask: byId('btnMask'),
  optNoSubject: byId('optNoSubject'),

  // draw
  drawHost: byId('drawHost'),
  draw: byId('draw'),
  mask: byId('mask'),
  toolPen: byId('toolPen'),
  toolErase: byId('toolErase'),
  btnProcessMask: byId('btnProcessMask'),

  // exports (wired later)
  btnDST: byId('btnDST'),
  btnEXP: byId('btnEXP'),
  btnPES: byId('btnPES'),
  btnJEF: byId('btnJEF'),

  // palette
  swatches: byId('swatches'),
};

if (el.year) el.year.textContent = new Date().getFullYear();

/* ---------- state ---------- */
const state = {
  img: null,           // HTMLImageElement
  imgW: 0, imgH: 0,
  drawTool: 'pen',
  maskActive: false,   // highlight subject mode
  palette: [
    '#ff6b6b','#f472b6','#c4b5fd','#93c5fd','#60a5fa','#38bdf8',
    '#34d399','#10b981','#fcd34d','#f59e0b','#fb7185','#86efac'
  ]
};

/* ---------- layout sizing ---------- */
function fitCanvasToHost(canvas, host){
  const r = host.getBoundingClientRect();
  // CSS controls final size; we only set intrinsic to maintain aspect clarity
  const W = Math.max(320, Math.floor(r.width));
  const H = Math.max(180, Math.floor(r.height));
  if (canvas.width !== W || canvas.height !== H){
    canvas.width = W; canvas.height = H;
  }
}

/* ---------- tabs ---------- */
function showTab(which){
  const isUpload = which === 'upload';
  el.btnTabUpload.classList.toggle('active', isUpload);
  el.btnTabDraw.classList.toggle('active', !isUpload);
  el.panelUpload.classList.toggle('active', isUpload);
  el.panelDraw.classList.toggle('active', !isUpload);
  // keep sticky height steady on iOS
  requestAnimationFrame(()=>window.scrollBy(0,0));
}
el.btnTabUpload?.addEventListener('click', ()=>showTab('upload'));
el.btnTabDraw?.addEventListener('click', ()=>showTab('draw'));

// hero “scroll to” buttons
document.querySelectorAll('[data-scroll]').forEach(b=>{
  b.addEventListener('click', ()=>{
    const t = b.getAttribute('data-scroll');
    if (t) document.querySelector(t)?.scrollIntoView({behavior:'smooth', block:'start'});
    const openTab = b.getAttribute('data-tab');
    if (openTab) showTab(openTab);
  });
});

/* ---------- palette chips ---------- */
function renderSwatches(){
  if (!el.swatches) return;
  el.swatches.innerHTML = '';
  state.palette.forEach(hex=>{
    const d = document.createElement('div');
    d.className = 'chip';
    d.style.background = hex;
    el.swatches.appendChild(d);
  });
}
renderSwatches();

/* ---------- upload ---------- */
function hidePreview(){
  el.previewHost.dataset.empty = '1';
  el.cardPreview.classList.add('hidden');
  const ctx = el.preview.getContext('2d');
  ctx.clearRect(0,0,el.preview.width, el.preview.height);
}
function showPreview(){
  el.previewHost.dataset.empty = '0';
  el.cardPreview.classList.remove('hidden');
}

hidePreview();

el.drop?.addEventListener('dragover', e=>{ e.preventDefault(); });
el.drop?.addEventListener('drop', e=>{
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
el.file?.addEventListener('change', e=>{
  const f = e.target.files?.[0];
  if (f) loadFile(f);
});

async function loadFile(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = ()=>{
    state.img = img;
    state.imgW = img.naturalWidth; state.imgH = img.naturalHeight;
    // set draw background and preview
    drawBackgroundFromImage();
    renderPreviewOriginal();
    showPreview();
    URL.revokeObjectURL(url);
  };
  img.onerror = ()=>URL.revokeObjectURL(url);
  img.src = url;
}

/* ---------- draw / mask ---------- */
let drawing = false, lastX=0, lastY=0;

function pointerPos(ev, host, canvas){
  const r = host.getBoundingClientRect();
  const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  const y = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
  // map to canvas coords
  const sx = x * (canvas.width / r.width);
  const sy = y * (canvas.height / r.height);
  return {x:sx, y:sy};
}

function setTool(t){
  state.drawTool = t;
  el.toolPen.classList.toggle('active', t==='pen');
  el.toolErase.classList.toggle('active', t==='erase');
}
el.toolPen?.addEventListener('click',()=>setTool('pen'));
el.toolErase?.addEventListener('click',()=>setTool('erase'));
setTool('pen');

function ensureCanvases(){
  fitCanvasToHost(el.draw, el.drawHost);
  fitCanvasToHost(el.mask, el.drawHost);
  fitCanvasToHost(el.preview, el.previewHost);
}

function drawBackgroundFromImage(){
  if(!state.img) return;
  ensureCanvases();
  const ctx = el.draw.getContext('2d');
  ctx.clearRect(0,0,el.draw.width, el.draw.height);

  // contain-fit image inside draw canvas
  const cw = el.draw.width, ch = el.draw.height;
  const ir = state.imgW/state.imgH, cr = cw/ch;
  let w,h,x,y;
  if (ir > cr){ w = cw; h = w/ir; x = 0; y = (ch-h)/2; }
  else{ h = ch; w = h*ir; x = (cw-w)/2; y = 0; }
  ctx.globalCompositeOperation='source-over';
  ctx.drawImage(state.img, x,y,w,h);

  // clear any previous mask
  el.mask.getContext('2d').clearRect(0,0,el.mask.width, el.mask.height);
}

function attachDrawHandlers(){
  const host = el.drawHost;
  const onDown = (ev)=>{
    drawing = true;
    const p = pointerPos(ev, host, el.mask);
    lastX=p.x; lastY=p.y;
    ev.preventDefault();
  };
  const onMove = (ev)=>{
    if(!drawing) return;
    const mctx = el.mask.getContext('2d');
    mctx.lineCap='round';
    mctx.lineJoin='round';
    mctx.lineWidth = 18;
    if (state.drawTool==='erase'){
      mctx.globalCompositeOperation='destination-out';
      mctx.strokeStyle='rgba(0,0,0,1)';
    } else {
      mctx.globalCompositeOperation='source-over';
      mctx.strokeStyle='rgba(0,0,0,0.95)'; // dark outline while tracing
    }
    const p = pointerPos(ev, host, el.mask);
    mctx.beginPath(); mctx.moveTo(lastX,lastY); mctx.lineTo(p.x,p.y); mctx.stroke();
    lastX=p.x; lastY=p.y;
    ev.preventDefault();
  };
  const onUp = ()=>{ drawing=false; };

  host.addEventListener('mousedown',onDown);
  window.addEventListener('mouseup',onUp);
  host.addEventListener('mousemove',onMove);
  host.addEventListener('touchstart',onDown,{passive:false});
  window.addEventListener('touchend',onUp,{passive:false});
  host.addEventListener('touchmove',onMove,{passive:false});
}
attachDrawHandlers();

el.btnMask?.addEventListener('click', ()=>{
  // jump to draw tab with image + semi-transparent bg for tracing
  if(!state.img){ alert('Upload a photo first.'); return; }
  showTab('draw');
  state.maskActive = true;
  el.mask.classList.remove('hidden');
  // fade background while tracing
  el.draw.getContext('2d').globalAlpha = 0.5;
  drawBackgroundFromImage();
});

el.btnProcessMask?.addEventListener('click', ()=>{
  // Use user mask to process immediately; return to Upload tab to see preview
  processPhoto(true);
  showTab('upload');
  // reset tracing UI
  el.draw.getContext('2d').globalAlpha = 1;
  el.mask.classList.add('hidden');
  el.mask.getContext('2d').clearRect(0,0,el.mask.width, el.mask.height);
  state.maskActive = false;
});

/* ---------- preview rendering ---------- */

function renderPreviewOriginal(){
  ensureCanvases();
  const ctx = el.preview.getContext('2d');
  ctx.clearRect(0,0,el.preview.width, el.preview.height);
  if (!state.img) return;
  // contain-fit like draw
  const cw = el.preview.width, ch = el.preview.height;
  const ir = state.imgW/state.imgH, cr = cw/ch;
  let w,h,x,y;
  if (ir > cr){ w = cw; h = w/ir; x = 0; y = (ch-h)/2; }
  else{ h = ch; w = h*ir; x = (cw-w)/2; y = 0; }
  ctx.drawImage(state.img, x,y,w,h);
}

/* Simple, fast quantize + outline to mimic “stitched” look */
function processPhoto(useUserMask=false){
  if(!state.img){ alert('Upload a photo first.'); return; }

  ensureCanvases();

  // Draw image into a worker canvas at preview resolution
  const tmp = document.createElement('canvas');
  tmp.width = el.preview.width; tmp.height = el.preview.height;
  const tctx = tmp.getContext('2d', {willReadFrequently:true});

  // fit
  const cw = tmp.width, ch = tmp.height;
  const ir = state.imgW/state.imgH, cr = cw/ch;
  let w,h,x,y;
  if (ir > cr){ w = cw; h = w/ir; x = 0; y = (ch-h)/2; }
  else{ h = ch; w = h*ir; x = (cw-w)/2; y = 0; }
  tctx.drawImage(state.img, x,y,w,h);

  // optional user mask (binary)
  let maskData = null;
  if (useUserMask && !el.optNoSubject.checked){
    const m = document.createElement('canvas'); m.width=cw; m.height=ch;
    const mctx = m.getContext('2d');
    // scale user mask to preview size
    mctx.drawImage(el.mask, 0,0,cw,ch);
    const md = mctx.getImageData(0,0,cw,ch).data;
    maskData = new Uint8Array(cw*ch);
    for(let i=0;i<maskData.length;i++){ maskData[i] = md[i*4+3]>10 ? 1 : 0; }
  }

  // read pixels
  const id = tctx.getImageData(0,0,cw,ch);
  const d = id.data;

  // quick k center palette
  const k = 8;
  const centers = [
    [ 28, 32, 48],[236, 78,122],[147,197,253],[252,211,77],
    [ 55, 65, 81],[16,185,129],[99,102,241],[59,130,246]
  ];
  // assign each pixel to nearest center, optionally clip background by mask
  for(let i=0;i<cw*ch;i++){
    if (maskData && !maskData[i]){ // remove background
      d[i*4+3]=0; continue;
    }
    let r=d[i*4], g=d[i*4+1], b=d[i*4+2];
    let bi=0, bd=1e9;
    for(let c=0;c<centers.length;c++){
      const cr=centers[c][0], cg=centers[c][1], cb=centers[c][2];
      const vv=(r-cr)*(r-cr)+(g-cg)*(g-cg)+(b-cb)*(b-cb);
      if(vv<bd){bd=vv;bi=c;}
    }
    d[i*4]=centers[bi][0]; d[i*4+1]=centers[bi][1]; d[i*4+2]=centers[bi][2]; d[i*4+3]=255;
  }
  tctx.putImageData(id,0,0);

  // optional edge outline (Sobel) over the quantized image
  if (el.optOutline.checked){
    const src = tctx.getImageData(0,0,cw,ch);
    const out = tctx.createImageData(cw,ch);
    const sd = src.data, od = out.data;
    const gx = [-1,0,1,-2,0,2,-1,0,1];
    const gy = [-1,-2,-1,0,0,0,1,2,1];
    const lum = (r,g,b)=> (0.299*r+0.587*g+0.114*b)|0;

    for(let y=1;y<ch-1;y++){
      for(let x=1;x<cw-1;x++){
        let sx=0, sy=0, k=0;
        for(let j=-1;j<=1;j++){
          for(let i=-1;i<=1;i++){
            const idx=((y+j)*cw+(x+i))*4;
            const L = lum(sd[idx],sd[idx+1],sd[idx+2]);
            sx+=L*gx[k]; sy+=L*gy[k]; k++;
          }
        }
        const g = Math.sqrt(sx*sx+sy*sy);
        const o=(y*cw+x)*4;
        const v = g>180 ? 36 : 0; // thin dark edge
        od[o]=od[o+1]=od[o+2]=0; od[o+3]=v?255:0;
      }
    }
    // composite edges on top
    tctx.drawImage(tmp,0,0); // ensure base present
    const eCanvas = document.createElement('canvas'); eCanvas.width=cw; eCanvas.height=ch;
    eCanvas.getContext('2d').putImageData(out,0,0);
    tctx.drawImage(eCanvas,0,0);
  }

  // density control = opacity of hatch (visual only)
  const density = parseFloat(el.optDensity.value||'0.4');
  if (density < 0.8){
    tctx.globalAlpha = clamp(density/0.5, 0.4, 1);
  }

  // paint into preview
  const pctx = el.preview.getContext('2d');
  pctx.clearRect(0,0,el.preview.width, el.preview.height);
  pctx.drawImage(tmp,0,0);

  showPreview();
}

el.btnProcess?.addEventListener('click', ()=>processPhoto(false));

/* ---------- export buttons (stubs that guard no-image) ---------- */
function needImg(){ if(!state.img){ alert('Upload and process a photo first.'); return false; } return true; }
['btnDST','btnEXP','btnPES','btnJEF','btnExport','btnSuggest'].forEach(k=>{
  const b = el[k]; if(!b) return;
  b.addEventListener('click', ()=>{ if(!needImg()) return; alert('Export coming next — preview is already rendered client-side.'); });
});

/* ---------- on resize keep canvases stable ---------- */
window.addEventListener('resize', ()=>{
  ensureCanvases();
  if (state.img && el.previewHost.dataset.empty !== '1') renderPreviewOriginal();
}, {passive:true});