// hatch generator + exports (PNG/SVG/JSON/DST) + zoom transform
(function(){
  const S = (window.EAS ||= {}).state ||= {};
  const base = document.getElementById('canvas');
  const mask = document.getElementById('mask');
  const overlay = document.getElementById('overlay');
  const octx = overlay.getContext('2d');
  overlay.width = overlay.height = 1024;

  function setShellTransform(){
    const shell = document.getElementById('shell');
    const z=S.zoom||1, x=S.panX||0, y=S.panY||0;
    shell.style.transform = `translate(${x}px,${y}px) scale(${z})`;
    window.EAS_preview.render();
  }

  // Hatch fill along angle over masked area
  function hatch(){
    const W=1024,H=1024;
    const m = mask.getContext('2d').getImageData(0,0,W,H).data;
    const spacing = 4; // px between rows
    const stitch = 2;  // px per stitch
    const ang = (S.dirAngle||45) * Math.PI/180;

    // direction overlay
    octx.clearRect(0,0,W,H);
    if(S.showDir){
      octx.save();
      octx.globalAlpha=0.15; octx.strokeStyle='#000';
      for(let t=-W; t<W*2; t+=32){
        octx.beginPath();
        for(let u=-100;u<110;u+=20){
          const x = 512 + Math.cos(ang)*t - Math.sin(ang)*u;
          const y = 512 + Math.sin(ang)*t + Math.cos(ang)*u;
          octx.moveTo(x-16*Math.cos(ang), y-16*Math.sin(ang));
          octx.lineTo(x+16*Math.cos(ang), y+16*Math.sin(ang));
        }
        octx.stroke();
      }
      octx.restore();
    }

    const paths=[];
    // parametric line sweep
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const px = -Math.sin(ang), py = Math.cos(ang);
    // project bbox to perpendicular axis
    const minT = -Math.ceil( (W*Math.abs(px)+H*Math.abs(py))/2 );
    const maxT = -minT;

    for(let t=minT; t<=maxT; t+=spacing){
      let on=false, seg=[];
      for(let s=-800; s<=800; s+=stitch){
        const x = 512 + nx*s + px*t;
        const y = 512 + ny*s + py*t;
        if(x<0||x>=W||y<0||y>=H) { if(on){ paths.push(seg); seg=[]; on=false; } continue; }
        const a = m[(x|0 + (y|0)*W)*4 + 3] > 0;
        if(a){
          seg.push([x,y]); on=true;
        }else if(on){
          paths.push(seg); seg=[]; on=false;
        }
      }
      if(seg.length) paths.push(seg);
    }

    S.stitches = paths.flat();
    return { paths, count: S.stitches.length };
  }

  // Exports
  function download(name, blob){
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function exportPNG(){
    const p=document.getElementById('preview');
    p.toBlob(b=>download('easbroidery.png', b), 'image/png');
  }

  function exportSVG(){
    const W=1024,H=1024;
    const { paths } = hatch();
    const segs = paths.map(seg=>{
      const d = seg.map((p,i)=> (i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('');
      return `<path d="${d}" fill="none" stroke="#000" stroke-width="0.4"/>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${segs}</svg>`;
    download('easbroidery.svg', new Blob([svg],{type:'image/svg+xml'}));
  }

  function exportJSON(){
    const data = { stitches: S.stitches||[], angle:S.dirAngle, pattern:S.dirPattern };
    download('easbroidery.json', new Blob([JSON.stringify(data)],{type:'application/json'}));
  }

  // Minimal DST writer (Tajima). Units ≈ 0.1 mm per px.
  function encodeRel(dx,dy, flags=0){
    // split into {-121..121}
    const out=[];
    while(Math.abs(dx)>121 || Math.abs(dy)>121){
      const sx = Math.max(-121, Math.min(121, dx));
      const sy = Math.max(-121, Math.min(121, dy));
      out.push(...encodeRel(sx,sy,flags)); dx-=sx; dy-=sy;
    }
    let b1=0, b2=0, b3=0x80; // bit7 must be 1
    const add=(v,posPlus,posMinus)=>{
      const abs=Math.abs(v), s=v>=0?1:-1;
      const use=(bit,val)=>{ if(s>0) b[posPlus]|=bit; else b[posMinus]|=bit; };
      const b=[null,b1,b1,b1,b1,b2,b2,b2,b2,b3,b3,b3,b3]; // placeholder
      const set=(P,bit)=>{ if(P===1) b1|=bit; else if(P===2) b2|=bit; else b3|=bit; };
      const apply=(unit, P, bit)=>{ const n = Math.floor((abs% (unit*3) )/unit); if(n>=1){ if(s>0) set(P,bit); else set(P,bit<<1); } };
    };
    // helper
    function bits(v, isX){
      let a=Math.abs(v), s=v>=0;
      const ap=(P,bit)=>{ if(P===1){ if(s) b1|=bit; else b1|=bit<<1; }
                           else if(P===2){ if(s) b2|=bit; else b2|=bit<<1; }
                           else { if(s) b3|=bit; else b3|=bit<<1; } };
      const use=(unit,P,bit)=>{ while(a>=unit){ ap(P,bit); a-=unit; } };
      use(81,3,1); use(27,2,16); use(9,2,1); use(3,1,16); use(1,1,1);
    }
    bits(dx,true); bits(dy,false);
    if(flags&1) b3 |= 0x20;       // color change
    if(flags&2) b3 |= 0x10;       // jump
    return [b1,b2,b3];
  }

  function exportDST(){
    const pts = (S.stitches && S.stitches.length? S.stitches : hatch().paths.flat());
    if(!pts.length){ alert('No stitches'); return; }
    // center
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    for(const [x,y] of pts){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2;
    const scaled = pts.map(([x,y])=>[x-cx, y-cy]); // px → 0.1mm (≈1px)

    const bytes=[];
    let px=0, py=0;
    for(const [x,y] of scaled){
      const dx=Math.round(x-px), dy=Math.round(y-py);
      bytes.push(...encodeRel(dx,dy,0));
      px+=dx; py+=dy;
    }
    // end code 0x00 0x00 0xF3
    bytes.push(0x00,0x00,0xF3);

    // 512‑byte header
    const header = new Uint8Array(512).fill(0x20);
    function w(line, off){ for(let i=0;i<line.length;i++) header[off+i]=line.charCodeAt(i); }
    const st = Math.floor(bytes.length/3);
    w(`LA:EASBROIDERY        `,0);
    w(`ST:${String(st).padStart(7,' ')}`,  0x0A);
    w(`CO: 1`,                 0x1C);
    w(`+X:${String(Math.round(maxx-cx)).padStart(5,' ')}`,0x24);
    w(`-X:${String(Math.round(cx-minx)).padStart(5,' ')}`,0x2E);
    w(`+Y:${String(Math.round(maxy-cy)).padStart(5,' ')}`,0x38);
    w(`-Y:${String(Math.round(cy-miny)).padStart(5,' ')}`,0x42);
    header[511]=0x1A;

    const out = new Uint8Array(512+bytes.length);
    out.set(header,0); out.set(bytes,512);
    download('easbroidery.dst', new Blob([out],{type:'application/octet-stream'}));
  }

  function generate(){ hatch(); window.EAS_preview.render(); }

  window.EAS_processing = {
    hatch, generate,
    exportPNG, exportSVG, exportJSON, exportDST,
    setShellTransform
  };
})();