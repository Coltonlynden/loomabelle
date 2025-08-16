/* Loomabelle — script.js v35
   Fixes:
   - Upload zone opens file picker and loads preview image
   - Preview card is hidden until a photo is chosen
   - Drawing canvas supports pen/eraser with proper pointer handling
   - Tab switching and "Start with a photo / Open the drawing tab" buttons work
   NOTE: This file does not change your HTML/CSS; it only wires interactions
*/
(function(){
  'use strict';

  const READY = fn => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn());

  const $  = (sel, root)=> (root||document).querySelector(sel);
  const $$ = (sel, root)=> Array.from((root||document).querySelectorAll(sel));
  const DPR = () => window.devicePixelRatio || 1;

  READY(() => {
    // Year
    const year = $('#year'); if (year) year.textContent = new Date().getFullYear();

    // ----- Tabs (keep your UI the same)
    const tabs   = $$('.tabs .tab-btn');
    const panels = $$('.panel');
    function activateTab(key){
      tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === key));
      panels.forEach(p => p.classList.toggle('active', p.dataset.panel === key));
    }
    tabs.forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));

    // Hero buttons -> scroll + activate tab
    $$('[data-scroll="#tabs"]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        $('#tabs')?.scrollIntoView({behavior:'smooth'});
        const label = (btn.textContent||'').toLowerCase();
        activateTab(label.includes('drawing') ? 'draw' : 'upload');
      });
    });

    // ----- Upload panel refs
    const upPanel  = $('.panel[data-panel="upload"]');
    const upZone   = upPanel?.querySelector('.upload-zone');
    const upInput  = upZone?.querySelector('input[type="file"]');
    const prevCard = upPanel?.querySelector('.card.rose');
    const prevHost = upPanel?.querySelector('.preview');
    const fmtBar   = upPanel?.querySelector('.formats');

    // Guard if the structure isn't found
    if (!upZone || !upInput || !prevCard || !prevHost || !fmtBar) {
      console.warn('[Loomabelle] Upload panel structure not found. Check index.html matches the known layout.');
      return;
    }

    // Enable the hidden input (HTML has disabled for mockup)
    upInput.removeAttribute('disabled');
    upInput.accept = 'image/*,.jpg,.jpeg,.png,.gif,.heic,.heif';

    // Preview hidden until something is loaded
    prevCard.classList.add('hidden');
    fmtBar.style.display = 'none';

    // Create preview canvas (no layout change)
    const prevCanvas = document.createElement('canvas');
    prevCanvas.style.width = '100%';
    prevCanvas.style.height = '100%';
    prevHost.innerHTML = '';      // remove placeholder text
    prevHost.appendChild(prevCanvas);
    const pctx = prevCanvas.getContext('2d', {willReadFrequently:true});

    const STATE = {
      previewBmp: null,     // ImageBitmap (for crisp scaling)
      previewW: 0,
      previewH: 0
    };

    function fitCanvasToHost(canvas, host){
      // Use the host's box; keep it stable via CSS aspect-ratio you already added
      const s = DPR();
      const w = host.clientWidth || 640;
      const h = host.clientHeight || Math.round(w*9/16);

      canvas.width  = Math.max(1, Math.round(w * s));
      canvas.height = Math.max(1, Math.round(h * s));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }

    function drawPreview(){
      if (!STATE.previewBmp) return;
      fitCanvasToHost(prevCanvas, prevHost);
      const W = prevCanvas.width  / DPR();
      const H = prevCanvas.height / DPR();
      const iw = STATE.previewW, ih = STATE.previewH;

      const scale = Math.min(W/iw, H/ih);
      const w = Math.max(1, Math.round(iw*scale));
      const h = Math.max(1, Math.round(ih*scale));
      const ox = (W - w) / 2;
      const oy = (H - h) / 2;

      pctx.imageSmoothingEnabled = true;
      pctx.clearRect(0,0,W,H);
      pctx.drawImage(STATE.previewBmp, ox, oy, w, h);

      // subtle border so it looks like your mock
      pctx.strokeStyle = 'rgba(0,0,0,.08)';
      pctx.lineWidth = 1;
      pctx.strokeRect(0.5, 0.5, W-1, H-1);
    }

    window.addEventListener('resize', () => requestAnimationFrame(drawPreview));

    // Clicking anywhere in the upload zone opens the picker
    upZone.addEventListener('click', (e)=>{
      if (e.target.closest('input,button,a,label')) return;
      upInput.click();
    });

    // Drag & drop (optional)
    upZone.addEventListener('dragover', e => { e.preventDefault(); });
    upZone.addEventListener('drop', async e => {
      e.preventDefault();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) await handleFile(f);
    });

    // File input change
    upInput.addEventListener('change', async ()=>{
      const f = upInput.files && upInput.files[0];
      if (f) await handleFile(f);
    });

    async function handleFile(file){
      // Show the preview card, hide export buttons
      prevCard.classList.remove('hidden');
      fmtBar.style.display = 'none';

      // Create an ImageBitmap (crash-safe on iOS and crisp when scaled)
      let bmp = null;
      try{
        bmp = await createImageBitmap(file);
      }catch(err){
        console.error('[Loomabelle] createImageBitmap failed; trying fallback', err);
        bmp = await fileToBitmapFallback(file);
      }
      STATE.previewBmp = bmp;
      STATE.previewW   = bmp.width;
      STATE.previewH   = bmp.height;
      drawPreview();
    }

    async function fileToBitmapFallback(file){
      const blobUrl = URL.createObjectURL(file);
      const img = await new Promise((res, rej)=>{
        const im = new Image();
        im.onload = ()=> res(im);
        im.onerror= rej;
        im.src = blobUrl;
      });
      const off = document.createElement('canvas');
      off.width = img.naturalWidth;
      off.height= img.naturalHeight;
      off.getContext('2d').drawImage(img,0,0);
      URL.revokeObjectURL(blobUrl);
      return await createImageBitmap(off);
    }

    // ----- Draw & Trace panel
    const drawPanel  = $('.panel[data-panel="draw"]');
    const drawHost   = drawPanel?.querySelector('.canvas');
    const toolsBar   = drawPanel?.querySelector('.toolbar');

    // Build a drawing canvas inside the .canvas host
    const drawCanvas = document.createElement('canvas');
    drawCanvas.style.width  = '100%';
    drawCanvas.style.height = '100%';
    drawHost.innerHTML = '';
    drawHost.appendChild(drawCanvas);
    const dctx = drawCanvas.getContext('2d', {willReadFrequently:true});

    // Size once and on resize
    function sizeDraw(){
      const s = DPR();
      const w = drawHost.clientWidth || 640;
      const h = drawHost.clientHeight || Math.round(w*9/16);
      drawCanvas.width = Math.max(1, Math.round(w*s));
      drawCanvas.height= Math.max(1, Math.round(h*s));
      dctx.setTransform(s,0,0,s,0,0);
      // keep existing strokes when resizing? For now, clear to keep it simple
      dctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
      dctx.lineCap='round';
      dctx.lineJoin='round';
      dctx.lineWidth=3;
      dctx.strokeStyle='#111827';
    }
    window.addEventListener('resize', () => requestAnimationFrame(sizeDraw));
    sizeDraw();

    // Enable toolbar buttons and wire Pen/Eraser
    const tb = Array.from(toolsBar.children);
    tb.forEach(b => b.removeAttribute('disabled'));
    let tool = 'pen';
    const penBtn    = tb[0];
    const eraserBtn = tb[1];
    penBtn.classList.add('active');

    penBtn.addEventListener('click', ()=>{
      tool='pen';
      dctx.globalCompositeOperation='source-over';
      penBtn.classList.add('active'); eraserBtn.classList.remove('active');
    });
    eraserBtn.addEventListener('click', ()=>{
      tool='eraser';
      eraserBtn.classList.add('active'); penBtn.classList.remove('active');
    });

    // Drawing interactions (pointer events; prevents page scroll while drawing)
    drawCanvas.style.touchAction = 'none';
    let drawing=false, pid=null;

    function pt(ev, el){
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    drawCanvas.addEventListener('pointerdown', ev=>{
      const p = pt(ev, drawCanvas);
      drawCanvas.setPointerCapture(ev.pointerId);
      pid = ev.pointerId; drawing = true; ev.preventDefault();

      dctx.beginPath();
      dctx.moveTo(p.x, p.y);
      if (tool==='eraser') dctx.globalCompositeOperation='destination-out';
      else dctx.globalCompositeOperation='source-over';
    });

    drawCanvas.addEventListener('pointermove', ev=>{
      if (!drawing || ev.pointerId !== pid) return;
      ev.preventDefault();
      const p = pt(ev, drawCanvas);
      dctx.lineTo(p.x, p.y);
      dctx.stroke();
    });

    const endDraw = ev=>{
      if (ev.pointerId !== pid) return;
      drawing = false; pid = null;
      try{ drawCanvas.releasePointerCapture(ev.pointerId); }catch(_){}
      dctx.globalCompositeOperation='source-over';
    };
    drawCanvas.addEventListener('pointerup', endDraw);
    drawCanvas.addEventListener('pointercancel', endDraw);

    // (Optional) Fill / Fabric / etc. left as UI-only for now; pen/eraser are functional.

  }); // READY end
})();