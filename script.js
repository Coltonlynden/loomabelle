/* Loomabelle — compatibility build v3 (ES5, no modules)
   Focused fixes:
   - Upload photo works reliably (mobile/desktop). 
   - Proper responsive scaling with devicePixelRatio and ResizeObserver fallback.
   - "mockup only" helper text is hidden automatically (no HTML edits).
   - Preview uses marching-squares contour tracing instead of random edge scan.
   - Draw tab stitches use same contour engine (trace alpha).
   - Exports: DST/EXP offline; PES/JEF via optional AI (unchanged UI).
*/
(function(){
  // --------- Utilities (ES5) ----------
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function clamp(v,mi,ma){return Math.max(mi,Math.min(ma,v));}
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function dpr(){ return (window.devicePixelRatio||1); }

  // Hide "mockup only" notes without changing HTML
  $$('.text-muted, .muted, .note, small, .badge').forEach(function(el){
    if((el.textContent||'').toLowerCase().indexOf('mockup')>-1){ el.style.display='none'; }
  });

  // Tabs + smooth scroll
  $$('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      $$('.tab-btn').forEach(function(b){ b.classList.toggle('active', b===btn); });
      $$('.panel').forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel')===btn.getAttribute('data-tab')); });
    });
  });
  $$('[data-scroll]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var el=$(btn.getAttribute('data-scroll')); if(el) el.scrollIntoView({behavior:'smooth'});
    });
  });
  var y=$('#year'); if(y) y.textContent=(new Date()).getFullYear();

  // Hero confetti (unchanged visuals)
  (function(){
    var colors=['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac'];
    var g=$('#flowers'); if(!g) return;
    for(var i=0;i<7;i++){
      var a=i/7*Math.PI*2, r=80, x=260+Math.cos(a)*r, y=210+Math.sin(a)*r;
      function add(ox,oy,rad,fill){
        var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
        c.setAttribute('cx',x+ox); c.setAttribute('cy',y+oy); c.setAttribute('r',rad); c.setAttribute('fill',fill); g.appendChild(c);
      }
      add(0,0,10,colors[i%colors.length]); add(0,-14,4,'#fde68a'); add(10,8,5,'#a7f3d0');
    }
  })();

  // ---------- State ----------
  var STATE={pxPerMm:2, hoop:{wmm:100,hmm:100}, tool:'pen', guides:false, active:'#fb7185', history:[], ai:{}, stitches:[], lastImage:null, opts:{autotrace:true, reduce:true, cleanup:true, suggest:true}};

  // Config via URL/localStorage
  (function cfg(){
    try{ var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; } }catch(e){}
    var p=(function(){ var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(q){var kv=q.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out; })();
    if(p.hoop){ var sp=p.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h){ STATE.hoop={wmm:w,hmm:h}; } }
    if(p.aiEndpoint){ STATE.ai.endpoint=p.aiEndpoint; } if(p.aiKey){ STATE.ai.key=p.aiKey; }
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  // ---------- Canvas setup (responsive) ----------
  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Missing .preview or .canvas container'); return; }

  var prev=document.createElement('canvas'), pctx=prev.getContext('2d');
  var draw=document.createElement('canvas'), dctx=draw.getContext('2d'); dctx.lineCap='round'; dctx.lineJoin='round';
  prevHost.innerHTML=''; prevHost.appendChild(prev); drawHost.innerHTML=''; drawHost.appendChild(draw);

  function sizeCanvasToHost(canvas, host){
    // Fit to host's CSS size while honoring devicePixelRatio
    var cw=host.clientWidth||640, ch=Math.max(200, Math.floor(cw*9/16));
    var scale=dpr();
    canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
    canvas.width = Math.round(cw*scale);
    canvas.height= Math.round(ch*scale);
    var ctx=canvas.getContext('2d'); ctx.setTransform(scale,0,0,scale,0,0);
  }
  function updatePxPerMm(){
    // based on current preview canvas size
    var m=10;
    var sx=((prev.width/dpr())-m*2)/STATE.hoop.wmm;
    var sy=((prev.height/dpr())-m*2)/STATE.hoop.hmm;
    STATE.pxPerMm=Math.min(sx,sy);
  }
  function resizeAll(){ sizeCanvasToHost(prev, prevHost); sizeCanvasToHost(draw, drawHost); updatePxPerMm(); render(); }
  // ResizeObserver fallback
  var ro;
  try{
    ro=new ResizeObserver(function(){ resizeAll(); });
    ro.observe(prevHost); ro.observe(drawHost);
  }catch(e){
    window.addEventListener('resize', resizeAll);
  }
  resizeAll();

  // Thread palette layout (inline flex, no CSS edits)
  var sw=document.querySelector('.swatches');
  if(sw){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    if(sw.children.length===0){
      ['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'].forEach(function(c){
        var d=document.createElement('div');
        d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer';
        d.title=c; d.addEventListener('click',function(){STATE.active=c;});
        sw.appendChild(d);
      });
    }
  }

  // ---------- Upload + options ----------
  var fin=document.querySelector('.upload-zone input[type="file"]');
  if(fin){
    fin.removeAttribute('disabled');
    var zone=fin.closest('.upload-zone');
    if(zone){
      zone.addEventListener('dragover', function(e){ e.preventDefault(); });
      zone.addEventListener('drop', function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
      zone.addEventListener('click', function(){ fin.click(); });
    }
    fin.addEventListener('change', function(){ var f=fin.files[0]; if(f) loadImage(f); });
  }
  function refreshOptions(){
    var z=document.querySelector('.upload-zone'); if(!z) return;
    var cb=$$('input[type="checkbox"]', z);
    cb.forEach(function(c){
      c.disabled=false;
      c.addEventListener('change', function(){
        STATE.opts = readOpts(); if(STATE.lastImage) processImage(STATE.lastImage);
      });
    });
    STATE.opts=readOpts();
  }
  function readOpts(){
    var z=document.querySelector('.upload-zone'); if(!z) return {autotrace:true, reduce:true, cleanup:true, suggest:true};
    var r={autotrace:true, reduce:true, cleanup:true, suggest:true};
    $$('input[type="checkbox"]', z).forEach(function(c){
      var label=(c.parentNode && c.parentNode.textContent || '').toLowerCase();
      if(label.indexOf('auto-trace')>-1) r.autotrace=c.checked;
      if(label.indexOf('reduce')>-1) r.reduce=c.checked;
      if(label.indexOf('edge')>-1) r.cleanup=c.checked;
      if(label.indexOf('satin')>-1 || label.indexOf('fill &')>-1) r.suggest=c.checked;
    });
    return r;
  }
  refreshOptions();

  function loadImage(file){
    var img=new Image();
    img.onload=function(){ STATE.lastImage=img; processImage(img); };
    img.onerror=function(){ alert('Could not load image'); };
    img.crossOrigin='anonymous';
    img.src=URL.createObjectURL(file);
  }

  // -------- Processing: cleanup -> quantize -> contours -> stitches --------
  function processImage(img){
    var max=1600, s=Math.min(1, max/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0;
    var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
    var id=x.getImageData(0,0,w,h), d=id.data;

    if(STATE.opts.cleanup){
      // small blur to remove salt&pepper
      var out=new Uint8ClampedArray(d.length), rad=1;
      for(var yy=0; yy<h; yy++){
        for(var xx=0; xx<w; xx++){
          var R=0,G=0,B=0,A=0,C=0;
          for(var dy=-rad; dy<=rad; dy++){
            for(var dx=-rad; dx<=rad; dx++){
              var px=Math.max(0,Math.min(w-1, xx+dx)), py=Math.max(0,Math.min(h-1, yy+dy));
              var ii=(py*w+px)*4; R+=d[ii]; G+=d[ii+1]; B+=d[ii+2]; A+=d[ii+3]; C++;
            }
          }
          var o=(yy*w+xx)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C;
        }
      }
      id.data.set(out); x.putImageData(id,0,0);
    }

    var mask=new Uint8Array(w*h);
    if(STATE.opts.reduce){
      // K-means to 6 colors then choose darkest cluster as foreground
      var labels=kmeansLabels(x,6);
      // choose cluster with lowest brightness as "ink"
      var sums=[], cnt=[], cix;
      for(cix=0;cix<6;cix++){ sums.push(0); cnt.push(0); }
      var d2=x.getImageData(0,0,w,h).data;
      for(var i=0;i<w*h;i++){
        var cix2=labels[i]; var p=i*4; var lum=0.2126*d2[p]+0.7152*d2[p+1]+0.0722*d2[p+2];
        sums[cix2]+=lum; cnt[cix2]++;
      }
      var darkest=0, best=1e9;
      for(cix=0;cix<6;cix++){ if(cnt[cix]){ var m=sums[cix]/cnt[cix]; if(m<best){best=m; darkest=cix;} } }
      for(i=0;i<w*h;i++){ mask[i]=(labels[i]===darkest)?1:0; }
    }else{
      // simple grayscale threshold
      for(i=0;i<w*h;i++){ var p2=i*4; var g=(d[p2]*0.3+d[p2+1]*0.59+d[p2+2]*0.11)|0; mask[i]=(g<128)?1:0; }
    }

    // Extract contours with marching squares
    var paths = marchingSquares(mask, w, h);
    STATE.stitches = pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
    render();
  }

  // ---- K-means labels only (fast) ----
  function kmeansLabels(ctx,k){
    var w=ctx.canvas.width, h=ctx.canvas.height;
    var id=ctx.getImageData(0,0,w,h), d=id.data;
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
      for(i2=0;i2<w*h;i2++){ var cix3=labels[i2], p3=i2*4; sums[cix3][0]+=d[p3]; sums[cix3][1]+=d[p3+1]; sums[cix3][2]+=d[p3+2]; counts[cix3]++; }
      for(cix=0;cix<k;cix++){ if(counts[cix]) centers[cix]=[sums[cix][0]/counts[cix], sums[cix][1]/counts[cix], sums[cix][2]/counts[cix]]; }
    }
    return labels;
  }

  // ---- Marching Squares (binary mask -> array of paths) ----
  function marchingSquares(mask, w, h){
    var paths=[], visited=new Uint8Array(w*h);
    function idx(x,y){ return y*w+x; }
    function trace(sx,sy){
      var x=sx, y=sy, dir=0; // 0:right 1:down 2:left 3:up
      var path=[]; var iter=0;
      do{
        if(iter++>w*h*8) break;
        // Square code from four corners:
        var a = mask[idx(x  ,y  )] ? 1:0;
        var b = mask[idx(x+1,y  )] ? 1:0;
        var c = mask[idx(x+1,y+1)] ? 1:0;
        var d = mask[idx(x  ,y+1)] ? 1:0;
        var code = a*1 + b*2 + c*4 + d*8;
        if(code===0 || code===15){ // move forward
          if(dir===0) x++; else if(dir===1) y++; else if(dir===2) x--; else y--;
        }else{
          // turn based on code
          if(code===1||code===5||code===13){ path.push([x,y+0.5]); dir=3; x--; }
          else if(code===8||code===10||code===11){ path.push([x+0.5,y+1]); dir=0; y++; }
          else if(code===4||code===12||code===14){ path.push([x+1,y+0.5]); dir=1; x++; }
          else if(code===2||code===3||code===7){ path.push([x+0.5,y]); dir=2; y--; }
        }
      }while(x!==sx || y!==sy);
      return path;
    }
    for(var y=0;y<h-1;y++){
      for(var x=0;x<w-1;x++){
        var i=idx(x,y);
        if(visited[i]) continue;
        var code = (mask[i]?1:0) + (mask[i+1]?2:0) + (mask[i+w+1]?4:0) + (mask[i+w]?8:0);
        if(code!==0 && code!==15){
          var path=trace(x,y);
          for(var k=0;k<path.length;k++){ var px=Math.min(w-1,Math.max(0, Math.floor(path[k][0]))), py=Math.min(h-1,Math.max(0, Math.floor(path[k][1]))); visited[py*w+px]=1; }
          if(path.length>4) paths.push(path);
        }
      }
    }
    return paths;
  }

  // ---- Convert paths -> stitches within preview area ----
  function pathsToStitches(paths, outWcss, outHcss){
    var stitches=[];
    if(!paths || !paths.length) return stitches;
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9, i,j,p;
    for(i=0;i<paths.length;i++){ for(j=0;j<paths[i].length;j++){ p=paths[i][j]; if(p[0]<minx)minx=p[0]; if(p[1]<miny)miny=p[1]; if(p[0]>maxx)maxx=p[0]; if(p[1]>maxy)maxy=p[1]; } }
    var w=maxx-minx, h=maxy-miny, margin=20;
    var sx=(outWcss-2*margin)/w, sy=(outHcss-2*margin)/h, s=Math.min(sx,sy);
    var ox=(outWcss - w*s)/2 - minx*s, oy=(outHcss - h*s)/2 - miny*s;
    for(i=0;i<paths.length;i++){
      var path=paths[i]; if(!path.length) continue;
      stitches.push({cmd:'jump', x:path[0][0]*s+ox, y:path[0][1]*s+oy});
      for(j=1;j<path.length;j++){ stitches.push({cmd:'stitch', x:path[j][0]*s+ox, y:path[j][1]*s+oy}); }
    }
    return stitches;
  }

  // ---------- Draw tools ----------
  var toolBtns=$$('.panel[data-panel="draw"] .toolbar .btn');
  var map=['pen','eraser','fill','fabric','guides','undo'];
  toolBtns.forEach(function(b,i){
    var tool=map[i]||'pen'; b.dataset.tool=tool; b.removeAttribute('disabled');
    b.addEventListener('click', function(){
      if(tool==='undo'){ undo(); return; }
      if(tool==='guides'){ STATE.guides=!STATE.guides; render(); return; }
      if(tool==='fabric'){ draw.style.background = prompt('Fabric color (hex):','#ffffff')||'#ffffff'; render(); return; }
      STATE.tool=tool;
    });
  });

  var drawing=false;
  draw.addEventListener('pointerdown', function(e){
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='fill'){ floodFill(dctx, x|0, y|0, STATE.active); snapshot(); return; }
    drawing=true; dctx.strokeStyle=STATE.active; dctx.lineWidth=3; dctx.beginPath(); dctx.moveTo(x,y);
  });
  draw.addEventListener('pointermove', function(e){
    if(!drawing) return;
    var r=draw.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(STATE.tool==='pen'){ dctx.lineTo(x,y); dctx.stroke(); }
    else if(STATE.tool==='eraser'){ dctx.clearRect(x-6,y-6,12,12); }
  });
  draw.addEventListener('pointerup', function(){ if(drawing){ drawing=false; snapshot(); } });

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

  function snapshot(){
    STATE.history.push(draw.toDataURL()); if(STATE.history.length>40) STATE.history.shift();
    // convert drawing alpha to mask -> contours -> stitches
    var w=draw.width, h=draw.height, x=draw.getContext('2d'), id=x.getImageData(0,0,w,h), d=id.data;
    var mask=new Uint8Array(w*h);
    for(var i=0;i<w*h;i++){ mask[i]=d[i*4+3]>0?1:0; }
    var paths=marchingSquares(mask, w, h);
    STATE.stitches = pathsToStitches(paths, prev.width/dpr(), prev.height/dpr());
    render();
  }
  function undo(){
    if(STATE.history.length<2) return;
    STATE.history.pop();
    var img=new Image();
    img.onload=function(){ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); render(); };
    img.src=STATE.history[STATE.history.length-1];
  }

  // ---------- Preview render + guides ----------
  function render(){
    var ctx=pctx, W=prev.width/dpr(), H=prev.height/dpr();
    ctx.setTransform(dpr(),0,0,dpr(),0,0);
    ctx.clearRect(0,0,W,H);
    try{ ctx.fillStyle=getComputedStyle(draw).background || '#ffffff'; }catch(e){ ctx.fillStyle='#ffffff'; }
    ctx.fillRect(0,0,W,H);
    if(STATE.guides){
      ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#94a3b8';
      for(var gy=10; gy<H; gy+=20){ for(var gx=10; gx<W; gx+=20){ ctx.fillRect(gx,gy,1,1); } }
      ctx.restore();
    }
    ctx.strokeStyle='#111827'; ctx.lineWidth=1; ctx.beginPath();
    for(var i=0;i<STATE.stitches.length;i++){
      var s=STATE.stitches[i];
      if(s.cmd==='stitch') ctx.lineTo(s.x, s.y);
      else if(s.cmd==='jump') ctx.moveTo(s.x, s.y);
    }
    ctx.stroke();
    if(STATE.guides){
      var hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm;
      ctx.save(); ctx.strokeStyle='rgba(0,0,0,.22)'; ctx.setLineDash([6,6]);
      ctx.strokeRect((W-hoopW)/2,(H-hoopH)/2, hoopW, hoopH); ctx.restore();
    }
  }

  // ---------- Exporters ----------
  function toUnits(){
    var W=prev.width/dpr(), H=prev.height/dpr();
    var s=1/STATE.pxPerMm*10, cx=W/2, cy=H/2;
    var prevPt=null, out=[];
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
  function encDST(){
    var u=toUnits(), bytes=[];
    function enc(dx,dy,flag){ if(flag==null) flag=0;
      dx=clamp(Math.round(dx),-121,121); dy=clamp(Math.round(dy),-121,121);
      var b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
      var b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2);
      var b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3);
    }
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
      if(cmd==='end') bytes.push(0x80,0x00);
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
  function encViaAI(fmt, cb){
    if(!STATE.ai || !STATE.ai.endpoint || !STATE.ai.key){ cb(new Error('Set ?aiEndpoint=...&aiKey=... or localStorage "loomabelle:cfg".')); return; }
    fetch(STATE.ai.endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},
      body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits()})
    }).then(function(res){ if(!res.ok) throw new Error('AI conversion failed'); return res.arrayBuffer(); })
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
    btn.addEventListener('click', function(){
      try{
        if(fmt==='DST'){ download('loomabelle.dst', encDST()); return; }
        if(fmt==='EXP'){ download('loomabelle.exp', encEXP()); return; }
        encViaAI(fmt, function(err, bytes){ if(err) return alert(fmt+': '+err.message); download('loomabelle.'+fmt.toLowerCase(), bytes); });
      }catch(e){ alert(fmt+': '+e.message); }
    });
  });

  // Init
  STATE.history=[draw.toDataURL('image/png')];
  render();
  console.log('Loomabelle v3 initialized.');
})();
