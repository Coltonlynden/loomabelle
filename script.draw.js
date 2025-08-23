// paint / erase / wand + mode toggles
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$= (s, r=document)=>Array.from(r.querySelectorAll(s));
  const S = (window.EAS ||= {}).state ||= { tool:'brush', brushSize:18, mode:'mask' };

  // mode chips
  const chips = $$('#brush-controls .chip[data-mode]');
  const gMask=$('.tools-mask'), gText=$('.tools-text'), gDir=$('.tools-direction');
  function setMode(m){
    S.mode=m;
    chips.forEach(c=>c.classList.toggle('chip--active', c.dataset.mode===m));
    gMask.classList.toggle('hidden', m!=='mask');
    gText.classList.toggle('hidden', m!=='text');
    gDir .classList.toggle('hidden', m!=='direction');
  }
  chips.forEach(c=>c.addEventListener('click',()=>setMode(c.dataset.mode)));
  setMode('mask');

  // canvas + mask ctx
  const base = $('#canvas'), mask = $('#mask');
  const bctx = base.getContext('2d',{willReadFrequently:true});
  const mctx = mask.getContext('2d',{willReadFrequently:true});
  base.width = base.height = mask.width = mask.height = 1024;

  // tool buttons
  $('#paint')?.addEventListener('click', ()=>S.tool='brush');
  $('#erase')?.addEventListener('click', ()=>S.tool='erase');
  $('#wand') ?.addEventListener('click', ()=>S.tool='wand');
  $('#brush-size')?.addEventListener('input', e=>S.brushSize=+e.target.value);

  // undo/redo
  const UNDO=[]; const REDO=[];
  function pushUndo(){ try{ UNDO.push(mctx.getImageData(0,0,mask.width,mask.height)); if(UNDO.length>25) UNDO.shift(); REDO.length=0; }catch{} }
  $('#btn-undo')?.addEventListener('click',()=>{ if(UNDO.length){ REDO.push(mctx.getImageData(0,0,mask.width,mask.height)); mctx.putImageData(UNDO.pop(),0,0); window.EAS_preview.render(); }});
  $('#btn-redo')?.addEventListener('click',()=>{ if(REDO.length){ UNDO.push(mctx.getImageData(0,0,mask.width,mask.height)); mctx.putImageData(REDO.pop(),0,0); window.EAS_preview.render(); }});
  $('#btn-clear-mask')?.addEventListener('click',()=>{ pushUndo(); mctx.clearRect(0,0,mask.width,mask.height); window.EAS_preview.render(); });
  $('#btn-fill-mask') ?.addEventListener('click',()=>{ pushUndo(); mctx.fillStyle='#000'; mctx.fillRect(0,0,mask.width,mask.height); window.EAS_preview.render(); });

  $('#toggle-mask') ?.addEventListener('change', e=>$('#mask').style.opacity = e.target.checked?1:0);
  $('#toggle-edges')?.addEventListener('change', e=>$('#edges').style.opacity = e.target.checked?1:0);

  // draw helpers
  function dot(x,y,r,erase){
    mctx.save();
    mctx.globalCompositeOperation = erase?'destination-out':'source-over';
    mctx.beginPath(); mctx.arc(x,y,r,0,Math.PI*2); mctx.fillStyle='#000'; mctx.fill();
    mctx.restore();
  }
  const pos=(ev,el)=>{const r=el.getBoundingClientRect();const p=ev.touches?ev.touches[0]:ev;return{ x:(p.clientX-r.left)*1024/r.width, y:(p.clientY-r.top)*1024/r.height }};

  // wand flood fill from base colors
  function wand(x,y){
    pushUndo();
    const W=1024,H=1024;
    const b = bctx.getImageData(0,0,W,H).data;
    const m = mctx.getImageData(0,0,W,H);
    const d = m.data;
    const idx=(X,Y)=>((Y|0)*W+(X|0))<<2;
    const gx=Math.max(0,Math.min(W-1,x|0)), gy=Math.max(0,Math.min(H-1,y|0));
    const i0=idx(gx,gy), r0=b[i0], g0=b[i0+1], bl0=b[i0+2];
    const tol=32;
    const Q=[[gx,gy]]; const seen=new Uint8Array(W*H);
    while(Q.length){
      const [X,Y]=Q.pop(); if(X<0||Y<0||X>=W||Y>=H) continue;
      const p=(Y*W+X); if(seen[p]) continue; seen[p]=1;
      const q=p<<2; const r=b[q], g=b[q+1], bl=b[q+2];
      if(Math.abs(r-r0)+Math.abs(g-g0)+Math.abs(bl-bl0)>tol) continue;
      d[q]=0; d[q+1]=0; d[q+2]=0; d[q+3]=255;
      Q.push([X+1,Y],[X-1,Y],[X,Y+1],[X,Y-1]);
    }
    mctx.putImageData(m,0,0);
  }

  // pointer handlers
  let painting=false, last=null;
  function down(ev){
    if(S.tool==='wand'){ const p=pos(ev,mask); wand(p.x,p.y); window.EAS_preview.render(); return; }
    painting=true; last=pos(ev,mask); pushUndo(); dot(last.x,last.y,S.brushSize,S.tool==='erase'); window.EAS_preview.render(); ev.preventDefault();
  }
  function move(ev){
    if(!painting) return;
    const p=pos(ev,mask); const dx=p.x-last.x, dy=p.y-last.y; const dist=Math.hypot(dx,dy);
    const steps=Math.max(1,(dist/(S.brushSize*0.5))|0);
    for(let i=1;i<=steps;i++){ dot(last.x+dx*i/steps,last.y+dy*i/steps,S.brushSize,S.tool==='erase'); }
    last=p; window.EAS_preview.render(); ev.preventDefault();
  }
  function up(){ painting=false; }

  mask.addEventListener('mousedown',down); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  mask.addEventListener('touchstart',down,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',up);

  // text + direction state
  const T=(S.text={content:'',curve:0,size:64,angle:0});
  document.getElementById('text-string')?.addEventListener('input',e=>{T.content=e.target.value;});
  document.getElementById('text-curve') ?.addEventListener('input',e=>{T.curve=+e.target.value; window.EAS_preview.render();});
  document.getElementById('text-size')  ?.addEventListener('input',e=>{T.size =+e.target.value; window.EAS_preview.render();});
  document.getElementById('text-angle') ?.addEventListener('input',e=>{T.angle=+e.target.value; window.EAS_preview.render();});
  document.getElementById('apply-text') ?.addEventListener('click',()=>window.EAS_preview.render());

  const dirA=document.getElementById('dir-angle'), dirV=document.getElementById('dir-angle-value');
  const dirP=document.getElementById('dir-pattern'), dirT=document.getElementById('toggle-dir');
  S.dirAngle=+dirA.value; S.dirPattern=dirP.value; S.showDir=dirT.checked;
  dirA?.addEventListener('input',e=>{S.dirAngle=+e.target.value; dirV.textContent=S.dirAngle+'°'; window.EAS_preview.render();});
  dirP?.addEventListener('change',e=>{S.dirPattern=e.target.value; window.EAS_preview.render();});
  dirT?.addEventListener('change',()=>{S.showDir=dirT.checked; window.EAS_preview.render();});

  // zoom controls
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  document.getElementById('zoom-in')  ?.addEventListener('click',()=>{S.zoom=clamp((S.zoom||1)+0.1,0.4,3); window.EAS_processing.setShellTransform();});
  document.getElementById('zoom-out') ?.addEventListener('click',()=>{S.zoom=clamp((S.zoom||1)-0.1,0.4,3); window.EAS_processing.setShellTransform();});
  document.getElementById('zoom-reset')?.addEventListener('click',()=>{S.zoom=1;S.panX=0;S.panY=0;window.EAS_processing.setShellTransform();});

  // exports
  document.getElementById('btn-make')?.addEventListener('click',()=>window.EAS_processing.generate());
  document.getElementById('dl-png') ?.addEventListener('click',()=>window.EAS_processing.exportPNG());
  document.getElementById('dl-svg') ?.addEventListener('click',()=>window.EAS_processing.exportSVG());
  document.getElementById('dl-json')?.addEventListener('click',()=>window.EAS_processing.exportJSON());
  document.getElementById('dl-dst') ?.addEventListener('click',()=>window.EAS_processing.exportDST());

  document.getElementById('toggle-stitch')?.addEventListener('change',e=>window.EAS_preview.render());

  // expose
  window.EAS_draw = { setMode };
})();