/* Drawing tab: freehand pen/eraser; builds a mask used by Highlight Subject */
(() => {
  const $ = s => document.querySelector(s);
  const host = $('#drawHost');
  const canvas = $('#drawCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function size() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = r.width*dpr|0; canvas.height = r.height*dpr|0;
    canvas.style.width='100%'; canvas.style.height='100%';
    // keep existing mask when resizing by redrawing scaled (optional)
  }
  size();
  window.addEventListener('resize', size);

  let drawing=false, erasing=false;
  const penW = 10;

  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    const x = ( (e.touches?e.touches[0].clientX:e.clientX) - rect.left ) * dpr;
    const y = ( (e.touches?e.touches[0].clientY:e.clientY) - rect.top ) * dpr;
    return {x,y};
  }

  function begin(e){
    drawing = true;
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.strokeStyle = erasing ? 'rgba(0,0,0,0)' : '#000'; // black mask
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.lineWidth = penW * Math.min(window.devicePixelRatio||1, 2);
    const {x,y}=pos(e); ctx.beginPath(); ctx.moveTo(x,y);
  }
  function move(e){
    if(!drawing) return;
    const {x,y}=pos(e); ctx.lineTo(x,y); ctx.stroke();
    e.preventDefault();
  }
  function end(){ drawing=false; }

  canvas.addEventListener('mousedown',begin);
  canvas.addEventListener('mousemove',move);
  window.addEventListener('mouseup',end);
  canvas.addEventListener('touchstart',begin,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',end);

  $('#toolPen').addEventListener('click',()=>{erasing=false;});
  $('#toolErase').addEventListener('click',()=>{erasing=true;});
  $('#toolClear').addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);});

  // Turn the drawn selection into a subject mask and return to Upload tab
  $('#toolProcessSel').addEventListener('click', ()=>{
    // Build a filled region from the strokes: thicken -> blur -> threshold
    const mask = document.createElement('canvas');
    mask.width = canvas.width; mask.height = canvas.height;
    const mctx = mask.getContext('2d');
    mctx.drawImage(canvas,0,0);
    // thicken
    mctx.globalCompositeOperation='source-over';
    for(let i=0;i<3;i++) mctx.drawImage(mask, -1,0), mctx.drawImage(mask,1,0), mctx.drawImage(mask,0,-1), mctx.drawImage(mask,0,1);
    LB.maskCanvas = mask;
    document.querySelector('[data-tab="upload"]').click(); // back to upload
    LBRepaint();
  });

  // sync the drawing canvas to uploaded image aspect, so tracing fits
  window.LBSetDrawBackground = (photoCanvas)=>{
    // Draw the photo underneath with low alpha (guide)
    size();
    const guide = host.querySelector('.guide') || document.createElement('canvas');
    guide.className='guide'; guide.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:.4;pointer-events:none;';
    host.prepend(guide);
    guide.width = canvas.width; guide.height = canvas.height;
    guide.getContext('2d').drawImage(photoCanvas,0,0,guide.width,guide.height);
    ctx.clearRect(0,0,canvas.width,canvas.height);
  };
})();