document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('photoInput');
  const uploadPreview = document.getElementById('uploadPreview');
  const canvas = document.getElementById('drawArea');
  const ctx = canvas.getContext('2d');

  // Simple pen tool
  let drawing = false;
  canvas.addEventListener('mousedown', () => { drawing = true; });
  canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
  canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a34766';
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  });

  // Load uploaded image
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width > 400 ? 400 : img.width;
        canvas.height = img.height > 300 ? 300 : img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Export placeholder
  function exportFile(format) {
    alert(`Exporting as ${format} (functionality placeholder)`);
  }
  document.getElementById('exportDST').onclick = () => exportFile('DST');
  document.getElementById('exportEXP').onclick = () => exportFile('EXP');
  document.getElementById('exportPES').onclick = () => exportFile('PES');
  document.getElementById('exportJEF').onclick = () => exportFile('JEF');
});