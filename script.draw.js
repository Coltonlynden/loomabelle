// Drawing canvas (pen/eraser), background image, Process Selection -> pipeline with mask
(function(){
  const host = document.getElementById('drawHost');
  const bg = document.getElementById('bgCanvas');
  const draw = document.getElementById('drawCanvas');
  const bctx = bg.getContext('2d');
  const dctx = draw.getContext('2d');

  const toolPen = document.getElementById('toolPen');
  const toolEraser = document.getElementById('toolEraser');
  const toolClear = document.getElementById('toolClear');
  const toolProcess = document.getElementById('toolProcessSel');

  let tool='pen', drawing=false, lastX=0,lastY=0, scale=1, offsetX=0, offsetY=0, bmpForBg=null;

  function fitCanvases(){
    const r = host.getBoundingClientRect();
    [bg,draw].forEach(cv=>{
      cv.width  = Math.floor(r.width * devicePixelRatio);
      cv.height = Math.floor(r.height* devicePixelRatio);
      cv.style.width  = r.width +'px';
      cv.style.height = r.height+'px';
    });
    paintBackground(bmpForBg); // repaint with new fit
  }

  function paintBackground(bmp){
    if(!bmp) return;
    bmpForBg = bmp;
    bctx.setTransform(1,0,0,1,0,0);
    bctx.clearRect(0,0,bg.width,bg.height);
    // letterbox fit & remember transform for drawing coords
    const s = Math.min(bg.width/bmp.width, bg.height/bmp.height);
    const w = Math.floor(bmp.width*s), h = Math.floor(bmp.height*s);
    offsetX = (bg.width - w)>>1; offsetY = (bg.height - h)>>1; scale=s;
    bctx.drawImage(bmp, 0,0,bmp.width,bmp.height, offsetX,offsetY, w,h);
  }

  // external event from preview: set background image
  App.on('draw:bg', ({bmp})=>{ fitCanvases(); paintBackground(bmp); clearDraw(); });

  // drawing
  function pointerXY(e){
    const rect = draw.getBoundingClientRect();
    const x = (e.clientX - rect.left) * devicePixelRatio;
    const y = (e.clientY - rect.top ) * devicePixelRatio;
    return {x,y};
  }
  function drawLine(x,y){
    dctx.lineCap='round'; dctx.lineJoin='round';
    dctx.lineWidth = 16*devicePixelRatio;
    if(tool==='pen'){
      dctx.globalCompositeOperation='source-over';
      dctx.strokeStyle='#0f172a';
    }else{
      dctx.globalCompositeOperation='destination-out';
      dctx.strokeStyle='rgba(0,0,0,1)';
    }
    dctx.beginPath();
    dctx.moveTo(lastX,lastY);
    dctx.lineTo(x,y);
    dctx.stroke();
    lastX=x; lastY=y;
  }
  function onDown(e){ drawing=true; const p=pointerXY(e); lastX=p.x; lastY=p.y; e.preventDefault(); }
  function onMove(e){ if(!drawing) return; drawLine(...Object.values(pointerXY(e))); e.preventDefault(); }
  function onUp(){ drawing=false; dctx.globalCompositeOperation='source-over'; }

  ['pointerdown'].forEach(ev=>draw.addEventListener(ev,onDown));
  ['pointermove' ].forEach(ev=>draw.addEventListener(ev,onMove));
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>draw.addEventListener(ev,onUp));

  function clearDraw(){ dctx.setTransform(1,0,0,1,0,0); dctx.clearRect(0,0,draw.width,draw.height); }
  toolClear.addEventListener('click', clearDraw);

  toolPen.addEventListener('click', ()=>{tool='pen'; toolPen.classList.add('active'); toolEraser.classList.remove('active');});
  toolEraser.addEventListener('click', ()=>{tool='eraser'; toolEraser.classList.add('active'); toolPen.classList.remove('active');});

  // Process Selection with mask
  toolProcess.addEventListener('click', async ()=>{
    if(!App.image){ return modal('Upload a photo first.'); }
    // build a binary mask at the **image** resolution
    const mask = document.createElement('canvas');
    mask.width = App.image.width; mask.height = App.image.height;
    const mx = mask.getContext('2d');

    // un-letterbox & scale drawing back to image space
    const sx = (App.image.width * scale) / (App.image.width); // scale used for background fit (not exact but OK)
    // Simpler: read draw bitmap then map each pixel from draw space back to image space using the inverse of our placement
    const tmp = dctx.getImageData(0,0,draw.width,draw.height).data;
    const mdata = mx.getImageData(0,0,mask.width,mask.height);
    const md = mdata.data;

    // For each pixel in image space, find its location in draw space and copy alpha
    for(let iy=0; iy<mask.height; iy++){
      for(let ix=0; ix<mask.width; ix++){
        const dx = Math.round(ix*scale + offsetX) |0;
        const dy = Math.round(iy*scale + offsetY) |0;
        let a = 0;
        if(dx>=0 && dy>=0 && dx<draw.width && dy<draw.height){
          const di = (dy*draw.width + dx)*4 + 3; // alpha
          a = tmp[di];
        }
        const i = (iy*mask.width + ix)*4;
        md[i]=md[i+1]=md[i+2]=255; md[i+3]=a; // white with alpha from drawing
      }
    }
    mx.putImageData(mdata,0,0);
    App.mask = mask;

    // Run pipeline with progress bar and mask
    const host = document.getElementById('previewHost');
    const bar  = document.getElementById('progressBar');
    const lab  = document.getElementById('progressLabel');
    const wrap = document.getElementById('progressWrap');
    host.classList.remove('hidden'); wrap.classList.remove('hidden');
    const progress = (p,l)=>{ bar.style.transform=`scaleX(${p})`; if(l) lab.textContent=l; };

    const bmp = await Processing.processImage(App.image, mask, {...App.options, noSubject:false}, progress);
    wrap.classList.add('hidden');
    App.lastResult = bmp;
    // switch back to Upload/Preview and show it
    document.querySelector('.tab-btn[data-tab="upload"]').click();
    App.emit('image:loaded', bmp); // preview code will draw it
  });

  // initial size
  new ResizeObserver(fitCanvases).observe(host);
  window.addEventListener('resize', fitCanvases);
  fitCanvases();

  // palette chips
  const sw = document.getElementById('swatches');
  const palette = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#38bdf8','#22d3ee','#34d399','#fde047','#f59e0b','#fb7185','#10b981','#16a34a'];
  sw.innerHTML = palette.map(c=>`<div class="chip" title="${c}" style="background:${c}"></div>`).join('');
})();