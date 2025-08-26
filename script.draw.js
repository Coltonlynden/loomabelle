/* Restored brush: paint / erase / wand on the MASK canvas with a soft pink overlay */
(function () {
  const mask = document.getElementById('maskCanvas');
  const imgBox = document.querySelector('.editbox');
  if (!mask || !imgBox) return;

  const m = mask.getContext('2d', { willReadFrequently: true });
  const size = document.getElementById('size');
  const showMask = document.getElementById('showMask');
  const showEdges = document.getElementById('showEdges');

  const btns = [...document.querySelectorAll('[data-tool]')];
  const tabs = [...document.querySelectorAll('.tab')];

  let tool = 'paint';
  let mode = 'mask';
  let drawing = false;

  function setTool(t){
    tool = t;
    btns.forEach(b=>b.classList.toggle('act', b.dataset.tool===t));
  }
  btns.forEach(b=> b.addEventListener('click', ()=> setTool(b.dataset.tool)));
  setTool('paint');

  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      mode = t.dataset.mode;                      // only hides/shows options; layout same
      document.getElementById('textOpts').classList.toggle('hide', mode!=='text');
    });
  });

  showMask?.addEventListener('change', ()=> mask.style.opacity = showMask.checked?1:0);
  showEdges?.addEventListener('change', ()=>{
    document.getElementById('edgesCanvas').classList.toggle('hide', !showEdges.checked);
  });

  function pos(e){
    const r = mask.getBoundingClientRect();
    return { x: Math.max(0, Math.min(mask.width, (e.clientX - r.left) * (mask.width / r.width))),
             y: Math.max(0, Math.min(mask.height, (e.clientY - r.top ) * (mask.height/ r.height))) };
  }

  function dot(x,y,s,erase=false){
    m.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    m.fillStyle = 'rgba(217,137,131,0.35)'; // blush highlight
    m.beginPath(); m.arc(x,y,s/2,0,Math.PI*2); m.fill();
  }

  function flood(x0,y0,erase=false){
    // simple alpha flood on current mask
    const {width:w, height:h} = mask;
    const img = m.getImageData(0,0,w,h);
    const A = img.data;
    const idx = (x,y)=> (y*w + x)*4 + 3;
    const target = A[idx(x0,y0)];
    const wanted = erase ? 0 : 200;
    if (erase && target===0) return;
    if (!erase && target>180) return;

    const q = [[x0,y0]]; const seen = new Uint8Array(w*h); seen[y0*w+x0]=1;
    while(q.length){
      const [x,y]=q.pop();
      A[idx(x,y)] = wanted;        // set alpha
      if (x>0   && !seen[y*w+x-1]){ seen[y*w+x-1]=1; q.push([x-1,y]); }
      if (x<w-1 && !seen[y*w+x+1]){ seen[y*w+x+1]=1; q.push([x+1,y]); }
      if (y>0   && !seen[(y-1)*w+x]){ seen[(y-1)*w+x]=1; q.push([x,y-1]); }
      if (y<h-1 && !seen[(y+1)*w+x]){ seen[(y+1)*w+x]=1; q.push([x,y+1]); }
    }
    m.putImageData(img,0,0);
  }

  mask.addEventListener('pointerdown', (e)=>{
    if (mode!=='mask') return;
    mask.setPointerCapture(e.pointerId);
    drawing = true;
    const s = Number(size?.value||36);
    const p = pos(e);
    if (tool==='paint') dot(p.x,p.y,s,false);
    else if (tool==='erase') dot(p.x,p.y,s,true);
    else if (tool==='wand') flood(Math.round(p.x), Math.round(p.y), e.shiftKey);
  });
  mask.addEventListener('pointermove', (e)=>{
    if (!drawing || mode!=='mask') return;
    const s = Number(size?.value||36);
    const p = pos(e);
    dot(p.x,p.y,s, tool==='erase');
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> mask.addEventListener(ev, ()=> drawing=false));

  // utility buttons
  document.getElementById('clear')?.addEventListener('click', ()=> m.clearRect(0,0,mask.width,mask.height));
  document.getElementById('fill') ?.addEventListener('click', ()=>{
    m.globalCompositeOperation='source-over';
    m.fillStyle='rgba(217,137,131,0.35)'; m.fillRect(0,0,mask.width,mask.height);
  });

  // very small undo/redo using ImageData stack
  const hist=[]; let hi=-1;
  function push(){ try{ hist.splice(hi+1); hist.push(m.getImageData(0,0,mask.width,mask.height)); hi=hist.length-1; }catch{} }
  function load(k){ if (k>=0 && k<hist.length){ hi=k; m.putImageData(hist[k],0,0);} }
  mask.addEventListener('pointerdown', push);
  document.getElementById('undo')?.addEventListener('click', ()=> load(hi-1));
  document.getElementById('redo')?.addEventListener('click', ()=> load(hi+1));
})();