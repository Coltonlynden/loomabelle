/* Loomabelle – minimal stable wiring (upload preview, process, draw) */
(function(){
  'use strict';
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>Array.from(p.querySelectorAll(s));
  const ctx = (c)=>c.getContext('2d',{willReadFrequently:true});

  /* elements */
  const els = {
    tabBtns: $$('.tab-btn'), panels: $$('.panel'),
    previewHost: $('#previewHost'), preview: $('#preview'),
    file: $('#file'), drop: $('#drop'),
    btnProcess: $('#btnProcess'), btnHighlight: $('#btnHighlight'),
    optPalette: $('#optPalette'), optOutline: $('#optOutline'), optDensity: $('#optDensity'),
    drawHost: $('#drawHost'), drawUnder: $('#drawUnder'), drawMask: $('#drawMask'),
    toolPen: $('#toolPen'), toolErase: $('#toolErase'), toolClear: $('#toolClear'), toolProcessSel: $('#toolProcessSel'),
    swatches: $('#swatches'),
  };

  /* tabs */
  function activateTab(name){
    els.tabBtns.forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    els.panels.forEach(p=>p.classList.toggle('active', p.dataset.panel===name));
  }
  els.tabBtns.forEach(b=>b.addEventListener('click', ()=>activateTab(b.dataset.tab)));
  $$('[data-scroll="#tabs"]').forEach(b=>b.addEventListener('click', ()=>{
    if(b.dataset.tab) activateTab(b.dataset.tab);
    document.getElementById('tabs').scrollIntoView({behavior:'smooth', block:'start'});
  }));

  /* swatches */
  ['#ef4444','#f472b6','#a78bfa','#60a5fa','#22d3ee','#34d399','#fde047','#fca311','#fb7185','#86efac']
    .forEach(c=>{ const d=document.createElement('div'); d.className='chip'; d.style.background=c; els.swatches.appendChild(d); });

  /* state */
  const state = { imgCanvas:null };

  function showPreview(on){ els.previewHost.classList.toggle('hidden', !on); }
  showPreview(false); // IMPORTANT: hidden on load

  /* upload */
  els.drop.addEventListener('click', ()=> els.file.click());
  els.drop.addEventListener('dragover', e=>{ e.preventDefault(); });
  els.drop.addEventListener('drop', async e=>{
    e.preventDefault();
    const f=e.dataTransfer.files[0]; if(f) await handleFile(f);
  });
  els.file.addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(f) await handleFile(f);
  });

  async function handleFile(file){
    const {canvas:src,W,H}=await Looma.loadImage(file);
    state.imgCanvas=document.createElement('canvas'); state.imgCanvas.width=W; state.imgCanvas.height=H;
    ctx(state.imgCanvas).drawImage(src,0,0);

    // show immediate photo preview
    const pctx=ctx(els.preview); pctx.clearRect(0,0,els.preview.width,els.preview.height);
    const scale=Math.min(els.preview.width/W, els.preview.height/H);
    const w=(W*scale)|0, h=(H*scale)|0, ox=((els.preview.width-w)/2)|0, oy=((els.preview.height-h)/2)|0;
    pctx.fillStyle='#fff'; pctx.fillRect(0,0,els.preview.width,els.preview.height);
    pctx.drawImage(state.imgCanvas,ox,oy,w,h);
    showPreview(true);

    // fill draw-under
    fitDrawCanvases(W,H);
    const u=ctx(els.drawUnder); u.clearRect(0,0,els.drawUnder.width,els.drawUnder.height);
    u.drawImage(state.imgCanvas,0,0,els.drawUnder.width,els.drawUnder.height);
    ctx(els.drawMask).clearRect(0,0,els.drawMask.width,els.drawMask.height);
  }

  /* process */
  function options(){ return { k: els.optPalette.checked?6:10, outline: els.optOutline.checked, density: parseFloat(els.optDensity.value) }; }
  async function process(usingMask){
    if(!state.imgCanvas) return;
    const mask = usingMask? getUserMask() : null;
    const {canvas} = Looma.rasterToPreview({ imgCanvas: state.imgCanvas, userMask: mask, ...options() });
    const pctx=ctx(els.preview); pctx.clearRect(0,0,els.preview.width,els.preview.height);
    const sc=Math.min(els.preview.width/canvas.width, els.preview.height/canvas.height);
    const w=(canvas.width*sc)|0, h=(canvas.height*sc)|0, ox=((els.preview.width-w)/2)|0, oy=((els.preview.height-h)/2)|0;
    pctx.fillStyle='#0a0f1d'; pctx.fillRect(0,0,els.preview.width,els.preview.height);
    pctx.drawImage(canvas,ox,oy,w,h);
  }
  els.btnProcess.addEventListener('click', ()=>process(false));
  els.btnHighlight.addEventListener('click', ()=>activateTab('draw'));

  /* draw tools */
  let drawing=false, erasing=false, lastX=0, lastY=0; const brush={size:18,color:'#0a0f1d'};
  function fitDrawCanvases(W,H){
    const r=els.drawHost.getBoundingClientRect();
    const sc=Math.min(r.width/W,r.height/H);
    const w=Math.max(1,(W*sc)|0), h=Math.max(1,(H*sc)|0);
    [els.drawUnder,els.drawMask].forEach(c=>{ c.width=w; c.height=h; });
  }
  window.addEventListener('resize', ()=>{ if(state.imgCanvas) fitDrawCanvases(state.imgCanvas.width,state.imgCanvas.height); });

  function pos(ev,cnv){ const r=cnv.getBoundingClientRect(); const t=ev.touches?.[0]; const x=(t?t.clientX:ev.clientX)-r.left; const y=(t?t.clientY:ev.clientY)-r.top; return {x,y}; }
  function start(ev){ if(!state.imgCanvas) return; drawing=true; document.body.classList.add('loom-lock'); const p=pos(ev,els.drawMask); lastX=p.x; lastY=p.y; stroke(p.x,p.y,true); ev.preventDefault(); }
  function move(ev){ if(!drawing) return; const p=pos(ev,els.drawMask); stroke(p.x,p.y,false); lastX=p.x; lastY=p.y; ev.preventDefault(); }
  function end(){ drawing=false; document.body.classList.remove('loom-lock'); }
  function stroke(x,y,first){ const c=ctx(els.drawMask); c.globalCompositeOperation=erasing?'destination-out':'source-over'; c.lineWidth=brush.size; c.lineCap='round'; c.strokeStyle=brush.color; c.beginPath(); c.moveTo(lastX,lastY); c.lineTo(x,y); c.stroke(); if(first){ c.beginPath(); c.arc(x,y,brush.size/2,0,Math.PI*2); c.fillStyle=brush.color; c.fill(); } }

  ['mousedown','touchstart'].forEach(e=>els.drawMask.addEventListener(e,start,{passive:false}));
  ['mousemove','touchmove'].forEach(e=>els.drawMask.addEventListener(e,move,{passive:false}));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(e=>els.drawMask.addEventListener(e,end));

  els.toolPen.addEventListener('click', ()=>{ erasing=false; els.toolPen.classList.add('active'); els.toolErase.classList.remove('active'); });
  els.toolErase.addEventListener('click', ()=>{ erasing=true; els.toolErase.classList.add('active'); els.toolPen.classList.remove('active'); });
  els.toolClear.addEventListener('click', ()=> ctx(els.drawMask).clearRect(0,0,els.drawMask.width,els.drawMask.height));
  els.toolProcessSel.addEventListener('click', ()=>{ process(true); activateTab('upload'); });

  els.toolPen.classList.add('active'); // default

  function getUserMask(){
    if(!state.imgCanvas) return null;
    const W=state.imgCanvas.width, H=state.imgCanvas.height;
    const up=document.createElement('canvas'); up.width=W; up.height=H;
    const u=ctx(up); u.imageSmoothingEnabled=false;
    u.drawImage(els.drawMask,0,0,els.drawMask.width,els.drawMask.height,0,0,W,H);
    const d=u.getImageData(0,0,W,H).data, out=new Uint8Array(W*H); let n=0;
    for(let i=0;i<W*H;i++){ const a=d[i*4+3]; if(a>10){ out[i]=1; n++; } }
    return n?out:null;
  }
})();