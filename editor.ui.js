// Editor-only UI glue. Does not run on other pages.
(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  // Tool selection -> call existing hooks if present
  document.querySelectorAll('.eb-tool').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = btn.dataset.tool;
      if(window.setActiveTool) { try { setActiveTool(t); } catch(e){} }
      if(window.Tools && typeof Tools.set==='function'){ try{ Tools.set(t); }catch(e){} }
      document.querySelectorAll('.eb-tool').forEach(b=>b.classList.toggle('is-active', b===btn));
      window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
    });
  });

  // Convert -> route to existing pipeline
  document.getElementById('btnConvert').addEventListener('click', ()=>{
    if(window.convertToEmbroidery){ try{ convertToEmbroidery(); return; }catch(e){} }
    if(window.Processing && typeof Processing.convert==='function'){ try{ Processing.convert(); return; }catch(e){} }
    console.warn('Convert hook not found.');
  });

  // Status setters others can call
  window.EditorUI = Object.assign(window.EditorUI||{},{
    setZoom(v){ const el=document.getElementById('statusZoom'); if(el) el.textContent=`Zoom ${v}%`; },
    setHoop(w,h){ const el=document.getElementById('statusHoop'); if(el) el.textContent=`${w}" × ${h}"`; },
    setStitches(n){ const el=document.getElementById('statusStitches'); if(el) el.textContent=`${Number(n||0).toLocaleString()} stitches`; },
    refreshMini(){ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); }
  });

  // Preview modal
  const openPreview=()=>{
    const d=document.getElementById('previewModal');
    if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  const closePreview=()=>document.getElementById('previewModal').close();
  const enlargeBtn=document.getElementById('loomPreviewEnlarge');
  const fab=document.getElementById('previewFab');
  const closeBtn=document.getElementById('previewModalClose');
  if(enlargeBtn) enlargeBtn.addEventListener('click', openPreview);
  if(fab) fab.addEventListener('click', openPreview);
  if(closeBtn) closeBtn.addEventListener('click', closePreview);
  window.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='p') openPreview(); });

  // Initial mini render
  window.addEventListener('load', ()=>{ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); });

  // Re-render mini on idle after edits
  let raf;
  ['pointerup','keyup','tool:select','change'].forEach(ev=>{
    window.addEventListener(ev, ()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{ const c=document.getElementById('loomPreviewCanvas'); if(c) renderLoomPreview('loomPreviewCanvas'); });
    }, {passive:true});
  });
})();