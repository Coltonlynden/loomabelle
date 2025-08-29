// Editor-only UI glue
(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  // Tools
  document.querySelectorAll('.eb-tool').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = btn.dataset.tool;
      if(window.setActiveTool) try{ setActiveTool(t);}catch(e){}
      if(window.Tools && typeof Tools.set==='function') try{ Tools.set(t);}catch(e){}
      document.querySelectorAll('.eb-tool').forEach(b=>b.classList.toggle('is-active', b===btn));
      window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
    });
  });

  // Convert
  document.getElementById('btnConvert').addEventListener('click', ()=>{
    if(window.convertToEmbroidery){ try{ convertToEmbroidery(); return;}catch(e){} }
    if(window.Processing && typeof Processing.convert==='function'){ try{ Processing.convert(); return;}catch(e){} }
    console.warn('Convert hook not found.');
  });

  // Status API
  window.EditorUI = Object.assign(window.EditorUI||{},{
    setZoom(v){ document.getElementById('statusZoom').textContent = `Zoom ${v}%`; },
    setHoop(w,h){ document.getElementById('statusHoop').textContent = `${w}" × ${h}"`; },
    setStitches(n){ document.getElementById('statusStitches').textContent = `${Number(n||0).toLocaleString()} stitches`; },
    refreshMini(){ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); }
  });

  // Preview modal
  const openPreview=()=>{
    const d=document.getElementById('previewModal');
    if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  document.getElementById('loomPreviewEnlarge').addEventListener('click', openPreview);
  document.getElementById('previewFab').addEventListener('click', openPreview);
  document.getElementById('previewModalClose').addEventListener('click', ()=>document.getElementById('previewModal').close());
  window.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='p') openPreview(); });

  // Initial mini render
  window.addEventListener('load', ()=>{ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); });
})();