function showPreview(imageSrc) {
  const preview = document.createElement("img");
  preview.src = imageSrc;
  preview.alt = "Preview";
  preview.style.maxWidth = "100%";
  document.getElementById("upload-section").appendChild(preview);
}