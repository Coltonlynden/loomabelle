// ---- Utilities / DOM
const $ = (s)=>document.querySelector(s)
$('#year').textContent = new Date().getFullYear()
const work = $('#work'), wctx = work.getContext('2d',{willReadFrequently:true})
const HOOP_MM = { '4x4': {w:100,h:100}, '5x7': {w:130,h:180} }
let img = null
const setStatus = (m, cls='')=>{ const el=$('#status'); el.textContent=m; el.className=`status ${cls}` }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))

// ---- robust dynamic loaders (CDN fallbacks)
async function tryImport(urls){ let err; for(const u of urls){ try{ return await import(u) }catch(e){err=e} } throw err }
const loadPotrace = ()=>tryImport([
  'https://esm.run/potrace-wasm@2',
  'https://cdn.jsdelivr.net/npm/potrace-wasm@2/dist/index.min.mjs'
])
const loadSimplify = async ()=> (await tryImport([
  'https://esm.run/simplify-js@1',
  'https://cdn.jsdelivr.net/npm/simplify-js@1.2.4/index.js'
])).default || (await import('https://esm.run/simplify-js@1')).default

// ---- image load
$('#file').addEventListener('change', async e=>{
  const f=e.target.files?.[0]; if(!f) return
  if(!/image\/(png|jpeg)/.test(f.type)){ setStatus('Please upload JPG/PNG.', 'error'); return }
  setStatus('Loading image…')
  img = await new Promise((res,rej)=>{ const u=URL.createObjectURL(f); const im=new Image(); im.onload=()=>{URL.revokeObjectURL(u);res(im)}; im.onerror=rej; im.src=u })
  $('#process').disabled=false
  setStatus('Image ready. Tap Process.','ok')
})

// ---- main pipeline
$('#process').addEventListener('click', async ()=>{
  if(!img) return
  $('#process').disabled = true
  setStatus('Processing… this can take a few seconds.')
  try{
    const colors = clamp(Number($('#colors').value)||4,2,5)
    const removeBg = $('#removeBg').checked
    const outline = $('#outline').checked
    const hoop = $('#hoop').value
    const angle = Number($('#angle').value)||45
    const density = Number($('#density').value)||0.4

    // 0) draw (downscale if huge)
    const maxSide=2600, s=Math.min(1,maxSide/Math.max(img.width,img.height))
    const W=Math.max(1,Math.round(img.width*s)), H=Math.max(1,Math.round(img.height*s))
    work.width=W; work.height=H; wctx.clearRect(0,0,W,H); wctx.drawImage(img,0,0,W,H)

    // 1) color reduce
    const { indexed, palette } = reduceColors(wctx,W,H,colors,removeBg)

    // 2) vectorize per color
    const regsPx = await vectorizeByColor(indexed,palette,W,H)

    // 3) fit into hoop (px->mm)
    const regsMM = fitToHoop(regsPx, HOOP_MM[hoop])

    // 4) stitch plan (hatch + outline)
    const plan = planStitches(regsMM, {densityMM:density, angleDeg:angle, outline, maxStitchMM:7})

    // 5) preview
    $('#preview').src = drawPreview(plan, 720, 520)

    // 6) export DST
    const blob = new Blob([writeDST(plan)], {type:'application/octet-stream'})
    const url = URL.createObjectURL(blob)
    const a = $('#download'); a.href = url; a.classList.remove('disabled')
    setStatus('Done! Preview updated—download your .DST.', 'ok')
  }catch(e){ console.error(e); setStatus('Processing failed. Try a simpler image.','error') }
  finally{ $('#process').disabled = false }
})

// ---- Color reduction (k-means)
function reduceColors(ctx,W,H,k,removeBg){
  const {data}=ctx.getImageData(0,0,W,H); const N=W*H; const src=new Uint8Array(data.buffer)
  const pts=new Float32Array(N*3); for(let i=0;i<N;i++){ pts[i*3]=src[i*4]; pts[i*3+1]=src[i*4+1]; pts[i*3+2]=src[i*4+2] }
  k=clamp(Math.floor(k),2,5)
  const centers=new Float32Array(k*3)
  for(let c=0;c<k;c++){ const j=Math.floor((c+0.5)*N/k); centers[c*3]=pts[j*3]; centers[c*3+1]=pts[j*3+1]; centers[c*3+2]=pts[j*3+2] }
  const assign=new Uint16Array(N)
  for(let it=0;it<8;it++){
    for(let i=0;i<N;i++){ let best=0,bd=1e12,r=pts[i*3],g=pts[i*3+1],b=pts[i*3+2]
      for(let c=0;c<k;c++){ const cr=centers[c*3],cg=centers[c*3+1],cb=centers[c*3+2]; const d=(r-cr)**2+(g-cg)**2+(b-cb)**2; if(d<bd){bd=d;best=c} }
      assign[i]=best
    }
    const sum=new Float32Array(k*4); for(let i=0;i<N;i++){ const c=assign[i]; sum[c*4]+=pts[i*3]; sum[c*4+1]+=pts[i*3+1]; sum[c*4+2]+=pts[i*3+2]; sum[c*4+3]++ }
    for(let c=0;c<k;c++){ const cnt=sum[c*4+3]||1; centers[c*3]=sum[c*4]/cnt; centers[c*3+1]=sum[c*4+1]/cnt; centers[c*3+2]=sum[c*4+2]/cnt }
  }
  let bg=-1
  if(removeBg){ const counts=new Uint32Array(k); const bump=(x,y)=>counts[assign[y*W+x]]++
    for(let x=0;x<W;x++){ bump(x,0); bump(x,H-1) } for(let y=0;y<H;y++){ bump(0,y); bump(W-1,y) }
    let m=0,mi=0; for(let c=0;c<k;c++) if(counts[c]>m){m=counts[c];mi=c} bg=mi
  }
  const used=new Set(), indexed=new Uint8Array(N)
  for(let i=0;i<N;i++){ const c=assign[i]; if(c===bg) indexed[i]=255; else { indexed[i]=c; used.add(c) } }
  const list=[...used].sort((a,b)=>a-b), remap=new Map(); list.forEach((c,i)=>remap.set(c,i))
  const palette=list.map(c=>[centers[c*3]|0, centers[c*3+1]|0, centers[c*3+2]|0])
  for(let i=0;i<N;i++) if(indexed[i]!==255) indexed[i]=remap.get(indexed[i])
  return { indexed, palette }
}

// ---- Vectorize to polygons
async function vectorizeByColor(indexed,palette,W,H){
  const { trace } = await loadPotrace()
  const simplify = await loadSimplify()
  const out=[]
  for(let c=0;c<palette.length;c++){
    const mask=new Uint8Array(W*H); for(let i=0;i<W*H;i++) mask[i]=indexed[i]===c?255:0
    const d = await trace(mask,{width:W,height:H,threshold:128,turdSize:40})
    const polys=[], subs = d.match(/M[^M]+/g) || []
    for(const sd of subs){
      const pts = samplePath(sd,1.5)
      const simp = simplify(pts.map(p=>({x:p[0],y:p[1]})),1.0,true).map(p=>[p.x,p.y])
      if (polygonArea(simp)>50 && simp.length>2) polys.push(simp)
    }
    if (polys.length) out.push({color:palette[c], polys})
  }
  return out
}
function samplePath(d,step=2){ const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',d)
  const L=p.getTotalLength(); const pts=[]; for(let s=0;s<=L;s+=step){ const q=p.getPointAtLength(s); pts.push([q.x,q.y]) } return pts }
function polygonArea(poly){ let a=0; for(let i=0;i<poly.length;i++){ const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; a+=x1*y2-x2*y1 } return Math.abs(a)/2 }

// ---- Fit to hoop (px->mm centered)
function fitToHoop(regs,hoop){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity
  regs.forEach(r=>r.polys.forEach(poly=>poly.forEach(([x,y])=>{ if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y })))
  const bw=Math.max(1,maxx-minx), bh=Math.max(1,maxy-miny), s=Math.min(hoop.w/bw, hoop.h/bh)
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2
  return regs.map(r=>({color:r.color, polys:r.polys.map(poly=>poly.map(([x,y])=>[(x-cx)*s,(y-cy)*s]))}))
}

// ---- Stitches (hatch + outline)
function planStitches(regs,{densityMM,angleDeg,outline,maxStitchMM}){
  const stitches=[], colors=[]
  for(let ci=0;ci<regs.length;ci++){
    const r=regs[ci]; colors.push(r.color); if(ci>0) stitches.push({colorChange:true,x:0,y:0})
    for(const poly of r.polys){
      const lines=hatch(poly,densityMM,angleDeg)
      for(const [a,b] of lines){
        const segs=insideSegments(a,b,poly,0.6)
        for(const [s,e] of segs){ stitches.push({x:s[0],y:s[1],jump:true}); line(stitches,s,e,maxStitchMM) }
      }
      if(outline){ const n=poly.length; stitches.push({x:poly[0][0],y:poly[0][1],jump:true})
        for(let i=1;i<=n;i++) line(stitches,poly[(i-1)%n],poly[i%n],maxStitchMM) }
    }
  }
  stitches.push({end:true,x:0,y:0}); return {stitches,colors}
}
function hatch(poly,spacing,deg){ let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity
  for(const [x,y] of poly){ if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y }
  const ang=deg*Math.PI/180, dir=[Math.cos(ang),Math.sin(ang)], nrm=[-dir[1],dir[0]]
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2, diag=Math.hypot(maxx-minx,maxy-miny), half=diag
  const lines=[], range=Math.ceil(diag/spacing)+2
  for(let k=-range;k<=range;k++){ const off=k*spacing, px=cx+nrm[0]*off, py=cy+nrm[1]*off
    lines.push([[px-dir[0]*half,py-dir[1]*half],[px+dir[0]*half,py+dir[1]*half]]) }
  return lines
}
function insideSegments(a,b,poly,sample){ const len=Math.hypot(b[0]-a[0],b[1]-a[1]), steps=Math.max(2,Math.floor(len/sample))
  const pts=[]; for(let i=0;i<=steps;i++){ const t=i/steps; pts.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]) }
  const segs=[]; let cur=null
  for(let i=0;i<pts.length;i++){ const inside=insidePoly(pts[i],poly)
    if(inside && !cur) cur=pts[i]; if((!inside || i===pts.length-1) && cur){ const end=inside?pts[i]:pts[i-1]; if(dist(cur,end)>0.5) segs.push([cur,end]); cur=null } }
  return segs
}
function line(out,a,b,maxStep){ const len=Math.hypot(b[0]-a[0],b[1]-a[1]), steps=Math.max(1,Math.ceil(len/maxStep))
  for(let i=1;i<=steps;i++){ const t=i/steps; out.push({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t}) } }
function insidePoly(p,poly){ let c=false,j=poly.length-1; for(let i=0;i<poly.length;i++){ const [xi,yi]=poly[i],[xj,yj]=poly[j]
    const inter=((yi>p[1])!==(yj>p[1])) && (p[0] < (xj-xi)*(p[1]-yi)/(yj-yi)+xi); if(inter) c=!c; j=i } return c }
const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1])

// ---- DST writer (minimal)
function writeDST(plan){
  const out=[]; let lx=0,ly=0; const to=mm=>Math.round(mm*10), clamp=(v)=>Math.max(-121,Math.min(121,v))
  for(const s of plan.stitches){
    if(s.end){ out.push(0x00,0x00,0xF3); break }
    if(s.colorChange){ out.push(0x00,0x00,0xC3); continue }
    const dx=clamp(to(s.x-lx)), dy=clamp(to(s.y-ly)); lx=s.x; ly=s.y
    const [b1,b2,b3]=pack(dx,dy,!!s.jump); out.push(b1,b2,b3)
  }
  const header=new Uint8Array(512).fill(0x20)
  const put=(t,o)=>{ for(let i=0;i<t.length;i++) header[o+i]=t.charCodeAt(i) }
  const recs=new Uint8Array(out), st=Math.floor(recs.length/3), cc=Math.max(1,1+plan.stitches.filter(s=>s.colorChange).length)
  put(`LA:LOOMABELLE\n`,0); put(`ST:${String(st).padStart(7,' ')}`,11); put(`CO:${String(cc).padStart(7,' ')}`,24)
  put(`+X  100\n-Y  100\n`,52); put(`AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n`,80); put(`PD:******\n`,232)
  const file=new Uint8Array(512+recs.length+1); file.set(header,0); file.set(recs,512); file[512+recs.length]=0x1A
  return file.buffer
}
function pack(dx,dy,jump){ const ax=Math.abs(dx), ay=Math.abs(dy); let b1=0,b2=0,b3=0
  if(ax&1)b1|=1; if(ax&2)b1|=2; if(ax&4)b1|=4; if(ax&8)b2|=1; if(ax&16)b2|=2; if(ax&32)b2|=4; if(ax&64)b3|=1
  if(ay&1)b1|=8; if(ay&2)b1|=16; if(ay&4)b1|=32; if(ay&8)b2|=8; if(ay&16)b2|=16; if(ay&32)b2|=32; if(ay&64)b3|=2
  if(dx<0)b3|=0x20; if(dy<0)b3|=0x40; if(jump)b3|=0x10; return [b1,b2,b3]
}

// ---- Preview
function drawPreview(plan,W,H){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity
  for(const s of plan.stitches){ if(s.end||s.colorChange) continue; if(s.x<minx)minx=s.x; if(s.y<miny)miny=s.y; if(s.x>maxx)maxx=s.x; if(s.y>maxy)maxy=s.y }
  const bw=Math.max(1,maxx-minx), bh=Math.max(1,maxy-miny), sc=0.9*Math.min(W/bw,H/bh), ox=W/2-(minx+maxx)/2*sc, oy=H/2-(miny+maxy)/2*sc
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,W,H); g.strokeStyle='#111'
  let last=null; for(const s of plan.stitches){ if(s.colorChange||s.end){last=null; continue} if(s.jump){ last={x:s.x,y:s.y}; continue }
    if(!last){ last={x:s.x,y:s.y}; continue } g.beginPath(); g.moveTo(ox+last.x*sc,oy+last.y*sc); g.lineTo(ox+s.x*sc,oy+s.y*sc); g.stroke(); last={x:s.x,y:s.y} }
  return c.toDataURL('image/png')
}