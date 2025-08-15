/* Loomabelle loader — keeps HTML/CSS unchanged */
(async () => {
  try { const { init } = await import('./modules/app.js'); await init(); }
  catch (e) { console.error('Loomabelle init error:', e); alert('Loomabelle failed to initialize: ' + e.message); }
})();