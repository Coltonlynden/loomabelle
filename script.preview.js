/* Stitch preview + exports + hoop sizing */
const Hoop = {
  sizeMM:[130,180], // default 5x7
  setByKey(key){
    const [w,h]=key.split('x').map(Number);
    this.sizeMM=[w,h];
    drawPreviewHoop();
  }
};

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('hoopSelect').addEventListener('change', e=>{
    Hoop.setByKey(e.target.value);
  });
  document.getElementById('showDir').addEventListener('change', drawPreviewHoop);
  document.getElementById('angle').addEventListener('input', e=>{
    EditorState.directionAngle = +e.target.value; drawPreviewHoop();
  });

  document.getElementById('gen').onclick = generateStitches;
  document.getElementById('savePng').onclick = ()=>saveCanvas('preview','preview.png');
  document.getElementById('saveSvg').onclick = saveSVG;
  document.getElementById('saveJson').onclick = saveJSON;
  document.getElementById('saveDst').onclick = saveDST;

  Hoop.setByKey(document.getElementById('hoopSelect').value);
});

function drawPreviewHoop(){
  const c = document.getElementById('preview');
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  // background grid for scale feel
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='#ead4c8'; ctx.lineWidth=1;
  for(let x=0;x<c.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}
  for(let y=0;y<c.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke();}

  // mask preview underlay
  if (EditorState.bmp){
    const r = Proc.drawContain(ctx, EditorState.bmp);
    if (document.getElementById('showStitch').checked){
      // translucent to emphasize stitches
      ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.fillRect(0,0,c.width,c.height);
    }
  }

  // optional direction overlay
  if (document.getElementById('showDir').checked){
    ctx.save();
    ctx.globalAlpha=.2; ctx.strokeStyle='#333'; ctx.lineWidth=1;
    const ang = (EditorState.directionAngle||45)*Math.PI/180;
    const d = Math.cos(ang), e = Math.sin(ang);
    for(let t=-c.height;t<c.width+ c.height; t+=20){
      ctx.beginPath();
      ctx.moveTo(t,0); ctx.lineTo(t+e*c.height, d*c.height); ctx.stroke();
    }
    ctx.restore();
  }
}

async function generateStitches(){
  const c = document.getElementById('preview');
  const ctx = c.getContext('2d');
  drawPreviewHoop();

  if (!EditorState.mask){
    // no mask -> nothing to stitch
    return;
  }
  const mmSpacing = Math.max(0.6, +document.getElementById('spacing').value || 1.6);
  const pxPerMM = c.width / (Hoop.sizeMM[0] * 1.2); // add a safety margin
  const spacing = Math.max(1, Math.floor(pxPerMM*mmSpacing));
  const ang = (EditorState.directionAngle||45)*Math.PI/180;

  // simple hatch generator
  const w=c.width,h=c.height, m=EditorState.mask;
  const lines=[]; // array of point arrays
  const dirX=Math.cos(ang), dirY=Math.sin(ang);
  for(let y=-h;y<h;y+=spacing){
    const L=[];
    for(let x=-w;x<2*w;x+=2){
      // parametric line point
      const px=Math.floor(x), py=Math.floor(y + (x*dirY));
      // keep inside + masked
      if(px>=0&&py>=0&&px<w&&py<h && m[py*w+px]===255){
        L.push([px,py]);
      }else if (L.length){
        lines.push(L.slice()); L.length=0;
      }
    }
    if (L.length) lines.push(L);
  }

  // draw lines
  ctx.save(); ctx.strokeStyle='#333'; ctx.lineWidth=1;
  for(const seg of lines){
    ctx.beginPath();
    ctx.moveTo(seg[0][0], seg[0][1]);
    for(let i=1;i<seg.length;i++) ctx.lineTo(seg[i][0], seg[i][1]);
    ctx.stroke();
  }
  ctx.restore();

  // store for export
  window.__stitches = lines;
}

function saveCanvas(id, name){
  const url = document.getElementById(id).toDataURL('image/png');
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
}

function saveJSON(){
  const data = {points: window.__stitches||[]};
  const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stitches.json'; a.click();
  URL.revokeObjectURL(a.href);
}

function saveSVG(){
  const stitches = window.__stitches||[];
  const c = document.getElementById('preview');
  let d = '';
  for(const seg of stitches){
    d += 'M'+seg[0][0]+' '+seg[0][1];
    for(let i=1;i<seg.length;i++){ const p=seg[i]; d+=' L'+p[0]+' '+p[1]; }
    d += ' ';
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}">
    <path d="${d.trim()}" fill="none" stroke="#000" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
  const blob = new Blob([svg], {type:'image/svg+xml'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stitches.svg'; a.click();
  URL.revokeObjectURL(a.href);
}

// minimal DST writer (single color, running stitches)
function saveDST(){
  const stitches = window.__stitches||[];
  const pts=[];
  for(const seg of stitches) for(const p of seg) pts.push(p);

  if (!pts.length){ alert('Generate stitches first.'); return; }

  // normalize to DST coordinate space (0.1mm units, +/-121 step)
  const c = document.getElementById('preview');
  const widthMM = Hoop.sizeMM[0];
  const pxPerMM = c.width / widthMM;
  const scale = 10/pxPerMM; // px -> 0.1mm

  function clamp7(v){ return Math.max(-121, Math.min(121, v|0)); }

  let x0=pts[0][0], y0=pts[0][1];
  const bytes=[];
  for(const [x,y] of pts){
    let dx = clamp7((x-x0)*scale);
    let dy = clamp7((y-y0)*scale);
    x0 = x0 + dx/scale; y0 = y0 + dy/scale;
    // encode 3-byte DST stitch
    const b1 = ((dx & 0x1F)      ) |
               ((dx & 0x20)?0x20:0) |
               ((dy & 0x01)?0x80:0) |
               ((dy & 0x02)?0x01:0);
    const b2 = ((dy & 0x1C)<<3) |
               ((dx & 0x40)?0x04:0) |
               ((dy & 0x20)?0x08:0) |
               ((dx & 0x02)?0x80:0);
    const b3 = ((dx & 0x04)?0x20:0) |
               ((dy & 0x40)?0x02:0) |
               0x03; // normal stitch
    bytes.push(b1&0xFF,b2&0xFF,b3&0xFF);
  }
  // header
  const header = `LA:EASBROIDERY;ST:${(bytes.length/3)|0};CO:1;+X:000;+Y:000;-X:000;-Y:000;AX:+000;AY:+000;MX:000;MY:000;PD:**********;\r`;
  const pad = new Uint8Array(512); // Tajima header size
  for(let i=0;i<header.length&&i<512;i++) pad[i]=header.charCodeAt(i);
  const data = new Uint8Array(pad.length + bytes.length + 3);
  data.set(pad,0); data.set(bytes,512);
  data.set([0x00,0x00,0xF3], pad.length+bytes.length); // END

  const blob = new Blob([data], {type:'application/octet-stream'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stitches.dst'; a.click();
  URL.revokeObjectURL(a.href);
}