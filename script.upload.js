// image upload + cover-fit draw; no texture overlays
(function(){
  const S = (window.EAS ||= {}).state ||= {};
  const fileInput = document.getElementById('file');
  const nameBox   = document.getElementById('filename');
  const base = document.getElementById('canvas');
  const mask = document.getElementById('mask');
  const edges= document.getElementById('edges');

  const bctx = base.getContext('2d',{willReadFrequently:true});
  const mctx = mask.getContext('2d',{willReadFrequently:true});
  const edctx= edges.getContext('2d',{willReadFrequently:true});

  const W=1024,H=1024;
  [base,mask,edges].forEach(c=>{ c.width=W; c.height=H; });

  function drawCover(img){
    bctx.clearRect(0,0,W,H);
    mctx.clearRect(0,0,W,H);
    edctx.clearRect(0,0,W,H);

    const iw=img.naturalWidth, ih=img.naturalHeight;
    const s=Math.max(W/iw,H/ih);
    const dw=Math.round(iw*s), dh=Math.round(ih*s);
    const dx=Math.round((W-dw)/2), dy=Math.round((H-dh)/2);
    bctx.imageSmoothingQuality='high';
    bctx.drawImage(img,dx,dy,dw,dh);

    S.hasImage=true;
    window.EAS_preview.render(true);
  }

  fileInput?.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f) return;
    nameBox && (nameBox.value=f.name);
    const url=URL.createObjectURL(f); const img=new Image();
    img.onload=()=>{ drawCover(img); URL.revokeObjectURL(url); };
    img.onerror=()=>{ URL.revokeObjectURL(url); alert('Image load failed'); };
    img.src=url;
  });

  document.getElementById('detail')?.addEventListener('input',()=>window.EAS_preview.render(true));
  document.getElementById('btn-autohighlight')?.addEventListener('click',()=>{
    if(!S.hasImage) return;
    const id=bctx.getImageData(0,0,W,H);
    const m =mctx.getImageData(0,0,W,H); const d=m.data, s=id.data;
    for(let i=0;i<s.length;i+=4){
      const L = 0.299*s[i]+0.587*s[i+1]+0.114*s[i+2];
      const on = L < 170;
      d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=on?255:0;
    }
    mctx.putImageData(m,0,0);
    window.EAS_preview.render(true);
  });
})();