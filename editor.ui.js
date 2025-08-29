(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  const $ = s=>document.querySelector(s);
  const $$= s=>Array.from(document.querySelectorAll(s));
  const byId = id=>document.getElementById(id);

  const panels = new Map($$('.panel').map(p=>[p.dataset.panel, p]));
  function setTool(t){
    $$('.eb-tool').forEach(b=>b.classList.toggle('is-active', b.dataset.tool===t));
    panels.forEach((node,key)=> node.classList.toggle('hidden', key!==t));
    const m=$('#modeTabs [data-mode="mask"]'), tx=$('#modeTabs [data-mode="text"]');
    if(['brush','eraser','wand','lasso'].includes(t)) m?.click();
    if(t==='text') tx?.click();
    window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
  }
  $$('.eb-tool').forEach(btn=>btn.addEventListener('click',()=> setTool(btn.dataset.tool)));
  setTool('select');

  // Main upload and extras (unchanged)
  byId('uploadMainBtn')?.addEventListener('click', ()=> byId('fileInput')?.click());
  byId('fileInput')?.addEventListener('change', e=>{
    const f = e.target.files?.[0]; if(!f) return;
    window.dispatchEvent(new CustomEvent('editor:file', { detail: { file: f }}));
  });
  byId('uploadsBtn')?.addEventListener('click', ()=> setTool('uploads'));
  byId('addElementBtn')?.addEventListener('click', ()=> byId('addElementInput')?.click());
  byId('addElementInput')?.addEventListener('change', e=>{
    const f = e.target.files?.[0]; if(!f) return;
    window.dispatchEvent(new CustomEvent('editor:add-element',{detail:{file:f}}));
  });

  // Remove-background unified toggle (unchanged)
  function rbOn(){ return !!(byId('removeBg')?.checked || byId('removeBgW')?.checked || byId('removeBgE')?.checked); }
  ['removeBg','removeBgW','removeBgE'].forEach(id=>{
    byId(id)?.addEventListener('change', ()=> {
      window.dispatchEvent(new CustomEvent('editor:removebg',{detail:{enabled: rbOn()}}));
    });
  });

  // Context collapse (unchanged)
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  byId('panelToggle')?.addEventListener('click', toggleContext);
  byId('contextClose')?.addEventListener('click', toggleContext);

  // Zoom (unchanged)
  const zoomPct = byId('zoomPct'); let zoom=1;
  function applyZoom(){ $('#canvasWrap').style.transform=`scale(${zoom})`; zoomPct.textContent=`${Math.round(zoom*100)}%`; }
  byId('zoomIn')?.addEventListener('click', ()=>{ zoom=Math.min(4,zoom+0.1); applyZoom(); });
  byId('zoomOut')?.addEventListener('click', ()=>{ zoom=Math.max(0.25,zoom-0.1); applyZoom(); });

  // Preview modal (unchanged)
  const openPreview = ()=>{
    const d=byId('previewModal'); if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  byId('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  byId('previewModalClose')?.addEventListener('click', ()=>byId('previewModal').close());

  // Initial layout and preview
  window.addEventListener('load', ()=>{
    // Hide the mask overlay by default so it cannot cover the uploaded image
    byId('maskCanvas')?.classList.add('is-hidden');
    const sm = byId('showMask'); if (sm) sm.checked = false;

    setTimeout(()=>{ if(window.Editor?.fit) Editor.fit(); }, 0);
    setTimeout(()=>{ if(window.Editor?.fit) Editor.fit(); }, 120);
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();