// processing.js
(function () {
  const IMG = document.getElementById('imgCanvas');
  const MASK = document.getElementById('maskCanvas');

  // Prevent any init code from clearing the canvases before an image exists
  let hasPhoto = false;
  window.addEventListener('editor:image', () => { hasPhoto = true; });
  window.addEventListener('editor:file',  () => { hasPhoto = true; });

  // If you had a render loop that touched IMG/MASK, guard it:
  function safe(fn){ return (...a)=>{ if (hasPhoto) fn(...a); }; }

  // Public convert entry
  window.convertToEmbroidery = safe(async function convertToEmbroidery () {
    const w = IMG.width, h = IMG.height;
    if (!w || !h) return;

    const imgData  = IMG.getContext('2d').getImageData(0,0,w,h);
    const maskData = MASK.getContext('2d').getImageData(0,0,w,h);

    // send to worker
    if (window.EmbWorker) {
      EmbWorker.postMessage({ type:'convert', w, h, img: imgData, mask: maskData }, [imgData.data.buffer, maskData.data.buffer]);
    } else {
      // fallback stub so UI still responds
      console.warn('Worker missing; stub convert.');
    }
  });

  // Example: worker response back to preview
  window.addEventListener('load', ()=>{
    if (!window.EmbWorker) return;
    EmbWorker.onmessage = (e)=>{
      const {type, stitches} = e.data||{};
      if (type==='result') {
        document.getElementById('statusStitches').textContent = `${stitches?.length||0} stitches`;
        if (window.renderLoomPreview) renderLoomPreview('loomPreviewCanvas');
      }
    };
  });
})();