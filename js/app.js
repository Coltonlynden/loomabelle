// js/app.js
// Loomabelle – main app controller (portrait-aware pipeline)

import { quantizeSafe, sampleDominant } from './lib/quantize.js';
import { personMask } from './lib/segment_people.js';
import { planStitches } from './lib/stitcher.js';
import { writeDST } from './lib/dst.js';


/* ------------------------- small helpers ------------------------- */
const UA = navigator.userAgent || '';
const IS_IOS = /\b(iPhone|iPad|iPod)\b/i.test(UA);

const $ = (id) => document.getElementById(id);
const logEl = $('log');

function log(msg, level='info'){
  const ts = new Date().toTimeString().slice(0,8);
  const line = `[${ts}] ${msg}`;
  (level==='error' ? console.error : level==='warn' ? console.warn : console.log)(line);
  if (logEl){
    logEl.value += (logEl.value ? '\n' : '') + line;
    logEl.scrollTop = logEl.scrollHeight;
  }
}
function clearLog(){ if (logEl) logEl.value=''; }

const bar = $('bar');
function prog(v){ if(bar){ bar.style.width = Math.max(0,Math.min(100,v))+'%'; } }
function bump(to){ prog(Math.max(parseInt(bar?.style.width||'0',10), to)); }

/** ✅ Only toggles the Process button. Download buttons are managed on success. */
function setProcessing(on){
  const p = $('process');
  if (p) p.disabled = !!on;
}

/** ✅ Ensure sane initial state */
(function initButtons(){
  $('process')?.removeAttribute('disabled');
  $('dlDST')?.setAttribute('disabled','');
  $('dlPAL')?.setAttribute('disabled','');
})();

/* ---------------------------- state ----------------------------- */
const state = {
  imgFile: null,
  work: $('work'),              // offscreen working canvas (hidden in CSS)
  maskCanvas: $('mask'),        // user paint canvas (same size as work)
  preview: $('preview'),        // preview canvas
  userMask: null,               // Uint8Array or null
  lastResult: null,             // {indexed, palette, W, H}
  lastOps: null,                // stitch ops
  lastPaletteTxt: null,         // palette text
};

function canvasCtx(c){ return c.getContext('2d',{willReadFrequently:true}); }

/* ------------------------ image loading ------------------------- */
$('file')?.addEventListener('change', async (e)=>{
  clearLog(); prog(0);
  const f = e.target.files && e.target.files[0];
  if(!f){ log('No file chosen'); return; }
  state.imgFile = f;
  log(`Loaded image ${f.name}`);
  // Draw into work canvas (limit longest side to 1024 for mobile)
  const bmp = await createImageBitmap(f);
  const maxSide = 1024;
  let W = bmp.width, H = bmp.height;
  if (Math.max(W,H) > maxSide){
    const r = maxSide / Math.max(W,H); W = (W*r)|0; H = (H*r)|0;
  }
  state.work.width = W; state.work.height = H;
  state.maskCanvas.width = W; state.maskCanvas.height = H;
  state.preview.width = Math.min(640, W); state.preview.height = Math.min(640, Math.round(H*(state.preview.width/W)));
  canvasCtx(state.work).drawImage(bmp,0,0,W,H);
  canvasCtx(state.maskCanvas).clearRect(0,0,W,H);
  state.userMask = null;
  bump(8);
});

/* ------------------------- paint tools -------------------------- */
// (Optional) very simple paint to select subject. If you already had a richer tool,
// you can delete this section; we just keep compatibility.
(function setupPaint(){
  const cnv = state.maskCanvas; if(!cnv) return;
  let painting = false, erase = false, size = 18;
  let lastX=0,lastY=0;

  const draw = (x,y)=>{
    const ctx = canvasCtx(cnv);
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill();
  };
  const pos = (ev)=>{
    const r = cnv.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    const sx = x * (cnv.width/r.width), sy = y * (cnv.height/r.height);
    return {x:sx,y:sy};
  };
  const start = (ev)=>{ if(!state.work.width) return; painting=true; const p=pos(ev); lastX=p.x; lastY=p.y; draw(p.x,p.y); ev.preventDefault(); };
  const move  = (ev)=>{ if(!painting) return; const p=pos(ev); const ctx=canvasCtx(cnv); ctx.beginPath(); ctx.lineWidth=size; ctx.lineCap='round'; ctx.strokeStyle = erase?'rgba(0,0,0,1)':'rgba(255,255,255,0.9)'; ctx.globalCompositeOperation = erase?'destination-out':'source-over'; ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke(); lastX=p.x; lastY=p.y; ev.preventDefault(); };
  const end   = ()=>{ painting=false; };
  cnv.addEventListener('mousedown',start); cnv.addEventListener('touchstart',start,{passive:false});
  cnv.addEventListener('mousemove',move);  cnv.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('mouseup',end);  window.addEventListener('touchend',end);
  // tiny UI hooks if present
  const er = document.getElementById('erase'); if(er) er.addEventListener('change',e=>erase=e.target.checked);
  const br = document.getElementById('brush'); if(br) br.addEventListener('input',e=>size=parseInt(e.target.value||'18',10));
  const cl = document.getElementById('clearMask'); if(cl) cl.addEventListener('click',()=>{ canvasCtx(cnv).clearRect(0,0,cnv.width,cnv.height); state.userMask=null; });
})();

/* ---------------------- subject helpers ------------------------ */
function extractUserMask(){
  const m = state.maskCanvas; if(!m || !m.width) return null;
  const d = canvasCtx(m).getImageData(0,0,m.width,m.height).data;
  const out = new Uint8Array(m.width*m.height);
  let count = 0;
  for(let i=0;i<out.length;i++){ const a = d[i*4+3]; if(a>10){ out[i]=1; count++; } }
  if (count<50) return null; // basically empty
  return out;
}

/* -------------------------- process ---------------------------- */
$('process')?.addEventListener('click', async ()=>{
  try{
    if(!state.work?.width){ log('Upload an image first.'); return; }
    clearLog(); setProcessing(true); prog(0);
    log('=== PROCESS START ===');
    log('Preparing…');

    const k = Math.max(2, Math.min(10, parseInt(($('k')?.value)||'6',10)));
    const autoColors = !!$('autoColors')?.checked;
    const autoEmb = !!$('autoEmb')?.checked;
    const hoop = $('hoop')?.value || '100x100';
    const doOutline = $('outline') ? !!$('outline').checked : true;
    const angle = parseFloat(($('angle')?.value)||'45')||45;
    const density = Math.max(0.3, Math.min(0.8, parseFloat(($('density')?.value)||'0.40')));

    log(`Settings: k=${k}, auto=${autoColors}, iOS=${IS_IOS}, removeBg=${!autoEmb?false:true}, outline=${doOutline}`);
    bump(6);

    // (A) Preprocess
    try{
      const work = state.work, ctx = canvasCtx(work);
      const id = ctx.getImageData(0,0,work.width,work.height);
      if (window.cv && window.cv.Mat){
        log('Enhancing contrast (OpenCV)…');
        const src = cv.matFromImageData(id);
        const ycrcb = new cv.Mat(); cv.cvtColor(src, ycrcb, cv.COLOR_RGBA2YCrCb);
        const ch = new cv.MatVector(); cv.split(ycrcb, ch);
        const clahe = new cv.CLAHE(2.0, new cv.Size(8,8));
        clahe.apply(ch.get(0), ch.get(0));
        cv.merge(ch, ycrcb); cv.cvtColor(ycrcb, src, cv.COLOR_YCrCb2RGBA);
        const out = new ImageData(new Uint8ClampedArray(src.data), work.width, work.height);
        ctx.putImageData(out,0,0);
        src.delete(); ycrcb.delete(); ch.delete(); clahe.delete();
      } else {
        log('Enhancing contrast (fallback)…');
        const d=id.data; for(let i=0;i<d.length;i+=4){
          d[i]   = Math.max(0,Math.min(255, ((d[i]-128)*1.1 + 128) ));
          d[i+1] = Math.max(0,Math.min(255, ((d[i+1]-128)*1.1 + 128) ));
          d[i+2] = Math.max(0,Math.min(255, ((d[i+2]-128)*1.1 + 128) ));
        }
        ctx.putImageData(id,0,0);
      }
    }catch(e){
      log('Preprocess fallback: '+(e?.message||e),'warn');
    }
    bump(12);

    // (B) Subject mask – user mask wins; else BodyPix; skip GrabCut on iOS
    const work = state.work;
    let activeMask = extractUserMask();
    if (activeMask){
      log('Using user‑painted subject mask.');
    } else {
      try{
        log('Finding people…');
        activeMask = await personMask(work, (p)=>bump(12+Math.round(p/6)));
        const sum = activeMask.reduce((a,b)=>a+b,0);
        log(`Person mask pixels: ${sum}`);
        if (sum < work.width*work.height*0.02){
          log('Subject mask too small; proceeding without it.');
          activeMask = null;
        }
      }catch(e){
        log('Person segmentation failed: '+(e?.message||e),'warn');
      }
    }
    bump(24);

    // (C) Reduce colors – iOS‑safe quantizer
    log('Reducing colors…');
    const ctxW = canvasCtx(work);
    const imgData = ctxW.getImageData(0,0,work.width,work.height);
    const qStart = Date.now();
    const { indexed, palette, W, H } =
      await quantizeSafe(imgData, k, activeMask, (p)=>bump(24+Math.round(p*0.6)));
    log(`Quantize done in ${Date.now()-qStart}ms (palette=${palette.length}).`);
    bump(70);

    // (D) Palette bias to subject (only if auto colors)
    let finalPalette = palette.slice(0, Math.min(k, palette.length));
    if (autoColors && activeMask){
      const tmp = document.createElement('canvas'); tmp.width=W; tmp.height=H;
      const tctx = tmp.getContext('2d'); tctx.putImageData(imgData,0,0);
      const id = tctx.getImageData(0,0,W,H); const d=id.data;
      for(let i=0;i<W*H;i++){ if(!activeMask[i]) d[i*4+3]=0; }
      tctx.putImageData(id,0,0);
      const seeds = sampleDominant(tmp, Math.min(6, k));
      const out=[]; const add=(c)=>{ if(!out.some(u=>Math.hypot(u[0]-c[0],u[1]-c[1],u[2]-c[2])<15)) out.push(c); };
      seeds.forEach(add); finalPalette.forEach(add);
      finalPalette = out.slice(0, Math.min(k, out.length));
      log('Palette biased to subject.');
    }
    bump(75);

    // (E) Plan stitches
    log('Planning stitches…');
    const spmm = 1 / Math.max(0.2, Math.min(1.0, density));
    const opts = {
      outline: !!doOutline,
      angle: parseFloat(angle)||45,
      spacingMM: 1/spmm,
      hoop,
      mask: activeMask || null
    };
    const t0 = Date.now();
    const ops = planStitches({ indexed, palette: finalPalette, W, H }, opts);
    log(`Total stitch ops: ${ops?.length||0} (in ${Date.now()-t0}ms)`);
    bump(88);

    // (F) Preview + downloads
    renderPreview(state.preview, { indexed, palette: finalPalette, W, H }, opts);
    state.lastResult = { indexed, palette: finalPalette, W, H };
    state.lastOps = ops;
    state.lastPaletteTxt = finalPalette.map((c,i)=>`${i+1}. #${toHex(c)}`).join('\n');

    // ✅ enable downloads only on success
    $('dlDST')?.removeAttribute('disabled');
    $('dlPAL')?.removeAttribute('disabled');
    $('dlDST').onclick = ()=> downloadBlob(writeDST(ops, finalPalette, opts), 'loomabelle.dst');
    $('dlPAL').onclick = ()=>{
      const pb = new Blob([state.lastPaletteTxt], {type:'text/plain'});
      downloadBlob(pb, 'palette.txt');
    };

    bump(100);
    log('Done! Download your .DST and palette.txt.');
    log('=== PROCESS OK ===');
  }catch(err){
    log('Processing failed: '+(err?.message||err), 'error');
  }finally{
    setProcessing(false);   // ✅ re‑enable Process button no matter what
  }
});

/* ------------------------ preview helpers ----------------------- */
function renderPreview(canvas, data, opts){
  const {indexed, palette, W, H} = data;
  const ctx = canvas.getContext('2d');
  // fit image into canvas
  const scale = Math.min(canvas.width/W, canvas.height/H);
  const w = Math.floor(W*scale), h = Math.floor(H*scale);
  ctx.fillStyle = '#0b1620'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // draw hatched preview (very light – visual only)
  ctx.save(); ctx.translate((canvas.width-w)/2, (canvas.height-h)/2);
  const img = ctx.createImageData(w,h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const sx = Math.min(W-1, Math.floor(x/scale));
      const sy = Math.min(H-1, Math.floor(y/scale));
      const idx = indexed[sy*W+sx];
      const c = palette[idx] || [0,0,0];
      const i = (y*w+x)*4;
      img.data[i]=c[0]; img.data[i+1]=c[1]; img.data[i+2]=c[2]; img.data[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  // hoop bounds
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath();
  const pad = 12; ctx.roundRect(pad,pad,w-pad*2,h-pad*2,10); ctx.stroke();
  ctx.restore();
}

function toHex([r,g,b]){ return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function downloadBlob(blob, name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); }

/* ------------------------- self-check UI ------------------------ */
// Optional buttons if you kept them
$('clearLog')?.addEventListener('click', clearLog);

/* Polyfill for roundRect on Safari iOS 15–16 */
if (!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r=8){
    this.beginPath(); this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.quadraticCurveTo(x+w,y,x+w,y+r);
    this.lineTo(x+w,y+h-r); this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    this.lineTo(x+r,y+h); this.quadraticCurveTo(x,y+h,x,y+h-r);
    this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y); this.closePath();
  };
}