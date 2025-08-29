/* ================= Editor UI helpers (non-breaking) ================ */
(function () {
  if (!document.body.classList.contains('editor-shell')) return;

  // Context mount helper other scripts can use
  window.EditorUI = window.EditorUI || {};
  const ctx = document.getElementById('contextMount');
  window.EditorUI.mount = function (node) {
    if (!ctx) return;
    ctx.innerHTML = '';
    if (node) ctx.appendChild(node);
  };

  // Save / Export buttons -> fall through to existing handlers
  const btnSave = document.getElementById('eb-save');
  if (btnSave) btnSave.addEventListener('click', () => {
    if (window.onSaveProject) return window.onSaveProject();
    console.warn('onSaveProject not found');
  });

  const btnExport = document.getElementById('eb-export');
  if (btnExport) btnExport.addEventListener('click', () => {
    if (window.onExportDesign) return window.onExportDesign();
    console.warn('onExportDesign not found');
  });
})();