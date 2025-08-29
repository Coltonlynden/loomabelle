// UI glue only (no file decoding)
(function(){
  if(!document.body.classList.contains('editor-shell')) return;
  const $  = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));
  const by = id=>document.getElementById(id);

  // tool -> panel
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

  // Only open pickers here
  by('uploadMainBtn')?.addEventListener('click', ()=> by('fileInput')?.click());
  by('uploadsBtn')?.addEventListener('click', ()=> setTool('uploads'));
  by('addElementBtn')?.addEventListener('click', ()=> by('addElementInput')?.click());

  // Remove-bg unified toggle
  function rb(){ return !!(by('removeBg')?.checked || by('removeBgW')?.checked || by('removeBgE')?.checked); }
  ['removeBg','removeBgW','removeBgE'].forEach(id=>{
    by(id)?.addEventListener('change', ()=> window.dispatchEvent(new CustomEvent('editor:removebg',{detail:{enabled: rb()}})));
  });

  // Context collapse
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  by('panelToggle')?.addEventListener('click', toggleContext);
  by('contextClose')?.addEventListener('click', toggleContext);

  // Preview modal
  const openPreview = ()=>{
    const d=by('previewModal'); if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  by('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  by('previewModalClose')?.addEventListener('click', ()=>by('previewModal').close());

  // Zoom
  const zoomPct = by('zoomPct'); let zoom=1;
  const applyZoom = ()=>{ $('#canvasWrap').style.transform=`scale(${zoom})`; zoomPct.textContent=`${Math.round(zoom*100)}%`; };
  by('zoomIn')?.addEventListener('click', ()=>{ zoom=Math.min(4,zoom+0.1); applyZoom(); });
  by('zoomOut')?.addEventListener('click', ()=>{ zoom=Math.max(0.25,zoom-0.1); applyZoom(); });

  // Init
  window.addEventListener('load', ()=>{
    by('maskCanvas')?.classList.add('is-hidden');
    const sm = by('showMask'); if (sm) sm.checked = false;
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();