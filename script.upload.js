(function(){
  const file = document.getElementById("file");
  const btn  = document.getElementById("btn-upload");

  btn.addEventListener("click", ()=>file.click());

  file.addEventListener("change", async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = async ()=>{
      window.EAS.state.img = img;
      await window.EAS_processing.placeImage(img);
      URL.revokeObjectURL(url);
      // show preview panel but keep hidden until user clicks "Preview"
      document.getElementById("tab-draw").click();
    };
    img.src = url;
  });

  document.getElementById("btn-auto").addEventListener("click", ()=>{
    const d = +document.getElementById("auto-detail").value;
    window.EAS_processing.autoSubject(d);
  });
})();