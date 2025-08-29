/* draw + mask + text; robust upload fallback + remove-background */
(function(){
  const $ = s=>document.querySelector(s), $$ = s=>document.querySelectorAll(s);

  const C = {
    wrap: $('#canvasWrap'),
    img:  $('#imgCanvas'),
    mask: $('#maskCanvas'),
    text: $('#textCanvas'),

    auto: $('#autoBtn'),

    showMask:  $('#showMask'),
    showEdges: $('#showEdges'),

    textInput: $('#textInput'),
    textSize:  $('#textSize'),
    textCurve: $('#textCurve'),
    textApply: $('#textApply'),

    dirAngle:  $('#dirAngle'),
    dirPattern:$('#dirPattern'),
    showDir:   $('#showDir'),

    zoomPct: $('#zoomPct')
  };

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctxImg  = C.img.getContext('2d');
  const ctxMask = C.mask.getContext('2d',{willReadFrequently:true});
  const ctxText = C.text.getContext('2d');

  let bmp = null;        // ImageBitmap or HTMLImageElement
  let bmpIsHTML = false; // track type for drawImage
  const state = {
    zoom:1,
    text:{content:'', x:.5, y:.5, px:72, curve:0},
    dir:{angle:45, pattern:'hatch'},
    removeBg:false
  };

  /* ---------- layout ---------- */
  function fit(){
    const w = Math.max(2, C.wrap.clientWidth);
    const h = Math.max(2, C.wrap.clientHeight || Math.round(w*0.75));
    [C.img,C.mask,C.text].forEach(c=>{
      c.width = Math.round(w*dpr);
      c.height= Math.round(h*dpr);
      c.style.width='100%'; c.style.height='100%';
    });
    draw();
  }
  addEventListener('resize', fit);

  /* ---------- upload handler (robust) ---------- */
  async function loadFile(file){
    if(!file) return;
    // try ImageBitmap first
    try{
      if('createImageBitmap' in window){
        bmp = await createImageBitmap(file);
        bmpIsHTML = false;
      }else{
        throw new Error('ImageBitmap not supported');
      }
    }catch{
      // fallback: FileReader -> HTMLImageElement
      bmpIsHTML = true;
      bmp = await new Promise((resolve, reject)=>{
        const fr = new FileReader();
        fr.onload = ()=>{
          const img = new Image();
          img.onload = ()=> resolve(img);
          img.onerror = reject;
          img.src = fr.result;
        };
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }

    // reset mask to full opaque
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.fillStyle='rgba(0,0,0,0.99)';
    ctxMask.fillRect(0,0,C.mask.width,C.mask.height);

    fit(); // size canvases to container before we draw
  }

  // event from editor.ui.js / script.upload.js
  window.addEventListener('editor:file', e=>{
    const f = e?.detail?.file; if(!f) return;
    loadFile(f);
  });

  /* ---------- remove background shared toggle ---------- */
  window.addEventListener('editor:removebg', e=>{
    state.removeBg = !!(e?.detail?.enabled);
    draw();
  });

  /* ---------- auto highlight subject (fast luminance k-means) ---------- */
  C.auto?.addEventListener('click', ()=>{
    if(!bmp) return;
    const {w,h} = { w: 256, h: 256*(bmp.height/bmp.width) };
    const t = document.createElement('canvas'); t.width=w; t.height=h;
    const cx = t.getContext('2d'); cx.drawImage(bmp,0,0,w,h);
    const id = cx.getImageData(0,0,w,h);
    const seg = kmeansMask(id);
    const up = document.createElement('canvas'); up.width=w; up.height=h;
    up.getContext('2d').putImageData(seg,0,0);
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.drawImage(up,0,0,C.mask.width,C.mask.height);
    draw();
  });

  function kmeansMask(img){
    const {data,width:W,height:H}=img, L=new Float32Array(W*H);
    for(let i=0;i<W*H;i++){ const j=i*4; L[i]=(data[j]*0.2126+data[j+1]*0.7152+data[j+2]*0.0722); }
    let c0=64, c1=192;
    for(let it=0;it<6;it++){
      let s0=0,n0=0,s1=0,n1=0;
      for(let i=0;i<L.length;i++){ const v=L[i]; if(Math.abs(v-c0)<Math.abs(v-c1)){s0+=v;n0++;} else {s1+=v;n1++;} }
      c0=s0/(n0||1); c1=s1/(n1||1);
    }
    const dark = c0<c1;
    const out=new Uint8ClampedArray(W*H*4);
    for(let i=0;i<W*H;i++){
      const v=L[i], dD=Math.abs(v-c0), dL=Math.abs(v-c1), fg = dark ? (dD<dL) : (dL<dD);
      out[i*4+3]=fg?235:0;
    }
    return new ImageData(out,W,H);
  }

  /* ---------- visibility + dir controls ---------- */
  C.showMask?.addEventListener('change', ()=>{ C.mask.classList.toggle('is-hidden', !C.showMask.checked); });
  C.showEdges?.addEventListener('change', draw);
  C.dirAngle?.addEventListener('input', e=>{state.dir.angle=+e.target.value; draw();});
  C.dirPattern?.addEventListener('input', e=>{state.dir.pattern=e.target.value; draw();});

  /* ---------- text controls ---------- */
  C.textApply?.addEventListener('click', ()=>{
    state.text.content = C.textInput.value||'';
    state.text.px      = +C.textSize.value;
    state.text.curve   = +C.textCurve.value;
    draw();
  });

  /* ---------- render ---------- */
  function draw(){
    // clear
    [ctxImg,ctxText].forEach(c=>{ c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,C.img.width,C.img.height); });

    if(!bmp){
      // placeholder paper
      ctxImg.fillStyle = '#fff';
      ctxImg.fillRect(0,0,C.img.width,C.img.height);
      return;
    }

    // base
    ctxImg.drawImage(bmp,0,0,C.img.width,C.img.height);

    // remove background in preview using mask alpha
    if(state.removeBg){
      ctxImg.save();
      ctxImg.globalCompositeOperation='destination-in';
      ctxImg.drawImage(C.mask,0,0);
      ctxImg.restore();
    }

    // grid overlay if requested
    if(C.showEdges?.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply'; ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for(let i=-C.img.height;i<C.img.width;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+C.img.height,C.img.height); ctxImg.stroke(); }
      ctxImg.restore();
    }

    // text
    const t=state.text; if(t.content){
      const cx=C.text.width*t.x, cy=C.text.height*t.y;
      if(t.curve>0) arcText(ctxText,t.content,cx,cy,t.px,t.curve*Math.PI/180);
      else { ctxText.font=`${t.px*dpr}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle';
             ctxText.fillStyle='#222'; ctxText.strokeStyle='rgba(0,0,0,.12)'; ctxText.lineWidth=2*dpr;
             ctxText.strokeText(t.content,cx,cy); ctxText.fillText(t.content,cx,cy); }
    }

    // update mini preview
    if (window.renderLoomPreview) try{ renderLoomPreview('loomPreviewCanvas'); }catch(_){}
  }

  function arcText(ctx, text, cx, cy, px, rad){
    const r = Math.min(C.text.width,C.text.height)*0.35;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(-rad/2);
    ctx.font = `${px*dpr}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#222'; ctx.strokeStyle='rgba(0,0,0,.12)'; ctx.lineWidth=2*dpr;
    const step = rad/(text.length||1);
    for(let i=0;i<text.length;i++){
      ctx.save(); ctx.rotate(step*i); ctx.translate(0,-r);
      ctx.strokeText(text[i],0,0); ctx.fillText(text[i],0,0); ctx.restore();
    }
    ctx.restore();
  }

  // expose minimal API
  window.Editor = { fit, redraw: draw };
  fit();
})();