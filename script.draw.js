/* draw + mask + text; robust upload for iOS + proper sizing */
(function(){
  const $ = s=>document.querySelector(s);

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
    showDir:   $('#showDir')
  };

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctxImg  = C.img.getContext('2d');
  const ctxMask = C.mask.getContext('2d',{willReadFrequently:true});
  const ctxText = C.text.getContext('2d');

  let bmp=null, bmpIsHTML=false;
  const state = { text:{content:'', x:.5, y:.5, px:72, curve:0}, dir:{angle:45, pattern:'hatch'}, removeBg:false };

  /* ---- sizing: always give the wrap real height (iOS) ---- */
  function sizeWrap(){
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'))||60;
    const bot = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--status-h'))||60;
    const avail = Math.max(200, window.innerHeight - top - bot - 24);
    C.wrap.style.height = avail+'px';
  }
  function fit(){
    sizeWrap();
    const w = Math.max(2, C.wrap.clientWidth);
    const h = Math.max(2, C.wrap.clientHeight);
    [C.img,C.mask,C.text].forEach(c=>{
      c.width = Math.round(w*dpr);
      c.height= Math.round(h*dpr);
      c.style.width='100%'; c.style.height='100%';
    });
    draw();
  }
  addEventListener('resize', fit);

  /* ---- upload (ImageBitmap with FileReader fallback) ---- */
  async function loadFile(file){
    if(!file) return;
    try{
      if('createImageBitmap' in window){
        bmp = await createImageBitmap(file);
        bmpIsHTML=false;
      }else{ throw 0; }
    }catch{
      bmpIsHTML=true;
      bmp = await new Promise((res,rej)=>{
        const fr=new FileReader();
        fr.onload=()=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=fr.result; };
        fr.onerror=rej; fr.readAsDataURL(file);
      });
    }
    // opaque mask initially
    ctxMask.clearRect(0,0,C.mask.width,C.mask.height);
    ctxMask.fillStyle='rgba(0,0,0,0.99)'; ctxMask.fillRect(0,0,C.mask.width,C.mask.height);
    requestAnimationFrame(()=>{ fit(); }); // after layout
  }
  window.addEventListener('editor:file', e=> loadFile(e?.detail?.file));

  /* ---- remove background ---- */
  window.addEventListener('editor:removebg', e=>{ state.removeBg=!!e?.detail?.enabled; draw(); });

  /* ---- auto highlight subject ---- */
  C.auto?.addEventListener('click', ()=>{
    if(!bmp) return;
    const W=256, H=Math.round(W*(bmp.height/bmp.width));
    const t=document.createElement('canvas'); t.width=W; t.height=H;
    const cx=t.getContext('2d'); cx.drawImage(bmp,0,0,W,H);
    const id=cx.getImageData(0,0,W,H);
    const seg=kmeansMask(id);
    const up=document.createElement('canvas'); up.width=W; up.height=H;
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
    const dark=c0<c1, out=new Uint8ClampedArray(W*H*4);
    for(let i=0;i<W*H;i++){ const v=L[i], dD=Math.abs(v-c0), dL=Math.abs(v-c1), fg= dark ? (dD<dL) : (dL<dD); out[i*4+3]=fg?235:0; }
    return new ImageData(out,W,H);
  }

  /* ---- toggles ---- */
  C.showMask?.addEventListener('change', ()=> C.mask.classList.toggle('is-hidden', !C.showMask.checked));
  C.showEdges?.addEventListener('change', draw);

  C.textApply?.addEventListener('click', ()=>{
    state.text.content = C.textInput.value||'';
    state.text.px      = +C.textSize.value;
    state.text.curve   = +C.textCurve.value;
    draw();
  });

  /* ---- render ---- */
  function draw(){
    const w=C.img.width, h=C.img.height;
    const clear=(ctx)=>{ ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); };
    clear(ctxImg); clear(ctxText);

    if(!bmp){
      ctxImg.fillStyle='#fff'; ctxImg.fillRect(0,0,w,h);
      return;
    }

    ctxImg.drawImage(bmp,0,0,w,h);

    if(state.removeBg){
      ctxImg.save(); ctxImg.globalCompositeOperation='destination-in';
      ctxImg.drawImage(C.mask,0,0); ctxImg.restore();
    }

    if(C.showEdges?.checked){
      ctxImg.save(); ctxImg.globalCompositeOperation='multiply';
      ctxImg.strokeStyle='rgba(50,50,50,.25)'; ctxImg.lineWidth=1;
      for(let i=-h;i<w;i+=22){ ctxImg.beginPath(); ctxImg.moveTo(i,0); ctxImg.lineTo(i+h,h); ctxImg.stroke(); }
      ctxImg.restore();
    }

    const t=state.text; if(t.content){
      const cx=w*t.x, cy=h*t.y;
      ctxText.font=`${t.px*dpr}px serif`; ctxText.textAlign='center'; ctxText.textBaseline='middle';
      ctxText.fillStyle='#222'; ctxText.strokeStyle='rgba(0,0,0,.12)'; ctxText.lineWidth=2*dpr;
      ctxText.strokeText(t.content,cx,cy); ctxText.fillText(t.content,cx,cy);
    }

    if(window.renderLoomPreview) try{ renderLoomPreview('loomPreviewCanvas'); }catch(_){}
  }

  window.Editor = { fit, redraw: draw };
  // first layout + iOS toolbar settle
  window.addEventListener('load', ()=>{ fit(); setTimeout(fit,120); });
})();