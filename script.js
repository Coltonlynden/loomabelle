/* Loomabelle runtime — v39
   - Fix tiny preview on iPhone (force responsive height + DPR sizing)
   - Keep processed preview from flickering back to raw
   - Rebind Draw & Trace reliably (Pen default = dark, touch-friendly)
   - No visual changes to your HTML/CSS structure
*/
(() => {
  "use strict";
  if (window.__loom_v39) return; window.__loom_v39 = true;

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const DPR = () => window.devicePixelRatio || 1;

  /* panels & cards (found by headings; works with your markup) */
  const uploadPanel = $('.panel[data-panel="upload"]') || $$('.panel').find(p=>(p.textContent||'').toLowerCase().includes('upload a photo'));
  const drawPanel   = $('.panel[data-panel="draw"]')   || $$('.panel').find(p=>(p.textContent||'').toLowerCase().includes('draw'));
  const previewCard = $$('.card', uploadPanel).find(c=>(c.textContent||'').toLowerCase().includes('preview'));
  const previewHost = previewCard?.querySelector('.preview');
  const uploadCard  = $$('.card', uploadPanel).find(c=>(c.textContent||'').toLowerCase().includes('upload a photo'));
  const uploadZone  = uploadCard?.querySelector('.upload-zone');

  const outlineChk  = $$('.opts input[type="checkbox"]', uploadCard).find(i => (i.parentElement.textContent||'').toLowerCase().includes('edge outline')) || null;
  const addFillsChk = $$('.formats ~ label input[type="checkbox"], .formats input[type="checkbox"]', previewCard).find(Boolean) || null;
  const noSubjectCb = $$('.formats ~ label input[type="checkbox"], label input[type="checkbox"]', previewCard).find(i => (i.parentElement.textContent||'').toLowerCase().includes('no subject')) || null;

  const drawHost  = drawPanel?.querySelector('.canvas');
  const btnPen    = $$('.toolbar .btn', drawPanel).find(b=>(b.textContent||'').toLowerCase().includes('pen')) || null;
  const btnEraser = $$('.toolbar .btn', drawPanel).find(b=>(b.textContent||'').toLowerCase().includes('eraser')) || null;

  const tabBtns = $$('.tab-btn');
  function activateTab(name){
    tabBtns.forEach(b=>b.classList.toggle('active',(b.dataset.tab||'').toLowerCase()===name));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    (name==='draw'?drawPanel:uploadPanel)?.classList.add('active');
  }

  const S = {
    image:null, work:null,                     // source <canvas>
    preview:null, ro:null,                     // preview <canvas> + ResizeObserver
    drawBG:null, mask:null, hasMask:false,     // Draw & Trace layers
    mode:'raw',                                // 'raw' | 'proc'
    pen:{ erase:false, size:18, color:'#0a0f1d', down:false, lastX:0, lastY:0 },
    opts:{ outline:true, addFills:true, ignoreSubject:false }
  };

  /* ---------------- utils ---------------- */
  const makeCanvas=(w,h)=>{ const r=DPR(), c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*r)); c.height=Math.max(1,Math.round(h*r)); c.style.width=w+'px'; c.style.height=h+'px'; return c; };
  const ensureBtn=(root,label)=>{
    const lbl=(label||'').toLowerCase();
    // remove accidental duplicates
    const dup=$$('.btn',root).filter(b=>(b.textContent||'').trim().toLowerCase()===lbl);
    dup.slice(1).forEach(d=>d.remove());
    if(dup[0]) return dup[0];
    const b=document.createElement('button');
    b.className='btn soft'; b.textContent=label;
    (root.querySelector('.formats')||root).appendChild(b);
    return b;
  };

  /* ------------- preview (responsive height + DPR) ------------- */
  function setHostHeightFromWidth(el){
    // Choose a pleasant aspect; clamp for phones
    const w = Math.max(320, el.clientWidth || 0);
    const h = Math.max(220, Math.min(520, Math.round(Math.min(window.innerHeight*0.6, w * 0.66))));
    el.style.height = h + 'px';
    return { w, h };
  }

  function ensurePreview(){
    if (!previewHost || S.preview) return;
    const { h } = setHostHeightFromWidth(previewHost);
    const c = makeCanvas(Math.max(640, previewHost.clientWidth||640), h);
    c.style.width='100%'; c.style.height='100%';
    previewHost.innerHTML=''; previewHost.appendChild(c);
    S.preview=c;

    S.ro = new ResizeObserver(entries=>{
      const host = entries[0].target;
      const { h:hostH } = setHostHeightFromWidth(host);
      const r = DPR(), w=Math.max(1,Math.round(host.clientWidth*r)), h=Math.max(1,Math.round(hostH*r));
      if (S.preview.width!==w || S.preview.height!==h){
        S.preview.width=w; S.preview.height=h;
        if (S.mode==='proc') renderProcessed(); else renderRaw();
      }
    });
    S.ro.observe(previewHost);
  }

  function renderRaw(){
    if(!S.preview || !S.work) return;
    const g=S.preview.getContext('2d'); g.clearRect(0,0,S.preview.width,S.preview.height);
    const s=Math.min(S.preview.width/S.work.width, S.preview.height/S.work.height);
    const w=(S.work.width*s)|0, h=(S.work.height*s)|0, x=(S.preview.width-w)>>1, y=(S.preview.height-h)>>1;
    g.imageSmoothingEnabled=true; g.imageSmoothingQuality='high';
    g.drawImage(S.work,x,y,w,h);
    S.mode='raw';
  }

  /* ---------------- draw & trace ---------------- */
  function ensureDrawLayers(){
    if(!drawHost) return;
    drawHost.style.position='relative';
    drawHost.style.touchAction='none';
    if (S.drawBG && S.mask) return;
    const bg=makeCanvas(640,360); bg.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:.45;';
    const mk=makeCanvas(640,360); mk.style.cssText='position:relative;width:100%;height:100%;';
    drawHost.innerHTML=''; drawHost.appendChild(bg); drawHost.appendChild(mk);
    S.drawBG=bg; S.mask=mk;
    bindDrawing(mk);
  }
  function mirrorToDraw(){
    if(!S.work || !S.drawBG || !S.mask) return;
    S.drawBG.width=S.work.width; S.drawBG.height=S.work.height;
    S.mask.width=S.work.width;   S.mask.height=S.work.height;
    S.drawBG.getContext('2d').drawImage(S.work,0,0);
    S.mask.getContext('2d').clearRect(0,0,S.mask.width,S.mask.height);
    S.hasMask=false;
  }
  function bindDrawing(cnv){
    const ctx=cnv.getContext('2d',{willReadFrequently:true});
    const pt=(ev)=>{ const r=cnv.getBoundingClientRect(); const cx=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left; const cy=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top; return {x:cx*(cnv.width/r.width), y:cy*(cnv.height/r.height)}; };
    const start=(e)=>{ if(!S.work) return; const p=pt(e); S.pen.down=true; S.pen.lastX=p.x; S.pen.lastY=p.y; drawTo(p.x,p.y); e.preventDefault(); };
    const move =(e)=>{ if(!S.pen.down) return; const p=pt(e); drawTo(p.x,p.y); e.preventDefault(); };
    const end  =()=>{ S.pen.down=false; };
    function drawTo(x,y){
      ctx.globalCompositeOperation = S.pen.erase ? 'destination-out' : 'source-over';
      ctx.lineWidth=S.pen.size; ctx.lineCap='round'; ctx.strokeStyle=S.pen.color;
      ctx.beginPath(); ctx.moveTo(S.pen.lastX,S.pen.lastY); ctx.lineTo(x,y); ctx.stroke();
      S.pen.lastX=x; S.pen.lastY=y; S.hasMask=true;
    }
    cnv.addEventListener('mousedown',start); window.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
    cnv.addEventListener('touchstart',start,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',end);

    // default to Pen (dark)
    if (btnPen)   btnPen.onclick   = ()=>{ S.pen.erase=false; S.pen.color='#0a0f1d'; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); };
    if (btnEraser)btnEraser.onclick= ()=>{ S.pen.erase=true;  btnEraser.classList.add('active'); btnPen?.classList.remove('active'); };
    btnPen?.click();
  }

  /* ---------------- quick processor (subject-biased kmeans) ---------------- */
  function renderProcessed(){
    if(!S.work||!S.preview) return;
    const W=S.work.width,H=S.work.height;
    const src=S.work.getContext('2d').getImageData(0,0,W,H);
    const maskData = (S.hasMask ? S.mask.getContext('2d').getImageData(0,0,W,H).data : null);

    const k=6, step=Math.max(1, Math.floor(Math.sqrt((W*H)/200000)));
    const pts=[];
    for(let y=0;y<H;y+=step){
      for(let x=0;x<W;x+=step){
        const i=(y*W+x)*4;
        if(maskData && maskData[i+3]<12 && !S.opts.ignoreSubject) continue;
        pts.push([src.data[i],src.data[i+1],src.data[i+2]]);
      }
    }
    // init centers
    const centers=[];
    if(pts.length===0){ centers.push([0,0,0]); }
    else{
      centers.push(pts[Math.floor(Math.random()*pts.length)]);
      while(centers.length<Math.min(k,pts.length)){
        let best=null,bd=-1;
        for(const p of pts){
          let d=1e12; for(const c of centers){ const dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2]; const dd=dx*dx+dy*dy+dz*dz; if(dd<d) d=dd; }
          if(d>bd){bd=d;best=p;}
        }
        centers.push(best.slice());
      }
      for(let it=0;it<4;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0,bd=1e12;
          for(let i=0;i<centers.length;i++){
            const c=centers[i],dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2]; const dd=dx*dx+dy*dy+dz*dz; if(dd<bd){bd=dd;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
      }
    }

    const g=S.preview.getContext('2d'); g.clearRect(0,0,S.preview.width,S.preview.height);
    const s=Math.min(S.preview.width/W, S.preview.height/H);
    const w=(W*s)|0, h=(H*s)|0, ox=(S.preview.width-w)>>1, oy=(S.preview.height-h)>>1;
    const out=g.createImageData(w,h);
    for(let y=0;y<h;y++){
      const sy=Math.min(H-1,(y/s)|0), row=sy*W;
      for(let x=0;x<w;x++){
        const sx=Math.min(W-1,(x/s)|0), base=(row+sx)*4;
        if(maskData && !S.opts.ignoreSubject && maskData[base+3]<12){ out.data[(y*w+x)*4+3]=0; continue; }
        const r=src.data[base], gg=src.data[base+1], b=src.data[base+2];
        let bi=0,bd=1e12;
        for(let c=0;c<centers.length;c++){
          const cr=centers[c][0],cg=centers[c][1],cb=centers[c][2];
          const dx=r-cr,dy=gg-cg,dz=b-cb; const dd=dx*dx+dy*dy+dz*dz; if(dd<bd){bd=dd;bi=c;}
        }
        const o=(y*w+x)*4; out.data[o]=centers[bi][0]; out.data[o+1]=centers[bi][1]; out.data[o+2]=centers[bi][2]; out.data[o+3]=255;
      }
    }
    g.save(); g.translate(ox,oy); g.putImageData(out,0,0);

    if (S.opts.outline && (S.hasMask || !S.opts.ignoreSubject) && maskData){
      g.strokeStyle='#0a0f1d'; g.lineWidth=Math.max(1,Math.round(2*s)); g.lineJoin='round'; g.lineCap='round';
      g.beginPath();
      for(let y=1;y<H-1;y+=2){
        for(let x=1;x<W-1;x+=2){
          const a = maskData[(y*W+x)*4+3]>12, b = maskData[(y*W+x+1)*4+3]>12;
          if(a && !b){ const X=Math.round((x-0.5)*s), Y=Math.round(y*s); g.moveTo(X,Y); g.lineTo(X+Math.round(s),Y); }
        }
      }
      g.stroke();
    }
    g.restore();
    S.mode='proc';
  }

  /* ---------------- upload (incl. HEIC) ---------------- */
  async function heicToJpeg(file){
    try{
      if(!window.heic2any){
        await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      }
      const out=await window.heic2any({ blob:file, toType:'image/jpeg', quality:0.92 });
      const blob=Array.isArray(out)?out[0]:out;
      return new File([blob], (file.name||'image').replace(/\.\w+$/,'')+'.jpg', {type:'image/jpeg'});
    }catch{ return file; }
  }

  function bindUpload(){
    if(!uploadZone) return;
    let input = uploadZone.querySelector('input[type=file]');
    if(!input){ input=document.createElement('input'); input.type='file'; input.accept='image/*'; uploadZone.appendChild(input); }
    else input.removeAttribute('disabled');

    uploadZone.addEventListener('click', e=>{ if(e.target.tagName!=='INPUT') input.click(); });

    input.addEventListener('change', async e=>{
      const f=e.target.files?.[0]; if(!f) return;
      const file=(/heic|heif/i.test(f.type)||/\.(heic|heif)$/i.test(f.name))? await heicToJpeg(f): f;
      const url=URL.createObjectURL(file); const img=new Image();
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const maxSide=1280; let W=img.naturalWidth,H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const sc=maxSide/Math.max(W,H); W=(W*sc)|0; H=(H*sc)|0; }
        const work=makeCanvas(W,H); work.getContext('2d').drawImage(img,0,0,W,H);
        S.image=img; S.work=work;

        // show preview region now
        previewCard?.classList.remove('hidden');
        ensurePreview(); setHostHeightFromWidth(previewHost);
        renderRaw();
        ensureDrawLayers(); mirrorToDraw();

        // enable actions
        ensureButtons();
      };
      img.onerror=()=>URL.revokeObjectURL(url);
      img.src=url;
    });
  }

  /* ---------------- buttons ---------------- */
  function ensureButtons(){
    const pb = ensureBtn(previewCard,'Process Photo');
    const hb = ensureBtn(previewCard,'Highlight Subject');
    const ps = ensureBtn(drawPanel,   'Process Selection');

    pb.onclick = ()=>{
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.addFills = !!(addFillsChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubjectCb?.checked);
      renderProcessed();
      previewCard?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    hb.onclick = ()=>{
      activateTab('draw'); ensureDrawLayers(); mirrorToDraw(); btnPen?.click();
      drawPanel?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    ps.onclick = ()=>{
      S.hasMask = true;
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubjectCb?.checked);
      renderProcessed();
      activateTab('upload');
      previewCard?.scrollIntoView({behavior:'smooth',block:'start'});
    };
  }

  /* ---------------- tabs & init ---------------- */
  function bindTabs(){
    tabBtns.forEach(b=>{
      b.addEventListener('click',()=>{
        const name=(b.dataset.tab||'upload').toLowerCase();
        activateTab(name);
        if(name==='draw'){ ensureDrawLayers(); btnPen?.click(); }
      });
    });
    $$('[data-scroll="#tabs"]').forEach(b=>{
      b.addEventListener('click',()=>{
        $('#tabs')?.scrollIntoView({behavior:'smooth'});
        const isDraw=(b.textContent||'').toLowerCase().includes('drawing');
        activateTab(isDraw?'draw':'upload');
        if(isDraw){ ensureDrawLayers(); btnPen?.click(); }
      });
    });
  }

  function init(){
    if(!uploadPanel || !drawPanel || !previewCard) return;
    previewCard.classList.add('hidden');       // hide until an image exists
    bindTabs();
    bindUpload();
    ensureDrawLayers();                        // pre-create layers so Draw tab always works
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();