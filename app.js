// tiny helper to keep nav active
document.addEventListener('DOMContentLoaded', () => {
  const here = location.pathname.split('/').pop() || 'index.html';
  const key = here.includes('features') ? 'features'
            : here.includes('pricing')  ? 'pricing'
            : 'home';
  document.querySelectorAll('.nav a').forEach(a=>{
    a.classList.toggle('active', a.dataset.nav===key);
  });
});