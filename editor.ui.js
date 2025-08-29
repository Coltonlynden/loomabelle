// Editor-only UI glue
(function(){
  if(!document.body.classList.contains('editor-shell')) return;

  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));
  const byId = id=>document.getElementById(id);

  // -------- Tool selection -> per-panel visibility ----------
  let activeTool = 'select';
  const panels = new Map($$('.panel').map(p=>[p.dataset.panel, p]));
  function setTool(t){
    activeTool = t;
    $$('.eb-tool').forEach(b=>b.classList.toggle('is-active', b.dataset.tool===t));
    panels.forEach((node,key)=>node.classList.toggle('is-active', key===t));
    window.dispatchEvent(new CustomEvent('tool:select',{detail:{tool:t}}));
  }
  $$('.eb-tool').forEach(btn=>btn.addEventListener('click',()=>setTool(btn.dataset.tool)));
  setTool('select');

  // -------- Uploads ----------
  const mainBtn = byId('uploadMainBtn');
  const fileInput = byId('fileInput');
  mainBtn?.addEventListener('click', ()=> fileInput?.click());
  fileInput?.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    // Prefer your existing upload pipeline if present
    if (window.handleMainUpload) { try { return handleMainUpload(f); } catch(e){} }
    if (window.Editor && typeof Editor.loadImage==='function') { try { return Editor.loadImage(f); } catch(e){} }
    // Fallback: draw to base canvas
    const img = new Image(); img.onload = ()=> {
      const c = byId('imgCanvas'); const ctx = c.getContext('2d');
      c.width = img.width; c.height = img.height;
      // Resize stage to fit
      const wrap = byId('canvasWrap'); wrap.style.aspectRatio = (img.width/img.height).toFixed(3);
      ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0);
      if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
      byId('zoomPct').textContent = '100%';
    };
    img.src = URL.createObjectURL(f);
  });

  // Additional element uploads
  const addBtn = byId('addElementBtn');
  const addInput = byId('addElementInput');
  const uploadsBtn = byId('uploadsBtn');
  uploadsBtn?.addEventListener('click', ()=> setTool('uploads'));
  addBtn?.addEventListener('click', ()=> addInput?.click());

  // Simple draggable elements drawn onto imgCanvas
  const elements = [];
  addInput?.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const img = new Image();
    img.onload = ()=>{
      elements.push({img, x:20, y:20, w:img.width, h:img.height});
      redrawComposite();
    };
    img.src = URL.createObjectURL(f);
  });

  function redrawComposite(){
    const base = byId('imgCanvas'); if(!base.width) return;
    const ctx = base.getContext('2d');
    // redraw original base + elements; if no stored original, just keep current and layer elements
    ctx.drawImage(base,0,0);
    for(const el of elements) ctx.drawImage(el.img, el.x, el.y);
    if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  }

  // Drag to position added elements
  (function enableDrag(){
    const base = byId('imgCanvas'); if(!base) return;
    let dragging = null, offx=0, offy=0;
    function hit(x,y){
      for(let i=elements.length-1;i>=0;i--){
        const e = elements[i];
        if(x>=e.x && x<=e.x+e.w && y>=e.y && y<=e.y+e.h) return {e,i};
      } return null;
    }
    function toLocal(evt){
      const r = base.getBoundingClientRect();
      const x = (evt.clientX - r.left) * (base.width / r.width);
      const y = (evt.clientY - r.top) * (base.height / r.height);
      return {x,y};
    }
    base.addEventListener('pointerdown', e=>{
      if(activeTool!=='select' && activeTool!=='uploads') return;
      const p = toLocal(e); const h = hit(p.x,p.y);
      if(h){ dragging = h.e; offx=p.x-h.e.x; offy=p.y-h.e.y; base.setPointerCapture(e.pointerId); }
    });
    base.addEventListener('pointermove', e=>{
      if(!dragging) return; const p = toLocal(e);
      dragging.x = p.x - offx; dragging.y = p.y - offy; redrawComposite();
    });
    base.addEventListener('pointerup', e=>{ dragging=null; base.releasePointerCapture(e.pointerId); });
  })();

  // -------- Panel toggle ----------
  const toggleContext = ()=> document.body.classList.toggle('context-collapsed');
  byId('panelToggle')?.addEventListener('click', toggleContext);
  byId('contextClose')?.addEventListener('click', toggleContext);

  // -------- Auto highlight + remove background ----------
  byId('autoBtn')?.addEventListener('click', ()=>{
    if (window.runAutoHighlight) { try { runAutoHighlight(); return; } catch(e){} }
    window.dispatchEvent(new Event('editor:auto'));
  });
  byId('removeBg')?.addEventListener('change', (e)=>{
    const on = e.target.checked;
    if (window.setRemoveBackground) { try { setRemoveBackground(on); } catch(e){} }
    window.dispatchEvent(new CustomEvent('editor:removebg',{detail:{enabled:on}}));
  });

  // -------- Zoom controls (non-invasive) ----------
  const zoomPct = byId('zoomPct');
  let zoom = 1;
  function applyZoom(){
    byId('canvasWrap').style.transform = `scale(${zoom})`;
    zoomPct.textContent = `${Math.round(zoom*100)}%`;
  }
  byId('zoomIn')?.addEventListener('click', ()=>{ zoom=Math.min(4,zoom+0.1); applyZoom(); });
  byId('zoomOut')?.addEventListener('click', ()=>{ zoom=Math.max(0.1,zoom-0.1); applyZoom(); });

  // -------- Status helpers exposed for other scripts ----------
  window.EditorUI = Object.assign(window.EditorUI||{},{
    setZoom(v){ zoom = Math.max(0.1, Number(v)/100); applyZoom(); },
    setHoop(w,h){ const el=byId('statusHoop'); if(el) el.textContent=`${w}" × ${h}"`; },
    setStitches(n){ const el=byId('statusStitches'); if(el) el.textContent=`${Number(n||0).toLocaleString()} stitches`; },
    refreshMini(){ if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas'); }
  });

  // -------- Preview modal ----------
  const openPreview = ()=>{
    const d=byId('previewModal'); if(!d.open) d.showModal();
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewLarge');
  };
  byId('loomPreviewEnlarge')?.addEventListener('click', openPreview);
  byId('previewFab')?.addEventListener('click', openPreview);
  byId('previewModalClose')?.addEventListener('click', ()=>byId('previewModal').close());
  window.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='p') openPreview(); });

  // -------- Initial render ----------
  window.addEventListener('load', ()=>{
    if(window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
  });

  // Re-render mini preview after interactions
  let raf;
  ['pointerup','keyup','change','tool:select'].forEach(ev=>{
    window.addEventListener(ev, ()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{ if(byId('loomPreviewCanvas')) renderLoomPreview('loomPreviewCanvas'); });
    }, {passive:true});
  });
})();