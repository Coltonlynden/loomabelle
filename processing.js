// Rendering, auto-mask, preview, and export
(function(){
  const S=EAS.state;
  const getCtx=c=>c.getContext("2d",{willReadFrequently:true});

  async function placeImage(img){
    const base=document.getElementById("canvas");
    const ctx=getCtx(base);
    ctx.clearRect(0,0,base.width,base.height);

    const w=img.naturalWidth, h=img.naturalHeight;
    const scale=Math.min(base.width/w, base.height/h);
    const dw=Math.round(w*scale), dh=Math.round(h*scale);
    const ox=(base.width-dw)>>1, oy=(base.height-dh)>>1;

    ctx.imageSmoothingQuality="high";
    ctx.drawImage(img,0,0,w,h, ox,oy,dw,dh);

    // reset mask
    const m=document.getElementById("mask");
    getCtx(m).clearRect(0,0,m.width,m.height);

    S.scale=scale; S.hasImage=true; S.hasMask=false;
    document.getElementById("btn-auto").disabled=false;
    document.getElementById("btn-make-stitches").disabled=true;
    document.getElementById("btn-dl-png").disabled=true;
    document.getElementById("btn-dl-svg").disabled=true;
    document.getElementById("btn-dl-json").disabled=true;
  }

  // K-means subject pick + center component
  function autoSubject(detail=3){
    if(!S.hasImage) return;
    const base=document.getElementById("canvas");
    const W=256,H=256,tmp=document.createElement("canvas");
    tmp.width=W; tmp.height=H;
    const t=tmp.getContext("2d");
    t.drawImage(base,0,0,base.width,base.height,0,0,W,H);
    const id=t.getImageData(0,0,W,H), d=id.data;

    const K=Math.max(2,Math.min(6,detail));
    const cents=[];
    for(let k=0;k<K;k++){ const i=((Math.random()*W*H)|0)*4; cents.push([d[i],d[i+1],d[i+2]]); }
    const label=new Uint8Array(W*H);
    for(let it=0;it<8;it++){
      for(let p=0;p<W*H;p++){
        const i=p*4, r=d[i],g=d[i+1],b=d[i+2];
        let bi=0,bd=1e12; for(let k=0;k<K;k++){ const c=cents[k], L=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(L<bd){bd=L;bi=k;} }
        label[p]=bi;
      }
      const acc=Array.from({length:K},()=>[0,0,0,0]);
      for(let p=0;p<W*H;p++){ const L=label[p],i=p*4; const a=acc[L]; a[0]+=d[i];a[1]+=d[i+1];a[2]+=d[i+2];a[3]++; }
      for(let k=0;k<K;k++){ const a=acc[k]; if(a[3]) cents[k]=[a[0]/a[3],a[1]/a[3],a[2]/a[3]]; }
    }
    const cx=(W/2)|0, cy=(H/2)|0;
    const mask=new Uint8Array(W*H); for(let i=0;i<W*H;i++) mask[i]=0;

    function flood(which){
      const m=new Uint8Array(W*H); for(let i=0;i<W*H;i++) if(label[i]===which) m[i]=1;
      const seen=new Uint8Array(W*H); const st=[[cx,cy]]; const out=[];
      while(st.length){
        const [x,y]=st.pop(); if(x<0||y<0||x>=W||y>=H) continue;
        const idx=y*W+x; if(seen[idx]||!m[idx]) continue; seen[idx]=1; out.push(idx);
        st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
      return out;
    }
    let best=[], bestLen=-1;
    for(let k=0;k<K;k++){ const comp=flood(k); if(comp.length>bestLen){bestLen=comp.length; best=comp;} }
    best.forEach(i=>mask[i]=1);

    const maskC=document.getElementById("mask"), mc=getCtx(maskC);
    const md=mc.createImageData(W,H);
    for(let i=0;i<W*H;i++){ const v=mask[i]?255:0; const j=i*4; md.data[j]=0; md.data[j+1]=0; md.data[j+2]=0; md.data[j+3]=v; }
    const tmp2=document.createElement("canvas"); tmp2.width=W; tmp2.height=H;
    tmp2.getContext("2d").putImageData(md,0,0);
    mc.clearRect(0,0,maskC.width,maskC.height);
    mc.imageSmoothingEnabled=false;
    mc.drawImage(tmp2,0,0,W,H,0,0,maskC.width,maskC.height);

    S.hasMask=true; renderPreview();
  }

  function drawTextLayer(ctx){
    const T=S.text; if(!T.content) return;
    ctx.save();
    ctx.fillStyle="#000"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font=`700 ${T.size}px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif`;
    const text=T.content, curve=+T.curve, cx=T.x, cy=T.y, radius=600;
    if(curve===0){ ctx.fillText(text,cx,cy); }
    else{
      const chars=[...text];
      const total=chars.reduce((w,ch)=>w+ctx.measureText(ch).width,0);
      const span=curve*Math.PI/180; let a0=-span/2;
      for(const ch of chars){
        const w=ctx.measureText(ch).width, a=a0+(w/total)*span/2;
        const x=cx+Math.cos(a)*radius, y=cy+Math.sin(a)*radius;
        ctx.save(); ctx.translate(x,y); ctx.rotate(a+Math.PI/2); ctx.fillText(ch,0,0); ctx.restore();
        a0+=(w/total)*span;
      }
    }
    ctx.restore();
  }

  function renderPreview(){
    if(!S.hasImage) return;
    const base=document.getElementById("canvas");
    const mask=document.getElementById("mask");
    const prev=document.getElementById("preview");
    const p=prev.getContext("2d");
    p.clearRect(0,0,prev.width,prev.height);
    p.drawImage(base,0,0);
    if(S.hasMask){ p.save(); p.globalCompositeOperation="destination-in"; p.drawImage(mask,0,0); p.restore(); }
    drawTextLayer(p);
    document.getElementById("btn-dl-png").disabled=false;
    document.getElementById("btn-dl-svg").disabled=false;
    document.getElementById("btn-make-stitches").disabled=false;
  }

  // Mask -> contours -> running stitches
  function maskToContours(){
    const m=document.getElementById("mask"), mc=m.getContext("2d"), id=mc.getImageData(0,0,m.width,m.height);
    const W=m.width,H=m.height, a=id.data;
    const get=(x,y)=> (x<0||y<0||x>=W||y>=H)?0: a[(y*W+x)*4+3]>127?1:0;
    const seen=new Uint8Array(W*H), contours=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const idx=y*W+x; if(get(x,y)&&!seen[idx]){
        let cx=x, cy=y, dir=0; const poly=[]; let loops=0;
        const dx=[1,0,-1,0], dy=[0,1,0,-1];
        do{
          poly.push([cx,cy]); seen[cy*W+cx]=1;
          const right=(dir+3)&3, left=(dir+1)&3;
          const rx=cx+dx[right], ry=cy+dy[right];
          if(get(rx,ry)){ dir=right; cx=rx; cy=ry; }
          else{ const fx=cx+dx[dir], fy=cy+dy[dir]; if(get(fx,fy)){ cx=fx; cy=fy; } else dir=left; }
        }while((cx!==x||cy!==y) && ++loops<200000);
        if(poly.length>20) contours.push(poly);
      }
    }
    return contours;
  }

  function generateStitches(){
    const step=4, polys=maskToContours(), stitches=[];
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    polys.forEach(poly=>{
      for(let i=0;i<poly.length;i++){
        const a=poly[i], b=poly[(i+1)%poly.length], dx=b[0]-a[0], dy=b[1]-a[1];
        const len=Math.hypot(dx,dy), n=Math.max(1,Math.floor(len/step));
        for(let k=0;k<=n;k++){
          const t=k/n, x=a[0]+dx*t, y=a[1]+dy*t;
          stitches.push([x,y]);
          if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y;
        }
      }
    });
    for(let i=0;i<stitches.length;i++){ stitches[i][0]-=minx; stitches[i][1]-=miny; }
    EAS.state.stitches={points:stitches,bbox:[maxx-minx,maxy-miny],units:"px",px_per_mm:10};
    document.getElementById("btn-dl-json").disabled=false;
  }

  function downloadBlob(name, blob){
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function exportPNG(){
    const c=document.getElementById("preview");
    c.toBlob(b=>downloadBlob("easbroidery.png",b),"image/png",1.0);
  }
  function exportSVG(){
    const c=document.getElementById("preview"), data=c.toDataURL("image/png");
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}"><image href="${data}" x="0" y="0" width="${c.width}" height="${c.height}" /></svg>`;
    downloadBlob("easbroidery.svg", new Blob([svg],{type:"image/svg+xml"}));
  }
  function exportStitchesJSON(){
    const s=EAS.state.stitches || {points:[],bbox:[0,0],units:"px",px_per_mm:10};
    downloadBlob("easbroidery.stitches.json", new Blob([JSON.stringify(s)],{type:"application/json"}));
  }

  window.EAS_processing={placeImage,autoSubject,renderPreview,generateStitches,exportPNG,exportSVG,exportStitchesJSON};
})();