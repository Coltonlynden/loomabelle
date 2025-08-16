<script>
/* Loomabelle – app wiring (v42)
   - Keeps your visual design unchanged
   - Enables upload + preview (hidden until image)
   - Draw & Trace mask with Pen/Eraser + “Process Selection”
   - Fast in-browser processing (posterize + outline + optional hatch)
   - No external libs; offline-friendly
*/

(function(){
  'use strict';

  /* --------------------- DOM helpers --------------------- */
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  /* Panels / cards (keep your HTML as-is) */
  const tabsWrap = $('.tabs-wrap') || document;
  const tabBtns  = $$('.tabs .tab-btn', tabsWrap);
  const panelUpload = $('.panel[data-panel="upload"]') || $('.panel.active') || document;
  const cardUpload  = $('.card.blue', panelUpload);
  const cardPreview = $('.card.rose', panelUpload);
  const panelDraw   = $('.panel[data-panel="draw"]');
  const cardDraw    = panelDraw ? $('.card.violet', panelDraw) : null;
  const cardPalette = panelDraw ? $('.card.green',  panelDraw) : null;

  /* Upload sub-elements (stable selectors) */
  const uploadZone  = $('.upload-zone', cardUpload);
  const uploadInput = $('.upload-zone input[type=file]', cardUpload);
  const reduceChk   = $('.opts input[type=checkbox]:checked, .opts input[type=checkbox]', cardUpload) ? $$('.opts input[type=checkbox]', cardUpload)[0] : $('[type=checkbox]', cardUpload);
  const outlineChk  = $$('.opts input[type=checkbox]', cardUpload)[1] || null;
  const densityRange = $('input[type=range]', cardUpload);

  /* Preview host + action buttons */
  const previewHost = $('.preview', cardPreview);
  const btnsRow = $('.formats', cardPreview);
  function ensureAction(name){
    // Reuse if present, else create consistently styled button
    let b = btnsRow && Array.from(btnsRow.children).find(el => el.dataset && el.dataset.action === name);
    if (!b && btnsRow) {
      b = document.createElement('button');
      b.className = 'btn soft';
      b.dataset.action = name;
      b.textContent = ({
        process: 'Process Photo',
        highlight: 'Highlight Subject'
      })[name] || name;
      btnsRow.appendChild(b);
    }
    return b;
  }
  const btnProcess   = ensureAction('process');
  const btnHighlight = ensureAction('highlight');

  /* Draw & Trace sub-elements */
  const drawCanvasHost = cardDraw ? $('.canvas', cardDraw) : null;
  const drawToolbar    = cardDraw ? $('.toolbar', cardDraw) : null;
  const drawPenBtn     = drawToolbar ? $('button:nth-child(1)', drawToolbar) : null;
  const drawEraseBtn   = drawToolbar ? $('button:nth-child(2)', drawToolbar) : null;

  // Add a "Process Selection" button under the draw tools (once)
  let processSelectionBtn = null;
  if (cardDraw && !$('.loom-process-selection', cardDraw)) {
    processSelectionBtn = document.createElement('button');
    processSelectionBtn.className = 'btn soft loom-process-selection';
    processSelectionBtn.textContent = 'Process Selection';
    processSelectionBtn.style.margin = '12px 0 0 0';
    cardDraw.appendChild(processSelectionBtn);
  }

  /* Thread palette swatches (simple, clickable) */
  if (cardPalette && !$('.swatches', cardPalette)?.children.length) {
    const sw = $('.swatches', cardPalette);
    const colors = [
      '#ef4444','#f472b6','#c084fc','#60a5fa','#38bdf8','#22d3ee',
      '#34d399','#fbbf24','#f59e0b','#fb7185','#a3e635','#f43f5e'
    ];
    colors.forEach(c=>{
      const d=document.createElement('div');
      d.style.cssText='width:28px;height:28px;border-radius:50%;border:2px solid rgba(0,0,0,.1);cursor:pointer';
      d.style.background=c;
      d.title=c;
      d.addEventListener('click',()=>{ state.penColor=c; drawPenBtn?.classList.add('active'); drawEraseBtn?.classList.remove('active'); state.erase=false; });
      sw.appendChild(d);
    });
  }

  /* --------------------- State --------------------- */
  const state = {
    img: null,            // HTMLImageElement
    work: document.createElement('canvas'),   // full-res working canvas
    mask: document.createElement('canvas'),   // user mask (draw tab)
    penColor:'#0f172a',   // dark navy by default
    erase:false
  };
  const wctx = state.work.getContext('2d',{willReadFrequently:true});
  const mctx = state.mask.getContext('2d',{willReadFrequently:true});

  /* --------------------- Preview canvas --------------------- */
  // The preview card is hidden until we mark data-empty="0"
  function setPreviewVisible(on){
    if (!previewHost) return;
    previewHost.dataset.empty = on ? '0' : '1';
  }

  // Ensure a canvas exists inside the preview card
  let previewCanvas = previewHost ? $('canvas', previewHost) : null;
  if (previewHost && !previewCanvas){
    previewCanvas = document.createElement('canvas');
    previewHost.appendChild(previewCanvas);
  }

  function fitPreview(){
    if (!previewHost || !previewCanvas) return;
    const w = Math.floor(previewHost.clientWidth);
    const h = Math.floor(previewHost.clientHeight);
    if (w>0 && h>0) {
      if (previewCanvas.width !== w || previewCanvas.height !== h){
        previewCanvas.width = w; previewCanvas.height = h;
      }
    }
  }
  window.addEventListener('resize', fitPreview);
  fitPreview();

  function drawToPreview(drawFn){
    if (!previewCanvas) return;
    fitPreview();
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    drawFn(ctx, previewCanvas.width, previewCanvas.height);
  }

  /* --------------------- Tabs (your visual tabs) --------------------- */
  if (tabBtns.length === 2 && panelDraw && panelUpload){
    tabBtns.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        tabBtns.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const which = btn.dataset.tab || btn.textContent.toLowerCase().includes('draw') ? 'draw' : 'upload';
        $$('.panel', tabsWrap).forEach(p=>p.classList.remove('active'));
        (which==='draw' ? panelDraw : panelUpload).classList.add('active');
        // Stabilize header on iOS
        document.body.scrollTop = document.body.scrollTop; // no-op tick
      });
    });
  }

  /* --------------------- Upload wiring --------------------- */
  if (uploadInput) {
    uploadInput.removeAttribute('disabled');
    uploadInput.accept = 'image/*';
    uploadZone?.addEventListener('click', (e)=>{
      if(e.target === uploadZone || e.target.closest('.upload-inner')) uploadInput.click();
    });
    uploadInput.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      try{
        const img = new Image();
        await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
        state.img = img;
        // Fit working canvas (cap size for phones)
        const MAX = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1280 : 2000;
        let W = img.naturalWidth, H = img.naturalHeight;
        if (Math.max(W,H) > MAX){ const r = MAX/Math.max(W,H); W=(W*r)|0; H=(H*r)|0; }
        state.work.width=W; state.work.height=H; wctx.clearRect(0,0,W,H); wctx.drawImage(img,0,0,W,H);
        // reset mask to same size
        state.mask.width=W; state.mask.height=H; mctx.clearRect(0,0,W,H);

        // Show preview with the raw image scaled to card
        setPreviewVisible(true);
        drawToPreview((ctx,pw,ph)=>{
          // contain fit
          const r = Math.min(pw/W, ph/H);
          const dw = Math.round(W*r), dh = Math.round(H*r);
          const dx = Math.floor((pw-dw)/2), dy = Math.floor((ph-dh)/2);
          ctx.fillStyle = '#fff'; ctx.fillRect(0,0,pw,ph);
          ctx.drawImage(state.work, dx,dy,dw,dh);
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  }

  /* --------------------- Fast processing --------------------- */
  function processImage() {
    if (!state.work.width) return;
    const wantReduce  = reduceChk ? reduceChk.checked : true;
    const wantOutline = outlineChk ? outlineChk.checked : true;
    const addHatch    = true; // matches your “Add fills” default

    const W = state.work.width, H = state.work.height;
    const src = wctx.getImageData(0,0,W,H);
    const d   = src.data;

    // Optional quantize (very lightweight k-means-ish)
    let palette = null, indexed = null;
    if (wantReduce){
      const k = 6;
      // downsample points
      const step = Math.max(1, Math.floor(Math.sqrt((W*H)/40000)));
      const pts  = [];
      for(let y=0;y<H;y+=step){ const row=y*W; for(let x=0;x<W;x+=step){
        const i=(row+x)*4; pts.push([d[i],d[i+1],d[i+2]]);
      }}
      // init centers randomly
      let centers = pts.slice(0, k);
      for(let it=0; it<6; it++){
        const sums = Array.from({length:k},()=>[0,0,0,0]);
        pts.forEach(p=>{
          let bi=0,bd=1e12;
          for(let c=0;c<k;c++){
            const cc=centers[c], dr=p[0]-cc[0], dg=p[1]-cc[1], db=p[2]-cc[2];
            const dd=dr*dr+dg*dg+db*db; if(dd<bd){bd=dd;bi=c;}
          }
          const s=sums[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        });
        for(let c=0;c<k;c++){ const s=sums[c]; if(s[3]) centers[c]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
      }
      palette = centers;
      indexed = new Uint8Array(W*H);
      for(let i=0;i<W*H;i++){
        const j=i*4; let bi=0,bd=1e12;
        for(let c=0;c<palette.length;c++){
          const pr=palette[c][0], pg=palette[c][1], pb=palette[c][2];
          const dr=d[j]-pr,dg=d[j+1]-pg,db=d[j+2]-pb; const vv=dr*dr+dg*dg+db*db;
          if(vv<bd){bd=vv;bi=c;}
        }
        indexed[i]=bi;
      }
    }

    // Simple edge map (Sobel)
    const edge = new Uint8ClampedArray(W*H);
    (function(){
      const gx=[-1,0,1,-2,0,2,-1,0,1], gy=[-1,-2,-1,0,0,0,1,2,1];
      for(let y=1;y<H-1;y++){
        for(let x=1;x<W-1;x++){
          let sx=0, sy=0, idx=0;
          for(let yy=-1;yy<=1;yy++){
            for(let xx=-1;xx<=1;xx++){
              const i=((y+yy)*W + (x+xx))*4;
              const lum = (d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722);
              sx += lum * gx[idx]; sy += lum * gy[idx]; idx++;
            }
          }
          const mag = Math.sqrt(sx*sx+sy*sy);
          edge[y*W+x] = mag>140 ? 255 : 0;
        }
      }
    })();

    // Apply user mask (if any from Draw & Trace)
    const hasMask = state.mask && state.mask.width === W && state.mask.height === H &&
                    mctx.getImageData(0,0,W,H).data.some((v,i)=> (i%4)===3 && v>0);
    let maskAlpha = null;
    if (hasMask){
      const m = mctx.getImageData(0,0,W,H).data;
      maskAlpha = new Uint8Array(W*H);
      for(let i=0;i<W*H;i++) maskAlpha[i] = m[i*4+3]>8 ? 1 : 0;
    }

    // Render to preview
    setPreviewVisible(true);
    drawToPreview((ctx,pw,ph)=>{
      // contain fit for drawing
      const r = Math.min(pw/W, ph/H);
      const dw = Math.round(W*r), dh = Math.round(H*r);
      const dx = Math.floor((pw-dw)/2), dy = Math.floor((ph-dh)/2);

      // backdrop
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,pw,ph);

      // base fill (palette or original)
      const img = ctx.createImageData(dw,dh);
      for(let y=0;y<dh;y++){
        for(let x=0;x<dw;x++){
          const sx = Math.min(W-1, Math.floor(x/r));
          const sy = Math.min(H-1, Math.floor(y/r));
          const si = sy*W+sx, di = (y*dw+x)*4;
          if (maskAlpha && !maskAlpha[si]) {
            // outside selection → keep white
            img.data[di]=255; img.data[di+1]=255; img.data[di+2]=255; img.data[di+3]=255;
          } else if (indexed){
            const c = palette[indexed[si]]; img.data[di]=c[0]; img.data[di+1]=c[1]; img.data[di+2]=c[2]; img.data[di+3]=255;
          } else {
            const j=si*4; img.data[di]=d[j]; img.data[di+1]=d[j+1]; img.data[di+2]=d[j+2]; img.data[di+3]=255;
          }
        }
      }
      ctx.putImageData(img, dx,dy);

      // optional diagonal hatch to simulate fill stitches
      if (addHatch){
        const density = densityRange ? (0.3 + 0.7*(parseFloat(densityRange.value||densityRange.min||'0') - parseFloat(densityRange.min||'0')) / ( (parseFloat(densityRange.max||'100')||100) - parseFloat(densityRange.min||'0') )) : 0.4;
        const step = Math.max(6, Math.floor(14 - density*10)); // smaller = denser
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx,dy,dw,dh);
        ctx.clip();
        ctx.strokeStyle='rgba(0,0,0,.10)';
        ctx.lineWidth=1;

        for(let y=-dh; y<dh*2; y+=step){
          ctx.beginPath();
          ctx.moveTo(dx-20, dy+y);
          ctx.lineTo(dx+dw+20, dy+y-20);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Outline
      if (wantOutline){
        ctx.save();
        ctx.translate(dx,dy);
        ctx.strokeStyle='#0f172a';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        for(let y=1;y<dh-1;y++){
          for(let x=1;x<dw-1;x++){
            const sx = Math.min(W-1, Math.floor(x/r));
            const sy = Math.min(H-1, Math.floor(y/r));
            if (edge[sy*W+sx]){ ctx.moveTo(x,y); ctx.lineTo(x+0.01,y+0.01); }
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  if (btnProcess)   btnProcess.addEventListener('click', processImage);
  if (btnHighlight) btnHighlight.addEventListener('click', ()=>{
    if (!panelDraw || !cardDraw) return;
    // switch tab visually
    if (tabBtns.length) { tabBtns.forEach(b=>b.classList.remove('active')); tabBtns[1].classList.add('active'); }
    $$('.panel', tabsWrap).forEach(p=>p.classList.remove('active'));
    panelDraw.classList.add('active');
    setupDrawCanvas();
  });

  /* --------------------- Draw & Trace (mask) --------------------- */
  let drawCanvas = null, dctx = null, baseImgForDraw = null;
  function setupDrawCanvas(){
    if (!drawCanvasHost || !state.work.width) return;
    // ensure canvas exists
    if (!drawCanvas){
      drawCanvas = document.createElement('canvas');
      drawCanvasHost.innerHTML = '';
      drawCanvasHost.appendChild(drawCanvas);
      dctx = drawCanvas.getContext('2d');
    }
    // fit canvas to host
    const w = Math.floor(drawCanvasHost.clientWidth);
    const h = Math.floor(Math.max(220, drawCanvasHost.clientHeight));
    drawCanvas.width = w; drawCanvas.height = h;

    // Render the working image under a translucent veil
    const W = state.work.width, H = state.work.height;
    const r = Math.min(w/W, h/H);
    const dw = Math.round(W*r), dh = Math.round(H*r);
    const dx = Math.floor((w-dw)/2), dy = Math.floor((h-dh)/2);
    baseImgForDraw = {r,dx,dy,dw,dh};

    dctx.clearRect(0,0,w,h);
    dctx.drawImage(state.work, dx,dy,dw,dh);
    dctx.fillStyle='rgba(255,255,255,.35)'; dctx.fillRect(0,0,w,h);

    // paint existing mask (if any)
    if (state.mask.width===W && state.mask.height===H){
      const id = mctx.getImageData(0,0,W,H);
      dctx.save();
      dctx.globalAlpha = 0.65;
      dctx.fillStyle = '#0f172a';
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          if (id.data[(y*W+x)*4+3] > 10){
            const px = Math.round(dx + x*r), py = Math.round(dy + y*r);
            dctx.fillRect(px,py, Math.ceil(r), Math.ceil(r));
          }
        }
      }
      dctx.restore();
    }
  }

  // draw interactions
  if (drawCanvasHost){
    let painting=false, lastX=0, lastY=0, size=18;
    function hostToWork(ev){
      if (!baseImgForDraw) return null;
      const rect = drawCanvas.getBoundingClientRect();
      const cx = (ev.touches?ev.touches[0].clientX:ev.clientX) - rect.left;
      const cy = (ev.touches?ev.touches[0].clientY:ev.clientY) - rect.top;
      // convert to work-space coords
      const xw = Math.round( (cx - baseImgForDraw.dx) / baseImgForDraw.r );
      const yw = Math.round( (cy - baseImgForDraw.dy) / baseImgForDraw.r );
      return {cx,cy,xw,yw};
    }
    function paintDot(cx,cy){
      dctx.save();
      dctx.globalAlpha=1;
      dctx.fillStyle = state.erase ? 'rgba(255,255,255,1)' : state.penColor;
      dctx.beginPath();
      dctx.arc(cx,cy, size/2, 0, Math.PI*2);
      dctx.fill();
      dctx.restore();
      // also write to mask (work-space)
      const rad = Math.max(1, Math.round(size/2 / baseImgForDraw.r));
      const mx = Math.max(0, Math.min(state.mask.width-1, Math.round((cx-baseImgForDraw.dx)/baseImgForDraw.r)));
      const my = Math.max(0, Math.min(state.mask.height-1, Math.round((cy-baseImgForDraw.dy)/baseImgForDraw.r)));
      mctx.globalCompositeOperation = state.erase ? 'destination-out' : 'source-over';
      mctx.fillStyle = 'rgba(0,0,0,1)';
      mctx.beginPath(); mctx.arc(mx,my,rad,0,Math.PI*2); mctx.fill();
      mctx.globalCompositeOperation = 'source-over';
    }
    function drawMove(ev){
      if (!painting) return;
      const p = hostToWork(ev); if(!p) return; ev.preventDefault();
      const dx = p.cx - lastX, dy = p.cy - lastY;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx,dy) / (size*0.6)));
      for(let i=1;i<=steps;i++){
        const cx = lastX + dx*i/steps, cy = lastY + dy*i/steps;
        paintDot(cx,cy);
      }
      lastX=p.cx; lastY=p.cy;
    }
    function drawStart(ev){ if(!state.work.width) return; painting=true; const p=hostToWork(ev); if(!p) return; lastX=p.cx; lastY=p.cy; paintDot(p.cx,p.cy); ev.preventDefault(); }
    function drawEnd(){ painting=false; }

    drawCanvasHost.addEventListener('mousedown', drawStart);
    window.addEventListener('mouseup', drawEnd);
    drawCanvasHost.addEventListener('mousemove', drawMove);
    drawCanvasHost.addEventListener('touchstart', drawStart,{passive:false});
    window.addEventListener('touchend', drawEnd);
    drawCanvasHost.addEventListener('touchmove', drawMove,{passive:false});

    drawPenBtn?.addEventListener('click', ()=>{ state.erase=false; drawPenBtn.classList.add('active'); drawEraseBtn?.classList.remove('active'); });
    drawEraseBtn?.addEventListener('click',()=>{ state.erase=true;  drawEraseBtn.classList.add('active'); drawPenBtn?.classList.remove('active'); });

    processSelectionBtn?.addEventListener('click', ()=>{
      // go back to Upload tab and process with mask
      if (tabBtns.length) { tabBtns.forEach(b=>b.classList.remove('active')); tabBtns[0].classList.add('active'); }
      $$('.panel', tabsWrap).forEach(p=>p.classList.remove('active'));
      panelUpload.classList.add('active');
      processImage();
    });
  }

  /* --------------------- First render --------------------- */
  setPreviewVisible(false);   // hidden until an image is chosen
  window.addEventListener('load', fitPreview);
})();
</script>