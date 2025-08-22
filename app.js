// Global namespace and minimal state
window.EAS = {
  state:{
    img:null, hasImage:false, hasMask:false,
    brushSize:24, tool:"brush",
    text:{content:"", size:56, curve:0, x:512, y:940, dragging:false, dx:0, dy:0},
    stitches:null, scale:1
  },
  setTool(name){
    EAS.state.tool=name;
    document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
    const id = {brush:"tool-brush", erase:"tool-erase", wand:"tool-wand"}[name];
    if(id) document.getElementById(id).classList.add("active");
  }
};