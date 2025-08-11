// js/lib/preprocess.js
import { log } from './ui.js';

export function preprocessForQuantize(srcCanvas){
  const W = srcCanvas.width, H = srcCanvas.height;
  const out = document.createElement('canvas'); out.width=W; out.height=H;

  const ua = navigator.userAgent || '';
  const isIOS = /\b(iPhone|iPad|iPod)\b/i.test(ua);
  const isSafari = /\bSafari\b/i.test(ua) && !/\bChrome\b/i.test(ua);

  try{
    if (!cv || !cv.Mat) throw new Error('OpenCV not ready');

    // Safer path for iOS Safari: bilateral + HSV(V) equalize
    if (isIOS && isSafari) {
      const mRGBA = cv.imread(srcCanvas);
      const mBGR  = new cv.Mat(); cv.cvtColor(mRGBA, mBGR, cv.COLOR_RGBA2BGR);
      const sm = new cv.Mat(); cv.bilateralFilter(mBGR, sm, 7, 55, 55);
      const hsv = new cv.Mat(); cv.cvtColor(sm, hsv, cv.COLOR_BGR2HSV);
      const chans = new cv.MatVector(); cv.split(hsv, chans);
      const v = chans.get(2); const vEq = new cv.Mat(); cv.equalizeHist(v, vEq); chans.set(2, vEq);
      cv.merge(chans, hsv);
      const mOut = new cv.Mat(); cv.cvtColor(hsv, mOut, cv.COLOR_HSV2RGBA);

      // Mild unsharp mask for detail
      const sharp = new cv.Mat(); const blur = new cv.Mat();
      cv.GaussianBlur(mOut, blur, new cv.Size(0,0), 1.0, 1.0, cv.BORDER_DEFAULT);
      cv.addWeighted(mOut, 1.25, blur, -0.25, 0, sharp);

      cv.imshow(out, sharp);
      [mRGBA,mBGR,sm,hsv,chans,v,vEq,mOut,sharp,blur].forEach(m=>m.delete());
      log('Preprocess: iOS-safe + unsharp');
      return out;
    }

    // Desktop: CLAHE on L*a*b* + unsharp
    if (!cv.CLAHE || !cv.Size) throw new Error('CLAHE not available');
    const mRGBA = cv.imread(srcCanvas);
    const mBGR  = new cv.Mat(); cv.cvtColor(mRGBA, mBGR, cv.COLOR_RGBA2BGR);
    const mLAB  = new cv.Mat(); cv.cvtColor(mBGR, mLAB, cv.COLOR_BGR2Lab);
    const labVec = new cv.MatVector(); cv.split(mLAB, labVec);
    const L = labVec.get(0); if (!L) throw new Error('Lab split failed');
    const clahe = new cv.CLAHE(2.0, new cv.Size(8,8));
    const L2 = new cv.Mat(); clahe.apply(L, L2); labVec.set(0, L2);
    cv.merge(labVec, mLAB);
    const mOut = new cv.Mat(); cv.cvtColor(mLAB, mOut, cv.COLOR_Lab2RGBA);

    // Mild unsharp mask
    const sharp = new cv.Mat(); const blur = new cv.Mat();
    cv.GaussianBlur(mOut, blur, new cv.Size(0,0), 0.9, 0.9, cv.BORDER_DEFAULT);
    cv.addWeighted(mOut, 1.2, blur, -0.2, 0, sharp);

    cv.imshow(out, sharp);
    [mRGBA,mBGR,mLAB,labVec,L,L2,clahe,mOut,sharp,blur].forEach(m=>m.delete());
    log('Preprocess: CLAHE + unsharp');
    return out;

  }catch(err){
    log(`Preprocess fallback: ${err.message}`,'warn');
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(srcCanvas, 0, 0);
    const id = ctx.getImageData(0,0,W,H); const d=id.data;
    const gamma = 0.95, ig = 1/gamma;
    for(let i=0;i<d.length;i+=4){
      d[i]   = 255*Math.pow(d[i]  /255, ig);
      d[i+1] = 255*Math.pow(d[i+1]/255, ig);
      d[i+2] = 255*Math.pow(d[i+2]/255, ig);
    }
    ctx.putImageData(id,0,0);
    try{ if ('filter' in ctx){ ctx.filter='blur(0.3px) contrast(105%)'; ctx.drawImage(out,0,0); ctx.filter='none'; } }catch(_){}
    return out;
  }
}