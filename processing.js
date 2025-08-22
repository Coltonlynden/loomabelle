(function(){
  const S=EAS.state;
  const getCtx=c=>c.getContext("2d",{willReadFrequently:true});

  // zoom/pan transform and label
  function setShellTransform(){
    const el=document.getElementById("shell");
    el.style.transform=`translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
    const zl=document.getElementById("zoom-label"); if(zl) zl.textContent=Math.round(S.zoom*100)+"%";
  }

  // reset direction/pattern overlays
  function resetDirectionMaps(){
    S.dirMap.fill(255); S.patMap.fill(255);
    ["dir","stitchvis"].forEach(id=>getCtx(document.getElementById(id)).clearRect(0,0,1024,1024));
  }

  // place image
  async function placeImage(img){
    const base=document.getElementById("canvas"); const ctx=getCtx(base);
    ctx.clearRect(0,0,1024,1024);
    const w=img.naturalWidth, h=img.naturalHeight;
    const sc=Math.min(1024/w,1024/h);
    const dw=Math.round(w*sc), dh=Math.round(h*sc);
    const ox=(1024-dw)>>1, oy=(1024-dh)>>1;
    ctx.imageSmoothingQuality="high";
    ctx.drawImage(img,0,0,w,h, ox,oy,dw,dh);

    ["mask","edges","preview"].forEach(id=>getCtx(document.getElementById(id)).clearRect(0,0,1024,1024));
    resetDirectionMaps();

    S.scale=sc; S.hasImage=true; S.hasMask=false;
    document.getElementById("btn-auto").disabled=false;
    document.getElementById("btn-make-stitches").disabled=true;
    document.getElementById("btn-dl-png").disabled=true;
    document.getElementById("btn-dl-svg").disabled=true;
    document.getElementById("btn-dl-json").disabled=true;
  }

  // auto subject (k-means + center CC)
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
    for(let i=0;i<W*H;i++){ const on=best.includes(i); const j=i*4; md.data[j]=0; md.data[j+1]=0; md.data[j+2]=0; md.data[j+3]=on?255:0; }
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

  // preview
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

    const vis = document.getElementById("stitchvis").getContext("2d");
    vis.clearRect(0,0,1024,1024);
    if(showStitches && S.stitches && document.getElementById("toggle-stitch-preview").checked){
      let pass=0;
      for(const passData of S.stitches.passes){
        vis.strokeStyle = ["rgba(0,0,0,.35)","rgba(0,0,0,.55)","rgba(0,0,0,.75)"][pass%3];
        vis.lineWidth=1; vis.beginPath();
        for(const poly of passData){
          vis.moveTo(poly[0][0], poly[0][1]);
          for(let i=1;i<poly.length;i++) vis.lineTo(poly[i][0], poly[i][1]);
        }
        vis.stroke();
        // arrowheads
        for(const poly of passData){
          for(let i=14;i<poly.length;i+=40){
            const a=poly[i-5], b=poly[i]; const ang=Math.atan2(b[1]-a[1], b[0]-a[0]);
            drawArrow(vis,b[0],b[1],ang);
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

  // edges
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

  // undo/redo
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

  // ===== Direction + pattern painting =====
  function angleToBin(deg){ return Math.min(180, Math.max(0, Math.round(deg/15)*15)); }

  function paintDirection(x,y,r,deg,pattern){
    const bin=angleToBin(deg), pat={fill:0,satin:1,cross:2}[pattern];
    const dirCtx=document.getElementById("dir").getContext("2d");
    const hue=(bin/180)*180;
    dirCtx.fillStyle=`hsla(${hue},70%,60%,0.6)`;
    dirCtx.beginPath(); dirCtx.arc(x,y,r,0,Math.PI*2); dirCtx.fill();

    const R=Math.ceil(r), W=1024;
    for(let yy=y-R; yy<=y+R; yy++){
      for(let xx=x-R; xx<=x+R; xx++){
        if(xx<0||yy<0||xx>=1024||yy>=1024) continue;
        if((xx-x)**2+(yy-y)**2 <= r*r){
          S.dirMap[yy*W+xx]=bin;
          S.patMap[yy*W+xx]=pat;
        }
      }
    }
  }

  // ===== Stitch generation =====
  function generateStitches(){
    const mask=getCtx(document.getElementById("mask")).getImageData(0,0,1024,1024).data;
    const W=1024,H=1024;

    // collect unique (bin,pattern) seen
    const seen=new Set(), combos=[];
    for(let i=0;i<S.dirMap.length;i++){
      const b=S.dirMap[i], p=S.patMap[i];
      if(b!==255 && p!==255){ const key=b+":"+p; if(!seen.has(key)){ seen.add(key); combos.push([b,p]); } }
    }
    if(combos.length===0) combos.push([angleToBin(S.dirAngle), {fill:0,satin:1,cross:2}[S.dirPattern]]);

    const passes=[];
    for(const [bin,pat] of combos){
      const ang=bin*Math.PI/180;
      if(pat===0){ // running fill
        passes.push(...makeFillPasses(mask,W,H,ang,6,4,(x,y)=>okByCombo(x,y,bin,pat)));
      }else if(pat===1){ // satin zig-zag
        passes.push(...makeSatinPasses(mask,W,H,ang,8,(x,y)=>okByCombo(x,y,bin,pat)));
      }else{ // cross hatch = two fills
        passes.push(...makeFillPasses(mask,W,H,ang,7,4,(x,y)=>okByCombo(x,y,bin,pat)));
        passes.push(...makeFillPasses(mask,W,H,ang+Math.PI/2,7,4,(x,y)=>okByCombo(x,y,bin,pat)));
      }
    }

    S.stitches={passes, units:"px", px_per_mm:10};
    document.getElementById("btn-dl-json").disabled=false;
    renderPreview(true);
  }

  function okByCombo(x,y,bin,pat){
    const idx=y*1024+x;
    const okMask = getAlphaAt(idx) > 127;
    if(!okMask) return false;
    const b=S.dirMap[idx], p=S.patMap[idx];
    if(b===255 || p===255) return true; // unpainted area uses any
    return b===bin && p===pat;
    function getAlphaAt(i){ return getCtx(document.getElementById("mask")).getImageData(0,0,1024,1024).data[i*4+3]; }
  }

  // running fill generation
  function makeFillPasses(mask,W,H,ang,spacing,step,acceptFn){
    const ux=Math.cos(ang), uy=Math.sin(ang);
    const px=-uy, py=ux;
    const maxd = Math.hypot(W,H);
    const pass=[];
    for(let offset=-maxd; offset<=maxd; offset+=spacing){
      let run=[], inRun=false;
      for(let t=-maxd; t<=maxd; t+=step){
        const x=(W/2)+ux*t+px*offset, y=(H/2)+uy*t+py*offset;
        const xi=x|0, yi=y|0;
        if(xi<0||yi<0||xi>=W||yi>=H){ if(inRun){ pass.push(run); run=[]; inRun=false; } continue; }
        const m = mask[(yi*W+xi)*4+3] > 127;
        const ok = m && acceptFn(xi,yi);
        if(ok){ run.push([x,y]); inRun=true; } else if(inRun){ pass.push(run); run=[]; inRun=false; }
      }
      if(run.length) pass.push(run);
    }
    return [pass];
  }

  // satin: zig-zag strokes across a band oriented along `ang`
  function makeSatinPasses(mask,W,H,ang,spacing,acceptFn){
    const u=[Math.cos(ang), Math.sin(ang)];
    const v=[-u[1], u[0]]; // perpendicular
    const maxd=Math.hypot(W,H);
    const pass=[];
    for(let s=-maxd; s<=maxd; s+=spacing){
      let dir=1, seg=[];
      for(let t=-maxd; t<=maxd; t+=4){
        const x=(W/2)+u[0]*t+v[0]*s, y=(H/2)+u[1]*t+v[1]*s;
        const xi=x|0, yi=y|0;
        if(xi<0||yi<0||xi>=W||yi>=H) { continue; }
        const inside = mask[(yi*W+xi)*4+3]>127 && acceptFn(xi,yi);
        if(!inside){ if(seg.length){ pass.push(seg); seg=[]; } continue; }
        // zig to the sides
        const zz=6;
        const x2=x+v[0]*zz*dir, y2=y+v[1]*zz*dir;
        seg.push([x2,y2]); dir*=-1;
      }
      if(seg.length) pass.push(seg);
    }
    return [pass];
  }

  // exports
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
    // maps and painting
    paintDirection:(x,y,r)=>paintDirection(x,y,r,S.dirAngle,S.dirPattern),
    // undo/redo + view
    undo, redo, pushUndo, setShellTransform,
    resetDirectionMaps
  };
})();