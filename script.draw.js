(function(){
  const S = window.EAS.state;
  const base = document.getElementById("canvas");
  const mask = document.getElementById("mask");
  const overlay = document.getElementById("overlay");
  const bctx = base.getContext("2d");
  const mctx = mask.getContext("2d", {willReadFrequently:true});
  const octx = overlay.getContext("2d");

  // tool buttons
  document.getElementById("tool-brush").onclick=()=>EAS.setTool("brush");
  document.getElementById("tool-erase").onclick=()=>EAS.setTool("erase");
  document.getElementById("tool-wand").onclick=()=>EAS.setTool("wand");
  document.getElementById("brush-size").oninput=(e)=>S.brushSize=+e.target.value;
  document.getElementById("btn-clear-mask").onclick=()=>{ mctx.clearRect(0,0,mask.width,mask.height); S.hasMask=false; window.EAS_processing.renderPreview(); };
  document.getElementById("btn-fill-mask").onclick=()=>{ mctx.fillStyle="rgba(0,0,0,1)"; mctx.fillRect(0,0,mask.width,mask.height); S.hasMask=true; window.EAS_processing.renderPreview(); };

  // drawing interactions
  let painting=false;
  function pos(ev){
    const r=mask.getBoundingClientRect();
    const x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
    const y=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top;
    const sx = x * (mask.width/r.width);
    const sy = y * (mask.height/r.height);
    return {x:sx,y:sy};
  }
  function drawPoint(x,y,erase=false){
    mctx.save();
    mctx.globalCompositeOperation = erase?"destination-out":"source-over";
    mctx.fillStyle="rgba(0,0,0,1)";
    mctx.beginPath();
    mctx.arc(x,y,S.brushSize,0,Math.PI*2);
    mctx.fill();
    mctx.restore();
    S.hasMask=true;
  }

  function wandFill(x,y){
    const id = mctx.getImageData(0,0,mask.width,mask.height);
    const data=id.data, W=mask.width, H=mask.height;
    const gx = Math.max(0, Math.min(W-1, Math.round(x)));
    const gy = Math.max(0, Math.min(H-1, Math.round(y)));
    const stack=[gx,gy], seen=new Uint8Array(W*H);
    const idx=(X,Y)=> (Y*W+X)<<2;
    const src=bctx.getImageData(0,0,mask.width,mask.height).data;
    const sidx=idx(gx,gy);
    const sr=src[sidx], sg=src[sidx+1], sb=src[sidx+2];
    const tol=28;

    while(stack.length){
      const Y=stack.pop(), X=stack.pop();
      if(X<0||Y<0||X>=W||Y>=H) continue;
      const p=(Y*W+X);
      if(seen[p]) continue; seen[p]=1;
      const q=p<<2;
      const r=src[q], g=src[q+1], b=src[q+2];
      if(Math.abs(r-sr)+Math.abs(g-sg)+Math.abs(b-sb) > tol) continue;
      data[q]=0; data[q+1]=0; data[q+2]=0; data[q+3]=255;
      stack.push(X+1,Y, X-1,Y, X,Y+1, X,Y-1);
    }
    mctx.putImageData(id,0,0);
    S.hasMask=true;
  }

  function onDown(ev){
    if(!S.hasImage) return;
    painting=true;
    const {x,y}=pos(ev);
    if(S.tool==="wand"){ wandFill(x|0,y|0); window.EAS_processing.renderPreview(); return; }
    drawPoint(x,y, S.tool==="erase");
    window.EAS_processing.renderPreview();
  }
  function onMove(ev){
    if(!painting || S.tool==="wand") return;
    const {x,y}=pos(ev);
    drawPoint(x,y, S.tool==="erase");
    window.EAS_processing.renderPreview();
  }
  function onUp(){ painting=false; }

  overlay.addEventListener("mousedown", onDown);
  overlay.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  overlay.addEventListener("touchstart", onDown, {passive:false});
  overlay.addEventListener("touchmove", onMove, {passive:false});
  window.addEventListener("touchend", onUp, {passive:false});

  // text layer
  const T = S.text;
  const textInput = document.getElementById("text-input");
  document.getElementById("btn-add-text").onclick=()=>{
    if(!textInput.value.trim()) return;
    S.text.content = textInput.value;
    window.EAS_processing.renderPreview();
  };
  document.getElementById("text-curve").oninput=(e)=>{ T.curve=+e.target.value; window.EAS_processing.renderPreview(); };
  document.getElementById("text-size").oninput=(e)=>{ T.size=+e.target.value; window.EAS_processing.renderPreview(); };

  // drag text on preview panel for placement
  const prev = document.getElementById("preview");
  prev.addEventListener("mousedown",(e)=>{
    const r=prev.getBoundingClientRect();
    const x=e.clientX-r.left, y=e.clientY-r.top;
    T.dragging=true; T.dragDx=x-T.x; T.dragDy=y-T.y;
  });
  window.addEventListener("mousemove",(e)=>{
    if(!T.dragging) return;
    const r=prev.getBoundingClientRect();
    T.x=e.clientX-r.left-T.dragDx; T.y=e.clientY-r.top-T.dragDy;
    window.EAS_processing.renderPreview();
  });
  window.addEventListener("mouseup",()=>T.dragging=false);

  // export pipeline
  document.getElementById("btn-make-stitches").onclick=()=>{
    window.EAS_processing.generateStitches();
  };
  document.getElementById("btn-dl-png").onclick=()=>window.EAS_processing.exportPNG();
  document.getElementById("btn-dl-svg").onclick=()=>window.EAS_processing.exportSVG();
  document.getElementById("btn-dl-json").onclick=()=>window.EAS_processing.exportStitchesJSON();
})();