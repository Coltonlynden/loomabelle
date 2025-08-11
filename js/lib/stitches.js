import { log } from './ui.js';

export const HOOP_MM={ '4x4':{w:100,h:100}, '5x7':{w:130,h:180} };

function hasAny(mask){ if(!mask) return false; for(let i=0;i<mask.length;i++) if(mask[i]) return true; return false; }

function erodeMask(mask,W,H,rPx){if(rPx<=0)return mask;let cur=mask;
  for(let t=0;t<rPx;t++){const out=new Uint8Array(W*H);
    for(let y=1;y<H-1;y++){const row=y*W; for(let x=1;x<W-1;x++){if(!cur[row+x])continue;let keep=true;
      for(let dy=-1;dy<=1&&keep;dy++)for(let dx=-1;dx<=1;dx++)if(!cur[(y+dy)*W+(x+dx)]){keep=false;break;}
      if(keep)out[row+x]=1;}} cur=out;}
  return cur;}

function marchingSquaresOutline(mask,W,H){let sx=-1,sy=-1;for(let y=1;y<H-1&&sy<0;y++)for(let x=1;x<W-1;x++)if(mask[y*W+x]&&!mask[y*W+(x-1)]){sx=x;sy=y;break}
  if(sx<0)return[];const pts=[];let x=sx,y=sy;const max=W*H*4;
  for(let step=0;step<max;step++){pts.push([x,y]);const a=mask[(y-1)*W+(x-1)]?1:0,b=mask[(y-1)*W+x]?1:0,c=mask[y*W+(x-1)]?1:0,d=mask[y*W+x]?1:0;const code=(a<<3)|(b<<2)|(c<<1)|d;
    if(code===0||code===1||code===3||code===9||code===11){x++;} else if(code===2||code===6||code===7||code===14){y++;} else if(code===4||code===12||code===13||code===8){x--;} else {y--;}
    if(x===sx&&y===sy&&pts.length>12)break;x=Math.max(1,Math.min(W-2,x));y=Math.max(1,Math.min(H-2,y));}
  const out=[];for(let i=0;i<pts.length;i+=2)out.push(pts[i]);return out;}

function hatchSegmentsFromMask(mask,W,H,bbox,angle,spacingPx,stepPx){
  const segs=[];const dir=[Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180)], nrm=[-dir[1],dir[0]];
  const bw=bbox.maxx-bbox.minx,bh=bbox.maxy-bbox.miny;const cx=(bbox.minx+bbox.maxx)/2,cy=(bbox.miny+bbox.maxy)/2;
  const half=Math.hypot(bw,bh)*0.75;const range=Math.ceil(Math.hypot(bw,bh)/spacingPx)+2;
  for(let k=-range;k<=range;k++){const off=k*spacingPx,px=cx+nrm[0]*off,py=cy+nrm[1]*off;let start=null;
    for(let s=-half;s<=half;s+=stepPx){const x=Math.round(px+dir[0]*s),y=Math.round(py+dir[1]*s);
      const inside=(x>=0&&y>=0&&x<W&&y<H)?mask[y*W+x]===1:false;
      if(inside&&!start)start=[x,y];
      if((!inside||s>=half)&&start){const end=inside?[x,y]:[Math.round(px+dir[0]*(s-stepPx)),Math.round(py+dir[1]*(s-stepPx))];
        if(Math.hypot(end[0]-start[0],end[1]-start[1])>=2)segs.push([start,end]);start=null;}}}
  return segs;}

function lineStitch(out,aMM,bMM,maxStepMM){const len=Math.hypot(bMM[0]-aMM[0],bMM[1]-aMM[1]);const steps=Math.max(1,Math.ceil(len/maxStepMM));
  for(let i=1;i<=steps;i++){const t=i/steps;out.push({x:aMM[0]+(bMM[0]-aMM[0])*t,y:aMM[1]+(bMM[1]-aMM[1])*t});}}
function runningOutline(stitches,ptsMM,maxStepMM=3){if(!ptsMM.length)return;stitches.push({x:ptsMM[0][0],y:ptsMM[0][1],jump:true});
  for(let i=1;i<=ptsMM.length;i++){const a=ptsMM[i-1],b=ptsMM[i%ptsMM.length];lineStitch(stitches,a,b,maxStepMM);}}
function satinOutline(stitches,ptsMM,widthMM=0.8,stepMM=0.6){if(ptsMM.length<3)return;const half=widthMM/2;let left=true;
  stitches.push({x:ptsMM[0][0],y:ptsMM[0][1],jump:true});
  for(let i=1;i<ptsMM.length;i++){const a=ptsMM[i-1],b=ptsMM[i];const dx=b[0]-a[0],dy=b[1]-a[1];const len=Math.hypot(dx,dy)||1;const nx=-dy/len,ny=dx/len;const seg=Math.max(1,Math.ceil(len/stepMM));
    for(let k=0;k<seg;k++){const t=k/seg;const cx=a[0]+dx*t,cy=a[1]+dy*t;const off=left?half:-half;stitches.push({x:cx+nx*off,y:cy+ny*off});left=!left;}}}

export function planStitches(q, opts){
  const { indexed, palette, W, H } = q;
  const { hoop, sizePct, angleDeg, densityMM, wantOutline } = opts;

  // Build color masks & bbox
  const masks = palette.map((_,ci)=>{const m=new Uint8Array(W*H); for(let i=0;i<W*H;i++) if(indexed[i]===ci) m[i]=1; return m;});
  const bbox = masks.reduce((b,m)=>{for(let y=0;y<H;y++){const row=y*W;for(let x=0;x<W;x++) if(m[row+x]){if(x<b.minx)b.minx=x;if(y<b.miny)b.miny=y;if(x>b.maxx)b.maxx=x;if(y>b.maxy)b.maxy=y;}} return b;},{minx:Infinity,miny:Infinity,maxx:-Infinity,maxy:-Infinity});
  if(!(bbox.maxx>bbox.minx && bbox.maxy>bbox.miny)) throw new Error('No solid areas found (bbox invalid)');

  const bw=bbox.maxx-bbox.minx,bh=bbox.maxy-bbox.miny,cx=(bbox.minx+bbox.maxx)/2,cy=(bbox.miny+bbox.maxy)/2;
  const mmPerPx=Math.min(hoop.w/bw,hoop.h/bh)*(sizePct/100);
  const pxPerMM=1/mmPerPx;
  const spacingPx=Math.max(1,Math.round(densityMM*pxPerMM));
  const stepPx=Math.max(1,Math.round(0.6*pxPerMM));
  const insetPx=Math.max(1,Math.round(0.5*pxPerMM));
  log(`mmPerPx=${mmPerPx.toFixed(4)} pxPerMM=${pxPerMM.toFixed(3)} spacingPx=${spacingPx} stepPx=${stepPx} insetPx=${insetPx}`);

  const plan={stitches:[], colors: palette.slice()};
  for(let ci=0;ci<masks.length;ci++){
    if(ci>0) plan.stitches.push({colorChange:true,x:0,y:0});

    const outlinePx=marchingSquaresOutline(masks[ci],W,H);
    log(`Color ${ci+1}: outline pts=${outlinePx.length}`);
    const outlineMM=outlinePx.map(([x,y])=>[(x-cx)*mmPerPx,(y-cy)*mmPerPx]);
    runningOutline(plan.stitches,outlineMM,3);

    const inset=erodeMask(masks[ci],W,H,insetPx);
    const segs=hatchSegmentsFromMask(inset,W,H,bbox,angleDeg,spacingPx,stepPx);
    log(`Color ${ci+1}: hatch segments=${segs.length}`);
    for(const [a,b] of segs){
      const sMM=[(a[0]-cx)*mmPerPx,(a[1]-cy)*mmPerPx], eMM=[(b[0]-cx)*mmPerPx,(b[1]-cy)*mmPerPx];
      plan.stitches.push({x:sMM[0],y:sMM[1],jump:true});
      lineStitch(plan.stitches,sMM,eMM,7);
    }
    if(wantOutline && outlineMM.length>4){ satinOutline(plan.stitches,outlineMM,0.8,0.6); }
  }
  plan.stitches.push({end:true,x:0,y:0});
  return plan;
}

export function drawPreviewColored(plan,hoop,sizePct){
  const preview=document.querySelector('#preview'); const ctx=preview.getContext('2d');
  const W=preview.width,H=preview.height; ctx.clearRect(0,0,W,H);
  const pad=20,asp=hoop.h/hoop.w;let hoopW=W-2*pad,hoopH=hoopW*asp;if(hoopH>H-2*pad){hoopH=H-2*pad;hoopW=hoopH/asp}
  const hx=(W-hoopW)/2,hy=(H-hoopH)/2,r=12;
  ctx.fillStyle='#111824';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#334';ctx.lineWidth=2;ctx.beginPath();
  const rr=(x,y,w,h,rad)=>{ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);};
  rr(hx,hy,hoopW,hoopH,r);ctx.stroke();
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const s of plan.stitches){if(s.end||s.colorChange)continue;minx=Math.min(minx,s.x);miny=Math.min(miny,s.y);maxx=Math.max(maxx,s.x);maxy=Math.max(maxy,s.y);}
  const scale=(sizePct/100)*Math.min(hoopW/hoop.w,hoopH/hoop.h), ox=W/2-(minx+maxx)/2*scale, oy=H/2-(miny+maxy)/2*scale;
  let last=null,ci=0; const toCss=rgb=>`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.lineWidth=1.2; ctx.strokeStyle=toCss(plan.colors[0]||[220,220,220]);
  for(const s of plan.stitches){
    if(s.colorChange){last=null;ci=Math.min(ci+1,plan.colors.length-1);ctx.strokeStyle=toCss(plan.colors[ci]||[200,200,200]);continue;}
    if(s.end)break; if(s.jump){last={x:s.x,y:s.y};continue;} if(!last){last={x:s.x,y:s.y};continue;}
    ctx.beginPath();ctx.moveTo(ox+last.x*scale,oy+last.y*scale);ctx.lineTo(ox+s.x*scale,oy+s.y*scale);ctx.stroke();last={x:s.x,y:s.y};
  }
}
