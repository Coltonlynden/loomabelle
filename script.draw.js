const drawCanvas = document.createElement("canvas");
drawCanvas.id = "drawCanvas";
drawCanvas.width = 500;
drawCanvas.height = 400;
document.getElementById("draw-section").appendChild(drawCanvas);

const ctx = drawCanvas.getContext("2d");
let drawing = false;

drawCanvas.addEventListener("mousedown", () => { drawing = true; });
drawCanvas.addEventListener("mouseup", () => { drawing = false; ctx.beginPath(); });
drawCanvas.addEventListener("mousemove", draw);

function draw(e) {
  if (!drawing) return;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}
