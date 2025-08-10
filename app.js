const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const statusText = document.getElementById("status");
const canvas = document.getElementById("work");
const ctx = canvas.getContext("2d");

let uploadedImage = null;

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file && (file.type === "image/png" || file.type === "image/jpeg")) {
    processBtn.disabled = false;
    statusText.textContent = `Ready to process: ${file.name}`;
    uploadedImage = file;
  } else {
    processBtn.disabled = true;
    statusText.textContent = "Please upload a valid JPG or PNG.";
    uploadedImage = null;
  }
});

processBtn.addEventListener("click", async () => {
  if (!uploadedImage) return;

  statusText.textContent = "Processing...";
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      statusText.textContent = "Image processed!";
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(uploadedImage);
});