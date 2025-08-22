// CPU-bound helpers. Large work can be moved to worker.js later.
(function(){
  const S = window.EAS.state;

  function getCtx(c){ return c.getContext("2d", {willReadFrequently:true}); }

  // Load image to base canvas, fit into 1024x1024, center
  async function placeImage(img){
    const base = document.getElementById("canvas");
    const ctx = getCtx(base);
    ctx.clearRect(0,0,base.width,base.height);

    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(base.width/w, base.height/h);
    const dw = Math.round(w*scale), dh = Math.round(h*scale);
    const ox = (base.width - dw)>>1, oy = (base.height - dh)>>1;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0,0,w,h, ox,oy,dw,dh);

    S.scale = scale;
    S.hasImage = true;

    // reset mask
    const m = document.getElementById("mask");
    getCtx(m).clearRect(0,0,m.width,m.height);
    S.hasMask = false;

    // update preview availability
    document.getElementById("btn-auto").disabled = false;
    document.getElementById("btn-make-stitches").disabled = true;
    document.getElementById("btn-dl-png").disabled = true;
    document.getElementById("btn-dl-svg").disabled = true;
    document.getElementById("btn-dl-json").disabled = true;

    // show Draw tab
    document.getElementById("tab-draw").click();
  }

  // Simple k-means on downscaled image. Returns binary mask.
  function autoSubject(detail=3){
    const base = document.getElementById("canvas");
    const ctx = getCtx(base);

    // downscale for speed
    const W = 256, H = 256;
    const tmp = document.createElement("canvas");
    tmp.width=W; tmp.height=H;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(base,0,0,base.width,base.height,0,0,W,H);
    const img = tctx.getImageData(0,0,W,H);
    const data = img.data;

    const K = Math.max(2, Math.min(6, detail)); // 2..6 clusters
    // init centroids by sampling
    const cents = [];
    for(let k=0;k<K;k++){
      const i = ((Math.random()*W*H)|0)*4;
      cents.push([data[i],data[i+1],data[i+2]]);
    }

    const label = new Uint8Array(W*H);
    // run few iters
    for(let iter=0; iter<8; iter++){
      // assign
      for(let p=0;p<W*H;p++){
        const i=p*4; const r=data[i], g=data[i+1], b=data[i+2];
        let best=0, bd=1e12;
        for(let k=0;k<K;k++){
          const c=cents[k]; const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;
          if(d<bd){bd=d;best=k;}
        }
        label[p]=best;
      }
      // update
      const acc=Array.from({length:K},()=>[0,0,0,0]);
      for(let p=0;p<W*H;p++){
        const l=label[p], i=p*4; const a=acc[l];
        a[0]+=data[i]; a[1]+=data[i+1]; a[2]+=data[i+2]; a[3]++;
      }
      for(let k=0;k<K;k++){
        const a=acc[k]; if(a[3]){ cents[k]=[a[0]/a[3],a[1]/a[3],a[2]/a[3]]; }
      }
    }

    // choose foreground cluster whose largest component contains the image center
    const cx=(W/2)|0, cy=(H/2)|0;
    function compMask(which){
      const m=new Uint8Array(W*H);
      for(let i=0;i<W*H;i++) if(label[i]===which) m[i]=1;
      return m;
    }
    function flood(m,sx,sy){
      const seen=new Uint8Array(W*H); const stack=[[sx,sy]];
      const out=[];
      while(stack.length){
        const [x,y]=stack.pop();
        const idx=y*W+x; if(x<0||y<0||x>=W||y>=H||seen[idx]||!m[idx]) continue;
        seen[idx]=1; out.push(idx);
        stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
      return out;
    }

    let bestMask=null, bestCount=-1;
    for(let k=0;k<K;k++){
      const m=compMask(k);
      const comp = flood(m,cx,cy);
      if(comp.length>bestCount){bestCount=comp.length;bestMask=m;}
    }

    // upscale to mask canvas
    const maskC = document.getElementById("mask");
    const mctx = getCtx(maskC);
    const md = mctx.createImageData(W,H);
    for(let i=0;i<W*H;i++){
      const v = bestMask[i]?255:0;
      const j=i*4; md.data[j]=0; md.data[j+1]=0; md.data[j+2]=0; md.data[j+3]=v;
    }
    const scale = maskC.width/W;
    const tmp2=document.createElement("canvas"); tmp2.width=W; tmp2.height=H;
    tmp2.getContext("2d").putImageData(md,0,0);
    mctx.clearRect(0,0,maskC.width,maskC.height);
    mctx.imageSmoothingEnabled=false;
    mctx.drawImage(tmp2,0,0,W,H,0,0,maskC.width,maskC.height);

    S.hasMask = true;
    renderPreview();
  }

  function renderPreview(){
    if(!S.hasImage) return;
    const base = document.getElementById("canvas");
    const mask = document.getElementById("mask");
    const prev = document.getElementById("preview");
    const pctx = prev.getContext("2d");
    pctx.clearRect(0,0,prev.width,prev.height);
    pctx.drawImage(base,0,0);
    if(S.hasMask){
      pctx.save();
      pctx.globalCompositeOperation = "destination-in";
      pctx.drawImage(mask,0,0);
      pctx.restore();
    }
    drawTextLayer(pctx);
    document.getElementById("btn-dl-png").disabled=false;
    document.getElementById("btn-dl-svg").disabled=false;
    document.getElementById("btn-make-stitches").disabled=false;
  }

  function drawTextLayer(ctx){
    if(!EAS.state.text.content) return;
    const T = EAS.state.text;
    ctx.save();
    ctx.fillStyle="#000";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.font = `700 ${T.size}px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif`;

    // curved baseline rendering
    const text = T.content;
    const radius = 600; // base circle radius for curve mapping
    const curve = +T.curve; // -100..100
    const angleSpan = curve * Math.PI/180; // convert to radians
    const cx = T.x, cy = T.y;

    if(curve===0){
      ctx.fillText(text, cx, cy);
    }else{
      const chars = [...text];
      const totalWidth = chars.reduce((w,ch)=>w+ctx.measureText(ch).width,0);
      let a0 = -angleSpan/2;
      for(const ch of chars){
        const w = ctx.measureText(ch).width;
        const a = a0 + (w/totalWidth)*angleSpan/2;
        const x = cx + Math.cos(a)*radius;
        const y = cy + Math.sin(a)*radius;
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(a + Math.PI/2);
        ctx.fillText(ch,0,0);
        ctx.restore();
        a0 += (w/totalWidth)*angleSpan;
      }
    }
    ctx.restore();
  }

  // Export helpers
  function downloadBlob(name, blob){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function exportPNG(){
    const prev = document.getElementById("preview");
    prev.toBlob(b=>downloadBlob("easbroidery.png", b), "image/png", 1.0);
  }

  function exportSVG(){
    // Build simple SVG with mask path and optional text. For now raster-embed the clipped PNG.
    const prev = document.getElementById("preview");
    const dataURL = prev.toDataURL("image/png");
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${prev.width}" height="${prev.height}" viewBox="0 0 ${prev.width} ${prev.height}">
  <image href="${dataURL}" x="0" y="0" width="${prev.width}" height="${prev.height}" />
</svg>`;
    const blob = new Blob([svg], {type:"image/svg+xml"});
    downloadBlob("easbroidery.svg", blob);
  }

  // Very simple marching squares contour from mask -> polyline
  function maskToContours(){
    const mask = document.getElementById("mask");
    const mctx = mask.getContext("2d");
    const md = mctx.getImageData(0,0,mask.width,mask.height).data;
    const W=mask.width, H=mask.height;

    const get=(x,y)=> (x<0||y<0||x>=W||y>=H)?0: md[(y*W+x)*4+3]>127?1:0;

    const visited = new Uint8Array(W*H);
    const contours=[];
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const idx=y*W+x;
        if(get(x,y)&&!visited[idx]){
          // trace contour
          let cx=x, cy=y, dir=0; // 0:right,1:down,2:left,3:up
          const poly=[];
          let loops=0;
          do{
            poly.push([cx,cy]);
            visited[cy*W+cx]=1;
            // marching: look right-hand rule
            const right=(dir+3)&3, left=(dir+1)&3;
            const dx=[1,0,-1,0], dy=[0,1,0,-1];
            const rx=cx+dx[right], ry=cy+dy[right];
            if(get(rx,ry)){ dir=right; cx=rx; cy=ry; }
            else{
              const fx=cx+dx[dir], fy=cy+dy[dir];
              if(get(fx,fy)){ cx=fx; cy=fy; }
              else{ dir=left; }
            }
          }while((cx!==x||cy!==y) && ++loops<200000);
          if(poly.length>20) contours.push(poly);
        }
      }
    }
    return contours;
  }

  function generateStitches(){
    // convert contours to running stitch at step px
    const step = 4; // px step
    const polys = maskToContours();
    const stitches=[];
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;

    polys.forEach(poly=>{
      for(let i=0;i<poly.length;i++){
        const a=poly[i], b=poly[(i+1)%poly.length];
        const dx=b[0]-a[0], dy=b[1]-a[1];
        const len=Math.hypot(dx,dy);
        const n=Math.max(1,Math.floor(len/step));
        for(let k=0;k<=n;k++){
          const t=k/n;
          const x=a[0]+dx*t, y=a[1]+dy*t;
          stitches.push([x,y]);
          if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y;
        }
      }
    });

    // normalize to origin
    for(let i=0;i<stitches.length;i++){
      stitches[i][0]-=minx; stitches[i][1]-=miny;
    }
    const w=maxx-minx, h=maxy-miny;

    EAS.state.stitches = {points:stitches, bbox:[w,h], units:"px", px_per_mm:10};
    document.getElementById("btn-dl-json").disabled=false;
  }

  function exportStitchesJSON(){
    const s = EAS.state.stitches || {points:[],bbox:[0,0],units:"px",px_per_mm:10};
    const blob = new Blob([JSON.stringify(s)],{type:"application/json"});
    downloadBlob("easbroidery.stitches.json", blob);
  }

  // Expose
  window.EAS_processing = {
    placeImage, autoSubject, renderPreview,
    exportPNG, exportSVG, generateStitches, exportStitchesJSON
  };
})();