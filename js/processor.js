/* Loomabelle — processor.js v14
   Standalone processing core:
   - Looma.processPhoto(imageData, {k, autoColors, outline, angle, density, mask, pxPerMm, outW, outH}, onProgress)
   - Looma.processDrawing(alphaImageData, {pxPerMm}, onProgress)
   - Looma.writeDST(ops,...), Looma.writeEXP(ops,...)
   - Optional helpers: Looma.heicToJpeg(), Looma.personMask() (BodyPix)
   Loads optional CDN libs on demand; falls back to fast local paths.
*/
(function initLoomaProcessor(global){
  'use strict';

  const Looma = global.Looma || (global.Looma = {});
  const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));
  const tick = () => new Promise(r => setTimeout(r, 0));

  /* -------------------- HEIC helper (optional) ------------------- */
  Looma.heicToJpeg = async function heicToJpeg(file){
    if(!global.heic2any){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    const out = await global.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], (file.name||'image').replace(/\.\w+$/,'')+'.jpg', { type:'image/jpeg' });
  };

  /* -------------------- quantization (image-q) ------------------- */
  let IQ_READY = false;
  async function ensureImageQ(){
    if (IQ_READY) return true;
    if (!global.IQ){
      const load = (src)=>new Promise(res=>{ const s=document.createElement('script'); s.src=src; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); });
      let ok = await load('https://cdn.jsdelivr.net/npm/image-q@4.0.0/build/image-q.min.js');
      if (!ok) ok = await load('https://unpkg.com/image-q@4.0.0/build/image-q.min.js');
      IQ_READY = ok && !!global.IQ;
    } else IQ_READY = true;
    return IQ_READY;
  }

  function sampleDominantRGBA(imgData, maxK){
    const W=imgData.width,H=imgData.height,d=imgData.data;
    const step=Math.max(1,Math.floor(Math.sqrt((W*H)/20000)));
    const pts=[];
    for(let y=0;y<H;y+=step){
      const row=y*W;
      for(let x=0;x<W;x+=step){
        const i=(row+x)*4;
        pts.push([d[i],d[i+1],d[i+2]]);
      }
    }
    const k=Math.min(maxK, Math.max(1, pts.length));
    const centers=[ pts[Math.floor(Math.random()*pts.length)] ];
    while(centers.length<k){
      let best=null,bd=-1;
      for(const p of pts){
        let dmin=1e9; for(const c of centers){ const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if(dd<dmin) dmin=dd; }
        if(dmin>bd){bd=dmin;best=p;}
      }
      centers.push(best.slice());
    }
    for(let it=0;it<5;it++){
      const sum=Array.from({length:k},()=>[0,0,0,0]);
      for(const p of pts){
        let bi=0,bd=1e12;
        for(let i=0;i<k;i++){
          const c=centers[i]; const dd=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;
          if(dd<bd){bd=dd;bi=i;}
        }
        const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
      }
      for(let i=0;i<k;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
    }
    const uniq=[]; for(const c of centers){ if(!uniq.some(u=>Math.hypot(u[0]-c[0],u[1]-c[1],u[2]-c[2])<18)) uniq.push(c); }
    return uniq;
  }

  async function quantizeSafe(imgData, k, mask, onProgress){
    try{
      const ok = await ensureImageQ();
      if (!ok) throw new Error('image-q not available');
      const W=imgData.width,H=imgData.height;
      const rgba=new Uint8ClampedArray(imgData.data);
      if (mask){ for(let i=0;i<W*H;i++){ if(!mask[i]) rgba[i*4+3]=0; } }
      const pc=new global.IQ.utils.PointContainer();
      pc.fromUint8Array(rgba,W,H);
      const dist=new global.IQ.distance.EuclideanBT709NoAlpha();
      const palQ=new global.IQ.palette.NeuquantPalette(dist, 10);
      palQ.sample(pc);
      const pal=palQ.quantize();
      const imgQ=new global.IQ.image.NearestColor(dist);

      const result=new Uint8Array(W*H);
      const CH=Math.max(16, Math.floor(H/60));
      for(let y=0;y<H;y+=CH){
        const slice=pc.clone().crop(0,y,W,Math.min(CH,H-y));
        const outSlice=imgQ.quantizeSlice(slice,pal);
        for(let yy=0;yy<Math.min(CH,H-y);yy++){
          for(let x=0;x<W;x++){
            result[(y+yy)*W+x]= outSlice.getPoint(x,yy).uint32 >> 24;
          }
        }
        onProgress && onProgress(Math.min(100, Math.round(100*(y+CH)/H)));
        await tick();
      }
      const palette=[]; for(let i=0;i<Math.min(k, pal.getSize());i++){ const c=pal.getPoint(i).getColor(); palette.push([c.r,c.g,c.b]); }
      return { indexed:result, palette, W, H };
    }catch(err){
      // Fallback (fast k-means-ish)
      const W=imgData.width,H=imgData.height;
      const palette=sampleDominantRGBA(imgData, Math.min(k,6));
      const d=imgData.data;
      const indexed=new Uint8Array(W*H);
      const CH=Math.max(16,Math.floor(H/60));
      for(let y=0;y<H;y+=CH){
        for(let yy=y;yy<Math.min(H,y+CH);yy++){
          const row=yy*W;
          for(let x=0;x<W;x++){
            const i=row+x; if(mask && !mask[i]){ indexed[i]=0; continue; }
            const j=i*4; let bi=0,bd=1e12;
            for(let c=0;c<palette.length;c++){
              const pr=palette[c][0],pg=palette[c][1],pb=palette[c][2];
              const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb;
              const vv=dr*dr+dg*dg+db*db;
              if(vv<bd){bd=vv;bi=c;}
            }
            indexed[i]=bi;
          }
        }
        onProgress && onProgress(Math.min(100, 20+Math.round(80*y/H)));
        await tick();
      }
      return { indexed, palette, W, H };
    }
  }

  /* -------------------- person segmentation (optional) ----------- */
  let BP_MODEL=null; let TF_READY=false;
  async function ensureTf(){
    if (TF_READY) return;
    if (!global.tf){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    TF_READY=!!global.tf;
  }
  async function ensureBodyPix(){
    await ensureTf();
    if (!global.bodyPix){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    if (!BP_MODEL){
      BP_MODEL = await global.bodyPix.load({
        architecture:'MobileNetV1',
        outputStride:16,
        multiplier:0.5,
        quantBytes:2
      });
    }
    return BP_MODEL;
  }
  Looma.personMask = async function personMaskFromCanvas(canvas, onProgress){
    const model = await ensureBodyPix();
    onProgress && onProgress(10);
    const seg = await model.segmentPerson(canvas, {
      internalResolution: 'medium',
      segmentationThreshold: 0.7,
      maxDetections: 1
    });
    onProgress && onProgress(60);
    const W=canvas.width, H=canvas.height;
    const out=new Uint8Array(W*H); out.set(seg.data);
    // 3x3 morphological close
    const tmp=new Uint8Array(W*H);
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
    onProgress && onProgress(100);
    return out;
  };

  /* -------------------- stitch planning (simple & fast) ---------- */
  // Very fast preview-oriented planner: outline scan + angled hatch.
  function planStitches(data, opts){
    const {indexed, palette, W, H} = data;
    const angle = (opts && opts.angle!=null) ? (+opts.angle) : 45;
    const outline = !!(opts && opts.outline);
    const step = Math.max(2, Math.floor(Math.min(W,H) / 220)); // coarse step for speed

    const ops = [];

    if (outline){
      const edges = new Uint8Array(W*H);
      for(let y=1;y<H-1;y++){
        const row=y*W;
        for(let x=1;x<W-1;x++){
          const i=row+x, c=indexed[i];
          if (indexed[i-1]!==c || indexed[i+1]!==c || indexed[i-W]!==c || indexed[i+W]!==c) edges[i]=1;
        }
      }
      for(let y=0;y<H;y+=step){
        let run=null;
        for(let x=0;x<W;x++){
          const i=y*W+x;
          if(edges[i]){ if(!run) run={y:y, x0:x}; }
          else if(run){ ops.push({cmd:'jump', x:run.x0, y:run.y}); ops.push({cmd:'stitch', x:x, y:run.y}); run=null; }
        }
        if(run){ ops.push({cmd:'jump', x:run.x0, y:run.y}); ops.push({cmd:'stitch', x:W-1, y:run.y}); }
      }
    }

    // Simple banded hatch at given angle
    const rad = angle * Math.PI/180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    const bands = Math.max(4, Math.floor(Math.min(W,H) / 24));
    for(let b=0;b<bands;b++){
      const t = (b / bands) * (W+H);
      for(let y=0;y<H;y+=step){
        const x = Math.floor(t - y * (sin/cos));
        let first=true, lastX=null,lastY=null, inRun=false;
        for(let px=x-20; px<=x+20; px++){
          const xx = px, yy = Math.floor(y + (px - x)* (sin/cos));
          if(xx>=0 && xx<W && yy>=0 && yy<H){
            if(!inRun){ ops.push({cmd:'jump', x:xx, y:yy}); inRun=true; }
            lastX=xx; lastY=yy;
          }
        }
        if(inRun && lastX!=null){ ops.push({cmd:'stitch', x:lastX, y:lastY}); }
      }
    }
    return ops;
  }

  /* -------------------- writers (DST/EXP) ------------------------ */
  function toUnits(ops, pxPerMm, outW, outH){
    const s = 1/pxPerMm*10, cx=outW/2, cy=outH/2; // 10 units per mm (rough DST-ish)
    const out=[]; let prev=null;
    for(const op of ops){
      if(op.cmd==='stop'){ out.push({cmd:'stop'}); prev=null; continue; }
      if(op.cmd==='jump'||op.cmd==='stitch'){
        const x=(op.x-cx)*s, y=(op.y-cy)*s;
        if(prev===null){ prev=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
        else{ out.push({cmd:op.cmd,dx:x-prev[0],dy:y-prev[1]}); prev=[x,y]; }
      }
    }
    return out;
  }
  function writeDST(ops, palette, opts){
    const pxPerMm = (opts && opts.pxPerMm) || 2;
    const outW = (opts && opts.outW) || 640, outH=(opts && opts.outH)||360;
    const u=toUnits(ops, pxPerMm, outW, outH), bytes=[];
    function enc(dx,dy,flag){ if(flag==null) flag=0; dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
      const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
      const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
      const b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); }
    let colors=0;
    for(const s of u){
      if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; }
      if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; }
      enc(s.dx,s.dy,0);
    }
    bytes.push(0,0,0xF3);
    const header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
    const hb=new TextEncoder().encode(header);
    const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
  }
  function writeEXP(ops, palette, opts){
    const pxPerMm = (opts && opts.pxPerMm) || 2;
    const outW = (opts && opts.outW) || 640, outH=(opts && opts.outH)||360;
    const u=toUnits(ops, pxPerMm, outW, outH), bytes=[];
    function put(dx,dy,cmd){
      dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
      if(cmd==='jump') bytes.push(0x80,0x04);
      if(cmd==='stop') bytes.push(0x80,0x01);
      if(cmd==='end')  bytes.push(0x80,0x00);
      if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); }
    }
    for(const s of u){
      if(s.cmd==='stop'){ put(0,0,'stop'); continue; }
      if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; }
      put(s.dx,s.dy,'stitch');
    }
    bytes.push(0x80,0x00);
    return new Uint8Array(bytes);
  }

  /* -------------------- top-level processors --------------------- */
  Looma.processPhoto = async function processPhoto(imgData, controls, onProgress){
    const k = clamp(~~(controls.k||6),2,12);
    const outline = controls.outline!==false;
    const angle = +controls.angle || 45;
    const density = clamp(+controls.density||0.40,0.2,1.0);
    const pxPerMm = controls.pxPerMm || 2;
    const outW = controls.outW || imgData.width;
    const outH = controls.outH || imgData.height;

    onProgress && onProgress(5);
    const q = await quantizeSafe(imgData, k, controls.mask||null, p=>onProgress && onProgress(5+Math.round(p*0.55)));
    onProgress && onProgress(70);

    const ops = planStitches(q, { outline, angle, spacingMM: 1/Math.max(0.2, Math.min(1.0, density)) });

    onProgress && onProgress(88);
    const dstU8 = writeDST(ops, q.palette, {pxPerMm, outW, outH});
    const expU8 = writeEXP(ops, q.palette, {pxPerMm, outW, outH});
    onProgress && onProgress(100);

    return { ...q, ops, dstU8, expU8 };
  };

  Looma.processDrawing = async function processDrawing(alphaImageData, controls, onProgress){
    const W=alphaImageData.width, H=alphaImageData.height, d=alphaImageData.data;
    const mask=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++){ mask[i]= d[i*4+3]>10?1:0; }
    const indexed=mask, palette=[[0,0,0],[255,255,255]];
    const q={indexed, palette, W, H};

    onProgress && onProgress(40);
    const ops = planStitches(q, { outline:true, angle:45, spacingMM:2.0 });
    onProgress && onProgress(88);

    const pxPerMm = controls.pxPerMm || 2;
    const dstU8 = writeDST(ops, palette, {pxPerMm, outW:W, outH:H});
    const expU8 = writeEXP(ops, palette, {pxPerMm, outW:W, outH:H});
    onProgress && onProgress(100);

    return { indexed, palette, W, H, ops, dstU8, expU8 };
  };

  // expose writers too
  Looma.writeDST = writeDST;
  Looma.writeEXP = writeEXP;

})(window);