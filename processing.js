/* Same engine as before; unchanged API */
(function () {
  const E = (window.EAS ||= {}); const P = (E.paths ||= {});
  const DEF = { angleDeg:45, hatchSpacing:6, step:3, minSeg:8, maxStitch:12 };
  const toRad = (a)=>a*Math.PI/180, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function sampler(canvas){
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const {width:W,height:H}=canvas; const d=ctx.getImageData(0,0,W,H).data;
    return (x,y)=>{x=(x+.5)|0; y=(y+.5)|0; if(x<0||y<0||x>=W||y>=H) return 0; return d[(y*W+x)*4+3];};
  }
  function split(ax,ay,bx,by,lim){const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);if(L<=lim)return[[bx,by]];
    const n=Math.ceil(L/lim),o=[];for(let i=1;i<=n;i++)o.push([ax+(dx*i)/n,ay+(dy*i)/n]);return o;}

  P.generate=function(mask,opts={}){
    const cfg={...DEF,...opts},W=mask.width,H=mask.height,A=sampler(mask);
    const ang=toRad(cfg.angleDeg),s=Math.sin(ang),c=Math.cos(ang),cx=W/2,cy=H/2;
    const R=(x,y)=>{const dx=x-cx,dy=y-cy;return[dx*c+dy*s,-dx*s+dy*c];};
    const Ri=(u,v)=>[u*c-v*s+cx,u*s+v*c+cy];
    const corners=[[0,0],[W,0],[0,H],[W,H]].map(([x,y])=>R(x,y));
    let u0=Math.min(...corners.map(p=>p[0]))-2, u1=Math.max(...corners.map(p=>p[0]))+2;
    let v0=Math.min(...corners.map(p=>p[1]))-2, v1=Math.max(...corners.map(p=>p[1]))+2;
    const segs=[];
    for(let v=v0;v<=v1;v+=cfg.hatchSpacing){
      let on=false, start=u0;
      for(let u=u0;u<=u1;u+=1){
        const [x,y]=Ri(u,v); const m=A(x,y)>127;
        if(!on && m){on=true;start=u;}
        else if(on && !m){on=false; const a=Ri(start,v), b=Ri(u,v); if(Math.hypot(b[0]-a[0],b[1]-a[1])>=cfg.minSeg) segs.push([a,b]);}
      }
      if(on){const a=Ri(start,v),b=Ri(u1,v); if(Math.hypot(b[0]-a[0],b[1]-a[1])>=cfg.minSeg) segs.push([a,b]);}
    }
    const pts=[]; let flip=false;
    for(let [a,b] of segs){ if(flip)[a,b]=[b,a]; flip=!flip;
      const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),n=Math.max(1,Math.round(L/cfg.step));
      for(let i=0;i<=n;i++) pts.push([a[0]+dx*i/n,a[1]+dy*i/n]); }
    const out=[]; if(pts.length){ let [px,py]=pts[0]; out.push([px,py]);
      for(let i=1;i<pts.length;i++){const[nx,ny]=pts[i]; for(const p of split(px,py,nx,ny,cfg.maxStitch)) out.push(p); [px,py]=[nx,ny];}}
    return {points:out,segments:segs,stats:{w:W,h:H,count:out.length,segs:segs.length}};
  };

  P.preview=function(canvas,res,opts={}){
    const ctx=canvas.getContext('2d'); const {w:W,h:H}=res.stats;
    const r=canvas.getBoundingClientRect(); if(r.width&&r.height){canvas.width=r.width;canvas.height=r.height;}
    const k=Math.min((canvas.width||W)/W,(canvas.height||H)/H)||1; ctx.setTransform(k,0,0,k,0,0); ctx.clearRect(0,0,W,H);
    ctx.lineWidth=1/k; ctx.strokeStyle=opts.seg||'#e4b1aa'; ctx.globalAlpha=.35; ctx.beginPath();
    for(const[[x1,y1],[x2,y2]] of res.segments){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);} ctx.stroke();
    ctx.globalAlpha=1; ctx.strokeStyle=opts.stroke||'#c06458'; ctx.lineWidth=1.4/k; ctx.beginPath();
    let first=true; for(const [x,y] of res.points){ if(first){ctx.moveTo(x,y); first=false;} else ctx.lineTo(x,y);} ctx.stroke();
  };

  P.exportJSON=(r)=>JSON.stringify({width:r.stats.w,height:r.stats.h,points:r.points},null,2);
  P.exportSVG=function(r){const d=[]; if(r.points.length){const[x0,y0]=r.points[0]; d.push(`M${x0.toFixed(1)} ${y0.toFixed(1)}`); for(let i=1;i<r.points.length;i++){const[x,y]=r.points[i]; d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);} }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r.stats.w} ${r.stats.h}"><path d="${d.join(' ')}" fill="none" stroke="#c06458" stroke-width="1.2"/></svg>`;};
  P.exportDST=function(r){const s=1000/Math.max(r.stats.w,r.stats.h); const pts=r.points.map(([x,y])=>[x*s,y*s]);
    const H=new Uint8Array(512); const put=(t,o)=>{for(let i=0;i<t.length;i++)H[o+i]=t.charCodeAt(i);} ;
    put('LA:Easbroidery',0); put(`ST:${String(pts.length).padStart(7,' ')}`,0x2E); H[511]=0x1A;
    const B=[]; const enc=(dx,dy)=>{dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
      const b1=((dx&0x1F)|((dy&0x1F)<<5))&0xFF; const b2=(((dx>>5)&0x03)|(((dy>>5)&0x03)<<2))&0xFF; B.push(b1,b2,0);};
    let[px,py]=pts[0]||[0,0]; for(let i=1;i<pts.length;i++){const[nx,ny]=pts[i]; enc(nx-px,ny-py); [px,py]=[nx,ny];}
    B.push(0,0,0xF3); const body=new Uint8Array(B); const out=new Uint8Array(512+body.length); out.set(H,0); out.set(body,512); return out;};
})();