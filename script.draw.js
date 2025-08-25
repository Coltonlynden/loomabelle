// Brush/Text/Direction + fixed paint/erase/wand + zoom/pan hooks
(function(){
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const S = (window.EAS ||= {}).state ||= {};

  // mode switching (only relevant group shown)
  const groups = {
    mask: $('.tools-mask'),
    text: $('.tools-text'),
    direction: $('.tools-direction')
  };
  function setMode(m){
    S.mode = m;
    $$('#brush-controls .chip[data-mode]').forEach(c => c.classList.toggle('chip--active', c.dataset.mode===m));
    Object.entries(groups).forEach(([k,el])=>el.classList.toggle('hidden', k!==m));
  }
  $$('#brush-controls .chip[data-mode]').forEach(c => c.addEventListener('click', ()=>setMode(c.dataset.mode)));
  setMode('mask');

  // brush settings
  S.brushSize = 22; S.tool='paint';
  $('#brush-size').addEventListener('input', e=> S.brushSize = +e.target.value);
  $('#paint').addEventListener('click', ()=> setTool('paint'));
  $('#erase').addEventListener('click', ()=> setTool('erase'));
  $('#wand').addEventListener('click',  ()=> setTool('wand'));
  function setTool(t){
    S.tool=t;
    ['paint','erase','wand'].forEach(id => $('#'+id).classList.toggle('chip--active', id===t));
  }

  // canvas refs
  const mask = $('#mask');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  const base = $('#canvas').getContext('2d', { willReadFrequently: true });

  // painting helpers
  const W=1024,H=1024;
  mask.width=W;mask.height=H;
  const UNDO=[], REDO=[];
  function pushUndo(){ try{UNDO.push(mctx.getImageData(0,0,W,H)); if(UNDO.length>40) UNDO.shift(); REDO.length=0;}catch{} }
  $('#btn-undo').addEventListener('click',()=>{ if(!UNDO.length) return; REDO.push(mctx.getImageData(0,0,W,H)); mctx.putImageData(UNDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-redo').addEventListener('click',()=>{ if(!REDO.length) return; UNDO.push(mctx.getImageData(0,0,W,H)); mctx.putImageData(REDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-clear-mask').addEventListener('click',()=>{ pushUndo(); mctx.clearRect(0,0,W,H); window.EAS_preview.render(); });
  $('#btn-fill-mask').addEventListener('click',()=>{ pushUndo(); mctx.globalCompositeOperation='source-over'; mctx.fillStyle='#000'; mctx.fillRect(0,0,W,H); window.EAS_preview.render(); });

  function pos(ev, el){
    const r = el.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height };
  }
  function dab(x,y,r,erase){
    mctx.save();
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.beginPath(); mctx.arc(x,y,r,0,Math.PI*2); mctx.fillStyle='#000'; mctx.fill();
    mctx.restore();
  }

  let painting=false, last=null;
  function down(ev){
    if(S.mode!=='mask') return;
    ev.preventDefault();
    const p = pos(ev, mask);
    if(S.tool==='wand'){ flood(p.x|0, p.y|0); window.EAS_preview.render(); return; }
    pushUndo(); painting=true; last=p; dab(p.x,p.y,S.brushSize,S.tool==='erase'); window.EAS_preview.render();
  }
  function move(ev){
    if(!painting) return;
    ev.preventDefault();
    const p = pos(ev, mask);
    const dx=p.x-last.x, dy=p.y-last.y; const d=Math.hypot(dx,dy);
    const steps = Math.max(1,(d/(S.brushSize*0.4))|0);
    for(let i=1;i<=steps;i++) dab(last.x+dx*i/steps, last.y+dy*i/steps, S.brushSize, S.tool==='erase');
    last=p; window.EAS_preview.render();
  }
  function up(){ painting=false; }

  mask.addEventListener('mousedown',down); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  mask.addEventListener('touchstart',down,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',up,{passive:false});

  // flood fill wand using ORIGINAL image (S.srcData) for stable colors
  function flood(x,y){
    const S0 = (window.EAS||{}).state; if(!S0.srcData) return;
    pushUndo();
    const src=S0.srcData.data;
    const out=mctx.getImageData(0,0,W,H); const m=out.data;
    const seen=new Uint8Array(W*H);
    const q=[[x,y]];
    const i0=(y*W+x)<<2; const r0=src[i0], g0=src[i0+1], b0=src[i0+2];
    const tol=38;
    while(q.length){
      const [X,Y]=q.pop();
      if(X<0||Y<0||X>=W||Y>=H) continue;
      const p=Y*W+X; if(seen[p]) continue; seen[p]=1;
      const i=(p<<2);
      const dr=Math.abs(src[i]-r0)+Math.abs(src[i+1]-g0)+Math.abs(src[i+2]-b0);
      if(dr>tol) continue;
      m[i]=0;m[i+1]=0;m[i+2]=0;m[i+3]=255;
      q.push([X+1,Y],[X-1,Y],[X,Y+1],[X,Y-1]);
    }
    mctx.putImageData(out,0,0);
  }

  // text + direction bindings
  const T = (S.text ||= { content:'', curve:0, size:64, angle:0 });
  $('#text-string').addEventListener('input',e=>{T.content=e.target.value; window.EAS_preview.render();});
  $('#text-curve').addEventListener('input',e=>{T.curve=+e.target.value; window.EAS_preview.render();});
  $('#text-size').addEventListener('input',e=>{T.size=+e.target.value; window.EAS_preview.render();});
  $('#text-angle').addEventListener('input',e=>{T.angle=+e.target.value; window.EAS_preview.render();});
  $('#apply-text').addEventListener('click',()=>window.EAS_preview.render());

  const dirA=$('#dir-angle'), dirV=$('#dir-angle-value'), dirT=$('#toggle-dir');
  dirA.addEventListener('input',e=>{S.dirAngle=+e.target.value; dirV.textContent=S.dirAngle+'°'; window.EAS_preview.render();});
  dirT.addEventListener('change',()=>{S.showDir = dirT.checked; window.EAS_preview.render();});

  // zoom/pan hooks used by processing/preview
  S.zoom=1; S.panX=0; S.panY=0;
  $('#zoom-in').addEventListener('click',()=>{S.zoom=Math.min(S.zoom+0.1,3); window.EAS_preview.render();});
  $('#zoom-out').addEventListener('click',()=>{S.zoom=Math.max(S.zoom-0.1,0.4); window.EAS_preview.render();});
  $('#zoom-reset').addEventListener('click',()=>{S.zoom=1;S.panX=0;S.panY=0; window.EAS_preview.render();});

  // generate / export buttons
  $('#btn-make').addEventListener('click',()=> window.EAS_processing.generate());
  $('#dl-png').addEventListener('click', ()=> window.EAS_processing.exportPNG());
  $('#dl-svg').addEventListener('click', ()=> window.EAS_processing.exportSVG());
  $('#dl-json').addEventListener('click',()=> window.EAS_processing.exportJSON());
  $('#dl-dst').addEventListener('click', ()=> window.EAS_processing.exportDST());
})();