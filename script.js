/* Loomabelle — v5 (ES5, no modules)
   What’s new (no HTML/CSS edits):
   - Upload works again.
   - “Start with a photo” switches to the Upload tab.
   - The Preview shows the uploaded photo BEFORE processing.
   - Controls (Process Photo · Highlight Subject · No subject) live INSIDE the Preview.
   - Subject = drag a rectangle on the Preview (optional).
   - Viewport stays a consistent, responsive size across tab changes (ResizeObserver + MutationObserver).
   - Export format buttons stay hidden until after processing.
   - Draw tab still works; “Process Drawing” button only.
   - DST/EXP exports offline; PES/JEF via optional AI (unchanged UI).
*/
(function(){
  // ---------- small helpers ----------
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function on(el,ev,fn){ el && el.addEventListener(ev,fn); }
  function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
  function dpr(){ return window.devicePixelRatio||1; }
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }

  // Hide “mockup only” helper text without touching HTML
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1){ el.style.display='none'; }
  });

  // ---------- state ----------
  var STATE={
    hoop:{wmm:100,hmm:100},
    pxPerMm:2,
    tool:'pen', guides:false, active:'#fb7185',
    history:[],
    ai:{},
    stitches:[],
    // upload
    lastImage:null,
    imgFit:null,          // {ox,oy,scale,iw,ih} for mapping preview<->image
    subject:{enabled:false,rect:null,noSubject:false},
    opts:{reduce:true,cleanup:true},
    // canvases/hosts
    canvases:{}
  };

  // config from url/localStorage
  (function cfg(){
    try{ var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch(e){}
    var p=(function(){ var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(q){var kv=q.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out; })();
    if(p.hoop){ var sp=p.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h){ STATE.hoop={wmm:w,hmm:h}; } }
    if(p.aiEndpoint) STATE.ai.endpoint=p.aiEndpoint; if(p.aiKey) STATE.ai.key=p.aiKey;
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  // ---------- tabs ----------
  function wireTabs(){
    var tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(function(btn){
      on(btn,'click',function(){
        tabs.forEach(function(b){ b.classList.toggle('active', b===btn); });
        panels.forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')); });
        requestAnimationFrame(resizeAll);
      });
    });
    // “Start with a photo” should switch to Upload
    $$('a,button').forEach(function(el){
      var t=(el.textContent||'').toLowerCase();
      if(t.indexOf('start with a photo')>-1 || t.indexOf('upload photo')>-1){
        on(el,'click',function(e){ e.preventDefault(); var up=$('.tab-btn[data-tab="upload"]')||$('.tab-btn:first-child'); up && up.click(); });
      }
      if(/open.*draw|open.*drawing|draw & trace/.test(t)){
        on(el,'click',function(e){ e.preventDefault(); var dr=$('.tab-btn[data-tab="draw"]'); dr && dr.click(); });
      }
    });
    var y=$('#year'); if(y) y.textContent=(new Date()).getFullYear();
  }

  // ---------- canvas setup (responsive & stable across tab switches) ----------
  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Missing .preview or .canvas container'); return; }

  // Ensure host can position toolbar overlay without touching CSS
  if(getComputedStyle(prevHost).position==='static'){ prevHost.style.position='relative'; }

  var prev=document.createElement('canvas'), pctx=prev.getContext('2d');
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d'); dctx.lineCap='round'; dctx.lineJoin='round';
  prevHost.innerHTML=''; prevHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);
  STATE.canvases={prev:prev, prevCtx:pctx, draw:draw, drawCtx:dctx};

  function sizeCanvasToHost(canvas, host){
    var cw=Math.max(320, host.clientWidth||640);
    var ch=Math.max(220, Math.floor(cw*9/16));
    var scale=dpr();
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width=Math.round(cw*scale); canvas.height=Math.round(ch*scale);
    canvas.getContext('2d').setTransform(scale,0,0,scale,0,0);
  }
  function updatePxPerMm(){
    var m=10, W=prev.width/dpr(), H=prev.height/dpr();
    STATE.pxPerMm=Math.min((W-m*2)/STATE.hoop.wmm, (H-m*2)/STATE.hoop.hmm);
  }
  function resizeAll(){
    sizeCanvasToHost(prev, prevHost);
    sizeCanvasToHost(draw, drawHost);
    updatePxPerMm();
    render(); // keep viewport stable when switching tabs
  }
  // observe size + panel activation
  try{
    new ResizeObserver(resizeAll).observe(prevHost);
    new ResizeObserver(resizeAll).observe(drawHost);
    new MutationObserver(function(){ resizeAll(); }).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
  }catch(e){ window.addEventListener('resize', resizeAll); }
  resizeAll();

  // ---------- Thread palette (unchanged visuals) ----------
  var sw=document.querySelector('.swatches');
  if(sw){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    if(sw.children.length===0){
      ['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
      .forEach(function(c){ var d=make('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer'; d.title=c; on(d,'click',function(){STATE.active=c;}); sw.appendChild(d); });
    }
  }

  // ---------- UPLOAD ----------
  var uploadZone=$('.upload-zone');
  var fileInput=uploadZone && uploadZone.querySelector('input[type="file"]');
  if(fileInput){ fileInput.removeAttribute('disabled'); on(fileInput,'change',function(){ var f=fileInput.files[0]; if(f) loadImage(f); }); }
  if(uploadZone){
    on(uploadZone,'dragover',function(e){ e.preventDefault(); });
    on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(uploadZone,'click',function(e){ if(e.target===uploadZone && fileInput) fileInput.click(); });
  }

  // put toolbar inside PREVIEW
  var toolbar = make('div');
  toolbar.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3';
  var btnProcess   = make('button','btn','Process Photo');
  var btnHighlight = make('button','btn','Highlight Subject');
  var lblNoSub     = make('label',null,''); var chkNoSub=make('input'); chkNoSub.type='checkbox'; lblNoSub.appendChild(chkNoSub); lblNoSub.appendChild(document.createTextNode(' No subject'));
  toolbar.appendChild(btnProcess); toolbar.appendChild(btnHighlight); toolbar.appendChild(lblNoSub);
  prevHost.appendChild(toolbar);

  on(btnHighlight,'click',function(){
    STATE.subject.enabled=!STATE.subject.enabled;
    if(!STATE.subject.enabled) STATE.subject.rect=null;
    btnHighlight.classList.toggle('active', STATE.subject.enabled);
    render(); // draw/remove overlay
  });
  on(chkNoSub,'change',function(){ STATE.subject.noSubject=chkNoSub.checked; });

  // Hide export formats until processed
  var formatBtns = $$('.col.card.rose .formats .btn');
  function setFormatsVisible(v){
    formatBtns.forEach(function(b){ b.style.display = v ? 'inline-block' : 'none'; });
  }
  setFormatsVisible(false);

  on(btnProcess,'click',function(){
    if(!STATE.lastImage) return alert('Choose a photo first.');
    processPhoto(STATE.lastImage);
  });

  function loadImage(file){
    var img=new Image();
    img.onload=function(){
      STATE.lastImage=img;
      // show photo in preview BEFORE processing (so user can highlight)
      showImageInPreview(img, 1);
      setFormatsVisible(false);
    };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous';
    img.src=URL.createObjectURL(file);
  }

  // preview: image + overlay + stitches
  function showImageInPreview(img, alpha){
    var W=prev.width/dpr(), H=prev.height/dpr();
    var iw=img.width, ih=img.height, s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    pctx.setTransform(dpr(),0,0,dpr(),0,0);
    pctx.clearRect(0,0,W,H);
    pctx.fillStyle='#fff'; pctx.fillRect(0,0,W,H);
    pctx.globalAlpha=alpha||1;
    pctx.drawImage(img,ox,oy,w,h);
    pctx.globalAlpha=1;
    renderOverlay(); // overlay rect if on
  }

  // subject drag on preview
  var dragging=false, start=null;
  on(prev,'pointerdown',function(e){
    if(!STATE.subject.enabled) return;
    var r=prev.getBoundingClientRect(); start=[e.clientX-r.left, e.clientY-r.top]; dragging=true;
    STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; renderOverlay();
  });
  on(prev,'pointermove',function(e){
    if(!dragging || !STATE.subject.enabled) return;
    var r=prev.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    STATE.subject.rect={x:Math.min(start[0],x), y:Math.min(start[1],y), w:Math.abs(x-start[0]), h:Math.abs(y-start[1])};
    renderOverlay();
  });
  on(window,'pointerup',function(){ dragging=false; });

  function renderOverlay(){
    render(); // draws stitches/background/grid
    var W=prev.width/dpr(), H=prev.height/dpr();
    // redraw image faintly beneath stitches if available
    if(STATE.lastImage && STATE.imgFit){
      pctx.save(); pctx.globalAlpha=0.9;
      var f=STATE.imgFit; pctx.drawImage(STATE.lastImage,f.ox,f.oy,f.iw*f.scale,f.ih*f.scale);
      pctx.restore();
    }
    if(STATE.subject.enabled && STATE.subject.rect){
      var r=STATE.subject.rect;
      pctx.save();
      pctx.strokeStyle='rgba(20,20,20,.95)'; pctx.setLineDash([6,6]); pctx.lineWidth=1;
      pctx.strokeRect(r.x,r.y,r.w,r.h);
      pctx.restore();
    }
  }

  // ---------- DRAW ----------
  function wireDrawTools(){
    var toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    toolBtns.forEach(function(b,i){
      var tool=map[i]||'pen'; b.dataset.tool=tool; b.removeAttribute('disabled');
      on(b,'click',function(){
        if(tool==='undo') return void undo();
        if(tool==='guides'){ STATE.guides=!STATE.guides; return render(); }
        if(tool==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; return render(); }
        STATE.tool=tool;
      });
    });
    // add a minimal Process button
    var tb=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    var proc=make('button','btn','Process Drawing'); proc.style.marginLeft='10px';
    tb && tb.appendChild(proc);
    on(proc,'click',processDrawing);
  }
  wireDrawTools();

  var drawing=false;
  on(draw,'pointerdown',function(e){
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='fill'){ floodFill(STATE.canvases.drawCtx,x|0,y|0,STATE.active); snapshot(); return; }
    drawing=true; dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y);
  });
  on(draw,'pointermove',function(e){
    if(!drawing) return;
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='pen'){ dctx.lineTo(x,y); dctx.stroke(); }
    else if(STATE.tool==='eraser'){ dctx.clearRect(x-6,y-6,12,12); }
  });
  on(window,'pointerup',function(){ if(drawing){ drawing=false; snapshot(); } });

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
  function snapshot(){ STATE.history.push(draw.toDataURL()); if(STATE.history.length>50) STATE.history.shift(); }
  function undo(){ if(STATE.history.length<2) return; STATE.history.pop(); var img=new Image(); img.onload=function(){ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); render(); }; img.src=STATE.history[STATE.history.length-1]; }

  // ---------- processing core ----------
  function processPhoto(img){
    setFormatsVisible(false);
    // prepare raster
    var max=1024;
    var s=Math.min(1, max/Math.max(img.width,img.height));
    var w=(img.width*s)|0, h=(img.height*s)|0;
    var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
    var id=x.getImageData(0,0,w,h), d=id.data;

    if(STATE.opts.cleanup){
      var out=new Uint8ClampedArray(d.length), rad=1;
      for(var yy=0; yy<h; yy++){ for(var xx=0; xx<w; xx++){
        var R=0,G=0,B=0,A=0,C=0;
        for(var dy=-rad; dy<=rad; dy++){ for(var dx=-rad; dx<=rad; dx++){
          var px=Math.max(0,Math.min(w-1,xx+dx)), py=Math.max(0,Math.min(h-1,yy+dy)); var ii=(py*w+px)*4;
          R+=d[ii]; G+=d[ii+1]; B+=d[ii+2]; A+=d[ii+3]; C++;
        }} var o=(yy*w+xx)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; } }
      id.data.set(out); x.putImageData(id,0,0);
    }

    var mask=new Uint8Array(w*h), i;
    if(STATE.opts.reduce){
      var lab=kmeansLabels(x,6), sums=[], cnt=[], j;
      for(j=0;j<6;j++){ sums.push(0); cnt.push(0); }
      var d2=x.getImageData(0,0,w,h).data;
      for(i=0;i<w*h;i++){ var cix=lab[i], p=i*4; var lum=0.2126*d2[p]+0.7152*d2[p+1]+0.0722*d2[p+2]; sums[cix]+=lum; cnt[cix]++; }
      var darkest=0,best=1e9; for(j=0;j<6;j++){ if(cnt[j]){ var m=sums[j]/cnt[j]; if(m<best){best=m; darkest=j;} } }
      for(i=0;i<w*h;i++){ mask[i]=(lab[i]===darkest)?1:0; }
    }else{
      for(i=0;i<w*h;i++){ var p2=i*4; var g=(d[p2]*0.3+d[p2+1]*0.59+d[p2+2]*0.11)|0; mask[i]=(g<128)?1:0; }
    }

    // apply subject rectangle (if enabled & not No subject)
    if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){
      var fit=STATE.imgFit;
      var sx=Math.max(0, Math.floor((STATE.subject.rect.x - fit.ox)/fit.scale));
      var sy=Math.max(0, Math.floor((STATE.subject.rect.y - fit.oy)/fit.scale));
      var ex=Math.min(w-1, Math.floor((STATE.subject.rect.x+STATE.subject.rect.w - fit.ox)/fit.scale));
      var ey=Math.min(h-1, Math.floor((STATE.subject.rect.y+STATE.subject.rect.h - fit.oy)/fit.scale));
      for(var y=0;y<h;y++){ for(var x0=0;x0<w;x0++){ if(!(x0>=sx && x0<=ex && y>=sy && y<=ey)) mask[y*w+x0]=0; } }
    }

    var paths=marchingSquares(mask,w,h);
    STATE.stitches = pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
    STATE.subject.enabled=false; STATE.subject.rect=null;
    setFormatsVisible(true);
    render();
  }

  function processDrawing(){
    setFormatsVisible(false);
    var w=draw.width, h=draw.height, x=draw.getContext('2d'), id=x.getImageData(0,0,w,h), d=id.data;
    var max=1024, s=Math.min(1, max/Math.max(w,h)), sw=Math.max(2,(w*s)|0), sh=Math.max(2,(h*s)|0);
    var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var t=tmp.getContext('2d');
    var g=document.createImageData(w,h); for(var i=0;i<w*h;i++){ var a=d[i*4+3]; g.data[i*4]=a; g.data[i*4+1]=a; g.data[i*4+2]=a; g.data[i*4+3]=255; }
    x.putImageData(g,0,0);
    t.drawImage(draw,0,0,sw,sh);
    var id2=t.getImageData(0,0,sw,sh), mask=new Uint8Array(sw*sh);
    for(i=0;i<sw*sh;i++){ mask[i]=id2.data[i*4]>0?1:0; }
    var paths=marchingSquares(mask,sw,sh);
    STATE.stitches = pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
    setFormatsVisible(true);
    render();
  }

  // kmeans (labels only)
  function kmeansLabels(ctx,k){
    var w=ctx.canvas.width, h=ctx.canvas.height, id=ctx.getImageData(0,0,w,h), d=id.data;
    var centers=[], labels=new Uint8Array(w*h);
    for(var i=0;i<k;i++){ var p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); }
    for(var it=0; it<4; it++){
      for(var i2=0;i2<w*h;i2++){
        var r=d[i2*4], g=d[i2*4+1], b=d[i2*4+2], best=0, bd=1e20;
        for(var c=0;c<k;c++){ var cc=centers[c], dist=(r-cc[0])*(r-cc[0])+(g-cc[1])*(g-cc[1])+(b-cc[2])*(b-cc[2]); if(dist<bd){bd=dist; best=c;} }
        labels[i2]=best;
      }
      var sums=[], counts=[], cix;
      for(cix=0;cix<k;cix++){ sums.push([0,0,0]); counts.push(0); }
      for(i2=0;i2<w*h;i2++){ var ci=labels[i2], p2=i2*4; sums[ci][0]+=d[p2]; sums[ci][1]+=d[p2+1]; sums[ci][2]+=d[p2+2]; counts[ci]++; }
      for(cix=0;cix<k;cix++){ if(counts[cix]) centers[cix]=[sums[cix][0]/counts[cix], sums[cix][1]/counts[cix], sums[cix][2]/counts[cix]]; }
    }
    return labels;
  }

  // marching squares (guarded)
  function marchingSquares(mask,w,h){
    var paths=[], visited=new Uint8Array(w*h);
    function idx(x,y){ return y*w+x; }
    function trace(sx,sy){
      var x=sx, y=sy, dir=0, path=[], iter=0, maxIter=w*h*8;
      while(iter++<maxIter){
        var a=mask[idx(x  ,y  )]?1:0,
            b=mask[idx(x+1,y  )]?1:0,
            c=mask[idx(x+1,y+1)]?1:0,
            d=mask[idx(x  ,y+1)]?1:0;
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
      }
      return path;
    }
    for(var y=0;y<h-1;y++){
      for(var x=0;x<w-1;x++){
        var i=idx(x,y); if(visited[i]) continue;
        var code=(mask[i]?1:0)+(mask[i+1]?2:0)+(mask[i+w+1]?4:0)+(mask[i+w]?8:0);
        if(code!==0 && code!==15){
          var path=trace(x,y);
          for(var k=0;k<path.length;k++){ var px=Math.min(w-1,Math.max(0, (path[k][0]>>0))), py=Math.min(h-1,Math.max(0, (path[k][1]>>0))); visited[idx(px,py)]=1; }
          if(path.length>10) paths.push(path);
        }
      }
    }
    return paths;
  }

  function pathsToStitches(paths, outW, outH){
    var stitches=[]; if(!paths||!paths.length) return stitches;
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p;
    for(i=0;i<paths.length;i++){ for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; } }
    var w=maxx-minx, h=maxy-miny, margin=20, sx=(outW-2*margin)/w, sy=(outH-2*margin)/h, s=Math.min(sx,sy);
    var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){ var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy});
    }
    return stitches;
  }

  // ---------- preview render ----------
  function render(){
    var W=prev.width/dpr(), H=prev.height/dpr();
    var ctx=STATE.canvases.prevCtx;
    ctx.setTransform(dpr(),0,0,dpr(),0,0);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);

    // grid / guides
    if(STATE.guides){
      ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#94a3b8';
      for(var gy=10; gy<H; gy+=20){ for(var gx=10; gx<W; gx+=20){ ctx.fillRect(gx,gy,1,1); } }
      ctx.restore();
    }

    // image (if any) lightly in background so stitching is visible
    if(STATE.lastImage && STATE.imgFit){
      var f=STATE.imgFit;
      ctx.save(); ctx.globalAlpha=0.9;
      ctx.drawImage(STATE.lastImage, f.ox, f.oy, f.iw*f.scale, f.ih*f.scale);
      ctx.restore();
    }

    // stitches
    ctx.strokeStyle='#111827'; ctx.lineWidth=1; ctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){
      var s=STATE.stitches[i];
      if(s.cmd==='jump') ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y);
    }
    ctx.stroke();

    if(STATE.guides){
      var hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm;
      ctx.save(); ctx.strokeStyle='rgba(0,0,0,.22)'; ctx.setLineDash([6,6]);
      ctx.strokeRect((W-hoopW)/2,(H-hoopH)/2, hoopW, hoopH); ctx.restore();
    }
  }

  // ---------- exports ----------
  function toUnits(){
    var W=prev.width/dpr(), H=prev.height/dpr();
    var s=1/STATE.pxPerMm*10, cx=W/2, cy=H/2, prevPt=null, out=[];
    for(var i=0;i<STATE.stitches.length;i++){
      var a=STATE.stitches[i];
      if(a.cmd==='stop'){ out.push({cmd:'stop'}); prevPt=null; continue; }
      if(a.cmd==='jump'||a.cmd==='stitch'){
        var x=(a.x-cx)*s, y=(a.y-cy)*s;
        if(prevPt===null){ prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
        else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; }
      }
    } return out;
  }
  function encDST(){
    var u=toUnits(), bytes=[];
    function enc(dx,dy,flag){ if(flag==null) flag=0; dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
      var b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
      var b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
      var b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); }
    var colors=0;
    for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; } if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; } enc(s.dx,s.dy,0); }
    bytes.push(0,0,0xF3);
    var header=("LA:LOOMABELLE.ST\n"+"ST:"+String((bytes.length/3)|0).padStart(7,' ')+"\n"+"CO:"+String(colors+1).padStart(3,' ')+"\n"+"  "+(Array(513).join(' '))).slice(0,512);
    var hb=new TextEncoder().encode(header);
    var u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
  }
  function encEXP(){
    var u=toUnits(), bytes=[];
    function put(dx,dy,cmd){
      dx=clamp(Math.round(dx),-127,127); dy=clamp(Math.round(dy),-127,127);
      if(cmd==='jump') bytes.push(0x80,0x04);
      if(cmd==='stop') bytes.push(0x80,0x01);
      if(cmd==='end') bytes.push(0x80,0x00);
      if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); }
    }
    for(var i=0;i<u.length;i++){ var s=u[i]; if(s.cmd==='stop'){ put(0,0,'stop'); continue; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; } put(s.dx,s.dy,'stitch'); }
    bytes.push(0x80,0x00);
    return new Uint8Array(bytes);
  }
  function encViaAI(fmt, cb){
    if(!STATE.ai || !STATE.ai.endpoint || !STATE.ai.key){ cb(new Error('Set ?aiEndpoint=...&aiKey=... or localStorage "loomabelle:cfg".')); return; }
    fetch(STATE.ai.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits()})})
      .then(function(res){ if(!res.ok) throw new Error('AI conversion failed'); return res.arrayBuffer(); })
      .then(function(buf){ cb(null, new Uint8Array(buf)); })
      .catch(function(err){ cb(err); });
  }
  function download(name, bytes){
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes])); a.download=name; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
  }
  $$('.col.card.rose .formats .btn').forEach(function(btn){
    var fmt=btn.textContent.replace(/\s+/g,'').toUpperCase();
    if(['DST','EXP','PES','JEF'].indexOf(fmt)===-1) return;
    on(btn,'click',function(){
      try{
        if(fmt==='DST'){ download('loomabelle.dst', encDST()); return; }
        if(fmt==='EXP'){ download('loomabelle.exp', encEXP()); return; }
        encViaAI(fmt, function(err, bytes){ if(err) return alert(fmt+': '+err.message); download('loomabelle.'+fmt.toLowerCase(), bytes); });
      }catch(e){ alert(fmt+': '+e.message); }
    });
  });

  // ---------- init ----------
  function init(){
    wireTabs();
    STATE.history=[draw.toDataURL('image/png')];
    render();
  }
  init();
})();
