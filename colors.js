// Minimal Brother-like palette (RGB)
window.EAS_THREADS = [
  {name:"White", rgb:[255,255,255]},
  {name:"Black", rgb:[0,0,0]},
  {name:"Rose Pink", rgb:[236,170,170]},
  {name:"Pink", rgb:[230,150,170]},
  {name:"Salmon", rgb:[230,140,120]},
  {name:"Red", rgb:[200,40,40]},
  {name:"Orange", rgb:[230,150,80]},
  {name:"Yellow", rgb:[245,220,100]},
  {name:"Lime", rgb:[160,210,90]},
  {name:"Green", rgb:[50,140,80]},
  {name:"Sky", rgb:[120,190,230]},
  {name:"Blue", rgb:[50,100,210]},
  {name:"Purple", rgb:[130,100,180]},
  {name:"Brown", rgb:[120,80,60]},
  {name:"Grey", rgb:[150,150,150]},
];
window.nearestThread = function(rgb){
  let best=0,bd=1e9;
  for(let i=0;i<EAS_THREADS.length;i++){
    const t=EAS_THREADS[i], d=(t.rgb[0]-rgb[0])**2+(t.rgb[1]-rgb[1])**2+(t.rgb[2]-rgb[2])**2;
    if(d<bd){bd=d;best=i;}
  }
  return {index:best, ...EAS_THREADS[best]};
};