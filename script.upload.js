// load image, quantize colors, build palette UI
(function(){
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const S=(window.EAS ||= {}).state ||= {};
  const base=$('#canvas'), bctx=base.getContext('2d',{willReadFrequently:true});
  const edges=$('#edges').getContext('2d');

  base.width=base.height=1024;

  function drawEdges(){
    edges.canvas.width=edges.canvas.height=1024;
    const {data}=bctx.getImageData(0,0,1024,1024);
    const out=edges.createImageData(1024,1024);
    for(let y=1;y<1023;y++){
      for(let x=1;x<1023;x++){
        const i=(y*1024+x)*4, ix=i-4, iy=i-4096;
        const dx=Math.abs(data[i]-data[ix])+Math.abs(data[i+1]-data[ix+1])+Math.abs(data[i+2]-data[ix+2]);
        const dy=Math.abs(data[i]-data[iy])+Math.abs(data[i+1]-data[iy+1])+Math.abs(data[i+2]-data[iy+2]);
        const v = Math.min(255,(dx+dy)/2);
        out.data[i]=out.data[i+1]=out.data[i+2]=0; out.data[i+3]=v>60?80:0;
      }
    }
    edges.putImageData(out,0,0);
  }

  function fitAndDraw(img){
    bctx.clearRect(0,0,1024,1024);
    const r=img.width/img.height;
    let w=1024,h=1024;
    if(r>1){ h=1024; w=Math.round(h*r); } else { w=1024; h=Math.round(w/r); }
    const sx=(w-1024)/2, sy=(h-1024)/2;
    bctx.drawImage(img, -sx, -sy, w, h);
    drawEdges(); quantize(+$('#color-count').value||5);
    window.EAS_preview.render();
  }

  $('#file').addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const img=new Image(); img.onload=()=>fitAndDraw(img); img.src=URL.createObjectURL(f);
  });

  // K-means quantization (sampled)
  function quantize(k=5){
    const img=bctx.getImageData(0,0,1024,1024); const a=img.data;
    const samples=[]; // sample every 8th px to keep it fast
    for(let i=0;i<a.length;i+=4*8){ samples.push([a[i],a[i+1],a[i+2]]); }
    // init centroids by picking spread values
    const C=[]; for(let i=0;i<k;i++) C.push(samples[(i*samples.length/k)|0].slice());
    for(let it=0;it<6;it++){
      const sum=Array.from({length:k},()=>[0,0,0,0]);
      for(const p of samples){
        let bi=0,bd=1e9; for(let i=0;i<k;i++){ const d=(p[0]-C[i][0])**2+(p[1]-C[i][1])**2+(p[2]-C[i][2])**2; if(d<bd){bd=d;bi=i;} }
        sum[bi][0]+=p[0]; sum[bi][1]+=p[1]; sum[bi][2]+=p[2]; sum[bi][3]++;
      }
      for(let i=0;i<k;i++){ if(sum[i][3]){ C[i][0]=sum[i][0]/sum[i][3]; C[i][1]=sum[i][1]/sum[i][3]; C[i][2]=sum[i][2]/sum[i][3]; } }
    }
    // label all pixels to nearest centroid
    const counts=new Array(k).fill(0);
    for(let i=0;i<a.length;i+=4){
      let bi=0,bd=1e9; for(let j=0;j<k;j++){ const d=(a[i]-C[j][0])**2+(a[i+1]-C[j][1])**2+(a[i+2]-C[j][2])**2; if(d<bd){bd=d;bi=j;} }
      counts[bi]++; a[i]=C[bi][0]; a[i+1]=C[bi][1]; a[i+2]=C[bi][2];
    }
    bctx.putImageData(img,0,0); drawEdges();
    // build cute swatches; auto include top 3
    const palette=$('#palette'); palette.innerHTML='';
    const order=[...C.keys()].sort((i,j)=>counts[j]-counts[i]);
    S.keepColors=new Set(order.slice(0,Math.min(3,k)));
    C.forEach((c,idx)=>{
      const sw=document.createElement('button');
      sw.className='chip'; sw.style.background=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
      sw.style.borderColor='#bdaaa5'; sw.title=`Keep color`;
      const active= S.keepColors.has(idx);
      if(active){ sw.classList.add('chip--active'); }
      sw.addEventListener('click',()=>{
        if(S.keepColors.has(idx)) S.keepColors.delete(idx); else S.keepColors.add(idx);
        sw.classList.toggle('chip--active');
        window.EAS_preview.render();
      });
      sw.dataset.index=idx; palette.appendChild(sw);
    });
    S.palette=C;
    window.EAS_preview.render();
  }

  $('#recolor').addEventListener('click',()=>quantize(+$('#color-count').value||5));
  $('#color-count').addEventListener('change',e=>quantize(+e.target.value||5));
  $('#autohighlight').addEventListener('click',()=>quantize(+$('#color-count').value||5));

})();