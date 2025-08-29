// Robust upload: decodes image itself and also emits events.
(function () {
  const input = document.getElementById('fileInput');
  const add   = document.getElementById('addElementInput');

  async function decodeFile(file) {
    if (!file) return null;

    // Prefer ImageBitmap when available and the type is canvas-safe.
    const safeType = /image\/(png|jpeg|jpg|gif|webp)/i.test(file.type);
    if ('createImageBitmap' in window && safeType) {
      try { return await createImageBitmap(file); } catch {}
    }
    // Fallback: FileReader → HTMLImageElement
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = fr.result; };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }

  async function handleMain(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const bitmap = await decodeFile(file);

    // 1) Direct draw fallback (guarantees something appears)
    if (bitmap) {
      const c = document.getElementById('imgCanvas');
      if (c) {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        // Fit canvas to container before drawing
        if (window.Editor && typeof Editor.fit === 'function') Editor.fit();
        const ctx = c.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,c.width,c.height);
        ctx.drawImage(bitmap, 0, 0, c.width, c.height);
        if (window.renderLoomPreview) try { renderLoomPreview('loomPreviewCanvas'); } catch {}
      }
    }

    // 2) Fire both events so other modules can react
    window.dispatchEvent(new CustomEvent('editor:file',  { detail: { file } }));
    window.dispatchEvent(new CustomEvent('editor:image', { detail: { image: bitmap } }));

    // Allow re-selecting same file
    e.target.value = '';
  }

  function handleAdd(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    window.dispatchEvent(new CustomEvent('editor:add-element', { detail: { file } }));
    e.target.value = '';
  }

  input && input.addEventListener('change', handleMain);
  add   && add.addEventListener('change', handleAdd);
})();