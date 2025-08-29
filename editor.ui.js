(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  const $ = s=>document.querySelector(s);
  const $$= s=>Array.from(document.querySelectorAll(s));
  const byId = id=>document.getElementById(id);

  // panels by tool
  const panels = new Map($$('.panel').map(p=>[p.dataset.panel, p]));
  let activeTool = 'select';
  function setTool(t){
    activeTool = t;
    $$('.eb-tool').forEach(b=>b.classList.toggle('is-active', b.dataset.tool===t));
    panels.forEach((node,key)=> node.classList.toggle('hidden', key!==t));
    // keep hidden mode chips in sync for scripts expecting them
    const chipMask = $('#modeTabs [data-mode="mask"]');
    const chipText = $('#modeTabs [data-mode="text"]');
    if(['brush','eraser','wand','lasso'].includes(t)) chipMask?.click();
    if(t==='text') chipText?.click();
    window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
  }
  $$('.eb-tool').forEach(btn=>btn.addEventListener('click',()=> setTool(btn.dataset.tool)));
  setTool('select');

  // upload main
  const mainBtn = byId('uploadMainBtn');
  const fileInput = byId('fileInput');
  mainBtn?.addEventListener('click', ()=> fileInput?.click());
  fileInput?.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{ window.dispatchEvent(new CustomEvent('editor:file', { detail: { file: f }})); }catch(_){}
    // fallback draw in case upload handler is absent
    if (!(window.Editor && typeof Editor.fit==='function')) {
      const img = new Image();
      img.onload = ()=>{
        const c = byId('imgCanvas'), ctx=c.getContext('2d');
        c.width=img.width; c.height=img.height; ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0);
        if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
      };
      img.src = URL.createObjectURL(f);
    }
  });

  // additional elements
  byId('uploadsBtn')?.addEventListener('click', ()=> setTool('uploads'));
  const addInput = byId('addElementInput');
  byId('addElementBtn')?.addEventListener('click', ()=> addInput?.click());
  addInput?.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    window.dispatchEvent(new CustomEvent('editor:add-element',{detail:{file:f}}));
  });

  // remove background unified toggle
  function rbOn(){
    return !!(byId('removeBg')?.checked || byId('removeBgW')?.checked || byId('removeBgE')?.checked);
  }
  ['removeBg','removeBgW','removeBgE'].forEach(id=>{
    byId(id)?.addEventListener('change', ()=> {
      window.dispatchEvent(new CustomEvent('editor:removebg',{detail:{enabled: rbOn()}}));
    });
  });

  // context collapse
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  byId('panelToggle')?.addEventListener('click', toggleContext);
  byId('contextClose')?.addEventListener('click', toggleContext);

  // zoom
  const zoomPct = byId('zoomPct');
  let zoom=1;
  function applyZoom(){ $('#canvasWrap').style.transform=`scale(${zoom})`; zoomPct.textContent=`${Math.round(zoom*100)}%`; }
  byId('zoomIn')?.addEventListener('click', ()=>{ zoom=Math.min(4,zoom+0.1); applyZoom(); });
  byId('zoomOut')?.addEventListener('click', ()=>{ zoom=Math.max(0.25,zoom-0.1); applyZoom(); });

  // preview modal
  const openPreview = ()=>{
    const d=byId('previewModal'); if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  byId('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  byId('previewModalClose')?.addEventListener('click', ()=>byId('previewModal').close());

  // initial mini preview
  window.addEventListener('load', ()=>{ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); });

  // re-render mini after interactions
  let raf;
  ['pointerup','keyup','change','tool:select'].forEach(ev=>{
    window.addEventListener(ev, ()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{ if(byId('loomPreviewCanvas') && window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); });
    }, {passive:true});
  });

  // convert button delegates to existing processing
  byId('btnConvert')?.addEventListener('click', ()=>{
    if(window.convertToEmbroidery){ try{ convertToEmbroidery(); return; }catch(e){} }
    if(window.Processing && typeof Processing.convert==='function'){ try{ Processing.convert(); return; }catch(e){} }
    console.warn('Convert hook not found.');
  });
})();