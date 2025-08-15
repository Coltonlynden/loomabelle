import { clamp } from './utils.js';
function toUnits(STATE){
  const { prev } = STATE.canvases; const s=1/STATE.pxPerMm*10, cx=prev.width/2, cy=prev.height/2;
  let prevPt=null; const out=[];
  for(const a of STATE.stitches){
    if(a.cmd==='stop'){ out.push({cmd:'stop'}); prevPt=null; continue; }
    if(a.cmd==='jump'||a.cmd==='stitch'){ const x=(a.x-cx)*s, y=(a.y-cy)*s;
      if(prevPt==null){ prevPt=[x,y]; out.push({cmd:'jump',dx:0,dy:0}); }
      else { out.push({cmd:a.cmd,dx:x-prevPt[0],dy:y-prevPt[1]}); prevPt=[x,y]; } }
  } return out;
}
export function encodeDST(STATE){
  const u=toUnits(STATE), bytes=[];
  function enc(dx,dy,flag=0){ dx=Math.max(-121,Math.min(121,Math.round(dx))); dy=Math.max(-121,Math.min(121,Math.round(dy)));
    const b1=(dx&3)|((dx&12)<<2)|((dy&3)<<4)|((dy&12)<<6);
    const b2=((dx&48)>>4)|((dx&192)>>2)|((dy&48))|((dy&192)<<2); const b3=(flag|3)&255; bytes.push(b1&255,b2&255,b3); }
  let colors=0;
  for(const s of u){ if(s.cmd==='stop'){ enc(0,0,0xC0); colors++; continue; }
    if(s.cmd==='jump'){ enc(s.dx,s.dy,0x80); continue; } enc(s.dx,s.dy,0); }
  bytes.push(0,0,0xF3);
  const header=("LA:LOOMABELLE.ST
"+"ST:"+String(bytes.length/3).padStart(7,' ')+"
"+"CO:"+String(colors+1).padStart(3,' ')+"
"+"  "+(" ".repeat(512))).slice(0,512);
  const hb=new TextEncoder().encode(header); const u8=new Uint8Array(hb.length+bytes.length); u8.set(hb,0); u8.set(new Uint8Array(bytes),hb.length); return u8;
}
export function encodeEXP(STATE){
  const u=toUnits(STATE), bytes=[]; const put=(dx,dy,cmd)=>{
    dx=Math.max(-127,Math.min(127,Math.round(dx))); dy=Math.max(-127,Math.min(127,Math.round(dy)));
    if(cmd==='jump') bytes.push(0x80,0x04); if(cmd==='stop') bytes.push(0x80,0x01); if(cmd==='end') bytes.push(0x80,0x00);
    if(cmd==='stitch'||cmd==='jump'){ bytes.push(dx&255,dy&255); } };
  for(const s of u){ if(s.cmd==='stop'){ put(0,0,'stop'); continue; } if(s.cmd==='jump'){ put(s.dx,s.dy,'jump'); continue; } put(s.dx,s.dy,'stitch'); }
  bytes.push(0x80,0x00); return new Uint8Array(bytes);
}
export async function encodeViaAI(STATE, fmt){
  if(!STATE.ai||!STATE.ai.endpoint||!STATE.ai.key) throw new Error('Set ?aiEndpoint=...&aiKey=... or localStorage "loomabelle:cfg".');
  const res=await fetch(STATE.ai.endpoint,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+STATE.ai.key},
    body:JSON.stringify({format:fmt,hoop:STATE.hoop,units:toUnits(STATE)}) });
  if(!res.ok) throw new Error('AI conversion failed'); const buf=await res.arrayBuffer(); return new Uint8Array(buf);
}