// Upload + keep original pixels + simple edges preview
(function(){
  const $=(s,r=document)=>r.querySelector(s);
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
        const v = (dx+dy)/2;
        out.data[i]=out.data[i+1]=out.data[i+2]=0; out.data[i+3]=v>60?90:0;
      }
    }
    edges.putImageData(out,0,0);
  }

  function fitAndDraw(img){
    bctx.clearRect(0,0,1024,1024);
    const r=img.width/img.height;
    let w,h,sx,sy;
    if(r>1){ h=1024; w=Math.round(h*r); sx=(w-1024)/2; sy=0; }
    else   { w=1024; h=Math.round(w/r); sx=0; sy=(h-1024)/2; }
    bctx.drawImage(img,-sx,-sy,w,h);
    // store ORIGINAL, never overwritten
    S.srcData = bctx.getImageData(0,0,1024,1024); 
    drawEdges();
    window.EAS_preview.render();
  }

  $('#file').addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const img=new Image(); img.onload=()=>fitAndDraw(img); img.src=URL.createObjectURL(f);
  });

  // Auto highlight just fills the mask lightly for a head start
  $('#autohighlight').addEventListener('click',()=>{
    const mctx=document.getElementById('mask').getContext('2d');
    mctx.globalCompositeOperation='source-over';
    mctx.fillStyle='rgba(0,0,0,0.6)';
    mctx.fillRect(128,128,768,768);
    window.EAS_preview.render();
  });
})();