// global state
window.EAS = {
  state:{
    img:null, hasImage:false, hasMask:false,
    brushSize:24, tool:"brush",
    text:{content:"", size:56, curve:0, x:512, y:940, dragging:false, dx:0, dy:0},
    stitches:null, scale:1, zoom:1, panX:0, panY:0,
    undo:[], redo:[]
  },
  setTool(name){
    EAS.state.tool=name;
    document.querySelectorAll(".chip").forEach(b=>b.classList.remove("chip--active"));
    const id = {brush:"tool-brush", erase:"tool-erase", wand:"tool-wand"}[name];
    if(id) document.getElementById(id).classList.add("chip--active");
  }
};