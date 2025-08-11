/* -------------------------------------------------------
   Minimal Tajima .DST writer
   - stitches: [{x,y,jump,color}, ...] in millimeters, origin at center
   - hoopMM: {w,h}
   Options:
     {insertColorStops:true} — insert color-change commands between color blocks
   ----------------------------------------------------- */
export function writeDST(stitches, hoopMM, opts={}){
  const insertColorStops = !!opts.insertColorStops;
  const unitsPerMM = 10; // 0.1mm units
  const bytes = [];

  // Header (512 bytes ASCII)
  const header = new Uint8Array(512);
  function putText(s, off){ for(let i=0;i<s.length && off+i<header.length;i++) header[off+i]=s.charCodeAt(i); }
  const extents = calcExtents(stitches);
  putText('LA:LOOMABELLE', 0);
  putText(`ST:${String(stitches.length).padStart(7,' ')}`, 0x0E);
  putText(`CO:${String(Math.max(1, colorBlocks(stitches))).padStart(3,' ')}`, 0x20);
  putText(`+X:${pad5(Math.round(extents.maxX*unitsPerMM))}`, 0x24);
  putText(`-X:${pad5(Math.round(Math.abs(extents.minX*unitsPerMM)))}`, 0x2A);
  putText(`+Y:${pad5(Math.round(extents.maxY*unitsPerMM))}`, 0x30);
  putText(`-Y:${pad5(Math.round(Math.abs(extents.minY*unitsPerMM)))}`, 0x36);
  putText('AX:+000', 0x3C); putText('AY:+000', 0x41);
  putText('MX:+000', 0x46); putText('MY:+000', 0x4B);
  putText('PD:******', 0x50);
  for(let i=0;i<header.length;i++) if(header[i]===0) header[i]=0x20;

  // Encode stitches with color-change stops
  let prev = {x:0,y:0}, lastColor = stitches.length ? stitches[0].color : 0;
  for(let si=0; si<stitches.length; si++){
    const s = stitches[si];

    // insert color-change when color index changes
    if(insertColorStops && s.color !== lastColor){
      bytes.push(0xF1, 0x00, 0x00); // widely used DST color change code
      lastColor = s.color;
    }

    const dxMM = s.x - prev.x;
    const dyMM = s.y - prev.y;

    // Break into smaller steps
    const step = 7; // mm
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dxMM), Math.abs(dyMM))/step));
    const ddx = dxMM/steps, ddy = dyMM/steps;

    for(let k=0;k<steps;k++){
      const dx = Math.round(ddx*unitsPerMM);
      const dy = Math.round(ddy*unitsPerMM);
      const triple = encodeRel(dx, dy, s.jump && k===0 ? 'JUMP' : 'STITCH');
      bytes.push(triple[0], triple[1], triple[2]);
    }
    prev = {x:s.x, y:s.y};
  }

  // End command
  bytes.push(0xF3, 0x00, 0x00);

  const out = new Uint8Array(header.length + bytes.length);
  out.set(header,0); out.set(bytes, header.length);
  return out;
}

function pad5(n){ const s=String(n); return s.length>5? s.slice(-5) : s.padStart(5,' '); }
function colorBlocks(stitches){
  let blocks=0, last=null;
  for(const s of stitches){ if(last===null || s.color!==last){ blocks++; last=s.color; } }
  return blocks || 1;
}

// Encode relative move → 3 bytes using DST bit fields
function encodeRel(dx, dy, type){
  dx = Math.max(-121, Math.min(121, dx));
  dy = Math.max(-121, Math.min(121, dy));
  const b = [0,0,0];

  // Bit patterns (per common DST mapping)
  function set(bit, byte){ b[byte] |= (1<<bit); }
  function emitAxis(val, axis){ // axis: 'x' | 'y'
    const neg = val<0; let v = Math.abs(val);
    const mags = [81,27,9,3,1];
    const map = {
      'x': {81:[2,2], 27:[1,2], 9:[0,6], 3:[0,7], 1:[0,5], sign:[2,4]},
      'y': {81:[2,3], 27:[1,3], 9:[1,6], 3:[1,7], 1:[1,5], sign:[2,5]}
    };
    for(const m of mags){ if(v>=m){ v-=m; const [byte,bit]=map[axis][m]; set(bit,byte); } }
    if(neg){ const [byte,bit]=map[axis].sign; set(bit,byte); }
  }
  emitAxis(dx,'x'); emitAxis(dy,'y');

  // Jump flag (bit 5 of third byte commonly used)
  if(type==='JUMP'){ b[2] |= 0x20; }
  return b;
}

function calcExtents(stitches){
  let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
  for(const s of stitches){
    if(s.x<minX)minX=s.x; if(s.x>maxX)maxX=s.x;
    if(s.y<minY)minY=s.y; if(s.y>maxY)maxY=s.y;
  }
  return {minX,maxX,minY,maxY};
}