/* Loomabelle — v9.7
   Fixes: iOS refresh, draw offset, stable sizing
   UX: Hide Preview until image; after upload show Preview only; "Choose another photo".
       Spinner/progress inside Preview. Draw->Process switches to Preview.
*/
(function(){
  // ---------- helpers ----------
  var UA = navigator.userAgent || '';
  function $(s,el){ return (el||document).querySelector(s); }
  function $$(s,el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); }
  function on(el,ev,fn,opt){ el && el.addEventListener(ev,fn,opt||false); }
  function dpr(){ return window.devicePixelRatio || 1; }
  function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function debounce(fn,ms){ var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(function(){ fn.apply(null,a); },ms); }; }

  // ---------- eliminate page refresh ----------
  document.addEventListener('submit', function(e){ e.preventDefault(); e.stopPropagation(); }, true);
  document.addEventListener('click', function(e){
    var b=e.target && e.target.closest && e.target.closest('button');
    if(b && !b.getAttribute('type')) b.setAttribute('type','button');
    var a=e.target && e.target.closest && e.target.closest('a[href="#"]'); if(a) e.preventDefault();
  }, true);
  document.addEventListener('keydown', function(e){
    if(e.key==='Enter' && e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){ e.preventDefault(); }
  }, true);

  // remove “mockup only” labels
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1) el.style.display='none';
  });

  // ---------- state ----------
  var STATE={
    hoop:{wmm:100,hmm:100}, pxPerMm:2,
    tool:'pen', guides:false, active:'#111827',
    history:[], stitches:[],
    lastImage:null, imgFit:null,
    subject:{enabled:false,rect:null,noSubject:false},
    opts:{autoTrace:false,reduce:true,cleanup:true,fillSatin:true},
    busy:false, processed:false,
    _sizingPass:0
  };

  // ---------- hosts (keep your DOM) ----------
  var uploadPanel = $('.panel[data-panel="upload"]');
  var previewPanel = $('.panel[data-panel="upload"]') ? $('.col.card.rose').closest('.row, .container') || document : document; // no visual change
  var uploadZone = $('.upload-zone');
  var previewHost = $('.col.card.rose .preview') || $('.preview');
  var drawHost = $('.panel[data-panel="draw"] .canvas') || $('.canvas');

  if(!uploadPanel || !uploadZone || !previewHost || !drawHost){ console.error('Missing required elements'); }

  // ---------- canvases ----------
  // Preview (stitches only)
  var prev = document.createElement('canvas');
  var pctx = prev.getContext('2d', {alpha:true, willReadFrequently:true});
  prev.classList.add('loomabelle-interactive');
  previewHost.innerHTML='';
  previewHost.appendChild(prev);

  // Upload thumbnail canvas (photo before processing)
  var photoCanvas = document.createElement('canvas');
  var photoCtx = photoCanvas.getContext('2d',{alpha:true});
  photoCanvas.classList.add('loomabelle-interactive');
  uploadZone.innerHTML='';
  uploadZone.appendChild(photoCanvas);

  // Draw canvas
  var draw = document.createElement('canvas');
  var dctx = draw.getContext('2d', {alpha:true, willReadFrequently:true});
  dctx.lineCap='round'; dctx.lineJoin='round';
  draw.classList.add('loomabelle-interactive');
  drawHost.innerHTML='';
  drawHost.appendChild(draw);

  // ---------- spinner/progress inside Preview ----------
  var prog = make('div','lb-progress');
  var ring = make('div','ring');
  var barwrap = make('div','barwrap');
  var bar = make('div','bar');
  barwrap.appendChild(bar); prog.appendChild(ring); prog.appendChild(barwrap);
  previewHost.appendChild(prog);

  // ---------- toolbar in Preview ----------
  var toolbar = make('div','lb-toolbar');
  var btnProcess = make('button','btn','Process Photo'); btnProcess.type='button';
  var btnHighlight = make('button','btn','Highlight Subject'); btnHighlight.type='button';
  var btnChangePhoto = make('button','btn','Choose another photo'); btnChangePhoto.type='button';
  var lblNoSub = make('label',null,''); var chkNoSub = make('input'); chkNoSub.type='checkbox';
  lblNoSub.appendChild(chkNoSub); lblNoSub.appendChild(document.createTextNode(' No subject'));
  toolbar.appendChild(btnProcess); toolbar.appendChild(btnHighlight); toolbar.appendChild(lblNoSub); toolbar.appendChild(btnChangePhoto);
  previewHost.appendChild(toolbar);

  // ---------- tiny styles (no theme change) ----------
  (function css(){
    var css=""
      +".loomabelle-interactive{touch-action:none}"
      +"canvas.loomabelle-interactive{display:block;touch-action:none!important}"
      +".lb-toolbar{position:absolute;left:8px;right:8px;bottom:18px;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-start;z-index:10}"
      +".lb-progress{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:11}"
      +".lb-progress .ring{width:52px;height:52px;border-radius:9999px;border:4px solid rgba(0,0,0,.1);border-top-color:#93c5fd;animation:spin 1s linear infinite}"
      +".lb-progress .barwrap{position:absolute;left:10%;right:10%;bottom:10px;height:6px;background:rgba(0,0,0,.08);border-radius:6px;overflow:hidden}"
      +".lb-progress .bar{height:100%;width:0%;background:linear-gradient(90deg,#f472b6,#93c5fd,#86efac);transition:width .18s ease}"
      +"@keyframes spin{to{transform:rotate(360deg)}}";
    var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
  })();

  // ---------- tab helpers ----------
  function clickTab(name){
    var t=$('.tab-btn[data-tab="'+name+'"]');
    if(t) t.click();
    setTimeout(resizeAll,30);
  }
  // Hide Preview until uploaded
  function showUploadOnly(){
    ($('.tab-btn[data-tab="upload"]')||{}).classList.add('active');
    ($('.tab-btn[data-tab="draw"]')||{}).classList.remove('active');
    $('.panel[data-panel="upload"]').classList.add('active');
    $('.panel[data-panel="draw"]').classList.remove('active');
    // show Upload card; keep Preview card visible but empty is okay – this avoids layout jumps
    previewHost.parentNode.style.display=''; // unchanged style
  }
  function showPreviewOnly(){
    // Ensure Upload tab selected (your layout has both cards stacked in that tab)
    ($('.tab-btn[data-tab="upload"]')||{}).classList.add('active');
    ($('.tab-btn[data-tab="draw"]')||{}).classList.remove('active');
    $('.panel[data-panel="upload"]').classList.add('active');
    $('.panel[data-panel="draw"]').classList.remove('active');
    // visually hide the upload canvas area by clearing it and reducing its height, but keep the card chrome
    if(photoCanvas){ photoCtx.clearRect(0,0,photoCanvas.width,photoCanvas.height); photoCanvas.style.height='0px'; photoCanvas.style.minHeight='0px'; }
  }

  // ---------- sizing (no feedback growth) ----------
  function innerContentWidth(el){
    var r=el.getBoundingClientRect();
    var cs=getComputedStyle(el);
    var pl=parseFloat(cs.paddingLeft)||0, pr=parseFloat(cs.paddingRight)||0;
    var bl=parseFloat(cs.borderLeftWidth)||0, br=parseFloat(cs.borderRightWidth)||0;
    return Math.max(0, r.width - pl - pr - bl - br)|0;
  }
  function sizeCanvas(canvas, host, memoKey){
    var cw=innerContentWidth(host);
    if(!cw||cw<50){ var m=STATE[memoKey]; cw=(m&&m.w)||640; }
    var ch=Math.max(220, Math.floor(cw*9/16));
    var scale=Math.min(dpr(), /iPad|iPhone|iPod/.test(UA)?1.5:2.5);
    var memo=STATE[memoKey]||{w:0,h:0};
    if(memo.w===cw && memo.h===ch) return;
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width=Math.round(cw*scale); canvas.height=Math.round(ch*scale);
    var ctx=canvas.getContext('2d'); ctx.setTransform(scale,0,0,scale,0,0);
    STATE[memoKey]={w:cw,h:ch,scale:scale};
  }
  function updatePxPerMm(){
    var W=prev.width/(STATE.lastPreviewSize&&STATE.lastPreviewSize.scale||1);
    var H=prev.height/(STATE.lastPreviewSize&&STATE.lastPreviewSize.scale||1);
    var m=10; STATE.pxPerMm=Math.min((W-m*2)/STATE.hoop.wmm, (H-m*2)/STATE.hoop.hmm);
  }
  var resizeAll=debounce(function(){
    if(++STATE._sizingPass>6){ STATE._sizingPass=0; return; }
    sizeCanvas(prev,previewHost,'lastPreviewSize');
    sizeCanvas(photoCanvas,uploadZone,'lastUploadSize');
    sizeCanvas(draw,drawHost,'lastDrawSize');
    updatePxPerMm(); render(); drawSelection();
    STATE._sizingPass=0;
  },50);
  try{
    new ResizeObserver(resizeAll).observe(previewHost);
    new ResizeObserver(resizeAll).observe(uploadZone);
    new ResizeObserver(resizeAll).observe(drawHost);
  }catch(e){}
  on(window,'resize',resizeAll);
  resizeAll();

  // ---------- file input / drop ----------
  var fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*';
  uploadZone.appendChild(fileInput);
  on(fileInput,'change',function(){ if(fileInput.files && fileInput.files[0]) loadImage(fileInput.files[0]); });
  on(uploadZone,'dragover',function(e){ e.preventDefault(); });
  on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files && e.dataTransfer.files[0]; if(f) loadImage(f); });
  on(uploadZone,'click',function(e){ if(e.target===uploadZone) fileInput.click(); });

  // checkboxes -> options
  ($$('.panel[data-panel="upload"] input[type="checkbox"]')||[]).forEach(function(cb){
    cb.removeAttribute('disabled');
    var label=(cb.closest('label')&&cb.closest('label').textContent||'').toLowerCase();
    if(label.indexOf('auto-trace')>-1){ cb.checked=STATE.opts.autoTrace; on(cb,'change',function(){ STATE.opts.autoTrace=cb.checked; }); }
    else if(label.indexOf('reduce')>-1){ cb.checked=STATE.opts.reduce; on(cb,'change',function(){ STATE.opts.reduce=cb.checked; }); }
    else if(label.indexOf('edge')>-1){ cb.checked=STATE.opts.cleanup; on(cb,'change',function(){ STATE.opts.cleanup=cb.checked; }); }
    else if(label.indexOf('fill')>-1 || label.indexOf('satin')>-1){ cb.checked=STATE.opts.fillSatin; on(cb,'change',function(){ STATE.opts.fillSatin=cb.checked; }); }
  });

  // ---------- photo load / preview ----------
  function showPhotoInUpload(img){
    sizeCanvas(photoCanvas,uploadZone,'lastUploadSize');
    var W=STATE.lastUploadSize.w, H=STATE.lastUploadSize.h;
    var iw=img.width, ih=img.height, s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    photoCtx.setTransform(1,0,0,1,0,0); // drawing in CSS units because we scaled via setTransform(scale,..) already
    photoCtx.clearRect(0,0,W,H);
    photoCtx.fillStyle='#fff'; photoCtx.fillRect(0,0,W,H);
    photoCtx.drawImage(img,ox,oy,w,h);
  }
  function loadImage(file){
    var img=new Image();
    img.onload=function(){
      STATE.lastImage=img; STATE.stitches=[]; STATE.processed=false;
      showPhotoInUpload(img);
      if(STATE.opts.autoTrace){ STATE.subject.enabled=true; }
      showPreviewOnly(); // hide upload canvas area, show Preview
      render();
    };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous'; img.src=URL.createObjectURL(file);
  }

  // ---------- highlight subject on photo (in Upload area) ----------
  var highlighting=false, start=null;
  function lockScroll(){ document.documentElement.style.overscrollBehavior='contain'; document.body.style.overscrollBehavior='contain'; }
  function unlockScroll(){ document.documentElement.style.overscrollBehavior='auto'; document.body.style.overscrollBehavior='auto'; }
  function canvasPointCSS(e, canvas){
    // return coordinates in CSS pixels — matches our setTransform logic
    var rect=canvas.getBoundingClientRect();
    var x=(e.clientX!=null?e.clientX:(e.touches&&e.touches[0].clientX)) - rect.left;
    var y=(e.clientY!=null?e.clientY:(e.touches&&e.touches[0].clientY)) - rect.top;
    return {x:x, y:y};
  }
  on(photoCanvas,'pointerdown',function(e){
    if(!STATE.subject.enabled) return;
    e.preventDefault(); lockScroll();
    try{ photoCanvas.setPointerCapture && photoCanvas.setPointerCapture(e.pointerId); }catch(_){}
    var pt=canvasPointCSS(e,photoCanvas); start=[pt.x,pt.y]; highlighting=true;
    STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; drawSelection();
  },{passive:false});
  on(photoCanvas,'pointermove',function(e){
    if(!highlighting || !STATE.subject.enabled) return;
    e.preventDefault();
    var pt=canvasPointCSS(e,photoCanvas);
    STATE.subject.rect={x:Math.min(start[0],pt.x), y:Math.min(start[1],pt.y), w:Math.abs(pt.x-start[0]), h:Math.abs(pt.y-start[1])};
    drawSelection();
  },{passive:false});
  on(window,'pointerup',function(e){ if(highlighting){ e.preventDefault(); highlighting=false; unlockScroll(); drawSelection(); } },{passive:false});
  on(photoCanvas,'touchmove',function(e){ e.preventDefault(); },{passive:false});

  function drawSelection(){
    if(!STATE.lastImage) return;
    showPhotoInUpload(STATE.lastImage);
    if(STATE.subject.enabled && STATE.subject.rect){
      var r=STATE.subject.rect, W=STATE.lastUploadSize.w, H=STATE.lastUploadSize.h;
      photoCtx.save(); photoCtx.strokeStyle='rgba(15,15,15,.95)'; photoCtx.setLineDash([6,6]); photoCtx.lineWidth=1;
      photoCtx.strokeRect(r.x,r.y,r.w,r.h);
      photoCtx.restore();
    }
  }

  // ---------- draw tools ----------
  (function wireDraw(){
    var toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    toolBtns.forEach(function(b,i){
      if(b && b.tagName==='BUTTON' && !b.type) b.type='button';
      var tool=map[i]||'pen'; b && (b.dataset.tool=tool);
      b && b.removeAttribute('disabled');
      b && on(b,'click',function(e){
        e.preventDefault();
        if(tool==='undo') return void undo();
        if(tool==='guides'){ STATE.guides=!STATE.guides; return render(); }
        if(tool==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return render(); }
        STATE.tool=tool;
      });
    });
    // Add Process Drawing button (if not present)
    var tb=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    var proc=make('button','btn','Process Drawing'); proc.type='button'; proc.style.marginLeft='10px';
    tb && tb.appendChild(proc);
    on(proc,'click',function(e){ e.preventDefault(); processDrawing(true); }); // true -> switch to Preview after
  })();

  var drawingActive=false;
  on(draw,'pointerdown',function(e){
    e.preventDefault(); lockScroll();
    try{ draw.setPointerCapture && draw.setPointerCapture(e.pointerId); }catch(_){}
    var pt=canvasPointCSS(e,draw); // CSS coords to match transform
    if(STATE.tool==='fill'){ floodFill(dctx,pt.x|0,pt.y|0,STATE.active); snapshot(); unlockScroll(); return; }
    drawingActive=true; dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(pt.x,pt.y);
  },{passive:false});
  on(draw,'pointermove',function(e){
    if(!drawingActive) return; e.preventDefault();
    var pt=canvasPointCSS(e,draw);
    if(STATE.tool==='pen'){ dctx.lineTo(pt.x,pt.y); dctx.stroke(); }
    else if(STATE.tool==='eraser'){ dctx.clearRect(pt.x-6,pt.y-6,12,12); }
  },{passive:false});
  on(window,'pointerup',function(e){ if(drawingActive){ e.preventDefault(); drawingActive=false; snapshot(); unlockScroll(); } },{passive:false});
  on(draw,'touchmove',function(e){ e.preventDefault(); },{passive:false});

  function floodFill(ctx,x,y,hex){
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
  function snapshot(){ STATE.history.push(draw.toDataURL()); if(STATE.history.length>40) STATE.history.shift(); }
  function undo(){ if(STATE.history.length<2) return; STATE.history.pop(); var img=new Image(); img.onload=function(){ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); render(); }; img.src=STATE.history[STATE.history.length-1]; }

  // ---------- progress ----------
  var _spinRAF=0,_spin=0;
  function progressStart(){ prog.style.display='flex'; bar.style.width='0%'; _spin=0; _spinRAF=requestAnimationFrame(spinLoop); }
  function progressSet(v){ bar.style.width=(clamp(v,0,100))+'%'; }
  function progressDone(){ cancelAnimationFrame(_spinRAF||0); bar.style.width='100%'; setTimeout(function(){ prog.style.display='none'; },250); }
  function spinLoop(){ ring.style.transform='rotate('+_spin+'deg)'; _spin=( _spin + 8 ) % 360; _spinRAF=requestAnimationFrame(spinLoop); }

  // ---------- render stitches ----------
  function render(){
    sizeCanvas(prev,previewHost,'lastPreviewSize');
    var W=STATE.lastPreviewSize.w, H=STATE.lastPreviewSize.h, ctx=pctx;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    if(STATE.guides){ ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#94a3b8'; for(var gy=10; gy<H; gy+=20){ for(var gx=10; gx<W; gx+=20){ ctx.fillRect(gx,gy,1,1); } } ctx.restore(); }
    ctx.strokeStyle=STATE.active||'#111827'; ctx.lineWidth=1.6; ctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){ var s=STATE.stitches[i]; if(s.cmd==='jump') ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); }
    ctx.stroke();
  }

  // ---------- processing (photo/drawing) ----------
  function rasterize(img,maxSide){ var s=Math.min(1, maxSide/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0; var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h); return {ctx:x,w:w,h:h}; }
  function toGray(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, g=new Uint8Array(w*h); for(var i=0;i<w*h;i++){ var p=i*4; g[i]=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])|0; } return g; }
  function autoOtsu(img,w,h){ var hist=new Uint32Array(256), i; for(i=0;i<w*h;i++) hist[img[i]]++; var sum=0,total=w*h; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,maxVar=0,thr=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; var wF=total-wB; if(!wF) break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>maxVar){ maxVar=v; thr=i; } } return thr; }
  function binarize(gray,w,h,thr){ var m=new Uint8Array(w*h); for(var i=0;i<w*h;i++) m[i]= gray[i]>thr?0:1; return m; }
  function blur1(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), r=1; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var R=0,G=0,B=0,A=0,C=0; for(var dy=-r;dy<=r;dy++){ for(var dx=-r;dx<=r;dx++){ var px=Math.max(0,Math.min(w-1,x+dx)), py=Math.max(0,Math.min(h-1,y+dy)), ii=(py*w+px)*4; R+=d[ii]; G+=d[ii+1]; B+=d[ii+2]; A+=d[ii+3]; C++; }} var o=(y*w+x)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; }} id.data.set(out); ctx.putImageData(id,0,0); }
  function kmeansLabels(ctx,k){ var w=ctx.canvas.width, h=ctx.canvas.height, id=ctx.getImageData(0,0,w,h), d=id.data, centers=[], labels=new Uint8Array(w*h); for(var i=0;i<k;i++){ var p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); } for(var it=0; it<4; it++){ for(var i2=0;i2<w*h;i2++){ var r=d[i2*4], g=d[i2*4+1], b=d[i2*4+2], best=0, bd=1e20; for(var c=0;c<k;c++){ var cc=centers[c], dist=(r-cc[0])*(r-cc[0])+(g-cc[1])*(g-cc[1])+(b-cc[2])*(b-cc[2]); if(dist<bd){bd=dist; best=c;} } labels[i2]=best; } var sums=[], counts=[]; for(var c2=0;c2<k;c2++){ sums.push([0,0,0]); counts.push(0); } for(i2=0;i2<w*h;i2++){ var ci=labels[i2], p2=i2*4; sums[ci][0]+=d[p2]; sums[ci][1]+=d[p2+1]; sums[ci][2]+=d[p2+2]; counts[ci]++; } for(c2=0;c2<k;c2++){ if(counts[c2]) centers[c2]=[sums[c2][0]/counts[c2], sums[c2][1]/counts[c2], sums[c2][2]/counts[c2]]; } } return labels; }
  function darkestClusterMask(ctx,labels,w,h){ var d=ctx.getImageData(0,0,w,h).data, sums=[], cnt=[], i,c,lum; for(i=0;i<6;i++){ sums.push(0); cnt.push(0); } for(i=0;i<w*h;i++){ c=labels[i]; lum=0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2]; sums[c]+=lum; cnt[c]++; } var darkest=0,best=1e9; for(i=0;i<6;i++){ if(cnt[i]){ var m=sums[i]/cnt[i]; if(m<best){best=m; darkest=i;} } } var m=new Uint8Array(w*h); for(i=0;i<w*h;i++) m[i]=(labels[i]===darkest)?1:0; return m; }
  function cropMaskToSubject(mask,w,h){
    var f=STATE.imgFit, r=STATE.subject.rect; if(!f||!r||STATE.subject.noSubject) return;
    var sx=Math.max(0,Math.floor((r.x-f.ox)/f.scale)),
        sy=Math.max(0,Math.floor((r.y-f.oy)/f.scale)),
        ex=Math.min(w-1,Math.floor((r.x+r.w-f.ox)/f.scale)),
        ey=Math.min(h-1,Math.floor((r.y+r.h-f.oy)/f.scale));
    for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ if(!(x>=sx&&x<=ex&&y>=sy&&y<=ey)) mask[y*w+x]=0; } }
  }
  function marchingSquares(mask,w,h){
    var paths=[], visited=new Uint8Array(w*h);
    function idx(x,y){ return y*w+x; }
    function trace(sx,sy){ var x=sx,y=sy,dir=0, path=[], iter=0, max=w*h*8;
      while(iter++<max){
        var a=mask[idx(x  ,y  )]?1:0, b=mask[idx(x+1,y  )]?1:0,
            c=mask[idx(x+1,y+1)]?1:0, d=mask[idx(x  ,y+1)]?1:0;
        var code=a + b*2 + c*4 + d*8;
        if(code===0||code===15){ if(dir===0)x++; else if(dir===1)y++; else if(dir===2)x--; else y--; }
        else{
          if(code===1||code===5||code===13){ path.push([x,y+0.5]); dir=3; x--; }
          else if(code===8||code===10||code===11){ path.push([x+0.5,y+1]); dir=0; y++; }
          else if(code===4||code===12||code===14){ path.push([x+1,y+0.5]); dir=1; x++; }
          else if(code===2||code===3||code===7){ path.push([x+0.5,y]); dir=2; y--; }
          if(x<0||y<0||x>=w-1||y>=h-1) break;
          if(x===sx&&y===sy && path.length>20) break;
        }
      } return path;
    }
    for(var y=0;y<h-1;y++){
      for(var x=0;x<w-1;x++){
        var i=idx(x,y); if(visited[i]) continue;
        var code=(mask[i]?1:0)+(mask[i+1]?2:0)+(mask[i+w+1]?4:0)+(mask[i+w]?8:0);
        if(code!==0 && code!==15){
          var path=trace(x,y);
          for(var k=0;k<path.length;k++){
            var px=Math.min(w-1,Math.max(0,(path[k][0]>>0))), py=Math.min(h-1,Math.max(0,(path[k][1]>>0)));
            visited[idx(px,py)]=1;
          }
          if(path.length>10) paths.push(path);
        }
      }
    }
    return paths;
  }
  function pathsToStitches(paths,outW,outH){
    var stitches=[]; if(!paths||!paths.length) return stitches;
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p;
    for(i=0;i<paths.length;i++){ for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; } }
    var w=maxx-minx, h=maxy-miny, margin=20, sx=(outW-2*margin)/w, sy=(outH-2*margin)/h, s=Math.min(sx,sy);
    var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){
      var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy});
    }
    return stitches;
  }

  function toUnits(){
    var scale = STATE.lastPreviewSize.scale||1;
    var W = prev.width/scale, H = prev.height/scale;
    var s=1/STATE.pxPerMm*10, cx=W/2, cy=H/2, prevPt=null, out=[];
    for(var i=0;i<STATE.stitches.length;i++){
      var a=STATE.stitches[i];
      if(a.cmd==='stop'){ out.push({cmd:'stop'}); prevPt=null; continue; }
      if(a.cmd==='jump'||a.cmd==='stitch'){
        var x=(a.x-cx)*s, y=(a.y-cy)*s;
        if(prevPt===null){ prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
        else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; }
      }
    }
    return out;
  }

  // Encoders (DST/EXP) same as before:
  function encDST(){ var u=toUnits(), bytes=[]; function enc(dx,dy,flag){ if(flag==null) flag=0; dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121); var b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6); var b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2); var b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); } var colors=0; for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; } if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; } enc(s.dx,s.dy,0); } bytes.push(0,0,0xF3); var header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512); var hb=new TextEncoder().encode(header); var u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8; }
  function encEXP(){ var u=toUnits(), bytes=[]; function put(dx,dy,cmd){ dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127); if(cmd==='jump') bytes.push(0x80,0x04); if(cmd==='stop') bytes.push(0x80,0x01); if(cmd==='end')  bytes.push(0x80,0x00); if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); } } for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ put(0,0,'stop'); continue; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; } put(s.dx,s.dy,'stitch'); } bytes.push(0x80,0x00); return new Uint8Array(bytes); }

  function download(name, bytes){
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download=name; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
  }

  // ---------- buttons ----------
  on(btnProcess,'click',function(e){
    e.preventDefault();
    if(!STATE.lastImage){ alert('Upload a photo first'); return; }
    processPhoto(STATE.lastImage);
  });
  on(btnHighlight,'click',function(e){
    e.preventDefault(); STATE.subject.enabled=!STATE.subject.enabled;
    if(!STATE.subject.enabled) STATE.subject.rect=null;
    drawSelection();
  });
  on(btnChangePhoto,'click',function(e){
    e.preventDefault();
    // restore upload area height
    photoCanvas.style.height=''; photoCanvas.style.minHeight='';
    showUploadOnly();
    fileInput.click();
  });
  on(chkNoSub,'change',function(){ STATE.subject.noSubject=chkNoSub.checked; });

  // Export buttons only visible after processed
  var formatBtns=$$('.col.card.rose .formats .btn');
  function setFormatsVisible(v){ formatBtns.forEach(function(b){ b.style.display=v?'inline-block':'none'; if(b.tagName==='BUTTON'&&!b.type) b.type='button'; }); }
  setFormatsVisible(false);
  formatBtns.forEach(function(btn){
    var fmt=btn.textContent.replace(/\s+/g,'').toUpperCase();
    on(btn,'click',function(e){
      e.preventDefault();
      try{
        if(fmt==='DST') return download('loomabelle.dst', encDST());
        if(fmt==='EXP') return download('loomabelle.exp', encEXP());
        alert('For '+fmt+' please connect an AI endpoint; local encoders for PES/JEF are not included yet.');
      }catch(err){ alert(fmt+': '+err.message); }
    });
  });

  // ---------- processors ----------
  function processPhoto(img){
    if(STATE.busy) return;
    STATE.busy=true; setFormatsVisible(false); progressStart(); progressSet(8);
    try{
      var base=rasterize(img,896); progressSet(22);
      var gray=toGray(base.ctx,base.w,base.h); progressSet(38);
      var thr=autoOtsu(gray,base.w,base.h); progressSet(48);
      var mask=binarize(gray,base.w,base.h,thr); progressSet(58);
      cropMaskToSubject(mask,base.w,base.h); progressSet(62);
      var paths=marchingSquares(mask,base.w,base.h); progressSet(82);
      if(!paths||!paths.length) throw new Error('No clear edges found');
      STATE.stitches=pathsToStitches(paths, STATE.lastPreviewSize.w, STATE.lastPreviewSize.h);
      STATE.processed=true; STATE.busy=false; progressSet(98); progressDone(); setFormatsVisible(true); render();
    }catch(err){
      STATE.busy=false; progressDone(); alert('Processing failed: '+(err&&err.message||err)); setFormatsVisible(false);
    }
  }

  function processDrawing(switchToPreview){
    if(STATE.busy) return;
    STATE.busy=true; setFormatsVisible(false); progressStart(); progressSet(12);
    try{
      var w=draw.width, h=draw.height, id=dctx.getImageData(0,0,w,h), d=id.data;
      var max=896, s=Math.min(1, max/Math.max(w,h)), sw=Math.max(2,(w*s)|0), sh=Math.max(2,(h*s)|0);
      var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var t=tmp.getContext('2d');
      var g=document.createImageData(w,h); for(var i=0;i<w*h;i++){ var a=d[i*4+3]; g.data[i*4]=a; g.data[i*4+1]=a; g.data[i*4+2]=a; g.data[i*4+3]=255; }
      dctx.putImageData(g,0,0); progressSet(45);
      t.drawImage(draw,0,0,sw,sh); progressSet(60);
      var id2=t.getImageData(0,0,sw,sh), mask=new Uint8Array(sw*sh);
      for(i=0;i<sw*sh;i++){ mask[i]=id2.data[i*4]>0?1:0; }
      var paths=marchingSquares(mask,sw,sh); progressSet(86);
      if(!paths||!paths.length) throw new Error('No strokes detected');
      STATE.stitches=pathsToStitches(paths, STATE.lastPreviewSize.w, STATE.lastPreviewSize.h);
      STATE.processed=true; STATE.busy=false; progressDone(); setFormatsVisible(true); render();
      if(switchToPreview){ clickTab('upload'); showPreviewOnly(); }
    }catch(err){
      STATE.busy=false; progressDone(); alert('Processing drawing failed: '+(err&&err.message||err)); setFormatsVisible(false);
    }
  }

  // ---------- init ----------
  function init(){
    // default: show upload only (no preview yet)
    showUploadOnly();
    resizeAll();
  }
  init();
})();