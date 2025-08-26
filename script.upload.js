/* Restored upload + scaling + autohighlight plumbing */
(function () {
  const imgEl = document.getElementById('imageCanvas');
  const maskEl = document.getElementById('maskCanvas');
  const edgeEl = document.getElementById('edgesCanvas');

  const file = document.getElementById('file');
  const detail = document.getElementById('detail');
  const autoBtn = document.getElementById('btn-autoh');

  const zOut = document.getElementById('zout');
  const zIn  = document.getElementById('zin');
  const zLabel = document.getElementById('zlabel');

  if (!imgEl) return;

  const imgCtx = imgEl.getContext('2d');
  const maskCtx = maskEl.getContext('2d', { willReadFrequently: true });
  const edgeCtx = edgeEl.getContext('2d');

  let img = new Image();
  let zoom = 1, panX = 0, panY = 0, isPanning = false;

  function fitCanvasToBox() {
    const box = imgEl.parentElement.getBoundingClientRect();
    [imgEl, maskEl, edgeEl].forEach(c => { c.width = box.width; c.height = box.height; });
  }

  function drawImage() {
    imgCtx.setTransform(1,0,0,1,0,0);
    imgCtx.clearRect(0,0,imgEl.width,imgEl.height);

    if (!img.naturalWidth) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const k = Math.min(imgEl.width/iw, imgEl.height/ih);
    const w = iw*k*zoom, h = ih*k*zoom;
    const x = (imgEl.width - w)/2 + panX, y = (imgEl.height - h)/2 + panY;

    imgCtx.imageSmoothingEnabled = true;
    imgCtx.imageSmoothingQuality = 'high';
    imgCtx.drawImage(img, x, y, w, h);
  }

  function clearMask() {
    maskCtx.clearRect(0,0,maskEl.width,maskEl.height);
  }

  function computeEdges() {
    edgeCtx.clearRect(0,0,edgeEl.width,edgeEl.height);
    // light diagonal texture (visual only, like original)
    const pat = edgeCtx.createLinearGradient(0,0,edgeEl.width,edgeEl.height);
    pat.addColorStop(0,'rgba(97,70,61,.08)');
    pat.addColorStop(1,'rgba(97,70,61,0)');
    edgeCtx.fillStyle = pat;
    edgeCtx.fillRect(0,0,edgeEl.width,edgeEl.height);
  }

  function refresh() {
    fitCanvasToBox();
    drawImage();
    if (document.getElementById('showMask')?.checked) maskEl.style.opacity = 1; else maskEl.style.opacity = 0;
    if (document.getElementById('showEdges')?.checked) edgeEl.classList.remove('hide'); else edgeEl.classList.add('hide');
  }

  // zoom / pan
  function setZoom(z){ zoom = Math.max(.25, Math.min(4, z)); zLabel.textContent = `${Math.round(zoom*100)}%`; drawImage(); }
  zOut?.addEventListener('click', ()=> setZoom(zoom*0.85));
  zIn?.addEventListener('click',  ()=> setZoom(zoom*1.15));

  imgEl.parentElement.addEventListener('pointerdown',(e)=>{ if (e.altKey){ isPanning=true; imgEl.setPointerCapture(e.pointerId); }});
  imgEl.parentElement.addEventListener('pointerup',()=>{ isPanning=false; });
  imgEl.parentElement.addEventListener('pointermove',(e)=>{ if(!isPanning) return; panX += e.movementX; panY += e.movementY; drawImage(); });

  // file load
  file?.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); setZoom(1); panX=panY=0; refresh(); };
    img.src = url;
  });

  // simple subject autohighlight using luminance + guided threshold
  autoBtn?.addEventListener('click', ()=>{
    if (!imgEl.width) return;
    // draw current image to a temp canvas to sample pixels
    const t = document.createElement('canvas');
    t.width = maskEl.width; t.height = maskEl.height;
    const tctx = t.getContext('2d');
    tctx.drawImage(imgEl,0,0);
    const { data } = tctx.getImageData(0,0,t.width,t.height);

    const D = Number(detail?.value || 0.35);
    // compute local mean luminance; pick a threshold and expand a bit
    const alpha = new Uint8ClampedArray(t.width*t.height);
    for (let y=0;y<t.height;y++){
      for (let x=0;x<t.width;x++){
        const i = (y*t.width + x)*4;
        const L = 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
        alpha[y*t.width+x] = L;
      }
    }
    // Otsu-ish threshold
    let hist = new Array(256).fill(0);
    for (let i=0;i<alpha.length;i++) hist[alpha[i]|0]++;
    let sum=0, sumB=0, wB=0, maximum=0, thresh=127, total=alpha.length;
    for(let i=0;i<256;i++) sum += i*hist[i];
    for(let i=0;i<256;i++){
      wB += hist[i]; if(!wB) continue;
      const wF = total - wB; if(!wF) break;
      sumB += i*hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB*wF*(mB-mF)*(mB-mF);
      if (between > maximum){ maximum = between; thresh = i; }
    }
    // draw mask with pleasant blush tint
    maskCtx.clearRect(0,0,maskEl.width,maskEl.height);
    maskCtx.fillStyle = 'rgba(217,137,131,0.35)';
    maskCtx.beginPath();
    for (let y=0;y<t.height;y++){
      for (let x=0;x<t.width;x++){
        const a = alpha[y*t.width+x] > (thresh*(0.85+0.3*D));
        if (a) maskCtx.fillRect(x,y,1,1);
      }
    }
  });

  // first layout
  window.addEventListener('resize', refresh);
  refresh(); computeEdges();
})();