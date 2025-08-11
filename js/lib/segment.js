import { log, logError, cvReady } from './ui.js';

// Improved GrabCut with edge box + optional painted mask
export async function autoSubjectMaskGrabCut(workCanvas, userMask){
  const W=workCanvas.width,H=workCanvas.height; if(!W) return null;
  await cvReady();
  try{
    const rgba = cv.imread(workCanvas);
    const rgb  = new cv.Mat(); cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    const sm   = new cv.Mat(); cv.bilateralFilter(rgb, sm, 7, 75, 75);

    const mask = new cv.Mat.zeros(H, W, cv.CV_8U);
    const edges = new cv.Mat(); cv.Canny(sm, edges, 50, 150);
    let minx=W, miny=H, maxx=0, maxy=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      if (edges.ucharPtr(y,x)[0]>0){ if (x<minx) minx=x; if (y<miny) miny=y; if (x>maxx) maxx=x; if (y>maxy) maxy=y; }
    }
    if (maxx-minx<10 || maxy-miny<10){ minx=W*0.15|0; miny=H*0.15|0; maxx=W*0.85|0; maxy=H*0.85|0; }
    const rect = new cv.Rect(Math.max(0,minx-10), Math.max(0,miny-10), Math.min(W-1,maxx+10)-Math.max(0,minx-10), Math.min(H-1,maxy+10)-Math.max(0,miny-10));
    const bgd = new cv.Mat(), fgd = new cv.Mat();

    const painted = !!(userMask && userMask.some(v=>v));
    if (painted){
      for (let y=0;y<H;y++) for (let x=0;x<W;x++)
        if (userMask[y*W+x]) mask.ucharPtr(y,x)[0] = cv.GC_FGD;
    }
    cv.grabCut(sm, mask, rect, bgd, fgd, 3, painted ? cv.GC_INIT_WITH_MASK : cv.GC_INIT_WITH_RECT);

    const out = new Uint8Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const v = mask.ucharPtr(y,x)[0];
      out[y*W+x] = (v===cv.GC_FGD || v===cv.GC_PR_FGD) ? 1 : 0;
    }
    rgba.delete(); rgb.delete(); sm.delete(); edges.delete(); mask.delete(); bgd.delete(); fgd.delete();
    return out;
  }catch(err){
    logError(err,'GRABCUT');
    const all=new Uint8Array(W*H); all.fill(1); return all;
  }
}

// Optional on-device AI subject picker (TF.js + DeepLab)
let deeplabModel = null;
async function loadDeeplab(){
  if (deeplabModel) return deeplabModel;
  log('Loading AI model (first use)…');
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@tensorflow-models/deeplab@1.4.0/dist/deeplab.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  // smaller backbone
  // @ts-ignore
  deeplabModel = await deeplab.load({base:'mobilenetv2', quantizationBytes:2});
  log('TF.js + DeepLab loaded');
  return deeplabModel;
}
export async function segmentWithDeeplab(canvas){
  const model = await loadDeeplab();
  const tmp = document.createElement('canvas');
  const s = Math.min(513/Math.max(canvas.width,canvas.height), 1);
  tmp.width = Math.max(1, Math.round(canvas.width*s));
  tmp.height = Math.max(1, Math.round(canvas.height*s));
  tmp.getContext('2d').drawImage(canvas,0,0,tmp.width,tmp.height);
  const {segmentationMap} = await model.segment(tmp);
  const W=canvas.width,H=canvas.height;
  const up = new Uint8Array(W*H);
  for (let y=0;y<H;y++){
    const yy = Math.min(tmp.height-1, Math.round(y*s));
    for (let x=0;x<W;x++){
      const xx = Math.min(tmp.width-1, Math.round(x*s));
      const cls = segmentationMap[yy*tmp.width+xx];
      up[y*W+x] = (cls!==0) ? 1 : 0; // non‑background
    }
  }
  return up;
}
