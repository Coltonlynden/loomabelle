// Plain-script version (no modules). Tools + image appear; mask defaults to full.

(function(){
  const els = {
    img: q('#imgCanvas'), mask: q('#maskCanvas'), text: q('#textCanvas'),
    file: q('#fileInput'), auto: q('#autoBtn'),
    zoomIn: q('#zoomIn'), zoomOut: q('#zoomOut'), zoomPct: q('#zoomPct'),
    brushSize: q('#brushSize'), buttons: qa('[data-tool]'),
    showMask: q('#showMask'), showEdges: q('#showEdges'),
    segTabs: qa('#modeTabs .chip'), panels: qa('.panel'),
    textInput: q('#textInput'), textSize: q('#textSize'), textCurve: q('#textCurve'),
    textApply: q('#textApply'), dirAngle: q('#dirAngle'), dirPattern: q('#dirPattern'),
    showDir: q('#showDir')
  };
  const ctxImg = els.img.getContext('2d');
  const ctxMask = els.mask.getContext('2d', { willReadFrequently:true });
  const ctxText = els.text.getContext('2d');

  let imageBitmap=null;
  const state={mode:'mask', tool:'paint', zoom:1, panX:0, panY:0, brush:24,
    maskHistory:[], redoHistory:[], text:{content:'',x:.5,y:.5,px:72,curve:0},
    dir:{angle:45, pattern:'fill'}};

  function q(s){return document.querySelector(s)} function qa(s){return document.querySelectorAll(s)}

  // tabs
  els.segTabs.forEach(b=>b.addEventListener('click',()=>{
    state.mode=b.dataset.mode;
    els.segTabs.forEach(x=>x.classList.toggle('is-active',x===b));
    els.panels.forEach(p=>p.classList.add('hidden'));
    q(`.panel[data-panel="${state.mode==='dir'?'dir':state.mode}"]`).classList.remove('hidden');
  }));

  // responsive canvases
  function fit(){ const wrap=q('#canvasWrap'); const w=wrap.clientWidth, h=wrap.clientHeight;
    [els.img,els.mask,els.text].forEach(c=>{c.width=w*devicePixelRatio;c.height=h*devicePixelRatio; c.style.width='100%'; c.style.height='100%';});
    draw();
  }
  window.addEventListener('resize',fit);

  // upload
  els.file.addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    imageBitmap = await createImageBitmap(f);
    fit();
    // default mask: full
    ctxMask.clearRect(0,0,els.mask.width,els.mask.height);
    ctxMask.fillStyle='rgba(0,0,0,0.96)'; ctxMask.fillRect(0,0,els.mask.width,els.mask.height);
    pushMask();
  });

  // auto highlight (fast luminance clustering)
  els.auto.addEventListener('click', ()=>{
    if(!imageBitmap) return;
    const W=256, H=Math.round(W*(imageBitmap.height/imageBitmap.width));
    const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
    const cx=tmp.getContext('2d'); cx.drawImage(imageBitmap,0,0,W,H);
    const seg=autoMask(cx.getImageData(0,0,W,H));
    ctxMask.clearRect(0,0,els.mask.width,els.mask.height);
    const up=document.createElement('canvas'); up.width=W; up.height=H; up.getContext('2d').putImageData(new ImageData(seg, W, H),0,0);
    ctxMask.drawImage(up,0,0,els.mask.width,els.mask.height);
    pushMask(); draw();
  });

  // zoom / pan
  function setZoom(z){ state.zoom=Math.max(.25,Math.min(4,z)); els.zoomPct.textContent=Math.round(state.zoom*100)+'%'; draw();}
  els.zoomIn.onclick=()=>setZoom(state.zoom*1.2); els.zoomOut.onclick=()=>setZoom(state.zoom/1.2);
  let panning=false,last=null;
  [els.img,els.mask,els.text].forEach(c=>{
    c.addEventListener('pointerdown',e=>{ if(e.altKey){panning=true;last=[e.clientX,e.clientY]; c.setPointerCapture(e.pointerId);} });
    c.addEventListener('pointermove',e=>{ if(!panning||!last) return; state.panX+=(e.clientX-last[0])/els.img.width; state.panY+=(e.clientY-last[1])/els.img.height; last=[e.clientX,e.clientY]; draw(); });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=> c.addEventListener(ev,()=>{panning=false;last=null;}));
  });

  // tools
  els.brushSize.oninput=e=> state.brush=+e.target.value;
  els.buttons.forEach(b=>b.addEventListener('click',()=>{
    const t=b.dataset.tool;
    if(['paint','erase','wand'].includes(t)) state.tool=t;
    if(t==='undo') undo(); if(t==='redo') redo();
    if(t==='clear'){ ctxMask.clearRect(0,0,els.mask.width,els.mask.height); pushMask(); draw();}
    if(t==='fill'){ ctxMask.fillStyle='rgba(0,0,0,0.96)'; ctxMask.fillRect(0,0,els.mask.width,els.mask.height); pushMask(); draw();}
    els.buttons.forEach(bb=>bb.classList.toggle('is-active',bb.dataset.tool===state.tool));
  }));

  let painting=false;
  els.mask.addEventListener('pointerdown',e=>{
    if(state.mode!=='mask') return;
    els.mask.setPointerCapture(e.pointerId);
    const p=pt(e);
    if(state.tool==='wand'){ flood(p.x,p.y); pushMask(); draw(); return; }
    painting=true; dab(p.x,p.y);
  });
  els.mask.addEventListener('pointermove',e=>{ if(state.mode==='mask' && painting){ const p=pt(e); dab(p.x,p.y);} });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> els.mask.addEventListener(ev,()=>{ if(painting){painting=false; pushMask();} }));

  function pt(e){ const r=els.mask.getBoundingClientRect(); return {x:(e.clientX-r.left)*devicePixelRatio, y:(e.clientY-r.top)*devicePixelRatio};}
  function dab(x,y){
    ctxMask.save();
    ctxMask.globalCompositeOperation=(state.tool==='erase')?'destination-out':'source-over';
    ctxMask.fillStyle='rgba(0,0,0,0.96)';
    ctxMask.beginPath(); ctxMask.arc(x,y, state.brush*devicePixelRatio, 0, Math.PI*2); ctxMask.fill();
    ctxMask.restore();
  }
  function flood(x,y){
    const w=els.img.width,h=els.img.height;
    const src=ctxImg.getImageData(0,0,w,h), dst=ctxMask.getImageData(0,0,w,h);
    const i0=((y|0)*w+(x|0))*4, r0=src.data[i0],g0=src.data[i0+1],b0=src.data[i0+2], tol=30;
    const Q=[x|0,y|0], seen=new Uint8Array(w*h);
    while(Q.length){
      const yy=Q.pop(), xx=Q.pop(); if(xx<0||yy<0||xx>=w||yy>=h) continue;
      const id=(yy*w+xx); if(seen[id]) continue; seen[id]=1;
      const k=id*4, dr=src.data[k]-r0,dg=src.data[k+1]-g0,db=src.data[k+2]-b0;
      if((dr*dr+dg*dg+db*db)<=tol*tol){ dst.data[k+3]=230; Q.push(xx+1,yy,xx-1,yy,xx,yy+1,xx,yy-1); }
    }
    ctxMask.putImageData(dst,0,0);
  }
  function pushMask(){ state.maskHistory.push(ctxMask.getImageData(0,0,els.mask.width,els.mask.height)); if(state.maskHistory.length>20) state.maskHistory.shift(); state.redoHistory.length=0; }
  function undo(){ if(state.maskHistory.length<2) return; const cur=state.maskHistory.pop(); state.redoHistory.push(cur); ctxMask.putImageData(state.maskHistory[state.maskHistory.length-1],0,0); draw(); }
  function redo(){ if(!state.redoHistory.length) return; const img=state.redoHistory.pop(); state.maskHistory.push(img); ctxMask.putImageData(img,0,0); draw(); }

  // text
  let dragging=false;
  els.text.addEventListener('pointerdown',e=>{
    if(state.mode!=='text') return;
    const r=els.text.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    if(Math.hypot(x-state.text.x,y-state.text.y)<.08){ dragging=true; els.text.setPointerCapture(e.pointerId); }
  });
  els.text.addEventListener('pointermove',e=>{
    if(!dragging||state.mode!=='text') return;
    const r=els.text.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    state.text.x=Math.min(.97,Math.max(.03,x)); state.text.y=Math.min(.97,Math.max(.03,y)); draw();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> els.text.addEventListener(ev,()=> dragging=false));
  els.textApply.onclick=()=>{ state.text.content=els.textInput.value||''; state.text.px=+els.textSize.value; state.text.curve=+els.textCurve.value; draw(); };

  // toggles
  els.showMask.onchange=draw; els.showEdges.onchange=draw;
  els.dirAngle.oninput=e=>{state.dir.angle=+e.target.value; draw();};
  els.dirPattern.oninput=e=>{state.dir.pattern=e.target.value; draw();};

  // draw
  function draw(){
    [ctxImg,ctxMask,ctxText].forEach(c=>{ c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,els.img.width,els.img.height); });
    if(!imageBitmap) return;
    ctxImg.drawImage(imageBitmap,0,0,els.img.width,els.img.height);

    if(els.showEdges.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply'; ctxImg.strokeStyle='rgba(50,50,50,.28)'; ctxImg.lineWidth=1;
      for(let i=-els.img.height;i<els.img.width;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+els.img.height,els.img.height); ctxImg.stroke(); }
      ctxImg.restore();
    }
    if(!els.showMask.checked) { ctxMask.clearRect(0,0,els.mask.width,els.mask.height); }

    // text
    if(state.text.content){
      const cx=els.text.width*state.text.x, cy=els.text.height*state.text.y, px=state.text.px*devicePixelRatio;
      ctxText.save();
      ctxText.fillStyle='rgba(255,255,255,.96)'; ctxText.strokeStyle='rgba(0,0,0,.35)'; ctxText.lineWidth=Math.max(1,px/18);
      if(Math.abs(state.text.curve)<2){ ctxText.font=`${px}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle'; ctxText.fillText(state.text.content,cx,cy); ctxText.strokeText(state.text.content,cx,cy); }
      else{ const rad=state.text.curve*Math.PI/180; arcText(ctxText,state.text.content,cx,cy,px,rad); }
      ctxText.restore();
    }
  }
  function arcText(ctx,str,cx,cy,px,rad){
    const r=Math.max(40*devicePixelRatio, px*str.length/Math.PI); ctx.font=`${px}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const step=(str.length>1)?(rad/(str.length-1)):0; let a=-rad/2; for(const ch of str){ ctx.save(); ctx.translate(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.rotate(a+Math.PI/2); ctx.fillText(ch,0,0); ctx.strokeText(ch,0,0); ctx.restore(); a+=step; }
  }

  function autoMask(imgData){
    const {data,width:W,height:H}=imgData; const L=new Float32Array(W*H);
    for(let i=0;i<W*H;i++){ const r=data[i*4],g=data[i*4+1],b=data[i*4+2]; L[i]=0.2126*r+0.7152*g+0.0722*b; }
    let c0=64,c1=192; for(let it=0;it<6;it++){ let s0=0,n0=0,s1=0,n1=0; for(let i=0;i<L.length;i++){ const v=L[i]; const d0=Math.abs(v-c0),d1=Math.abs(v-c1); if(d0<d1){s0+=v;n0++;} else {s1+=v;n1++;} } c0=s0/(n0||1); c1=s1/(n1||1); }
    const fgDark=c0<c1; const out=new Uint8ClampedArray(W*H*4);
    for(let i=0;i<L.length;i++){ const v=L[i]; const dD=Math.abs(v-c0), dL=Math.abs(v-c1); const fg= fgDark ? (dD<dL) : (dL<dD); out[i*4]=0;out[i*4+1]=0;out[i*4+2]=0;out[i*4+3]=fg?220:0; }
    return new ImageData(out,W,H);
  }

  // expose for preview script
  window.Editor = {
    getLayers(){ return { base:els.img, mask:els.mask, text:els.text, dir:{...state.dir} }; },
    redraw: draw,
    fit: fit
  };

  fit();
})();