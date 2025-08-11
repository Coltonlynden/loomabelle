/* -------------------------------------------------------
   Minimal Tajima .DST writer
   - stitches: [{x,y,jump,color}, ...] in millimeters, origin at center
   - hoopMM: {w,h}
   Notes:
   * DST stores relative moves in 0.1mm units using bit fields for
     ±1, ±3, ±9, ±27, ±81. We clamp to that range per step.
   ----------------------------------------------------- */
export function writeDST(stitches, hoopMM){
  // Build relative moves with small steps if needed
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
  putText('AX:+000', 0x3C);
  putText('AY:+000', 0x41);
  putText('MX:+000', 0x46);
  putText('MY:+000', 0x4B);
  putText('PD:******', 0x50);
  // fill rest with spaces
  for(let i=0;i<header.length;i++) if(header[i]===0) header[i]=0x20;

  // Encode stitches
  let prev = {x:0,y:0};
  for(const s of stitches){
    const dxMM = s.x - prev.x;
    const dyMM = s.y - prev.y;
    // Split into small steps so each relative fits range
    const step = 7; // mm per chunk to be safe
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
  // End command (0xF3, 0x00, 0x00)
  bytes.push(0xF3, 0x00, 0x00);

  // Concat header + bytes
  const out = new Uint8Array(header.length + bytes.length);
  out.set(header,0); out.set(bytes, header.length);
  return out;
}

function pad5(n){ const s=String(n); return s.length>5? s.slice(-5) : s.padStart(5,' '); }
function colorBlocks(stitches){
  let blocks=0, last=null;
  for(const s of stitches){
    if(last===null || s.color!==last){ blocks++; last=s.color; }
  }
  return blocks;
}

// Encode relative move to 3 bytes using DST bit fields
function encodeRel(dx, dy, type){
  // Clamp to [-121,121]
  dx = Math.max(-121, Math.min(121, dx));
  dy = Math.max(-121, Math.min(121, dy));
  // Bits for ±1, ±3, ±9, ±27, ±81
  const flags = [1,3,9,27,81];
  const b = [0,0,0];

  function setBit(byteIndex, bit){ b[byteIndex] |= (1<<bit); }
  function putAxis(val, isX){
    let v = Math.abs(val);
    for(let i=flags.length-1;i>=0;i--){
      if(v>=flags[i]){ v-=flags[i]; setPattern(flags[i], val<0, isX); }
    }
  }
  function setPattern(mag, neg, isX){
    // mapping per DST spec
    const map = {
      1:  {x:[0,5], y:[1,5]},
      3:  {x:[0,7], y:[1,7]},
      9:  {x:[0,6], y:[1,6]},
      27: {x:[1,2], y:[1,3]},
      81: {x:[2,2], y:[2,3]},
    };
    const p = map[mag][isX?'x':'y'];
    // pos uses bit as is; neg toggles sign bits (4 for x, 4 for y within same byte set)
    setBit(p[0], p[1]);
    if(neg){ setBit(p[0], 4); } // sign bit
  }

  putAxis(dx, true);
  putAxis(dy, false);

  // Jump command sets bit 2 of byte 2; normal stitch keeps clear
  if(type==='JUMP'){ b[2] |= 0x20; }
  return b;
}

function calcExtents(stitches){
  let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
  let x=0,y=0;
  for(const s of stitches){
    x=s.x; y=s.y;
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
  }
  return {minX,maxX,minY,maxY};
}
