// Minimal changes: restore behavior and only hide/show tool groups by mode.
(function () {
  const S = window.EAS?.state || (window.EAS = { state: {} }).state;

  // ---- Mode chips -> toggle groups only ----
  const byId = id => document.getElementById(id);
  const chipMask = byId("mode-mask");
  const chipText = byId("mode-text");
  const chipDir  = byId("mode-dir");
  const gMask = byId("group-mask");
  const gText = byId("group-text");
  const gDir  = byId("group-dir");

  function setMode(mode){
    S.brushMode = mode;
    gMask.classList.toggle("hidden", mode !== "mask");
    gText.classList.toggle("hidden", mode !== "text");
    gDir .classList.toggle("hidden", mode !== "dir");
    [chipMask,chipText,chipDir].forEach(c=>c.classList.remove("chip--active"));
    ({mask:chipMask,text:chipText,dir:chipDir}[mode]).classList.add("chip--active");
  }
  chipMask?.addEventListener("click", () => setMode("mask"));
  chipText?.addEventListener("click", () => setMode("text"));
  chipDir ?.addEventListener("click", () => setMode("dir"));
  setMode("mask"); // default

  // ---- Tool buttons (mask only) ----
  const toolBrush = byId("tool-brush");
  const toolErase = byId("tool-erase");
  const toolWand  = byId("tool-wand");
  function pickTool(t){
    S.tool = t;
    [toolBrush,toolErase,toolWand].forEach(b=>b?.classList.remove("active"));
    ({brush:toolBrush,erase:toolErase,wand:toolWand}[t])?.classList.add("active");
  }
  toolBrush?.addEventListener("click", ()=>pickTool("brush"));
  toolErase?.addEventListener("click", ()=>pickTool("erase"));
  toolWand ?.addEventListener("click", ()=>pickTool("wand"));
  pickTool("brush");

  // ---- Basic hookups to existing pipeline (no layout changes) ----
  byId("brush-size")?.addEventListener("input", e=>S.brushSize=+e.target.value);
  byId("btn-undo")?.addEventListener("click", ()=>window.EAS_processing?.undo());
  byId("btn-redo")?.addEventListener("click", ()=>window.EAS_processing?.redo());
  byId("btn-clear-mask")?.addEventListener("click", ()=>window.EAS_processing?.clearMask());
  byId("btn-fill-mask") ?.addEventListener("click", ()=>window.EAS_processing?.fillMask());

  byId("toggle-mask")?.addEventListener("change", e=>window.EAS_processing?.toggleMask(e.target.checked));
  byId("toggle-edge")?.addEventListener("change", e=>window.EAS_processing?.toggleEdges(e.target.checked));

  byId("text-input")?.addEventListener("keydown", e=>{
    if(e.key==="Enter"){ byId("btn-add-text")?.click(); }
  });
  byId("btn-add-text")?.addEventListener("click", ()=>{
    const v = byId("text-input").value.trim(); if(!v) return;
    (S.text||(S.text={})).content = v;
    window.EAS_processing?.renderPreview();
  });
  byId("text-curve")?.addEventListener("input", e=>{ (S.text||(S.text={})).curve=+e.target.value; window.EAS_processing?.renderPreview(); });
  byId("text-size") ?.addEventListener("input", e=>{ (S.text||(S.text={})).size =+e.target.value; window.EAS_processing?.renderPreview(); });

  byId("dir-angle")?.addEventListener("input", e=>{
    S.dirAngle = +e.target.value;
    const v = byId("dir-angle-value"); if(v) v.textContent = S.dirAngle + "°";
    window.EAS_processing?.renderPreview();
  });
  byId("dir-pattern")?.addEventListener("change", e=>{ S.dirPattern = e.target.value; window.EAS_processing?.renderPreview(); });
  byId("toggle-dir-overlay")?.addEventListener("change", e=>window.EAS_processing?.toggleDirOverlay(e.target.checked));

  // Zoom controls
  const zr = byId("zoom-reset"), zi = byId("zoom-in"), zo = byId("zoom-out");
  function setZoom(z){ S.zoom = Math.min(3, Math.max(0.4, z)); window.EAS_processing?.setShellTransform(); }
  zr?.addEventListener("click", ()=>{ S.panX=0; S.panY=0; setZoom(1); });
  zi?.addEventListener("click", ()=>setZoom((S.zoom||1)+0.1));
  zo?.addEventListener("click", ()=>setZoom((S.zoom||1)-0.1));

  // Export bar
  byId("btn-make-stitches")?.addEventListener("click", ()=>window.EAS_processing?.generateStitches());
  byId("btn-dl-png") ?.addEventListener("click", ()=>window.EAS_processing?.exportPNG());
  byId("btn-dl-svg") ?.addEventListener("click", ()=>window.EAS_processing?.exportSVG());
  byId("btn-dl-json")?.addEventListener("click", ()=>window.EAS_processing?.exportStitchesJSON());
  byId("toggle-stitch-preview")?.addEventListener("change", ()=>window.EAS_processing?.renderPreview(true));
})();