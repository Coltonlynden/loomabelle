/* Loomabelle runtime — v37
   Fixes:
   - Preview card stays hidden until a photo is chosen.
   - No duplicate "Process Photo / Highlight Subject" buttons.
   - Single-run guard so the script can’t re-init on reloads.
   (v36 features kept: dark pen, draw mask, HEIC -> JPEG, fast preview.)
*/
(() => {
  "use strict";
  if (window.__loom_v37) return; // single-run guard
  window.__loom_v37 = true;

  /* ---------- helpers ---------- */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const byText=(root,sel,text)=> $$(sel,root).find(n=>(n.textContent||"").toLowerCase().includes(text));
  const DPR = () => window.devicePixelRatio || 1;

  /* ---------- find panels/cards already in your HTML ---------- */
  const uploadPanel = $('.panel[data-panel="upload"]') || byText(document,'.panel','upload a photo');
  const drawPanel   = $('.panel[data-panel="draw"]')   || byText(document,'.panel','draw & trace');

  const previewCard = byText(uploadPanel,'.card','preview') || uploadPanel;
  const previewHost = previewCard?.querySelector('.preview');

  const uploadCard  = byText(uploadPanel,'.card','upload a photo') || uploadPanel;
  const uploadZone  = uploadCard?.querySelector('.upload-zone');
  let   uploadInput = uploadZone?.querySelector('input[type="file"]');

  const outlineChk  = byText(uploadCard,'label','edge outline')?.querySelector('input[type="checkbox"]') || null;
  const addFillsChk = byText(previewCard,'label','add fills')?.querySelector('input[type="checkbox"]') || null;
  const noSubjectCb = byText(previewCard,'label','no subject')?.querySelector('input[type="checkbox"]') || null;

  const drawHost    = drawPanel?.querySelector('.canvas');
  const btnPen      = byText(drawPanel,'button','pen');
  const btnEraser   = byText(drawPanel,'button','eraser');

  /* ---------- state ---------- */
  const S = {
    work:null, image:null,
    preview:null, drawBG:null, mask:null,
    hasMask:false,
    pen:{ erase:false, size:18, color:'#0a0f1d', down:false, lastX:0, lastY:0 },
    opts:{ outline:true, addFills:true, ignoreSubject:false }
  };

  /* ---------- tabs ---------- */
  const tabBtns = $$('.tab-btn');
  function activateTab(name){
    tabBtns.forEach(b=>b.classList.toggle('active',(b.dataset.tab||'').toLowerCase()===name));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    (name==='draw'?drawPanel:uploadPanel)?.classList.add('active');
  }

  /* ---------- canvases ---------- */
  function makeCanvas(w,h){
    const r=DPR(), c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*r));
    c.height=Math.max(1,Math.round(h*r));
    c.style.width=w+'px'; c.style.height=h+'px';
    return c;
  }
  function ensurePreview(){
    if (!previewHost || S.preview) return;
    const rect=previewHost.getBoundingClientRect();
    const w=Math.max(320,Math.floor(rect.width||480));
    const h=Math.max(180,Math.floor(w*9/16));
    const c=makeCanvas(w,h);
    c.style.width='100%'; c.style.height='100%';
    previewHost.innerHTML=''; previewHost.appendChild(c);
    S.preview=c;
  }
  function drawRawPreview(){
    if(!S.preview||!S.work) return;
    const c=S.preview, g=c.getContext('2d');
    g.clearRect(0,0,c.width,c.height);
    const s=Math.min(c.width/S.work.width, c.height/S.work.height);
    const w=(S.work.width*s)|0, h=(S.work.height*s)|0;
    const x=(c.width-w)>>1, y=(c.height-h)>>1;
    g.drawImage(S.work,x,y,w,h);
  }
  function ensureDrawLayers(){
    if(!drawHost || (S.drawBG && S.mask)) return;
    drawHost.style.position='relative';
    drawHost.style.touchAction='none';
    const bg=makeCanvas(640,360); bg.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:.45;';
    const mk=makeCanvas(640,360); mk.style.cssText='position:relative;width:100%;height:100%;';
    drawHost.innerHTML=''; drawHost.appendChild(bg); drawHost.appendChild(mk);
    S.drawBG=bg; S.mask=mk;
    bindDrawing(mk);
  }
  function mirrorToDraw(){
    if(!S.work||!S.drawBG||!S.mask) return;
    S.drawBG.width=S.work.width; S.drawBG.height=S.work.height;
    S.mask.width=S.work.width;   S.mask.height=S.work.height;
    S.drawBG.getContext('2d').drawImage(S.work,0,0);
    S.mask.getContext('2d').clearRect(0,0,S.mask.width,S.mask.height);
    S.hasMask=false;
  }

  /* ---------- drawing ---------- */
  function bindDrawing(cnv){
    const ctx=cnv.getContext('2d',{willReadFrequently:true});
    const pt=(ev)=>{ const r=cnv.getBoundingClientRect(); const cx=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left; const cy=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top; return {x:cx*(cnv.width/r.width), y:cy*(cnv.height/r.height)}; };
    const start=(e)=>{ if(!S.work) return; const p=pt(e); S.pen.down=true; S.pen.lastX=p.x; S.pen.lastY=p.y; drawTo(p.x,p.y); e.preventDefault(); };
    const move =(e)=>{ if(!S.pen.down) return; const p=pt(e); drawTo(p.x,p.y); e.preventDefault(); };
    const end  =()=>{ S.pen.down=false; };
    function drawTo(x,y){
      ctx.globalCompositeOperation = S.pen.erase ? 'destination-out' : 'source-over';
      ctx.lineWidth=S.pen.size; ctx.lineCap='round';
      ctx.strokeStyle=S.pen.color; ctx.beginPath();
      ctx.moveTo(S.pen.lastX,S.pen.lastY); ctx.lineTo(x,y); ctx.stroke();
      S.pen.lastX=x; S.pen.lastY=y; S.hasMask=true;
    }
    cnv.addEventListener('mousedown',start); window.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
    cnv.addEventListener('touchstart',start,{passive:false}); window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',end);

    if (btnPen)   btnPen.onclick   = ()=>{ S.pen.erase=false; btnPen.classList.add('active'); btnEraser?.classList.remove('active'); };
    if (btnEraser)btnEraser.onclick= ()=>{ S.pen.erase=true;  btnEraser.classList.add('active'); btnPen?.classList.remove('active'); };
  }

  /* ---------- upload ---------- */
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
    if(!uploadInput){
      uploadInput=document.createElement('input');
      uploadInput.type='file'; uploadInput.accept='image/*';
      uploadZone.appendChild(uploadInput);
    } else uploadInput.removeAttribute('disabled');

    uploadZone.addEventListener('click', e=>{ if(e.target.tagName!=='INPUT') uploadInput.click(); });

    uploadInput.addEventListener('change', async e=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      let file=f; if(/\.(heic|heif)$/i.test(f.name)||/heic|heif/i.test(f.type)) file=await heicToJpeg(f);
      const url=URL.createObjectURL(file); const img=new Image();
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const maxSide=1280; let W=img.naturalWidth,H=img.naturalHeight;
        if(Math.max(W,H)>maxSide){ const s=maxSide/Math.max(W,H); W=(W*s)|0; H=(H*s)|0; }
        const work=makeCanvas(W,H); work.getContext('2d').drawImage(img,0,0,W,H);
        S.image=img; S.work=work;

        // reveal preview card (was hidden initially)
        previewCard?.classList.remove('hidden');

        ensurePreview(); drawRawPreview();
        ensureDrawLayers(); mirrorToDraw();
        // enable buttons
        processBtn().removeAttribute('disabled');
        highlightBtn().removeAttribute('disabled');
        processSelBtn().removeAttribute('disabled');
        btnPen && btnPen.click();
      };
      img.onerror=()=>URL.revokeObjectURL(url);
      img.src=url;
    });
  }

  /* ---------- quick quantized preview (subject-aware) ---------- */
  function processPreview(){
    if(!S.work) return;
    const W=S.work.width,H=S.work.height;
    const src=S.work.getContext('2d').getImageData(0,0,W,H);
    const mask = (S.hasMask && !S.opts.ignoreSubject) ? S.mask.getContext('2d').getImageData(0,0,W,H).data : null;

    // sample
    const k=6, step=Math.max(1, Math.floor(Math.sqrt((W*H)/200000)));
    const pts=[];
    for(let y=0;y<H;y+=step){
      const row=y*W;
      for(let x=0;x<W;x+=step){
        const i=row+x, j=i*4;
        if(mask && mask[j+3]<12) continue;
        pts.push([src.data[j],src.data[j+1],src.data[j+2]]);
      }
    }
    const centers=[];
    if(pts.length===0) centers.push([0,0,0]);
    else{
      centers.push(pts[Math.floor(Math.random()*pts.length)]);
      while(centers.length<k && centers.length<pts.length){
        let best=null,bd=-1;
        for(const p of pts){
          let d=1e9; for(const c of centers){ const dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2]; const dd=dx*dx+dy*dy+dz*dz; if(dd<d) d=dd; }
          if(d>bd){ bd=d; best=p; }
        }
        centers.push(best.slice());
      }
      for(let it=0;it<4;it++){
        const sum=Array.from({length:centers.length},()=>[0,0,0,0]);
        for(const p of pts){
          let bi=0,bd=1e12;
          for(let i=0;i<centers.length;i++){
            const c=centers[i],dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2]; const dd=dx*dx+dy*dy+dz*dz;
            if(dd<bd){bd=dd;bi=i;}
          }
          const s=sum[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++;
        }
        for(let i=0;i<centers.length;i++){ const s=sum[i]; if(s[3]) centers[i]=[(s[0]/s[3])|0,(s[1]/s[3])|0,(s[2]/s[3])|0]; }
      }
    }

    ensurePreview();
    const dst=S.preview, g=dst.getContext('2d');
    g.clearRect(0,0,dst.width,dst.height);
    const s=Math.min(dst.width/W, dst.height/H);
    const w=(W*s)|0, h=(H*s)|0, ox=(dst.width-w)>>1, oy=(dst.height-h)>>1;
    const out=g.createImageData(w,h);

    for(let y=0;y<h;y++){
      const sy=Math.min(H-1,(y/s)|0), row=sy*W;
      for(let x=0;x<w;x++){
        const sx=Math.min(W-1,(x/s)|0), i=row+sx, j=i*4;
        if(mask && mask[j+3]<12){ out.data[(y*w+x)*4+3]=0; continue; }
        const r=src.data[j], gg=src.data[j+1], b=src.data[j+2];
        let bi=0,bd=1e12;
        for(let c=0;c<centers.length;c++){
          const cr=centers[c][0],cg=centers[c][1],cb=centers[c][2];
          const dx=r-cr,dy=gg-cg,dz=b-cb; const dd=dx*dx+dy*dy+dz*dz;
          if(dd<bd){bd=dd;bi=c;}
        }
        const o=(y*w+x)*4; out.data[o]=centers[bi][0]; out.data[o+1]=centers[bi][1]; out.data[o+2]=centers[bi][2]; out.data[o+3]=255;
      }
    }
    g.save(); g.translate(ox,oy); g.putImageData(out,0,0);

    if (S.opts.outline && mask){
      g.globalCompositeOperation='source-over';
      g.strokeStyle='#0a0f1d'; g.lineWidth=Math.max(1,Math.round(2*s)); g.lineCap='round'; g.lineJoin='round';
      const mw=W,mh=H;
      g.beginPath();
      for(let x=0;x<mw;x+=3){
        for(let y=0;y<mh-3;y+=3){
          const a=mask[(y*mw+x)*4+3], b=mask[((y+3)*mw+x)*4+3];
          if(a>12 && b<12){ const X=Math.round(x*s), Y=Math.round(y*s); g.moveTo(X,Y); g.lineTo(X,Y+Math.round(3*s)); }
        }
      }
      g.stroke();
    }
    g.restore();
  }

  /* ---------- buttons (no duplicates) ---------- */
  function removeDupButtons(root, label){
    const all = $$('.btn', root).filter(b => (b.textContent||'').trim().toLowerCase()===label.toLowerCase());
    if (all.length>1){ all.slice(1).forEach(b=>b.remove()); }
    return all[0] || null;
  }
  function ensureButton(root, label){
    // if it already exists, keep ONE
    const existing = removeDupButtons(root, label);
    if (existing){ existing.dataset.lb = '1'; return existing; }
    // create one
    const b=document.createElement('button');
    b.className='btn soft';
    b.textContent=label;
    b.dataset.lb='1';
    (root.querySelector('.formats') || root).appendChild(b);
    return b;
  }
  const processBtn    = ()=> ensureButton(previewCard,'Process Photo');
  const highlightBtn  = ()=> ensureButton(previewCard,'Highlight Subject');
  const processSelBtn = ()=> ensureButton(drawPanel   ,'Process Selection');

  function bindButtons(){
    // Tabs
    tabBtns.forEach(b=>b.addEventListener('click',()=>activateTab((b.dataset.tab||'upload').toLowerCase())));
    $$('[data-scroll="#tabs"]').forEach(b=>{
      b.addEventListener('click',()=>{ $('#tabs')?.scrollIntoView({behavior:'smooth'}); if((b.textContent||'').toLowerCase().includes('drawing')) activateTab('draw'); else activateTab('upload'); });
    });

    // Actions
    processBtn().onclick = ()=>{
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.addFills = !!(addFillsChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubjectCb?.checked);
      processPreview();
    };
    highlightBtn().onclick = ()=>{
      activateTab('draw');
      ensureDrawLayers();
      if (S.work) mirrorToDraw();
      btnPen?.click();
      drawPanel?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    processSelBtn().onclick = ()=>{
      S.hasMask = true;
      S.opts.outline = !!(outlineChk?.checked ?? true);
      S.opts.ignoreSubject = !!(noSubjectCb?.checked);
      processPreview();
      activateTab('upload');
      previewCard?.scrollIntoView({behavior:'smooth',block:'start'});
    };
  }

  /* ---------- swatches ---------- */
  function populateSwatches(){
    const host = drawPanel?.querySelector('.swatches');
    if (!host) return;
    if (host.dataset.lb === '1') return; // already populated
    host.dataset.lb = '1';
    const colors = ['#f87171','#f472b6','#c4b5fd','#a78bfa','#93c5fd','#60a5fa','#38bdf8','#22d3ee','#34d399','#a3e635','#fde047','#f59e0b','#fb7185','#f97316','#84cc16'];
    host.innerHTML='';
    colors.forEach(hex=>{
      const sw=document.createElement('button');
      sw.className='btn soft'; sw.style.borderRadius='999px';
      sw.style.width='32px'; sw.style.height='32px'; sw.style.padding='0';
      sw.style.boxShadow='inset 0 0 0 2px rgba(0,0,0,.08)';
      sw.style.background=hex; sw.title=hex;
      sw.onclick=()=>{ /* keep outline dark for now */ };
      host.appendChild(sw);
    });
  }

  /* ---------- init ---------- */
  function init(){
    if(!uploadPanel || !drawPanel) return;

    // Hide the preview card until a photo is uploaded
    previewCard?.classList.add('hidden');

    activateTab('upload');
    ensureDrawLayers(); // ready so "Highlight Subject" can swap immediately
    bindUpload();
    bindButtons();
    populateSwatches();

    // keep preview canvas sized with card
    window.addEventListener('resize',()=>{
      if(!S.preview||!previewHost) return;
      const r=previewHost.getBoundingClientRect();
      const w=Math.max(320,Math.floor(r.width||480));
      const h=Math.max(180,Math.floor(w*9/16));
      S.preview.width=w; S.preview.height=h;
      if(S.work) drawRawPreview();
    }, {passive:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();