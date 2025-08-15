export const $=(s,el=document)=>el.querySelector(s);
export const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
export const clamp=(v,mi,ma)=>Math.max(mi,Math.min(ma,v));
export function hexToRgb(hex){ hex = String(hex||'').replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex||'ffffff',16); return [(n>>16)&255,(n>>8)&255,n&255]; }
export function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>('0'+(v|0).toString(16)).slice(-2)).join(''); }