/* Loomabelle — script.js v34
   - Worker-based processing (no main-thread stalls, iPhone safe).
   - Subject-first pipeline: clean outline + optional hatch fills, background removed.
   - Preview hidden until upload; export buttons only after processing.
   - Keeps existing DOM & look. Only behavior changed.
*/
(function(){
  'use strict';
  const READY = f => document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',f,{once:true})
    : f();
  const $  = (s,r)=> (r||document).querySelector(s);
  const $$ = (s,r)=> Array.from((r||document).querySelectorAll(s));
  const DPR = ()=> window.devicePixelRatio||1;

  // --------- elements
  READY(() => {
    const year = $('#year'); if (year) year.textContent = new Date().getFullYear();

    const tabs = $$('.tabs .tab-btn');
    const panels = $$('.panel');
    const activate = t=>{
      tabs.forEach(b=>b.classList.toggle('active', b.dataset.tab===t));
      panels.forEach(p=>p.classList.toggle('active', p.dataset.panel===t));
    };
    tabs.forEach(b=> b.addEventListener('click', ()=>activate(b.dataset.tab)));
    $$('[data-scroll="#tabs"]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        $('#tabs')?.scrollIntoView({behavior:'smooth'});
        const t = (btn.textContent||'').toLowerCase();
        activate(t.includes('drawing')?'draw':'upload');
      });
    });

    // upload panel refs
    const upPanel  = $('.panel[data-panel="upload"]');
    const drawPanel= $('.panel[data-panel="draw"]');

    const upZone   = upPanel.querySelector('.upload-zone');
    const fileIn   = upZone.querySelector('input[type=file]');
    const prevCard = upPanel.querySelector('.card.rose');
    const prevHost = upPanel.querySelector('.preview');
    const fmtBar   = upPanel.querySelector('.formats');

    // draw panel refs
    const drawHost = drawPanel.querySelector('.canvas');
    const toolsBar = drawPanel.querySelector('.toolbar');

    // enable inputs
    fileIn.removeAttribute('disabled');
    fileIn.accept = 'image/*,.png,.jpg,.jpeg,.gif,.heic,.heif';

    // hide preview + exports until used
    prevCard.classList.add('hidden');
    fmtBar.style.display = 'none';

    // canvases
    const prevCanvas = mountCanvas(prevHost);
    const drawCanvas = mountCanvas(drawHost);
    const pctx = prevCanvas.getContext('2d',{willReadFrequently:true});
    const dctx = drawCanvas.getContext('2d',{willReadFrequently:true});
    dctx.lineCap='round'; dctx.lineJoin='round';

    // size logic
    function fitCanvas(canvas, host){
      const s=DPR();
      const w=host.clientWidth||640;
      const h=Math.max(220, host.clientHeight||Math.round(w*9/16));
      canvas.style.width='100%';
      canvas.style.height='100%';
      canvas.width=Math.round(w*s);
      canvas.height=Math.round(h*s);
      const c=canvas.getContext('2d');
      c.setTransform(s,0,0,s,0,0);
      c.clearRect(0,0,canvas.width,canvas.height);
    }
    const resize=()=>{ fitCanvas(prevCanvas,prevHost); fitCanvas(drawCanvas,drawHost); if(STATE.preview) drawPreview(STATE.preview); };
    window.addEventListener('resize', ()=>requestAnimationFrame(resize));
    resize();

    // progress
    const barWrap=document.createElement('div');
    barWrap.style.cssText='position:absolute;left:12px;right:12px;top:12px;height:8px;border-radius:999px;background:rgba(0,0,0,.08);display:none';
    const bar=document.createElement('div'); bar.style.cssText='height:100%;width:0%;background:#111827';
    barWrap.appendChild(bar); prevCard.appendChild(barWrap);
    const setProgress=p=>{ if(prevCard.classList.contains('hidden')) return; barWrap.style.display='block'; bar.style.width=(p|0)+'%'; if(p>=100) setTimeout(()=>barWrap.style.display='none',400); };

    // floating preview controls
    const tools=document.createElement('div');
    tools.style.cssText='position:absolute;top:12px;right:12px;display:flex;gap:10px;flex-wrap:wrap;visibility:hidden';
    const btn = t=>{ const el=document.createElement('button'); el.className='btn soft'; el.textContent=t; return el; };
    const btnProcess = btn('Process Photo');
    const btnHi      = btn('Highlight Subject');
    const lblNo      = labelToggle('No subject');      // handwriting / logos
    const lblFill    = labelToggle('Add fills');       // hatch fill inside subject
    tools.append(btnProcess, btnHi, lblNo, lblFill);
    prevCard.appendChild(tools);

    // export hooks
    const dstBtn = fmtBar.querySelector('button:nth-child(1)');
    const pesBtn = fmtBar.querySelector('button:nth-child(2)');
    const expBtn = fmtBar.querySelector('button:nth-child(3)');
    const jefBtn = fmtBar.querySelector('button:nth-child(4)');

    // state
    const STATE = {
      // for preview compositing & subject box mapping
      imgFit: null,          // {ox, oy, scale, w, h}
      preview: null,         // {imgBitmap, w, h} for drawing base
      subject: { enabled:false, rect:null, no:false, fill:false },
      result: null           // {ops, dstU8, expU8}
    };

    // worker
    const worker = new Worker('emb-worker.js', {type:'module'});

    worker.addEventListener('message', (e)=>{
      const {type, data} = e.data || {};
      if(type==='progress'){ setProgress(data||0); return; }
      if(type==='result'){
        STATE.result = data;
        drawPreview(STATE.preview, data.paths);
        hookDownloads(data);
        fmtBar.style.display='flex';
        setProgress(100);
        if(STATE.subject.enabled){ toggleHighlight(false); }
      }
      if(type==='error'){ setProgress(0); alert(data||'Processing failed'); }
    });

    // ----------------- UI wiring

    upZone.addEventListener('click', e=>{
      if(e.target.closest('input,button,a,label')) return;
      fileIn.click();
    });
    upZone.addEventListener('dragover', e=>e.preventDefault());
    upZone.addEventListener('drop', async e=>{
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if(f) await loadFile(f);
    });
    fileIn.addEventListener('change', async ()=>{
      const f=fileIn.files?.[0];
      if(f) await loadFile(f);
    });

    btnProcess.addEventListener('click', ()=>processPhoto());
    btnHi.addEventListener('click', ()=>toggleHighlight());

    // subject rect drawing + scroll lock
    let drag=false, start=[0,0];
    prevCanvas.addEventListener('pointerdown', e=>{
      if(!STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect();
      start=[e.clientX-r.left, e.clientY-r.top];
      STATE.subject.rect={x:start[0],y:start[1],w:0,h:0};
      drag=true; prevCanvas.setPointerCapture(e.pointerId); e.preventDefault();
      drawSubjectBox();
    });
    prevCanvas.addEventListener('pointermove', e=>{
      if(!drag || !STATE.subject.enabled) return;
      const r=prevCanvas.getBoundingClientRect();
      const x=e.clientX-r.left, y=e.clientY-r.top;
      STATE.subject.rect = { x:Math.min(start[0],x), y:Math.min(start[1],y),
                             w:Math.abs(x-start[0]), h:Math.abs(y-start[1]) };
      drawSubjectBox();
    });
    const stop=()=>{ drag=false; try{prevCanvas.releasePointerCapture?.();}catch(_){}}; 
    prevCanvas.addEventListener('pointerup', stop);
    prevCanvas.addEventListener('pointercancel', stop);
    lblNo.input.addEventListener('change', ()=> STATE.subject.no = lblNo.input.checked );
    lblFill.input.addEventListener('change', ()=> STATE.subject.fill = lblFill.input.checked );

    // draw tools (unchanged look; now functional)
    if(toolsBar){
      const buttons = Array.from(toolsBar.children);
      buttons.forEach(b=> b.removeAttribute('disabled'));
      let tool='pen';
      const [pen,eraser]=[buttons[0],buttons[1]];
      const [fillB] = [buttons[2]];
      pen.classList.add('active');
      pen.addEventListener('click', ()=>{ tool='pen'; pen.classList.add('active'); eraser.classList.remove('active'); });
      eraser.addEventListener('click', ()=>{ tool='eraser'; eraser.classList.add('active'); pen.classList.remove('active'); });

      drawCanvas.style.touchAction='none';
      let drawing=false, pid=null;
      drawCanvas.addEventListener('pointerdown', e=>{
        const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
        drawCanvas.setPointerCapture(e.pointerId); pid=e.pointerId; e.preventDefault();
        dctx.lineWidth=3; dctx.strokeStyle='#111827';
        if(tool==='eraser'){ dctx.globalCompositeOperation='destination-out'; }
        dctx.beginPath(); dctx.moveTo(x,y); drawing=true;
      });
      drawCanvas.addEventListener('pointermove', e=>{
        if(!drawing||e.pointerId!==pid) return; e.preventDefault();
        const r=drawCanvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
        dctx.lineTo(x,y); dctx.stroke();
      });
      const endDraw=e=>{ if(e.pointerId!==pid) return; drawing=false; pid=null; dctx.globalCompositeOperation='source-over'; try{drawCanvas.releasePointerCapture(e.pointerId);}catch(_){}}; 
      drawCanvas.addEventListener('pointerup',endDraw);
      drawCanvas.addEventListener('pointercancel',endDraw);

      // process drawing button
      const procD = document.createElement('button'); procD.className='btn soft'; procD.textContent='Process Drawing';
      toolsBar.appendChild(procD);
      procD.addEventListener('click', ()=>processDrawing());
    }

    // --------------- helpers

    function mountCanvas(host){
      const c=document.createElement('canvas');
      c.style.display='block';
      c.style.width='100%';
      c.style.height='100%';
      host.appendChild(c);
      return c;
    }
    function labelToggle(text){
      const lbl=document.createElement('label');
      const input=document.createElement('input');
      input.type='checkbox';
      lbl.append(input, document.createTextNode(' '+text));
      lbl.style.cssText='display:inline-flex;align-items:center;gap:6px';
      lbl.input = input;
      return lbl;
    }
    function toggleHighlight(forceOff){
      const on = forceOff ? false : !STATE.subject.enabled;
      STATE.subject.enabled = on;
      btnHi.classList.toggle('active', on);
      if(on){ lockScroll(); } else { unlockScroll(); }
      drawSubjectBox();
    }
    let lastScroll=0;
    function lockScroll(){
      lastScroll = window.scrollY||0;
      document.body.style.position='fixed';
      document.body.style.top=`-${lastScroll}px`;
      document.body.style.left='0'; document.body.style.right='0'; document.body.style.width='100%';
      document.body.classList.add('loom-lock');
      prevCanvas.addEventListener('touchmove', prevent, {passive:false});
      prevCanvas.addEventListener('wheel', prevent, {passive:false});
    }
    function unlockScroll(){
      document.body.style.position='';
      document.body.style.top='';
      document.body.style.left=''; document.body.style.right=''; document.body.style.width='';
      document.body.classList.remove('loom-lock');
      window.scrollTo(0,lastScroll||0);
      prevCanvas.removeEventListener('touchmove', prevent);
      prevCanvas.removeEventListener('wheel', prevent);
    }
    function prevent(e){ e.preventDefault(); }

    // -------- preview & subject box
    function drawPreview(pre, paths){
      fitCanvas(prevCanvas, prevHost);
      const ctx=pctx; const s=DPR();
      ctx.setTransform(s,0,0,s,0,0);
      ctx.clearRect(0,0,prevCanvas.width,prevCanvas.height);

      // draw base image (preview image)
      if(pre?.img){
        const Wp=prevCanvas.width/s, Hp=prevCanvas.height/s;
        const scale = Math.min(Wp/pre.w, Hp/pre.h);
        const w=pre.w*scale, h=pre.h*scale;
        const ox=(Wp-w)/2, oy=(Hp-h)/2;
        STATE.imgFit={ox,oy,scale,w:pre.w,h:pre.h};
        ctx.drawImage(pre.img, ox,oy, w,h);
        ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.strokeRect(0.5,0.5,Wp-1,Hp-1);
      }
      // stitches/paths
      if(paths && paths.length){
        ctx.save(); ctx.strokeStyle='#111827'; ctx.lineWidth=1.6;
        ctx.beginPath();
        for(const p of paths){ if(p.move) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
        ctx.stroke(); ctx.restore();
      }
    }
    function drawSubjectBox(){
      drawPreview(STATE.preview, STATE.result?.paths);
      if(STATE.subject.enabled && STATE.subject.rect){
        const r=STATE.subject.rect, ctx=pctx; const s=DPR(); ctx.setTransform(s,0,0,s,0,0);
        ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(20,20,20,.95)'; ctx.lineWidth=1.2;
        ctx.strokeRect(r.x,r.y,r.w,r.h); ctx.restore();
      }
    }

    // -------- loading

    async function loadFile(file){
      // validate
      const ok=/\.(jpe?g|png|gif|heic|heif)$/i.test(file.name||'x.jpg');
      if(!ok){ alert('Please choose a JPG, PNG, GIF or HEIC.'); return; }

      // show preview card + tools
      prevCard.classList.remove('hidden');
      tools.style.visibility='visible';
      fmtBar.style.display='none';
      setProgress(1);

      // smart downscale for working & preview
      const blob = file;
      const bmp = await createImageBitmap(blob);
      // cap to ~1.3MP for processing
      const scale = Math.min(1, Math.sqrt(1_300_000/(bmp.width*bmp.height)) || 1);
      const rw = Math.max(1, Math.round(bmp.width*scale));
      const rh = Math.max(1, Math.round(bmp.height*scale));
      const workBmp = await createImageBitmap(bmp, {resizeWidth:rw, resizeHeight:rh});
      const prevBmp = bmp; // full-res for nice preview (browser scales cheaply)

      STATE.preview = { img: prevBmp, w: prevBmp.width, h: prevBmp.height };
      STATE.result = null;
      drawPreview(STATE.preview);
      setProgress(10);
    }

    // -------- processing

    async function processPhoto(){
      if(!STATE.preview?.img){ fileIn.click(); return; }
      setProgress(12);

      // map subject rect from preview-space → bitmap-space
      let rect=null;
      if(STATE.subject.rect && STATE.imgFit){
        const {ox,oy,scale} = STATE.imgFit;
        rect = {
          x: Math.max(0, Math.round((STATE.subject.rect.x-ox)/scale)),
          y: Math.max(0, Math.round((STATE.subject.rect.y-oy)/scale)),
          w: Math.max(1, Math.round(STATE.subject.rect.w/scale)),
          h: Math.max(1, Math.round(STATE.subject.rect.h/scale)),
        };
      }

      // create a **processing** bitmap at safe resolution (re-use iOS path)
      const src = STATE.preview.img;
      const cap = 1_300_000; // ~1.3MP
      const k = Math.min(1, Math.sqrt(cap/(src.width*src.height))||1);
      const w = Math.max(1, Math.round(src.width*k));
      const h = Math.max(1, Math.round(src.height*k));
      const procBmp = await createImageBitmap(src, {resizeWidth:w, resizeHeight:h});

      // send to worker
      setProgress(18);
      worker.postMessage({
        type:'process',
        bitmap: procBmp,
        options:{
          rect,
          noSubject: !!STATE.subject.no,
          addFills:  !!STATE.subject.fill,
          hatchStep: 6,          // px between hatch lines
          outline:   true
        }
      }, [procBmp]); // transfer
    }

    async function processDrawing(){
      // turn drawing canvas into bitmap and process as handwriting with "noSubject"
      const blob = await new Promise(res=> drawCanvas.toBlob(res,'image/png',0.92));
      const bmp  = await createImageBitmap(blob);

      STATE.preview = { img:bmp, w:bmp.width, h:bmp.height };
      drawPreview(STATE.preview);
      fmtBar.style.display='none';
      setProgress(10);

      worker.postMessage({
        type:'process',
        bitmap: bmp,
        options:{
          rect: null,
          noSubject: true,
          addFills:  !!STATE.subject.fill,
          hatchStep: 6,
          outline:   true
        }
      }, [bmp]);
    }

    // -------- exports
    function hookDownloads({dstU8,expU8}){
      const save = (u8,name)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8])); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); };
      dstBtn.onclick = ()=> save(dstU8, 'loomabelle.dst');
      expBtn.onclick = ()=> save(expU8, 'loomabelle.exp');
      pesBtn.onclick = ()=> alert('PES coming next build'); // placeholder
      jefBtn.onclick = ()=> alert('JEF coming next build'); // placeholder
    }

  }); // READY
})();