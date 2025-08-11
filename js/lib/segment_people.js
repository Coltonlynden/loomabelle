// js/lib/segment_people.js
// Lightweight portrait subject mask using TensorFlow.js BodyPix (client-only).

let MODEL = null;
let TF_READY = false;

async function ensureTf(){
  if (TF_READY) return;
  if (!window.tf) {
    await new Promise((res, rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  TF_READY = !!window.tf;
}

async function ensureBodyPix(){
  await ensureTf();
  if (MODEL) return MODEL;
  if (!window.bodyPix){
    await new Promise((res, rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  MODEL = await window.bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.5,
    quantBytes: 2
  });
  return MODEL;
}

/**
 * Returns Uint8Array mask (1=person, 0=bg) at canvas resolution
 */
export async function personMask(canvas, onProgress){
  const model = await ensureBodyPix();
  onProgress?.(10);
  const seg = await model.segmentPerson(canvas, {
    internalResolution: 'medium',
    segmentationThreshold: 0.7,
    maxDetections: 1
  });
  onProgress?.(60);

  // seg.data is Uint8Array (1=person,0=bg) length W*H
  // It can be sparse; apply small dilate->erode to close holes.
  const W = canvas.width, H = canvas.height;
  const out = new Uint8Array(W*H);
  out.set(seg.data);

  // 3x3 close
  const tmp = new Uint8Array(W*H);
  // dilate
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      let v=0;
      for(let yy=y-1;yy<=y+1;yy++){
        for(let xx=x-1;xx<=x+1;xx++){
          if(xx>=0&&xx<W&&yy>=0&&yy<H) v|=out[yy*W+xx];
        }
      }
      tmp[y*W+x]=v?1:0;
    }
  }
  // erode
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      let v=1;
      for(let yy=y-1;yy<=y+1;yy++){
        for(let xx=x-1;xx<=x+1;xx++){
          if(xx>=0&&xx<W&&yy>=0&&yy<H) v&=tmp[yy*W+xx];
        }
      }
      out[y*W+x]=v?1:0;
    }
  }
  onProgress?.(100);
  return out;
}
