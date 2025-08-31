// UI glue: tool switching, toggles, hints, selection enablement, modal behavior
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
    window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
  }
  $$('.eb-tool').forEach(btn=>btn.addEventListener('click',()=> setTool(btn.dataset.tool)));
  setTool('select');

  // upload picker
  by('uploadMainBtn')?.addEventListener('click', ()=> by('fileInput')?.click());

  // Tool settings toggle
  const toggleBtn = $('.eb-tools-toggle');
  const setExpanded = on => {
    document.body.classList.toggle('context-collapsed', !on);
    toggleBtn?.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  toggleBtn?.addEventListener('click', ()=> setExpanded(document.body.classList.contains('context-collapsed')));

  // Hoop selector → status + preview
  const hoopMap = { '4x4':'4.0" × 4.0', '5x7':'5.0" × 7.0', '6x10':'6.0" × 10.0', '8x12':'8.0" × 12.0' };
  by('hoopSize')?.addEventListener('change', (e)=>{
    by('statusHoop').textContent = hoopMap[e.target.value] || e.target.value;
    window.dispatchEvent(new CustomEvent('preview:hoop', { detail:{ size:e.target.value }}));
  });

  // File type → brand hint
  const brandHint = {
    DST:'Tajima compatible',
    PES:'Brother / Baby Lock / Bernina',
    JEF:'Janome / Elna',
    EXP:'Melco / Bernina',
    VP3:'Husqvarna Viking / Pfaff',
    XXX:'Singer',
    HUS:'Husqvarna Viking',
    PEC:'Brother (older)'
  };
  const typeSel = by('fileType'), hintEl = by('fileTypeHint');
  const updateHint = ()=> hintEl.textContent = brandHint[typeSel.value] || '';
  typeSel?.addEventListener('change', updateHint); updateHint();

  // Global show-direction toggle
  by('showDirGlobal')?.addEventListener('change', e=>{
    window.dispatchEvent(new CustomEvent('preview:showDirection', { detail:{ enabled:e.target.checked }}));
  });

  // Select-mode sub-controls visibility
  const selectMode = by('selectMode');
  const selW = by('selectWandGroup'), selR = by('selectRefineGroup');
  selectMode?.addEventListener('change', ()=>{
    const m = selectMode.value;
    selW.classList.toggle('hidden', m!=='wand');
    selR.classList.toggle('hidden', m!=='refine');
    window.dispatchEvent(new CustomEvent('select:mode',{detail:{mode:m}}));
  });

  // Enable/disable actions when a selection exists
  const removeBgBtn = by('removeBgAction');
  const layerFromSel = by('layerFromSelection');
  window.addEventListener('selection:state', e=>{
    const on = !!e.detail?.active;
    removeBgBtn.disabled = !on;
    layerFromSel.disabled = !on;
  });

  removeBgBtn?.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('selection:removebg')));

  // Layers UI
  const layerList = by('layerList');
  function refreshLayerList(layers, idx){
    layerList.innerHTML = '';
    layers.forEach((L,i)=>{
      const o=document.createElement('option'); o.value=i; o.textContent=`Layer ${i+1}`; layerList.appendChild(o);
    });
    if (layers.length){ layerList.value = String(idx ?? 0); }
  }
  by('layerMoveToggle')?.addEventListener('change', e=>{
    window.dispatchEvent(new CustomEvent('layer:drag',{detail:{enabled:e.target.checked}}));
  });
  by('layerAngle')?.addEventListener('input', e=>{
    window.dispatchEvent(new CustomEvent('layer:angle',{detail:{angle:+e.target.value||0}}));
  });
  by('layerRemoveBg')?.addEventListener('change', e=>{
    window.dispatchEvent(new CustomEvent('layer:removebg',{detail:{enabled:e.target.checked}}));
  });
  layerList?.addEventListener('change', e=>{
    window.dispatchEvent(new CustomEvent('layer:select',{detail:{index:+e.target.value}}));
  });
  by('layerFromSelection')?.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('layer:from-selection')));

  // Editor tells us about layer changes
  window.addEventListener('layers:update', e=>{
    const {layers, active} = e.detail||{};
    refreshLayerList(layers||[], active||0);
  });

  // Modal open/close
  const modal = by('previewModal');
  by('loomPreviewEnlarge')?.addEventListener('click', ()=>{
    if (!modal.open) modal.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  });
  by('previewModalClose')?.addEventListener('click', ()=> modal.close());
  modal?.addEventListener('click', ev=>{
    const body = modal.querySelector('.eb-modal__body');
    if(!body) return;
    const r = body.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    if(!inside) modal.close();
  });

  // Init
  window.addEventListener('load', ()=>{
    by('maskCanvas')?.classList.add('is-hidden');
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();