(function () {
  const P = (window.EAS && window.EAS.paths) || {};
  const mask = document.getElementById('maskCanvas');
  const live = document.getElementById('liveCanvas');
  if (!mask || !live || !P || !P.generate) return;

  const gen  = document.getElementById('btn-generate');
  const chk  = document.getElementById('toggleStitch');
  const bPNG = document.getElementById('btn-png');
  const bSVG = document.getElementById('btn-svg');
  const bJS  = document.getElementById('btn-json');
  const bDST = document.getElementById('btn-dst');

  // Direction inputs
  const dirAngle = document.getElementById('dirAngle');
  const dirSpace = document.getElementById('dirSpace');

  let last = null;

  function generate() {
    const angle = Number(dirAngle?.value || 45);
    const space = Number(dirSpace?.value || 6);
    last = P.generate(mask, { angleDeg: angle, hatchSpacing: space, step: 3, maxStitch: 12 });
    if (chk?.checked) P.preview(live, last);
  }

  gen?.addEventListener('click', generate);
  dirAngle?.addEventListener('input', ()=> last && generate());
  dirSpace?.addEventListener('input', ()=> last && generate());

  chk?.addEventListener('change', ()=>{
    const ctx = live.getContext('2d');
    if (chk.checked && last) P.preview(live,last); else ctx.clearRect(0,0,live.width,live.height);
  });

  function dl(name, blob) {
    const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 800);
  }
  bPNG?.addEventListener('click', ()=>{ if(!last) return; const c=document.createElement('canvas'); c.width=last.stats.w; c.height=last.stats.h; P.preview(c,last); c.toBlob(b=>dl('stitches.png',b),'image/png');});
  bSVG?.addEventListener('click', ()=> last && dl('stitches.svg', new Blob([P.exportSVG(last)],{type:'image/svg+xml'})));
  bJS ?.addEventListener('click', ()=> last && dl('stitches.json', new Blob([P.exportJSON(last)],{type:'application/json'})));
  bDST?.addEventListener('click', ()=> last && dl('stitches.dst', new Blob([P.exportDST(last)],{type:'application/octet-stream'})));
})();