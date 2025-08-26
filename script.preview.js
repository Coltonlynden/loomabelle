(function(){
  const hoopInner = document.querySelector('.hoop__inner');
  const c = document.getElementById('previewCanvas');
  const ctx = c.getContext('2d');
  const genBtn = document.getElementById('genBtn');
  const show = document.getElementById('showPreview');
  const pngBtn=document.getElementById('pngBtn'), svgBtn=document.getElementById('svgBtn'),
        jsonBtn=document.getElementById('jsonBtn'), dstBtn=document.getElementById('dstBtn');

  let data=null;

  function size(){
    const w=hoopInner.clientWidth, h=hoopInner.clientHeight;
    c.width=Math.max(2,Math.round(w*devicePixelRatio));
    c.height=Math.max(2,Math.round(h*devicePixelRatio));
    c.style.width=w+'px'; c.style.height=h+'px';
    draw();
  }
  addEventListener('resize',()=>{ size(); Editor.fit(); });
  size();

  genBtn?.addEventListener('click',()=>{
    const {base,mask,text,dir}=Editor.getLayers();
    if(!base.width) return;
    // compose masked+text
    const off=document.createElement('canvas'); off.width=base.width; off.height=base.height;
    const cx=off.getContext('2d'); cx.drawImage(base,0,0);
    cx.globalCompositeOperation='destination-in'; cx.drawImage(mask,0,0);
    cx.globalCompositeOperation='source-over'; cx.drawImage(text,0,0);

    const reduced = quantize(off, 8);     // 8-color simplification
    const stitches= hatch(reduced, dir);  // running-stitch fill
    data={img:reduced, stitches};
    draw();
  });

  function draw(){
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,c.width,c.height);
    if(!data || !show?.checked) return;
    const pad=20*devicePixelRatio; const iw=data.img.width, ih=data.img.height;
    const sc=Math.min((c.width-pad*2)/iw, (c.height-pad*2)/ih);
    const ox=(c.width-iw*sc)/2, oy=(c.height-ih*sc)/2;
    ctx.drawImage(data.img, ox, oy, iw*sc, ih*sc);

    ctx.lineWidth=1*devicePixelRatio; ctx.strokeStyle='#3b3b3b';
    ctx.beginPath();
    for(const s of data.stitches){ ctx.moveTo(ox+s.x0*sc, oy+s.y0*sc); ctx.lineTo(ox+s.x1*sc, oy+s.y1*sc); }
    ctx.stroke();
  }

  // --- simple quantization ---
  function quantize(cnv,k){
    const g=cnv.getContext('2d'), w=cnv.width,h=cnv.height, id=g.getImageData(0,0,w,h);
    const pal=kmeans(id.data,k);
    for(let i=0;i<w*h;i++){
      const a=id.data[i*4+3]; if(a<8) continue;
      const r=id.data[i*4],g1=id.data[i*4+1],b=id.data[i*4+2]; const c=nearest(pal,r,g1,b);
      id.data[i*4]=c[0]; id.data[i*4+1]=c[1]; id.data[i*4+2]=c[2]; id.data[i*4+3]=255;
    }
    g.putImageData(id,0,0);
    return cnv;
  }
  function kmeans(arr,k){ const C=[]; for(let i=0;i<k;i++) C.push([Math.random()*255,Math.random()*255,Math.random()*255]);
    for(let it=0;it<6;it++){ const S=Array.from({length:k},()=>[0,0,0,0]); for(let i=0;i<arr.length;i+=4){ if(arr[i+3]<16) continue;
      const r=arr[i],g=arr[i+1],b=arr[i+2]; let bi=0,bd=1e9; for(let j=0;j<k;j++){ const c=C[j],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} } const s=S[bi]; s[0]+=r;s[1]+=g;s[2]+=b;s[3]++; }
      for(let j=0;j<k;j++){ const s=S[j]; if(s[3]) C[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]]; } }
    return C;
  }
  const nearest=(p,r,g,b)=>p.reduce((best,c)=>((r-c[0])**2+(g-c[1])**2+(b-c[2])**2 < best.d)?{c, d:(r-c[0])**2+(g-c[1])**2+(b-c[2])**2}:best,{c:p[0],d:1e9}).c;

  // --- simple running-stitch hatch (preview) ---
  function hatch(bmp,dir){
    const cvs=document.createElement('canvas'); cvs.width=bmp.width; cvs.height=bmp.height;
    cvs.getContext('2d').drawImage(bmp,0,0);
    const {data:wdata,width:w,height:h}=cvs.getContext('2d').getImageData(0,0,cvs.width,cvs.height);
    const cov=new Uint8Array(w*h); for(let i=0;i<w*h;i++) cov[i]=wdata[i*4+3]>0?1:0;

    const th=(dir.angle*Math.PI)/180, dx=Math.cos(th), dy=Math.sin(th), step=3, out=[];
    for(let y=-h; y<h*2; y+=step){
      let on=false,x0=0,y0=0;
      for(let x=-w; x<w*2; x++){
        const px=Math.round(x*dx - y*dy), py=Math.round(x*dy + y*dx);
        if(px<0||py<0||px>=w||py>=h){ if(on){on=false;} continue; }
        const inside=cov[py*w+px];
        if(inside && !on){on=true; x0=px; y0=py;}
        else if(!inside && on){on=false; out.push({x0,y0,x1:px,y1:py});}
      }
    }
    return out;
  }

  // downloads
  pngBtn.onclick=()=>{ const a=document.createElement('a'); a.download='preview.png'; a.href=c.toDataURL('image/png'); a.click(); };
  svgBtn.onclick=()=>{ if(!data) return; const W=c.width,H=c.height; let d=''; for(const s of data.stitches){ d+=`M${s.x0},${s.y0} L${s.x1},${s.y1} `;} const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" stroke="#333" stroke-width="${devicePixelRatio}" fill="none"/></svg>`; const a=document.createElement('a'); a.download='preview.svg'; a.href='data:image/svg+xml,'+encodeURIComponent(svg); a.click(); };
  jsonBtn.onclick=()=>{ const a=document.createElement('a'); a.download='stitches.json'; a.href='data:application/json,'+encodeURIComponent(JSON.stringify(data?.stitches||[])); a.click(); };
  dstBtn.onclick=()=>{ const s=data?.stitches||[]; let out='x0,y0,x1,y1\n'; for(const p of s) out+=`${p.x0},${p.y0},${p.x1},${p.y1}\n`; const a=document.createElement('a'); a.download='design.dst'; a.href='data:text/plain,'+encodeURIComponent(out); a.click(); };
})();