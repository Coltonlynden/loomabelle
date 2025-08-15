
/* Loomabelle runtime – v11.3
   Fixes: iOS Safari refresh/scroll, stable canvas sizing, tab switch reliability,
   hide/show Upload vs Preview, enable draw toolbar, process drawing, preview only after media.
   (No HTML/CSS changes required.)
*/
(function(){
  // ----------------- tiny helpers -----------------
  var UA=navigator.userAgent||'';
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function on(el,ev,fn,opt){ el&&el.addEventListener(ev,fn,opt||false); }
  function dpr(){ return Math.min(2.5, window.devicePixelRatio||1); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function cssPXPoint(e,canvas){ var r=canvas.getBoundingClientRect(); var p=e.touches?e.touches[0]:e; return {x:p.clientX-r.left, y:p.clientY-r.top}; }
  function debounce(fn,ms){ var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(function(){ fn.apply(null,a); },ms); }; }

  // ----------------- block accidental refresh -----------------
  document.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();},true);
  document.addEventListener('click',e=>{
    var b=e.target&&e.target.closest&&e.target.closest('button'); if(b&&!b.type) b.type='button';
    var a=e.target&&e.target.closest&&e.target.closest('a[href="#"]'); if(a) e.preventDefault();
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter' && e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) e.preventDefault();
  },true);

  // ----------------- fetch DOM (keeps your structure) -----------------
  var tabUploadBtn = $('.tab-btn[data-tab="upload"]') || $$('button,a').find(b=>/upload\s*photo/i.test(b.textContent||'')),
      tabDrawBtn   = $('.tab-btn[data-tab="draw"]')   || $$('button,a').find(b=>/draw.*trace/i.test(b.textContent||''));
  var panelUpload  = $('.panel[data-panel="upload"]');
  var panelDraw    = $('.panel[data-panel="draw"]');
  var uploadZone   = $('.upload-zone');           // drop/click area
  var previewHost  = $('.preview') || $('.col.card.rose .preview'); // stitched preview canvas container
  var drawHost     = $('.panel[data-panel="draw"] .canvas') || $('.canvas'); // drawing canvas container

  if(!tabUploadBtn||!tabDrawBtn||!panelUpload||!panelDraw||!uploadZone||!previewHost||!drawHost){
    console.error('Loomabelle: expected elements not found.'); return;
  }
  if(getComputedStyle(previewHost).position==='static') previewHost.style.position='relative';

  // ----------------- state -----------------
  var STATE={
    lastImage:null,
    stitches:[],
    subject:{enabled:false,rect:null,noSubject:false},
    busy:false,
    processed:false,
    // memo heights so canvases don’t “creep”
    memo:{preview:{w:0,h:0}, upload:{w:0,h:0}, draw:{w:0,h:0}}
  };

  // ----------------- canvases -----------------
  // preview (stitches-only)
  var prev=document.createElement('canvas'), pctx=prev.getContext('2d',{alpha:true,willReadFrequently:true});
  prev.style.display='block'; prev.classList.add('loomabelle-canvas');
  previewHost.innerHTML=''; previewHost.appendChild(prev);

  // upload (photo before processing)
  var photoCanvas=document.createElement('canvas'), photoCtx=photoCanvas.getContext('2d',{alpha:true});
  photoCanvas.classList.add('loomabelle-canvas');
  uploadZone.innerHTML=''; uploadZone.appendChild(photoCanvas);

  // draw canvas
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d',{alpha:true,willReadFrequently:true});
  dctx.lineCap='round'; dctx.lineJoin='round';
  draw.classList.add('loomabelle-canvas');
  drawHost.innerHTML=''; drawHost.appendChild(draw);

  // ----------------- preview toolbar & progress -----------------
  var toolbar=make('div','lb-toolbar');
  var btnProcess=make('button','btn','Process Photo'); btnProcess.type='button';
  var btnHighlight=make('button','btn','Highlight Subject'); btnHighlight.type='button';
  var btnAnother=make('button','btn','Choose another photo'); btnAnother.type='button';
  var lblNo=make('label','lb-no',''); var chkNo=document.createElement('input'); chkNo.type='checkbox';
  lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
  toolbar.append(btnProcess,btnHighlight,lblNo,btnAnother); previewHost.appendChild(toolbar);

  var overlay=make('div','lb-progress');
  var ring=make('div','ring'), barwrap=make('div','barwrap'), bar=make('div','bar');
  barwrap.appendChild(bar); overlay.append(ring,barwrap); previewHost.appendChild(overlay);

  // minimal CSS (doesn’t change theme)
  (function css(){
    var s=document.createElement('style'); s.textContent=
      ".loomabelle-canvas{touch-action:none}"
      +".lb-toolbar{position:absolute;left:10px;right:10px;bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;z-index:5}"
      +".lb-progress{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:6}"
      +".lb-progress .ring{width:48px;height:48px;border-radius:9999px;border:4px solid rgba(0,0,0,.12);border-top-color:#93c5fd;animation:lbspin 1s linear infinite}"
      +".lb-progress .barwrap{position:absolute;left:10%;right:10%;bottom:10px;height:6px;background:rgba(0,0,0,.08);border-radius:6px;overflow:hidden}"
      +".lb-progress .bar{height:100%;width:0%;background:linear-gradient(90deg,#f472b6,#93c5fd,#86efac);transition:width .2s ease}"
      +"@keyframes lbspin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  })();

  // ----------------- tab switching -----------------
  function setActiveTab(name){
    if(name==='upload'){
      tabUploadBtn.classList.add('active'); tabDrawBtn.classList.remove('active');
      panelUpload.classList.add('active'); panelDraw.classList.remove('active');
    }else{
      tabDrawBtn.classList.add('active'); tabUploadBtn.classList.remove('active');
      panelDraw.classList.add('active'); panelUpload.classList.remove('active');
    }
    // keep canvases stable after switch
    setTimeout(resizeAll,20);
  }
  on(tabUploadBtn,'click',e=>{e.preventDefault(); setActiveTab('upload');});
  on(tabDrawBtn,'click',e=>{e.preventDefault(); setActiveTab('draw');});

  // ----------------- show/hide rules you asked for -----------------
  var previewCard = previewHost.closest('.card') || previewHost.parentNode;
  var uploadCard  = uploadZone.closest('.card')  || uploadZone.parentNode;

  function showPreviewOnly(){
    if(uploadCard) uploadCard.style.display='none';
    if(previewCard) previewCard.style.display='';
  }
  function showUploadOnly(){
    if(uploadCard) uploadCard.style.display='';
    if(previewCard) previewCard.style.display='none';
  }
  // start with preview hidden
  showUploadOnly();

  // ----------------- stable canvas sizing (no creeping) -----------------
  function innerWidth(el){
    var r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    return Math.max(0, r.width - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0)
                         - (parseFloat(cs.borderLeftWidth)||0) - (parseFloat(cs.borderRightWidth)||0))|0;
  }
  function sizeCanvas(canvas, host, memoKey){
    // Use a fixed aspect (16:9) derived once from host width; only update if width actually changed.
    var W=innerWidth(host); if(!W||W<60) W=(STATE.memo[memoKey].w||640);
    var H=Math.max(240, Math.round(W*9/16));
    if(STATE.memo[memoKey].w===W && STATE.memo[memoKey].h===H) return;
    var scale=dpr();
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    canvas.width=Math.round(W*scale); canvas.height=Math.round(H*scale);
    canvas.getContext('2d').setTransform(scale,0,0,scale,0,0);
    STATE.memo[memoKey]={w:W,h:H,scale:scale};
  }
  var resizeAll=debounce(function(){
    sizeCanvas(prev, previewHost, 'preview');
    sizeCanvas(photoCanvas, uploadZone, 'upload');
    sizeCanvas(draw, drawHost, 'draw');
    render(); drawSelection();
  },60);
  try{
    new ResizeObserver(resizeAll).observe(previewHost);
    new ResizeObserver(resizeAll).observe(uploadZone);
    new ResizeObserver(resizeAll).observe(drawHost);
  }catch(_){}
  on(window,'resize',resizeAll);

  // ----------------- file input & load -----------------
  var fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*';
  uploadZone.appendChild(fileInput);

  on(uploadZone,'click',e=>{ if(e.target===uploadZone) fileInput.click(); });
  on(uploadZone,'dragover',e=>e.preventDefault());
  on(uploadZone,'drop',e=>{ e.preventDefault(); var f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) loadImage(f); });
  on(fileInput,'change',()=>{ if(fileInput.files&&fileInput.files[0]) loadImage(fileInput.files[0]); });

  function showPhoto(img){
    sizeCanvas(photoCanvas, uploadZone, 'upload');
    var W=STATE.memo.upload.w, H=STATE.memo.upload.h, iw=img.width, ih=img.height;
    var s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    photoCtx.setTransform(1,0,0,1,0,0);
    photoCtx.clearRect(0,0,W,H);
    photoCtx.fillStyle='#fff'; photoCtx.fillRect(0,0,W,H);
    photoCtx.drawImage(img,ox,oy,w,h);
  }
  function loadImage(file){
    var img=new Image();
    img.onload=function(){
      STATE.lastImage=img; STATE.stitches=[]; STATE.processed=false; STATE.subject.rect=null;
      showPhoto(img);
      // show preview section only after a photo exists
      showPreviewOnly(); setActiveTab('upload'); render();
    };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous'; img.src=URL.createObjectURL(file);
  }

  // ----------------- highlight subject (in Upload area) -----------------
  var hiStart=null, hiActive=false;
  function lockScroll(){ document.documentElement.style.overscrollBehavior='contain'; document.body.style.overscrollBehavior='contain'; }
  function unlockScroll(){ document.documentElement.style.overscrollBehavior='auto';   document.body.style.overscrollBehavior='auto'; }

  function drawSelection(){
    if(!STATE.lastImage || !STATE.subject.rect) return;
    showPhoto(STATE.lastImage);
    var r=STATE.subject.rect;
    photoCtx.save();
    photoCtx.strokeStyle='rgba(20,20,20,.95)'; photoCtx.setLineDash([6,6]); photoCtx.lineWidth=1;
    photoCtx.strokeRect(r.x,r.y,r.w,r.h);
    photoCtx.restore();
  }
  on(photoCanvas,'pointerdown',function(e){
    if(!STATE.lastImage || !STATE.subject.enabled) return;
    e.preventDefault(); lockScroll();
    try{ photoCanvas.setPointerCapture && photoCanvas.setPointerCapture(e.pointerId); }catch(_){}
    var p=cssPXPoint(e,photoCanvas); hiStart=[p.x,p.y]; hiActive=true;
    STATE.subject.rect={x:p.x,y:p.y,w:0,h:0}; drawSelection();
  },{passive:false});
  on(photoCanvas,'pointermove',function(e){
    if(!hiActive) return; e.preventDefault();
    var p=cssPXPoint(e,photoCanvas);
    STATE.subject.rect={x:Math.min(hiStart[0],p.x), y:Math.min(hiStart[1],p.y), w:Math.abs(p.x-hiStart[0]), h:Math.abs(p.y-hiStart[1])};
    drawSelection();
  },{passive:false});
  on(window,'pointerup',function(e){ if(hiActive){ e.preventDefault(); hiActive=false; unlockScroll(); drawSelection(); } },{passive:false});
  on(photoCanvas,'touchmove',e=>e.preventDefault(),{passive:false});

  // ----------------- draw tab (enable all buttons) -----------------
  // Enable any disabled buttons from the mock
  $$('.panel[data-panel="draw"] .toolbar .btn, .panel[data-panel="draw"] button, .panel[data-panel="draw"] .btn').forEach(function(b){
    b.disabled=false; b.removeAttribute('aria-disabled'); b.style.pointerEvents='auto'; if(!b.type) b.type='button';
  });

  var tool='pen', drawing=false, history=[];
  on(draw,'pointerdown',function(e){
    e.preventDefault(); lockScroll();
    try{ draw.setPointerCapture && draw.setPointerCapture(e.pointerId); }catch(_){}
    var p=cssPXPoint(e,draw);
    if(tool==='fill'){ floodFill(dctx,p.x|0,p.y|0,'#111827'); snapshot(); unlockScroll(); return; }
    drawing=true; dctx.strokeStyle='#111827'; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(p.x,p.y);
  },{passive:false});
  on(draw,'pointermove',function(e){
    if(!drawing) return; e.preventDefault();
    var p=cssPXPoint(e,draw);
    if(tool==='pen'){ dctx.lineTo(p.x,p.y); dctx.stroke(); }
    else if(tool==='eraser'){ dctx.clearRect(p.x-6,p.y-6,12,12); }
  },{passive:false});
  on(window,'pointerup',function(e){ if(drawing){ e.preventDefault(); drawing=false; snapshot(); unlockScroll(); } },{passive:false});
  on(draw,'touchmove',e=>e.preventDefault(),{passive:false});

  function snapshot(){ history.push(draw.toDataURL()); if(history.length>40) history.shift(); }
  function floodFill(ctx,x,y,colorHex){
    function h2r(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');var n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255];}
    var rgb=h2r(colorHex),w=ctx.canvas.width,h=ctx.canvas.height,id=ctx.getImageData(0,0,w,h),d=id.data;
    function idx(a,b){return (b*w+a)*4;}
    var t=[d[idx(x,y)],d[idx(x,y)+1],d[idx(x,y)+2],d[idx(x,y)+3]];
    var q=[[x,y]], seen=new Uint8Array(w*h);
    while(q.length){
      var pt=q.pop(), cx=pt[0], cy=pt[1]; if(cx<0||cy<0||cx>=w||cy>=h) continue;
      var i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
      if(d[i]!==t[0]||d[i+1]!==t[1]||d[i+2]!==t[2]||d[i+3]!==t[3]) continue;
      d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; d[i+3]=255;
      q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(id,0,0);
  }

  // map existing toolbar buttons by order (Pen/Eraser/Fill/Fabric/Stitch guides/Undo)
  (function wireDrawToolbar(){
    var btns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    btns.forEach(function(b,i){
      var kind=map[i]||'pen';
      on(b,'click',function(e){
        e.preventDefault();
        if(kind==='undo'){ if(history.length<2) return; history.pop(); var img=new Image(); img.onload=()=>{ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); }; img.src=history[history.length-1]; return; }
        if(kind==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return; }
        if(kind==='guides'){ render(); return; }
        tool=kind;
      });
    });
    // Add "Process Drawing" button if it doesn't exist
    var bar=(btns[0]&&btns[0].parentNode)||drawHost.parentNode;
    if(!$$('.panel[data-panel="draw"] .toolbar .btn').some(x=>/process/i.test(x.textContent||''))){
      var go=make('button','btn','Process Drawing'); go.type='button'; go.style.marginLeft='10px';
      bar && bar.appendChild(go);
      on(go,'click',function(e){ e.preventDefault(); processDrawing(true); });
    }
  })();

  // ----------------- progress UI -----------------
  var raf=0, spin=0;
  function progressStart(){ overlay.style.display='flex'; bar.style.width='0%'; spin=0; raf=requestAnimationFrame(spinTick); }
  function progressSet(v){ bar.style.width=clamp(v,0,100)+'%'; }
  function progressDone(){ cancelAnimationFrame(raf||0); bar.style.width='100%'; setTimeout(()=>{ overlay.style.display='none'; },200); }
  function spinTick(){ ring.style.transform='rotate('+spin+'deg)'; spin=(spin+8)%360; raf=requestAnimationFrame(spinTick); }

  // ----------------- simple raster->mask->paths->stitches -----------------
  function rasterize(img,maxSide){ var s=Math.min(1,maxSide/Math.max(img.width,img.height)), w=(img.width*s)|0,h=(img.height*s)|0; var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h); return {ctx:x,w:w,h:h}; }
  function toGray(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, g=new Uint8Array(w*h); for(var i=0;i<w*h;i++){ var p=i*4; g[i]=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])|0; } return g; }
  function otsu(g,w,h){ var hist=new Uint32Array(256),i; for(i=0;i<w*h;i++) hist[g[i]]++; var sum=0,N=w*h; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,max=0,thr=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; var wF=N-wB; if(!wF) break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>max){max=v;thr=i;} } return thr; }
  function bin(g,w,h,t){ var m=new Uint8Array(w*h); for(var i=0;i<w*h;i++) m[i]=g[i]>t?0:1; return m; }
  function cropToSubject(mask,w,h){
    if(!STATE.lastImage || !STATE.subject.rect || !STATE.subject.enabled || STATE.subject.noSubject) return;
    var f=STATE.imgFit, r=STATE.subject.rect;
    var sx=Math.max(0,Math.floor((r.x-f.ox)/f.scale)), sy=Math.max(0,Math.floor((r.y-f.oy)/f.scale));
    var ex=Math.min(w-1,Math.floor((r.x+r.w-f.ox)/f.scale)), ey=Math.min(h-1,Math.floor((r.y+r.h-f.oy)/f.scale));
    for(var y=0;y<h;y++) for(var x=0;x<w;x++) if(!(x>=sx&&x<=ex&&y>=sy&&y<=ey)) mask[y*w+x]=0;
  }
  function trace(mask,w,h){
    var paths=[], seen=new Uint8Array(w*h);
    function idx(x,y){return y*w+x;}
    function tr(sx,sy){ var x=sx,y=sy,dir=0,p=[],it=0,max=w*h*8;
      while(it++<max){
        var a=mask[idx(x,y)]?1:0,b=mask[idx(x+1,y)]?1:0,c=mask[idx(x+1,y+1)]?1:0,d=mask[idx(x,y+1)]?1:0;
        var code=a+b*2+c*4+d*8;
        if(code===0||code===15){ if(dir===0)x++; else if(dir===1)y++; else if(dir===2)x--; else y--; }
        else{
          if(code===1||code===5||code===13){ p.push([x,y+0.5]); dir=3; x--; }
          else if(code===8||code===10||code===11){ p.push([x+0.5,y+1]); dir=0; y++; }
          else if(code===4||code===12||code===14){ p.push([x+1,y+0.5]); dir=1; x++; }
          else if(code===2||code===3||code===7){ p.push([x+0.5,y]); dir=2; y--; }
          if(x<0||y<0||x>=w-1||y>=h-1) break;
          if(x===sx&&y===sy && p.length>12) break;
        }
      } return p;
    }
    for(var y=0;y<h-1;y++) for(var x=0;x<w-1;x++){
      var i=idx(x,y); if(seen[i]) continue;
      var code=(mask[i]?1:0)+(mask[i+1]?2:0)+(mask[i+w+1]?4:0)+(mask[i+w]?8:0);
      if(code!==0 && code!==15){
        var path=tr(x,y);
        for(var k=0;k<path.length;k++){ var px=path[k][0]|0, py=path[k][1]|0; seen[idx(px,py)]=1; }
        if(path.length>10) paths.push(path);
      }
    }
    return paths;
  }
  function pathsToStitches(paths, outW, outH){
    var stitches=[]; if(!paths||!paths.length) return stitches;
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p;
    for(i=0;i<paths.length;i++) for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; }
    var w=maxx-minx,h=maxy-miny,margin=20,sx=(outW-2*margin)/w,sy=(outH-2*margin)/h,s=Math.min(sx,sy);
    var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){ var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy});
    }
    return stitches;
  }

  // ----------------- render preview -----------------
  function render(){
    sizeCanvas(prev, previewHost, 'preview');
    var W=STATE.memo.preview.w, H=STATE.memo.preview.h;
    pctx.setTransform(1,0,0,1,0,0);
    pctx.clearRect(0,0,W,H);
    pctx.fillStyle='#fff'; pctx.fillRect(0,0,W,H);
    pctx.strokeStyle='#111827'; pctx.lineWidth=1.6; pctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){ var s=STATE.stitches[i]; if(s.cmd==='jump') pctx.moveTo(s.x,s.y); else pctx.lineTo(s.x,s.y); }
    pctx.stroke();
  }

  // ----------------- progress helpers -----------------
  var rafSpin=0, spinAng=0;
  function progressStart(){ overlay.style.display='flex'; bar.style.width='0%'; spinAng=0; rafSpin=requestAnimationFrame(spinTick); }
  function progressSet(v){ bar.style.width=clamp(v,0,100)+'%'; }
  function progressDone(){ cancelAnimationFrame(rafSpin||0); bar.style.width='100%'; setTimeout(()=>overlay.style.display='none',200); }
  function spinTick(){ ring.style.transform='rotate('+spinAng+'deg)'; spinAng=(spinAng+8)%360; rafSpin=requestAnimationFrame(spinTick); }

  // ----------------- actions -----------------
  function processPhoto(img){
    if(STATE.busy) return;
    STATE.busy=true; progressStart(); progressSet(12);
    try{
      var r=rasterize(img,896); progressSet(28);
      var g=toGray(r.ctx,r.w,r.h); progressSet(46);
      var t=otsu(g,r.w,r.h);      progressSet(56);
      var m=bin(g,r.w,r.h,t);     progressSet(66);
      cropToSubject(m,r.w,r.h);   progressSet(78);
      var paths=trace(m,r.w,r.h); progressSet(92);
      STATE.stitches=pathsToStitches(paths, STATE.memo.preview.w, STATE.memo.preview.h);
      STATE.busy=false; progressDone(); STATE.processed=true; render();
    }catch(err){ STATE.busy=false; progressDone(); alert('Processing failed: '+(err&&err.message||err)); }
  }
  function processDrawing(switchToPreview){
    if(STATE.busy) return;
    STATE.busy=true; progressStart(); progressSet(14);
    try{
      var w=draw.width,h=draw.height,id=dctx.getImageData(0,0,w,h),d=id.data;
      var max=896,s=Math.min(1,max/Math.max(w,h)), sw=(w*s)|0, sh=(h*s)|0;
      var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var tctx=tmp.getContext('2d');
      var g=new ImageData(w,h); for(var i=0;i<w*h;i++){ var a=d[i*4+3]; g.data[i*4]=a; g.data[i*4+1]=a; g.data[i*4+2]=a; g.data[i*4+3]=255; }
      dctx.putImageData(g,0,0);   progressSet(45);
      tctx.drawImage(draw,0,0,sw,sh); progressSet(62);
      var id2=tctx.getImageData(0,0,sw,sh), m=new Uint8Array(sw*sh); for(i=0;i<sw*sh;i++){ m[i]=id2.data[i*4]>0?1:0; }
      var paths=trace(m,sw,sh);   progressSet(88);
      STATE.stitches=pathsToStitches(paths, STATE.memo.preview.w, STATE.memo.preview.h);
      STATE.busy=false; progressDone(); STATE.processed=true; render();
      if(switchToPreview){ showPreviewOnly(); setActiveTab('upload'); }
    }catch(err){ STATE.busy=false; progressDone(); alert('Processing drawing failed: '+(err&&err.message||err)); }
  }

  // ----------------- wire buttons -----------------
  on(btnProcess,'click',e=>{ e.preventDefault(); if(!STATE.lastImage){ alert('Upload a photo first'); return; } processPhoto(STATE.lastImage); });
  on(btnHighlight,'click',e=>{ e.preventDefault(); STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; drawSelection(); });
  on(btnAnother,'click',e=>{ e.preventDefault(); showUploadOnly(); setActiveTab('upload'); fileInput.click(); });
  on(chkNo,'change',()=>{ STATE.subject.noSubject=chkNo.checked; });

  // ----------------- init -----------------
  // hide any “mockup only” badges quietly
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(n){ if((n.textContent||'').toLowerCase().includes('mock')) n.style.display='none'; });
  setActiveTab('upload');
  resizeAll();
})();