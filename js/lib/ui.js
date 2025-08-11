// Tiny DOM helpers + shared UI utilities
export const $ = (s)=>document.querySelector(s);
export const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const hexToRgb = h=>{const m=h.replace('#','');return [parseInt(m.slice(0,2),16),parseInt(m.slice(2,4),16),parseInt(m.slice(4,6),16)]};
export const rgbToHex = ([r,g,b])=>'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');

export function setStatus(m,cls=''){ const el=$('#status'); if(el){ el.textContent=m; el.className='status '+cls; } log(m, cls==='error'?'error':(cls==='warn'?'warn':'info')); }
export function bump(p){ const b=$('#bar'); if(b) b.style.width=p+'%'; }

// Logging
export function initLog(){ $('#logClear')?.addEventListener('click', ()=> { $('#log').textContent=''; }); }
export function log(msg,type='info'){
  const box=$('#log'); if(!box) return;
  const ts=new Date().toLocaleTimeString();
  const row=document.createElement('div');
  row.className=`row ${type}`;
  row.innerHTML=`<span class="ts">[${ts}]</span> ${msg}`;
  box.appendChild(row); box.scrollTop=box.scrollHeight;
}
export function logError(err,where=''){ console.error(where||'error',err); log(`${where?where+': ':''}${err?.message||err}`,'error'); if(err?.stack) log(String(err.stack),'error'); }

// Tabs
export function initTabs(){
  const tabUpload=$('#tabUpload'), tabDraw=$('#tabDraw');
  const panelUpload=$('#panelUpload'), panelDraw=$('#panelDraw');
  tabUpload.onclick=()=>{tabUpload.classList.add('active');tabDraw.classList.remove('active');panelUpload.classList.remove('hidden');panelDraw.classList.add('hidden');};
  tabDraw.onclick=()=>{tabDraw.classList.add('active');tabUpload.classList.remove('active');panelDraw.classList.remove('hidden');panelUpload.classList.add('hidden');};
}

// OpenCV ready
export function cvReady(){
  return new Promise((res,rej)=>{
    let tries=0;
    const t=setInterval(()=>{
      tries++;
      if(window.cv&&cv.Mat){ clearInterval(t); res(); }
      if(tries>200){ clearInterval(t); rej(new Error('OpenCV load timeout')); }
    },50);
  });
}
