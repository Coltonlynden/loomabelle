(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  const $ = s=>document.querySelector(s);
  const $$= s=>Array.from(document.querySelectorAll(s));
  const byId = id=>document.getElementById(id);

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

  // Only open dialog. Do NOT handle file data here.
  byId('uploadMainBtn')?.addEventListener('click', ()=> byId('fileInput')?.click());

  // Additional elements -> only open dialog; handler lives in script.upload.js
  byId('uploadsBtn')?.addEventListener('click', ()=> setTool('uploads'));
  byId('addElementBtn')?.addEventListener('click', ()=> byId('addElementInput')?.click());

  // Remove bg unified
  function rbOn(){ return !!(byId('removeBg')?.checked || byId('removeBgW')?.checked || byId('removeBgE')?.checked); }
  ['removeBg','removeBgW','removeBgE'].forEach(id=>{
    byId(id)?.addEventListener('change', ()=> {
      window.dispatchEvent(new CustomEvent('editor:removebg',{detail:{enabled: rbOn()}}));
    });
  });

  // Context collapse
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  byId('panelToggle')?.addEventListener('click', toggleContext);
  byId('contextClose')?.addEventListener('click', toggleContext);

  // Preview modal
  const openPreview = ()=>{
    const d=byId('previewModal'); if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  byId('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  byId('previewModalClose')?.addEventListener('click', ()=>byId('previewModal').close());

  // Initial layout + hide mask overlay by default
  window.addEventListener('load', ()=>{
    byId('maskCanvas')?.classList.add('is-hidden');
    const sm = byId('showMask'); if (sm) sm.checked = false;
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();