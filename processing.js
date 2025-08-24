// Hatching + exports + zoom transform (color-aware, mask driven)
(function () {
  const S = (window.EAS ||= {}).state ||= {};
  const mask = document.getElementById('mask');

  function setShellTransform(){
    const shell=document.getElementById('shell');
    const z=S.zoom||1, x=S.panX||0, y=S.panY||0;
    shell.style.transform=`translate(${x}px,${y}px) scale(${z})`;
    window.EAS_preview.render();
  }

  // line-fill hatch using mask alpha; returns segments
  function hatch(){
    const W=1024,H=1024;
    const m = mask.getContext('2d').getImageData(0,0,W,H).data;
    const spacing=4, step=2, ang=(S.dirAngle||45)*Math.PI/180;
    const nx=Math.cos(ang), ny=Math.sin(ang), px=-Math.sin(ang), py=Math.cos(ang);
    const bound = Math.ceil((W*Math.abs(px)+H*Math.abs(py))/2);
    const paths=[];

    for(let t=-bound; t<=bound; t+=spacing){
      let on=false, seg=[];
      for(let s=-900; s<=900; s+=step){
        const x=512+nx*s+px*t, y=512+ny*s+py*t;
        if(x<0||x>=W||y<0||y>=H){ if(on){paths.push(seg); seg=[]; on=false;} continue; }
        const a = m[((y|0)*W+(x|0))*4+3] > 0;  // inside mask
        if(a){ seg.push([x,y]); on=true; }
        else if(on){ paths.push(seg); seg=[]; on=false; }
      }
      if(seg.length) paths.push(seg);
    }
    S.stitches = paths.flat();
    return { paths, count:S.stitches.length };
  }

  function download(name,blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),800); }

  function exportPNG(){ document.getElementById('stitchvis').toBlob(b=>download('easbroidery.png',b),'image/png'); }
  function exportSVG(){
    const {paths}=hatch();
    const segs=paths.map(seg=>`<path d="${seg.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('')}" fill="none" stroke="#000" stroke-width="0.4"/>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${segs}</svg>`;
    download('easbroidery.svg',new Blob([svg],{type:'image/svg+xml'}));
  }
  function exportJSON(){ download('easbroidery.json',new Blob([JSON.stringify({stitches:S.stitches||[],angle:S.dirAngle,colors:[...(S.keepColors||[]) ]})],{type:'application/json'})); }

  // minimal DST encoder
  function exportDST(){
    const pts=(S.stitches&&S.stitches.length?S.stitches:hatch().paths.flat()); if(!pts.length){alert('No stitches');return;}
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9; for(const [x,y] of pts){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2;
    const bytes=[]; let px=0,py=0;
    function enc(dx,dy,flags=0){
      while(Math.abs(dx)>121||Math.abs(dy)>121){ const sx=Math.max(-121,Math.min(121,dx)); const sy=Math.max(-121,Math.min(121,dy)); enc(sx,sy,flags); dx-=sx; dy-=sy; }
      let b1=0,b2=0,b3=0x80;
      function bits(v){ let a=Math.abs(v),s=v>=0;
        const set=(P,bit)=>{ if(P===1){ b1|=s?bit:bit<<1; } else if(P===2){ b2|=s?bit:bit<<1; } else { b3|=s?bit:bit<<1; } };
        const use=(unit,P,bit)=>{ while(a>=unit){ set(P,bit); a-=unit; } };
        use(81,3,1); use(27,2,16); use(9,2,1); use(3,1,16); use(1,1,1);
      }
      bits(dx); bits(dy);
      if(flags&1) b3|=0x20; if(flags&2) b3|=0x10;
      bytes.push(b1,b2,b3);
    }
    for(const [x,y] of pts){ const dx=Math.round(x-cx-px), dy=Math.round(y-cy-py); enc(dx,dy); px+=dx; py+=dy; }
    bytes.push(0x00,0x00,0xF3);
    const header=new Uint8Array(512).fill(0x20); header[511]=0x1A;
    const out=new Uint8Array(512+bytes.length); out.set(header,0); out.set(bytes,512);
    download('easbroidery.dst',new Blob([out],{type:'application/octet-stream'}));
  }

  function generate(){ hatch(); window.EAS_preview.render(); }

  window.EAS_processing = { hatch, generate, exportPNG, exportSVG, exportJSON, exportDST, setShellTransform };
})();