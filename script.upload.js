(function(){
  const file = document.getElementById('file');
  const imgC = document.getElementById('imageCanvas');
  const maskC= document.getElementById('maskCanvas');
  const edgesC=document.getElementById('edgesCanvas');
  const autoh = document.getElementById('btn-autoh');
  const detail= document.getElementById('detail');
  const zIn = document.getElementById('zin');
  const zOut= document.getElementById('zout');
  const zLab= document.getElementById('zlabel');

  if(!file||!imgC||!maskC) return;

  const S={
    img:null,w:0,h:0,zoom:1, panX:0,panY:0, dragging:false, lastX:0,lastY:0
  };

  function fitCanvas(w,h){
    imgC.width=w; imgC.height=h;
    maskC.width=w; maskC.height=h;
    edgesC.width=w; edgesC.height=h;
  }

  function draw(){
    if(!S.img) return;
    const g=imgC.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,imgC.width,imgC.height);
    g.save();
    g.translate(S.panX,S.panY);
    g.scale(S.zoom,S.zoom);
    g.drawImage(S.img,0,0,S.w,S.h);
    g.restore();
  }

  function loadImage(fileObj){
    const url=URL.createObjectURL(fileObj);
    const img=new Image(); img.onload=()=>{
      S.img=img; S.w=img.width; S.h=img.height;
      fitCanvas(S.w,S.h);
      S.zoom=1; S.panX=0; S.panY=0; zLab.textContent='100%';
      const m=maskC.getContext('2d'); m.clearRect(0,0,maskC.width,maskC.height);
      draw(); detectEdges();
      URL.revokeObjectURL(url);
    };
    img.src=url;
  }

  function detectEdges(){
    const g=edgesC.getContext('2d',{willReadFrequently:true});
    const base=imgC.getContext('2d').getImageData(0,0,imgC.width,imgC.height);
    const {width:w,height:h,data:A}=base;
    const G=new Uint8ClampedArray(w*h);
    // Sobel
    function at(x,y,c=0){const i=(y*w+x)*4; return A[i+c];}
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const gx= -at(x-1,y-1)+at(x+1,y-1) + -2*at(x-1,y)+2*at(x+1,y) + -at(x-1,y+1)+at(x+1,y+1);
        const gy= -at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1) + at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
        G[y*w+x]= Math.min(255, Math.hypot(gx,gy)|0);
      }
    }
    const img=g.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const v=G[i]; img.data[i*4+0]=img.data[i*4+1]=img.data[i*4+2]=v; img.data[i*4+3]=80;
    }
    g.putImageData(img,0,0);
  }

  file.addEventListener('change', e=>{
    const f=e.target.files&&e.target.files[0]; if(f) loadImage(f);
  });

  autoh?.addEventListener('click', ()=>{
    if(!S.img) return;
    // magic-wand like from image center, tolerance tied to detail slider
    const g=imgC.getContext('2d',{willReadFrequently:true});
    const {width:w,height:h}=imgC;
    const src=g.getImageData(0,0,w,h); const A=src.data;
    const m=maskC.getContext('2d'); const M=m.getImageData(0,0,w,h);
    const B=M.data;

    const cx=w>>1, cy=h>>1, tol=20+Math.floor(80*(1-detail.value));
    const idx=(x,y)=> (y*w+x)*4;
    const seed=idx(cx,cy);
    const R=A[seed], G=A[seed+1], Bl=A[seed+2];

    const vis=new Uint8Array(w*h);
    const q=[[cx,cy]]; vis[cy*w+cx]=1;

    while(q.length){
      const [x,y]=q.pop(); const j=idx(x,y);
      const dr=Math.abs(A[j]-R)+Math.abs(A[j+1]-G)+Math.abs(A[j+2]-Bl);
      if(dr<tol*3){ B[j+3]=180; // mark
        if(x>0 && !vis[y*w+x-1]){vis[y*w+x-1]=1; q.push([x-1,y]);}
        if(x<w-1 && !vis[y*w+x+1]){vis[y*w+x+1]=1; q.push([x+1,y]);}
        if(y>0 && !vis[(y-1)*w+x]){vis[(y-1)*w+x]=1; q.push([x,y-1]);}
        if(y<h-1 && !vis[(y+1)*w+x]){vis[(y+1)*w+x]=1; q.push([x,y+1]);}
      }
    }
    m.putImageData(M,0,0);
  });

  // zoom/pan
  zIn?.addEventListener('click', ()=>{S.zoom=Math.min(8,S.zoom*1.25); zLab.textContent=((S.zoom*100)|0)+'%'; draw();});
  zOut?.addEventListener('click', ()=>{S.zoom=Math.max(0.25,S.zoom/1.25); zLab.textContent=((S.zoom*100)|0)+'%'; draw();});
  imgC.addEventListener('pointerdown', e=>{ if(!e.altKey) return; S.dragging=true; S.lastX=e.clientX; S.lastY=e.clientY; imgC.setPointerCapture(e.pointerId); });
  imgC.addEventListener('pointermove', e=>{ if(!S.dragging) return; S.panX+=e.clientX-S.lastX; S.panY+=e.clientY-S.lastY; S.lastX=e.clientX; S.lastY=e.clientY; draw();});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> imgC.addEventListener(ev, ()=> S.dragging=false));
})();