// script.upload.js
// Responsibility here: handle file upload + control preview visibility.

(() => {
  const fileInput   = document.getElementById('file-input');
  const dropZone    = document.getElementById('drop-zone');
  const previewCard = document.getElementById('preview-card');
  const previewHost = document.getElementById('preview-host');

  // Ensure preview starts hidden
  hidePreview();

  // --- File input change ---
  fileInput?.addEventListener('change', handleFiles);

  // --- Drag/drop (optional nice-to-have) ---
  ;['dragenter','dragover'].forEach(ev =>
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag'); })
  );
  ;['dragleave','drop'].forEach(ev =>
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag'); })
  );
  dropZone?.addEventListener('drop', e => {
    if (!e.dataTransfer?.files?.length) return;
    fileInput.files = e.dataTransfer.files;
    handleFiles();
  });

  // ---- helpers ----
  function handleFiles() {
    const file = fileInput?.files?.[0];
    if (!file) { hidePreview(); return; }

    // Read and load an image for preview; actual processing happens elsewhere
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        // mount a canvas so downstream scripts can draw
        previewHost.innerHTML = '';
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const maxW = 1200, maxH = 800;
        let { width:w, height:h } = img;

        // downscale to a sensible preview size
        const scale = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * scale); h = Math.round(h * scale);
        c.width = w; c.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        previewHost.appendChild(c);

        showPreview();

        // Broadcast so other modules (script.preview.js / processing.js) can react
        window.dispatchEvent(new CustomEvent('loom:image-loaded', {
          detail: { canvas: c, width: w, height: h, sourceDataURL: ev.target.result }
        }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function showPreview() {
    if (previewCard) previewCard.hidden = false;
  }
  function hidePreview() {
    if (previewCard) previewCard.hidden = true;
  }

  // Allow other modules to hide preview on reset
  window.addEventListener('loom:reset', hidePreview);
})();
