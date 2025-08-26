// Uses globals provided by script.draw.js
(function(){
  const cPrev = document.getElementById('previewCanvas');
  const ctxPrev = cPrev.getContext('2d');
  const showPreview = document.getElementById('showPreview');
  const genBtn = document.getElementById('genBtn');
  const pngBtn = document.getElementById('pngBtn');
  const svgBtn = document.getElementById('svgBtn');
  const jsonBtn = document.getElementById('jsonBtn');
  const dstBtn = document.getElementById('dstBtn');
  const hoopSel = document.getElementById('hoopSelect');

  let previewData=null;

  function sizePreview(){
    const inner = document.querySelector('.hoop__inner');
    const w=inner.clientWidth, h=inner.clientHeight;
    cPrev.width=w*devicePixelRatio; cPrev.height=h*devicePixelRatio;
    cPrev.style.width=w+'px'; cPrev.style.height=h+'px';
    if(previewData) draw(previewData);
  }
  window.addEventListener('resize', ()=>{ sizePreview(); Editor.fit(); });
  sizePreview();

  genBtn.addEventListener('click', ()=>{
    const {base,mask,text,dir}=Editor.getLayers();
    if(!base.width) return;
    // Compose masked image + text
    const off=document.createElement('canvas'); off.width=base.width; off.height=base.height;
    const cx=off.getContext('2d');
    cx.drawImage(base,0,0);
    cx.globalCompositeOperation='destination-in'; cx.drawImage(mask,0,0);
    cx.globalCompositeOperation='source-over'; cx.drawImage(text,0,0);

    // Quantize colors (8) and then stitch
    const q = quantize(off,8);
    const stitches = rasterToStitches(q, dir);
    previewData={bmp:q, stitches};
    draw(previewData);
  });

  function draw(data){
    ctxPrev.setTransform(1,0,0,1,0,0);
    ctxPrev.clearRect(0,0,cPrev.width,cPrev.height);
    if(!showPreview.checked || !data) return;

    const pad=20*devicePixelRatio;
    const iw=data.bmp.width, ih=data.bmp.height;
    const sc=Math.min((cPrev.width-pad*2)/iw, (cPrev.height-pad*2)/ih);
    const ox=(cPrev.width-iw*sc)/2, oy=(cPrev.height-ih*sc)/2;
    ctxPrev.drawImage(data.bmp, ox, oy, iw*sc, ih*sc);

    ctxPrev.lineWidth=1*devicePixelRatio; ctxPrev.strokeStyle='#3b3b3b';
    ctxPrev.beginPath();
    for(const s of data.stitches){
      ctxPrev.moveTo(ox+s.x0*sc,oy+s.y0*sc);
      ctxPrev.lineTo(ox+s.x1*sc,oy+s.y1*sc);
    }
    ctxPrev.stroke();
  }

  // downloads
  pngBtn.onclick=()=>{ const a=document.createElement('a'); a.download='preview.png'; a.href=cPrev.toDataURL('image/png'); a.click(); };
  svgBtn.onclick=()=>{ if(!previewData) return; const W=cPrev.width,H=cPrev.height; let path=''; for(const s of previewData.stitches){ path+=`M${s.x0},${s.y0} L${s.x1},${s.y1} `; } const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${path}" stroke="#333" stroke-width="${devicePixelRatio}" fill="none"/></svg>`; const a=document.createElement('a'); a.download='preview.svg'; a.href='data:image/svg+xml,'+encodeURIComponent(svg); a.click(); };
  jsonBtn.onclick=()=>{ const a=document.createElement('a'); a.download='stitches.json'; a.href='data:application/json,'+encodeURIComponent(JSON.stringify(previewData?.stitches||[])); a.click(); };
  dstBtn.onclick=()=>{ const s=previewData?.stitches||[]; let out='x0,y0,x1,y1\n'; for(const p of s) out+=`${p.x0},${p.y0},${p.x1},${p.y1}\n`; const a=document.createElement('a'); a.download='design.dst'; a.href='data:text/plain,'+encodeURIComponent(out); a.click(); };

  // helpers
  function quantize(cnv,k){
    const ctx=cnv.getContext('2d'); const {width:w,height:h}=cnv; const img=ctx.getImageData(0,0,w,h);
    const pal=kmeans(img.data,k); const out=document.createElement('canvas'); out.width=w; out.height=h; const co=out.getContext('2d'); const arr=co.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const a=img.data[i*4+3]; if(a<4){ continue; }
      const r=img.data[i*4],g=img.data[i*4+1],b=img.data[i*4+2]; const c=nearest(pal,r,g,b);
      arr.data[i*4]=c[0];arr.data[i*4+1]=c[1];arr.data[i*4+2]=c[2];arr.data[i*4+3]=255;
    }
    co.putImageData(arr,0,0);
    return out;
  }
  function kmeans(data,k){ const C=[]; for(let i=0;i<k;i++) C.push([Math.random()*255,Math.random()*255,Math.random()*255]); for(let it=0;it<6;it++){ const S=Array.from({length:k},()=>[0,0,0,0]); for(let i=0;i<data.length;i+=4){ if(data[i+3]<16) continue; const r=data[i],g=data[i+1],b=data[i+2]; let bi=0,bd=1e9; for(let j=0;j<k;j++){ const c=C[j], d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} } const s=S[bi]; s[0]+=r;s[1]+=g;s[2]+=b;s[3]++; } for(let j=0;j<k;j++){ const s=S[j]; if(s[3]) C[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]]; } } return C; }
  function nearest(p,r,g,b){ let bi=0,bd=1e9; for(let j=0;j<p.length;j++){ const c=p[j],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} } return p[bi]; }
  function rasterToStitches(bmp, dir){
    const cvs=document.createElement('canvas'); cvs.width=bmp.width; cvs.height=bmp.height; const cx=cvs.getContext('2d'); cx.drawImage(bmp,0,0);
    const img=cx.getImageData(0,0,cvs.width,cvs.height).data; const cov=new Uint8Array(cvs.width*cvs.height);
    for(let i=0;i<cov.length;i++) cov[i]=img[i*4+3]>0?1:0;
    const theta=(dir.angle*Math.PI)/180, dx=Math.cos(theta), dy=Math.sin(theta), step=3, stitches=[];
    for(let y=-cvs.height; y<cvs.height*2; y+=step){
      let on=false,x0=0,y0=0;
      for(let x=-cvs.width; x<cvs.width*2; x++){
        const px=Math.round(x*dx - y*dy), py=Math.round(x*dy + y*dx);
        if(px<0||py<0||px>=cvs.width||py>=cvs.height){ if(on){on=false;} continue; }
        const inside=cov[py*cvs.width+px];
        if(inside && !on){ on=true; x0=px;y0=py; }
        else if(!inside && on){ on=false; stitches.push({x0,y0,x1:px,y1:py}); }
      }
    }
    return stitches;
  }

})();