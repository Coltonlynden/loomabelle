import { clamp } from './utils.js';
export function autoTraceToStitches(labels, w, h, outW, outH){
  const stitches=[]; const scale=Math.min(outW/w, outH/h)*0.9;
  const ox=(outW-w*scale)/2, oy=(outH-h*scale)/2; let first=true;
  for(let y=1;y<h;y++){ for(let x=1;x<w;x++){ const i=y*w+x;
    if(labels[i]!==labels[i-1] || labels[i]!==labels[i-w]){ const px=ox+x*scale, py=oy+y*scale;
      stitches.push({cmd:first?'jump':'stitch', x:px, y:py}); first=false; } } }
  return stitches;
}
export function traceCanvasAlphaToStitches(STATE, stepMm=2.5){
  const { draw, prev } = STATE.canvases;
  const w=draw.width, h=draw.height; const x=draw.getContext('2d');
  const id=x.getImageData(0,0,w,h), d=id.data; const labels=new Uint8Array(w*h);
  for(let i=0;i<labels.length;i++) labels[i]=d[i*4+3]>0?1:0;
  STATE.stitches = autoTraceToStitches(labels, w, h, prev.width, prev.height);
}