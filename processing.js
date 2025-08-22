(function(){
  const S=EAS.state;
  const getCtx=c=>c.getContext("2d",{willReadFrequently:true});

  const shell = ()=> document.getElementById("shell");
  function setShellTransform(){
    const el=shell(); if(!el) return;
    el.style.transform=`translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
    document.getElementById("zoom-label").textContent = Math.round(S.zoom*100)+"%";
  }

  // reset dir map
  function resetDirMap(){
    S.dirMap.fill(255); // 255 = unset
    const d=document.getElementById("dir").getContext("2d");
    d.clearRect(0,0,1024,1024);
  }

  async function placeImage(img){
    const base=document.getElementById("canvas"); const ctx=getCtx(base);
    ctx.clearRect(0,0,1024,1024);
    const w=img.naturalWidth, h=img.naturalHeight;
    const sc=Math.min(1024/w, 1024/h);
    const dw=Math.round(w*sc), dh=Math.round(h*sc);
    const ox=(1024-dw)>>1, oy=(1024-dh)>>1;
    ctx.imageSmoothingQuality="high";
    ctx.drawImage(img,0,0,w,h, ox,oy,dw,dh);

    // clear layers
    ["mask","edges","dir","stitchvis","preview"].forEach(id=>getCtx(document.getElementById(id)).clearRect(0,0,1024,1024));
    resetDirMap();

    S.scale=sc; S.hasImage=true; S.hasMask=false;
    document.getElementById("btn-auto").disabled=false;
    document.getElementById("btn-make-stitches").disabled=true;
    document.getElementById("btn-dl-png").disabled=true;
    document.getElementById("btn-dl-svg").disabled=true;
    document.getElementById("btn-dl-json").disabled=true;
  }

  // k-means auto subject
  function autoSubject(detail=3){
    if(!S.hasImage) return;
    const base=document.getElementById("canvas");
    const W=256,H=256,tmp=document.createElement("canvas");
    tmp.width=W; tmp.height=H; const t=tmp.getContext("2d");
    t.drawImage(base,0,0,1024,1024,0,0,W,H);
    const id=t.getImageData(0,0,W,H), d=id.data;

    const K=Math.max(2,Math.min(6,detail)), cents=[];
    for(let k=0;k<K;k++){ const i=((Math.random()*W*H)|0)*4; cents.push([d[i],d[i+1],d[i+2]]); }
    const label=new Uint8Array(W*H);
    for(let it=0;it<8;it++){
      for(let p=0;p<W*H;p++){
        const i=p*4, r=d[i],g=d[i+1],b=d[i+2];
        let bi=0,bd=1e9; for(let k=0;k<K;k++){ const c=cents[k]; const L=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(L<bd){bd=L;bi=k;} }
        label[p]=bi;
      }
      const acc=Array.from({length:K},()=>[0,0,0,0]);
      for(let p=0;p<W*H;p++){ const L=label[p],i=p*4; const a=acc[L]; a[0]+=d[i];a[1]+=d[i+1];a[2]+=d[i+2];a[3]++; }
      for(let k=0;k<K;k++){ const a=acc[k]; if(a[3]) cents[k]=[a[0]/a[3],a[1]/a[3],a[2]/a[3]]; }
    }
    const cx=(W/2)|0, cy=(H/2)|0;
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
    let best=[], bestLen=-1; for(let k=0;k<K;k++){ const c=flood(k); if(c.length>bestLen){best=c; bestLen=c.length;} }

    const mc=getCtx(document.getElementById("mask"));
    const md=mc.createImageData(W,H);
    for(let i=0;i<W*H;i++){ const v=best.includes(i)?255:0; const j=i*4; md.data[j]=0; md.data[j+1]=0; md.data[j+2]=0; md.data[j+3]=v; }
    const tmp2=document.createElement("canvas"); tmp2.width=W; tmp2.height=H; tmp2.getContext("2d").putImageData(md,0,0);
    mc.clearRect(0,0,1024,1024); mc.imageSmoothingEnabled=false; mc.drawImage(tmp2,0,0,W,H,0,0,1024,1024);

    S.hasMask=true; pushUndo(); computeEdges(); renderPreview();
  }

  // text layer
  function drawTextLayer(ctx){
    const T=S.text; if(!T.content) return;
    ctx.save(); ctx.fillStyle="#000"; ctx.textAlign="center"; ctx.textBaseline="middle";
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

  function renderPreview(showStitches=true){
    if(!S.hasImage) return;
    const base=document.getElementById("canvas");
    const mask=document.getElementById("mask");
    const prev=document.getElementById("preview");
    const p=prev.getContext("2d");
    p.clearRect(0,0,1024,1024);
    p.drawImage(base,0,0);
    if(S.hasMask){ p.save(); p.globalCompositeOperation="destination-in"; p.drawImage(mask,0,0); p.restore(); }
    drawTextLayer(p);

    document.getElementById("btn-dl-png").disabled=false;
    document.getElementById("btn-dl-svg").disabled=false;
    document.getElementById("btn-make-stitches").disabled=false;

    // stitch overlay
    const vis = document.getElementById("stitchvis").getContext("2d");
    vis.clearRect(0,0,1024,1024);
    if(showStitches && S.stitches && document.getElementById("toggle-stitch-preview").checked){
      vis.lineWidth=1;
      let pass=0;
      for(const segs of S.stitches.passes){
        vis.strokeStyle = `rgba(0,0,0,${0.35+0.2*(pass%3)/3})`;
        vis.beginPath();
        for(const s of segs){
          vis.moveTo(s[0][0], s[0][1]);
          for(let i=1;i<s.length;i++){ vis.lineTo(s[i][0], s[i][1]); }
        }
        vis.stroke();
        // arrowheads every ~40 px
        for(const s of segs){
          for(let i=10;i<s.length;i+=40){
            const a=s[i-5], b=s[i];
            const ang=Math.atan2(b[1]-a[1], b[0]-a[0]);
            drawArrow(vis, b[0], b[1], ang);
          }
        }
        pass++;
      }
    }
  }
  function drawArrow(ctx,x,y,a){
    const L=8;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x-L*Math.cos(a-0.4), y-L*Math.sin(a-0.4));
    ctx.moveTo(x,y);
    ctx.lineTo(x-L*Math.cos(a+0.4), y-L*Math.sin(a+0.4));
    ctx.stroke();
  }

  // edges preview
  function computeEdges(){
    const m=document.getElementById("mask"), mc=m.getContext("2d"), id=mc.getImageData(0,0,1024,1024);
    const e=document.getElementById("edges"), ec=e.getContext("2d"); ec.clearRect(0,0,1024,1024);
    const a=id.data, out=ec.createImageData(1024,1024), o=out.data;
    const idx=(x,y)=>(y*1024+x)<<2;
    for(let y=1;y<1023;y++){
      for(let x=1;x<1023;x++){
        const c=a[idx(x,y)+3]>127?1:0; if(!c) continue;
        const n=a[idx(x+1,y)+3]>127 && a[idx(x-1,y)+3]>127 && a[idx(x,y+1)+3]>127 && a[idx(x,y-1)+3]>127;
        if(!n){ const j=idx(x,y); o[j]=0;o[j+1]=0;o[j+2]=0;o[j+3]=255; }
      }
    }
    ec.putImageData(out,0,0);
  }

  // UNDO/REDO
  function pushUndo(){
    const mc=document.getElementById("mask").getContext("2d");
    const snap=mc.getImageData(0,0,1024,1024);
    S.undo.push(snap); S.redo.length=0;
  }
  function undo(){
    if(!S.undo.length) return;
    const mc=document.getElementById("mask").getContext("2d");
    const cur=mc.getImageData(0,0,1024,1024);
    S.redo.push(cur);
    const prev=S.undo.pop(); mc.putImageData(prev,0,0); S.hasMask=true; computeEdges(); renderPreview();
  }
  function redo(){
    if(!S.redo.length) return;
    const mc=document.getElementById("mask").getContext("2d");
    const cur=mc.getImageData(0,0,1024,1024); S.undo.push(cur);
    const nxt=S.redo.pop(); mc.putImageData(nxt,0,0); S.hasMask=true; computeEdges(); renderPreview();
  }

  // ===== Direction painting and stitch generator =====
  // Quantize angle to 12 bins (0..180)
  function angleToBin(deg){ return Math.min(180, Math.max(0, Math.round(deg/15)*15)); }

  function paintDirection(x,y,r,deg){
    const bin=angleToBin(deg);
    const dirCtx=document.getElementById("dir").getContext("2d");
    dirCtx.fillStyle=`hsl(${(bin/180)*180},70%,60%)`;
    dirCtx.beginPath(); dirCtx.arc(x,y,r,0,Math.PI*2); dirCtx.fill();

    // write into map
    const R=Math.ceil(r), W=1024;
    for(let yy=y-R; yy<=y+R; yy++){
      for(let xx=x-R; xx<=x+R; xx++){
        if(xx<0||yy<0||xx>=1024||yy>=1024) continue;
        if((xx-x)**2+(yy-y)**2 <= r*r) S.dirMap[yy*W+xx]=bin;
      }
    }
  }

  // Create hatch passes; each pass = array of polylines; visualize
  function generateStitches(){
    const mask=document.getElementById("mask").getContext("2d").getImageData(0,0,1024,1024).data;
    const W=1024,H=1024;
    const step=4;          // distance between points along a line
    const spacing=6;       // distance between adjacent lines
    const bins=[];         // list of bins present
    const seenBin=new Set();
    for(let i=0;i<S.dirMap.length;i++){
      const b=S.dirMap[i];
      if(b!==255 && !seenBin.has(b)){ seenBin.add(b); bins.push(b); }
    }
    if(bins.length===0) bins.push(angleToBin(S.dirAngle));

    const passes=[];
    for(const bin of bins){
      const ang=bin*Math.PI/180;
      const ux=Math.cos(ang), uy=Math.sin(ang);
      // perpendicular vector for stepping between lines
      const px=-uy, py=ux;

      // find bounds
      const maxd = Math.hypot(W,H);
      const lines=[];
      for(let offset=-maxd; offset<=maxd; offset+=spacing){
        const seg=[]; let inRun=false, run=[];
        // param t will move along the line across canvas
        for(let t=-maxd; t<=maxd; t+=step){
          const x = (W/2) + ux*t + px*offset;
          const y = (H/2) + uy*t + py*offset;
          const xi=x|0, yi=y|0;
          if(xi<0||yi<0||xi>=W||yi>=H) { if(inRun){ lines.push(run); run=[]; inRun=false; } continue; }
          const m = mask[(yi*W+xi)*4+3] > 127;
          const okBin = S.dirMap[yi*W+xi]===255 || S.dirMap[yi*W+xi]===bin;
          if(m && okBin){
            run.push([x,y]); inRun=true;
          }else{
            if(inRun){ lines.push(run); run=[]; inRun=false; }
          }
        }
        if(run.length) lines.push(run);
      }
      passes.push(lines);
    }

    S.stitches = {passes, units:"px", px_per_mm:10};
    document.getElementById("btn-dl-json").disabled=false;
    renderPreview(true);
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
    const s=S.stitches || {passes:[],units:"px",px_per_mm:10};
    downloadBlob("easbroidery.stitches.json", new Blob([JSON.stringify(s)],{type:"application/json"}));
  }
  function downloadBlob(name, blob){
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  // public
  window.EAS_processing={
    placeImage, autoSubject, renderPreview, computeEdges,
    exportPNG, exportSVG, generateStitches, exportStitchesJSON,
    undo, redo, pushUndo, setShellTransform,
    paintDirection
  };
})();