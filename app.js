let uploadedImage = null;
let plan = null;

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      uploadedImage = new Image();
      uploadedImage.onload = () => {
        document.getElementById('status').textContent = "Image loaded — ready to process.";
        document.getElementById('processBtn').classList.remove('disabled');
      };
      uploadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('processBtn').addEventListener('click', () => {
  if (!uploadedImage) return;
  processImage();
});

function processImage() {
  const colors = parseInt(document.getElementById('colorCount').value, 10);
  const removeBg = document.getElementById('removeBg').checked;
  const outline = document.getElementById('outline').checked;
  const fillAngle = parseFloat(document.getElementById('fillAngle').value);
  const density = parseFloat(document.getElementById('density').value);

  plan = convertToStitchPlan(uploadedImage, { colors, removeBg, outline, fillAngle, density });

  // Show preview with colors
  const previewDataURL = drawPreview(plan, 400, 400);
  document.getElementById('previewImg').src = previewDataURL;

  // Create DST file
  const dstBlob = new Blob([exportDST(plan)], { type: 'application/octet-stream' });
  const dstUrl = URL.createObjectURL(dstBlob);
  const dl = document.getElementById('download');
  dl.href = dstUrl;
  dl.classList.remove('disabled');

  // Create palette sidecar
  const lines = plan.colors.map((rgb, i) => `Color ${i + 1}: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
  const paletteBlob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const paletteUrl = URL.createObjectURL(paletteBlob);
  const palA = document.getElementById('downloadPalette');
  palA.href = paletteUrl;
  palA.classList.remove('disabled');

  document.getElementById('status').textContent = "Processing complete!";
}

function convertToStitchPlan(image, opts) {
  // Placeholder: real version should vectorize + generate stitches
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  // Fake: just 2 colors & straight stitches
  const colors = [
    [0, 0, 255],
    [255, 0, 0]
  ];

  let stitches = [];
  for (let y = 0; y < image.height; y += 10) {
    for (let x = 0; x < image.width; x += 10) {
      stitches.push({ x, y, colorChange: false });
    }
    stitches.push({ colorChange: true });
  }

  return { stitches, colors };
}

function drawPreview(plan, W, H) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of plan.stitches) {
    if (s.end || s.colorChange) continue;
    if (s.x < minx) minx = s.x;
    if (s.y < miny) miny = s.y;
    if (s.x > maxx) maxx = s.x;
    if (s.y > maxy) maxy = s.y;
  }
  const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
  const sc = 0.9 * Math.min(W / bw, H / bh);
  const ox = W / 2 - (minx + maxx) / 2 * sc;
  const oy = H / 2 - (miny + maxy) / 2 * sc;

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);

  let last = null;
  let ci = 0;
  const toCss = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.strokeStyle = toCss(plan.colors[ci] || [30, 30, 30]);

  for (const s of plan.stitches) {
    if (s.colorChange) { last = null; ci = Math.min(ci + 1, (plan.colors.length - 1)); g.strokeStyle = toCss(plan.colors[ci] || [30, 30, 30]); continue; }
    if (s.end) { break; }
    if (s.jump) { last = { x: s.x, y: s.y }; continue; }
    if (!last) { last = { x: s.x, y: s.y }; continue; }
    g.beginPath();
    g.moveTo(ox + last.x * sc, oy + last.y * sc);
    g.lineTo(ox + s.x * sc, oy + s.y * sc);
    g.stroke();
    last = { x: s.x, y: s.y };
  }
  return c.toDataURL('image/png');
}

function exportDST(plan) {
  // Placeholder DST export
  let data = 'DST FILE PLACEHOLDER\n';
  plan.stitches.forEach(s => {
    data += `${s.x},${s.y},${s.colorChange ? 'COLOR' : 'STITCH'}\n`;
  });
  return data;
}