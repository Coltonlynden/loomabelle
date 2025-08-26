/* Tools & masking (no modules). Ensures mask is never cleared just hidden. */
(function(){
  const $ = s=>document.querySelector(s), $$ = s=>document.querySelectorAll(s);

  const C = {
    wrap: $('#canvasWrap'),
    img:  $('#imgCanvas'),
    mask: $('#maskCanvas'),
    text: $('#textCanvas'),

    file: $('#fileInput'),
    auto: $('#autoBtn'),
    zoomIn: $('#zoomIn'), zoomOut: $('#zoomOut'), zoomPct: $('#zoomPct'),

    segTabs: $$('#modeTabs .chip'),
    panels:  $$('.panel'),

    brushSize: $('#brushSize'),
    toolBtns:  $$('[data-tool]'),
    showMask:  $('#showMask'),
    showEdges: $('#showEdges'),

    textInput: $('#textInput'),
    textSize:  $('#textSize'),
    textCurve: $('#textCurve'),
    textApply: $('#textApply'),

    dirAngle:  $('#dirAngle'),
    dirPattern:$('#dirPattern'),
    showDir:   $('#showDir')
  };

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctxImg  = C.img.getContext('2d');
  const ctxMask = C.mask.getContext('2d', { willReadFrequently:true });
  const ctxText = C.text.getContext('2d');

  let bmp=null;
  const state = {
    mode:'mask', tool:'paint', zoom:1, panX:0, panY:0,
    brush:24, maskHistory:[], redo:[],
    text:{content:'', x:.5, y:.5, px:72, curve:0},
    dir:{angle:45, pattern:'fill'}
  };

  /* ---------- layout ---------- */
  function fit(){
    const w = C.wrap.clientWidth;
    const h = C.wrap.clientHeight || w; // aspect-ratio guard on older Safari
    [C.img,C.mask,C.text].forEach(c=>{
      c.width = Math.max(2, Math.round(w*dpr));
      c.height= Math.max(2, Math.round(h*dpr));
      c.style.width='100%'; c.style.height='100%';
    });
    draw();
  }
  addEventListener('resize', fit);

  /* ---------- file load ---------- */
  C.file?.addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    bmp = await createImageBitmap(f);
    // default mask covers whole image so preview works before edits
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.fillStyle='rgba(0,0,0,0.98)';
    ctxMask.fillRect(0,0,C.mask.width,C.mask.height);
    pushMask();
    fit();
  });

  /* ---------- auto highlight (fast luminance k-means) ---------- */
  C.auto?.addEventListener('click', ()=>{
    if(!bmp) return;
    const W = 256, H = Math.round(W*(bmp.height/bmp.width));
    const t = document.createElement('canvas'); t.width=W; t.height=H;
    const cx = t.getContext('2d'); cx.drawImage(bmp,0,0,W,H);
    const id = cx.getImageData(0,0,W,H);
    const seg = kmeansMask(id);
    // scale to mask canvas
    const up = document.createElement('canvas'); up.width=W; up.height=H;
    up.getContext('2d').putImageData(seg,0,0);
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.drawImage(up,0,0,C.mask.width,C.mask.height);
    pushMask(); draw();
  });

  function kmeansMask(img){
    const {data,width:W,height:H}=img, L=new Float32Array(W*H);
    for(let i=0;i<W*H;i++){ const r=data[i*4],g=data[i*4+1],b=data[i*4+2]; L[i]=0.2126*r+0.7152*g+0.0722*b; }
    let c0=64,c1=192;
    for(let it=0;it<6;it++){
      let s0=0,n0=0,s1=0,n1=0;
      for(let i=0;i<L.length;i++){ const v=L[i]; const d0=Math.abs(v-c0),d1=Math.abs(v-c1); if(d0<d1){s0+=v;n0++;} else {s1+=v;n1++;}}
      c0=s0/(n0||1); c1=s1/(n1||1);
    }
    const dark=c0<c1;
    const out=new Uint8ClampedArray(W*H*4);
    for(let i=0;i<L.length;i++){
      const v=L[i], dD=Math.abs(v-c0), dL=Math.abs(v-c1), fg = dark ? (dD<dL) : (dL<dD);
      out[i*4+3]=fg?235:0;
    }
    return new ImageData(out,W,H);
  }

  /* ---------- tabs ---------- */
  C.segTabs.forEach(b=>b.addEventListener('click',()=>{
    state.mode=b.dataset.mode;
    C.segTabs.forEach(x=>x.classList.toggle('is-active',x===b));
    C.panels.forEach(p=>p.classList.add('hidden'));
    document.querySelector(`.panel[data-panel="${state.mode==='dir'?'dir':state.mode}"]`).classList.remove('hidden');
  }));

  /* ---------- zoom/pan ---------- */
  function setZoom(z){ state.zoom=Math.min(4,Math.max(.25,z)); C.zoomPct.textContent=Math.round(state.zoom*100)+'%'; draw(); }
  C.zoomIn?.addEventListener('click',()=>setZoom(state.zoom*1.2));
  C.zoomOut?.addEventListener('click',()=>setZoom(state.zoom/1.2));
  let panning=false,last=null;
  [C.img,C.mask,C.text].forEach(layer=>{
    layer.addEventListener('pointerdown',e=>{
      if(e.altKey){ panning=true; last=[e.clientX,e.clientY]; layer.setPointerCapture(e.pointerId); }
    });
    layer.addEventListener('pointermove',e=>{
      if(!panning||!last) return;
      state.panX += (e.clientX-last[0])/(C.img.width);
      state.panY += (e.clientY-last[1])/(C.img.height);
      last=[e.clientX,e.clientY]; draw();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>layer.addEventListener(ev,()=>{panning=false;last=null;}));
  });

  /* ---------- tools ---------- */
  C.brushSize?.addEventListener('input',e=>state.brush=+e.target.value);
  C.toolBtns.forEach(b=>b.addEventListener('click',()=>{
    const t=b.dataset.tool;
    if(['paint','erase','wand'].includes(t)) state.tool=t;
    if(t==='undo') undo();
    if(t==='redo') redo();
    if(t==='clear'){ ctxMask.clearRect(0,0,C.mask.width,C.mask.height); pushMask(); draw(); }
    if(t==='fill'){ ctxMask.fillStyle='rgba(0,0,0,0.98)'; ctxMask.fillRect(0,0,C.mask.width,C.mask.height); pushMask(); draw(); }
    C.toolBtns.forEach(x=>x.classList.toggle('is-active',x===b));
  }));

  // draw on MASK layer (ensure on top & interactive via CSS z-index)
  let painting=false;
  C.mask.addEventListener('pointerdown',e=>{
    if(state.mode!=='mask') return;
    C.mask.setPointerCapture(e.pointerId);
    const p=point(e);
    if(state.tool==='wand'){ flood(p.x,p.y); pushMask(); draw(); return; }
    painting=true; dab(p.x,p.y);
  });
  C.mask.addEventListener('pointermove',e=>{ if(state.mode==='mask' && painting){ const p=point(e); dab(p.x,p.y);} });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>C.mask.addEventListener(ev,()=>{ if(painting){painting=false; pushMask();} }));

  function point(e){ const r=C.mask.getBoundingClientRect(); return {x:(e.clientX-r.left)*dpr, y:(e.clientY-r.top)*dpr}; }
  function dab(x,y){
    ctxMask.save();
    ctxMask.globalCompositeOperation=(state.tool==='erase')?'destination-out':'source-over';
    ctxMask.beginPath(); ctxMask.fillStyle='rgba(0,0,0,0.98)';
    ctxMask.arc(x,y, state.brush*dpr, 0, Math.PI*2); ctxMask.fill();
    ctxMask.restore();
    draw();
  }
  function flood(x,y){
    const w=C.img.width,h=C.img.height;
    const src=ctxImg.getImageData(0,0,w,h), dst=ctxMask.getImageData(0,0,w,h);
    const i0=((y|0)*w+(x|0))*4, r0=src.data[i0],g0=src.data[i0+1],b0=src.data[i0+2], tol=28;
    const q=[x|0,y|0], seen=new Uint8Array(w*h);
    while(q.length){
      const yy=q.pop(), xx=q.pop(); if(xx<0||yy<0||xx>=w||yy>=h) continue;
      const id=yy*w+xx; if(seen[id]) continue; seen[id]=1;
      const k=id*4, dr=src.data[k]-r0,dg=src.data[k+1]-g0,db=src.data[k+2]-b0;
      if((dr*dr+dg*dg+db*db)<=tol*tol){ dst.data[k+3]=235; q.push(xx+1,yy,xx-1,yy,xx,yy+1,xx,yy-1); }
    }
    ctxMask.putImageData(dst,0,0);
  }

  function pushMask(){ state.maskHistory.push(ctxMask.getImageData(0,0,C.mask.width,C.mask.height)); if(state.maskHistory.length>20) state.maskHistory.shift(); state.redo.length=0; }
  function undo(){ if(state.maskHistory.length<2) return; const cur=state.maskHistory.pop(); state.redo.push(cur); ctxMask.putImageData(state.maskHistory[state.maskHistory.length-1],0,0); draw(); }
  function redo(){ if(!state.redo.length) return; const im=state.redo.pop(); state.maskHistory.push(im); ctxMask.putImageData(im,0,0); draw(); }

  /* ---------- text ---------- */
  let dragging=false;
  C.text.addEventListener('pointerdown',e=>{
    if(state.mode!=='text') return;
    const r=C.text.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    if(Math.hypot(x-state.text.x,y-state.text.y)<.08){ dragging=true; C.text.setPointerCapture(e.pointerId); }
  });
  C.text.addEventListener('pointermove',e=>{
    if(!dragging||state.mode!=='text') return;
    const r=C.text.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    state.text.x=Math.min(.97,Math.max(.03,x)); state.text.y=Math.min(.97,Math.max(.03,y)); draw();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>C.text.addEventListener(ev,()=>dragging=false));
  C.textApply?.addEventListener('click',()=>{
    state.text.content = C.textInput.value||'';
    state.text.px      = +C.textSize.value;
    state.text.curve   = +C.textCurve.value;
    draw();
  });

  /* ---------- visibility toggles ---------- */
  C.showMask?.addEventListener('change', ()=>{ C.mask.classList.toggle('is-hidden', !C.showMask.checked); });
  C.showEdges?.addEventListener('change', draw);
  C.dirAngle?.addEventListener('input', e=>{state.dir.angle=+e.target.value; draw();});
  C.dirPattern?.addEventListener('input', e=>{state.dir.pattern=e.target.value; draw();});

  /* ---------- render ---------- */
  function draw(){
    [ctxImg,ctxText].forEach(c=>{ c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,C.img.width,C.img.height); });
    if(!bmp) return;

    // image
    ctxImg.drawImage(bmp,0,0,C.img.width,C.img.height);

    // edges overlay
    if(C.showEdges?.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply'; ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for(let i=-C.img.height;i<C.img.width;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+C.img.height,C.img.height); ctxImg.stroke(); }
      ctxImg.restore();
    }

    // text layer
    const t=state.text; if(t.content){
      const cx=C.text.width*t.x, cy=C.text.height*t.y, px=t.px*dpr;
      ctxText.save(); ctxText.fillStyle='rgba(255,255,255,.98)'; ctxText.strokeStyle='rgba(0,0,0,.35)'; ctxText.lineWidth=Math.max(1,px/18);
      if(Math.abs(t.curve)<2){ ctxText.font=`${px}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle'; ctxText.fillText(t.content,cx,cy); ctxText.strokeText(t.content,cx,cy);}
      else { arcText(ctxText,t.content,cx,cy,px,t.curve*Math.PI/180); }
      ctxText.restore();
    }
  }
  function arcText(ctx,str,cx,cy,px,rad){
    const r=Math.max(40*dpr, px*str.length/Math.PI); ctx.font=`${px}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const step=(str.length>1)?(rad/(str.length-1)):0; let a=-rad/2;
    for(const ch of str){ ctx.save(); ctx.translate(cx+Math.cos(a)*r, cy+Math.sin(a)*r); ctx.rotate(a+Math.PI/2); ctx.fillText(ch,0,0); ctx.strokeText(ch,0,0); ctx.restore(); a+=step; }
  }

  /* ---------- expose for preview ---------- */
  window.Editor = {
    getLayers(){ return { base:C.img, mask:C.mask, text:C.text, dir:{...state.dir} }; },
    redraw: draw,
    fit: fit
  };

  fit();
})();