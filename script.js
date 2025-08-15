/* Loomabelle — JS-only functional update (no visual changes) */
const $=(s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));

// Smooth scroll + tabs (unchanged)
$$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{const t=$(b.getAttribute('data-scroll')); if(t) t.scrollIntoView({behavior:'smooth'});}));
const tabs=$$('.tab-btn'), panels=$$('.panel'); tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(b=>b.classList.toggle('active',b===btn)); panels.forEach(p=>p.classList.toggle('active',p.getAttribute('data-panel')===btn.getAttribute('data-tab')));}));
const year=$('#year'); if(year) year.textContent=new Date().getFullYear();

// Hero confetti rings (unchanged look)
(function(){const c=['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac'];const g=$('#flowers');if(!g)return;for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=80,x=260+Math.cos(a)*r,y=210+Math.sin(a)*r;[['',10,c[i%c.length]],[',-14',4,'#fde68a'],[',+10,+8',5,'#a7f3d0']].forEach(([off,radius,fill])=>{const cc=document.createElementNS('http://www.w3.org/2000/svg','circle'); const [ox,oy]=(off||'').split(',').map(s=>Number(s)||0); cc.setAttribute('cx',x+ox); cc.setAttribute('cy',y+oy); cc.setAttribute('r',radius); cc.setAttribute('fill',fill); g.appendChild(cc);});}})();

/* ---------- State & config (no UI) ---------- */
const STATE={pxPerMm:2, hoop:{wmm:100,hmm:100}, stitches:[], guides:false, tool:'pen', active:'#fb7185', history:[], ai:{} };
(function cfg(){const p=new URLSearchParams(location.search); const saved=localStorage.getItem('loomabelle:cfg'); if(saved){try{const o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai;}catch{}} if(p.get('hoop')){const [w,h]=p.get('hoop').split('x').map(Number); if(w&&h) STATE.hoop={wmm:w,hmm:h};} if(p.get('aiEndpoint')) STATE.ai.endpoint=p.get('aiEndpoint'); if(p.get('aiKey')) STATE.ai.key=p.get('aiKey'); localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai}));})();

/* ---------- Canvases (use existing containers) ---------- */
const prevHost=$('#preview'); const prev=document.createElement('canvas'); prev.width=480; prev.height=270; if(prevHost){ prevHost.innerHTML=''; prevHost.appendChild(prev);} const pctx=prev.getContext('2d');
const drawHost=$('#draw-canvas'); const draw=document.createElement('canvas'); draw.width=480; draw.height=270; if(drawHost){ drawHost.innerHTML=''; drawHost.appendChild(draw);} const dctx=draw.getContext('2d'); dctx.lineCap='round'; dctx.lineJoin='round';

function updateScale(){const m=10; const sx=(prev.width-m*2)/STATE.hoop.wmm, sy=(prev.height-m*2)/STATE.hoop.hmm; STATE.pxPerMm=Math.min(sx,sy);} updateScale();

/* ---------- Upload wiring ---------- */
const fin=$('#file-input'); if(fin){ const zone=fin.closest('.upload-zone'); if(zone){ zone.addEventListener('dragover',e=>{e.preventDefault();}); zone.addEventListener('drop',e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) loadImage(f);}); } fin.addEventListener('change',()=>{const f=fin.files[0]; if(f) loadImage(f);}); }
function loadImage(file){const img=new Image(); img.onload=()=>processImage(img); img.onerror=()=>alert('Image load failed'); img.src=URL.createObjectURL(file);}

/* ---------- Image processing: cleanup + k-means + autotrace ---------- */
function processImage(img){
  const max=2000, s=Math.min(1, max/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0;
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
  if($('#opt-clean')?.checked){ const id=x.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), r=1; for(let y=0;y<h;y++){for(let z=0;z<w;z++){let R=0,G=0,B=0,A=0,C=0; for(let dy=-r;dy<=r;dy++){for(let dx=-r;dx<=r;dx++){const xx=Math.max(0,Math.min(w-1,z+dx)), yy=Math.max(0,Math.min(h-1,y+dy)); const i=(yy*w+xx)*4; R+=d[i];G+=d[i+1];B+=d[i+2];A+=d[i+3];C++;}} const o=(y*w+z)*4; out[o]=R/C;out[o+1]=G/C;out[o+2]=B/C;out[o+3]=A/C;}} id.data.set(out); x.putImageData(id,0,0); }
  const {labels}=kmeans(x,$('#opt-reduce')?.checked?8:16);
  if($('#opt-autotrace')?.checked){ autostitch(labels,w,h); }
  render();
}
function kmeans(ctx,k){const {width:w,height:h}=ctx.canvas; const id=ctx.getImageData(0,0,w,h), d=id.data; const centers=[]; for(let i=0;i<k;i++){const p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]);} const labels=new Uint8Array(w*h);
  for(let it=0;it<6;it++){ for(let i=0;i<w*h;i++){const r=d[i*4],g=d[i*4+1],b=d[i*4+2]; let best=0, bd=1e9; for(let c=0;c<k;c++){const cc=centers[c]; const dd=(r-cc[0])**2+(g-cc[1])**2+(b-cc[2])**2; if(dd<bd){bd=dd; best=c;}} labels[i]=best;} const sums=Array.from({length:k},()=>[0,0,0,0]); for(let i=0;i<w*h;i++){const c=labels[i],p=i*4; sums[c][0]+=d[p];sums[c][1]+=d[p+1];sums[c][2]+=d[p+2];sums[c][3]++;} for(let c=0;c<k;c++){if(sums[c][3]) centers[c]=[sums[c][0]/sums[c][3],sums[c][1]/sums[c][3],sums[c][2]/sums[c][3]];} } return {labels};}

/* naive autostitch from label map -> running stitch */
function autostitch(labels,w,h){ STATE.stitches=[]; const scale=Math.min(prev.width/w,prev.height/h)*0.9, ox=(prev.width-w*scale)/2, oy=(prev.height-h*scale)/2; let first=true; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ if(labels[y*w+x] && (!labels[y*w+x-1]||!labels[(y-1)*w+x])){ const px=ox+x*scale, py=oy+y*scale; STATE.stitches.push({cmd:first?'jump':'stitch',x:px,y:py}); first=false; } } } }

/* ---------- Draw & Trace (no style changes) ---------- */
const swatches=$('.swatches'); if(swatches){ ['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'].forEach(c=>{const d=document.createElement('div'); d.style.cssText=`height:40px;border-radius:999px;border:1px solid white;box-shadow:0 1px 2px rgba(0,0,0,.06);background:${c}`; d.title=c; d.addEventListener('click',()=>STATE.active=c); swatches.appendChild(d);});}
let drawing=false; draw.addEventListener('pointerdown',e=>{const r=draw.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top; if(STATE.tool==='fabric'){draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return;} if(STATE.tool==='fill'){floodFill(dctx,x|0,y|0,STATE.active); snapshot(); return;} if(STATE.tool==='guides'){STATE.guides=!STATE.guides; render(); return;} drawing=true; dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y);});
draw.addEventListener('pointermove',e=>{if(!drawing)return; const r=draw.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top; if(STATE.tool==='pen'){dctx.lineTo(x,y); dctx.stroke();} else if(STATE.tool==='eraser'){dctx.clearRect(x-6,y-6,12,12);} });
draw.addEventListener('pointerup',()=>{if(drawing){drawing=false; snapshot();}});
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>{const t=b.getAttribute('data-tool'); if(t==='undo') undo(); else STATE.tool=t;}));

function floodFill(ctx,x,y,hex){const [r,g,b]=hexToRgb(hex); const w=ctx.canvas.width,h=ctx.canvas.height; const id=ctx.getImageData(0,0,w,h),d=id.data; const idx=(x,y)=> (y*w+x)*4; const target=[d[idx(x,y)],d[idx(x,y)+1],d[idx(x,y)+2],d[idx(x,y)+3]]; const q=[[x,y]], seen=new Uint8Array(w*h); while(q.length){const [cx,cy]=q.pop(); if(cx<0||cy<0||cx>=w||cy>=h) continue; const i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1; if(d[i]!==target[0]||d[i+1]!==target[1]||d[i+2]!==target[2]||d[i+3]!==target[3]) continue; d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255; q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);} ctx.putImageData(id,0,0);}
function hexToRgb(h){h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255];}

function snapshot(){ STATE.history.push(draw.toDataURL()); if(STATE.history.length>40) STATE.history.shift(); const img=new Image(); img.onload=()=>{const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0); const id=x.getImageData(0,0,c.width,c.height); const labels=new Uint8Array(c.width*c.height); for(let i=0;i<labels.length;i++) labels[i]=id.data[i*4+3]>0?1:0; autostitch(labels,c.width,c.height); render();}; img.src=STATE.history[STATE.history.length-1]; }
function undo(){ if(STATE.history.length<2) return; STATE.history.pop(); const img=new Image(); img.onload=()=>{dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); render();}; img.src=STATE.history[STATE.history.length-1]; }

/* ---------- Preview render (no style change) ---------- */
function render(){ pctx.clearRect(0,0,prev.width,prev.height); try{pctx.fillStyle=getComputedStyle(draw).background||'#ffffff';}catch{pctx.fillStyle='#ffffff';} pctx.fillRect(0,0,prev.width,prev.height); pctx.strokeStyle='#111827'; pctx.lineWidth=1; pctx.beginPath(); for(const s of STATE.stitches){ if(s.cmd==='stitch') pctx.lineTo(s.x,s.y); else if(s.cmd==='jump') pctx.moveTo(s.x,s.y); } pctx.stroke(); if(STATE.guides){ pctx.save(); pctx.strokeStyle='rgba(0,0,0,.22)'; pctx.setLineDash([6,6]); const hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm; pctx.strokeRect((prev.width-hoopW)/2,(prev.height-hoopH)/2,hoopW,hoopH); pctx.restore(); } }

/* ---------- Exporters ---------- */
function toUnits(st){const s=1/STATE.pxPerMm*10, cx=prev.width/2, cy=prev.height/2; let prevPt=null; const out=[]; for(const a of st){ if(a.cmd==='stop'){out.push({cmd:'stop'}); prevPt=null; continue;} if(a.cmd==='jump'||a.cmd==='stitch'){ const x=(a.x-cx)*s, y=(a.y-cy)*s; if(prevPt==null){prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0});} else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; } } } return out; }
function clamp(v,mi,ma){return Math.max(mi,Math.min(ma,v));}
function encDST(){const u=toUnits(STATE.stitches), bytes=[]; function enc(dx,dy,f=0){dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121); const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6); const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2); bytes.push(b1&255,b2&255,(f|3)&255);} let colors=0; for(const s of u){ if(s.cmd==='stop'){enc(0,0,0xC0); colors++; continue;} if(s.cmd==='jump'){enc(s.dx,s.dy,0x80); continue;} enc(s.dx,s.dy,0);} bytes.push(0,0,0xF3); const header=("LA:LOOMABELLE.ST\n"+"ST:"+String(bytes.length/3).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(" ".repeat(512))).slice(0,512); const hb=new TextEncoder().encode(header); const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8; }
function encEXP(){const u=toUnits(STATE.stitches), bytes=[]; const put=(dx,dy,cmd)=>{dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127); if(cmd==='jump') bytes.push(0x80,0x04); if(cmd==='stop') bytes.push(0x80,0x01); if(cmd==='end') bytes.push(0x80,0x00); if(cmd==='stitch'||cmd==='jump'){bytes.push(dx&255,dy&255);} }; for(const s of u){ if(s.cmd==='stop'){put(0,0,'stop'); continue;} if(s.cmd==='jump'){put(s.dx,s.dy,'jump'); continue;} put(s.dx,s.dy,'stitch'); } bytes.push(0x80,0x00); return new Uint8Array(bytes); }
async function encViaAI(fmt){ if(!STATE.ai||!STATE.ai.endpoint||!STATE.ai.key) throw new Error('Set ?aiEndpoint=...&aiKey=... in URL or localStorage \"loomabelle:cfg\".'); const res=await fetch(STATE.ai.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits(STATE.stitches)})}); if(!res.ok) throw new Error('AI conversion failed'); const buf=await res.arrayBuffer(); return new Uint8Array(buf); }

$$('[data-export]').forEach(btn=>btn.addEventListener('click',async()=>{const fmt=btn.getAttribute('data-export'); try{let bytes; if(fmt==='DST') bytes=encDST(); else if(fmt==='EXP') bytes=encEXP(); else bytes=await encViaAI(fmt); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download='loomabelle.'+fmt.toLowerCase(); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);}catch(e){alert(fmt+': '+e.message);} }));

// Initialize draw state + preview
STATE.history=[draw.toDataURL()]; render();
