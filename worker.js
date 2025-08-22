/* Heavy processing in a Web Worker.
   Produces: progress events, stitched PNG preview, simple EXP text.
*/

self.onmessage = async (e)=>{
  const { type, options, image, mask, palette } = e.data;
  if (type!=='process') return;

  const bmp = image; // ImageBitmap
  const w = Math.min(1024, bmp.width);
  const h = Math.round(bmp.height * (w / bmp.width));

  const canvas = new OffscreenCanvas(w,h);
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(bmp, 0,0, w,h);

  postProgress(.05, 'Reducing colors');
  if (options.reduce){
    const img = ctx.getImageData(0,0,w,h);
    const d = img.data;
    for (let i=0;i<d.length;i+=4){
      const n = nearest(d[i],d[i+1],d[i+2], palette);
      d[i]=n[0]; d[i+1]=n[1]; d[i+2]=n[2];
    }
    ctx.putImageData(img,0,0);
  }

  postProgress(.25, 'Subject isolation');
  if (options.mask && mask){
    const m = await maskToImageData(mask, w,h);
    const base = ctx.getImageData(0,0,w,h);
    const bd = base.data;
    for (let i=0;i<bd.length;i+=4){
      const a = m.data[i+3];
      if (a<20){ // outside mask → transparent
        bd[i+3]=0;
      }
    }
    ctx.putImageData(base,0,0);
  }

  postProgress(.45, 'Hatching overlay');
  if (options.edge){
    hatch(ctx,w,h, options.density);
  }

  postProgress(.7, 'Generating stitches');
  const expText = rasterToSimpleEXP(ctx.getImageData(0,0,w,h));

  postProgress(.9, 'Finalizing preview');
  const blob = await canvas.convertToBlob({ type:'image/png' });
  const png = await blobToDataURL(blob);

  postMessage({ type:'done', png, expText });
};

function postProgress(p, label){ postMessage({ type:'progress', progress:p, label }); }

function nearest(r,g,b, palette){
  let best=0, bd=1e9;
  for (let i=0;i<palette.length;i++){
    const t=palette[i]; const dr=r-t[0], dg=g-t[1], db=b-t[2];
    const dd=dr*dr+dg*dg+db*db;
    if (dd<bd){bd=dd; best=i;}
  }
  return palette[best];
}

async function maskToImageData(maskBmp, w,h){
  // Resize mask to working size
  const c = new OffscreenCanvas(w,h);
  const x = c.getContext('2d');
  x.drawImage(maskBmp,0,0,w,h);
  return x.getImageData(0,0,w,h);
}

function hatch(ctx,w,h,density){
  const step = Math.max(4, Math.floor(14 - density/8));
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  for (let y=0; y<h; y+=step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y+step/2); ctx.stroke();
  }
  ctx.restore();
}

function rasterToSimpleEXP(img){
  // Extremely simple “stitch list” (x,y,r,g,b). Each Nth pixel becomes a point.
  const {width:w, height:h, data:d} = img;
  const stride = Math.max(2, Math.floor(Math.min(w,h)/120));
  const pts = [];
  for (let y=0;y<h;y+=stride){
    for (let x=0;x<w;x+=stride){
      const i=(y*w+x)*4;
      if (d[i+3] > 10){
        pts.push(`${x},${y},${d[i]},${d[i+1]},${d[i+2]}`);
      }
    }
  }
  return [
    '# EASBROIDERY SIMPLE EXP TXT',
    `# size ${w}x${h} stride ${stride}`,
    'x,y,r,g,b',
    ...pts
  ].join('\n');
}

function blobToDataURL(blob){ return new Promise(r=>{const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(blob);}); }
