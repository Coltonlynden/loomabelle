// Overlay compositor + stitch recolor
(function () {
  const S = (window.EAS ||= {}).state ||= {};
  const overlay = document.getElementById('overlay');
  const mask = document.getElementById('mask');
  const s = document.getElementById('stitchvis'); const sctx = s.getContext('2d');
  overlay.width = overlay.height = s.width = s.height = 1024;

  function drawCurvedText(ctx){
    if(!S.text?.content) return;
    ctx.save(); ctx.translate(512, 820); ctx.rotate((S.text.angle||0)*Math.PI/180);
    const r=280, t=S.text.content, curve=S.text.curve||0;
    ctx.font=`bold ${S.text.size||64}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#222';
    if(Math.abs(curve)<0.01){ ctx.fillText(t,0,0); }
    else{
      const chars=[...t], arc=curve*Math.PI;
      for(let i=0;i<chars.length;i++){
        const a=-arc/2 + arc*i/Math.max(1,chars.length-1);
        ctx.save(); ctx.rotate(a); ctx.translate(0,-r); ctx.rotate(Math.sign(curve)*Math.PI/2);
        ctx.fillText(chars[i],0,0); ctx.restore();
      }
    }
    ctx.restore();
  }

  function renderOverlay(){
    const octx = overlay.getContext('2d');
    const m = mask.getContext('2d').getImageData(0,0,1024,1024).data;
    overlay.width = overlay.height = 1024;
    octx.clearRect(0,0,1024,1024);
    // pink translucent mask
    const img=octx.createImageData(1024,1024);
    for(let i=0;i<m.length;i+=4){ img.data[i]=233; img.data[i+1]=120; img.data[i+2]=150; img.data[i+3]=m[i+3]?72:0; }
    octx.putImageData(img,0,0);
    // direction lines
    if(S.showDir){
      const ang=(S.dirAngle||45)*Math.PI/180; octx.save(); octx.globalAlpha=.15; octx.strokeStyle='#000';
      for(let t=-1024;t<=1024;t+=32){
        octx.beginPath();
        const x0=512+Math.cos(ang)*-1200 - Math.sin(ang)*t;
        const y0=512+Math.sin(ang)*-1200 + Math.cos(ang)*t;
        const x1=512+Math.cos(ang)* 1200 - Math.sin(ang)*t;
        const y1=512+Math.sin(ang)* 1200 + Math.cos(ang)*t;
        octx.moveTo(x0,y0); octx.lineTo(x1,y1); octx.stroke();
      }
      octx.restore();
    }
    drawCurvedText(octx);
  }

  function renderStitches(){
    sctx.clearRect(0,0,1024,1024);
    if(!document.getElementById('toggle-stitch').checked) return;
    const res = S.stitchPaths || [];
    if(!res.length) return;
    const pal = S.palette || [[0,0,0]];
    const keep = S.keepColors || new Set(pal.map((_,i)=>i));
    const src = S.srcData ? S.srcData.data : null;

    function nearestIndex(x,y){
      if(!src||!pal.length) return 0;
      const i=((y|0)*1024+(x|0))<<2; const r=src[i],g=src[i+1],b=src[i+2];
      let bi=0,bd=1e9; for(let j=0;j<pal.length;j++){ const c=pal[j]; const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} }
      return bi;
    }

    for(const seg of res){
      if(seg.length<2) continue;
      const idx = nearestIndex(seg[0][0],seg[0][1]);
      if(!keep.has(idx)) continue;
      const c = pal[idx]; sctx.strokeStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
      sctx.lineWidth=1; sctx.beginPath(); sctx.moveTo(seg[0][0],seg[0][1]);
      for(let i=1;i<seg.length;i++) sctx.lineTo(seg[i][0],seg[i][1]);
      sctx.stroke();
    }
  }

  function render(){ renderOverlay(); renderStitches(); }
  window.EAS_preview = { render };
})();