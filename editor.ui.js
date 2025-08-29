// Editor-only UI glue. Safe for other pages.
(function () {
  if (!document.body.classList.contains('editor-shell')) return;

  // Tool selection -> call your app hooks if present
  document.querySelectorAll('.eb-tool').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = btn.dataset.tool;
      if (window.setActiveTool) try { setActiveTool(t); } catch(e){}
      if (window.Tools && typeof Tools.set==='function') try { Tools.set(t); } catch(e){}
      document.querySelectorAll('.eb-tool').forEach(b=>b.classList.toggle('is-active', b===btn));
      window.dispatchEvent(new CustomEvent('tool:select', {detail:{tool:t}}));
    });
  });

  // Convert → prefer your existing convert
  document.getElementById('btnConvert').addEventListener('click', ()=>{
    if (window.convertToEmbroidery) { try { convertToEmbroidery(); return; } catch(e){} }
    if (window.Processing && typeof Processing.convert==='function') { try { Processing.convert(); return; } catch(e){} }
    console.warn('Convert hook not found.');
  });

  // Status setters other scripts can call
  window.EditorUI = Object.assign(window.EditorUI||{}, {
    setZoom(v){ document.getElementById('statusZoom').textContent = `Zoom ${v}%`; },
    setHoop(w,h){ document.getElementById('statusHoop').textContent = `${w}" × ${h}"`; },
    setStitches(n){ document.getElementById('statusStitches').textContent = `${Number(n||0).toLocaleString()} stitches`; },
    refreshMini(){ if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); }
  });

  // Preview open/close
  const openPreview = ()=>{
    const dlg = document.getElementById('previewModal');
    if (!dlg.open) dlg.showModal();
    if (window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  const closePreview = ()=> document.getElementById('previewModal').close();
  document.getElementById('loomPreviewEnlarge').addEventListener('click', openPreview);
  document.getElementById('previewFab').addEventListener('click', openPreview);
  document.getElementById('previewModalClose').addEventListener('click', closePreview);
  window.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='p') openPreview(); });

  // Initial mini render after load
  window.addEventListener('load', ()=> {
    if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();
