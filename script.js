/* Loomabelle — v9.1
   Fix: page refresh on Process (buttons defaulting to submit).
   - All buttons explicitly type="button"
   - Global form submit preventDefault
   - Same iOS fixes, drawing/subject lock, processing & exports as v9
*/
(function(){
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function on(el,ev,fn,opt){ el&&el.addEventListener(ev,fn,opt||false); }
  function dpr(){ return window.devicePixelRatio||1; }
  function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function debounce(fn,ms){ var t; return function(){ var a=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(null,a); },ms); }; }

  // Hide any “mockup” hints
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1) el.style.display='none';
  });

  // Make sure any native forms can’t submit (mobile Safari reload)
  $$('form').forEach(function(f){
    on(f,'submit',function(e){ e.preventDefault(); e.stopPropagation(); });
  });

  // Touch/scroll lock CSS
  (function addTouchCSS(){
    var css = ".loomabelle-interactive{touch-action:none;-ms-touch-action:none}"+
              "canvas.loomabelle-interactive{touch-action:none!important}"+
              "body._lb_lock,html._lb_lock{overscroll-behavior:contain}";
    var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
  })();

  var STATE={
    hoop:{wmm:100,hmm:100}, pxPerMm:2,
    tool:'pen', guides:false, active:'#111827',
    history:[], ai:{}, stitches:[],
    lastImage:null, imgFit:null,
    subject:{enabled:false,rect:null,noSubject:false},
    opts:{reduce:true,cleanup:true},
    busy:false, processed:false,
    canvases:{}
  };

  (function cfg(){
    try{ var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch(e){}
    var q=(function(){ var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(s){var kv=s.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out; })();
    if(q.hoop){ var sp=q.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h) STATE.hoop={wmm:w,hmm:h}; }
    if(q.aiEndpoint) STATE.ai.endpoint=q.aiEndpoint; if(q.aiKey) STATE.ai.key=q.aiKey;
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  function wireTabs(){
    var tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(function(btn){
      on(btn,'click',function(e){
        e.preventDefault();
        tabs.forEach(function(b){ b.classList.toggle('active', b===btn); });
        panels.forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')); });
        resizeAll();
      });
      // ensure not submit
      if(!btn.type) btn.type='button';
    });
    $$('a,button').forEach(function(el){
      var t=(el.textContent||'').toLowerCase();
      if(el.tagName==='BUTTON' && !el.type) el.type='button';
      if(t.indexOf('start with a photo')>-1 || t.indexOf('upload photo')>-1){
        on(el,'click',function(e){ e.preventDefault(); var up=$('.tab-btn[data-tab="upload"]')||tabs[0]; up&&up.click(); });
      }
      if(/open.*draw|open.*drawing|draw & trace/.test(t)){
        on(el,'click',function(e){ e.preventDefault(); var dr=$('.tab-btn[data-tab="draw"]')||tabs[1]; dr&&dr.click(); });
      }
    });
    var y=$('#year'); if(y) y.textContent=(new Date()).getFullYear();
  }

  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Loomabelle: Missing .preview or .canvas host'); return; }
  if(getComputedStyle(prevHost).position==='static'){ prevHost.style.position='relative'; }

  var prev=document.createElement('canvas'), pctx=prev.getContext('2d',{alpha:true,willReadFrequently:true});
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d',{alpha:true,willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';
  prev.classList.add('loomabelle-interactive');
  draw.classList.add('loomabelle-interactive');
  prevHost.innerHTML=''; prevHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);
  STATE.canvases={prev:prev, prevCtx:pctx, draw:draw, drawCtx:dctx};

  function dpr(){ return window.devicePixelRatio||1; }
  function sizeCanvasToHost(canvas, host){
    var cw=Math.max(320, host.clientWidth||640);
    var ch=Math.max(220, Math.floor(cw*9/16));
    var scale=Math.min(dpr(), /iPad|iPhone|iPod/.test(navigator.userAgent)?1.5:2.5);
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width=Math.round(cw*scale); canvas.height=Math.round(ch*scale);
    var ctx=canvas.getContext('2d'); ctx.setTransform(scale,0,0,scale,0,0);
  }
  function updatePxPerMm(){
    var m=10, W=prev.width/dpr(), H=prev.height/dpr();
    STATE.pxPerMm=Math.min((W-m*2)/STATE.hoop.wmm, (H-m*2)/STATE.hoop.hmm);
  }
  var resizeAll = debounce(function(){ sizeCanvasToHost(prev,prevHost); sizeCanvasToHost(draw,drawHost); updatePxPerMm(); render(); }, 60);
  try{ new ResizeObserver(resizeAll).observe(prevHost); new ResizeObserver(resizeAll).observe(drawHost); }catch(e){}
  on(window,'resize',resizeAll);
  resizeAll();

  var sw=document.querySelector('.swatches');
  if(sw && !sw.children.length){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    ['#111827','#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
      .forEach(function(c){ var d=make('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer'; d.title=c; on(d,'click',function(){STATE.active=c; render();}); sw.appendChild(d); });
  }

  var uploadZone=$('.upload-zone');
  var fileInput=uploadZone && uploadZone.querySelector('input[type="file"]');
  if(uploadZone){
    if(fileInput){ fileInput.removeAttribute('disabled'); on(fileInput,'change',function(e){ e.preventDefault(); var f=fileInput.files[0]; if(f) loadImage(f); }); }
    on(uploadZone,'dragover',function(e){ e.preventDefault(); });
    on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(uploadZone,'click',function(e){ if(e.target===uploadZone && fileInput) fileInput.click(); });
  }

  // Toolbar pinned to bottom
  var toolbar=make('div');
  toolbar.style.cssText='position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;justify-content:flex-start;z-index:3;pointer-events:auto';
  var btnProcess=make('button','btn','Process Photo'); btnProcess.type='button';
  var btnHighlight=make('button','btn','Highlight Subject'); btnHighlight.type='button';
  var lblNoSub=make('label',null,''); var chkNoSub=make('input'); chkNoSub.type='checkbox'; lblNoSub.appendChild(chkNoSub); lblNoSub.appendChild(document.createTextNode(' No subject'));
  toolbar.appendChild(btnProcess); toolbar.appendChild(btnHighlight); toolbar.appendChild(lblNoSub);
  prevHost.appendChild(toolbar);

  on(btnHighlight,'click',function(e){
    e.preventDefault();
    STATE.subject.enabled=!STATE.subject.enabled;
    if(!STATE.subject.enabled) STATE.subject.rect=null;
    btnHighlight.classList.toggle('active', STATE.subject.enabled);
    render();
  });
  on(chkNoSub,'change',function(){ STATE.subject.noSubject=chkNoSub.checked; });

  var formatBtns=$$('.col.card.rose .formats .btn');
  function setFormatsVisible(v){ formatBtns.forEach(function(b){ b.style.display=v?'inline-block':'none'; if(b.tagName==='BUTTON' && !b.type) b.type='button'; }); }
  setFormatsVisible(false);

  on(btnProcess,'click',function(e){
    e.preventDefault();
    if(STATE.busy) return;
    if(!STATE.lastImage){
      if(fileInput && fileInput.files && fileInput.files[0]) return loadImage(fileInput.files[0]);
      alert('Choose a photo first.'); return;
    }
    processPhoto(STATE.lastImage);
  });

  function loadImage(file){
    var img=new Image();
    img.onload=function(){ STATE.lastImage=img; STATE.processed=false; setFormatsVisible(false); showImageInPreview(img,1); };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous'; img.src=URL.createObjectURL(file);
  }
  function showImageInPreview(img, alpha){
    sizeCanvasToHost(prev,prevHost);
    var W=prev.width/dpr(), H=prev.height/dpr();
    var iw=img.width, ih=img.height, s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    STATE.stitches=[];
    pctx.setTransform(dpr(),0,0,dpr(),0,0);
    pctx.clearRect(0,0,W,H);
    pctx.fillStyle='#fff'; pctx.fillRect(0,0,W,H);
    pctx.globalAlpha=alpha||1; pctx.drawImage(img,ox,oy,w,h); pctx.globalAlpha=1;
    render();
  }

  function lockScroll(){ document.documentElement.classList.add('_lb_lock'); document.body.classList.add('_lb_lock'); }
  function unlockScroll(){ document.documentElement.classList.remove('_lb_lock'); document.body.classList.remove('_lb_lock'); }

  function canvasPoint(e, canvas){
    var rect = canvas.getBoundingClientRect();
    var cssX = (e.clientX!=null?e.clientX:(e.touches&&e.touches[0].clientX)) - rect.left;
    var cssY = (e.clientY!=null?e.clientY:(e.touches&&e.touches[0].clientY)) - rect.top;
    var scaleX = (canvas.width / (dpr())) / rect.width;
    var scaleY = (canvas.height / (dpr())) / rect.height;
    return { x: cssX*scaleX, y: cssY*scaleY };
  }

  var highlighting=false, start=null;
  function preventTouch(e){ e.preventDefault(); }
  on(prev,'pointerdown',function(e){
    if(!STATE.subject.enabled) return;
    e.preventDefault();
    lockScroll();
    if(prev.setPointerCapture) try{ prev.setPointerCapture(e.pointerId); }catch(_){}
    var pt=canvasPoint(e,prev); start=[pt.x,pt.y]; highlighting=true;
    STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; render();
  }, {passive:false});
  on(prev,'pointermove',function(e){
    if(!highlighting || !STATE.subject.enabled) return;
    e.preventDefault();
    var pt=canvasPoint(e,prev);
    STATE.subject.rect={x:Math.min(start[0],pt.x), y:Math.min(start[1],pt.y), w:Math.abs(pt.x-start[0]), h:Math.abs(pt.y-start[1])}; render();
  }, {passive:false});
  on(window,'pointerup',function(e){ if(highlighting){ e.preventDefault(); highlighting=false; unlockScroll(); } }, {passive:false});
  on(prev,'touchmove',preventTouch,{passive:false});

  function wireDrawTools(){
    var toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    toolBtns.forEach(function(b,i){
      if(b.tagName==='BUTTON' && !b.type) b.type='button';
      var tool=map[i]||'pen'; b.dataset.tool=tool; b.removeAttribute('disabled');
      on(b,'click',function(e){
        e.preventDefault();
        if(tool==='undo') return void undo();
        if(tool==='guides'){ STATE.guides=!STATE.guides; return render(); }
        if(tool==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return render(); }
        STATE.tool=tool;
      });
    });
    var tb=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    var proc=make('button','btn','Process Drawing'); proc.type='button'; proc.style.marginLeft='10px'; tb&&tb.appendChild(proc);
    on(proc,'click',function(e){ e.preventDefault(); processDrawing(); });
  }
  wireDrawTools();

  var drawingActive=false;
  on(draw,'pointerdown',function(e){
    e.preventDefault();
    lockScroll();
    if(draw.setPointerCapture) try{ draw.setPointerCapture(e.pointerId); }catch(_){}
    var pt=canvasPoint(e,draw);
    if(STATE.tool==='fill'){ floodFill(dctx,pt.x|0,pt.y|0,STATE.active); snapshot(); unlockScroll(); return; }
    drawingActive=true; dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(pt.x,pt.y);
  }, {passive:false});
  on(draw,'pointermove',function(e){
    if(!drawingActive) return;
    e.preventDefault();
    var pt=canvasPoint(e,draw);
    if(STATE.tool==='pen'){ dctx.lineTo(pt.x,pt.y); dctx.stroke(); }
    else if(STATE.tool==='eraser'){ dctx.clearRect(pt.x-6,pt.y-6,12,12); }
  }, {passive:false});
  on(window,'pointerup',function(e){ if(drawingActive){ e.preventDefault(); drawingActive=false; snapshot(); unlockScroll(); } }, {passive:false});
  on(draw,'touchmove',preventTouch,{passive:false});

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

  function processingOverlay(text){
    var W=prev.width/dpr(), H=prev.height/dpr(); render();
    pctx.save(); pctx.fillStyle='rgba(255,255,255,.65)'; pctx.fillRect(0,0,W,H);
    pctx.fillStyle='#111827'; pctx.font='600 14px system-ui, sans-serif'; pctx.fillText(text||'Processing…', 12, 22);
    pctx.restore();
  }

  function processPhoto(img){
    if(STATE.busy) return;
    STATE.busy=true; STATE.processed=false; setFormatsVisible(false); processingOverlay('Processing photo…');
    try{
      if(!STATE.imgFit) showImageInPreview(img,1);
      var base=rasterize(img, 896);
      var gray=toGray(base.ctx,base.w,base.h);
      var thr=autoOtsu(gray,base.w,base.h);
      var mask=binarize(gray,base.w,base.h,thr);
      if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit) cropMaskToSubject(mask,base.w,base.h);
      var paths=marchingSquares(mask,base.w,base.h);
      if((STATE.opts.reduce||STATE.opts.cleanup)){
        try{
          var ref=rasterize(img,896);
          if(STATE.opts.cleanup) blur1(ref.ctx,ref.w,ref.h);
          if(STATE.opts.reduce){
            var labels=kmeansLabels(ref.ctx,6);
            var fg=darkestClusterMask(ref.ctx,labels,ref.w,ref.h);
            if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit) cropMaskToSubject(fg,ref.w,ref.h);
            var finer=marchingSquares(fg,ref.w,ref.h);
            if(finer && finer.length) paths=finer;
          }
        }catch(e){}
      }
      if(!paths || !paths.length) throw new Error('No clear edges found');
      STATE.stitches=pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
      STATE.subject.enabled=false; STATE.subject.rect=null;
      STATE.busy=false; STATE.processed=true; setFormatsVisible(true); render();
    }catch(err){
      console.error('processPhoto:',err);
      STATE.busy=false; STATE.processed=false; STATE.stitches=[]; setFormatsVisible(false); render();
      alert('Processing failed: '+(err&&err.message||err));
    }
  }

  function processDrawing(){
    if(STATE.busy) return;
    STATE.busy=true; STATE.processed=false; setFormatsVisible(false); processingOverlay('Processing drawing…');
    try{
      var w=draw.width, h=draw.height, ctx=draw.getContext('2d'), id=ctx.getImageData(0,0,w,h), d=id.data;
      var max=896, s=Math.min(1, max/Math.max(w,h)), sw=Math.max(2,(w*s)|0), sh=Math.max(2,(h*s)|0);
      var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var t=tmp.getContext('2d');
      var g=document.createImageData(w,h); for(var i=0;i<w*h;i++){ var a=d[i*4+3]; g.data[i*4]=a; g.data[i*4+1]=a; g.data[i*4+2]=a; g.data[i*4+3]=255; }
      ctx.putImageData(g,0,0);
      t.drawImage(draw,0,0,sw,sh);
      var id2=t.getImageData(0,0,sw,sh), mask=new Uint8Array(sw*sh);
      for(i=0;i<sw*sh;i++){ mask[i]=id2.data[i*4]>0?1:0; }
      var paths=marchingSquares(mask,sw,sh);
      if(!paths || !paths.length) throw new Error('No strokes detected');
      STATE.stitches=pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
      STATE.busy=false; STATE.processed=true; setFormatsVisible(true); render();
    }catch(err){
      STATE.busy=false; STATE.processed=false; STATE.stitches=[]; setFormatsVisible(false); render();
      alert('Processing drawing failed: '+(err&&err.message||err));
    }
  }

  // Image ops…
  function rasterize(img,maxSide){ var s=Math.min(1, maxSide/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0; var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h); return {ctx:x,w:w,h:h}; }
  function toGray(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, g=new Uint8Array(w*h); for(var i=0;i<w*h;i++){ var p=i*4; g[i]=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])|0; } return g; }
  function autoOtsu(img,w,h){ var hist=new Uint32Array(256), i; for(i=0;i<w*h;i++) hist[img[i]]++; var sum=0,total=w*h; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,maxVar=0,thr=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; var wF=total-wB; if(!wF) break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>maxVar){ maxVar=v; thr=i; } } return thr; }
  function binarize(gray,w,h,thr){ var m=new Uint8Array(w*h); for(var i=0;i<w*h;i++) m[i]= gray[i]>thr?0:1; return m; }
  function blur1(ctx,w,h){ var id=ctx.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), r=1; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var R=0,G=0,B=0,A=0,C=0; for(var dy=-r;dy<=r;dy++){ for(var dx=-r;dx<=r;dx++){ var px=Math.max(0,Math.min(w-1,x+dx)), py=Math.max(0,Math.min(h-1,y+dy)), ii=(py*w+px)*4; R+=d[ii]; G+=d[ii+1]; B+=d[ii+2]; A+=d[ii+3]; C++; }} var o=(y*w+x)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; }} id.data.set(out); ctx.putImageData(id,0,0); }
  function kmeansLabels(ctx,k){ var w=ctx.canvas.width, h=ctx.canvas.height, id=ctx.getImageData(0,0,w,h), d=id.data, centers=[], labels=new Uint8Array(w*h); for(var i=0;i<k;i++){ var p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); } for(var it=0; it<4; it++){ for(var i2=0;i2<w*h;i2++){ var r=d[i2*4], g=d[i2*4+1], b=d[i2*4+2], best=0, bd=1e20; for(var c=0;c<k;c++){ var cc=centers[c], dist=(r-cc[0])*(r-cc[0])+(g-cc[1])*(g-cc[1])+(b-cc[2])*(b-cc[2]); if(dist<bd){bd=dist; best=c;} } labels[i2]=best; } var sums=[], counts=[]; for(var c2=0;c2<k;c2++){ sums.push([0,0,0]); counts.push(0); } for(i2=0;i2<w*h;i2++){ var ci=labels[i2], p2=i2*4; sums[ci][0]+=d[p2]; sums[ci][1]+=d[p2+1]; sums[ci][2]+=d[p2+2]; counts[ci]++; } for(c2=0;c2<k;c2++){ if(counts[c2]) centers[c2]=[sums[c2][0]/counts[c2], sums[c2][1]/counts[c2], sums[c2][2]/counts[c2]]; } } return labels; }
  function darkestClusterMask(ctx,labels,w,h){ var d=ctx.getImageData(0,0,w,h).data, sums=[], cnt=[], i,c,lum; for(i=0;i<6;i++){ sums.push(0); cnt.push(0); } for(i=0;i<w*h;i++){ c=labels[i]; lum=0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2]; sums[c]+=lum; cnt[c]++; } var darkest=0,best=1e9; for(i=0;i<6;i++){ if(cnt[i]){ var m=sums[i]/cnt[i]; if(m<best){best=m; darkest=i;} } } var m=new Uint8Array(w*h); for(i=0;i<w*h;i++) m[i]=(labels[i]===darkest)?1:0; return m; }
  function cropMaskToSubject(mask,w,h){ var f=STATE.imgFit, r=STATE.subject.rect; if(!f||!r) return; var sx=Math.max(0,Math.floor((r.x-f.ox)/f.scale)), sy=Math.max(0,Math.floor((r.y-f.oy)/f.scale)), ex=Math.min(w-1,Math.floor((r.x+r.w-f.ox)/f.scale)), ey=Math.min(h-1,Math.floor((r.y+r.h-f.ox)/f.scale)); for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ if(!(x>=sx&&x<=ex&&y>=sy&&y<=ey)) mask[y*w+x]=0; } } }
  function marchingSquares(mask,w,h){ var paths=[], visited=new Uint8Array(w*h); function idx(x,y){ return y*w+x; } function trace(sx,sy){ var x=sx, y=sy, dir=0, path=[], iter=0, maxIter=w*h*8; while(iter++<maxIter){ var a=mask[idx(x  ,y  )]?1:0, b=mask[idx(x+1,y  )]?1:0, c=mask[idx(x+1,y+1)]?1:0, d=mask[idx(x  ,y+1)]?1:0; var code=a + b*2 + c*4 + d*8; if(code===0||code===15){ if(dir===0)x++; else if(dir===1)y++; else if(dir===2)x--; else y--; } else{ if(code===1||code===5||code===13){ path.push([x,y+0.5]); dir=3; x--; } else if(code===8||code===10||code===11){ path.push([x+0.5,y+1]); dir=0; y++; } else if(code===4||code===12||code===14){ path.push([x+1,y+0.5]); dir=1; x++; } else if(code===2||code===3||code===7){ path.push([x+0.5,y]); dir=2; y--; } if(x<0||y<0||x>=w-1||y>=h-1) break; if(x===sx&&y===sy && path.length>20) break; } } return path; } for(var y=0;y<h-1;y++){ for(var x=0;x<w-1;x++){ var i=idx(x,y); if(visited[i]) continue; var code=(mask[i]?1:0)+(mask[i+1]?2:0)+(mask[i+w+1]?4:0)+(mask[i+w]?8:0); if(code!==0 && code!==15){ var path=trace(x,y); for(var k=0;k<path.length;k++){ var px=Math.min(w-1,Math.max(0,(path[k][0]>>0))), py=Math.min(h-1,Math.max(0,(path[k][1]>>0))); visited[idx(px,py)]=1; } if(path.length>10) paths.push(path); } } } return paths; }
  function pathsToStitches(paths,outW,outH){ var stitches=[]; if(!paths||!paths.length) return stitches; var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p; for(i=0;i<paths.length;i++){ for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; } } var w=maxx-minx, h=maxy-miny, margin=20, sx=(outW-2*margin)/w, sy=(outH-2*margin)/h, s=Math.min(sx,sy); var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s; for(i=0;i<paths.length;i++){ var path=paths[i]; if(!path.length) continue; stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy}); for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy}); } return stitches; }

  function render(){
    var W=prev.width/dpr(), H=prev.height/dpr(), ctx=STATE.canvases.prevCtx;
    ctx.setTransform(dpr(),0,0,dpr(),0,0);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
    if(STATE.lastImage && STATE.imgFit){ var f=STATE.imgFit; ctx.save(); ctx.globalAlpha=STATE.processed?0.75:0.95; ctx.drawImage(STATE.lastImage, f.ox, f.oy, f.iw*f.scale, f.ih*f.scale); ctx.restore(); }
    if(STATE.guides){ ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#94a3b8'; for(var gy=10; gy<H; gy+=20){ for(var gx=10; gx<W; gx+=20){ ctx.fillRect(gx,gy,1,1); } } ctx.restore(); }
    ctx.strokeStyle=STATE.active||'#111827'; ctx.lineWidth=1.6; ctx.beginPath(); for(var i=0;i<STATE.stitches.length;i++){ var s=STATE.stitches[i]; if(s.cmd==='jump') ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); } ctx.stroke();
    if(STATE.subject.enabled && STATE.subject.rect){ var r=STATE.subject.rect; ctx.save(); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.setLineDash([6,6]); ctx.lineWidth=1; ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore(); }
    if(STATE.busy){ ctx.save(); ctx.fillStyle='rgba(255,255,255,.65)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#111827'; ctx.font='600 14px system-ui, sans-serif'; ctx.fillText('Processing…', 12, 22); ctx.restore(); }
  }

  function toUnits(){ var W=prev.width/dpr(), H=prev.height/dpr(); var s=1/STATE.pxPerMm*10, cx=W/2, cy=H/2, prevPt=null, out=[]; for(var i=0;i<STATE.stitches.length;i++){ var a=STATE.stitches[i]; if(a.cmd==='stop'){ out.push({cmd:'stop'}); prevPt=null; continue; } if(a.cmd==='jump'||a.cmd==='stitch'){ var x=(a.x-cx)*s, y=(a.y-cy)*s; if(prevPt===null){ prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); } else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; } } } return out; }
  function encDST(){ var u=toUnits(), bytes=[]; function enc(dx,dy,flag){ if(flag==null) flag=0; dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121); var b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6); var b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2); var b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); } var colors=0; for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; } if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; } enc(s.dx,s.dy,0); } bytes.push(0,0,0xF3); var header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512); var hb=new TextEncoder().encode(header); var u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8; }
  function encEXP(){ var u=toUnits(), bytes=[]; function put(dx,dy,cmd){ dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127); if(cmd==='jump') bytes.push(0x80,0x04); if(cmd==='stop') bytes.push(0x80,0x01); if(cmd==='end')  bytes.push(0x80,0x00); if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); } } for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ put(0,0,'stop'); continue; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; } put(s.dx,s.dy,'stitch'); } bytes.push(0x80,0x00); return new Uint8Array(bytes); }
  function encViaAI(fmt, cb){ if(!STATE.ai || !STATE.ai.endpoint || !STATE.ai.key){ cb(new Error('Set ?aiEndpoint=...&aiKey=... or localStorage "loomabelle:cfg".')); return; } fetch(STATE.ai.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits()})}).then(function(res){ if(!res.ok) throw new Error('AI conversion failed'); return res.arrayBuffer(); }).then(function(buf){ cb(null, new Uint8Array(buf)); }).catch(function(err){ cb(err); }); }
  function download(name, bytes){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download=name; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500); }
  $$('.col.card.rose .formats .btn').forEach(function(btn){ var fmt=btn.textContent.replace(/\s+/g,'').toUpperCase(); if(['DST','EXP','PES','JEF'].indexOf(fmt)===-1) return; if(btn.tagName==='BUTTON' && !btn.type) btn.type='button'; on(btn,'click',function(e){ e.preventDefault(); try{ if(fmt==='DST') return download('loomabelle.dst', encDST()); if(fmt==='EXP') return download('loomabelle.exp', encEXP()); encViaAI(fmt,function(err,bytes){ if(err) return alert(fmt+': '+err.message); download('loomabelle.'+fmt.toLowerCase(), bytes); }); }catch(err){ alert(fmt+': '+err.message); } }); });

  function init(){ wireTabs(); STATE.history=[draw.toDataURL('image/png')]; render(); }
  init();
})();