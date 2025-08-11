// js/app.js — Loomabelle (full, working)

// External modules you already have in /js/lib
import { quantizeSafe, sampleDominant } from './lib/quantize.js';
import { personMask } from './lib/segment_people.js';
import { planStitches } from './lib/stitcher.js';
import { writeDST } from './lib/dst.js';

/* ======================== Small helpers ======================== */
const UA = navigator.userAgent || '';
const IS_IOS = /\b(iPhone|iPad|iPod)\b/i.test(UA);

const $ = (id) => document.getElementById(id);

const logEl = $('log');
function log(msg, level='info'){
  const ts = new Date().toTimeString().slice(0,8);
  const line = `[${ts}] ${msg}`;
  (level==='error'?console.error:level==='warn'?console.warn:console.log)(line);
  if (logEl){ logEl.value += (logEl.value?'\n':'') + line; logEl.scrollTop = logEl.scrollHeight; }
}
function clearLog(){ if (logEl) logEl.value=''; }

const bar = $('bar');
function prog(v){ if(bar){ bar.style.width = Math.max(0,Math.min(100,v))+'%'; } }
function bump(to){ prog(Math.max(parseInt(bar?.style.width||'0',10), to)); }

// ✅ Only gate the Process button while running
function setProcessing(on){
  const p = $('process');
  if (p) p.disabled = !!on;
}

// Safe ctx
function ctx(c){ return c.getContext('2d',{willReadFrequently:true}); }

/* ============================ State ============================ */
const state = {
  work: $('work'),
  maskCanvas: $('mask'),
  preview: $('preview'),
  userMask: null,
  lastResult: null,
  lastOps: null,
  lastPaletteTxt: null
};

// Initial UI state
(function initUI(){
  $('process')?.setAttribute('disabled','');
  $('dlDST')?.setAttribute('disabled','');
  $('dlPAL')?.setAttribute('disabled','');
})();

/* ========================= Image loading ======================= */

function getFileInput(){
  return $('file') || document.querySelector('input[type="file"]');
}

async function loadImageToCanvas(file){
  const url = URL.createObjectURL(file);
  try{
    // Use HTMLImageElement for iOS/Safari stability
    const img = await new Promise((resolve,reject)=>{
      const im = new Image();
      im.onload = ()=>resolve(im);
      im.onerror = reject;
      im.src = url;
    });

    const maxSide = 1024;
    let W = img.naturalWidth, H = img.naturalHeight;
    if (Math.max(W,H) > maxSide){
      const r = maxSide / Math.max(W,H); W = (W*r)|0; H = (H*r)|0;
    }

    const work = state.work, mask = state.maskCanvas, prev = state.preview;
    work.width = W; work.height = H;
    mask.width = W; mask.height = H;

    // preview width <= 640
    prev.width = Math.min(640, W);
    prev.height = Math.min(640, Math.round(H*(prev.width/W)));

    const wctx = ctx(work);
    wctx.clearRect(0,0,W,H);
    wctx.drawImage(img, 0, 0, W, H);

    // reset user mask
    ctx(mask).clearRect(0,0,W,H);
    state.userMask = null;

    // ✅ enable Process now
    $('process')?.removeAttribute('disabled');

    const st = $('status');
    if (st) st.textContent = `Loaded ${file.name} (${W}×${H})`;
    log(`Loaded image ${file.name} (${W}x${H})`);
    bump(8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bindFileLoader(){
  const input = getFileInput();
  if (!input){
    // In case HTML inserts late
    setTimeout(bindFileLoader, 300);
    return;
  }
  input.onchange = async (e)=>{
    clearLog(); prog(0);
    const f = e.target.files && e.target.files[0];
    if (!f){ log('No file chosen'); return; }
    await loadImageToCanvas(f);
  };
  log('File loader bound.');
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bindFileLoader, {once:true});
} else { bindFileLoader(); }

/* ====================== Simple paint selector =================== */
// (Optional UI; harmless if the controls aren’t present)
(function paintTool(){
  const cnv = state.maskCanvas; if(!cnv) return;
  let painting=false, erase=false, size=18; let lastX=0,lastY=0;

  const pos=(ev)=>{
    const r = cnv.getBoundingClientRect();
    const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
    const y = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
    return { x: x*(cnv.width/r.width), y: y*(cnv.height/r.height) };
  };
  const draw = (x,y)=>{
    const mctx = ctx(cnv);
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.fillStyle = 'rgba(255,255,255,0.95)';
    mctx.beginPath(); mctx.arc(x,y,size/2,0,Math.PI*2); mctx.fill();
  };
  const start=(ev)=>{ if(!state.work.width) return; painting=true; const p=pos(ev); lastX=p.x; lastY=p.y; draw(p.x,p.y); ev.preventDefault(); };
  const move =(ev)=>{ if(!painting) return; const p=pos(ev); const mctx=ctx(cnv); mctx.beginPath(); mctx.lineWidth=size; mctx.lineCap='round'; mctx.globalCompositeOperation=erase?'destination-out':'source-over'; mctx.strokeStyle=erase?'#000':'rgba(255,255,255,0.95)'; mctx.moveTo(lastX,lastY); mctx.lineTo(p.x,p.y); mctx.stroke(); lastX=p.x; lastY=p.y; ev.preventDefault(); };
  const end =()=>{ painting=false; };

  cnv.addEventListener('mousedown',start); window.addEventListener('mouseup',end);
  cnv.addEventListener('mousemove',move);
  cnv.addEventListener('touchstart',start,{passive:false});
  cnv.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',end);

  $('erase')?.addEventListener('change',e=>erase=!!e.target.checked);
  $('brush')?.addEventListener('input',e=>size=parseInt(e.target.value||'18',10));
  $('clearMask')?.addEventListener('click',()=>{ ctx(cnv).clearRect(0,0,cnv.width,cnv.height); state.userMask=null; });
})();

/* ======================= Subject helpers ======================== */
function extractUserMask(){
  const m = state.maskCanvas; if(!m || !m.width) return null;
  const d = ctx(m).getImageData(0,0,m.width,m.height).data;
  const out = new Uint8Array(m.width*m.height);
  let count = 0;
  for (let i=0;i<out.length;i++){
    const a = d[i*4+3];
    if (a>10){ out[i]=1; count++; }
  }
  if (count<50) return null; // basically empty
  return out;
}

/* =========================== Process =========================== */
$('process')?.addEventListener('click', async ()=>{
  try{
    if (!state.work?.width){
      log('Upload an image first.'); return;
    }
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

    // (A) Preprocess (CLAHE if cv is present)
    try{
      const work = state.work, wctx = ctx(work);
      const id = wctx.getImageData(0,0,work.width,work.height);
      if (window.cv && window.cv.Mat){
        log('Enhancing contrast (OpenCV)…');
        const src = cv.matFromImageData(id);
        const ycrcb = new cv.Mat(); cv.cvtColor(src, ycrcb, cv.COLOR_RGBA2YCrCb);
        const ch = new cv.MatVector(); cv.split(ycrcb, ch);
        const clahe = new cv.CLAHE(2.0, new cv.Size(8,8));
        clahe.apply(ch.get(0), ch.get(0));
        cv.merge(ch, ycrcb); cv.cvtColor(ycrcb, src, cv.COLOR_YCrCb2RGBA);
        const out = new ImageData(new Uint8ClampedArray(src.data), work.width, work.height);
        wctx.putImageData(out,0,0);
        src.delete(); ycrcb.delete(); ch.delete(); clahe.delete();
      } else {
        log('Enhancing contrast (fallback)…');
        const d=id.data;
        for(let i=0;i<d.length;i+=4){
          d[i]   = Math.max(0,Math.min(255, ((d[i]-128)*1.1 + 128) ));
          d[i+1] = Math.max(0,Math.min(255, ((d[i+1]-128)*1.1 + 128) ));
          d[i+2] = Math.max(0,Math.min(255, ((d[i+2]-128)*1.1 + 128) ));
        }
        wctx.putImageData(id,0,0);
      }
    }catch(e){ log('Preprocess fallback: '+(e?.message||e),'warn'); }
    bump(12);

    // (B) Subject mask – user wins; else BodyPix; skip if tiny
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
      }catch(e){ log('Person segmentation failed: '+(e?.message||e),'warn'); }
    }
    bump(24);

    // (C) Quantize (iOS‑safe) with progress
    log('Reducing colors…');
    const wctx = ctx(work);
    const imgData = wctx.getImageData(0,0,work.width,work.height);
    const qStart = Date.now();
    const { indexed, palette, W, H } =
      await quantizeSafe(imgData, k, activeMask, (p)=>bump(24+Math.round(p*0.6)));
    log(`Quantize done in ${Date.now()-qStart}ms (palette=${palette.length}).`);
    bump(70);

    // (D) Palette bias to subject when auto colors
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

    // (F) Preview + download wiring
    renderPreview(state.preview, { indexed, palette: finalPalette, W, H }, opts);
    state.lastResult = { indexed, palette: finalPalette, W, H };
    state.lastOps = ops;
    state.lastPaletteTxt = finalPalette.map((c,i)=>`${i+1}. #${toHex(c)}`).join('\n');

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
    log('Processing failed: '+(err?.message||err),'error');
  }finally{
    setProcessing(false); // always re-enable the Process button
  }
});

/* ========================== Preview ============================ */
function renderPreview(canvas, data, opts){
  const {indexed, palette, W, H} = data;
  const c = canvas.getContext('2d');
  const scale = Math.min(canvas.width/W, canvas.height/H);
  const w = Math.floor(W*scale), h = Math.floor(H*scale);
  c.fillStyle = '#0b1620'; c.fillRect(0,0,canvas.width,canvas.height);

  c.save(); c.translate((canvas.width-w)/2, (canvas.height-h)/2);
  const img = c.createImageData(w,h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const sx = Math.min(W-1, Math.floor(x/scale));
      const sy = Math.min(H-1, Math.floor(y/scale));
      const idx = indexed[sy*W+sx];
      const col = palette[idx] || [0,0,0];
      const i = (y*w+x)*4;
      img.data[i]=col[0]; img.data[i+1]=col[1]; img.data[i+2]=col[2]; img.data[i+3]=255;
    }
  }
  c.putImageData(img,0,0);

  // hoop outline
  const pad = 12; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth=2;
  if (!c.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r=8){
      this.beginPath(); this.moveTo(x+r,y); this.lineTo(x+w-r,y);
      this.quadraticCurveTo(x+w,y,x+w,y+r);
      this.lineTo(x+w,y+h-r); this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      this.lineTo(x+r,y+h); this.quadraticCurveTo(x,y+h,x,y+h-r);
      this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y); this.closePath();
    };
  }
  c.beginPath(); c.roundRect(pad,pad,w-pad*2,h-pad*2,10); c.stroke();
  c.restore();
}
/* ====================== BUTTON WATCHDOG (add last) ====================== */
(function buttonWatchdog(){
  const $ = (id)=>document.getElementById(id);

  function forceEnableProcess(reason='watchdog'){
    const p = $('process');
    if (!p) return;
    // Remove anything that can make it appear disabled
    p.disabled = false;
    p.classList.remove('disabled');
    p.style.pointerEvents = 'auto';
    p.style.opacity = '';
    // Optional: annotate for debugging
    p.dataset.lastEnabledBy = reason;
  }

  // 1) Enable whenever we actually have an image on the work canvas
  const imgReadyTimer = setInterval(()=>{
    const work = $('work');
    if (work && work.width > 0 && work.height > 0){
      forceEnableProcess('canvas-has-image');
    }
  }, 600);

  // 2) Re-enable on any input that suggests the user is ready
  //    (file, color count, toggles, etc.)
  const reEnableEvents = ['change','input','click'];
  reEnableEvents.forEach(evt=>{
    window.addEventListener(evt, (e)=>{
      // Cheap heuristic: if the target is inside the controls card, enable
      const target = e.target;
      if (!target || !(target instanceof Element)) return;
      const inControls = target.closest
        ? target.closest('#controls, .controls, .card')
        : null;
      if (inControls) forceEnableProcess('user-interaction');
    }, true);
  });

  // 3) MutationObserver to catch anything that disables it afterwards.
  //    We log the stack so you can find who is doing it.
  const p = $('process');
  if (p){
    const obs = new MutationObserver((muts)=>{
      muts.forEach(m=>{
        if (m.attributeName === 'disabled' || m.attributeName === 'class' || m.attributeName === 'style'){
          if (p.disabled || p.classList.contains('disabled') || (p.style.pointerEvents === 'none')){
            console.warn('[watchdog] Process was disabled; forcing enable.', new Error().stack);
            forceEnableProcess('mutation-observer');
          }
        }
      });
    });
    obs.observe(p, { attributes:true, attributeFilter:['disabled','class','style'] });

    // Also, if something swaps out the button node entirely:
    const parent = p.parentElement;
    if (parent){
      const parentObs = new MutationObserver(()=>{
        const np = $('process');
        if (np) {
          forceEnableProcess('node-replaced');
        }
      });
      parentObs.observe(parent, { childList:true, subtree:true });
    }
  } else {
    // If button isn't in DOM yet, try again soon
    setTimeout(buttonWatchdog, 500);
    return;
  }

  // 4) As a last resort, never leave it disabled after processing ends
  //    (our main code calls setProcessing(false), but belt & suspenders)
  window.addEventListener('blur', ()=>forceEnableProcess('blur'));
  window.addEventListener('focus', ()=>forceEnableProcess('focus'));

  // 5) Make sure the file input always re-enables the button
  const file = document.getElementById('file') || document.querySelector('input[type=file]');
  if (file) {
    file.addEventListener('change', ()=>forceEnableProcess('file-change'));
  }

  console.log('[watchdog] Process button watchdog active.');
})();
/* =========================== Utils ============================= */
function toHex([r,g,b]){ return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function downloadBlob(blob, name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); }

// Optional convenience
$('clearLog')?.addEventListener('click', clearLog);