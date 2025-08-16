/* Loomabelle runtime — v35 (defensive)
   - Works with the mockup HTML you pasted earlier (and minor variants).
   - Wires tabs, upload, preview, highlight subject + process selection.
   - Mobile-safe; no server.
*/

(() => {
  "use strict";

  /* --------------------- element helpers --------------------- */
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const byText = (root, selector, text) =>
    $$(selector, root).find(n => (n.textContent||"").toLowerCase().includes(text));

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const DPR = () => (window.devicePixelRatio || 1);

  // Find panels (works whether data-panel exists or not)
  const panels = {
    upload: $('.panel[data-panel="upload"]') || byText(document, '.panel', 'upload a photo'),
    draw:   $('.panel[data-panel="draw"]')   || byText(document, '.panel', 'draw & trace'),
  };

  // Tabs (buttons with class tab-btn)
  const tabs = $$('.tab-btn');
  function activateTab(name){
    if(!panels.upload || !panels.draw) return;
    tabs.forEach(b => b.classList.toggle('active', (b.dataset.tab||'').toLowerCase()===name));
    $$('.panel').forEach(p => p.classList.remove('active'));
    const p = (name==='upload') ? panels.upload : panels.draw;
    p && p.classList.add('active');
  }

  // Upload area
  const uploadCard = panels.upload;
  const uploadZone = uploadCard?.querySelector('.upload-zone');
  let uploadInput  = uploadZone?.querySelector('input[type="file"]');
  // Checkboxes/sliders in upload card (optional)
  const reduceChk     = uploadCard?.querySelectorAll('label input[type="checkbox"]')[0] || null;
  const outlineChk    = uploadCard?.querySelectorAll('label input[type="checkbox"]')[1] || null;
  const densitySlider = uploadCard?.querySelector('input[type="range"]') || null;

  // Preview card
  const previewCard = byText(panels.upload, '.card', 'preview') || panels.upload;
  const previewHost = previewCard?.querySelector('.preview');
  // Buttons under preview (order: Process, Highlight, No subject, Add fills…)
  const ctrlRow     = previewCard;
  const btnProcess  = byText(ctrlRow, 'button', 'process photo');
  const btnHighlight= byText(ctrlRow, 'button', 'highlight subject');
  const noSubject   = byText(ctrlRow, 'label', 'no subject')?.querySelector('input[type="checkbox"]')
                    || byText(ctrlRow, 'input[type="checkbox"]', 'no subject'); // handle both label/inline
  const addFills    = byText(ctrlRow, 'label', 'add fills')?.querySelector('input[type="checkbox"]')
                    || byText(ctrlRow, 'input[type="checkbox"]', 'add fills');

  // Draw card
  const drawCard  = panels.draw;
  const drawHost  = drawCard?.querySelector('.canvas');
  const btnPen    = byText(drawCard, 'button', 'pen');
  const btnEraser = byText(drawCard, 'button', 'eraser');
  const btnProcSel= byText(drawCard, 'button', 'process selection');

  /* ------------------------ state ---------------------------- */
  const S = {
    image: null,      // HTMLImageElement
    work:  null,      // canvas (image)
    preview: null,    // preview canvas
    drawBG: null,     // draw panel background
    mask: null,       // draw panel mask (user strokes)
    hasMask: false,
    pen: {erase:false,size:18,down:false,lastX:0,lastY:0},
    opts: {k:6, outline:true, addFills:true, ignoreSubject:false}
  };

  /* ---------------------- canvases --------------------------- */
  function makeCanvas(w,h,scale=true){
    const c=document.createElement('canvas');
    const r = scale? DPR(): 1;
    c.width = Math.max(1, Math.round(w*r));
    c.height= Math.max(1, Math.round(h*r));
    c.style.width = `${Math.round(w)}px`;
    c.style.height= `${Math.round(h)}px`;
    return c;
  }

  function ensurePreview(){
    if (S.preview) return;
    if (!previewHost) return;
    const rect = previewHost.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width||480));
    const h = Math.max(180, Math.floor(w*9/16));
    const c = makeCanvas(w,h,false);
    c.style.display='block'; c.style.width='100%'; c.style.height='100%';
    previewHost.innerHTML=''; previewHost.appendChild(c);
    S.preview = c;
  }

  function ensureDrawLayer(){
    if (S.drawBG && S.mask) return;
    if (!drawHost) return;
    drawHost.style.position = 'relative';
    drawHost.style.touchAction = 'none';

    const bg = makeCanvas(640,360,false);
    bg.style.cssText='position:absolute;inset:0;display:block;width:100%;height:100%;opacity:.45;';
    const mk = makeCanvas(640,360,false);
    mk.style.cssText='position:relative;display:block;width:100%;height:100%;';

    drawHost.innerHTML=''; drawHost.appendChild(bg); drawHost.appendChild(mk);
    S.drawBG = bg; S.mask = mk;
    bindDrawing(mk);
  }

  /* -------------------- file upload -------------------------- */
  function bindUpload(){
    if (!uploadZone) return;
    // enable input if mockup had disabled
    if (!uploadInput) {
      uploadInput = document.createElement('input');
      uploadInput.type='file';
      uploadInput.accept='image/*';
      uploadZone.appendChild(uploadInput);
    } else {
      uploadInput.removeAttribute('disabled');
    }

    uploadZone.addEventListener('click', e => {
      if (e.target && e.target.tagName !== 'INPUT') uploadInput.click();
    });

    uploadInput.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      let file = f;
      if (/\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type)) {
        try { file = await heicToJpeg(f); } catch {}
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);

        // downscale to 1280 max side
        let W = img.naturalWidth, H = img.naturalHeight;
        const maxSide = 1280;
        if (Math.max(W,H)>maxSide){ const s=maxSide/Math.max(W,H); W=(W*s)|0; H=(H*s)|0; }
        const work = makeCanvas(W,H,false);
        work.getContext('2d').drawImage(img,0,0,W,H);

        S.image = img;
        S.work  = work;
        S.hasMask = false;

        ensurePreview();
        drawRawPreview();
        ensureDrawLayer();
        mirrorToDraw();

        // enable controls
        btnProcess && (btnProcess.disabled=false);
        btnHighlight && (btnHighlight.disabled=false);
        btnProcSel && (btnProcSel.disabled=false);
        btnPen && btnPen.click();
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
  }

  function drawRawPreview(){
    if (!S.preview || !S.work) return;
    const c = S.preview, ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    const scale = Math.min(c.width/S.work.width, c.height/S.work.height);
    const w = (S.work.width*scale)|0, h=(S.work.height*scale)|0;
    const x = (c.width-w)>>1, y=(c.height-h)>>1;
    ctx.drawImage(S.work, x, y, w, h);
  }

  function mirrorToDraw(){
    if (!S.drawBG || !S.work) return;
    S.drawBG.width = S.work.width;  S.drawBG.height = S.work.height;
    S.mask.width   = S.work.width;  S.mask.height   = S.work.height;
    const g = S.drawBG.getContext('2d'); g.clearRect(0,0,S.drawBG.width,S.drawBG.height);
    g.drawImage(S.work,0,0);
    S.mask.getContext('2d').clearRect(0,0,S.mask.width,S.mask.height);
    S.hasMask = false;
  }

  /* ------------------- drawing (mask) ------------------------ */
  function bindDrawing(cnv){
    const ctx = cnv.getContext('2d', { willReadFrequently:true });
    function pt(ev){
      const r = cnv.getBoundingClientRect();
      const cx = (ev.touches? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches? ev.touches[0].clientY : ev.clientY) - r.top;
      return { x: cx*(cnv.width/r.width), y: cy*(cnv.height/r.height) };
    }
    function strokeTo(x,y){
      ctx.globalCompositeOperation = S.pen.erase? 'destination-out':'source-over';
      ctx.lineWidth = S.pen.size; ctx.lineCap = 'round'; ctx.strokeStyle='#fff';
      ctx.beginPath(); ctx.moveTo(S.pen.lastX,S.pen.lastY); ctx.lineTo(x,y); ctx.stroke();
      S.pen.lastX=x; S.pen.lastY=y; S.hasMask=true;
    }
    const start = (ev)=>{ if(!S.work) return; const p=pt(ev); S.pen.down=true; S.pen.lastX=p.x; S.pen.lastY=p.y; strokeTo(p.x,p.y); ev.preventDefault(); };
    const move  = (ev)=>{ if(!S.pen.down) return; const p=pt(ev); strokeTo(p.x,p.y); ev.preventDefault(); };
    const end   = ()=>{ S.pen.down=false; };

    cnv.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    cnv.addEventListener('touchstart', start, {passive:false});
    window.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('touchend', end);

    if (btnPen)   btnPen.onclick   = ()=>{ S.pen.erase=false; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); };
    if (btnEraser)btnEraser.onclick= ()=>{ S.pen.erase=true;  btnEraser.classList.add('active'); btnPen?.classList.remove('active'); };
  }

  /* ------------------ quantize + render ---------------------- */
  function processPreview(){
    if (!S.work) return;
    const W=S.work.width, H=S.work.height;
    const src = S.work.getContext('2d').getImageData(0,0,W,H);
    const maskA = (S.hasMask && !S.opts.ignoreSubject)
      ? S.mask.getContext('2d').getImageData(0,0,W,H).data
      : null;

    // gather samples (~200k)
    const k=6, step=Math.max(1, Math.floor(Math.sqrt((W*H)/200000)));
    const pts=[];
    for(let y=0;y<H;y+=step){
      const row=y*W;
      for(let x=0;x<W;x+=step){
        const i=row+x, j=i*4;
        if (maskA && maskA[j+3] < 12) continue;
        pts.push([src.data[j],src.data[j+1],src.data[j+2]]);
      }
    }
    // k-means-lite
    const centers=[];
    if(pts.length===0){ centers.push([0,0,0]); }
    else{
      centers.push(pts[Math.floor(Math.random()*pts.length)]);
      while(centers.length<k && centers.length<pts.length){
        let best=null, bd=-1;
        for(const p of pts){
          let d=1e9;
          for(const c of centers){ const dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2]; const dd=dx*dx+dy*dy+dz*dz; if(dd<d) d=dd; }
          if(d>bd){ bd=d; best=p; }
        }
        centers.push(best.slice());
      }
      for(let it=0;it<4;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0, bd=1e12; for(let i=0;i<centers.length;i++){
            const c=centers[i], dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2];
            const dd=dx*dx+dy*dy+dz*dz; if(dd<bd){bd=dd;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
      }
    }

    ensurePreview();
    const dst=S.preview, ctx=dst.getContext('2d');
    ctx.clearRect(0,0,dst.width,dst.height);
    const scale=Math.min(dst.width/W, dst.height/H);
    const w=(W*scale)|0, h=(H*scale)|0, ox=(dst.width-w)>>1, oy=(dst.height-h)>>1;

    const out=ctx.createImageData(w,h);
    for(let y=0;y<h;y++){
      const sy=Math.min(H-1, (y/scale)|0), row=sy*W;
      for(let x=0;x<w;x++){
        const sx=Math.min(W-1, (x/scale)|0), i=row+sx, j=i*4;
        if (maskA && maskA[j+3] < 12){ out.data[(y*w+x)*4+3]=0; continue; }
        const r=src.data[j], g=src.data[j+1], b=src.data[j+2];
        let bi=0, bd=1e12; for(let c=0;c<centers.length;c++){
          const cr=centers[c][0],cg=centers[c][1],cb=centers[c][2];
          const dx=r-cr,dy=g-cg,dz=b-cb; const dd=dx*dx+dy*dy+dz*dz;
          if(dd<bd){bd=dd;bi=c;}
        }
        const o=(y*w+x)*4; out.data[o]=centers[bi][0]; out.data[o+1]=centers[bi][1]; out.data[o+2]=centers[bi][2]; out.data[o+3]=255;
      }
    }
    ctx.save(); ctx.translate(ox,oy); ctx.putImageData(out,0,0);

    // rough outline from mask
    if (S.opts.outline && maskA){
      ctx.globalCompositeOperation='source-over';
      ctx.strokeStyle='rgba(20,24,38,.95)';
      ctx.lineWidth=Math.max(1, Math.round(2*scale));
      ctx.lineCap='round'; ctx.lineJoin='round';
      const mw=W, mh=H;
      ctx.beginPath();
      for(let y=0;y<mh;y+=3){
        for(let x=0;x<mw;x+=3){
          const a=maskA[(y*mw+x)*4+3]; if(a<12) continue;
          const nx=Math.min(mw-1,x+3);
          const b=maskA[(y*mw+nx)*4+3]; if(b<12) continue;
          const X1=Math.round(x*scale), Y1=Math.round(y*scale);
          const X2=Math.round((x+3)*scale), Y2=Y1;
          ctx.moveTo(X1,Y1); ctx.lineTo(X2,Y2);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* -------------------- buttons wiring ----------------------- */
  function bindButtons(){
    // Top tabs (if present)
    tabs.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const name = (btn.dataset.tab||'upload').toLowerCase();
        activateTab(name);
      });
    });

    // “Start with a photo” / “Open the drawing tab” hero buttons also scroll to tabs
    $$('[data-scroll="#tabs"]').forEach(b=>{
      b.addEventListener('click', ()=>{
        $('#tabs')?.scrollIntoView({behavior:'smooth', block:'start'});
        // if hero button says open drawing tab, switch
        if ((b.textContent||'').toLowerCase().includes('drawing')) activateTab('draw');
        else activateTab('upload');
      });
    });

    if (btnHighlight) btnHighlight.onclick = ()=>{
      activateTab('draw');
      ensureDrawLayer();
      if (S.image) mirrorToDraw();
      panels.draw?.scrollIntoView({behavior:'smooth', block:'start'});
      btnPen?.click();
    };

    if (btnProcSel) btnProcSel.onclick = ()=>{
      S.hasMask = true;  // user drew something
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubject?.checked);
      processPreview();
      activateTab('upload');
      previewCard?.scrollIntoView({behavior:'smooth', block:'start'});
    };

    if (btnProcess) btnProcess.onclick = ()=>{
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubject?.checked);
      S.opts.addFills = !!(addFills?.checked ?? true);
      processPreview();
    };
  }

  /* --------------------- HEIC support ------------------------ */
  async function heicToJpeg(file){
    try{
      if (!window.heic2any){
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
          s.onload=res; s.onerror=rej; document.head.appendChild(s);
        });
      }
      const out = await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
      const blob = Array.isArray(out) ? out[0] : out;
      return new File([blob], (file.name||'image').replace(/\.\w+$/, '')+'.jpg', { type:'image/jpeg' });
    }catch{
      return file;
    }
  }

  /* ------------------------- init ---------------------------- */
  function init(){
    if (!panels.upload || !panels.draw) return; // page variant without tabs
    // start with upload tab active (matches your UI)
    activateTab('upload');
    ensurePreview();
    ensureDrawLayer();
    bindUpload();
    bindButtons();

    // keep preview canvas size in sync with host on resize
    window.addEventListener('resize', ()=>{
      if(!S.preview || !previewHost) return;
      const r = previewHost.getBoundingClientRect();
      const w = Math.max(320, Math.floor(r.width||480));
      const h = Math.max(180, Math.floor(w*9/16));
      S.preview.width=w; S.preview.height=h;
      S.preview.style.width='100%'; S.preview.style.height='100%';
      if (S.work) drawRawPreview();
    }, {passive:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();