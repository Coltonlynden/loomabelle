(function () {
  const mask = document.getElementById('maskCanvas');
  const tabs = [...document.querySelectorAll('.tab')];
  if (!mask) return;

  const m = mask.getContext('2d', { willReadFrequently: true });
  const size = document.getElementById('size');
  const showMask = document.getElementById('showMask');
  const showEdges = document.getElementById('showEdges');

  const btns = [...document.querySelectorAll('[data-tool]')];

  let tool = 'paint';
  let mode = 'mask';
  let drawing = false;

  function setTool(t){
    tool=t; btns.forEach(b=>b.classList.toggle('act', b.dataset.tool===t));
  }
  btns.forEach(b=> b.addEventListener('click', ()=> setTool(b.dataset.tool)));
  setTool('paint');

  // TAB LOGIC — show only the panel for the active tab
  function showPanel() {
    document.getElementById('maskOpts').classList.toggle('hide', mode!=='mask');
    document.getElementById('textOpts').classList.toggle('hide', mode!=='text');
    document.getElementById('dirOpts').classList.toggle('hide',  mode!=='direction');
  }
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      mode = t.dataset.mode;
      showPanel();
    });
  });
  showPanel();

  showMask?.addEventListener('change', ()=> mask.style.opacity = showMask.checked?1:0);
  showEdges?.addEventListener('change', ()=> document.getElementById('edgesCanvas').classList.toggle('hide', !showEdges.checked));

  function pos(e){
    const r = mask.getBoundingClientRect();
    return { x: Math.max(0, Math.min(mask.width,  (e.clientX - r.left) * (mask.width  / r.width))),
             y: Math.max(0, Math.min(mask.height, (e.clientY - r.top ) * (mask.height / r.height))) };
  }

  function dot(x,y,s,erase=false){
    m.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    m.fillStyle = 'rgba(217,137,131,0.35)';
    m.beginPath(); m.arc(x,y,s/2,0,Math.PI*2); m.fill();
  }

  function flood(x0,y0,erase=false){
    const {width:w,height:h}=mask;
    const img=m.getImageData(0,0,w,h); const A=img.data;
    const at=(x,y)=> (y*w+x)*4+3;
    const target=A[at(x0,y0)]; const want=erase?0:200;
    if (erase? target===0 : target>180) return;
    const q=[[x0,y0]]; const seen=new Uint8Array(w*h); seen[y0*w+x0]=1;
    while(q.length){
      const [x,y]=q.pop(); A[at(x,y)]=want;
      if(x>0 && !seen[y*w+x-1]){seen[y*w+x-1]=1;q.push([x-1,y]);}
      if(x<w-1 && !seen[y*w+x+1]){seen[y*w+x+1]=1;q.push([x+1,y]);}
      if(y>0 && !seen[(y-1)*w+x]){seen[(y-1)*w+x]=1;q.push([x,y-1]);}
      if(y<h-1 && !seen[(y+1)*w+x]){seen[(y+1)*w+x]=1;q.push([x,y+1]);}
    }
    m.putImageData(img,0,0);
  }

  mask.addEventListener('pointerdown', (e)=>{
    if (mode!=='mask') return;
    mask.setPointerCapture(e.pointerId);
    drawing = true;
    const s = Number(size?.value||34);
    const p = pos(e);
    if (tool==='paint') dot(p.x,p.y,s,false);
    else if (tool==='erase') dot(p.x,p.y,s,true);
    else if (tool==='wand') flood(Math.round(p.x), Math.round(p.y), e.shiftKey);
    push(); // snapshot for undo
  });
  mask.addEventListener('pointermove', (e)=>{
    if (!drawing || mode!=='mask') return;
    const s = Number(size?.value||34);
    const p = pos(e);
    dot(p.x,p.y,s, tool==='erase');
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> mask.addEventListener(ev, ()=> drawing=false));

  // Clear/fill/undo/redo
  document.getElementById('clear')?.addEventListener('click', ()=>{m.clearRect(0,0,mask.width,mask.height); push();});
  document.getElementById('fill') ?.addEventListener('click', ()=>{m.globalCompositeOperation='source-over'; m.fillStyle='rgba(217,137,131,0.35)'; m.fillRect(0,0,mask.width,mask.height); push();});

  const hist=[]; let hi=-1;
  function push(){ try{ hist.splice(hi+1); hist.push(m.getImageData(0,0,mask.width,mask.height)); hi=hist.length-1; }catch{} }
  function load(k){ if (k>=0 && k<hist.length){ hi=k; m.putImageData(hist[k],0,0);} }
  document.getElementById('undo')?.addEventListener('click', ()=> load(hi-1));
  document.getElementById('redo')?.addEventListener('click', ()=> load(hi+1));
})();