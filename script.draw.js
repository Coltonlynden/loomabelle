(function(){
  const S=EAS.state;

  // tabs
  const chipMask = document.getElementById("mode-mask");
  const chipText = document.getElementById("mode-text");
  const chipDir  = document.getElementById("mode-dir");
  const panelMask = document.getElementById("panel-mask");
  const panelText = document.getElementById("panel-text");
  const panelDir  = document.getElementById("panel-dir");

  function showPanel(mode){
    panelMask.classList.toggle("hidden", mode!=="mask");
    panelText.classList.toggle("hidden", mode!=="text");
    panelDir .classList.toggle("hidden", mode!=="dir");
    [chipMask,chipText,chipDir].forEach(el=>el.classList.remove("chip--active"));
    ({mask:chipMask,text:chipText,dir:chipDir}[mode]).classList.add("chip--active");
    EAS.setBrushMode(mode);
  }
  chipMask.onclick=()=>showPanel("mask");
  chipText.onclick=()=>showPanel("text");
  chipDir .onclick=()=>showPanel("dir");
  showPanel("mask");

  // mask tools
  const tools = {brush:"tool-brush", erase:"tool-erase", wand:"tool-wand"};
  function pickTool(t){
    S.tool=t;
    Object.values(tools).forEach(id=>document.getElementById(id).classList.remove('active'));
    document.getElementById(tools[t]).classList.add('active');
  }
  pickTool("brush");
  document.getElementById("tool-brush").onclick=()=>pickTool("brush");
  document.getElementById("tool-erase").onclick=()=>pickTool("erase");
  document.getElementById("tool-wand").onclick =()=>pickTool("wand");
  document.getElementById("brush-size").oninput=e=>S.brushSize=+e.target.value;

  document.getElementById("btn-undo").onclick=()=>EAS_processing.undo();
  document.getElementById("btn-redo").onclick=()=>EAS_processing.redo();
  document.getElementById("btn-clear-mask").onclick=()=>{EAS_processing.clearMask();};
  document.getElementById("btn-fill-mask").onclick =()=>{EAS_processing.fillMask();};

  // toggles
  document.getElementById("toggle-mask").onchange=e=>EAS_processing.toggleMask(e.target.checked);
  document.getElementById("toggle-edge").onchange=e=>EAS_processing.toggleEdges(e.target.checked);
  document.getElementById("toggle-dir-overlay").onchange=e=>EAS_processing.toggleDirOverlay(e.target.checked);

  // text
  const T=S.text;
  document.getElementById("btn-add-text").onclick=()=>{
    const v=document.getElementById("text-input").value.trim();
    if(!v) return; T.content=v; EAS_processing.renderPreview();
  };
  document.getElementById("text-curve").oninput=e=>{T.curve=+e.target.value;EAS_processing.renderPreview();}
  document.getElementById("text-size").oninput =e=>{T.size=+e.target.value;EAS_processing.renderPreview();}

  // direction
  document.getElementById("dir-angle").oninput=e=>{
    S.dirAngle=+e.target.value; document.getElementById("dir-angle-value").textContent=S.dirAngle+"°";
    EAS_processing.renderPreview();
  };
  document.getElementById("dir-pattern").onchange=e=>{S.dirPattern=e.target.value;EAS_processing.renderPreview();};

  // view
  const setZoom=z=>{S.zoom=Math.min(3,Math.max(0.4,z));EAS_processing.setShellTransform();}
  document.getElementById("zoom-in").onclick =()=>setZoom(S.zoom+0.1);
  document.getElementById("zoom-out").onclick=()=>setZoom(S.zoom-0.1);
  document.getElementById("zoom-reset").onclick=()=>{S.panX=0;S.panY=0;setZoom(1);};

  // generate / export
  document.getElementById("btn-make-stitches").onclick=()=>EAS_processing.generateStitches();
  document.getElementById("btn-dl-png").onclick =()=>EAS_processing.exportPNG();
  document.getElementById("btn-dl-svg").onclick =()=>EAS_processing.exportSVG();
  document.getElementById("btn-dl-json").onclick=()=>EAS_processing.exportStitchesJSON();
  document.getElementById("toggle-stitch-preview").onchange=()=>EAS_processing.renderPreview(true);

  // painting and wand
  const base=document.getElementById("canvas");
  const bctx=base.getContext("2d",{willReadFrequently:true});
  const mask=document.getElementById("mask");
  const mctx=mask.getContext("2d",{willReadFrequently:true});
  const overlay=document.getElementById("overlay");
  const octx=overlay.getContext("2d");

  function pos(ev){const r=mask.getBoundingClientRect();const c=ev.touches?ev.touches[0]:ev;return {x:(c.clientX-r.left)*mask.width/r.width,y:(c.clientY-r.top)*mask.height/r.height};}
  function cursor(x,y){octx.clearRect(0,0,1024,1024);octx.strokeStyle="rgba(0,0,0,.6)";octx.beginPath();octx.arc(x,y,S.brushSize,0,Math.PI*2);octx.stroke();}

  function dot(x,y,erase){mctx.globalCompositeOperation=erase?"destination-out":"source-over";mctx.beginPath();mctx.arc(x,y,S.brushSize,0,Math.PI*2);mctx.fill();S.hasMask=true;}

  function wandFill(x,y){
    const W=1024,H=1024; const id=mctx.getImageData(0,0,W,H), d=id.data;
    const src=bctx.getImageData(0,0,W,H).data; const idx=(X,Y)=>(Y*W+X)<<2;
    const gx=Math.max(0,Math.min(W-1,x|0)), gy=Math.max(0,Math.min(H-1,y|0));
    const s=idx(gx,gy); const r0=src[s],g0=src[s+1],b0=src[s+2]; const tol=32;
    const seen=new Uint8Array(W*H); const st=[gx,gy];
    while(st.length){const Y=st.pop(),X=st.pop(); if(X<0||Y<0||X>=W||Y>=H) continue; const p=Y*W+X; if(seen[p]) continue; seen[p]=1; const q=p<<2; const r=src[q],g=src[q+1],b=src[q+2]; if(Math.abs(r-r0)+Math.abs(g-g0)+Math.abs(b-b0)>tol) continue; d[q]=0;d[q+1]=0;d[q+2]=0;d[q+3]=255; st.push(X+1,Y,X-1,Y,X,Y+1,X,Y-1);}
    mctx.putImageData(id,0,0); S.hasMask=true;
  }

  let painting=false,last=null,raf=false;
  function frame(){raf=false;if(!last) return; const {x,y}=last; if(S.brushMode==="mask"&&S.tool!=="wand"){dot(x,y,S.tool==="erase");EAS_processing.renderPreview();}}
  function down(e){if(!S.hasImage)return; const p=pos(e); last=p; cursor(p.x,p.y);
    if(S.brushMode==="mask"&&S.tool==="wand"){wandFill(p.x,p.y);EAS_processing.computeEdges();EAS_processing.renderPreview();EAS_processing.pushUndo();return;}
    painting=true; if(!raf){raf=true;requestAnimationFrame(frame);}
  }
  function move(e){if(!S.hasImage)return; const p=pos(e); last=p; cursor(p.x,p.y); if(!painting)return; if(!raf){raf=true;requestAnimationFrame(frame);}}
  function up(){if(painting&&S.brushMode==="mask"){EAS_processing.computeEdges();EAS_processing.pushUndo();} painting=false; last=null;}
  overlay.addEventListener("mousedown",down);overlay.addEventListener("mousemove",move);window.addEventListener("mouseup",up);
  overlay.addEventListener("touchstart",down,{passive:false});overlay.addEventListener("touchmove",move,{passive:false});window.addEventListener("touchend",up);
})();