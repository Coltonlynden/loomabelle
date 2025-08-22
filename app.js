window.EAS = {
  state:{
    img:null, hasImage:false, hasMask:false,
    brushSize:26, tool:"brush", brushMode:"mask",        // mask | text | dir
    text:{content:"", size:56, curve:0, x:512, y:940, dragging:false, dx:0, dy:0},
    stitches:null, scale:1, zoom:1, panX:0, panY:0,
    undo:[], redo:[],
    dirAngle:45,                      // current brush angle in degrees (0..180)
    dirMap:new Uint8Array(1024*1024)  // per-pixel quantized angle bin (0..180), 255 = unset
  },
  setTool(name){
    EAS.state.tool=name;
    document.querySelectorAll(".btn[data-tool]").forEach(()=>{});
  },
  setBrushMode(mode){
    const panels={mask:"panel-mask", text:"panel-text", dir:"panel-dir"};
    EAS.state.brushMode=mode;
    for(const k of Object.keys(panels)){
      document.getElementById(panels[k]).classList.toggle("hidden", k!==mode);
    }
    document.querySelectorAll(".chip").forEach(c=>c.classList.remove("chip--active"));
    ({mask:"mode-mask", text:"mode-text", dir:"mode-dir"}[mode] && document.getElementById({mask:"mode-mask", text:"mode-text", dir:"mode-dir"}[mode]).classList.add("chip--active"));
  }
};