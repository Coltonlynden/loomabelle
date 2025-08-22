(function(){
  const S=EAS.state;
  const base=document.getElementById("canvas");
  const mask=document.getElementById("mask");
  const overlay=document.getElementById("overlay");
  const edges=document.getElementById("edges");
  if(!base) return;

  const bctx=base.getContext("2d");
  const mctx=mask.getContext("2d",{willReadFrequently:true});
  const octx=overlay.getContext("2d");

  // tool switches
  document.getElementById("tool-brush").onclick=()=>EAS.setTool("brush");
  document.getElementById("tool-erase").onclick=()=>EAS.setTool("erase");
  document.getElementById("tool-wand").onclick =()=>EAS.setTool("wand");
  document.getElementById("brush-size").oninput=e=>S.brushSize=+e.target.value;

  // undo/redo
  document.getElementById("btn-undo").onclick=()=>EAS_processing.undo();
  document.getElementById("btn-redo").onclick=()=>EAS_processing.redo();

  // mask controls
  document.getElementById("btn-clear-mask").onclick=()=>{
    mctx.clearRect(0,0,mask.width,mask.height); S.hasMask=false;
    EAS_processing.computeEdges(); EAS_processing.renderPreview(); EAS_processing.pushUndo();
  };
  document.getElementById("btn-fill-mask").onclick =()=>{
    mctx.fillStyle="rgba(0,0,0,1)"; mctx.fillRect(0,0,mask.width,mask.height); S.hasMask=true;
    EAS_processing.computeEdges(); EAS_processing.renderPreview(); EAS_processing.pushUndo();
  };
  document.getElementById("toggle-mask").onchange=e=>{
    mask.style.opacity = e.target.checked? "0.5":"0";
  };
  document.getElementById("toggle-edge").onchange=e=>{
    edges.style.opacity = e.target.checked? "1":"0";
  };

  // zoom/pan
  const zoomIn = document.getElementById("zoom-in");
  const zoomOut= document.getElementById("zoom-out");
  const zoomReset=document.getElementById("zoom-reset");
  zoomIn.onclick = ()=>{ S.zoom=Math.min(3, S.zoom+0.1); EAS_processing.setShellTransform(); };
  zoomOut.onclick= ()=>{ S.zoom=Math.max(0.4, S.zoom-0.1); EAS_processing.setShellTransform(); };
  zoomReset.onclick=()=>{ S.zoom=1; S.panX=0; S.panY=0; EAS_processing.setShellTransform(); };

  let panning=false, panStart=[0,0], panBase=[0,0];
  document.getElementById("shell").addEventListener("mousedown",(e)=>{
    if(e.altKey){ panning=true; panStart=[e.clientX,e.clientY]; panBase=[S.panX,S.panY]; }
  });
  window.addEventListener("mousemove",(e)=>{
    if(!panning) return;
    S.panX = panBase[0] + (e.clientX-panStart[0]);
    S.panY = panBase[1] + (e.clientY-panStart[1]);
    EAS_processing.setShellTransform();
  });
  window.addEventListener("mouseup",()=>panning=false);

  // draw
  let painting=false;
  function pos(ev){
    const r=mask.getBoundingClientRect();
    const cX=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
    const cY=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top;
    return {x:cX*(mask.width/r.width), y:cY*(mask.height/r.height)};
  }
  function drawPoint(x,y,erase){
    mctx.save(); mctx.globalCompositeOperation=erase?"destination-out":"source-over";
    mctx.fillStyle="rgba(0,0,0,1)"; mctx.beginPath(); mctx.arc(x,y,S.brushSize,0,Math.PI*2); mctx.fill(); mctx.restore();
    S.hasMask=true;
  }
  function wandFill(x,y){
    const W=mask.width,H=mask.height;
    const id=mctx.getImageData(0,0,W,H), data=id.data;
    const src=bctx.getImageData(0,0,W,H).data;
    const gx=Math.max(0,Math.min(W-1,Math.round(x))), gy=Math.max(0,Math.min(H-1,Math.round(y)));
    const idx=(X,Y)=>(Y*W+X)<<2; const sidx=idx(gx,gy);
    const sr=src[sidx],sg=src[sidx+1],sb=src[sidx+2]; const tol=28;
    const seen=new Uint8Array(W*H); const stack=[gx,gy];
    while(stack.length){
      const Y=stack.pop(), X=stack.pop(); if(X<0||Y<0||X>=W||Y>=H) continue;
      const p=Y*W+X; if(seen[p]) continue; seen[p]=1;
      const q=p<<2; const r=src[q],g=src[q+1],b=src[q+2];
      if(Math.abs(r-sr)+Math.abs(g-sg)+Math.abs(b-sb)>tol) continue;
      data[q]=0; data[q+1]=0; data[q+2]=0; data[q+3]=255;
      stack.push(X+1,Y,X-1,Y,X,Y+1,X,Y-1);
    }
    mctx.putImageData(id,0,0); S.hasMask=true;
  }

  function showCursor(x,y){
    octx.clearRect(0,0,overlay.width,overlay.height);
    octx.strokeStyle="rgba(0,0,0,.6)"; octx.lineWidth=1; octx.beginPath(); octx.arc(x,y,S.brushSize,0,Math.PI*2); octx.stroke();
  }

  function down(ev){
    if(!S.hasImage) return;
    const {x,y}=pos(ev); showCursor(x,y);
    if(S.tool==="wand"){ wandFill(x|0,y|0); EAS_processing.computeEdges(); EAS_processing.renderPreview(); EAS_processing.pushUndo(); return; }
    painting=true; drawPoint(x,y,S.tool==="erase"); EAS_processing.renderPreview();
  }
  function move(ev){
    const {x,y}=pos(ev); showCursor(x,y);
    if(!painting||S.tool==="wand") return;
    drawPoint(x,y,S.tool==="erase"); EAS_processing.renderPreview();
  }
  function up(){ if(painting){ EAS_processing.computeEdges(); EAS_processing.pushUndo(); } painting=false; }

  overlay.addEventListener("mousedown",down);
  overlay.addEventListener("mousemove",move);
  window.addEventListener("mouseup",up);
  overlay.addEventListener("touchstart",down,{passive:false});
  overlay.addEventListener("touchmove",move,{passive:false});
  window.addEventListener("touchend",up);

  // text
  const T=S.text;
  const textInput=document.getElementById("text-input");
  document.getElementById("btn-add-text").onclick=()=>{ if(textInput.value.trim()){ T.content=textInput.value; EAS_processing.renderPreview(); } };
  document.getElementById("text-curve").oninput=e=>{ T.curve=+e.target.value; EAS_processing.renderPreview(); };
  document.getElementById("text-size").oninput =e=>{ T.size=+e.target.value; EAS_processing.renderPreview(); };

  const prev=document.getElementById("preview");
  prev.addEventListener("mousedown",e=>{
    const r=prev.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
    T.dragging=true; T.dx=x-T.x; T.dy=y-T.y;
  });
  window.addEventListener("mousemove",e=>{
    if(!T.dragging) return; const r=prev.getBoundingClientRect(); T.x=e.clientX-r.left-T.dx; T.y=e.clientY-r.top-T.dy; EAS_processing.renderPreview();
  });
  window.addEventListener("mouseup",()=>T.dragging=false);

  // exports
  document.getElementById("btn-make-stitches").onclick=()=>EAS_processing.generateStitches();
  document.getElementById("btn-dl-png").onclick =()=>EAS_processing.exportPNG();
  document.getElementById("btn-dl-svg").onclick =()=>EAS_processing.exportSVG();
  document.getElementById("btn-dl-json").onclick=()=>EAS_processing.exportStitchesJSON();

  // hotkeys
  window.addEventListener("keydown",(e)=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){ e.shiftKey?EAS_processing.redo():EAS_processing.undo(); }
    if(e.key==="1") EAS.setTool("brush");
    if(e.key==="2") EAS.setTool("erase");
    if(e.key==="3") EAS.setTool("wand");
  });

  // initial transform
  EAS_processing.setShellTransform();
})();