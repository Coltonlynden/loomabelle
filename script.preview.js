// Easbroidery — stage + live preview compositor
(function () {
  const S = (window.EAS ||= {}).state ||= {};
  const base = document.getElementById('canvas');
  const mask = document.getElementById('mask');
  const overlay = document.getElementById('overlay');

  const prev = document.getElementById('preview');
  const stv  = document.getElementById('stitchvis');
  const pctx = prev.getContext('2d', { willReadFrequently: true });
  const sctx = stv.getContext('2d');

  prev.width = prev.height = stv.width = stv.height = 1024;

  // simple 5‑tone posterize by luminance, cached
  function posterize() {
    const id = base.getContext('2d').getImageData(0,0,1024,1024);
    const d  = id.data;
    const bins = [50, 100, 150, 200]; // 5 bands
    const map  = [
      [ 30,  30,  30],
      [110, 110, 110],
      [170, 170, 170],
      [210, 210, 210],
      [245, 245, 245]
    ];
    for (let i=0;i<d.length;i+=4){
      const L = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      let b = 0; while (b < bins.length && L > bins[b]) b++;
      const c = map[b];
      d[i]=c[0]; d[i+1]=c[