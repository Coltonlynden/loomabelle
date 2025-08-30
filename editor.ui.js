// UI glue (selectors, toggles, modal behavior, hints)
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

  // Open pickers
  by('uploadMainBtn')?.addEventListener('click', ()=> by('fileInput')?.click());
  by('uploadsBtn')?.addEventListener('click', ()=> setTool('uploads'));
  by('addElementBtn')?.addEventListener('click', ()=> by('addElementInput')?.click());

  // Tool settings show/hide
  const toggleBtn = $('.eb-tools-toggle');
  const toolSettings = by('toolSettings');
  const setExpanded = (on)=>{
    document.body.classList.toggle('context-collapsed', !on);
    toggleBtn?.setAttribute('aria-expanded', on ? 'true' : 'false');
    // arrow rotates via CSS
  };
  toggleBtn?.addEventListener('click', ()=> setExpanded(document.body.classList.contains('context-collapsed')));

  // Hoop selector → status text + preview redraw
  const hoopMap = { '4x4':'4.0" × 4.0', '5x7':'5.0" × 7.0', '6x10':'6.0" × 10.0', '8x12':'8.0" × 12.0' };
  by('hoopSize')?.addEventListener('change', (e)=>{
    const pretty = hoopMap[e.target.value] || e.target.value;
    by('statusHoop').textContent = pretty;
    window.dispatchEvent(new CustomEvent('preview:hoop', { detail:{ size:e.target.value }}));
  });

  // File type → brand hint
  const brandHint = {
    'DST':'Tajima compatible',
    'PES':'Brother / Baby Lock / Bernina',
    'JEF':'Janome / Elna',
    'EXP':'Melco / Bernina',
    'VP3':'Husqvarna Viking / Pfaff',
    'XXX':'Singer',
    'HUS':'Husqvarna Viking',
    'PEC':'Brother (older)'
  };
  const typeSel = by('fileType'), hintEl = by('fileTypeHint');
  const updateHint = ()=> hintEl.textContent = brandHint[typeSel.value] || '';
  typeSel?.addEventListener('change', updateHint);
  updateHint();

  // Global show-direction toggle
  by('showDirGlobal')?.addEventListener('change', (e)=>{
    window.dispatchEvent(new CustomEvent('preview:showDirection', { detail:{ enabled:e.target.checked }}));
  });

  // Modal open/close
  const modal = by('previewModal');
  by('loomPreviewEnlarge')?.addEventListener('click', ()=>{
    if (!modal.open) modal.showModal();
    if (window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  });
  // Click outside content closes the dialog
  modal?.addEventListener('click', (ev)=>{
    const rect = modal.querySelector('.eb-modal__body')?.getBoundingClientRect();
    if (!rect) return;
    const inside = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                   ev.clientY >= rect.top  && ev.clientY <= rect.bottom;
    if (!inside) modal.close();
  });

  // Initial
  window.addEventListener('load', ()=>{
    by('maskCanvas')?.classList.add('is-hidden');
    by('showMask') && (by('showMask').checked = false);
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });
})();
