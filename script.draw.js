/* Editing: upload, paint/erase/wand on mask, draggable/curved text, zoom/pan.
   The mask defaults to FULL IMAGE so stitches generate even without edits. */
const els = {
  img: document.getElementById('imgCanvas'),
  mask: document.getElementById('maskCanvas'),
  text: document.getElementById('textCanvas'),
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
  designScale: document.getElementById('designScale') // optional (not shown)
};

const ctxImg = els.img.getContext('2d');
const ctxMask = els.mask.getContext('2d', { willReadFrequently:true });
const ctxText = els.text.getContext('2d');

let imageBitmap = null;
let state = {
  mode:'mask', tool:'paint', zoom:1, panX:0, panY:0, brush:24,
  maskHistory:[], redoHistory:[],
  text:{ content:'', x:0.5, y:0.5, px:72, curve:0 },
  dir:{ angle:45, pattern:'fill' }
};

/* ---------- responsive ---------- */
function fitCanvases(){
  const wrap=document.getElementById('canvasWrap');
  const w=wrap.clientWidth, h=wrap.clientHeight;
  [els.img,els.mask,els.text].forEach(c=>{ c.width=w; c.height=h; });
  draw();
}
window.addEventListener('resize', fitCanvases);

/* ---------- tabs ---------- */
function setMode(m){
  state.mode=m;
  els.segTabs.forEach(b=>b.classList.toggle('is-active', b.dataset.mode===m));
  els.panels.forEach(p=>p.classList.add('hidden'));
  document.querySelector(`.panel[data-panel="${m==='dir'?'dir':m}"]`).classList.remove('hidden');
}
els.segTabs.forEach(b=> b.addEventListener('click', ()=> setMode(b.dataset.mode)) );

/* ---------- upload ---------- */
els.file.addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  imageBitmap = await createImageBitmap(f);
  fitCanvases();
  // default mask = full image (so stitches happen)
  ctxMask.clearRect(0,0,els.mask.width,els.mask.height);
  ctxMask.fillStyle='rgba(0,0,0,0.95)';
  ctxMask.fillRect(0,0,els.mask.width,els.mask.height);
  saveMask();
});

/* ---------- auto highlight ---------- */
els.auto.addEventListener('click', ()=>{
  if(!imageBitmap) return;
  const W=256,H=Math.round(W*(imageBitmap.height/imageBitmap.width));
  const off=new OffscreenCanvas(W,H), cx=off.getContext('2d');
  cx.drawImage(imageBitmap,0,0,W,H);
  const seg=autoMask(cx.getImageData(0,0,W,H));
  ctxMask.clearRect(0,0,els.mask.width,els.mask.height);
  const put=new ImageData(W,H);
  for(let i=0;i<W*H;i++){ put.data[i*4+3]=seg[i]; }
  const up=new OffscreenCanvas(W,H); up.getContext('2d').putImageData(put,0,0);
  ctxMask.drawImage(up,0,0,els.mask.width,els.mask.height);
  saveMask(); draw();
});

/* ---------- zoom/pan ---------- */
function setZoom(z){ state.zoom=Math.max(.25,Math.min(4,z)); els.zoomPct.textContent=Math.round(state.zoom*100)+'%'; draw(); }
els.zoomIn.onclick=()=>setZoom(state.zoom*1.2);
els.zoomOut.onclick=()=>setZoom(state.zoom/1.2);
let pan=false,last=null;
[els.img,els.mask,els.text].forEach(c=>{
  c.addEventListener('pointerdown',e=>{ if(e.altKey){pan=true;last=[e.clientX,e.clientY]; c.setPointerCapture(e.pointerId);} });
  c.addEventListener('pointermove',e=>{ if(!pan||!last) return; state.panX+=(e.clientX-last[0])/els.img.width; state.panY+=(e.clientY-last[1])/els.img.height; last=[e.clientX,e.clientY]; draw(); });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> c.addEventListener(ev,()=>{pan=false;last=null;}));
});

/* ---------- brush ---------- */
els.brushSize.oninput=e=> state.brush=+e.target.value;
els.buttons.forEach(b=>b.addEventListener('click',()=>{
  const t=b.dataset.tool;
  if(['paint','erase','wand'].includes(t)){ state.tool=t; }
  if(t==='undo') undo(); if(t==='redo') redo();
  if(t==='clear'){ ctxMask.clearRect(0,0,els.mask.width,els.mask.height); saveMask(); draw(); }
  if(t==='fill'){ ctxMask.fillStyle='rgba(0,0,0,0.95)'; ctxMask.fillRect(0,0,els.mask.width,els.mask.height); saveMask(); draw(); }
  els.buttons.forEach(bb=>bb.classList.toggle('is-active', bb.dataset.tool===state.tool));
}));

let painting=false;
els.mask.addEventListener('pointerdown',e=>{
  if(state.mode!=='mask') return;
  els.mask.setPointerCapture(e.pointerId);
  const p=pos(e);
  if(state.tool==='wand'){ wand(p.x,p.y); saveMask(); draw(); return; }
  painting=true; brush(p.x,p.y);
});
els.mask.addEventListener('pointermove',e=>{ if(state.mode==='mask' && painting){ const p=pos(e); brush(p.x,p.y);} });
['pointerup','pointercancel','pointerleave'].forEach(ev=> els.mask.addEventListener(ev,()=>{ if(painting){painting=false; saveMask();} }));

function brush(x,y){
  ctxMask.save();
  ctxMask.globalCompositeOperation = (state.tool==='erase')?'destination-out':'source-over';
  ctxMask.fillStyle='rgba(0,0,0,0.95)';
  ctxMask.beginPath(); ctxMask.arc(x,y, state.brush*(els.mask.width/900), 0, Math.PI*2); ctxMask.fill();
  ctxMask.restore(); draw();
}
function wand(x,y){
  const img=ctxImg.getImageData(0,0,els.img.width,els.img.height);
  const dst=ctxMask.getImageData(0,0,els.mask.width,els.mask.height);
  const w=img.width,h=img.height; const i0=((y|0)*w+(x|0))*4;
  const r0=img.data[i0],g0=img.data[i0+1],b0=img.data[i0+2], tol=28;
  const q=[x|0,y|0], seen=new Uint8Array(w*h);
  while(q.length){
    const yy=q.pop(), xx=q.pop(); if(xx<0||yy<0||xx>=w||yy>=h) continue;
    const id=(yy*w+xx); if(seen[id]) continue; seen[id]=1;
    const k=id*4, dr=img.data[k]-r0,dg=img.data[k+1]-g0,db=img.data[k+2]-b0;
    if((dr*dr+dg*dg+db*db)<=tol*tol){ dst.data[k+3]=220; q.push(xx+1,yy,xx-1,yy,xx,yy+1,xx,yy-1); }
  }
  ctxMask.putImageData(dst,0,0);
}

/* ---------- text ---------- */
let dragging=false;
els.text.addEventListener('pointerdown',e=>{
  if(state.mode!=='text') return;
  const p=norm(e); if(Math.hypot(p.x-state.text.x,p.y-state.text.y)<.06){ dragging=true; els.text.setPointerCapture(e.pointerId); }
});
els.text.addEventListener('pointermove',e=>{
  if(!dragging || state.mode!=='text') return;
  const p=norm(e); state.text.x=Math.min(.97,Math.max(.03,p.x)); state.text.y=Math.min(.97,Math.max(.03,p.y)); draw();
});
['pointerup','pointercancel','pointerleave'].forEach(ev=> els.text.addEventListener(ev,()=> dragging=false));
document.getElementById('textApply').onclick=()=>{
  state.text.content=els.textInput.value||''; state.text.px=+els.textSize.value; state.text.curve=+els.textCurve.value; draw();
};

/* ---------- toggles ---------- */
els.showMask.onchange=draw; els.showEdges.onchange=draw;
els.dirAngle.oninput=e=>{state.dir.angle=+e.target.value; draw();};
els.dirPattern.oninput=e=>{state.dir.pattern=e.target.value; draw();};
els.showDir.onchange=draw;

/* ---------- helpers ---------- */
function pos(e){ const r=els.img.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top};}
function norm(e){ const p=pos(e); return {x:p.x/els.img.width,y:p.y/els.img.height};}
function saveMask(){ state.maskHistory.push(ctxMask.getImageData(0,0,els.mask.width,els.mask.height)); if(state.maskHistory.length>20) state.maskHistory.shift(); state.redoHistory.length=0; }
function undo(){ if(state.maskHistory.length<2) return; const cur=state.maskHistory.pop(); state.redoHistory.push(cur); ctxMask.putImageData(state.maskHistory[state.maskHistory.length-1],0,0); draw(); }
function redo(){ if(!state.redoHistory.length) return; const img=state.redoHistory.pop(); state.maskHistory.push(img); ctxMask.putImageData(img,0,0); draw(); }

/* ---------- draw ---------- */
function draw(){
  [ctxImg,ctxMask,ctxText].forEach(c=>c.setTransform(1,0,0,1,0,0));
  ctxImg.clearRect(0,0,els.img.width,els.img.height);
  ctxText.clearRect(0,0,els.text.width,els.text.height);
  if(!imageBitmap) return;

  const s=state.zoom, tx=(els.img.width*(0.5+state.panX))-(els.img.width/2)*s, ty=(els.img.height*(0.5+state.panY))-(els.img.height/2)*s;
  [ctxImg,ctxMask,ctxText].forEach(c=> c.setTransform(s,0,0,s, -tx*s, -ty*s));

  ctxImg.drawImage(imageBitmap,0,0,els.img.width,els.img.height);

  if(els.showEdges.checked){
    ctxImg.save(); ctxImg.globalCompositeOperation='multiply'; ctxImg.strokeStyle='rgba(50,50,50,.35)'; ctxImg.lineWidth=1;
    for(let i=-els.img.height;i<els.img.width;i+=12){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+els.img.height,els.img.height); ctxImg.stroke(); }
    ctxImg.restore();
  }

  if(state.text.content){
    ctxText.save();
    ctxText.fillStyle='rgba(255,255,255,.96)'; ctxText.strokeStyle='rgba(0,0,0,.35)'; ctxText.lineWidth=Math.max(1,state.text.px/18);
    const cx=state.text.x*els.text.width, cy=state.text.y*els.text.height, px=state.text.px;
    if(Math.abs(state.text.curve)<2){ ctxText.font=`${px}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle'; ctxText.fillText(state.text.content,cx,cy); ctxText.strokeText(state.text.content,cx,cy); }
    else{ arcText(ctxText,state.text.content,cx,cy,px,state.text.curve*Math.PI/180); }
    ctxText.restore();
  }
}
function arcText(ctx,str,cx,cy,px,rad){
  const r=Math.max(40, px*str.length/Math.PI); ctx.font=`${px}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const step=(str.length>1)?(rad/(str.length-1)):0; let a=-rad/2; for(const ch of str){ ctx.save(); ctx.translate(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.rotate(a+Math.PI/2); ctx.fillText(ch,0,0); ctx.strokeText(ch,0,0); ctx.restore(); a+=step; }
}
function autoMask(img){
  const {data,width:W,height:H}=img; const L=new Float32Array(W*H);
  for(let i=0;i<W*H;i++){ const r=data[i*4],g=data[i*4+1],b=data[i*4+2]; L[i]=0.2126*r+0.7152*g+0.0722*b; }
  let c0=64,c1=192; for(let it=0;it<6;it++){ let s0=0,n0=0,s1=0,n1=0; for(let i=0;i<L.length;i++){ const v=L[i]; const d0=Math.abs(v-c0),d1=Math.abs(v-c1); if(d0<d1){s0+=v;n0++;} else {s1+=v;n1++;} } c0=s0/(n0||1); c1=s1/(n1||1); }
  const fgDark=c0<c1; const out=new Uint8ClampedArray(W*H);
  for(let i=0;i<L.length;i++){ const v=L[i]; const dD=Math.abs(v-c0), dL=Math.abs(v-c1); const fg= fgDark ? (dD<dL) : (dL<dD); out[i]=fg?220:0; }
  const tmp=out.slice(); const R=2;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ let s=0,t=0; for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){ const xx=Math.min(W-1,Math.max(0,x+dx)); const yy=Math.min(H-1,Math.max(0,y+dy)); s+=tmp[yy*W+xx]; t++; } out[y*W+x]=(s/t>110)?220:0; }
  return out;
}

/* exports needed by preview */
export function getLayers(){ return { base:els.img, mask:els.mask, text:els.text, dir:{...state.dir} }; }
export function fitCanvasesPublic(){ fitCanvases(); }

/* init */
fitCanvases();