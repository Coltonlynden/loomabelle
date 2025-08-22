// Global app state and helpers
window.EAS = {
  state: {
    img: null,                 // HTMLImageElement
    imgCanvas: null,           // backing canvas for image
    maskCanvas: null,          // binary mask in RGBA
    overlayCanvas: null,       // guides/text
    previewCanvas: null,       // composited preview
    scale: 1,                  // image -> canvas scale
    text: {                    // single text layer v1
      content: "",
      size: 56,
      curve: 0,
      x: 512,
      y: 940,
      dragging: false,
      dragDx: 0,
      dragDy: 0
    },
    tool: "brush",             // brush | erase | wand
    brushSize: 24,
    hasImage: false,
    hasMask: false,
    stitches: null             // generated stitch data
  },
  els: {},
  setTool(name){
    EAS.state.tool = name;
    for (const b of document.querySelectorAll(".tool")) b.classList.remove("active");
    if (name === "brush") document.getElementById("tool-brush").classList.add("active");
    if (name === "erase") document.getElementById("tool-erase").classList.add("active");
    if (name === "wand")  document.getElementById("tool-wand").classList.add("active");
  }
};

// tab switching
(function(){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabs.forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById(btn.dataset.target).classList.remove("hidden");
    });
  });
})();