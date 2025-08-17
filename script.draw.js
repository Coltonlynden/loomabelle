// draw.js — v1.0
(function(){
  const App = (window.App = window.App || {});
  const host = document.getElementById('drawHost');
  const toolPen = document.getElementById('toolPen');
  const toolErase = document.getElementById('toolErase');
  const toolClear = document.getElementById('toolClear');
  const toolProcess = document.getElementById('toolProcess');

  let canvas, ctx, bgCanvas;
  let drawing=false, erase=false, size=16, lastX=0, lastY=0;

  function ensureCanvases(){
    if (canvas) return;
    // drawing canvas
    canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 540;
    canvas.style.touchAction = 'none';
    host.innerHTML = '';
    host.appendChild(canvas);
    ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.lineCap = 'round'; ctx.lineJoin='round';

    // background image layer (rendered beneath)
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    bgCanvas.style.display = 'none'; // not added to DOM
  }

  function toCanvasXY(ev){
    const r = canvas.getBoundingClientRect();
    const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
    const y = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
    const sx = x * (canvas.width/r.width);
    const sy = y * (canvas.height/r.height);
    return {x:sx, y:sy};
  }

  function start(ev){
    if (!App.state.img) return;
    drawing=true;
    const p = toCanvasXY(ev);
    lastX=p.x; lastY=p.y;
    drawDot(p.x,p.y);
    ev.preventDefault();
  }
  function move(ev){
    if(!drawing) return;
    const p = toCanvasXY(ev);
    ctx.globalCompositeOperation = erase ? 'destination-out':'source-over';
    ctx.strokeStyle = erase ? 'rgba(0,0,0,1)' : '#101828';
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(lastX,lastY);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    lastX=p.x; lastY=p.y;
    ev.preventDefault();
  }
  function end(){ drawing=false; }

  function drawDot(x,y){
    ctx.globalCompositeOperation = erase ? 'destination-out':'source-over';
    ctx.fillStyle = erase ? '#000' : '#101828';
    ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill();
  }

  // Public: called when highlight subject is tapped (image already loaded)
  App.prepareDrawSurface = function(){
    ensureCanvases();
    // paint faint background photo beneath the strokes
    const g = bgCanvas.getContext('2d');
    g.clearRect(0,0,bgCanvas.width,bgCanvas.height);
    const iw = App.state.imgW, ih = App.state.imgH;
    const s = Math.min(bgCanvas.width/iw, bgCanvas.height/ih);
    const w = Math.round(iw*s), h = Math.round(ih*s);
    const x = (bgCanvas.width - w)>>1, y = (bgCanvas.height - h)>>1;
    g.globalAlpha = 0.35;
    g.drawImage(App.state.img, x, y, w, h);

    const hctx = host.getContext?.('2d'); // not a canvas; ignore

    // clear previous mask drawing
    ctx.clearRect(0,0,canvas.width,canvas.height);

    toolProcess.disabled = false;
  };

  // export mask back to App.state.mask (Uint8Array at image resolution)
  function commitMaskToState(){
    // scale the drawn mask back to the original image size
    const tmp = document.createElement('canvas');
    tmp.width = App.state.imgW; tmp.height = App.state.imgH;
    const t = tmp.getContext('2d');
    // draw strokes onto tmp while keeping alignment with the photo we showed
    const iw = App.state.imgW, ih = App.state.imgH;
    const s = Math.min(canvas.width/iw, canvas.height/ih);
    const w = Math.round(iw*s), h = Math.round(ih*s);
    const x = (canvas.width - w)>>1, y = (canvas.height - h)>>1;

    // composite: start blank, draw mask area from canvas ROI stretched to original size
    const roi = ctx.getImageData(x, y, w, h);
    const tmpMask = document.createElement('canvas');
    tmpMask.width = w; tmpMask.height = h;
    tmpMask.getContext('2d').putImageData(roi, 0, 0);
    t.drawImage(tmpMask, 0, 0, iw, ih); // scale into original size

    const id = t.getImageData(0,0,iw,ih).data;
    const out = new Uint8Array(iw*ih);
    let count = 0;
    for (let i=0;i<out.length;i++){
      const a = id[i*4+3];
      if (a>10){ out[i]=1; count++; }
    }
    App.state.mask = (count<50) ? null : out;
  }

  // events
  toolPen.addEventListener('click', ()=>{ erase=false; toolPen.classList.add('active'); toolErase.classList.remove('active'); });
  toolErase.addEventListener('click', ()=>{ erase=true; toolErase.classList.add('active'); toolPen.classList.remove('active'); });
  toolClear.addEventListener('click', ()=>{ ensureCanvases(); ctx.clearRect(0,0,canvas.width,canvas.height); App.state.mask=null; });

  ['mousedown','touchstart'].forEach(e=>canvas?.addEventListener(e,start,{passive:false}));
  ['mousemove','touchmove'].forEach(e=>canvas?.addEventListener(e,move,{passive:false}));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(e=>canvas?.addEventListener(e,end,{passive:false}));

  // late-bind after canvas creation
  function bindPointer(){
    ['mousedown','touchstart'].forEach(e=>canvas.addEventListener(e,start,{passive:false}));
    ['mousemove','touchmove'].forEach(e=>canvas.addEventListener(e,move,{passive:false}));
    ['mouseup','mouseleave','touchend','touchcancel'].forEach(e=>canvas.addEventListener(e,end,{passive:false}));
  }

  toolProcess.addEventListener('click', ()=>{
    commitMaskToState();
    // jump back to Upload panel so user can Process Photo with the mask
    (window.App && App.switchTab) && App.switchTab('upload');
    document.getElementById('btnHighlight').classList.remove('active');
  });

  // Expose for upload module to prepare drawing when needed
  App._draw_bindPointers = () => { ensureCanvases(); bindPointer(); };

})();