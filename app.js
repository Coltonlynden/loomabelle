// Loomabelle — subject brush select + ≤10 colors + outline→inset fill→satin + HEIC + DST
const $ = (s)=>document.querySelector(s);
$('#year').textContent = new Date().getFullYear();
const setStatus = (m, cls='')=>{ const el=$('#status'); el.textContent=m; el.className=`status ${cls}`; };

const fileInput = $('#file');
const processBtn = $('#process');
const dlDst = $('#download');
const dlPal = $('#downloadPalette');
const preview = $('#preview');
const frame = $('#frame');

const work = $('#work');
const ctx = work.getContext('2d', { willReadFrequently:true });

// user paint overlay
const paint = $('#paint');
const pctx = paint.getContext('2d', { willReadFrequently:true });
const selectToggle = $('#selectToggle');
const brushRange = $('#brush');
const eraser = $('#eraser');
const clearMaskBtn = $('#clearMask');
const selHint = $('#selHint');

const HOOP_MM = { '4x4': { w:100, h:100 }, '5x7': { w:130, h:180 } };
let img = null;
let userMask = null;  // Uint8Array (1 inside user subject)
let painting = false;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// HEIC support (lazy)
async function heicToJpeg(file){
  if (!window.heic2any){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('HEIC converter failed to load'));
      document.head.appendChild(s);
    });
  }
  const out = await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
  const b = Array.isArray(out) ? out[0] : out;
  return new File([b], (file.name||'image').replace(/\.\w+$/,'')+'.jpg', { type:'image/jpeg' });
}
function loadImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = ()=>{ URL.revokeObjectURL(url); resolve(im) };
    im.onerror = reject;
    im.src = url;
  });
}

// set overlay canvas to match preview image box inside .frame (10px padding)
function sizePaintToPreview(){
  const box = preview.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  paint.width = w; paint.height = h;
  paint.style.width = w+'px';
  paint.style.height = h+'px';
  paint.style.left = (box.left - frameBox.left) + 'px';
  paint.style.top  = (box.top  - frameBox.top ) + 'px';
  // rebuild userMask at work size proportions later
  pctx.clearRect(0,0,paint.width,paint.height);
}

// draw translucent mask overlay
function renderMaskOverlay(){
  pctx.clearRect(0,0,paint.width,paint.height);
  if (!userMask) return;
  const imgData = pctx.createImageData(paint.width, paint.height);
  for (let i=0;i<paint.width*paint.height;i++){
    const on = userMask[i]===1;
    imgData.data[i*4+0] = 255;        // red
    imgData.data[i*4+1] = 0;
    imgData.data[i*4+2] = 0;
    imgData.data[i*4+3] = on ? 80 : 0; // alpha
  }
  pctx.putImageData(imgData,0,0);
}

// convert client coords to canvas coords
function pointerToCanvas(e){
  const rect = paint.getBoundingClientRect();
  const x = (e.touches?e.touches[0].clientX:e.clientX)-rect.left;
  const y = (e.touches?e.touches[0].clientY:e.clientY)-rect.top;
  return [Math.round(x), Math.round(y)];
}
function stampBrush(cx,cy,rad,on){
  const r2=rad*rad, W=paint.width, H=paint.height;
  if (!userMask) userMask=new Uint8Array(W*H);
  for (let y=Math.max(0,cy-rad); y<Math.min(H,cy+rad); y++){
    const dy=y-cy;
    for (let x=Math.max(0,cx-rad); x<Math.min(W,cx+rad); x++){
      const dx=x-cx;
      if (dx*dx+dy*dy<=r2) userMask[y*W+x] = on?1:0;
    }
  }
}
function startPaint(e){ if (selectToggle.dataset.active!=='1') return;
  painting=true; paint.style.pointerEvents='auto';
  const [x,y]=pointerToCanvas(e); stampBrush(x,y, Number(brushRange.value), !eraser.checked); renderMaskOverlay(); e.preventDefault();
}
function movePaint(e){ if(!painting) return; const [x,y]=pointerToCanvas(e);
  stampBrush(x,y, Number(brushRange.value), !eraser.checked); renderMaskOverlay(); e.preventDefault();
}
function endPaint(){ painting=false; }

paint.addEventListener('mousedown', startPaint);
paint.addEventListener('mousemove', movePaint);
window.addEventListener('mouseup', endPaint);
paint.addEventListener('touchstart', startPaint, {passive:false});
paint.addEventListener('touchmove', movePaint, {passive:false});
window.addEventListener('touchend', endPaint);

// toggle selection mode
selectToggle.addEventListener('click', ()=>{
  if (selectToggle.dataset.active==='1'){
    selectToggle.dataset.active='0';
    selectToggle.textContent='✍️ Select subject';
    paint.style.pointerEvents='none';
  }else{
    selectToggle.dataset.active='1';
    selectToggle.textContent='✅ Painting (tap/drag)';
    paint.style.pointerEvents='auto';
  }
});
clearMaskBtn.addEventListener('click', ()=>{ if(!userMask) return; userMask.fill(0); renderMaskOverlay(); });

// File select
fileInput.addEventListener('change', async ()=>{
  const f = fileInput.files?.[0]; if (!f) return;
  try{
    setStatus('Loading image…');
    let chosen=f;
    const name=(f.name||'').toLowerCase(); const mime=(f.type||'').toLowerCase();
    if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')){
      setStatus('Converting HEIC to JPEG…'); chosen=await heicToJpeg(f);
    }
    img = await loadImageFromFile(chosen);

    // preview draw (cap)
    const maxSide=1200, s=Math.min(1, maxSide/Math.max(img.width,img.height));
    const W=Math.round(img.width*s), H=Math.round(img.height*s);
    work.width=W; work.height=H; ctx.clearRect(0,0,W,H); ctx.drawImage(img,0,0,W,H);
    preview.src = work.toDataURL('image/png