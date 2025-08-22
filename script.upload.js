(function(){
  const file=document.getElementById("file");
  const btn=document.getElementById("btn-upload");
  if(!file||!btn) return;

  btn.addEventListener("click", ()=>file.click());
  file.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    const url=URL.createObjectURL(f); const img=new Image();
    img.onload=()=>{
      EAS.state.img=img;
      EAS_processing.placeImage(img).then(()=>{
        EAS_processing.pushUndo();
        EAS_processing.computeEdges();
        EAS_processing.renderPreview();
      });
      URL.revokeObjectURL(url);
    };
    img.src=url;
  });

  const autoBtn=document.getElementById("btn-auto");
  const autoDetail=document.getElementById("auto-detail");
  autoBtn?.addEventListener("click", ()=>EAS_processing.autoSubject(+autoDetail.value||3));
})();