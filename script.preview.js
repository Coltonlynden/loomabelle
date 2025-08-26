/* Stitch preview + exports. Pure client-side, no servers. */

import { getCurrentLayers } from './script.draw.js';

const cPrev = document.getElementById('previewCanvas');
const ctxPrev = cPrev.getContext('2d');
const showPreview = document.getElementById('showPreview');
const genBtn = document.getElementById('genBtn');
const pngBtn = document.getElementById('pngBtn');
const svgBtn = document.getElementById('svgBtn');
const jsonBtn = document.getElementById('jsonBtn');
const dstBtn = document.getElementById('dstBtn');

let previewData = null;

function fit() {
  const w = document.getElementById('previewWrap').clientWidth;
  const h = document.getElementById('previewWrap').clientHeight;
  cPrev.width = w; cPrev.height = h;
  if (previewData) drawPreview(previewData);
}
window.addEventListener('resize', fit);
fit();

/* ---------- generate stitches ---------- */
genBtn.addEventListener('click', ()=>{
  const { baseCanvas, maskCanvas, textCanvas, dir, hoop } = getCurrentLayers();
  if(!baseCanvas.width) return;

  // composite masked base + text to a working bitmap
  const off = new OffscreenCanvas(baseCanvas.width, baseCanvas.height);
  const cx = off.getContext('2d');
  cx.drawImage(baseCanvas,0,0);
  cx.globalCompositeOperation='destination-in';
  cx.drawImage(maskCanvas,0,0);
  cx.globalCompositeOperation='source-over';
  cx.drawImage(textCanvas,0,0);

  // color quantization to thread palette (8 colors by default)
  const quant = quantizeCanvas(off, 8);

  // raster-to-stitch: simple running fill with direction
  const stitches = rasterToStitches(quant, dir);

  previewData = { img: quant, stitches, hoop };
  drawPreview(previewData);
});

function drawPreview(data){
  ctxPrev.clearRect(0,0,cPrev.width,cPrev.height);
  if(!showPreview.checked) return;

  // draw hoop
  const pad=12, W=cPrev.width, H=cPrev.height;
  const sel = data.hoop.select.split('x').map(Number);
  const arCanvas = W/H, arHoop = sel[0]/sel[1];
  let rx = (W-pad*2)/2, ry=(H-pad*2)/2;
  if(arHoop > arCanvas){ ry = rx/arHoop; } else { rx = ry*arHoop; }
  rx *= data.hoop.scale; ry *= data.hoop.scale;

  ctxPrev.save(); ctxPrev.translate(W/2,H/2);
  ctxPrev.lineWidth = 8; ctxPrev.strokeStyle='rgba(201,155,75,.95)';
  ctxPrev.beginPath(); ctxPrev.ellipse(0,0,rx+8,ry+8,0,0,Math.PI*2); ctxPrev.stroke();
  ctxPrev.lineWidth = 4; ctxPrev.strokeStyle='rgba(238,208,140,1)';
  ctxPrev.beginPath(); ctxPrev.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctxPrev.stroke();

  // fit image inside inner ring
  const iw = data.img.width, ih = data.img.height;
  const sc = Math.min((rx*2)/iw, (ry*2)/ih);
  ctxPrev.drawImage(data.img, -iw*sc/2, -ih*sc/2, iw*sc, ih*sc);

  // stitch vectors
  ctxPrev.lineWidth = 1; ctxPrev.strokeStyle='rgba(80,80,80,.9)';
  ctxPrev.beginPath();
  for(const s of data.stitches){ ctxPrev.moveTo(s.x0*sc-iw*sc/2, s.y0*sc-ih*sc/2); ctxPrev.lineTo(s.x1*sc-iw*sc/2, s.y1*sc-ih*sc/2); }
  ctxPrev.stroke();
  ctxPrev.restore();
}

/* ---------- exports ---------- */
pngBtn.onclick = ()=> downloadCanvasAsPNG(cPrev, 'preview.png');
svgBtn.onclick = ()=> downloadAsSVG(previewData, 'preview.svg');
jsonBtn.onclick = ()=> downloadJSON(previewData?.stitches || [], 'stitches.json');
dstBtn.onclick = ()=> downloadDST(previewData?.stitches || [], 'design.dst');

/* ---------- utilities ---------- */
function quantizeCanvas(off, k){
  const cx = off.getContext('2d');
  const {width:w,height:h} = off;
  const img = cx.getImageData(0,0,w,h);
  const pal = kmeansPalette(img.data, k);
  const out = new OffscreenCanvas(w,h);
  const co = out.getContext('2d');
  const arr = co.createImageData(w,h);
  for(let i=0;i<w*h;i++){
    const r=img.data[i*4], g=img.data[i*4+1], b=img.data[i*4+2], a=img.data[i*4+3];
    if(a<4){ arr.data[i*4+3]=0; continue; }
    const c = nearest(pal, r,g,b);
    arr.data[i*4]=c[0]; arr.data[i*4+1]=c[1]; arr.data[i*4+2]=c[2]; arr.data[i*4+3]=255;
  }
  co.putImageData(arr,0,0);
  return out.transferToImageBitmap ? out.transferToImageBitmap() : out;
}

function rasterToStitches(bmp, dir){
  // read bitmap to binary coverage map
  const cvs = new OffscreenCanvas(bmp.width, bmp.height), cx=cvs.getContext('2d');
  cx.drawImage(bmp,0,0);
  const img = cx.getImageData(0,0,cvs.width,cvs.height).data;
  const cov = new Uint8Array(cvs.width*cvs.height);
  for(let i=0;i<cov.length;i++){ cov[i] = img[i*4+3]>0 ? 1 : 0; }

  // direction
  const theta = (dir.angle*Math.PI)/180;
  const dx = Math.cos(theta), dy = Math.sin(theta);

  // simple hatch lines every 3 px
  const step = 3, stitches=[];
  for(let y=-cvs.height; y<cvs.height*2; y+=step){
    let x0=0,y0=0, has=false;
    for(let x=-cvs.width; x<cvs.width*2; x+=1){
      const px = Math.round(x*dx - y*dy);
      const py = Math.round(x*dy + y*dx);
      if(px<0||py<0||px>=cvs.width||py>=cvs.height) { if(has){ has=false; } continue; }
      const on = cov[py*cvs.width+px];
      if(on && !has){ has=true; x0=px; y0=py; }
      else if(!on && has){ has=false; stitches.push({x0, y0, x1:px, y1:py}); }
    }
    if(has) stitches.push({x0,y0,x1:cvs.width-1,y1:cvs.height-1});
  }
  return stitches;
}

/* palettes */
function kmeansPalette(data, k){
  // init with spread
  const C=[]; for(let i=0;i<k;i++){ C.push([Math.random()*255,Math.random()*255,Math.random()*255]); }
  for(let it=0; it<6; it++){
    const S=Array.from({length:k},()=>[0,0,0,0]);
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<16) continue;
      const r=data[i],g=data[i+1],b=data[i+2]; let bi=0, bd=1e9;
      for(let j=0;j<k;j++){ const c=C[j]; const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} }
      const s=S[bi]; s[0]+=r; s[1]+=g; s[2]+=b; s[3]++;
    }
    for(let j=0;j<k;j++){ const s=S[j]; if(s[3]>0){ C[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]]; }
    }
  }
  return C;
}
function nearest(pal, r,g,b){
  let bi=0,bd=1e9;
  for(let j=0;j<pal.length;j++){ const c=pal[j]; const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2; if(d<bd){bd=d;bi=j;} }
  return pal[bi];
}

/* downloads */
function downloadCanvasAsPNG(c, name){
  const a=document.createElement('a'); a.download=name; a.href=c.toDataURL('image/png'); a.click();
}
function downloadJSON(obj, name){
  const a=document.createElement('a'); a.download=name; a.href='data:application/json,'+encodeURIComponent(JSON.stringify(obj)); a.click();
}
function downloadAsSVG(data, name){
  if(!data) return;
  const {width:W,height:H}=cPrev;
  let path='';
  for(const s of data.stitches){ path+=`M${s.x0},${s.y0} L${s.x1},${s.y1} `; }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${path}" stroke="#333" stroke-width="1" fill="none"/></svg>`;
  const a=document.createElement('a'); a.download=name; a.href='data:image/svg+xml,'+encodeURIComponent(svg); a.click();
}
function downloadDST(stitches, name){
  // minimal DST mock (stitch list to CSV-like text for now). Replace with a full encoder later.
  let out = 'x0,y0,x1,y1\n';
  for(const s of stitches) out += `${s.x0},${s.y0},${s.x1},${s.y1}\n`;
  const a=document.createElement('a'); a.download=name; a.href='data:text/plain,'+encodeURIComponent(out); a.click();
}