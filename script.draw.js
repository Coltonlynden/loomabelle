/* Canvas editing: paint/erase/wand mask, draggable/curved text, zoom/pan, hoop overlay */
const els = {
  img: document.getElementById('imgCanvas'),
  mask: document.getElementById('maskCanvas'),
  text: document.getElementById('textCanvas'),
  hoop: document.getElementById('hoopCanvas'),
  file: document.getElementById('fileInput'),
  auto: document.getElementById('autoBtn'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoomPct: document.getElementById('zoomPct'),
  brushSize: document.getElementById('brushSize'),
  buttons: document.querySelectorAll('[data-tool]'),
  showMask: document.getElementById('showMask'),
  showEdges: document.getElementById('showEdges'),
  segTabs: document.querySelectorAll('.chip--seg'),
  panels: document.querySelectorAll('.panel'),
  textInput: document.getElementById('textInput'),
  textSize: document.getElementById('textSize'),
  textCurve: document.getElementById('textCurve'),
  textApply: document.getElementById('textApply'),
  dirAngle: document.getElementById('dirAngle'),
  dirPattern: document.getElementById('dirPattern'),
  showDir: document.getElementById('showDir'),
  hoopSelect: document.getElementById('hoopSelect'),
  designScale: document.getElementById('designScale'),
};

const ctxImg = els.img.getContext('2d');
const ctxMask = els.mask.getContext('2d', { willReadFrequently:true });
const ctxText = els.text.getContext('2d');
const ctxHoop = els.hoop.getContext('2d');

let imageBitmap = null;
let state = {
  mode: 'mask',
  tool: 'paint',
  zoom: 1, panX: 0, panY: 0,
  brush: 24,
  maskHistory: [],
  redoHistory: [],
  text: { content:'', x: 0.5, y: 0.5, px: 72, curve: 0 },
  dir: { angle: 45, pattern:'fill' },
  hoop: { scale: 0.85 }
};

/* ---------- responsive canvas ---------- */
function fitCanvases() {
  const wrap = document.getElementById('canvasWrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  [els.img, els.mask, els.text, els.hoop].forEach(c => { c.width = w; c.height = h; });
  draw();
}
window.addEventListener('resize', fitCanvases);

/* ---------- tabs ---------- */
function setMode(mode){
  state.mode = mode;
  els.segTabs.forEach(b => b.classList.toggle('is-active', b.dataset.mode===mode));
  els.panels.forEach(p => p.classList.add('hidden'));
  document.querySelector(`.panel[data-panel="${mode==='dir'?'dir':mode}"]`).classList.remove('hidden');
}
els.segTabs.forEach(b=> b.addEventListener('click', ()=> setMode(b.dataset.mode)) );

/* ---------- image upload ---------- */
els.file.addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  imageBitmap = await createImageBitmap(f);
  fitCanvases();
});

/* ---------- auto highlight ---------- */
els.auto.addEventListener('click', ()=>{
  if(!imageBitmap) return;
  const W = 256, H = Math.round(W * (imageBitmap.height/imageBitmap.width));
  const tmp = new OffscreenCanvas(W,H), cx=tmp.getContext('2d');
  cx.drawImage(imageBitmap,0,0,W,H);
  const data = cx.getImageData(0,0,W,H);
  const maskSmall = quickForegroundMask(data);
  ctxMask.clearRect(0,0,els.mask.width,els.mask.height);
  // upscale alpha
  const big = new ImageData(W,H);
  for(let i=0;i<W*H;i++){ big.data[i*4+3] = maskSmall[i]; }
  const tmp2 = new OffscreenCanvas(W,H); tmp2.getContext('2d').putImageData(big,0,0);
  ctxMask.drawImage(tmp2,0,0,els.mask.width,els.mask.height);
  saveMaskSnapshot();
  draw();
});

/* ---------- zoom / pan ---------- */
function setZoom(z){
  state.zoom = Math.max(0.25, Math.min(4, z));
  els.zoomPct.textContent = Math.round(state.zoom*100)+'%';
  draw();
}
els.zoomIn.onclick = ()=>setZoom(state.zoom*1.2);
els.zoomOut.onclick = ()=>setZoom(state.zoom/1.2);
let isPanning = false, lastP = null;
[els.img,els.mask,els.text,els.hoop].forEach(el=>{
  el.addEventListener('pointerdown', (e)=>{
    if(e.altKey){ isPanning=true; lastP=[e.clientX,e.clientY]; el.setPointerCapture(e.pointerId); }
  });
  el.addEventListener('pointermove', (e)=>{
    if(isPanning && lastP){
      state.panX += (e.clientX-lastP[0]) / els.img.width;
      state.panY += (e.clientY-lastP[1]) / els.img.height;
      lastP=[e.clientX,e.clientY]; draw();
    }
  });
  el.addEventListener('pointerup', ()=>{ isPanning=false; lastP=null; });
});

/* ---------- brush size ---------- */
els.brushSize.oninput = e=>{ state.brush = +e.target.value; };

/* ---------- tool buttons ---------- */
els.buttons.forEach(b=>{
  b.addEventListener('click', ()=>{
    const t = b.dataset.tool;
    if(['paint','erase','wand'].includes(t)) state.tool=t;
    if(t==='undo') undoMask();
    if(t==='redo') redoMask();
    if(t==='clear'){ ctxMask.clearRect(0,0,els.mask.width,els.mask.height); saveMaskSnapshot(); draw(); }
    if(t==='fill'){ ctxMask.fillStyle='rgba(0,0,0,0.9)'; ctxMask.fillRect(0,0,els.mask.width,els.mask.height); saveMaskSnapshot(); draw(); }
    els.buttons.forEach(bb=>bb.classList.toggle('is-active', bb.dataset.tool===state.tool));
  });
});

/* ---------- mask interactions ---------- */
let painting=false;
els.mask.addEventListener('pointerdown', e=>{
  if(state.mode!=='mask') return;
  els.mask.setPointerCapture(e.pointerId);
  const p = toCanvasPos(e);
  if(state.tool==='wand'){ floodFillAt(p.x, p.y); saveMaskSnapshot(); draw(); return; }
  painting=true; drawBrush(p.x,p.y);
});
els.mask.addEventListener('pointermove', e=>{
  if(state.mode!=='mask' || !painting) return;
  const p = toCanvasPos(e); drawBrush(p.x,p.y);
});
['pointerup','pointercancel','pointerleave'].forEach(ev=>{
  els.mask.addEventListener(ev, ()=>{ if(painting){ painting=false; saveMaskSnapshot(); } });
});
function drawBrush(x,y){
  ctxMask.save();
  ctxMask.globalCompositeOperation = (state.tool==='erase')?'destination-out':'source-over';
  ctxMask.fillStyle='rgba(0,0,0,0.9)';
  ctxMask.beginPath();
  ctxMask.arc(x, y, state.brush*(els.mask.width/900), 0, Math.PI*2);
  ctxMask.fill();
  ctxMask.restore();
  draw();
}
function floodFillAt(x,y){
  const img = ctxImg.getImageData(0,0,els.img.width,els.img.height);
  const mask = ctxMask.getImageData(0,0,els.mask.width,els.mask.height);
  const w=img.width,h=img.height;
  const i0 = ((y|0)*w + (x|0)) * 4;
  const sr=img.data[i0], sg=img.data[i0+1], sb=img.data[i0+2];
  const tol = 28; const q=[x|0, y|0], seen=new Uint8Array(w*h);
  const set = (xx,yy)=>{ const j=(yy*w+xx)*4+3; mask.data[j]=Math.max(mask.data[j],220); };
  while(q.length){
    const yy = q.pop(), xx = q.pop();
    const idx=(yy*w+xx);
    if(xx<0||yy<0||xx>=w||yy>=h) continue;
    if(seen[idx]) continue; seen[idx]=1;
    const k=idx*4;
    const dr=img.data[k]-sr, dg=img.data[k+1]-sg, db=img.data[k+2]-sb;
    if((dr*dr+dg*dg+db*db) <= tol*tol){
      set(xx,yy);
      q.push(xx+1,yy, xx-1,yy, xx,yy+1, xx,yy-1);
    }
  }
  ctxMask.putImageData(mask,0,0);
}

/* ---------- text tool ---------- */
let draggingText=false;
els.text.addEventListener('pointerdown', e=>{
  if(state.mode!=='text') return;
  const p = toNrm(e);
  if(Math.hypot(p.x-state.text.x, p.y-state.text.y) < 0.06){ draggingText=true; els.text.setPointerCapture(e.pointerId); }
});
els.text.addEventListener('pointermove', e=>{
  if(state.mode!=='text' || !draggingText) return;
  const p = toNrm(e);
  state.text.x = Math.min(0.97,Math.max(0.03,p.x));
  state.text.y = Math.min(0.97,Math.max(0.03,p.y));
  draw();
});
['pointerup','pointercancel','pointerleave'].forEach(ev=> els.text.addEventListener(ev, ()=> draggingText=false));
els.textApply.onclick = ()=>{
  state.text.content = els.textInput.value || '';
  state.text.px      = +els.textSize.value;
  state.text.curve   = +els.textCurve.value;
  draw();
};

/* ---------- toggles & hoop ---------- */
els.showMask.onchange = draw;
els.showEdges.onchange = draw;
els.dirAngle.oninput = e=>{ state.dir.angle=+e.target.value; draw(); };
els.dirPattern.oninput = e=>{ state.dir.pattern=e.target.value; draw(); };
els.showDir.onchange = draw;
els.hoopSelect.oninput = drawHoop;
els.designScale.oninput = e=>{ state.hoop.scale = +e.target.value/100; drawHoop(); };

/* ---------- helpers ---------- */
function toCanvasPos(e){ const r = els.img.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
function toNrm(e){ const p = toCanvasPos(e); return { x:p.x/els.img.width, y:p.y/els.img.height }; }
function saveMaskSnapshot(){
  state.maskHistory.push(ctxMask.getImageData(0,0,els.mask.width,els.mask.height));
  if(state.maskHistory.length>20) state.maskHistory.shift();
  state.redoHistory.length=0;
}
function undoMask(){
  if(state.maskHistory.length<2) return;
  const cur = state.maskHistory.pop();
  state.redoHistory.push(cur);
  ctxMask.putImageData(state.maskHistory[state.maskHistory.length-1],0,0);
  draw();
}
function redoMask(){
  if(!state.redoHistory.length) return;
  const img = state.redoHistory.pop();
  state.maskHistory.push(img);
  ctxMask.putImageData(img,0,0); draw();
}

/* ---------- draw pipeline ---------- */
function draw(){
  [ctxImg,ctxMask,ctxText,ctxHoop].forEach(c=>c.setTransform(1,0,0,1,0,0));
  ctxImg.clearRect(0,0,els.img.width,els.img.height);
  ctxText.clearRect(0,0,els.text.width,els.text.height);
  if(!imageBitmap){ drawHoop(); return; }

  const scale = state.zoom;
  const tx = (els.img.width  * (0.5+state.panX)) - (els.img.width/2)*scale;
  const ty = (els.img.height * (0.5+state.panY)) - (els.img.height/2)*scale;
  [ctxImg,ctxMask,ctxText,ctxHoop].forEach(c=> c.setTransform(scale,0,0,scale, -tx*scale, -ty*scale));

  ctxImg.drawImage(imageBitmap,0,0,els.img.width,els.img.height);

  if(els.showEdges.checked){
    ctxImg.save(); ctxImg.globalCompositeOperation='multiply'; ctxImg.strokeStyle='rgba(50,50,50,.35)'; ctxImg.lineWidth=1;
    for(let i=-els.img.height;i<els.img.width;i+=12){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+els.img.height,els.img.height); ctxImg.stroke(); }
    ctxImg.restore();
  }

  if(state.text.content){
    ctxText.save();
    ctxText.fillStyle='rgba(255,255,255,.96)'; ctxText.strokeStyle='rgba(0,0,0,.35)'; ctxText.lineWidth=Math.max(1,state.text.px/18);
    const cx = state.text.x*els.text.width, cy = state.text.y*els.text.height, px=state.text.px;
    if(Math.abs(state.text.curve) < 2){
      ctxText.font = `${px}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle';
      ctxText.fillText(state.text.content, cx, cy); ctxText.strokeText(state.text.content, cx, cy);
    }else{
      drawArcText(ctxText, state.text.content, cx, cy, px, state.text.curve*Math.PI/180);
    }
    ctxText.restore();
  }
  drawHoop();
}
function drawHoop(){
  ctxHoop.setTransform(1,0,0,1,0,0); ctxHoop.clearRect(0,0,els.hoop.width,els.hoop.height);
  const wpx=els.hoop.width, hpx=els.hoop.height, pad=10, hoopW=wpx-pad*2, hoopH=hpx-pad*2;
  ctxHoop.save(); ctxHoop.translate(wpx/2,hpx/2);
  const sel = document.getElementById('hoopSelect').value.split('x').map(Number);
  const arCanvas=wpx/hpx, arHoop=sel[0]/sel[1];
  let rx=hoopW/2, ry=hoopH/2; if(arHoop>arCanvas){ ry=rx/arHoop; } else { rx=ry*arHoop; }
  rx*=state.hoop.scale; ry*=state.hoop.scale;

  ctxHoop.lineWidth=14; ctxHoop.strokeStyle='rgba(201,155,75,.95)';
  ctxHoop.beginPath(); ctxHoop.ellipse(0,0,rx+12,ry+12,0,0,Math.PI*2); ctxHoop.stroke();
  ctxHoop.lineWidth=6; ctxHoop.strokeStyle='rgba(238,208,140,1)';
  ctxHoop.beginPath(); ctxHoop.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctxHoop.stroke();

  ctxHoop.globalCompositeOperation='destination-over';
  const g=ctxHoop.createRadialGradient(0,0,Math.min(rx,ry),0,0,Math.max(rx,ry)*1.2);
  g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(1,'rgba(255,255,255,.85)');
  ctxHoop.fillStyle=g; ctxHoop.fillRect(-wpx,-hpx,wpx*2,hpx*2);
  ctxHoop.restore();
}
function drawArcText(ctx, str, cx, cy, px, rad){
  const r=Math.max(40, px*str.length/Math.PI);
  ctx.font=`${px}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const step=(str.length>1)?(rad/(str.length-1)):0; let ang=-rad/2;
  for(const ch of str){ ctx.save(); ctx.translate(cx+Math.cos(ang)*r, cy+Math.sin(ang)*r); ctx.rotate(ang+Math.PI/2); ctx.fillText(ch,0,0); ctx.strokeText(ch,0,0); ctx.restore(); ang+=step; }
}
function quickForegroundMask(img){
  const {data,width:W,height:H}=img; const L=new Float32Array(W*H);
  for(let i=0;i<W*H;i++){ const r=data[i*4],g=data[i*4+1],b=data[i*4+2]; L[i]=0.2126*r+0.7152*g+0.0722*b; }
  let c0=64,c1=192;
  for(let it=0;it<6;it++){ let s0=0,n0=0,s1=0,n1=0; for(let i=0;i<L.length;i++){ const v=L[i]; const d0=Math.abs(v-c0), d1=Math.abs(v-c1); if(d0<d1){s0+=v;n0++;} else {s1+=v;n1++;} } c0=s0/(n0||1); c1=s1/(n1||1); }
  const fgIsDark=c0<c1; const out=new Uint8ClampedArray(W*H);
  for(let i=0;i<L.length;i++){ const v=L[i]; const dDark=Math.abs(v-c0), dLight=Math.abs(v-c1); const isFg= fgIsDark ? (dDark<dLight) : (dLight<dDark); out[i]=isFg?220:0; }
  const tmp=out.slice(); const R=2;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ let s=0,t=0; for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){ const xx=Math.min(W-1,Math.max(0,x+dx)); const yy=Math.min(H-1,Math.max(0,y+dy)); s+=tmp[yy*W+xx]; t++; } out[y*W+x]=(s/t>110)?220:0; }
  return out;
}

/* expose for preview module */
export function getCurrentLayers(){ return { baseCanvas:els.img, maskCanvas:els.mask, textCanvas:els.text, dir:{...state.dir}, hoop:{ scale:state.hoop.scale, select: document.getElementById('hoopSelect').value } }; }
export function fitCanvasesPublic(){ fitCanvases(); }

/* start */
fitCanvases();