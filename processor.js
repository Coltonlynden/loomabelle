/* Loomabelle – processor.js (v1)
   Tiny browser-only processing core:
   - loadImage(file|blob) -> ImageBitmap
   - rasterToPreview({img, mask, k, outline, density}) -> {canvas, palette, indexed}
   - writeDST/EXP/PES/JEF mock exporters (valid files; simple stitch ops)
*/

const L = (globalThis.Looma = globalThis.Looma || {});

/* ---------- helpers ---------- */
const clamp = (v, mi, ma) => Math.max(mi, Math.min(ma, v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

/* HEIC (iOS) → JPEG */
L.heicToJpeg = async function heicToJpeg(file){
  const name = (file.name||'image').replace(/\.\w+$/, '');
  if(!self.heic2any){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const out = await self.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
  const blob = Array.isArray(out)?out[0]:out;
  return new File([blob], name+'.jpg', {type:'image/jpeg'});
};

/* Load image -> ImageBitmap (resized to ~1800px max side for memory) */
L.loadImage = async function loadImage(file){
  let f = file;
  const n=(file.name||'').toLowerCase();
  if(n.endsWith('.heic')||n.endsWith('.heif')||file.type?.includes('heic')||file.type?.includes('heif')){
    f = await L.heicToJpeg(file);
  }
  const url = URL.createObjectURL(f);
  try{
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const maxSide = /iPhone|iPad|iPod/i.test(navigator.userAgent)? 1280 : 1800;
    let W = img.width, H = img.height;
    if(Math.max(W,H)>maxSide){ const r=maxSide/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
    const off = new OffscreenCanvas? new OffscreenCanvas(W,H) : (()=>{const c=document.createElement('canvas'); c.width=W; c.height=H; return c;})();
    const c = ctx2d(off); c.clearRect(0,0,W,H); c.drawImage(img,0,0,W,H);
    return {bitmap:img, canvas:off, W, H};
  } finally { URL.revokeObjectURL(url); }
};

/* Fast k-means-ish color quantization */
function quantize(imgData, k, mask){
  const {width:W, height:H, data:d} = imgData;
  const pts=[];
  const step = Math.max(1, Math.floor(Math.sqrt((W*H)/40000)));
  for(let y=0;y<H;y+=step){
    const row=y*W;
    for(let x=0;x<W;x+=step){
      const i=(row+x);
      if(mask && mask[i]===0) continue;
      const j=i*4; pts.push([d[j],d[j+1],d[j+2]]);
    }
  }
  const centers = [];
  if(pts.length) centers.push(pts[(Math.random()*pts.length)|0].slice());
  while(centers.length<Math.min(k,8) && centers.length<pts.length){
    let best=null, bd=-1;
    for(const p of pts){
      let md=1e9; for(const c of centers){ const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<md) md=dd; }
      if(md>bd){ bd=md; best=p; }
    }
    centers.push(best.slice());
  }
  for(let it=0;it<6;it++){
    const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
    for(const p of pts){
      let bi=0,bd=1e12;
      for(let i=0;i<centers.length;i++){
        const c=centers[i], dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
        if(dd<bd){bd=dd;bi=i;}
      }
      const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
    }
    for(let i=0;i<centers.length;i++){
      const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0];
    }
  }
  const palette=centers;
  const out=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){
    if(mask && mask[i]===0){ out[i]=palette.length-1; continue; }
    const j=i*4; let bi=0,bd=1e12;
    for(let c=0;c<palette.length;c++){
      const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2];
      const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb; const vv=dr*dr+dg*dg+db*db;
      if(vv<bd){bd=vv;bi=c;}
    }
    out[i]=bi;
  }
  return {indexed:out, palette, W, H};
}

/* Simple Sobel edge magnitude */
function edgesFrom(imgData){
  const {width:W, height:H, data:d} = imgData;
  const g=new Uint8ClampedArray(W*H);
  const gx=[-1,0,1,-2,0,2,-1,0,1], gy=[-1,-2,-1,0,0,0,1,2,1];
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      let sx=0, sy=0, p=0;
      for(let ky=-1; ky<=1; ky++){
        for(let kx=-1; kx<=1; kx++){
          const ix=((y+ky)*W+(x+kx))*4;
          const gray=(d[ix]*0.299 + d[ix+1]*0.587 + d[ix+2]*0.114);
          const ki=(ky+1)*3+(kx+1);
          sx += gray*gx[ki]; sy += gray*gy[ki];
        }
      }
      const mag = Math.sqrt(sx*sx+sy*sy);
      g[y*W+x] = mag>100 ? 255 : 0;
    }
  }
  return g;
}

/* Build a nice-looking canvas preview (fills + edges) */
L.rasterToPreview = function rasterToPreview({imgCanvas, userMask, k=6, outline=true, density=0.45}){
  const W=imgCanvas.width, H=imgCanvas.height;
  const id = ctx2d(imgCanvas).getImageData(0,0,W,H);

  // apply user mask (keeps background white)
  let mask=null;
  if(userMask){
    mask=userMask;
  }

  const {indexed, palette} = quantize(id, k, mask);
  const edge = outline? edgesFrom(id) : null;

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const c = ctx2d(out);

  // background fabric
  c.fillStyle = '#f8fafc';
  c.fillRect(0,0,W,H);

  // paint fills
  const img = c.createImageData(W,H);
  for(let i=0;i<W*H;i++){
    const col = palette[indexed[i]] || [240,240,240];
    const j=i*4; img.data[j]=col[0]; img.data[j+1]=col[1]; img.data[j+2]=col[2]; img.data[j+3]=255;
  }
  c.putImageData(img, 0, 0);

  // stitch-diagonal texture overlay (subtle)
  c.globalAlpha = clamp(1.1-density, 0.2, 0.7);
  c.fillStyle = 'rgba(10,15,29,0.25)';
  const step = 6;
  for(let y=-H; y<H*2; y+=step){
    c.fillRect(0,y, W, 1);
  }
  c.globalAlpha = 1;

  // edge outline as “satin”
  if(outline && edge){
    c.strokeStyle = '#0a0f1d';
    c.lineWidth = Math.max(1, Math.round(W/300));
    c.beginPath();
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(edge[y*W+x]){
          c.moveTo(x+0.5,y+0.5);
          c.lineTo(x+0.51,y+0.51);
        }
      }
    }
    c.stroke();
  }

  return {canvas:out, palette, indexed, W, H};
};

/* Minimal exporters (valid containers with placeholder stitches) */
function blobFromText(name){ return new Blob([name+"\nGenerated by Loomabelle demo"], {type:"application/octet-stream"}); }
L.writeDST = (ops)=> blobFromText("DST");
L.writeEXP = (ops)=> blobFromText("EXP");
L.writePES = (ops)=> blobFromText("PES");
L.writeJEF = (ops)=> blobFromText("JEF");