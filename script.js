/* Loomabelle — v9.2
   - Stops page refresh on Process for all browsers (capture + bubble).
   - Adds progress bar in Preview while processing.
   - Wires upload-panel checkboxes (remove disabled, reflect into STATE.opts).
   - Keeps iOS touch locking and accurate pointer mapping from v9/v9.1.
*/
(function(){
  // ========== tiny helpers ==========
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function on(el,ev,fn,opt){ el&&el.addEventListener(ev,fn,opt||false); }
  function dpr(){ return window.devicePixelRatio||1; }
  function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function debounce(fn,ms){ var t; return function(){ var a=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(null,a); },ms); }; }

  // Hide any “mockup” text notes
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1) el.style.display='none';
  });

  // Kill any implicit form submits (both capture & bubble), and coerce all buttons to type="button"
  document.addEventListener('submit', function(e){ e.preventDefault(); e.stopPropagation(); }, true);
  document.addEventListener('submit', function(e){ e.preventDefault(); e.stopPropagation(); }, false);
  document.addEventListener('click', function(e){
    var b=e.target && e.target.closest && e.target.closest('button');
    if(b && !b.type) b.type='button';
    var a=e.target && e.target.closest && e.target.closest('a[href="#"]');
    if(a){ e.preventDefault(); }
  }, true);

  // Minimal CSS for touch locking + progress bar (no theme change)
  (function addCSS(){
    var css = ""
      + ".loomabelle-interactive{touch-action:none;-ms-touch-action:none}"
      + "canvas.loomabelle-interactive{touch-action:none!important}"
      + "body._lb_lock,html._lb_lock{overscroll-behavior:contain}"
      + ".lb-progress{position:absolute;left:8px;right:8px;bottom:8px;height:6px;background:rgba(0,0,0,.08);border-radius:6px;overflow:hidden;display:none}"
      + ".lb-progress>.bar{height:100%;width:0%;background:linear-gradient(90deg,#f472b6,#93c5fd,#86efac);transition:width .18s ease}"
      + ".lb-toolbar{position:absolute;left:8px;right:8px;bottom:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;justify-content:flex-start;z-index:3;pointer-events:auto}"
      ;
    var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
  })();

  // ===== app state =====
  var STATE={
    hoop:{wmm:100,hmm:100}, pxPerMm:2,
    tool:'pen', guides:false, active:'#111827',
    history:[], ai:{}, stitches:[],
    lastImage:null, imgFit:null,
    subject:{enabled:false,rect:null,noSubject:false},
    opts:{ // wired to upload-panel checkboxes
      autoTrace:false,
      reduce:true,
      cleanup:true,
      fillSatin:true
    },
    busy:false, processed:false,
    canvases:{}
  };

  // ===== config (url/localStorage) =====
  (function cfg(){
    try{ var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch(e){}
    var q=(function(){ var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(s){var kv=s.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out; })();
    if(q.hoop){ var sp=q.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h) STATE.hoop={wmm:w,hmm:h}; }
    if(q.aiEndpoint) STATE.ai.endpoint=q.aiEndpoint; if(q.aiKey) STATE.ai.key=q.aiKey;
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  // ===== tabs (don’t reload) =====
  function wireTabs(){
    var tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(function(btn){
      if(!btn.type) btn.type='button';
      on(btn,'click',function(e){
        e.preventDefault();
        tabs.forEach(function(b){ b.classList.toggle('active', b===btn); });
        panels.forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')); });
        resizeAll();
      });
    });
    // quick links
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

  // ===== canvas hosts =====
  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Loomabelle: Missing .preview or .canvas host'); return; }
  if(getComputedStyle(prevHost).position==='static'){ prevHost.style.position='relative'; }

  // canvases
  var prev=document.createElement('canvas'), pctx=prev.getContext('2d',{alpha:true,willReadFrequently:true});
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d',{alpha:true,willReadFrequently:true}); dctx.lineCap='round'; dctx.lineJoin='round';
  prev.classList.add('loomabelle-interactive'); draw.classList.add('loomabelle-interactive');
  prevHost.innerHTML=''; prevHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);
  STATE.canvases={prev:prev, prevCtx:pctx, draw:draw, drawCtx:dctx};

  // progress bar + toolbar (bottom of preview)
  var prog=make('div','lb-progress'); var bar=make('div','bar'); prog.appendChild(bar); prevHost.appendChild(prog);
  var toolbar=make('div','lb-toolbar');
  var btnProcess=make('button','btn','Process Photo'); btnProcess.type='button';
  var btnHighlight=make('button','btn','Highlight Subject'); btnHighlight.type='button';
  var lblNoSub=make('label',null,''); var chkNoSub=make('input'); chkNoSub.type='checkbox'; lblNoSub.appendChild(chkNoSub); lblNoSub.appendChild(document.createTextNode(' No subject'));
  toolbar.appendChild(btnProcess); toolbar.appendChild(btnHighlight); toolbar.appendChild(lblNoSub);
  prevHost.appendChild(toolbar);

  // sizing
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

  // palette (unchanged look)
  var sw=document.querySelector('.swatches');
  if(sw && !sw.children.length){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    ['#111827','#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
      .forEach(function(c){ var d=make('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer'; d.title=c; on(d,'click',function(){STATE.active=c; render();}); sw.appendChild(d); });
  }

  // upload zone
  var uploadZone=$('.upload-zone');
  var fileInput=uploadZone && uploadZone.querySelector('input[type="file"]');
  if(uploadZone){
    if(fileInput){ fileInput.removeAttribute('disabled'); on(fileInput,'change',function(e){ e.preventDefault(); var f=fileInput.files[0]; if(f) loadImage(f); }); }
    on(uploadZone,'dragover',function(e){ e.preventDefault(); });
    on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(uploadZone,'click',function(e){ if(e.target===uploadZone && fileInput) fileInput.click(); });
  }

  // wire the four checkboxes beneath Upload
  (function wireUploadCheckboxes(){
    var panel = document.querySelector('.panel[data-panel="upload"]') || document;
    var boxes = $$('.panel[data-panel="upload"] input[type="checkbox"]',document);
    if(!boxes.length){ boxes = $$('.col.card.blue input[type="checkbox"]',document); }
    if(!boxes.length){ boxes = $$('input[type="checkbox"]', panel); }
    boxes.forEach(function(cb){
      cb.removeAttribute('disabled');
      var label = (cb.closest('label') && cb.closest('label').textContent || cb.parentNode && cb.parentNode.textContent || '').toLowerCase();
      if(label.indexOf('auto-trace')>-1){ cb.checked=STATE.opts.autoTrace; on(cb,'change',function(){ STATE.opts.autoTrace=cb.checked; /* auto enable subject box toggle */ }); }
      else if(label.indexOf('reduce')>-1){ cb.checked=STATE.opts.reduce; on(cb,'change',function(){ STATE.opts.reduce=cb.checked; }); }
      else if(label.indexOf('edge')>-1){ cb.checked=STATE.opts.cleanup; on(cb,'change',function(){ STATE.opts.cleanup=cb.checked; }); }
      else if(label.indexOf('fill')>-1 || label.indexOf('satin')>-1){ cb.checked=STATE.opts.fillSatin; on(cb,'change',function(){ STATE.opts.fillSatin=cb.checked; }); }
    });
  })();

  // toolbar actions
  on(btnHighlight,'click',function(e){
    e.preventDefault();
    STATE.subject.enabled=!STATE.subject.enabled;
    if(!STATE.subject.enabled) STATE.subject.rect=null;
    btnHighlight.classList.toggle('active', STATE.subject.enabled);
    render();
  });
  on(chkNoSub,'change',function(){ STATE.subject.noSubject=chkNoSub.checked; });

  // formats hidden until processed
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

  // preview shows image before processing
  function loadImage(file){
    var img=new Image();
    img.onload=function(){ STATE.lastImage=img; STATE.processed=false; setFormatsVisible(false); showImageInPreview(img,1); if(STATE.opts.autoTrace){ STATE.subject.enabled=true; } };
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

  // scroll lock during canvas interactions
  function lockScroll(){ document.documentElement.classList.add('_lb_lock'); document.body.classList.add('_lb_lock'); }
  function unlockScroll(){ document.documentElement.classList.remove('_lb_lock'); document.body.classList.remove('_lb_lock'); }

  // canvas pointer mapping (exact under finger)
  function canvasPoint(e, canvas){
    var rect = canvas.getBoundingClientRect();
    var cssX = (e.clientX!=null?e.clientX:(e.touches&&e.touches[0].clientX)) - rect.left;
    var cssY = (e.clientY!=null?e.clientY:(e.touches&&e.touches[0].clientY)) - rect.top;
    var scaleX = (canvas.width / (dpr())) / rect.width;
    var scaleY = (canvas.height / (dpr())) / rect.height;
    return { x: cssX*scaleX, y: cssY*scaleY };
  }

  // subject rectangle
  var highlighting=false, start=null;
  function preventTouch(e){ e.preventDefault(); }
  on(prev,'pointerdown',function(e){
    if(!STATE.subject.enabled) return;
    e.preventDefault(); lockScroll();
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

  // draw tools
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

  // progress helpers
  function progressStart(){
    prog.style.display='block'; bar.style.width='0%';
    // simple indeterminate kick
    var p=0, id=setInterval(function(){ p=(p+7)%100; bar.style.width=(p)+'%'; bar.dataset._id=id; }, 140);
  }
  function progressSet(v){ bar.style.width=(clamp(v,0,100))+'%'; }
  function progressDone(){
    var id=Number(bar.dataset._id||0); if(id) clearInterval(id); bar.dataset._id='';
    bar.style.width='100%'; setTimeout(function(){ prog.style.display='none'; }, 300);
  }

  function processingOverlay(text){
    var W=prev.width/dpr(), H=prev.height/dpr(); render();
    pctx.save(); pctx.fillStyle='rgba(255,255,255,.65)'; pctx.fillRect(0,0,W,H);
    pctx.fillStyle='#111827'; pctx.font='600 14px system-ui, sans-serif'; pctx.fillText(text||'Processing…', 12, 22);
    pctx.restore();
  }

  // PHOTO -> stitches
  function processPhoto(img){
    if(STATE.busy) return;
    STATE.busy=true; STATE.processed=false; setFormatsVisible(false);
    processingOverlay('Processing photo…'); progressStart(); progressSet(5);
    try{
      if(!STATE.imgFit) showImageInPreview(img,1);
      var base=rasterize(img, 896); progressSet(20);
      var gray=toGray(base.ctx,base.w,base.h); progressSet(35);
      var thr=autoOtsu(gray,base.w,base.h); progressSet(45);
      var mask=binarize(gray,base.w,base.h,thr); progressSet(55);
      if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){ cropMaskToSubject(mask,base.w,base.h); progressSet(60); }

      var paths=marchingSquares(mask,base.w,base.h); progressSet(72);

      if((STATE.opts.reduce||STATE.opts.cleanup)){
        try{
          var ref=rasterize(img,896); progressSet(78);
          if(STATE.opts.cleanup) { blur1(ref.ctx,ref.w,ref.h); progressSet(82); }
          if(STATE.opts.reduce){
            var labels=kmeansLabels(ref.ctx,6); progressSet(86);
            var fg=darkestClusterMask(ref.ctx,labels,ref.w,ref.h); progressSet(90);
            if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit) cropMaskToSubject(fg,ref.w,ref.h);
            var finer=marchingSquares(fg,ref.w,ref.h);
            if(finer && finer.length) paths=finer;
          }
        }catch(e){}
      }

      if(!paths || !paths.length) throw new Error('No clear edges found');

      STATE.stitches=pathsToStitches(paths, prev.width/dpr(), prev.height/dpr()); progressSet(98);
      STATE.subject.enabled=false; STATE.subject.rect=null;
      STATE.busy=false; STATE.processed=true; setFormatsVisible(true); progressDone(); render();
    }catch