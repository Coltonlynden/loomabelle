
/* Easbroidery — single-file app logic + worker bootstrap */

import { THREADS } from './colors.js';

const els = {
  tabs: document.querySelectorAll('.tab-btn'),
  panels: {
    upload: document.getElementById('tab-upload'),
    draw: document.getElementById('tab-draw')
  },
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  previewHost: document.getElementById('previewHost'),
  previewCanvas: document.getElementById('previewCanvas'),
  btnProcess: document.getElementById('btnProcess'),
  btnHighlight: document.getElementById('btnHighlight'),
  noSubject: document.getElementById('noSubject'),
  density: document.getElementById('density'),
  optReduce: document.getElementById('optReduce'),
  optEdge: document.getElementById('optEdge'),
  btnDst: document.getElementById('btnDst'),
  btnExp: document.getElementById('btnExp'),
  btnPng: document.getElementById('btnPng'),

  // Draw
  drawHost: document.getElementById('drawHost'),
  drawCanvas: document.getElementById('drawCanvas'),
  toolPen: document.getElementById('toolPen'),
  toolErase: document.getElementById('toolErase'),
  toolClear: document.getElementById('toolClear'),
  btnProcessSelection: document.getElementById('btnProcessSelection'),
  swatches: document.getElementById('swatches'),

  // CTA
  btnStart: document.getElementById('btnStart'),
  btnOpenDraw: document.getElementById('btnOpenDraw'),

  // Progress
  dlg: document.getElementById('progressDlg'),
  bar: document.getElementById('progressBar'),
  label: document.getElementById('progressLabel'),
  btnCancel: document.getElementById('btnCancel'),
};

let state = {
  srcImage: null,           // ImageBitmap
  maskPath: null,           // user-drawn path (Path2D)
  brush: 'pen',
  drawing: false,
  worker: null,
  workerAbort: null
};

/* ---------- Tabs ---------- */
els.tabs.forEach(b=>{
  b.addEventListener('click', ()=>{
    els.tabs.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const id = b.dataset.tab;
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
  });
});

document.getElementById('ctaTry')?.addEventListener('click',()=> els.tabs[0].click());
els.btnStart?.addEventListener('click',()=> {
  els.tabs[0].click();
  els.fileInput.click();
});
els.btnOpenDraw?.addEventListener('click',()=> els.tabs[1].click());

/* ---------- Upload ---------- */
['dragenter','dragover'].forEach(ev=>{
  els.dropzone.addEventListener(ev, e=>{e.preventDefault(); e.dataTransfer.dropEffect='copy';});
});
['drop'].forEach(ev=>{
  els.dropzone.addEventListener(ev, e=>{
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) loadImageFile(f);
  });
});
els.fileInput.addEventListener('change', e=>{
  const f = e.target.files?.[0];
  if (f) loadImageFile(f);
});

async function loadImageFile(file){
  const blob = await file.arrayBuffer();
  const bitmap = await createImageBitmap(new Blob([blob]));
  state.srcImage = bitmap;
  // show preview host
  els.previewHost.classList.remove('hidden');
  drawHeroThumb(bitmap);
  drawPreview(bitmap);
  // prime draw canvas with the photo to trace
  paintDrawCanvas(bitmap);
}

function drawHeroThumb(bitmap){
  const el = document.getElementById('heroCircle');
  if (!el) return;
  el.style.backgroundImage = `url(${imageBitmapToDataURL(bitmap)})`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

/* ---------- Preview render (client-side quick render) ---------- */
function drawPreview(bitmap, outlineOnly=false){
  const c = els.previewCanvas;
  const ctx = c.getContext('2d',{willReadFrequently:true});
  // fit canvas
  const box = els.previewHost.getBoundingClientRect();
  const scale = Math.min(box.width/bitmap.width, box.height/bitmap.height);
  c.width = Math.max(1, Math.floor(bitmap.width*scale));
  c.height = Math.max(1, Math.floor(bitmap.height*scale));
  ctx.clearRect(0,0,c.width,c.height);
  ctx.drawImage(bitmap,0,0,c.width,c.height);

  // optional highlight mask
  if (state.maskPath && !els.noSubject.checked){
    ctx.save();
    ctx.globalAlpha = .25;
    ctx.fillStyle = '#ffd54a';
    ctx.fill(state.maskPath);
    ctx.restore();
  }

  // quick “stitch look”: palette reduce + hatched overlay
  if (els.optReduce.checked){
    reduceToThreads(ctx, c.width, c.height);
  }
  if (els.optEdge.checked){
    edgeOverlay(ctx, c.width, c.height, +els.density.value);
  }
}

/* palette reduce to nearest thread */
function reduceToThreads(ctx,w,h){
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  for (let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const n = nearestThread(r,g,b);
    d[i]=n[0]; d[i+1]=n[1]; d[i+2]=n[2];
  }
  ctx.putImageData(img,0,0);
}

function nearestThread(r,g,b){
  let best=0, bd=1e9;
  for (let i=0;i<THREADS.length;i++){
    const t=THREADS[i]; const dr=r-t[0], dg=g-t[1], db=b-t[2];
    const dd=dr*dr+dg*dg+db*db;
    if (dd<bd){bd=dd; best=i;}
  }
  return THREADS[best];
}

/* coarse edge overlay */
function edgeOverlay(ctx,w,h,amount){
  const img = ctx.getImageData(0,0,w,h);
  const out = ctx.createImageData(w,h);
  const a = Math.max(1, Math.floor(1+amount/25));
  for (let y=a;y<h-a;y++){
    for (let x=a;x<w-a;x++){
      const i=(y*w+x)*4;
      const i2=((y+a)*w+x+a)*4;
      const d = Math.abs(img.data[i]-img.data[i2])+
                Math.abs(img.data[i+1]-img.data[i2+1])+
                Math.abs(img.data[i+2]-img.data[i2+2]);
      const v = d>90? 25:0; // edge shade
      out.data[i]=out.data[i+1]=out.data[i+2]=v; out.data[i+3]=255;
    }
  }
  ctx.globalCompositeOperation='multiply';
  ctx.putImageData(out,0,0);
  ctx.globalCompositeOperation='source-over';
}

/* ---------- Draw / highlight ---------- */
let drawCtx;
function paintDrawCanvas(bitmap){
  const c = els.drawCanvas;
  drawCtx = c.getContext('2d');
  const box = els.drawHost.getBoundingClientRect();
  const scale = Math.min(box.width/bitmap.width, box.height/bitmap.height);
  c.width = Math.max(1, Math.floor(bitmap.width*scale));
  c.height = Math.max(1, Math.floor(bitmap.height*scale));
  drawCtx.clearRect(0,0,c.width,c.height);
  drawCtx.drawImage(bitmap,0,0,c.width,c.height);
  drawCtx.lineCap='round';
  drawCtx.lineJoin='round';
  drawCtx.lineWidth= Math.max(6, Math.floor(Math.min(c.width,c.height)/120));
  drawCtx.strokeStyle = '#1a2a3a';
  state.maskPath = null;
}

function setBrush(kind){
  state.brush = kind;
  els.toolPen.classList.toggle('active', kind==='pen');
  els.toolErase.classList.toggle('active', kind==='erase');
}
setBrush('pen');
els.toolPen.addEventListener('click',()=> setBrush('pen'));
els.toolErase.addEventListener('click',()=> setBrush('erase'));
els.toolClear.addEventListener('click',()=>{
  if (!state.srcImage) return;
  paintDrawCanvas(state.srcImage);
});

function pointerPos(e,c){
  const r=c.getBoundingClientRect();
  const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left;
  const y = (e.touches? e.touches[0].clientY : e.clientY) - r.top;
  return {x, y};
}

['pointerdown','touchstart'].forEach(ev=>{
  els.drawCanvas.addEventListener(ev,e=>{
    if (!state.srcImage) return;
    state.drawing = true;
    const {x,y}=pointerPos(e, els.drawCanvas);
    drawCtx.beginPath(); drawCtx.moveTo(x,y);
    e.preventDefault();
  }, {passive:false});
});

['pointermove','touchmove'].forEach(ev=>{
  els.drawCanvas.addEventListener(ev,e=>{
    if (!state.drawing) return;
    const {x,y}=pointerPos(e, els.drawCanvas);
    if (state.brush==='erase'){
      drawCtx.save();
      drawCtx.globalCompositeOperation='destination-out';
      drawCtx.lineWidth *= 1.6;
      drawCtx.lineTo(x,y); drawCtx.stroke();
      drawCtx.restore();
    }else{
      drawCtx.lineTo(x,y); drawCtx.stroke();
    }
    e.preventDefault();
  }, {passive:false});
});

['pointerup','pointerleave','touchend','touchcancel'].forEach(ev=>{
  els.drawCanvas.addEventListener(ev,()=>{
    if (!state.drawing) return;
    state.drawing=false;
    // store mask as path by sampling non-transparent pixels
    state.maskPath = rasterToPath(els.drawCanvas);
    drawPreview(state.srcImage);
  });
});

function rasterToPath(canvas){
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const p = new Path2D();
  // quick bbox outline of drawn region
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for (let y=0;y<img.height;y++){
    for (let x=0;x<img.width;x++){
      const i=(y*img.width+x)*4+3;
      if (img.data[i]>0){
        if (x<minX)minX=x; if (x>maxX)maxX=x;
        if (y<minY)minY=y; if (y>maxY)maxY=y;
      }
    }
  }
  if (maxX>minX && maxY>minY){
    p.rect(minX,minY,maxX-minX,maxY-minY);
  }
  return p;
}

/* “Highlight Subject” button: jumps to draw tab with photo */
els.btnHighlight.addEventListener('click',()=>{
  if (!state.srcImage) { alert('Upload a photo first.'); return; }
  document.querySelector('[data-tab="draw"]').click();
  paintDrawCanvas(state.srcImage);
});

/* Process Selection from draw tab */
els.btnProcessSelection.addEventListener('click',()=>{
  if (!state.srcImage) { alert('Upload a photo first.'); return; }
  if (!state.maskPath) { alert('Circle the subject, then try again.'); return; }
  // Render a mask bitmap from path
  const maskBmp = pathToMaskBitmap(state.maskPath, els.drawCanvas.width, els.drawCanvas.height);
  runWorker({ kind:'process', mask:true, density:+els.density.value, reduce:els.optReduce.checked, edge:els.optEdge.checked }, maskBmp);
});

function pathToMaskBitmap(path,w,h){
  const c = new OffscreenCanvas(w,h);
  const x = c.getContext('2d');
  x.fillStyle='#fff'; x.fill(path);
  return c.transferToImageBitmap();
}

/* ---------- Worker (heavy processing + progress) ---------- */
function ensureWorker(){
  if (state.worker) return;
  state.worker = new Worker('worker.js', { type:'module' });
  state.worker.onmessage = (e)=>{
    const {type, progress, label, png, expText} = e.data;
    if (type==='progress'){
      els.label.textContent = label || 'Processing…';
      els.bar.style.width = `${Math.round(progress*100)}%`;
    } else if (type==='done'){
      els.dlg.close();
      // show preview image
      const img = new Image();
      img.onload = ()=> {
        const c = els.previewCanvas;
        const ctx = c.getContext('2d');
        c.width = img.width; c.height = img.height;
        ctx.drawImage(img,0,0);
      };
      img.src = png;
      // keep stitch text for exports
      state.expText = expText;
    }
  };
}

function runWorker(options, maskBitmap=null){
  ensureWorker();
  if (!state.srcImage) return;
  els.dlg.showModal();
  els.bar.style.width='0%';
  els.label.textContent='Processing…';

  // Abort support
  state.workerAbort = new AbortController();
  els.btnCancel.onclick = ()=> {
    state.worker?.postMessage({type:'cancel'});
    els.dlg.close();
  };

  // Send
  state.worker.postMessage({
    type:'process',
    options,
    image: state.srcImage,
    mask: maskBitmap,
    palette: THREADS
  }, [state.srcImage, maskBitmap].filter(Boolean)); // transfer
}

els.btnProcess.addEventListener('click', ()=>{
  if (!state.srcImage) { alert('Upload a photo first.'); return; }
  runWorker({ kind:'process', mask:!els.noSubject.checked && !!state.maskPath, density:+els.density.value, reduce:els.optReduce.checked, edge:els.optEdge.checked },
            !els.noSubject.checked && state.maskPath ? pathToMaskBitmap(state.maskPath, els.drawCanvas.width, els.drawCanvas.height) : null);
});

/* Quick client-side exports */
els.btnPng.addEventListener('click',()=>{
  if (!els.previewHost.classList.contains('hidden')){
    downloadDataURL(els.previewCanvas.toDataURL('image/png'), 'easbroidery.png');
  }
});
els.btnExp.addEventListener('click',()=>{
  const txt = state.expText || '# Run Process Photo to generate stitches';
  const blob = new Blob([txt], {type:'text/plain'});
  downloadBlob(blob, 'easbroidery.exp.txt');
});
els.btnDst.addEventListener('click',()=>{
  // placeholder: same text format; swap to real encoder later
  const blob = new Blob([state.expText || '# placeholder DST-like text'], {type:'text/plain'});
  downloadBlob(blob, 'easbroidery.dst.txt');
});

/* utils */
function imageBitmapToDataURL(bmp){
  const c = new OffscreenCanvas(bmp.width,bmp.height);
  const x = c.getContext('2d'); x.drawImage(bmp,0,0);
  return c.convertToBlob({type:'image/png'}).then(blob=>new Promise(r=>{const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(blob)}));
}
function downloadDataURL(url,name){
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob); downloadDataURL(url,name); setTimeout(()=>URL.revokeObjectURL(url),2000);
}

/* Density / options live preview */
['change','input'].forEach(ev=>{
  els.density.addEventListener(ev, ()=> state.srcImage && drawPreview(state.srcImage));
  els.optReduce.addEventListener(ev, ()=> state.srcImage && drawPreview(state.srcImage));
  els.optEdge.addEventListener(ev, ()=> state.srcImage && drawPreview(state.srcImage));
});