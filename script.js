// Tab switching + scroll + dynamic hero flowers + palette swatches
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

// Smooth scroll
qsa('[data-scroll]').forEach(btn => btn.addEventListener('click', e => {
  const id = btn.getAttribute('data-scroll');
  const el = qs(id);
  if (el) el.scrollIntoView({behavior:'smooth'});
}));

// Tabs
const tabBtns = qsa('.tab-btn');
const panels = qsa('.panel');
tabBtns.forEach(btn => btn.addEventListener('click', () => {
  tabBtns.forEach(b=>b.classList.toggle('active', b===btn));
  panels.forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel') === btn.getAttribute('data-tab')));
}));

// Year
qs('#year').textContent = new Date().getFullYear();

// Hero flowers
const colors = ['#fda4af','#f9a8d4','#c4b5fd','#93c5fd','#99f6e4','#fde68a','#86efac'];
const flowers = qs('#flowers');
for(let i=0;i<7;i++){
  const a = i/7 * Math.PI*2, r=80;
  const x = 260+Math.cos(a)*r, y=210+Math.sin(a)*r;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  [['cx',x],['cy',y],['r',10],['fill',colors[i%colors.length]]].forEach(([k,v])=>{
    const c = document.createElementNS(g.namespaceURI, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 10); c.setAttribute('fill', colors[i%colors.length]);
  });
  const c1 = document.createElementNS(g.namespaceURI, 'circle'); c1.setAttribute('cx', x); c1.setAttribute('cy', y); c1.setAttribute('r', 10); c1.setAttribute('fill', colors[i%colors.length]);
  const c2 = document.createElementNS(g.namespaceURI, 'circle'); c2.setAttribute('cx', x); c2.setAttribute('cy', y-14); c2.setAttribute('r', 4); c2.setAttribute('fill', '#fde68a');
  const c3 = document.createElementNS(g.namespaceURI, 'circle'); c3.setAttribute('cx', x+10); c3.setAttribute('cy', y+8); c3.setAttribute('r', 5); c3.setAttribute('fill', '#a7f3d0');
  g.append(c1,c2,c3);
  flowers.appendChild(g);
}

// Thread palette swatches
const swatches = qs('.swatches');
['#fb7185','#f472b6','#d8b4fe','#a78bfa','#93c5fd','#38bdf8','#99f6e4','#5eead4','#fde68a','#facc15','#fca5a5','#86efac']
  .forEach(c => {
    const d = document.createElement('div');
    d.style.cssText = `height:40px;border-radius:999px;border:1px solid white;box-shadow:0 1px 2px rgba(0,0,0,.06);background:${c}`;
    swatches.appendChild(d);
  });
