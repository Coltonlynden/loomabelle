/* Loomabelle functional JS — no HTML/CSS changes */
const $=(s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));

// ---- Tabs and smooth scroll (leave look unchanged) ----
$$('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{const el=$(btn.getAttribute('data-scroll')); if(el) el.scrollIntoView({behavior:'smooth'});}));
const tabs=$$('.tab-btn'), panels=$$('.panel');
tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(b=>b.classList.toggle('active',b===btn)); panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')));}));
const y=$('#year'); if(y) y.textContent=new Date().getFullYear();

// ---- Hero confetti (unchanged visuals) ----
(function(){const colors=['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac'];const g=$('#flowers');if(!g)return; for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=80,x=260+Math.cos(a)*r,y=210+Math.sin(a)*r; const add=(ox,oy,r,f)=>{const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',x+ox); c.setAttribute('cy',y+oy); c.setAttribute('r',r); c.setAttribute('fill',f); g.appendChild(c);}; add(0,0,10,colors[i%colors.length]); add(0,-14,4,'#fde68a'); add(10,8,5,'#a7f3d0'); }})();

// ---- State ----
const STATE={pxPerMm:2, hoop:{wmm:100,hmm:100}, stitches:[], tool:'pen', guides:false, active:'#fb7185', history:[], ai:{}};
// Load any optional settings from URL/localStorage without UI
(function cfg(){const p=new URLSearchParams(location.search); const saved=localStorage.getItem('loomabelle:cfg'); if(saved){try{const o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai;}catch{}} if(p.get('hoop')){ const [w,h]=p.get('hoop').split('x').map(Number); if(w&&h) STATE.hoop={wmm:w,hmm:h}; } if(p.get('aiEndpoint')) STATE.ai.endpoint=p.get('aiEndpoint'); if(p.get('aiKey')) STATE.ai.key=p.get('aiKey'); localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai}));})();

// ---- Wire Upload (enable disabled input) ----
const fileInput = $('.upload-zone input[type="file"]');
if(fileInput){
  fileInput.removeAttribute('disabled');
  const zone = fileInput.closest('.upload-zone');
  if(zone){
    zone.addEventListener('dragover',e=>{e.preventDefault();});
    zone.addEventListener('drop',e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) loadImage(f);});
  }
  fileInput.addEventListener('change',()=>{const f=fileInput.files[0]; if(f) loadImage(f);});
}

// ---- Create preview canvas inside existing .preview ----
const previewHost = document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
let prevCanvas=null, prevCtx=null;
if(previewHost){
  prevCanvas = document.createElement('canvas');
  prevCanvas.width = 480; prevCanvas.height = 270;
  previewHost.innerHTML=''; previewHost.appendChild(prevCanvas);
  prevCtx = prevCanvas.getContext('2d');
}

// ---- Create draw canvas inside existing .canvas ----
const drawHost = document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
let drawCanvas=null, drawCtx=null;
if(drawHost){
  drawCanvas = document.createElement('canvas');
  drawCanvas.width=480; drawCanvas.height=270;
  drawHost.innerHTML=''; drawHost.appendChild(drawCanvas);
  drawCtx = drawCanvas.getContext('2d'); drawCtx.lineCap='round'; drawCtx.lineJoin='round';
}

// ---- Enable toolbar buttons (remove disabled) ----
const toolbarBtns = $$('.panel[data-panel="draw"] .toolbar .btn');
const toolOrder = ['Pen','Eraser','Fill','Fabric color','Stitch guides','Undo'];
toolbarBtns.forEach((b,i)=>{ b.removeAttribute('disabled'); b.dataset.tool = (['pen','eraser','fill','fabric','guides','undo'][i]||'pen'); });

// ---- Enable export buttons & tag by text ----
const exportBtns = $$('.col.card.rose .formats .btn');
exportBtns.forEach(btn=>{
  const t=btn.textContent.trim().toUpperCase();
  if(['DST','PES','EXP','JEF'].includes(t)) btn.dataset.export=t;
});

// ---- Palette swatches (use existing .swatches container) ----
const sw = $('.swatches');
if(sw){
  const colors=['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'];
  colors.forEach(c=>{const d=document.createElement('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer'; d.title=c; d.addEventListener('click',()=>STATE.active=c); sw.appendChild(d);});
}

// ---- Scaling between hoop and pixels ----
function updatePxPerMm(){
  if(!prevCanvas) return;
  const m=10;
  const sx=(prevCanvas.width-m*2)/STATE.hoop.wmm, sy=(prevCanvas.height-m*2)/STATE.hoop.hmm;
  STATE.pxPerMm=Math.min(sx,sy);
}
updatePxPerMm();

// ---- Upload pipeline ----
function loadImage(file){
  const img=new Image();
  img.onload=()=>processImage(img);
  img.onerror=()=>alert('Could not load image');
  img.src=URL.createObjectURL(file);
}

function processImage(img){
  if(!prevCanvas) return;
  const max=2000, s=Math.min(1, max/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0;
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.drawImage(img,0,0,w,h);

  // Edge cleanup (simple blur) if toggle text is present (the element exists; we assume enabled)
  const optClean = true;
  if(optClean){ const id=x.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), rad=1;
    for(let y=0;y<h;y++){ for(let z=0;z<w;z++){ let R=0,G=0,B=0,A=0,C=0;
      for(let dy=-rad;dy<=rad;dy++){for(let dx=-rad;dx<=rad;dx++){const xx=Math.max(0,Math.min(w-1,z+dx)), yy=Math.max(0,Math.min(h-1,y+dy)); const i=(yy*w+xx)*4; R+=d[i];G+=d[i+1];B+=d[i+2];A+=d[i+3];C++;}}
      const o=(y*w+z)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; } }
    id.data.set(out); x.putImageData(id,0,0);
  }

  // K-means color reduction (8 colors)
  const {labels} = kmeans(x, 8);

  // Autotrace -> running stitches
  autostitch(labels, w, h);
  renderPreview();
}

// K-means quantization -> labels
function kmeans(ctx,k){
  const {width:w,height:h}=ctx.canvas;
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  const centers=[];
  for(let i=0;i<k;i++){ const p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); }
  const labels=new Uint8Array(w*h);
  for(let it=0; it<6; it++){
    for(let i=0;i<w*h;i++){
      const r=d[i*4], g=d[i*4+1], b=d[i*4+2];
      let best=0, bd=1e12;
      for(let c=0;c<k;c++){ const cc=centers[c]; const dist=(r-cc[0])**2+(g-cc[1])**2+(b-cc[2])**2; if(dist<bd){bd=dist; best=c;} }
      labels[i]=best;
    }
    const sums=Array.from({length:k},()=>[0,0,0,0]);
    for(let i=0;i<w*h;i++){ const c=labels[i],p=i*4; sums[c][0]+=d[p]; sums[c][1]+=d[p+1]; sums[c][2]+=d[p+2]; sums[c][3]++; }
    for(let c=0;c<k;c++){ if(sums[c][3]) centers[c]=[sums[c][0]/sums[c][3], sums[c][1]/sums[c][3], sums[c][2]/sums[c][3]]; }
  }
  return {labels};
}

// Very simple edge-follow -> stitches
function autostitch(labels,w,h){
  STATE.stitches=[];
  if(!prevCanvas) return;
  const scale = Math.min(prevCanvas.width/w, prevCanvas.height/h) * 0.9;
  const ox=(prevCanvas.width - w*scale)/2, oy=(prevCanvas.height - h*scale)/2;
  let first=true;
  for(let y=1;y<h;y++){
    for(let x=1;x<w;x++){
      const i=y*w+x;
      // take boundary pixels
      if(labels[i]!==labels[i-1] || labels[i]!==labels[i-w]){
        const px = ox + x*scale, py = oy + y*scale;
        STATE.stitches.push({cmd:first?'jump':'stitch', x:px, y:py});
        first=false;
      }
    }
  }
}

// ---- Draw & Trace tools ----
if(drawCanvas){
  let drawing=false;
  drawCanvas.addEventListener('pointerdown',e=>{
    const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='fabric'){ drawCanvas.style.background = prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return; }
    if(STATE.tool==='fill'){ floodFill(drawCtx, x|0, y|0, STATE.active); snapshot(); return; }
    if(STATE.tool==='guides'){ STATE.guides=!STATE.guides; renderPreview(); return; }
    drawing=true; drawCtx.strokeStyle=STATE.active; drawCtx.lineWidth=3; drawCtx.beginPath(); drawCtx.moveTo(x,y);
  });
  drawCanvas.addEventListener('pointermove',e=>{
    if(!drawing) return;
    const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='pen'){ drawCtx.lineTo(x,y); drawCtx.stroke(); }
    else if(STATE.tool==='eraser'){ drawCtx.clearRect(x-6,y-6,12,12); }
  });
  drawCanvas.addEventListener('pointerup',()=>{ if(drawing){ drawing=false; snapshot(); } });
}

toolbarBtns.forEach(b=> b.addEventListener('click', ()=>{
  const t = b.dataset.tool;
  if(t==='undo'){ undo(); return; }
  STATE.tool = t;
}));

function hexToRgb(hex){ hex = hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function floodFill(ctx,x,y,hex){
  const [r,g,b]=hexToRgb(hex); const w=ctx.canvas.width, h=ctx.canvas.height;
  const id=ctx.getImageData(0,0,w,h), d=id.data; const idx=(x,y)=> (y*w+x)*4;
  const target=[d[idx(x,y)],d[idx(x,y)+1],d[idx(x,y)+2],d[idx(x,y)+3]];
  const q=[[x,y]], seen=new Uint8Array(w*h);
  while(q.length){
    const [cx,cy]=q.pop(); if(cx<0||cy<0||cx>=w||cy>=h) continue;
    const i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
    if(d[i]!==target[0]||d[i+1]!==target[1]||d[i+2]!==target[2]||d[i+3]!==target[3]) continue;
    d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
    q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
  ctx.putImageData(id,0,0);
}

function snapshot(){
  if(!drawCanvas) return;
  STATE.history.push(drawCanvas.toDataURL());
  if(STATE.history.length>40) STATE.history.shift();
  // convert drawing to stitches overlay: trace alpha>0
  const img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0);
    const id=x.getImageData(0,0,c.width,c.height);
    const labels=new Uint8Array(c.width*c.height);
    for(let i=0;i<labels.length;i++) labels[i]=id.data[i*4+3]>0?1:0;
    autostitch(labels,c.width,c.height);
    renderPreview();
  };
  img.src = STATE.history[STATE.history.length-1];
}
function undo(){
  if(STATE.history.length<2) return;
  STATE.history.pop();
  const img=new Image();
  img.onload=()=>{ drawCtx.clearRect(0,0,drawCanvas.width,drawCanvas.height); drawCtx.drawImage(img,0,0); renderPreview(); };
  img.src=STATE.history[STATE.history.length-1];
}

// ---- Preview render ----
function renderPreview(){
  if(!prevCtx||!prevCanvas) return;
  try{ prevCtx.fillStyle = getComputedStyle(drawCanvas).background || '#ffffff'; }catch{ prevCtx.fillStyle='#ffffff'; }
  prevCtx.clearRect(0,0,prevCanvas.width,prevCanvas.height);
  prevCtx.fillRect(0,0,prevCanvas.width,prevCanvas.height);
  prevCtx.strokeStyle='#111827'; prevCtx.lineWidth=1; prevCtx.beginPath();
  for(const s of STATE.stitches){
    if(s.cmd==='stitch') prevCtx.lineTo(s.x,s.y);
    else if(s.cmd==='jump') prevCtx.moveTo(s.x,s.y);
  }
  prevCtx.stroke();
  if(STATE.guides){
    const hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm;
    prevCtx.save(); prevCtx.strokeStyle='rgba(0,0,0,.2)'; prevCtx.setLineDash([6,6]);
    prevCtx.strokeRect((prevCanvas.width-hoopW)/2,(prevCanvas.height-hoopH)/2, hoopW, hoopH);
    prevCtx.restore();
  }
}

// ---- Exporters ----
function toUnits(stitches){
  if(!prevCanvas) return [];
  const sx=1/STATE.pxPerMm*10, sy=sx;
  const cx=prevCanvas.width/2, cy=prevCanvas.height/2;
  let prev=null; const out=[];
  for(const s of stitches){
    if(s.cmd==='stop'){ out.push({cmd:'stop'}); prev=null; continue; }
    if(s.cmd==='jump'||s.cmd==='stitch'){
      const x=(s.x-cx)*sx, y=(s.y-cy)*sy;
      if(prev==null){ prev=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
      else { out.push({cmd:s.cmd,dx:x-prev[0],dy:y-prev[1]}); prev=[x,y]; }
    }
  }
  return out;
}
function encDST(){
  const u=toUnits(STATE.stitches), bytes=[];
  function enc(dx,dy,flag=0){
    dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
    const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
    const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
    const b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3);
  }
  let colors=0;
  for(const s of u){
    if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; }
    if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; }
    enc(s.dx,s.dy,0);
  }
  bytes.push(0,0,0xF3);
  const header=("LA:LOOMABELLE.ST\n"+"ST:"+String(bytes.length/3).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(" ".repeat(512))).slice(0,512);
  const hb=new TextEncoder().encode(header);
  const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
}
function encEXP(){
  const u=toUnits(STATE.stitches), bytes=[];
  const put=(dx,dy,cmd)=>{
    dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
    if(cmd==='jump') bytes.push(0x80,0x04);
    if(cmd==='stop') bytes.push(0x80,0x01);
    if(cmd==='end') bytes.push(0x80,0x00);
    if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255, dy&255); }
  };
  for(const s of u){
    if(s.cmd==='stop'){ put(0,0,'stop'); continue; }
    if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; }
    put(s.dx,s.dy,'stitch');
  }
  bytes.push(0x80,0x00);
  return new Uint8Array(bytes);
}
async function encViaAI(fmt){
  if(!STATE.ai||!STATE.ai.endpoint||!STATE.ai.key) throw new Error('Set ?aiEndpoint=...&aiKey=... in URL or localStorage "loomabelle:cfg".');
  const res=await fetch(STATE.ai.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits(STATE.stitches)})});
  if(!res.ok) throw new Error('AI conversion failed');
  const buf=await res.arrayBuffer(); return new Uint8Array(buf);
}
function download(name, bytes){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
exportBtns.forEach(btn=>btn.addEventListener('click', async ()=>{
  const fmt=btn.dataset.export; if(!fmt) return;
  try{
    let bytes;
    if(fmt==='DST') bytes=encDST();
    else if(fmt==='EXP') bytes=encEXP();
    else bytes=await encViaAI(fmt);
    download('loomabelle.'+fmt.toLowerCase(), bytes);
  }catch(e){ alert(fmt+': '+e.message); }
}));

// ---- Initialize ----
if(drawCanvas){ STATE.history=[drawCanvas.toDataURL('image/png')]; }
renderPreview();
console.log('Loomabelle functional JS initialized.');
