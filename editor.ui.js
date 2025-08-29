// Editor UI glue — scoped to editor page
(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  // Tool selection
  document.querySelectorAll('.eb-tool').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = btn.dataset.tool;
      document.querySelectorAll('.eb-tool').forEach(b=>b.classList.toggle('is-active', b===btn));
      window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
    });
  });

  // Uploads -> open hidden input
  const uploadsBtn = document.getElementById('uploadsBtn');
  const fileInput  = document.getElementById('fileInput');
  uploadsBtn?.addEventListener('click', ()=> fileInput?.click());

  // Panel hide/show
  const panelToggle = document.getElementById('panelToggle');
  const contextClose = document.getElementById('contextClose');
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  panelToggle?.addEventListener('click', toggleContext);
  contextClose?.addEventListener('click', toggleContext);

  // Tabs -> panels
  const chips = Array.from(document.querySelectorAll('#modeTabs .chip'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  function showPanel(id){
    chips.forEach(c=>c.classList.toggle('is-active', c.dataset.panel===id));
    panels.forEach(p=>p.classList.toggle('is-active', p.id===id));
  }
  chips.forEach(c=> c.addEventListener('click', ()=> showPanel(c.dataset.panel)));
  showPanel('panel-mask');

  // Convert -> delegate to existing pipeline
  document.getElementById('btnConvert')?.addEventListener('click', ()=>{
    if(window.convertToEmbroidery){ try{ convertToEmbroidery(); return;}catch(e){} }
    if(window.Processing && typeof Processing.convert==='function'){ try{ Processing.convert(); return;}catch(e){} }
    console.warn('Convert hook not found.');
  });

  // Modal preview
  const openPreview = ()=>{
    const d=document.getElementById('previewModal');
    if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  document.getElementById('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  document.getElementById('previewFab')?.addEventListener('click', openPreview);
  document.getElementById('previewModalClose')?.addEventListener('click', ()=>document.getElementById('previewModal').close());
  window.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='p') openPreview(); });

  // Initial fit + mini preview
  window.addEventListener('load', ()=>{
    if(window.Editor && typeof Editor.fit==='function') Editor.fit();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();