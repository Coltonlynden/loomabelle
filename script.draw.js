// Painting tools (mask), text controls, direction + zoom
(function () {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const S=(window.EAS ||= {}).state ||= { tool:'paint', mode:'mask', brushSize:18, dirAngle:45, showDir:true, zoom:1, panX:0, panY:0 };

  const mask=$('#mask'); const mctx=mask.getContext('2d',{willReadFrequently:true});
  const bctx=document.getElementById('canvas').getContext('2d',{willReadFrequently:true});
  mask.width=mask.height=1024; mctx.clearRect(0,0,1024,1024);
  mask.style.pointerEvents='auto'; mask.style.zIndex=3;

  // Mode toggle
  const chips=$$('#brush-controls .chip[data-mode]');
  const gMask=$('.tools-mask'), gText=$('.tools-text'), gDir=$('.tools-direction');
  function setMode(m){ S.mode=m; chips.forEach(c=>c.classList.toggle('chip--active',c.dataset.mode===m)); gMask.classList.toggle('hidden',m!=='mask'); gText.classList.toggle('hidden',m!=='text'); gDir.classList.toggle('hidden',m!=='direction'); }
  chips.forEach(c=>c.addEventListener('click',()=>setMode(c.dataset.mode))); setMode('mask');

  // Tools
  $('#paint').addEventListener('click',()=>{S.tool='paint'; setActive();});
  $('#erase').addEventListener('click',()=>{S.tool='erase'; setActive();});
  $('#wand') .addEventListener('click',()=>{S.tool='wand';  setActive();});
  function setActive(){ ['paint','erase','wand'].forEach(id=>$('#'+id).classList.toggle('chip--active',S.tool===id)); }
  $('#brush-size').addEventListener('input',e=>S.brushSize=+e.target.value);

  const UNDO=[]; const REDO=[];
  function pushUndo(){ try{ UNDO.push(mctx.getImageData(0,0,1024,1024)); if(UNDO.length>40) UNDO.shift(); REDO.length=0; }catch{} }
  $('#btn-undo').addEventListener('click',()=>{ if(!UNDO.length) return; REDO.push(mctx.getImageData(0,0,1024,1024)); mctx.putImageData(UNDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-redo').addEventListener('click',()=>{ if(!REDO.length) return; UNDO.push(mctx.getImageData(0,0,1024,1024)); mctx.putImageData(REDO.pop(),0,0); window.EAS_preview.render(); });
  $('#btn-clear-mask').addEventListener('click',()=>{ pushUndo(); mctx.clearRect(0,0,1024,1024); window.EAS_preview.render(); });
  $('#btn-fill-mask').addEventListener('click',()=>{ pushUndo(); mctx.globalCompositeOperation='source-over'; mctx.fillStyle='#000'; mctx.fillRect(0,0,1024,1024); window.EAS_preview.render(); });

  $('#toggle-mask').addEventListener('change',e=>document.getElementById('overlay').style.display=e.target.checked?'block':'none');
  $('#toggle-edges').addEventListener('change',e=>document.getElementById('edges').style.display=e.target.checked?'block':'none');

  function dot(x,y,r,erase){
    mctx.save();
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.beginPath(); mctx.arc(x,y,r,0,Math.PI*2);
    mctx.fillStyle='#000'; mctx.fill();
    mctx.restore();
  }
  const pos=(ev,el)=>{ const r=el.getBoundingClientRect(); const p=ev.touches?ev.touches[0]:ev; return {x:(p.clientX-r.left)*1024/r.width,y:(p.clientY-r.top)*1024/r.height}; };

  function wand(x,y){
    pushUndo();
    const W=1024,H=1024;
    const src=bctx.getImageData(0,0,W,H).data;
    const out=mctx.getImageData(0,0,W,H); const d=out.data;
    const Q=[[x|0,y|0]], seen=new Uint8Array(W*H);
    const idx=(X,Y)=>((Y|0)*W+(X|0))<<2;
    const i0=idx(x|0,y|0), r0=src[i0], g0=src[i0+1], b0=src[i0+2];
    const tol=40;
    while(Q.length){
      const [X,Y]=Q.pop();
      if(X<0||Y<0||X>=W||Y>=H) continue;
      const p=(Y*W+X); if(seen[p]) continue; seen[p]=1;
      const q=p<<2; const r=src[q], g=src[q+1], b=src[q+2];
      if(Math.abs(r-r0)+Math.abs(g-g0)+Math.abs(b-b0)>tol) continue;
      d[q]=0; d[q+1]=0; d[q+2]=0; d[q+3]=255;
      Q.push([X+1,Y],[X-1,Y],[X,Y+1],[X,Y-1]);
    }
    mctx.putImageData(out,0,0);
  }

  let painting=false,last=null;
  function down(ev){
    if(S.tool==='wand'){ const p=pos(ev,mask); wand(p.x,p.y); window.EAS_preview.render(); ev.preventDefault(); return; }
    painting=true; last=pos(ev,mask); pushUndo();
    dot(last.x,last.y,S.brushSize,S.tool==='erase'); window.EAS_preview.render(); ev.preventDefault();
  }
  function move(ev){
    if(!painting) return;
    const p=pos(ev,mask); const dx=p.x-last.x, dy=p.y-last.y; const dist=Math.hypot(dx,dy);
    const steps=Math.max(1,(dist/(S.brushSize*0.5))|0);
    for(let i=1;i<=steps;i++) dot(last.x+dx*i/steps,last.y+dy*i/steps,S.brushSize,S.tool==='erase');
    last=p; window.EAS_preview.render(); ev.preventDefault();
  }
  function up(){ painting=false; }

  mask.addEventListener('mousedown',down); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  mask.addEventListener('touchstart',down,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',up);

  // Text + direction
  const T=(S.text={content:'',curve:0,size:64,angle:0});
  $('#text-string').addEventListener('input',e=>{T.content=e.target.value;window.EAS_preview.render();});
  $('#text-curve').addEventListener('input',e=>{T.curve=+e.target.value;window.EAS_preview.render();});
  $('#text-size').addEventListener('input',e=>{T.size=+e.target.value;window.EAS_preview.render();});
  $('#text-angle').addEventListener('input',e=>{T.angle=+e.target.value;window.EAS_preview.render();});
  $('#apply-text').addEventListener('click',()=>window.EAS_preview.render());

  const dirA=$('#dir-angle'), dirV=$('#dir-angle-value'), dirT=$('#toggle-dir');
  S.dirAngle=+dirA.value; S.showDir=dirT.checked;
  dirA.addEventListener('input',e=>{S.dirAngle=+e.target.value; dirV.textContent=S.dirAngle+'°'; window.EAS_preview.render();});
  dirT.addEventListener('change',()=>{S.showDir=dirT.checked; window.EAS_preview.render();});

  // Zoom transform
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  $('#zoom-in').addEventListener('click',()=>{S.zoom=clamp((S.zoom||1)+0.1,0.4,3); window.EAS_processing.setShellTransform();});
  $('#zoom-out').addEventListener('click',()=>{S.zoom=clamp((S.zoom||1)-0.1,0.4,3); window.EAS_processing.setShellTransform();});
  $('#zoom-reset').addEventListener('click',()=>{S.zoom=1;S.panX=0;S.panY=0;window.EAS_processing.setShellTransform();});

  // Generate + exports
  $('#btn-make').addEventListener('click',()=>window.EAS_processing.generate());
  $('#dl-png') .addEventListener('click',()=>window.EAS_processing.exportPNG());
  $('#dl-svg') .addEventListener('click',()=>window.EAS_processing.exportSVG());
  $('#dl-json').addEventListener('click',()=>window.EAS_processing.exportJSON());
  $('#dl-dst') .addEventListener('click',()=>window.EAS_processing.exportDST());
})();