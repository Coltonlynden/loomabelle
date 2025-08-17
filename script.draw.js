// Drawing canvas (pen/eraser), optional LASSO fill, Process -> back to Upload with preview updated
(function(){
  const host = document.getElementById('drawHost');
  const bg   = document.getElementById('bgCanvas');
  const draw = document.getElementById('drawCanvas');
  const bctx = bg.getContext('2d');
  const dctx = draw.getContext('2d');

  const toolPen      = document.getElementById('toolPen');
  const toolEraser   = document.getElementById('toolEraser');
  const toolClear    = document.getElementById('toolClear');
  const toolProcess  = document.getElementById('toolProcessSel');

  let tool='pen', drawing=false, lastX=0,lastY=0, scale=1, offsetX=0, offsetY=0, bmpForBg=null;
  let lassoMode=false, lassoPts=[];

  const DPR = () => window.devicePixelRatio || 1;

  function fitCanvases(){
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width  * DPR()));
    const h = Math.max(1, Math.floor(r.height * DPR()));
    [bg,draw].forEach(cv=>{
      if (cv.width!==w || cv.height!==h){
        cv.width  = w; cv.height = h;
        cv.style.width  = r.width  + 'px';
        cv.style.height = r.height + 'px';
      }
    });
    paintBackground(bmpForBg);
  }

  function paintBackground(bmp){
    if(!bmp) return;
    bmpForBg = bmp;
    bctx.setTransform(1,0,0,1,0,0);
    bctx.clearRect(0,0,bg.width,bg.height);
    const s = Math.min(bg.width/bmp.width, bg.height/bmp.height);
    const w = Math.floor(bmp.width*s), h = Math.floor(bmp.height*s);
    offsetX = (bg.width - w) >> 1; offsetY = (bg.height - h) >> 1; scale = s;
    bctx.drawImage(bmp, 0,0,bmp.width,bmp.height, offsetX,offsetY, w,h);
  }

  // from Preview
  App.on('draw:bg', ({bmp})=>{ fitCanvases(); paintBackground(bmp); clearDraw(); });
  App.on('draw:lasso', ()=>{ lassoMode = true; lassoPts = []; setTool('pen'); });

  function pointerXY(e){
    const rect = draw.getBoundingClientRect();
    const x = (e.clientX - rect.left) * DPR();
    const y = (e.clientY - rect.top ) * DPR();
    return {x,y};
  }
  function drawLine(x,y){
    dctx.lineCap='round'; dctx.lineJoin='round';
    dctx.lineWidth = 16 * DPR();
    dctx.globalCompositeOperation = (tool==='pen' ? 'source-over' : 'destination-out');
    dctx.strokeStyle = (tool==='pen' ? '#0f172a' : 'rgba(0,0,0,1)';
    dctx.beginPath(); dctx.moveTo(lastX,lastY); dctx.lineTo(x,y); dctx.stroke();
    lastX=x; lastY=y;
  }
  function onDown(e){ drawing=true; const p=pointerXY(e); lastX=p.x; lastY=p.y; e.preventDefault(); if(lassoMode){ lassoPts=[{x:lastX,y:lastY}]; } }
  function onMove(e){ if(!drawing) return; const p=pointerXY(e); drawLine(p.x,p.y); e.preventDefault(); if(lassoMode){ lassoPts.push({x:p.x,y:p.y}); } }
  function onUp(){ drawing=false; dctx.globalCompositeOperation='source-over'; }

  draw.addEventListener('pointerdown', onDown, {passive:false});
  draw.addEventListener('pointermove',  onMove, {passive:false});
  draw.addEventListener('pointerup',    onUp,   {passive:false});
  draw.addEventListener('pointercancel',onUp,   {passive:false});
  draw.addEventListener('pointerleave', onUp,   {passive:false});

  function clearDraw(){ dctx.setTransform(1,0,0,1,0,0); dctx.clearRect(0,0,draw.width,draw.height); lassoPts=[]; }
  if (toolClear) toolClear.addEventListener('click', ()=>{ clearDraw(); lassoMode=false; });

  function setTool(name){
    tool=name;
    if (toolPen)    toolPen.classList.toggle('active', tool==='pen');
    if (toolEraser) toolEraser.classList.toggle('active', tool==='eraser');
  }
  if (toolPen)    toolPen.addEventListener('click', ()=>{ setTool('pen'); lassoMode=false; });
  if (toolEraser) toolEraser.addEventListener('click', ()=>{ setTool('eraser'); lassoMode=false; });

  // Fill the lasso polygon into the draw layer
  function fillLassoIfAny(){
    if (!lassoMode || lassoPts.length < 3) return;
    dctx.save();
    dctx.globalCompositeOperation='source-over';
    dctx.fillStyle='#0f172a';
    dctx.beginPath();
    dctx.moveTo(lassoPts[0].x, lassoPts[0].y);
    for (let i=1;i<lassoPts.length;i++) dctx.lineTo(lassoPts[i].x, lassoPts[i].y);
    dctx.closePath();
    dctx.fill();
    dctx.restore();
    lassoMode = false;
    lassoPts = [];
  }

  // Build mask in image space from draw layer
  function makeMaskFromDraw(targetW, targetH){
    const mask = document.createElement('canvas');
    mask.width = targetW; mask.height = targetH;
    const mx = mask.getContext('2d', {willReadFrequently:true});
    const tmp = dctx.getImageData(0,0,draw.width,draw.height).data;
    const mdata = mx.createImageData(mask.width, mask.height);
    const md = mdata.data;
    for(let iy=0; iy<mask.height; iy++){
      for(let ix=0; ix<mask.width; ix++){
        const dx = Math.round(ix*scale + offsetX);
        const dy = Math.round(iy*scale + offsetY);
        let a = 0;
        if(dx>=0 && dy>=0 && dx<draw.width && dy<draw.height){
          const di = (dy*draw.width + dx)*4 + 3;
          a = tmp[di];
        }
        const i = (iy*mask.width + ix)*4;
        md[i]=md[i+1]=md[i+2]=255; md[i+3]=a;
      }
    }
    mx.putImageData(mdata,0,0);
    return mask;
  }

  // If there is no uploaded image, treat the user's drawing as the source image
  async function sourceFromDrawing(){
    const off = document.createElement('canvas');
    off.width = draw.width; off.height = draw.height;
    const o = off.getContext('2d');
    // background (white or whatever is on bg canvas), then strokes
    if (bg.width && bg.height) o.drawImage(bg,0,0);
    else { o.fillStyle='#ffffff'; o.fillRect(0,0,off.width,off.height); }
    o.drawImage(draw,0,0);
    return await createImageBitmap(off);
  }

  // Process Selection -> pipeline -> Upload tab + preview
  if (toolProcess) toolProcess.addEventListener('click', async ()=>{
    // make a source image:
    const srcBmp = App.image || await sourceFromDrawing();
    if (!App.image) App.image = srcBmp; // so later actions work consistently

    // ensure lasso region becomes solid interior
    fillLassoIfAny();

    // mask follows the drawn alpha (scaled to src size)
    const mask = makeMaskFromDraw(srcBmp.width, srcBmp.height);
    App.mask = mask;

    // make preview visible first
    const previewCard = document.getElementById('previewCard');
    const previewHost = document.getElementById('previewHost');
    if (previewCard) previewCard.style.display='';
    if (previewHost) previewHost.classList.remove('hidden');

    const bar  = document.getElementById('progressBar');
    const lab  = document.getElementById('progressLabel');
    const wrap = document.getElementById('progressWrap');
    if (wrap) wrap.classList.remove('hidden');
    const progress = (p,l)=>{ if(bar) bar.style.transform=`scaleX(${Math.max(0,Math.min(1,p))})`; if(lab && l) lab.textContent=l; };

    const bmp = await Processing.processImage(srcBmp, mask, Object.assign({}, App.options, { noSubject:false }), progress);

    if (wrap) wrap.classList.add('hidden');
    App.lastResult = bmp;

    // hard switch to Upload tab and update preview
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab==='upload'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.dataset.panel==='upload'));
    App.emit('image:loaded', bmp);
  });

  new ResizeObserver(()=>fitCanvases()).observe(host);
  window.addEventListener('resize', fitCanvases);
  fitCanvases();

  // palette chips
  const sw = document.getElementById('swatches');
  if(sw){
    const palette = ['#ef4444','#f472b6','#a78bfa','#60a5fa','#38bdf8','#22d3ee','#34d399','#fde047','#f59e0b','#fb7185','#10b981','#16a34a'];
    sw.innerHTML = palette.map(c=>`<div class="chip" title="${c}" style="background:${c}"></div>`).join('');
  }
})();