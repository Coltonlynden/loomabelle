/* script.draw.js — mask painting + wand flood fill + undo/redo
   Assumes editor.html contains two stacked canvases:
   #canvas (base image) and #mask (mask layer), both 1024×1024.
*/

(function () {
  const $  = (s, r=document)=>r.querySelector(s);
  const add= (el,c)=>el&&el.classList.add(c);
  const rm = (el,c)=>el&&el.classList.remove(c);

  // ----- state -----
  const S = (window.EAS ||= {}).state ||= {
    tool: 'brush',        // brush | erase | wand
    brushSize: 20,
    wandTol: 32,
    zoom: 1, panX: 0, panY: 0
  };

  // ----- canvases -----
  const base = $('#canvas');
  const mask = $('#mask');
  const bctx = base.getContext('2d', { willReadFrequently:true });
  const mctx = mask.getContext('2d', { willReadFrequently:true });

  // make sure they are sized and scaled for DPR
  function setupCanvas(c, w=1024, h=1024){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width  = w * dpr; c.height = h * dpr;
    c.style.width  = w + 'px';
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return ctx;
  }
  setupCanvas(base); setupCanvas(mask);

  // simple cursor overlay using shadow
  function drawDot(x,y,r,erase){
    mctx.save();
    mctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mctx.beginPath();
    mctx.arc(x,y,r,0,Math.PI*2);
    mctx.fillStyle = 'rgba(0,0,0,1)';
    mctx.fill();
    mctx.restore();
  }

  // ----- UNDO / REDO -----
  const UNDO = { stack: [], redo: [], limit: 20 };
  function pushUndo(){
    try{
      const snap = mctx.getImageData(0,0,mask.width,mask.height);
      UNDO.stack.push(snap);
      if(UNDO.stack.length>UNDO.limit) UNDO.stack.shift();
      UNDO.redo.length = 0;
    }catch{}
  }
  function restore(img){
    if(!img) return;
    mctx.putImageData(img,0,0);
  }
  function undo(){ if(UNDO.stack.length){ const cur=mctx.getImageData(0,0,mask.width,mask.height); UNDO.redo.push(cur); restore(UNDO.stack.pop()); } }
  function redo(){ if(UNDO.redo.length){ const cur=mctx.getImageData(0,0,mask.width,mask.height); UNDO.stack.push(cur); restore(UNDO.redo.pop()); } }

  // public buttons (if present)
  $('#btn-undo')?.addEventListener('click', undo);
  $('#btn-redo')?.addEventListener('click', redo);
  $('#btn-clear-mask')?.addEventListener('click', ()=>{ pushUndo(); mctx.clearRect(0,0,mask.width,mask.height); });
  $('#btn-fill-mask') ?.addEventListener('click', ()=>{ pushUndo(); mctx.fillStyle='#000'; mctx.fillRect(0,0,1024,1024); });

  // tool selection + size
  function pickTool(t){
    S.tool=t;
    ['paint','erase','wand'].forEach(id=>$('#'+id)?.classList.remove('active'));
    ({brush:'#paint',erase:'#erase',wand:'#wand'}[t] && $( {brush:'#paint',erase:'#erase',wand:'#wand'}[t] )?.classList.add('active'));
  }
  $('#paint')?.addEventListener('click', ()=>pickTool('brush'));
  $('#erase')?.addEventListener('click', ()=>pickTool('erase'));
  $('#wand') ?.addEventListener('click', ()=>pickTool('wand'));
  $('#brush-size')?.addEventListener('input', e=>S.brushSize=+e.target.value);
  pickTool('brush');

  // ----- pointer utils -----
  function localPos(ev, el){
    const r = el.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return {
      x: (p.clientX - r.left) * (el.width  / r.width ) / (window.devicePixelRatio||1),
      y: (p.clientY - r.top ) * (el.height / r.height) / (window.devicePixelRatio||1)
    };
  }

  // ----- WAND flood fill on BASE colors -> write to MASK alpha -----
  function wandFill(x,y){
    pushUndo();
    const W = base.width, H = base.height;
    const b = bctx.getImageData(0,0,W,H).data;
    const m = mctx.getImageData(0,0,W,H);
    const d = m.data;
    const idx = (X,Y)=>((Y|0)*W + (X|0))<<2;

    const gx = Math.max(0,Math.min(W-1, x|0));
    const gy = Math.max(0,Math.min(H-1, y|0));
    const i0 = idx(gx,gy);
    const r0=b[i0], g0=b[i0+1], bl0=b[i0+2];
    const tol = S.wandTol;

    const Qx=new Int32Array(W*H);
    const Qy=new Int32Array(W*H);
    const seen=new Uint8Array(W*H);
    let qs=0, qe=0;
    Qx[qe]=gx; Qy[qe]=gy; qe++;

    while(qs<qe){
      const X=Qx[qs], Y=Qy[qs]; qs++;
      if(X<0||Y<0||X>=W||Y>=H) continue;
      const p = (Y*W+X);
      if(seen[p]) continue;
      seen[p]=1;
      const q=p<<2; const r=b[q], g=b[q+1], bl=b[q+2];
      if(Math.abs(r-r0)+Math.abs(g-g0)+Math.abs(bl-bl0) > tol) continue;

      d[q]=0; d[q+1]=0; d[q+2]=0; d[q+3]=255; // opaque black in mask

      Qx[qe]=X+1; Qy[qe]=Y;   qe++;
      Qx[qe]=X-1; Qy[qe]=Y;   qe++;
      Qx[qe]=X;   Qy[qe]=Y+1; qe++;
      Qx[qe]=X;   Qy[qe]=Y-1; qe++;
    }

    mctx.putImageData(m,0,0);
  }

  // ----- painting handlers -----
  let painting=false, last=null;
  function down(ev){
    if(S.tool==='wand'){ const p=localPos(ev,mask); wandFill(p.x,p.y); return; }
    painting=true; last=localPos(ev,mask); pushUndo(); drawDot(last.x,last.y,S.brushSize,S.tool==='erase');
    ev.preventDefault();
  }
  function move(ev){
    if(!painting) return;
    const p=localPos(ev,mask);
    const dx=p.x-last.x, dy=p.y-last.y;
    const dist=Math.hypot(dx,dy);
    const steps=Math.max(1,(dist/(S.brushSize*0.5))|0);
    for(let i=1;i<=steps;i++){
      const x=last.x + dx*i/steps;
      const y=last.y + dy*i/steps;
      drawDot(x,y,S.brushSize,S.tool==='erase');
    }
    last=p; ev.preventDefault();
  }
  function up(){ painting=false; }

  mask.addEventListener('mousedown',down);
  window.addEventListener('mousemove',move);
  window.addEventListener('mouseup',up);

  mask.addEventListener('touchstart',down,{passive:false});
  window.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',up);

  // expose for other scripts if needed
  window.EAS_draw = { undo, redo, wandFill };
})();