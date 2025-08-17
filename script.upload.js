const uploadInput = document.createElement("input");
uploadInput.type = "file";
uploadInput.accept = "image/*";
uploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      showPreview(reader.result);
      processImage(file);
    };
    reader.readAsDataURL(file);
  }
});
document.getElementById("upload-section").appendChild(uploadInput);
