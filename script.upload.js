// load image into #canvas, keep cover-fit without weird crop
(function(){
  const S = (window.EAS ||= {}).state ||= {};
  const fileInput = document.getElementById('file');
  const nameBox   = document.getElementById('filename');
  const base = document.getElementById('canvas');
  const bctx = base.getContext('2d', { willReadFrequently:true });
  const mask = document.getElementById('mask');
  const mctx = mask.getContext('2d', { willReadFrequently:true });
  const edges= document.getElementById('edges').getContext('2d',{willReadFrequently:true});

  const W = 1024, H = 1024;
  [base,mask].forEach(c=>{ c.width=W; c.height=H; });

  function drawCover(img){
    bctx.clearRect(0,0,W,H);
    mctx.clearRect(0,0,W,H);
    edges.clearRect(0,0,W,H);

    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(W/iw, H/ih);
    const dw = Math.round(iw*s), dh = Math.round(ih*s);
    const dx = Math.round((W-dw)/2), dy = Math.round((H-dh)/2);
    bctx.imageSmoothingQuality='high';
    bctx.drawImage(img, dx, dy, dw, dh);

    // simple edge map for guidance
    const id = bctx.getImageData(0,0,W,H);
    const out = edges.createImageData(W,H);
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        const i=(y*W+x)*4, ix1=i+4, ix0=i-4, iy1=i+W*4, iy0=i-W*4;
        const gx = id.data[ix1]-id.data[ix0] + id.data[ix1+1]-id.data[ix0+1] + id.data[ix1+2]-id.data[ix0+2];
        const gy = id.data[iy1]-id.data[iy0] + id.data[iy1+1]-id.data[iy0+1] + id.data[iy1+2]-id.data[iy0+2];
        const g = Math.min(255, Math.abs(gx)+Math.abs(gy));
        out.data[i]=out.data[i+1]=out.data[i+2]=255-g; out.data[i+3]=80;
      }
    }
    edges.putImageData(out,0,0);

    S.hasImage = true;
    window.EAS_preview.render(true);
  }

  fileInput?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    if(nameBox) nameBox.value = f.name;
    const url=URL.createObjectURL(f); const img=new Image();
    img.onload=()=>{ drawCover(img); URL.revokeObjectURL(url); };
    img.onerror=()=>{ URL.revokeObjectURL(url); alert('Image load failed'); };
    img.src=url;
  });

  document.getElementById('detail')?.addEventListener('input',()=>window.EAS_preview.render(true));
  document.getElementById('btn-autohighlight')?.addEventListener('click',()=>{
    // quick auto mask by luminance threshold
    if(!S.hasImage) return;
    const ctx = bctx; const id = ctx.getImageData(0,0,W,H);
    const m = mctx.getImageData(0,0,W,H);
    const d = m.data;
    for(let i=0;i<id.data.length;i+=4){
      const L = 0.299*id.data[i]+0.587*id.data[i+1]+0.114*id.data[i+2];
      const on = L < 170; // keep darker by default
      d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]= on ? 255 : 0;
    }
    mctx.putImageData(m,0,0);
    window.EAS_preview.render(true);
  });
})();