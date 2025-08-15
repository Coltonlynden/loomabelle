/* Loomabelle — compatibility build v2 (no modules; runs on iPhone + file://)
   Fixes:
   - Upload works and shows stitched preview
   - Checkboxes in the Upload card are wired (Auto‑trace, Reduce palette, Edge cleanup, Fill/Satin suggestions)
   - Draw tab tools work; 'Stitch guides' shows hoop box + dot grid; does NOT change export
   - Thread palette spans full width (inline flex), no CSS file edits
   - Exports: DST/EXP offline; PES/JEF via optional AI
*/
(function(){
  function $(s,el){return (el||document).querySelector(s);}
  function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
  function clamp(v,mi,ma){return Math.max(mi,Math.min(ma,v));}
  function hexToRgb(hex){ hex=String(hex||'').replace('#',''); if(hex.length===3){hex=hex.split('').map(function(c){return c+c;}).join('');} var n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }

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

  // Hero confetti (unchanged)
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

  // State
  var STATE={pxPerMm:2, hoop:{wmm:100,hmm:100}, stitches:[], tool:'pen', guides:false, active:'#fb7185', history:[], ai:{}, canvases:{}};

  // Config via URL/localStorage
  (function cfg(){
    try{
      var saved=localStorage.getItem('loomabelle:cfg'); if(saved){ var o=JSON.parse(saved); if(o.hoop) STATE.hoop=o.hoop; if(o.ai) STATE.ai=o.ai; }
    }catch(e){}
    var p=(function(){ var out={}; if(location.search.length>1){ location.search.substring(1).split('&').forEach(function(q){var kv=q.split('='); out[decodeURIComponent(kv[0]||'')]=decodeURIComponent(kv[1]||'');}); } return out; })();
    if(p.hoop){ var sp=p.hoop.split('x'); var w=parseFloat(sp[0]), h=parseFloat(sp[1]); if(w&&h){ STATE.hoop={wmm:w,hmm:h}; } }
    if(p.aiEndpoint){ STATE.ai.endpoint=p.aiEndpoint; }
    if(p.aiKey){ STATE.ai.key=p.aiKey; }
    try{ localStorage.setItem('loomabelle:cfg', JSON.stringify({hoop:STATE.hoop, ai:STATE.ai})); }catch(e){}
  })();

  // Canvases inside existing containers
  var prevHost=document.querySelector('.col.card.rose .preview') || document.querySelector('.preview');
  var drawHost=document.querySelector('.panel[data-panel="draw"] .canvas') || document.querySelector('.canvas');
  if(!prevHost || !drawHost){ console.error('Missing .preview or .canvas container'); return; }
  var prev=document.createElement('canvas'); prev.width=640; prev.height=360; prevHost.innerHTML=''; prevHost.appendChild(prev); var pctx=prev.getContext('2d');
  var draw=document.createElement('canvas'); draw.width=640; draw.height=360; drawHost.innerHTML=''; drawHost.appendChild(draw); var dctx=draw.getContext('2d'); dctx.lineCap='round'; dctx.lineJoin='round';
  STATE.canvases={prev:prev, prevCtx:pctx, draw:draw, drawCtx:dctx};

  function updatePxPerMm(){ var m=10; var sx=(prev.width-m*2)/STATE.hoop.wmm, sy=(prev.height-m*2)/STATE.hoop.hmm; STATE.pxPerMm=Math.min(sx,sy); }
  updatePxPerMm();

  // Thread palette layout (inline style only; no CSS edits)
  var sw=document.querySelector('.swatches');
  if(sw){
    sw.style.display='flex'; sw.style.flexWrap='wrap'; sw.style.gap='12px'; sw.style.alignItems='center';
    var colors=['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac'];
    if(sw.children.length===0){
      colors.forEach(function(c){
        var d=document.createElement('div');
        d.style.cssText='height:40px;width:40px;border-radius:999px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.06);background:'+c+';cursor:pointer';
        d.title=c; d.addEventListener('click',function(){STATE.active=c;});
        sw.appendChild(d);
      });
    }
  }

  // Upload + options (checkboxes)
  var fin=document.querySelector('.upload-zone input[type="file"]');
  var opts=collectOptions();
  if(fin){
    fin.removeAttribute('disabled');
    var zone=fin.closest('.upload-zone');
    if(zone){
      zone.addEventListener('dragover', function(e){ e.preventDefault(); });
      zone.addEventListener('drop', function(e){ e.preventDefault(); var f=e.dataTransfer.files[0]; if(f) loadImage(f); });
    }
    fin.addEventListener('change', function(){ var f=fin.files[0]; if(f) loadImage(f); });
  }
  // Map checkboxes by their label text
  function collectOptions(){
    var z=document.querySelector('.upload-zone'); if(!z) return {autotrace:true, reduce:true, cleanup:true, suggest:true};
    var cb=$$('input[type="checkbox"]', z);
    var flags={autotrace:true, reduce:true, cleanup:true, suggest:true};
    cb.forEach(function(c){
      c.disabled=false;
      var label=c.parentNode && c.parentNode.textContent ? c.parentNode.textContent.toLowerCase() : '';
      if(label.indexOf('auto-trace')>-1) flags.autotrace=c.checked;
      if(label.indexOf('reduce')>-1) flags.reduce=c.checked;
      if(label.indexOf('edge')>-1) flags.cleanup=c.checked;
      if(label.indexOf('satin')>-1 || label.indexOf('fill')>-1) flags.suggest=c.checked;
      c.addEventListener('change', function(){ opts=collectOptions(); if(lastImage) processImage(lastImage); });
    });
    return flags;
  }

  var lastImage=null;
  function loadImage(file){
    var img=new Image();
    img.onload=function(){ lastImage=img; processImage(img); };
    img.onerror=function(){ alert('Could not load image'); };
    img.src=URL.createObjectURL(file);
  }

  function processImage(img){
    var max=2000, s=Math.min(1, max/Math.max(img.width,img.height)), w=(img.width*s)|0, h=(img.height*s)|0;
    var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(img,0,0,w,h);

    if(opts.cleanup){
      var id=x.getImageData(0,0,w,h), d=id.data, out=new Uint8ClampedArray(d.length), rad=1;
      for(var y0=0;y0<h;y0++){ for(var z=0;z<w;z++){ var R=0,G=0,B=0,A=0,C=0;
        for(var dy=-rad;dy<=rad;dy++){ for(var dx=-rad;dx<=rad;dx++){ var xx=Math.max(0,Math.min(w-1,z+dx)), yy=Math.max(0,Math.min(h-1,y0+dy)); var i=(yy*w+xx)*4; R+=d[i];G+=d[i+1];B+=d[i+2];A+=d[i+3];C++; } }
        var o=(y0*w+z)*4; out[o]=R/C; out[o+1]=G/C; out[o+2]=B/C; out[o+3]=A/C;
      } }
      id.data.set(out); x.putImageData(id,0,0);
    }

    var labels;
    if(opts.reduce){
      labels = kmeans(x, 8).labels;
    } else {
      // use grayscale threshold if not reducing
      var id2=x.getImageData(0,0,w,h), d2=id2.data; labels=new Uint8Array(w*h);
      for(var i=0;i<w*h;i++){ var g=(d2[i*4]*0.3+d2[i*4+1]*0.59+d2[i*4+2]*0.11)|0; labels[i]=g>128?1:0; }
    }

    STATE.stitches = opts.autotrace ? autoTrace(labels, w, h, prev.width, prev.height) : [];
    render();
  }

  // K-means quantization
  function kmeans(ctx,k){
    var w=ctx.canvas.width, h=ctx.canvas.height;
    var id=ctx.getImageData(0,0,w,h), d=id.data;
    var centers=[], labels=new Uint8Array(w*h);
    for(var i=0;i<k;i++){ var p=(Math.random()*w*h|0)*4; centers.push([d[p],d[p+1],d[p+2]]); }
    for(var it=0; it<6; it++){
      for(var i2=0;i2<w*h;i2++){
        var r=d[i2*4], g=d[i2*4+1], b=d[i2*4+2], best=0, bd=1e20;
        for(var c2=0;c2<k;c2++){ var cc=centers[c2], dist=(r-cc[0])*(r-cc[0])+(g-cc[1])*(g-cc[1])+(b-cc[2])*(b-cc[2]); if(dist<bd){bd=dist; best=c2;} }
        labels[i2]=best;
      }
      var sums=[]; for(var j=0;j<k;j++) sums.push([0,0,0,0]);
      for(var i3=0;i3<w*h;i3++){ var cix=labels[i3], p2=i3*4; sums[cix][0]+=d[p2]; sums[cix][1]+=d[p2+1]; sums[cix][2]+=d[p2+2]; sums[cix][3]++; }
      for(var c3=0;c3<k;c3++){ if(sums[c3][3]) centers[c3]=[sums[c3][0]/sums[c3][3], sums[c3][1]/sums[c3][3], sums[c3][2]/sums[c3][3]]; }
    }
    return {labels:labels};
  }

  // Auto-trace label edges into simple run stitches
  function autoTrace(labels, w, h, outW, outH){
    var stitches=[], scale=Math.min(outW/w, outH/h)*0.9, ox=(outW-w*scale)/2, oy=(outH-h*scale)/2, first=true;
    for(var y=1;y<h;y++){
      for(var x=1;x<w;x++){
        var i=y*w+x;
        if(labels[i]!==labels[i-1] || labels[i]!==labels[i-w]){
          var px=ox+x*scale, py=oy+y*scale;
          stitches.push({cmd:first?'jump':'stitch', x:px, y:py}); first=false;
        }
      }
    }
    return stitches;
  }

  // Draw & Trace tools
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
    function idx(x,y){ return (y*w+x)*4; }
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
    var img=new Image();
    img.onload=function(){
      var c=document.createElement('canvas'); c.width=img.width; c.height=img.height; var x=c.getContext('2d'); x.drawImage(img,0,0);
      var id=x.getImageData(0,0,c.width,c.height), d=id.data;
      var labels=new Uint8Array(c.width*c.height);
      for(var i=0;i<labels.length;i++) labels[i]=d[i*4+3]>0?1:0;
      STATE.stitches = autoTrace(labels, c.width, c.height, prev.width, prev.height);
      render();
    };
    img.src=STATE.history[STATE.history.length-1];
  }
  function undo(){
    if(STATE.history.length<2) return;
    STATE.history.pop();
    var img=new Image();
    img.onload=function(){ dctx.clearRect(0,0,draw.width,draw.height); dctx.drawImage(img,0,0); render(); };
    img.src=STATE.history[STATE.history.length-1];
  }

  // Preview render + optional guides
  function render(){
    pctx.clearRect(0,0,prev.width,prev.height);
    try{ pctx.fillStyle=getComputedStyle(draw).background || '#ffffff'; }catch(e){ pctx.fillStyle='#ffffff'; }
    pctx.fillRect(0,0,prev.width,prev.height);
    // dot grid when guides enabled
    if(STATE.guides){
      pctx.save(); pctx.globalAlpha=0.25;
      for(var gy=10; gy<prev.height; gy+=20){ for(var gx=10; gx<prev.width; gx+=20){ pctx.fillStyle='#94a3b8'; pctx.fillRect(gx,gy,1,1); } }
      pctx.restore();
    }
    pctx.strokeStyle='#111827'; pctx.lineWidth=1; pctx.beginPath();
    STATE.stitches.forEach(function(s){ if(s.cmd==='stitch') pctx.lineTo(s.x,s.y); else if(s.cmd==='jump') pctx.moveTo(s.x,s.y); });
    pctx.stroke();
    if(STATE.guides){
      var hoopW=STATE.hoop.wmm*STATE.pxPerMm, hoopH=STATE.hoop.hmm*STATE.pxPerMm;
      pctx.save(); pctx.strokeStyle='rgba(0,0,0,.22)'; pctx.setLineDash([6,6]);
      pctx.strokeRect((prev.width-hoopW)/2,(prev.height-hoopH)/2, hoopW, hoopH); pctx.restore();
    }
  }

  // Exporters
  function toUnits(){
    var s=1/STATE.pxPerMm*10, cx=prev.width/2, cy=prev.height/2;
    var prevPt=null, out=[];
    STATE.stitches.forEach(function(a){
      if(a.cmd==='stop'){ out.push({cmd:'stop'}); prevPt=null; return; }
      if(a.cmd==='jump'||a.cmd==='stitch'){
        var x=(a.x-cx)*s, y=(a.y-cy)*s;
        if(prevPt===null){ prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
        else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; }
      }
    });
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
    u.forEach(function(s){ if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; return; } if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); return; } enc(s.dx,s.dy,0); });
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
    u.forEach(function(s){ if(s.cmd==='stop'){ put(0,0,'stop'); return; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); return; } put(s.dx,s.dy,'stitch'); });
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

  // Init pass
  STATE.history=[draw.toDataURL('image/png')];
  render();
  console.log('Loomabelle v2 initialized.');
})();