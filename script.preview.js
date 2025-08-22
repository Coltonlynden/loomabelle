// Keep preview canvas hidden until an image is loaded.
(function(){
  const prevPanel = document.getElementById("panel-preview");
  const note = prevPanel.querySelector(".note");

  // If user clicks Preview without an image, do nothing noticeable.
  const tabPreview = document.getElementById("tab-preview");
  tabPreview.addEventListener("click", ()=>{
    if(!EAS.state.hasImage){
      // keep panel but buttons disabled
      document.getElementById("btn-dl-png").disabled = true;
      document.getElementById("btn-dl-svg").disabled = true;
      document.getElementById("btn-make-stitches").disabled = true;
      document.getElementById("btn-dl-json").disabled = true;
    }
  });

  // When image exists we render automatically from processing.js
})();