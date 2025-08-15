/* Loomabelle — script.js v11
   UI glue only (keeps your design as-is).
   - Preview hidden until upload; shows image immediately
   - Fast processing via Looma.processPhoto / Looma.processDrawing
   - Progress bar; draw tab default pen; pointer-capture long strokes
   - Exports DST/EXP offline (PES/JEF optional via your AI endpoint)
*/
(function(){
  const $=(s,el)=> (el||document).querySelector(s);
  const $$=(s,el)=> Array.prototype.slice.call((el||document).querySelectorAll(s));
  const on=(el,ev,fn,opts)=> el&&el.addEventListener(ev,fn,opts||{passive:false});
  const dpr=()=>window.devicePixelRatio||1;

  // Hide any “mockup” notes without touching your layout
  $$('.text-muted,.muted,.note,small,.badge').forEach(el=>{
    if((el.textContent||'').toLowerCase().includes('mockup')) el.style.display='none';
  });

  // Locate existing hosts
  const prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  const drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost||!drawHost){ console.error('Missing .preview/.canvas'); return; }
  if(getComputedStyle(prevHost).position==='static'){ prevHost.style.position='relative'; }

  // Canvases
  const prev=document.createElement('canvas'), pctx=prev.getContext('2d',{willReadFrequently:true});
  const draw=document.createElement('canvas'), dctx=draw.getContext('2d',{willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';
  prev.style.visibility='hidden';
  prevHost.innerHTML=''; prevHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);

  // Progress
  const progWrap=document.createElement('div'); progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
  const progBar=document.createElement('div'); progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.7';
  progWrap.appendChild(progBar); prevHost.appendChild(progWrap);
  const setProgress=(pct)=>{ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(()=>progWrap.style.display='none', 400); };

  // Sizing
  function sizeCanvasToHost(canvas, host){
    const cw=Math.max(320, host.clientWidth||640);
    const ch=Math.max(220, Math.floor(cw*9/16));
    const scale=dpr();
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width=Math.round(cw*scale); canvas.height=Math.round(ch*scale);
    canvas.getContext('2d').setTransform(scale,0,0,scale,0,0);
  }
  function resizeAll(){ sizeCanvasToHost(prev,prevHost); sizeCanvasToHost(draw,drawHost); render(); }
  try{
    new ResizeObserver(resizeAll).observe(prevHost);
    new ResizeObserver(resizeAll).observe(drawHost);
  }catch(e){ window.addEventListener('resize', resizeAll); }
  resizeAll();
  pctx.fillStyle='#fff'; pctx.fillRect(0,0,prev.width/dpr(),prev.height/dpr());

  // Thread palette (restore if your markup left it empty)
  const sw=document.querySelector('.swatches');
  if(sw && sw.children.length===0){
    ['#111827','#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
      .forEach(c=>{
        const d=document.createElement('div');
        d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer';
        d.title=c; on(d,'click',()=>{ STATE.active=c; render(); }); sw.appendChild(d);
      });
  }

  // Toolbar INSIDE preview: Process / Highlight / No subject
  const tb=document.createElement('div'); tb.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
  const btnProcess=document.createElement('button'); btnProcess.className='btn'; btnProcess.textContent='Process Photo';
  const btnHighlight=document.createElement('button'); btnHighlight.className='btn'; btnHighlight.textContent='Highlight Subject';
  const lblNo=document.createElement('label'); const chkNo=document.createElement('input'); chkNo.type='checkbox'; lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
  tb.appendChild(btnProcess); tb.appendChild(btnHighlight); tb.appendChild(lblNo); prevHost.appendChild(tb);
  on(btnHighlight,'click',()=>{ STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; btnHighlight.classList.toggle('active',STATE.subject.enabled); render(); });
  on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

  // Formats hidden until processed
  const formatBtns=$$('.col.card.rose .formats .btn');
  const setFormatsVisible=(v)=> formatBtns.forEach(b=> b.style.display = v?'inline-block':'none');
  setFormatsVisible(false);

  // Upload
  const uploadZone=$('.upload-zone');
  const fileInput=uploadZone && uploadZone.querySelector('input[type="file"]');
  if(uploadZone){
    if(fileInput){ fileInput.removeAttribute('disabled'); on(fileInput,'change',()=>{ const f=fileInput.files[0]; if(f) loadImage(f); }); }
    on(uploadZone,'dragover',e=>e.preventDefault());
    on(uploadZone,'drop',e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(uploadZone,'click',e=>{ if(e.target===uploadZone && fileInput) fileInput.click(); });
  }

  // Draw tab basics
  draw.style.touchAction='none'; // prevent page scroll
  let tool='pen', drawing=false, activeId=null;
  const toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
  const map=['pen','eraser','fill','fabric','guides','undo'];
  toolBtns.forEach((b,i)=>{
    const t=map[i]||'pen'; b.dataset.tool=t; b.removeAttribute('disabled');
    on(b,'click',()=>{
      if(t==='undo'){ dctx.clearRect(0,0,draw.width,draw.height); return; }
      if(t==='guides'){ STATE.guides=!STATE.guides; render(); return; }
      if(t==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; render(); return; }
      tool=t;
    });
  });
  // default tool = pen
  tool='pen';

  on(draw,'pointerdown',e=>{
    const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    draw.setPointerCapture(e.pointerId); activeId=e.pointerId; e.preventDefault();
    if(tool==='fill'){ floodFill(dctx,x|0,y|0,STATE.active); return; }
    dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
  });
  on(draw,'pointermove',e=>{
    if(!drawing || e.pointerId!==activeId) return; e.preventDefault();
    const r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(tool==='pen'){ dctx.lineTo(x,y); dctx.stroke(); }
    else if(tool==='eraser'){ dctx.clearRect(x-6,y-6,12,12); }
  });
  const stopDraw=e=>{ if(e.pointerId===activeId){ drawing=false; activeId=null; try{draw.releasePointerCapture(e.pointerId);}catch(_){} } };
  on(draw,'pointerup',stopDraw); on(draw,'pointercancel',stopDraw);

  function floodFill(ctx,x,y,hex){
    const toRGB=(hex)=>{hex=String(hex||'').replace('#',''); if(hex.length===3)hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255];}
    const [r,g,b]=toRGB(hex);
    const w=ctx.canvas.width,h=ctx.canvas.height;
    const id=ctx.getImageData(0,0,w,h), d=id.data;
    const idx=(a,b)=>(b*w+a)*4;
    const t=[d[idx(x,y)], d[idx(x,y)+1], d[idx(x,y)+2], d[idx(x,y)+3]];
    const q=[[x,y]], seen=new Uint8Array(w*h);
    while(q.length){
      const [cx,cy]=q.pop();
      if(cx<0||cy<0||cx>=w||cy>=h) continue;
      const i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
      if(d[i]!==t[0]||d[i+1]!==t[1]||d[i+2]!==t[2]||d[i+3]!==t[3]) continue;
      d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
      q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(id,0,0);
  }

  // Subject rectangle on preview
  const STATE={active:'#111827', guides:false, subject:{enabled:false,rect:null,noSubject:false}, stitches:[], lastImage:null, imgFit:null};
  let dragging=false, start=null;
  on(prev,'pointerdown',e=>{
    if(!STATE.subject.enabled) return;
    const r=prev.getBoundingClientRect(); start=[e.clientX-r.left,e.clientY-r.top]; dragging=true; STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; render();
  });
  on(prev,'pointermove',e=>{
    if(!dragging || !STATE.subject.enabled) return;
    const r=prev.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])}; render();
  });
  on(window,'pointerup',()=>{ dragging=false; });

  // Buttons behavior (keep your existing nav)
  function switchTo(tabName){
    const target=$('.tab-btn[data-tab="'+tabName+'"]'); if(!target) return;
    const tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(b=>b.classList.toggle('active', b===target));
    panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===tabName));
    requestAnimationFrame(resizeAll);
  }
  $$('a,button').forEach(el=>{
    const t=(el.textContent||'').toLowerCase();
    if(t.includes('start with a photo') || t.includes('upload photo')){
      on(el,'click',e=>{ e.preventDefault(); switchTo('upload'); });
    }
    if(/open.*draw|open.*drawing|draw & trace/.test(t)){
      on(el,'click',e=>{ e.preventDefault(); switchTo('draw'); });
    }
  });

  // Show image immediately after upload
  async function loadImage(file){
    let chosen=file;
    const name=(file.name||'').toLowerCase();
    const type=(file.type||'').toLowerCase();
    if(type.includes('heic')||type.includes('heif')||name.endsWith('.heic')||name.endsWith('.heif')){
      try{ chosen = await window.Looma.heicToJpeg(file); }catch(_){}
    }
    const url=URL.createObjectURL(chosen);
    try{
      const img = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
      // Safe downscale for speed
      const maxSide = /iPhone|iPad|iPod/i.test(navigator.userAgent)? 1024 : 1600;
      let W = img.naturalWidth, H = img.naturalHeight;
      if (Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
      const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d'); x.drawImage(img,0,0,W,H);
      STATE.lastImage = x.getImageData(0,0,W,H);
      // draw into preview immediately
      prev.style.visibility='visible'; tb.style.visibility='visible';
      const Wp=prev.width/dpr(), Hp=prev.height/dpr();
      const s=Math.min(Wp/W, Hp/H), w=W*s, h=H*s, ox=(Wp-w)/2, oy=(Hp-h)/2;
      pctx.setTransform(dpr(),0,0,dpr(),0,0);
      pctx.clearRect(0,0,Wp,Hp); pctx.fillStyle='#fff'; pctx.fillRect(0,0,Wp,Hp);
      pctx.drawImage(c,ox,oy,w,h);
      STATE.imgFit={ox,oy,scale:s,iw:W,ih:H};
      setFormatsVisible(false);
      switchTo('upload');
    }finally{ URL.revokeObjectURL(url); }
  }

  // Process photo with new engine
  on(btnProcess,'click',async ()=>{
    if(!STATE.lastImage){ const fi=$('.upload-zone input[type="file"]'); if(fi?.files?.[0]) await loadImage(fi.files[0]); }
    if(!STATE.lastImage) return alert('Choose a photo first.');
    setFormatsVisible(false); setProgress(1);

    // Build optional subject mask from rectangle
    let mask=null;
    if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){
      const {ox,oy,scale,iw,ih}=STATE.imgFit;
      // create mask at image resolution
      const m=new Uint8Array(iw*ih);
      const sx=Math.max(0, Math.floor((STATE.subject.rect.x - ox)/scale));
      const sy=Math.max(0, Math.floor((STATE.subject.rect.y - oy)/scale));
      const ex=Math.min(iw-1, Math.floor((STATE.subject.rect.x+STATE.subject.rect.w - ox)/scale));
      const ey=Math.min(ih-1, Math.floor((STATE.subject.rect.y+STATE.subject.rect.h - oy)/scale));
      for(let y=sy;y<=ey;y++){ for(let x=sx;x<=ex;x++){ m[y*iw+x]=1; } }
      mask=m;
    }

    // Process fast
    const imgData = STATE.lastImage;
    const res = await window.Looma.processPhoto(imgData,
      { k:6, autoColors:true, outline:true, angle:45, density:0.40, pxPerMm:2, outW:prev.width/dpr(), outH:prev.height/dpr(), mask },
      (p)=>setProgress(Math.max(1,Math.min(99,p)))
    );
    // Render preview stitches (simple polyline)
    STATE.stitches = res.ops.map(op=>{
      if(op.cmd==='jump') return {move:true,x:op.x,y:op.y};
      return {move:false,x:op.x,y:op.y};
    });
    render();
    // enable downloads
    hookDownloads(res);
    setProgress(100);
    setFormatsVisible(true);
  });

  // Process drawing → switch to Preview
  (function addProcessDrawing(){
    const toolRow=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    const btn=document.createElement('button'); btn.className='btn'; btn.style.marginLeft='10px'; btn.textContent='Process Drawing';
    toolRow && toolRow.appendChild(btn);
    on(btn,'click',async ()=>{
      setFormatsVisible(false); setProgress(1);
      // downscale drawing into ImageData
      const max=1024, w=draw.width, h=draw.height, s=Math.min(1, max/Math.max(w,h));
      const c=document.createElement('canvas'); c.width=(w*s)|0; c.height=(h*s)|0;
      c.getContext('2d').drawImage(draw,0,0,c.width,c.height);
      const id=c.getContext('2d').getImageData(0,0,c.width,c.height);
      // process
      const res = await window.Looma.processDrawing(id, {pxPerMm:2}, p=>setProgress(Math.max(1,Math.min(99,p))));
      STATE.stitches = res.ops.map(op=> (op.cmd==='jump')?{move:true,x:op.x,y:op.y}:{move:false,x:op.x,y:op.y});
      // show in preview
      render(); setProgress(100); setFormatsVisible(true);
      switchTo('upload');
    });
  })();

  // Draw stitches & overlays
  function render(){
    const W=prev.width/dpr(), H=prev.height/dpr();
    pctx.setTransform(dpr(),0,0,dpr(),0,0);
    // keep whatever image is there; just draw stitches on top
    pctx.save();
    pctx.strokeStyle=STATE.active; pctx.lineWidth=1.6; pctx.beginPath();
    let started=false;
    for(const s of STATE.stitches){
      if(s.move){ pctx.moveTo(s.x,s.y); started=true; }
      else if(started){ pctx.lineTo(s.x,s.y); }
    }
    pctx.stroke(); pctx.restore();
    if(STATE.subject.enabled && STATE.subject.rect){
      const r=STATE.subject.rect; pctx.save(); pctx.setLineDash([6,6]); pctx.strokeStyle='rgba(20,20,20,.95)'; pctx.strokeRect(r.x,r.y,r.w,r.h); pctx.restore();
    }
  }

  // Downloads
  function hookDownloads(res){
    const btns = $$('.col.card.rose .formats .btn');
    btns.forEach(btn=>{
      const fmt=btn.textContent.replace(/\s+/g,'').toUpperCase();
      if(fmt==='DST'){ btn.onclick=()=>downloadU8(res.dstU8, 'loomabelle.dst'); btn.style.display='inline-block'; }
      else if(fmt==='EXP'){ btn.onclick=()=>downloadU8(res.expU8, 'loomabelle.exp'); btn.style.display='inline-block'; }
      // PES/JEF can still go through your AI endpoint if you have one configured
    });
  }
  function downloadU8(u8, name){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  }

})();
