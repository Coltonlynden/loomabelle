// Simple pen/eraser over a guide image; produces a mask for processing.
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const drawHost = $('#drawHost');
  const drawCanvas = $('#drawCanvas');
  const penBtn = $('#penBtn');
  const eraserBtn = $('#eraserBtn');
  const clearBtn = $('#clearBtn');
  const processSelBtn = $('#processSelectionBtn');
  const swatchesEl = $('#swatches');

  const state = {
    color: '#111827',
    size: 8,
    mode: 'pen', // 'pen' | 'eraser'
    drawing: false,
    lastX: 0, lastY: 0,
  };

  // Palette
  const COLORS = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#93c5fd','#38bdf8','#34d399','#84cc16',
                  '#facc15','#fb923c','#f87171','#22c55e'];
  COLORS.forEach(c=>{
    const sw = document.createElement('button');
    sw.className = 'sw';
    sw.style.background = c;
    sw.addEventListener('click',()=>{ state.color = c; state.mode='pen'; setButtons(); });
    swatchesEl.appendChild(sw);
  });

  function setButtons(){
    penBtn.classList.toggle('rainbow', state.mode==='pen');
    eraserBtn.classList.toggle('rainbow', state.mode==='eraser');
  }

  function fit(){
    const {w,h} = window.LoomaPreview.fitCanvasToHost(drawCanvas, drawHost);
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0,0,w,h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size * (window.devicePixelRatio||1);
    // if there’s an existing guide image, redraw it
    if (window.Looma.imageBitmap){
      // draw faint guide underneath the ink (separate canvas not needed; we draw on preview instead)
      // Guide is displayed in the preview panel; the drawing canvas is only mask.
    }
  }

  function posFrom(ev){
    const rect = drawCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const pt = ('touches' in ev && ev.touches[0]) ? ev.touches[0] : ev;
    return { x:(pt.clientX-rect.left)*dpr, y:(pt.clientY-rect.top)*dpr };
  }

  function start(ev){
    state.drawing = true;
    const {x,y} = posFrom(ev);
    state.lastX=x; state.lastY=y;
    ev.preventDefault();
  }
  function move(ev){
    if(!state.drawing) return;
    const {x,y} = posFrom(ev);
    const ctx = drawCanvas.getContext('2d');
    ctx.globalCompositeOperation = state.mode==='eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = state.mode==='eraser' ? '#000' : state.color;
    ctx.lineWidth = state.size * (window.devicePixelRatio||1);
    ctx.beginPath();
    ctx.moveTo(state.lastX, state.lastY);
    ctx.lineTo(x,y);
    ctx.stroke();
    state.lastX=x; state.lastY=y;
    ev.preventDefault();
  }
  function end(){ state.drawing=false; }

  ['mousedown','touchstart'].forEach(e=>drawCanvas.addEventListener(e,start,{passive:false}));
  ['mousemove','touchmove'].forEach(e=>drawCanvas.addEventListener(e,move,{passive:false}));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(e=>drawCanvas.addEventListener(e,end));

  penBtn.addEventListener('click', ()=>{ state.mode='pen'; setButtons(); });
  eraserBtn.addEventListener('click', ()=>{ state.mode='eraser'; setButtons(); });
  clearBtn.addEventListener('click', ()=>{
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  });

  processSelBtn.addEventListener('click', ()=>{
    // Pass mask to processing by saving it to Looma state
    window.Looma.setMaskFrom(drawCanvas);
    // jump back to upload tab and run process immediately
    document.getElementById('tabUpload').click();
    document.getElementById('btnProcess').click();
  });

  // When user clicks "Highlight Subject" on preview, show the guide photo under the drawing panel
  window.addEventListener('loom:draw:showGuide', ()=>{
    // We simply show the original photo in the preview panel while user draws on mask;
    // the draw canvas is a solid alpha mask.
    window.dispatchEvent(new CustomEvent('loom:preview:showOriginal'));
  });

  // Fit on load & resize
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);

  // public
  window.LoomaDraw = { fit, drawCanvas };
})();