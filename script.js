/* Loomabelle — script.js v10
   Drop-in: no HTML/CSS changes required.
   - Preview hidden until an image is uploaded, then shows instantly
   - Progress bar; non-blocking processing via Web Worker (transferables)
   - Draw tab defaults to Pen; pointer capture stops page scrolling; long strokes OK
   - Process Drawing switches to Preview to display result
   - Thread palette restored; formats appear only after successful processing
   - Offline exports: DST/EXP; optional AI for PES/JEF (via ?aiEndpoint=&aiKey= or localStorage)
*/
(function(){
  // ===== helpers =====
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function on(el,ev,fn,opts){ el&&el.addEventListener(ev,fn,opts||{passive:false}); }
  function dpr(){ return window.devicePixelRatio||1; }
  function clamp(v,mi,ma){ return Math.max(mi,Math.min(ma,v)); }
  function make(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  // Hide any “mockup” helper notes without touching markup
  $$('.text-muted,.muted,.note,small,.badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1) el.style.display='none';
  });

  // ===== state =====
  var STATE={
    hoop:{wmm:100,hmm:100}, pxPerMm:2,
    active:'#111827', guides:false,
    stitches:[],
    lastImage:null, imgFit:null,
    subject:{enabled:false,rect:null,noSubject:false},
    opts:{reduce:true,cleanup:true},
    processed:false, busy:false,
    canvases:{}, ai:{},
    tool:'pen'
  };

  // ===== config =====
  (function cfg(){
    try{ var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch(e){}
    var q=(function(){var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(s){var kv=s.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out;})();
    if(q.hoop){ var sp=q.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h) STATE.hoop={wmm:w,hmm:h}; }
    if(q.aiEndpoint) STATE.ai.endpoint=q.aiEndpoint; if(q.aiKey) STATE.ai.key=q.aiKey;
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  // ===== tabs =====
  function switchTo(tabName){
    var target=$('.tab-btn[data-tab="'+tabName+'"]'); if(!target) return;
    var tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(function(b){ b.classList.toggle('active', b===target); });
    panels.forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===tabName); });
    requestAnimationFrame(resizeAll);
  }
  (function wireTabs(){
    var tabs=$$('.tab-btn'), panels=$$('.panel');
    tabs.forEach(function(btn){
      on(btn,'click',function(){
        tabs.forEach(function(b){ b.classList.toggle('active', b===btn); });
        panels.forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')); });
        requestAnimationFrame(resizeAll);
      });
    });
    $$('a,button').forEach(function(el){
      var t=(el.textContent||'').toLowerCase();
      if(t.indexOf('start with a photo')>-1 || t.indexOf('upload photo')>-1){
        on(el,'click',function(e){ e.preventDefault(); switchTo('upload'); });
      }
      if(/open.*draw|open.*drawing|draw & trace/.test(t)){
        on(el,'click',function(e){ e.preventDefault(); switchTo('draw'); });
      }
    });
    var y=$('#year'); if(y) y.textContent=(new Date()).getFullYear();
  })();

  // ===== canvases =====
  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Missing .preview or .canvas'); return; }
  if(getComputedStyle(prevHost).position==='static'){ prevHost.style.position='relative'; }

  var prev=document.createElement('canvas'), pctx=prev.getContext('2d');
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d'); dctx.lineCap='round'; dctx.lineJoin='round';

  // Important: preview hidden until image uploaded / processed
  prev.style.visibility='hidden';

  prevHost.innerHTML=''; prevHost.appendChild(prev);
  drawHost.innerHTML=''; drawHost.appendChild(draw);
  STATE.canvases={prev:prev, prevCtx:pctx, draw:draw, drawCtx:dctx};

  // Mobile drawing UX
  draw.style.touchAction='none';

  // Progress bar overlay (Preview)
  var progWrap=make('div'); progWrap.style.cssText='position:absolute;left:12px;top:12px;right:12px;height:8px;background:rgba(0,0,0,.06);border-radius:999px;overflow:hidden;display:none;z-index:4';
  var progBar=make('div'); progBar.style.cssText='height:100%;width:0%;background:#111827;opacity:.7';
  progWrap.appendChild(progBar); prevHost.appendChild(progWrap);
  function setProgress(pct){ progWrap.style.display='block'; progBar.style.width=(pct|0)+'%'; if(pct>=100) setTimeout(function(){ progWrap.style.display='none'; }, 400); }

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
  function resizeAll(){ sizeCanvasToHost(prev,prevHost); sizeCanvasToHost(draw,drawHost); updatePxPerMm(); render(); }
  try{
    new ResizeObserver(resizeAll).observe(prevHost);
    new ResizeObserver(resizeAll).observe(drawHost);
    new MutationObserver(function(){ resizeAll(); }).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
  }catch(e){ window.addEventListener('resize', resizeAll); }
  resizeAll();
  // paint white to avoid transparent flash
  pctx.fillStyle='#fff'; pctx.fillRect(0,0,prev.width/dpr(),prev.height/dpr());

  // ===== thread palette (restore if empty) =====
  var sw=document.querySelector('.swatches');
  if(sw){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    if(sw.children.length===0){
      ['#111827','#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
        .forEach(function(c){
          var d=make('div'); d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer';
          d.title=c; on(d,'click',function(){ STATE.active=c; render(); }); sw.appendChild(d);
        });
    }
  }

  // ===== Upload zone =====
  var uploadZone=$('.upload-zone');
  var fileInput=uploadZone && uploadZone.querySelector('input[type="file"]');
  if(uploadZone){
    if(fileInput){ fileInput.removeAttribute('disabled'); on(fileInput,'change',function(){ var f=fileInput.files[0]; if(f) loadImage(f); }); }
    on(uploadZone,'dragover',function(e){ e.preventDefault(); });
    on(uploadZone,'drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    on(uploadZone,'click',function(e){ if(e.target===uploadZone && fileInput) fileInput.click(); });
  }

  // Toolbar inside Preview
  var tb=make('div'); tb.style.cssText='position:absolute;left:12px;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;z-index:3;visibility:hidden;';
  var btnProcess=make('button','btn','Process Photo');
  var btnHighlight=make('button','btn','Highlight Subject');
  var lblNo=make('label',null,''); var chkNo=make('input'); chkNo.type='checkbox'; lblNo.appendChild(chkNo); lblNo.appendChild(document.createTextNode(' No subject'));
  tb.appendChild(btnProcess); tb.appendChild(btnHighlight); tb.appendChild(lblNo); prevHost.appendChild(tb);

  on(btnHighlight,'click',function(){ STATE.subject.enabled=!STATE.subject.enabled; if(!STATE.subject.enabled) STATE.subject.rect=null; btnHighlight.classList.toggle('active',STATE.subject.enabled); render(); });
  on(chkNo,'change',function(){ STATE.subject.noSubject=chkNo.checked; });

  // Formats hidden until processed
  var formatBtns=$$('.col.card.rose .formats .btn');
  function setFormatsVisible(v){ formatBtns.forEach(function(b){ b.style.display=v?'inline-block':'none'; }); }
  setFormatsVisible(false);

  // ===== Image loading + immediate preview =====
  function loadImage(file){
    var img=new Image();
    img.onload=function(){
      STATE.lastImage=img; STATE.processed=false; setFormatsVisible(false);
      prev.style.visibility='visible'; tb.style.visibility='visible';
      showImageInPreview(img,1);
      switchTo('upload');
    };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous';
    img.src=URL.createObjectURL(file);
  }
  function showImageInPreview(img, alpha){
    var W=prev.width/dpr(), H=prev.height/dpr();
    var iw=img.width, ih=img.height, s=Math.min(W/iw,H/ih), w=iw*s, h=ih*s, ox=(W-w)/2, oy=(H-h)/2;
    STATE.imgFit={ox:ox,oy:oy,scale:s,iw:iw,ih:ih};
    var ctx=pctx; ctx.setTransform(dpr(),0,0,dpr(),0,0);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=alpha||1; ctx.drawImage(img,ox,oy,w,h); ctx.globalAlpha=1;
    render();
  }

  // Subject rectangle on preview
  var dragging=false, start=null;
  on(prev,'pointerdown',function(e){
    if(!STATE.subject.enabled) return;
    var r=prev.getBoundingClientRect(); start=[e.clientX-r.left,e.clientY-r.top]; dragging=true; STATE.subject.rect={x:start[0],y:start[1],w:0,h:0}; render();
  });
  on(prev,'pointermove',function(e){
    if(!dragging || !STATE.subject.enabled) return;
    var r=prev.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    STATE.subject.rect={x:Math.min(start[0],x),y:Math.min(start[1],y),w:Math.abs(x-start[0]),h:Math.abs(y-start[1])}; render();
  });
  on(window,'pointerup',function(){ dragging=false; });

  // ===== Draw tools =====
  (function wireDraw(){
    var toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
    var map=['pen','eraser','fill','fabric','guides','undo'];
    STATE.tool='pen'; // default tool
    toolBtns.forEach(function(b,i){
      var tool=map[i]||'pen'; b.dataset.tool=tool; b.removeAttribute('disabled');
      on(b,'click',function(){
        if(tool==='undo'){ undo(); return; }
        if(tool==='guides'){ STATE.guides=!STATE.guides; render(); return; }
        if(tool==='fabric'){ draw.style.background=prompt('Fabric color (hex):','#ffffff')||'#ffffff'; render(); return; }
        STATE.tool=tool;
      });
    });
    // Add Process Drawing; it will switch to Preview to show result
    var row=(toolBtns[0]&&toolBtns[0].parentNode)||drawHost.parentNode;
    var proc=make('button','btn','Process Drawing'); proc.style.marginLeft='10px'; row&&row.appendChild(proc);
    on(proc,'click',function(){ processDrawing(); switchTo('upload'); });
  })();

  // Drawing — pointer capture for long strokes + prevent scroll
  var drawingStroke=false, activeId=null;
  on(draw,'pointerdown',function(e){
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    draw.setPointerCapture(e.pointerId); activeId=e.pointerId; e.preventDefault();
    if(STATE.tool==='fill'){ floodFill(dctx,x|0,y|0,STATE.active); return; }
    dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y); drawingStroke=true;
  });
  on(draw,'pointermove',function(e){
    if(!drawingStroke || e.pointerId!==activeId) return;
    e.preventDefault();
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='pen'){ dctx.lineTo(x,y); dctx.stroke(); }
    else if(STATE.tool==='eraser'){ dctx.clearRect(x-6,y-6,12,12); }
  });
  on(draw,'pointerup',function(e){
    if(e.pointerId===activeId){ drawingStroke=false; activeId=null; draw.releasePointerCapture(e.pointerId); }
  });
  on(draw,'pointercancel',function(e){
    if(e.pointerId===activeId){ drawingStroke=false; activeId=null; try{draw.releasePointerCapture(e.pointerId);}catch(_){ } }
  });
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
  function undo(){ dctx.clearRect(0,0,draw.width,draw.height); }

  // ===== Render preview (image drawn by showImageInPreview) =====
  function render(){
    var W=prev.width/dpr(), H=prev.height/dpr(), ctx=pctx;
    ctx.setTransform(dpr(),0,0,dpr(),0,0);
    if(STATE.guides){
      ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#94a3b8';
      for(var gy=10; gy<H; gy+=20){ for(var gx=10; gx<W; gx+=20){ ctx.fillRect(gx,gy,1,1); } }
      ctx.restore();
    }
    // stitches
    ctx.save();
    ctx.strokeStyle=STATE.active||'#111827'; ctx.lineWidth=1.6; ctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){ var s=STATE.stitches[i]; if(s.cmd==='jump') ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); }
    ctx.stroke(); ctx.restore();
    // subject overlay
    if(STATE.subject.enabled && STATE.subject.rect){
      var r=STATE.subject.rect; ctx.save(); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.setLineDash([6,6]); ctx.lineWidth=1; ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
    }
  }

  // ===== Worker (transferables + small working size) =====
  var workerURL=(function(){
    var code = [
      'self.onmessage=function(e){',
      ' try{ var d=e.data; var step=function(p){ self.postMessage({type:"progress",p:p}); };',
      ' if(d.kind==="photo"){ step(5); var res=processPhoto(d); step(100); self.postMessage({type:"done",paths:res}); }',
      ' else if(d.kind==="drawing"){ step(10); var res2=processDrawing(d); step(100); self.postMessage({type:"done",paths:res2}); }',
      ' }catch(err){ self.postMessage({type:"error",message:String(err&&err.message||err)}); }',
      '};',
      // utils
      'function otsu(g){ var w=g.w,h=g.h,d=g.data,hist=new Uint32Array(256),i; for(i=0;i<w*h;i++) hist[d[i]]++; var sum=0,total=w*h; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,maxV=0,thr=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; var wF=total-wB; if(!wF) break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF; var v=wB*wF*(mB-mF)*(mB-mF); if(v>maxV){maxV=v;thr=i;} } return thr; }',
      'function toGray(img){ var w=img.w,h=img.h,d=new Uint8ClampedArray(img.data), g=new Uint8Array(w*h); for(var i=0;i<w*h;i++){ var p=i*4; g[i]=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])|0; } return {w:w,h:h,data:g}; }',
      'function blur1(img){ var w=img.w,h=img.h,d=img.data, out=new Uint8ClampedArray(d.length), r=1; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var R=0,G=0,B=0,A=0,C=0; for(var dy=-r;dy<=r;dy++){ for(var dx=-r;dx<=r;dx++){ var px=Math.max(0,Math.min(w-1,x+dx)), py=Math.max(0,Math.min(h-1,y+dy)), ii=(py*w+px)*4; R+=d[ii]; G+=d[ii+1]; B+=d[ii+2]; A+=d[ii+3]; C++; }} var o=(y*w+x)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C; }} img.data.set(out); }',
      'function kmeansLabels(img,k){ var w=img.w,h=img.h,d=img.data, centers=[], labels=new Uint8Array(w*h), i2,c; for(var i=0;i<k;i++){ var p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]);} for(var it=0;it<3;it++){ for(i2=0;i2<w*h;i2++){ var r=d[i2*4],g=d[i2*4+1],b=d[i2*4+2],best=0,bd=1e20; for(c=0;c<k;c++){ var cc=centers[c],dr=r-cc[0],dg=g-cc[1],db=b-cc[2],dist=dr*dr+dg*dg+db*db; if(dist<bd){bd=dist;best=c;} } labels[i2]=best; } var sums=[],counts=[]; for(c=0;c<k;c++){ sums.push([0,0,0]); counts.push(0);} for(i2=0;i2<w*h;i2++){ var ci=labels[i2],p2=i2*4; sums[ci][0]+=d[p2]; sums[ci][1]+=d[p2+1]; sums[ci][2]+=d[p2+2]; counts[ci]++; } for(c=0;c<k;c++){ if(counts[c]) centers[c]=[sums[c][0]/counts[c],sums[c][1]/counts[c],sums[c][2]/counts[c]]; } } return labels; }',
      'function darkestMask(img,labels,k){ var w=img.w,h=img.h,d=img.data,sums=new Float64Array(k),cnt=new Uint32Array(k); for(var i=0;i<w*h;i++){ var c=labels[i]; var lum=0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2]; sums[c]+=lum; cnt[c]++; } var darkest=0,best=1e9; for(var j=0;j<k;j++){ if(cnt[j]){ var m=sums[j]/cnt[j]; if(m<best){best=m;darkest=j;} } } var out=new Uint8Array(w*h); for(i=0;i<w*h;i++) out[i]=(labels[i]===darkest)?1:0; return {w:w,h:h,data:out}; }',
      'function cropMask(msk,rect){ var w=msk.w,h=msk.h,d=msk.data; var sx=rect.sx,sy=rect.sy,ex=rect.ex,ey=rect.ey; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ if(!(x>=sx&&x<=ex&&y>=sy&&y<=ey)) d[y*w+x]=0; } } }',
      'function marchingSquares(msk){ var w=msk.w,h=msk.h,d=msk.data, paths=[], visited=new Uint8Array(w*h); function idx(x,y){return y*w+x;} function trace(sx,sy){ var x=sx,y=sy,dir=0, path=[], iter=0,maxItr=w*h*8; while(iter++<maxItr){ var a=d[idx(x,y)]?1:0,b=d[idx(x+1,y)]?1:0,c=d[idx(x+1,y+1)]?1:0,dd=d[idx(x,y+1)]?1:0; var code=a+b*2+c*4+dd*8; if(code===0||code===15){ if(dir===0)x++; else if(dir===1)y++; else if(dir===2)x--; else y--; } else { if(code===1||code===5||code===13){ path.push([x,y+0.5]); dir=3; x--; } else if(code===8||code===10||code===11){ path.push([x+0.5,y+1]); dir=0; y++; } else if(code===4||code===12||code===14){ path.push([x+1,y+0.5]); dir=1; x++; } else if(code===2||code===3||code===7){ path.push([x+0.5,y]); dir=2; y--; } if(x<0||y<0||x>=w-1||y>=h-1) break; if(x===sx&&y===sy&&path.length>20) break; } } return path; } for(var y=0;y<h-1;y++){ for(var x=0;x<w-1;x++){ var i=idx(x,y); if(visited[i]) continue; var code=(d[i]?1:0)+(d[i+1]?2:0)+(d[i+w+1]?4:0)+(d[i+w]?8:0); if(code!==0&&code!==15){ var p=trace(x,y); for(var k=0;k<p.length;k++){ var px=Math.min(w-1,Math.max(0,p[k][0]>>0)), py=Math.min(h-1,Math.max(0,p[k][1]>>0)); visited[idx(px,py)]=1; } if(p.length>10) paths.push(p); } } } return paths; }',
      'function processPhoto(d){ var w=d.image.w,h=d.image.h, rgba=new Uint8ClampedArray(d.image.data); var gray=toGray({w:w,h:h,data:rgba}); var thr=otsu(gray); var mask=new Uint8Array(w*h); for(var i=0;i<w*h;i++) mask[i]=(gray.data[i]>thr)?0:1; var m={w:w,h:h,data:mask}; if(d.subject && !d.subject.no){ cropMask(m,d.subject); } var p1=marchingSquares(m); if((d.reduce||d.cleanup)){ var img2={w:w,h:h,data:rgba.slice(0)}; if(d.cleanup){ blur1(img2); } var labels=kmeansLabels(img2,6); var m2=darkestMask(img2,labels,6); if(d.subject && !d.subject.no){ cropMask(m2,d.subject); } var p2=marchingSquares(m2); if(p2 && p2.length) p1=p2; } return p1; }',
      'function processDrawing(d){ var w=d.w,h=d.h, a=new Uint8Array(d.alpha); var mask=new Uint8Array(w*h); for(var i=0;i<w*h;i++) mask[i]= a[i]>0?1:0; return marchingSquares({w:w,h:h,data:mask}); }'
    ].join('\n');
    var blob=new Blob([code],{type:'application/javascript'});
    return URL.createObjectURL(blob);
  })();
  var worker=new Worker(workerURL);
  on(worker,'message',function(e){
    var msg=e.data;
    if(msg.type==='progress'){ setProgress(msg.p); }
    else if(msg.type==='done'){
      setProgress(100);
      var paths=msg.paths||[];
      STATE.stitches = pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
      STATE.busy=false; STATE.processed=true; setFormatsVisible(true);
      render();
    }else if(msg.type==='error'){
      STATE.busy=false; setProgress(0); progWrap.style.display='none'; alert('Processing failed: '+msg.message);
    }
  });

  // ===== Process buttons =====
  on(btnProcess,'click',function(){
    if(!STATE.lastImage){
      var fi=$('.upload-zone input[type="file"]');
      if(fi && fi.files && fi.files[0]) return loadImage(fi.files[0]);
    }
    if(!STATE.lastImage) return alert('Choose a photo first.');
    processPhoto();
  });

  function processPhoto(){
    if(STATE.busy) return; STATE.busy=true; STATE.processed=false; setFormatsVisible(false); setProgress(1);
    // Smaller working size for speed (especially phones)
    var max=768, img=STATE.lastImage;
    var s=Math.min(1, max/Math.max(img.width,img.height));
    var w=(img.width*s)|0, h=(img.height*s)|0;
    var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
    var id=x.getImageData(0,0,w,h);
    // Subject mapping from preview coords -> image coords
    var subj=null;
    if(STATE.subject.rect && !STATE.subject.noSubject && STATE.imgFit){
      var f=STATE.imgFit;
      var sx=Math.max(0, Math.floor((STATE.subject.rect.x - f.ox)/f.scale));
      var sy=Math.max(0, Math.floor((STATE.subject.rect.y - f.oy)/f.scale));
      var ex=Math.min(w-1, Math.floor((STATE.subject.rect.x+STATE.subject.rect.w - f.ox)/f.scale));
      var ey=Math.min(h-1, Math.floor((STATE.subject.rect.y+STATE.subject.rect.h - f.oy)/f.scale));
      subj={sx:sx,sy:sy,ex:ex,ey:ey,no:false};
    }else if(STATE.subject.noSubject){ subj={sx:0,sy:0,ex:w-1,ey:h-1,no:true}; }
    // Transfer to worker
    worker.postMessage({ kind:'photo', image:{w:w,h:h,data:id.data.buffer}, reduce:STATE.opts.reduce, cleanup:STATE.opts.cleanup, subject:subj }, [id.data.buffer]);
  }

  function processDrawing(){
    if(STATE.busy) return; STATE.busy=true; STATE.processed=false; setFormatsVisible(false); setProgress(1);
    var w=draw.width, h=draw.height, id=dctx.getImageData(0,0,w,h);
    var max=768, s=Math.min(1, max/Math.max(w,h)), sw=(w*s)|0, sh=(h*s)|0;
    var tmp=document.createElement('canvas'); tmp.width=sw; tmp.height=sh; var t=tmp.getContext('2d'); t.drawImage(draw,0,0,sw,sh);
    var id2=t.getImageData(0,0,sw,sh);
    var alpha=new Uint8Array(sw*sh); for(var i=0;i<sw*sh;i++) alpha[i]=id2.data[i*4+3];
    worker.postMessage({ kind:'drawing', w:sw, h:sh, alpha:alpha.buffer }, [alpha.buffer]);
  }

  // ===== paths -> stitches =====
  function pathsToStitches(paths,outW,outH){
    var stitches=[]; if(!paths||!paths.length) return stitches;
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,i,j,p;
    for(i=0;i<paths.length;i++){ for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; } }
    var w=maxx-minx, h=maxy-miny; if(w<=0||h<=0) return stitches;
    var margin=20, sx=(outW-2*margin)/w, sy=(outH-2*margin)/h, s=Math.min(sx,sy);
    var ox=(outW-w*s)/2 - minx*s, oy=(outH-h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){ var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump',x:path[0][0]*s+ox,y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++) stitches.push({cmd:'stitch',x:path[j][0]*s+ox,y:path[j][1]*s+oy});
    }
    return stitches;
  }

  // ===== exports =====
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
    for(var i=0;i<u.length;i++){
      var s=u[i];
      if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; }
      if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; }
      enc(s.dx,s.dy,0);
    }
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
      if(cmd==='end')  bytes.push(0x80,0x00);
      if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); }
    }
    for(var i=0;i<u.length;i++){
      var s=u[i];
      if(s.cmd==='stop'){ put(0,0,'stop'); continue; }
      if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; }
      put(s.dx,s.dy,'stitch');
    }
    bytes.push(0x80,0x00);
    return new Uint8Array(bytes);
  }
  function encViaAI(fmt,cb){
    if(!STATE.ai||!STATE.ai.endpoint||!STATE.ai.key) return cb(new Error('Set ?aiEndpoint=...&aiKey=... or localStorage "loomabelle:cfg".'));
    fetch(STATE.ai.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits()})})
      .then(function(r){ if(!r.ok) throw new Error('AI conversion failed'); return r.arrayBuffer(); })
      .then(function(buf){ cb(null,new Uint8Array(buf)); })
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
        if(fmt==='DST') return download('loomabelle.dst', encDST());
        if(fmt==='EXP') return download('loomabelle.exp', encEXP());
        encViaAI(fmt,function(err,bytes){ if(err) return alert(fmt+': '+err.message); download('loomabelle.'+fmt.toLowerCase(), bytes); });
      }catch(e){ alert(fmt+': '+e.message); }
    });
  });

  // ===== sizing/bootstrap =====
  function init(){
    // nothing extra; defaults already set
  }
  init();
})();
