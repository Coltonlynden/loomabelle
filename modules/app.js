import { $, $$, hexToRgb } from './utils.js';
import { kmeansQuantize } from './quantize.js';
import { autoTraceToStitches, traceCanvasAlphaToStitches } from './vectorize.js';
import { renderPreview } from './preview.js';
import { encodeDST, encodeEXP, encodeViaAI } from './exporters.js';

export const STATE = { pxPerMm:2, hoop:{wmm:100,hmm:100}, stitches:[], tool:'pen', guides:false, active:'#fb7185', history:[], ai:{}, canvases:{draw:null,drawCtx:null,prev:null,prevCtx:null} };

export async function init(){
  wireTabs(); wireHeroConfetti(); loadConfig(); setupCanvases(); wireUpload(); wireToolbar(); wireExports();
  STATE.history=[STATE.canvases.draw.toDataURL('image/png')]; renderPreview(STATE);
}

function wireTabs(){
  $$('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{const el=$(btn.getAttribute('data-scroll')); if(el) el.scrollIntoView({behavior:'smooth'});}));
  const tabs=$$('.tab-btn'), panels=$$('.panel');
  tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(b=>b.classList.toggle('active',b===btn)); panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')));}));
  const y=$('#year'); if(y) y.textContent=new Date().getFullYear();
}
function wireHeroConfetti(){
  const colors=['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac']; const g=$('#flowers'); if(!g) return;
  for(let i=0;i<7;i++){ const a=i/7*Math.PI*2,r=80,x=260+Math.cos(a)*r,y=210+Math.sin(a)*r;
    const add=(ox,oy,rad,fill)=>{const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',x+ox); c.setAttribute('cy',y+oy); c.setAttribute('r',rad); c.setAttribute('fill',fill); g.appendChild(c);};
    add(0,0,10,colors[i%colors.length]); add(0,-14,4,'#fde68a'); add(10,8,5,'#a7f3d0'); }
}
function loadConfig(){
  const p=new URLSearchParams(location.search);
  try{ const saved=localStorage.getItem('loomabelle:cfg'); if(saved){ const o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch{}
  if(p.get('hoop')){ const [w,h]=p.get('hoop').split('x').map(Number); if(w&&h) STATE.hoop={wmm:w,hmm:h}; }
  if(p.get('aiEndpoint')) STATE.ai.endpoint=p.get('aiEndpoint'); if(p.get('aiKey')) STATE.ai.key=p.get('aiKey');
  localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai}));
}
function setupCanvases(){
  const prevHost = document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  const drawHost = document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost) throw new Error('Missing .preview or .canvas containers in HTML.');
  const prev=document.createElement('canvas'); prev.width=480; prev.height=270; prevHost.innerHTML=''; prevHost.appendChild(prev); const prevCtx=prev.getContext('2d');
  const draw=document.createElement('canvas'); draw.width=480; draw.height=270; drawHost.innerHTML=''; drawHost.appendChild(draw); const drawCtx=draw.getContext('2d'); drawCtx.lineCap='round'; drawCtx.lineJoin='round';
  STATE.canvases={prev,prevCtx,draw,drawCtx}; updatePxPerMm();
}
function updatePxPerMm(){ const {prev}=STATE.canvases; const m=10; const sx=(prev.width-m*2)/STATE.hoop.wmm, sy=(prev.height-m*2)/STATE.hoop.hmm; STATE.pxPerMm=Math.min(sx,sy); }
function wireUpload(){
  const input=document.querySelector('.upload-zone input[type="file"]'); if(!input) return;
  input.removeAttribute('disabled'); const zone=input.closest('.upload-zone');
  if(zone){ zone.addEventListener('dragover',e=>{e.preventDefault();}); zone.addEventListener('drop',e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) loadImage(f);}); }
  input.addEventListener('change',()=>{const f=input.files[0]; if(f) loadImage(f);});
}
function loadImage(file){ const img=new Image(); img.onload=()=>processImage(img); img.onerror=()=>alert('Could not load image'); img.src=URL.createObjectURL(file); }
function processImage(img){
  const {prev}=STATE.canvases; const max=2000, s=Math.min(1,max/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0;
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
  const id=x.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), rad=1;
  for(let y=0;y<h;y++){ for(let z=0;z<w;z++){ let R=0,G=0,B=0,A=0,C=0;
    for(let dy=-rad;dy<=rad;dy++){ for(let dx=-rad;dx<=rad;dx++){ const xx=Math.max(0,Math.min(w-1,z+dx)), yy=Math.max(0,Math.min(h-1,y+dy)); const i=(yy*w+xx)*4; R+=d[i];G+=d[i+1];B+=d[i+2];A+=d[i+3];C++; }}
    const o=(y*w+z)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; } } id.data.set(out); x.putImageData(id,0,0);
  const {labels}=kmeansQuantize(x,8); STATE.stitches=autoTraceToStitches(labels,w,h,prev.width,prev.height); renderPreview(STATE);
}
function wireToolbar(){
  const btns=$$('.panel[data-panel="draw"] .toolbar .btn'); const map=['pen','eraser','fill','fabric','guides','undo'];
  btns.forEach((b,i)=>{ const tool=map[i]||'pen'; b.dataset.tool=tool; b.removeAttribute('disabled');
    b.addEventListener('click',()=>{ if(tool==='undo') return void undo(); if(tool==='guides') return void(STATE.guides=!STATE.guides, renderPreview(STATE));
      if(tool==='fabric') return void(STATE.canvases.draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff', renderPreview(STATE)); STATE.tool=tool; }); });
  const {draw,drawCtx}=STATE.canvases; let drawing=false;
  draw.addEventListener('pointerdown',e=>{ const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='fill'){ floodFill(drawCtx,x|0,y|0,STATE.active); snapshot(); return; }
    drawing=true; drawCtx.strokeStyle=STATE.active; drawCtx.lineWidth=3; drawCtx.beginPath(); drawCtx.moveTo(x,y); });
  draw.addEventListener('pointermove',e=>{ if(!drawing) return; const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='pen'){ drawCtx.lineTo(x,y); drawCtx.stroke(); } else if(STATE.tool==='eraser'){ drawCtx.clearRect(x-6,y-6,12,12); } });
  draw.addEventListener('pointerup',()=>{ if(drawing){ drawing=false; snapshot(); } });
  const sw=document.querySelector('.swatches'); if(sw && sw.children.length===0){
    ['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'].forEach(c=>{
      const d=document.createElement('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer'; d.title=c; d.addEventListener('click',()=>STATE.active=c); sw.appendChild(d);
    });
  }
}
function hexToRgbLocal(hex){ hex = String(hex||'').replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function floodFill(ctx,x,y,hex){ const [r,g,b]=hexToRgbLocal(hex); const w=ctx.canvas.width, h=ctx.canvas.height;
  const id=ctx.getImageData(0,0,w,h), d=id.data; const idx=(x,y)=> (y*w+x)*4; const target=[d[idx(x,y)],d[idx(x,y)+1],d[idx(x,y)+2],d[idx(x,y)+3]];
  const q=[[x,y]], seen=new Uint8Array(w*h); while(q.length){ const [cx,cy]=q.pop(); if(cx<0||cy<0||cx>=w||cy>=h) continue;
    const i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
    if(d[i]!==target[0]||d[i+1]!==target[1]||d[i+2]!==target[2]||d[i+3]!==target[3]) continue; d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
    q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]); } ctx.putImageData(id,0,0); }
function snapshot(){ const {draw}=STATE.canvases; STATE.history.push(draw.toDataURL()); if(STATE.history.length>40) STATE.history.shift(); traceCanvasAlphaToStitches(STATE,2.5); renderPreview(STATE); }
function undo(){ if(STATE.history.length<2) return; const {draw,drawCtx}=STATE.canvases; STATE.history.pop();
  const img=new Image(); img.onload=()=>{ drawCtx.clearRect(0,0,draw.width,draw.height); drawCtx.drawImage(img,0,0); renderPreview(STATE); }; img.src=STATE.history[STATE.history.length-1]; }
function download(name, bytes){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }
function wireExports(){ const btns=$$('.col.card.rose .formats .btn'); btns.forEach(btn=>{
    const fmt=btn.textContent.trim().toUpperCase(); if(!['DST','EXP','PES','JEF'].includes(fmt)) return;
    btn.addEventListener('click', async ()=>{ try{ let bytes; if(fmt==='DST') bytes=encodeDST(STATE); else if(fmt==='EXP') bytes=encodeEXP(STATE); else bytes=await encodeViaAI(STATE, fmt); download('loomabelle.'+fmt.toLowerCase(), bytes); }catch(e){ alert(fmt+': '+e.message); } }); }); }