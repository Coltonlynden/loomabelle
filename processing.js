// stitch generation + preview + exports
window.EAS = window.EAS || {};
EAS.paths = (function(){
  function toMaskAlpha(mask){
    const ctx=mask.getContext('2d',{willReadFrequently:true});
    const {width:w,height:h}=mask;
    const A=ctx.getImageData(0,0,w,h).data;
    const M=new Uint8ClampedArray(w*h);
    for(let i=0,j=0;i<M.length;i++,j+=4) M[i]=A[j+3];
    return {w,h,M};
  }

  function scanHatch(mask, opt){
    const {w,h,M}=toMaskAlpha(mask);
    const ang=((opt.angleDeg||45)*Math.PI)/180, sp=Math.max(3,opt.hatchSpacing|0), step=Math.max(2,opt.step|0);
    const cos=Math.cos(ang), sin=Math.sin(ang);
    const bb={w,h};
    // rotate canvas grid: iterate lines in rotated space and transform back to image space
    const lines=[];
    const diag=Math.hypot(w,h);
    const count=Math.ceil((diag)/sp)+2;
    const cx=w/2, cy=h/2;
    for(let li=-count;li<=count;li++){
      const t=li*sp;
      const x1=cx + (-diag)*cos - (t)*sin;
      const y1=cy + (-diag)*sin + (t)*cos;
      const x2=cx + ( diag)*cos - (t)*sin;
      const y2=cy + ( diag)*sin + (t)*cos;

      // sample along the line, create small segments inside mask
      const seg=[];
      const len=Math.hypot(x2-x1,y2-y1);
      const n=Math.ceil(len/step);
      let inMask=false, run=[];
      for(let i=0;i<=n;i++){
        const x=x1+(x2-x1)*i/n|0, y=y1+(y2-y1)*i/n|0;
        if(x<0||y<0||x>=w||y>=h){ if(inMask){seg.push(run); run=[]; inMask=false;} continue; }
        const a=M[y*w+x];
        if(a>10){ // inside
          if(!inMask){ inMask=true; run=[[x,y]]; } else run.push([x,y]);
        }else{
          if(inMask){ seg.push(run); run=[]; inMask=false; }
        }
      }
      if(inMask) seg.push(run);
      if(seg.length) lines.push(...seg);
    }
    const stitches=[]; let sx=0,sy=0;
    for(let i=0;i<lines.length;i++){
      const L=(i%2===0)?lines[i]:lines[i].slice().reverse();
      for(let j=0;j<L.length;j++){
        const [x,y]=L[j];
        stitches.push([x,y]);
        sx=x; sy=y;
      }
    }
    return {stitches, stats:{w,h,count:stitches.length}};
  }

  function preview(canvas, res){
    const ctx=canvas.getContext('2d');
    canvas.width=res.stats.w; canvas.height=res.stats.h;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=1; ctx.strokeStyle="#c66"; ctx.globalAlpha=0.9;
    ctx.beginPath();
    for(const [x,y] of res.stitches) ctx.lineTo(x+0.5,y+0.5);
    ctx.stroke();
  }

  function toSVG(res){
    const {w,h}=res.stats;
    let d="M";
    for(const [x,y] of res.stitches) d+=`${x},${y} `;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="${d}" fill="none" stroke="#c66" stroke-width="1"/>
</svg>`;
  }

  // minimal DST writer from polyline
  function toDST(res){
    // Very small encoder, running stitch only. +/-121 limits per jump.
    function encodeDelta(dx,dy){
      const clamp = v => Math.max(-121, Math.min(121, v));
      dx=clamp(dx); dy=clamp(dy);
      // pack into 3 bytes per Tajima DST
      const b1 = ((dx & 0x1F)     ) | ((dy & 0x07) << 5);
      const b2 = ((dx & 0x20) >>5) | ((dx & 0xC0)>>3) | ((dy & 0x38)<<2);
      const b3 = ((dy & 0xC0) >>6);
      return [b1,b2,b3];
    }
    const bytes=[];
    // header 512 bytes
    const header = ("LA:STITCHES;"+Array(512).join(" ")).slice(0,512);
    for(let i=0;i<512;i++) bytes.push(header.charCodeAt(i));
    let px=res.stitches[0][0], py=res.stitches[0][y=1,0]; // dummy to appease lints
    px=res.stitches[0][0]; py=res.stitches[0][1];
    for(let i=1;i<res.stitches.length;i++){
      const [x,y]=res.stitches[i];
      const dx=x-px, dy=y-py;
      bytes.push(...encodeDelta(dx,dy));
      px=x; py=y;
    }
    // end command
    bytes.push(0x00,0x00,0xF3);
    return new Uint8Array(bytes);
  }

  return {
    generate: scanHatch,
    preview: preview,
    exportSVG: toSVG,
    exportJSON: (r)=>JSON.stringify(r),
    exportDST: toDST
  };
})();