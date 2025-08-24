// Hatching + palette (from original src) + exports + zoom transform
(function () {
  const $=(s,r=document)=>r.querySelector(s);
  const S=(window.EAS ||= {}).state ||= {};
  const mask = document.getElementById('mask');

  function setShellTransform(){
    const shell=document.getElementById('shell');
    const z=S.zoom||1, x=S.panX||0, y=S.panY||0;
    shell.style.transform=`translate(${x}px,${y}px) scale(${z})`;
    window.EAS_preview.render();
  }

  // fast hatch from mask alpha
  function hatch(){
    const W=1024,H=1024;
    const m = mask.getContext('2d').getImageData(0,0,W,H).data;
    const spacing=4, step=2, ang=(S.dirAngle||45)*Math.PI/180;
    const nx=Math.cos(ang), ny=Math.sin(ang), px=-Math.sin(ang), py=Math.cos(ang);
    const bound = Math.ceil((W*Math.abs(px)+H*Math.abs(py))/2);
    const paths=[];
    for(let t=-bound; t<=bound; t+=spacing){
      let on=false, seg=[];
      for(let s=-900; s<=900; s+=step){
        const x=512+nx*s+px*t, y=512+ny*s+py*t;
        if(x<0||x>=W||y<0||y>=H){ if(on){paths.push(seg); seg=[]; on=false;} continue; }
        const a = m[((y|0)*W+(x|0))*4+3] > 0;
        if(a){ seg.push([x,y]); on=true; }
        else if(on){ paths.push(seg); seg=[]; on=false; }
      }
      if(seg.length) paths.push(seg);
    }
    S.stitchPaths = paths;
    S.stitches = paths.flat();
    return paths;
  }

  // K-means from ORIGINAL src (never from composite)
  function computePalette(k=5){
    const src=S.srcData; if(!src) return {centroids:[[0,0,0]]};
    const a=src.data; const samples=[];
    for(let i=0;i<a.length;i+=4*8){ samples.push([a[i],a[i+1],a[i+2]]); }
    const C=[]; for(let i=0;i<k;i++) C.push(samples[(i*samples.length/k)|0].slice());
    for(let it=0;it<6;it++){
      const sum=Array.from({length:k},()=>[0,0,0,0]);
      for(const p of samples){
        let bi=0,bd=1e9; for(let j=0;j<k;j++){ const d=(p[0]-C[j][0])**2+(p[1]-C[j][1])**2+(p[2]-C[j][2])**2; if(d<bd){bd=d;bi=j;} }
        sum[bi][0]+=p[0]; sum[bi][1]+=p[1]; sum[bi][2]+=p[2]; sum[bi][3]++;
      }
      for(let j=0;j<k;j++){ if(sum[j][3]){ C[j][0]=sum[j][0]/sum[j][3]; C[j][1]=sum[j][1]/sum[j][3]; C[j][2]=sum[j][2]/sum[j][3]; } }
    }
    // frequency for default selection
    const counts=new Array(k).fill(0);
    for(let i=0;i<a.length;i+=4){ let bi=0,bd=1e9; for(let j=0;j<k;j++){ const d=(a[i]-C[j][0])**2+(a[i+1]-C[j][1])**2+(a[i+2]-C[j][2])**2; if(d<bd){bd=d;bi=j;} } counts[bi]++; }
    return {centroids:C, counts};
  }

  function buildPaletteUI(){
    const box=$('#palette-box'); const wrap=$('#palette'); box.style.display='block'; wrap.innerHTML='';
    const k=+$('#color-count').value||5;
    const {centroids,counts}=computePalette(k);
    S.palette=centroids;
    // default keep: top 3 by freq
    const order=[...centroids.keys()].sort((i,j)=> (counts?.[j]||0)-(counts?.[i]||0));
    S.keepColors=new Set(order.slice(0,Math.min(3,k)));
    centroids.forEach((c,idx)=>{
      const sw=document.createElement('button');
      sw.className='chip'; sw.style.background=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
      if(S.keepColors.has(idx)) sw.classList.add('chip--active');
      sw.addEventListener('click',()=>{ if(S.keepColors.has(idx)) S.keepColors.delete(idx); else S.keepColors.add(idx); sw.classList.toggle('chip--active'); window.EAS_preview.render(); });
      wrap.appendChild(sw);
    });
  }

  $('#recolor').addEventListener('click',()=>{ buildPaletteUI(); window.EAS_preview.render(); });

  function generate(){
    hatch();
    buildPaletteUI();           // palette appears only after Generate
    window.EAS_preview.render();
  }

  function download(name,blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),800); }
  function exportPNG(){ document.getElementById('stitchvis').toBlob(b=>download('easbroidery.png',b),'image/png'); }
  function exportSVG(){
    const paths=S.stitchPaths||[]; const segs=paths.map(seg=>`<path d="${seg.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('')}" fill="none" stroke="#000" stroke-width="0.4"/>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${segs}</svg>`; download('easbroidery.svg',new Blob([svg],{type:'image/svg+xml'}));
  }
  function exportJSON(){ download('easbroidery.json',new Blob([JSON.stringify({stitches:S.stitches||[],angle:S.dirAngle,keep:[...(S.keepColors||[])]})],{type:'application/json'})); }
  function exportDST(){
    const pts=(S.stitches&&S.stitches.length?S.stitches:hatch().flat()); if(!pts.length){alert('No stitches');return;}
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9; for(const [x,y] of pts){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2;
    const bytes=[]; let px=0,py=0;
    function enc(dx,dy,flags=0){
      while(Math.abs(dx)>121||Math.abs(dy)>121){ const sx=Math.max(-121,Math.min(121,dx)); const sy=Math.max(-121,Math.min(121,dy)); enc(sx,sy,flags); dx-=sx; dy-=sy; }
      let b1=0,b2=0,b3=0x80;
      function bits(v){ let a=Math.abs(v),s=v>=0; const set=(P,bit)=>{ if(P===1){b1|=s?bit:bit<<1;} else if(P===2){b2|=s?bit:bit<<1;} else {b3|=s?bit:bit<<1;} }; const use=(u,P,bit)=>{while(a>=u){set(P,bit);a-=u;}}; use(81,3,1);use(27,2,16);use(9,2,1);use(3,1,16);use(1,1,1);}
      bits(dx); bits(dy); if(flags&1) b3|=0x20; if(flags&2) b3|=0x10; bytes.push(b1,b2,b3);
    }
    for(const [x,y] of pts){ const dx=Math.round(x-cx-px), dy=Math.round(y-cy-py); enc(dx,dy); px+=dx; py+=dy; }
    bytes.push(0x00,0x00,0xF3);
    const header=new Uint8Array(512).fill(0x20); header[511]=0x1A;
    const out=new Uint8Array(512+bytes.length); out.set(header,0); out.set(bytes,512);
    download('easbroidery.dst',new Blob([out],{type:'application/octet-stream'}));
  }

  window.EAS_processing = { setShellTransform, generate, exportPNG, exportSVG, exportJSON, exportDST };
})();