/* Loomabelle — v9.8
/* Loomabelle runtime – keep look/markup, wire features only
   v10.1 — fixes tab switching, preview visibility, iOS refresh, drawing offset,
   toolbar pinned inside preview, upload<->preview flow
*/
(function () {
  // ---------- helpers ----------
  var UA = navigator.userAgent || '';
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function on(el, ev, fn, opt) { el && el.addEventListener(ev, fn, opt || false); }
  function dpr() { return window.devicePixelRatio || 1; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function make(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function debounce(fn, ms) { var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(function(){ fn.apply(null,a); }, ms);} }

  // ---------- kill all accidental refreshes ----------
  document.addEventListener('submit', function(e){ e.preventDefault(); e.stopPropagation(); }, true);
  document.addEventListener('click', function(e){
    var b=e.target && e.target.closest && e.target.closest('button');
    if(b && !b.getAttribute('type')) b.setAttribute('type','button');
    var a=e.target && e.target.closest && e.target.closest('a[href="#"]'); if(a) e.preventDefault();
  }, true);
  document.addEventListener('keydown', function(e){
    if(e.key==='Enter' && e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) e.preventDefault();
  }, true);

  // hide mockup badges if any
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(n){
    if((n.textContent||'').toLowerCase().includes('mock')) n.style.display='none';
  });

  // ---------- find existing DOM ----------
  var tabUploadBtn = $('.tab-btn[data-tab="upload"]') || $$('button').find(b=>/upload/i.test(b.textContent||'')),
      tabDrawBtn   = $('.tab-btn[data-tab="draw"]')   || $$('button').find(b=>/draw/i.test(b.textContent||''));
  var panelUpload = $('.panel[data-panel="upload"]'),
      panelDraw   = $('.panel[data-panel="draw"]');

  var uploadZone  = $('.upload-zone');
  var previewHost = $('.col.card.rose .preview') || $('.preview');
  var drawHost    = $('.panel[data-panel="draw"] .canvas') || $('.canvas');

  if (!panelUpload || !panelDraw || !uploadZone || !previewHost || !drawHost) {
    console.error('Loomabelle: missing expected elements.'); return;
  }
  if (getComputedStyle(previewHost).position === 'static') previewHost.style.position = 'relative';

  // ---------- canvases ----------
  // preview (stitches only)
  var prev = document.createElement('canvas');
  var pctx = prev.getContext('2d', { alpha: true, willReadFrequently: true });
  prev.style.display = 'block';
  prev.classList.add('loomabelle-canvas');
  previewHost.innerHTML = '';
  previewHost.appendChild(prev);

  // upload thumb (photo before processing)
  var photoCanvas = document.createElement('canvas');
  var photoCtx = photoCanvas.getContext('2d', { alpha: true });
  photoCanvas.classList.add('loomabelle-canvas');
  uploadZone.innerHTML = '';
  uploadZone.appendChild(photoCanvas);

  // draw canvas
  var draw = document.createElement('canvas');
  var dctx = draw.getContext('2d', { alpha: true, willReadFrequently: true });
  dctx.lineCap = 'round'; dctx.lineJoin = 'round';
  draw.classList.add('loomabelle-canvas');
  drawHost.innerHTML = '';
  drawHost.appendChild(draw);

  // ---------- state ----------
  var STATE = {
    stitches: [],
    lastImage: null,
    imgFit: null,
    subject: { enabled:false, rect:null, noSubject:false },
    busy:false,
    processed:false,
    lastPreview:{w:0,h:0,scale:1},
    lastUpload:{w:0,h:0,scale:1},
    lastDraw:{w:0,h:0,scale:1}
  };

  // ---------- preview toolbar (pinned at bottom, inside viewport) ----------
  var toolbar = make('div','lb-toolbar'); // minimal CSS injected below
  var btnProcess   = make('button','btn','Process Photo'); btnProcess.type='button';
  var btnHighlight = make('button','btn','Highlight Subject'); btnHighlight.type='button';
  var btnAnother   = make('button','btn','Choose another photo'); btnAnother.type='button';
  var lblNo = make('label',null,''); var chkNo = document.createElement('input'); chkNo.type='checkbox';
  lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
  toolbar.append(btnProcess, btnHighlight, lblNo, btnAnother);
  previewHost.appendChild(toolbar);

  // progress overlay
  var overlay = make('div','lb-progress');
  var ring = make('div','ring');
  var barW = make('div','barwrap'), bar = make('div','bar'); barW.appendChild(bar);
  overlay.append(ring, barW); previewHost.appendChild(overlay);

  // ---------- micro CSS (no theme changes) ----------
  (function addCSS(){
    var css = ""
      + ".loomabelle-canvas{touch-action:none}"
      + ".lb-toolbar{position:absolute;left:10px;right:10px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-start;z-index:5}"
      + ".lb-progress{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:6}"
      + ".lb-progress .ring{width:48px;height:48px;border-radius:999px;border:4px solid rgba(0,0,0,.12);border-top-color:#93c5fd;animation:lbspin 1s linear infinite}"
      + ".lb-progress .barwrap{position:absolute;left:10%;right:10%;bottom:10px;height:6px;background:rgba(0,0,0,.08);border-radius:6px;overflow:hidden}"
      + ".lb-progress .bar{height:100%;width:0%;background:linear-gradient(90deg,#f472b6,#93c5fd,#86efac);transition:width .2s ease}"
      + "@keyframes lbspin{to{transform:rotate(360deg)}}";
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

  // ---------- tab switching (works with your buttons) ----------
  function activateTab(name){
    if(name==='upload'){
      tabUploadBtn && tabUploadBtn.classList.add('active');
      tabDrawBtn && tabDrawBtn.classList.remove('active');
      panelUpload.classList.add('active');
      panelDraw.classList.remove('active');
    }else{
      tabDrawBtn && tabDrawBtn.classList.add('active');
      tabUploadBtn && tabUploadBtn.classList.remove('active');
      panelDraw.classList.add('active');
      panelUpload.classList.remove('active');
    }
    setTimeout(resizeAll,30);
  }
  on(tabUploadBtn,'click',function(e){ e.preventDefault(); activateTab('upload'); });
  on(tabDrawBtn,'click',function(e){ e.preventDefault(); activateTab('draw'); });

  // ---------- visibility rules you asked for ----------
  var previewCard = previewHost.closest('.card') || previewHost.parentNode;
  function showPreviewOnly(){
    // Hide upload zone (not the entire card chrome)
    photoCanvas.style.display = 'none';
    // Show preview card
    if(previewCard) previewCard.style.display = '';
  }
  function showUploadOnly(){
    photoCanvas.style.display = '';
    // Hide preview card until a photo/drawing available
    if(previewCard) previewCard.style.display = 'none';
  }
  // Start hidden
  showUploadOnly();

  // ---------- sizing ----------
  function innerWidth(el){
    var r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    return Math.max(0, r.width - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0)
                         - (parseFloat(cs.borderLeftWidth)||0) - (parseFloat(cs.borderRightWidth)||0))|0;
  }
  function sizeCanvas(canvas, host, memoKey){
    var cssW = innerWidth(host) || (STATE[memoKey]&&STATE[memoKey].w) || 640;
    var cssH = Math.max(220, Math.floor(cssW*9/16));
    var scale = Math.min(dpr(), /iPad|iPhone|iPod/.test(UA)?1.5:2.5);
    if(STATE[memoKey] && STATE[memoKey].w===cssW && STATE[memoKey].h===cssH) return;
    canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
    canvas.width  = Math.round(cssW*scale);
    canvas.height = Math.round(cssH*scale);
    canvas.getContext('2d').setTransform(scale,0,0,scale,0,0);
    STATE[memoKey] = {w:cssW,h:cssH,scale:scale};
  }
  var resizeAll = debounce(function(){
    sizeCanvas(prev, previewHost, 'lastPreview');
    sizeCanvas(photoCanvas, uploadZone, 'lastUpload');
    sizeCanvas(draw, drawHost, 'lastDraw');
    render(); drawSelection();
  }, 50);
  try{
    new ResizeObserver(resizeAll).observe(previewHost);
    new ResizeObserver(resizeAll).observe(uploadZone);
    new ResizeObserver(resizeAll).observe(drawHost);
  }catch(_){}
  on(window, 'resize', resizeAll);

  // ---------- file input / drop ----------
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*';
  uploadZone.appendChild(fileInput);
  on(fileInput,'change',function(){ if(fileInput.files && fileInput.files[0]) loadImage(fileInput.files[0]); });
  on(uploadZone,'dragover',function(e){ e.preventDefault(); });
  on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files && e.dataTransfer.files[0]; if(f) loadImage(f); });
  on(uploadZone,'click',function(e){ if(e.target===uploadZone) fileInput.click(); });

  // ---------- show uploaded photo inside upload area ----------
  function showPhoto(img){
    sizeCanvas(photoCanvas, uploadZone, 'lastUpload');
    var W=STATE.lastUpload.w, H=STATE.lastUpload.h, iw=img.width, ih=img.height;
    var s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    photoCtx.setTransform(1,0,0,1,0,0);
    photoCtx.clearRect(0,0,W,H);
    photoCtx.fillStyle='#fff'; photoCtx.fillRect(0,0,W,H);
    photoCtx.drawImage(img, ox, oy, w, h);
  }
  function loadImage(file){
    var img=new Image();
    img.onload=function(){
      STATE.lastImage=img; STATE.stitches=[]; STATE.processed=false;
      showPhoto(img);
      // Switch to upload tab (your preview card sits in this tab)
      activateTab('upload');
      // Hide upload area and show preview like you asked
      showPreviewOnly();
      render();
    };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous'; img.src=URL.createObjectURL(file);
  }

  // ---------- highlight subject (draw rectangle on photo) ----------
  var highStart=null, highOn=false;
  function lockScroll(){ document.documentElement.style.overscrollBehavior='contain'; document.body.style.overscrollBehavior='contain'; }
  function unlockScroll(){ document.documentElement.style.overscrollBehavior='auto'; document.body.style.overscrollBehavior='auto'; }
  function cssPoint(e, canvas){
    var r=canvas.getBoundingClientRect();
    var x=(e.clientX!=null?e.clientX:(e.touches&&e.touches[0].clientX))-r.left;
    var y=(e.clientY!=null?e.clientY:(e.touches&&e.touches[0].clientY))-r.top;
    return {x:x, y:y};
  }
  function drawSelection(){
    if(!STATE.lastImage || !STATE.subject.rect) return;
    showPhoto(STATE.lastImage);
    var r=STATE.subject.rect;
    photoCtx.save();
    photoCtx.strokeStyle='rgba(20,20,20,.95)';
    photoCtx.setLineDash([6,6]);
    photoCtx.lineWidth=1;
    photoCtx.strokeRect(r.x,r.y,r.w,r.h);
    photoCtx.restore();
  }
  on(photoCanvas,'pointerdown',function(e){
    if(!STATE.lastImage || !STATE.subject.enabled) return;
    e.preventDefault(); lockScroll();
    try{ photoCanvas.setPointerCapture && photoCanvas.setPointerCapture(e.pointerId); }catch(_){}
    var pt=cssPoint(e,photoCanvas); highStart=[pt.x,pt.y]; highOn=true;
    STATE.subject.rect={x:pt.x,y:pt.y,w:0,h:0}; drawSelection();
  },{passive:false});
  on(photoCanvas,'pointermove',function(e){
    if(!highOn || !STATE.subject.enabled) return;
    e.preventDefault(); var pt=cssPoint(e,photoCanvas);
    STATE.subject.rect={x:Math.min(highStart[0],pt.x), y:Math.min(highStart[1],pt.y), w:Math.abs(pt.x-highStart[0]), h:Math.abs(pt.y-highStart[1])};
    drawSelection();
  },{passive:false});
  on(window,'pointerup',function(e){ if(highOn){ e.preventDefault(); highOn=false; unlockScroll(); drawSelection(); } },{passive:false});
  on(photoCanvas,'touchmove',function(e){ e.preventDefault(); },{passive:false});

  // ---------- draw tab ----------
  // fix pen offset (use CSS pixels)
  var tool='pen', drawing=false, active='#111827', history=[];
  on(draw,'pointerdown',function(e){
    e.preventDefault(); lockScroll();
    try{ draw.setPointerCapture && draw.setPointerCapture(e.pointerId); }catch(_){}
    var p=cssPoint(e,draw);
    if(tool==='fill'){ floodFill(dctx,p.x|0,p.y|0,active); snapshot(); unlockScroll(); return; }
    drawing=true; dctx.strokeStyle=active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(p.x,p.y);
  },{passive:false});
  on(draw,'pointermove',function(e){
    if(!drawing) return; e.preventDefault();
    var p=cssPoint(e,draw);
    if(tool==='pen'){ dctx.lineTo(p.x,p.y); dctx.stroke(); }
    else if(tool==='eraser'){ dctx.clearRect(p.x-6,p.y-6,12,12); }
  },{passive:false});
  on(window,'pointerup',function(e){ if(drawing){ e.preventDefault(); drawing=false; snapshot(); unlockScroll(); } },{passive:false});
  on(draw,'touchmove',function(e){ e.preventDefault(); },{passive:false});

  // toolbar buttons in your Draw panel
  (function wireDrawToolbar(){
    var btns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    btns.forEach(function(b,i){
      if(!b) return;
      if(b.tagName==='BUTTON' && !b.type) b.type='button';
      var t=map[i]||'pen';
      on(b,'click',function(e){
        e.preventDefault();
        if(t==='undo'){ if(history.length<2) return; history.pop(); var img=new Image(); img.onload=function(){ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); }; img.src=history[history.length-1]; return; }
        if(t==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return; }
        if(t==='guides'){ render(); return; }
        tool=t;
      });
    });
    // Add Process Drawing button and make it switch to preview
    var bar = (btns[0] && btns[0].parentNode) || drawHost.parentNode;
    var go = make('button','btn','Process Drawing'); go.type='button'; go.style.marginLeft='10px';
    bar && bar.appendChild(go);
    on(go,'click',function(e){ e.preventDefault(); processDrawing(true); });
  })();

  function snapshot(){ history.push(draw.toDataURL()); if(history.length>40) history.shift(); }

  function floodFill(ctx,x,y,hex){
    function hexToRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');var n=parseInt(h||'fff',16);return[(n>>16)&255,(n>>8)&255,n&255];}
    var rgb=hexToRgb(hex), r=rgb[0], g=rgb[1], b=rgb[2];
    var w=ctx.canvas.width, h=ctx.canvas.height;
    var id=ctx.getImageData(0,0,w,h), d=id.data;
    function idx(a,b){ return (b*w+a)*4; }
    var t=[d[idx(x,y)], d[idx(x,y)+1], d[idx(x,y)+2], d[idx(x,y)+3]];
    var q=[[x,y]], seen=new Uint8Array(w*h);
    while(q.length){
      var pt=q.pop(), cx=pt[0], cy=pt[1];
      if(cx<0||cy<0||cx>=w||cy>=h) continue;
      var i=idx(cx,cy); if(seen[cy*w+cx]) continue; seen[cy*w+cx]=1;
      if(d[i]!==t[0]||d[i+1]!==t[1]||d[i+2]!==t[2]||d[i+3]!==t[3]) continue;
      d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
      q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    ctx.putImageData(id,0,0);
  }

  // ---------- simple processing (edge > paths > stitches) ----------
  function rasterize(img,maxSide){ var s=Math.min(1,maxSide/Math.max(img.width,img.height)), w=(img.width*s)|0,h=(img.height*s)|0; var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h); return {ctx:x,w:w,h:h}; }
  function toGray(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, g=new Uint8Array(w*h); for(var i=0;i<w*h;i++){ var p=i*4; g[i]=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])|0;} return g; }
  function otsu(gray,w,h){ var hist=new Uint32Array(256),i; for(i=0;i<w*h;i++) hist[gray[i]]++; var sum=0,total=w*h; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,max=0,thr=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; var wF=total-wB; if(!wF) break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>max){max=v; thr=i;} } return thr; }
  function bin(gray,w,h,t){ var m=new Uint8Array(w*h); for(var i=0;i<w*h;i++) m[i]=gray[i]>t?0:1; return m; }
  function cropMask(mask,w,h){
    var f=STATE.imgFit, r=STATE.subject.rect; if(!STATE.lastImage || !r || !f || STATE.subject.noSubject) return;
    var sx=Math.max(0,Math.floor((r.x-f.ox)/f.scale)),
        sy=Math.max(0,Math.floor((r.y-f.oy)/f.scale)),
        ex=Math.min(w-1,Math.floor((r.x+r.w-f.ox)/f.scale)),
        ey=Math.min(h-1,Math.floor((r.y+r.h-f.oy)/f.scale));
    for(var y=0;y<h;y++) for(var x=0;x<w;x++) if(!(x>=sx&&x<=ex&&y>=sy&&y<=ey)) mask[y*w+x]=0;
  }
  function trace(mask,w,h){
    var paths=[], seen=new Uint8Array(w*h);
    function idx(x,y){return y*w+x;}
    function tr(sx,sy){ var x=sx,y=sy,dir=0,p=[],iter=0,max=w*h*8;
      while(iter++<max){
        var a=mask[idx(x,y)]?1:0, b=mask[idx(x+1,y)]?1:0, c=mask[idx(x+1,y+1)]?1:0, d=mask[idx(x,y+1)]?1:0;
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
        for(var k=0;k<path.length;k++){
          var px=Math.min(w-1,Math.max(0,path[k][0]|0)), py=Math.min(h-1,Math.max(0,path[k][1]|0));
          seen[idx(px,py)]=1;
        }
        if(path.length>10) paths.push(path);
      }
    }
    return paths;
  }
  function pathsToStitches(paths, outW, outH){
    var stitches=[], minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p;
    if(!paths||!paths.length) return stitches;
    for(i=0;i<paths.length;i++) for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; }
    var w=maxx-minx, h=maxy-miny, margin=20, sx=(outW-2*margin)/w, sy=(outH-2*margin)/h, s=Math.min(sx,sy);
    var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){ var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy});
    }
    return stitches;
  }

  // ---------- progress UI ----------
  var spinRAF=0, spin=0;
  function progressStart(){ overlay.style.display='flex'; bar.style.width='0%'; spin=0; spinRAF=requestAnimationFrame(spinTick); }
  function progressSet(v){ bar.style.width=clamp(v,0,100)+'%'; }
  function progressDone(){ cancelAnimationFrame(spinRAF||0); bar.style.width='100%'; setTimeout(function(){ overlay.style.display='none'; },200); }
  function spinTick(){ ring.style.transform='rotate('+spin+'deg)'; spin=(spin+8)%360; spinRAF=requestAnimationFrame(spinTick); }

  // ---------- render stitches on preview ----------
  function render(){
    sizeCanvas(prev, previewHost, 'lastPreview');
    var W=STATE.lastPreview.w, H=STATE.lastPreview.h;
    pctx.setTransform(1,0,0,1,0,0);
    pctx.clearRect(0,0,W,H);
    pctx.fillStyle='#fff'; pctx.fillRect(0,0,W,H);
    // draw stitch path
    pctx.strokeStyle='#111827'; pctx.lineWidth=1.6; pctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){ var s=STATE.stitches[i]; if(s.cmd==='jump') pctx.moveTo(s.x,s.y); else pctx.lineTo(s.x,s.y); }
    pctx.stroke();
  }

  // ---------- processing actions ----------
  function processPhoto(img){
    if(STATE.busy) return;
    STATE.busy=true; progressStart(); progressSet(10);
    try{
      var r=rasterize(img,896); progressSet(25);
      var g=toGray(r.ctx,r.w,r.h); progressSet(45);
      var t=otsu(g,r.w,r.h); progressSet(55);
      var m=bin(g,r.w,r.h,t); progressSet(65);
      cropMask(m,r.w,r.h); progressSet(75);
      var paths=trace(m,r.w,r.h); progressSet(90);
      STATE.stitches=pathsToStitches(paths, STATE.lastPreview.w, STATE.lastPreview.h);
      STATE.busy=false; progressDone(); STATE.processed=true; render();
    }catch(err){ STATE.busy=false; progressDone(); alert('Processing failed: '+(err&&err.message||err)); }
  }
  function processDrawing(goToPreview){
    if(STATE.busy) return;
    STATE.busy=true; progressStart(); progressSet(12);
    try{
      var w=draw.width, h=draw.height, id=dctx.getImageData(0,0,w,h), d=id.data;
      var max=896, s=Math.min(1,max/Math.max(w,h)), sw=(w*s)|0, sh=(h*s)|0;
      var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var tctx=tmp.getContext('2d');
      var g=new ImageData(w,h); for(var i=0;i<w*h;i++){ var a=d[i*4+3]; g.data[i*4]=a; g.data[i*4+1]=a; g.data[i*4+2]=a; g.data[i*4+3]=255; }
      dctx.putImageData(g,0,0); progressSet(45);
      tctx.drawImage(draw,0,0,sw,sh); progressSet(60);
      var id2=tctx.getImageData(0,0,sw,sh), m=new Uint8Array(sw*sh); for(i=0;i<sw*sh;i++){ m[i]=id2.data[i*4]>0?1:0; }
      var paths=trace(m,sw,sh); progressSet(88);
      STATE.stitches=pathsToStitches(paths, STATE.lastPreview.w, STATE.lastPreview.h);
      STATE.busy=false; progressDone(); STATE.processed=true; render();
      if(goToPreview){ activateTab('upload'); showPreviewOnly(); }
    }catch(err){ STATE.busy=false; progressDone(); alert('Processing drawing failed: '+(err&&err.message||err)); }
  }

  // ---------- buttons ----------
  on(btnProcess,'click',function(e){ e.preventDefault(); if(!STATE.lastImage){ alert('Upload a photo first'); return; } processPhoto(STATE.lastImage); });
  on(btnHighlight,'click',function(e){ e.preventDefault(); STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; drawSelection(); });
  on(btnAnother,'click',function(e){ e.preventDefault(); showUploadOnly(); activateTab('upload'); fileInput.click(); });
  on(chkNo,'change',function(){ STATE.subject.noSubject=chkNo.checked; });

  // ---------- init ----------
  activateTab('upload'); // ensure tab buttons reflect state
  resizeAll();
})();