export function writeDST(plan){
  const recs=[];let lx=0,ly=0;const to10th=mm=>Math.round(mm*10),clamp121=v=>Math.max(-121,Math.min(121,v));
  for(const s of plan.stitches){
    if(s.end){recs.push(0x00,0x00,0xF3);break;}
    if(s.colorChange){recs.push(0x00,0x00,0xC3);continue;}
    const dx=clamp121(to10th(s.x-lx)),dy=clamp121(to10th(s.y-ly));lx=s.x;ly=s.y;
    const [b1,b2,b3]=pack(dx,dy,!!s.jump);recs.push(b1,b2,b3);
  }
  const header=new Uint8Array(512).fill(0x20),put=(t,o)=>{for(let i=0;i<t.length;i++)header[o+i]=t.charCodeAt(i);};
  put('LA:LOOMABELLE\n',0);
  put(`ST:${String(Math.floor(recs.length/3)).padStart(7,' ')}`,11);
  put(`CO:${String(Math.max(1,plan.colors.length)).padStart(7,' ')}`,24);
  put('+X  100\n-Y  100\n',52); put('AX+ 0\nAY+ 0\nMX+ 0\nMY+ 0\n',80);
  put('PD:******\n',232);
  const out=new Uint8Array(512+recs.length+1); out.set(header,0); out.set(new Uint8Array(recs),512); out[512+recs.length]=0x1A; return out.buffer;
}
function pack(dx,dy,jump){let b1=0,b2=0,b3=0;const ax=Math.abs(dx),ay=Math.abs(dy);
  if(ax&1)b1|=1;if(ax&2)b1|=2;if(ax&4)b1|=4;if(ax&8)b2|=1;if(ax&16)b2|=2;if(ax&32)b2|=4;if(ax&64)b3|=1;
  if(ay&1)b1|=8;if(ay&2)b1|=16;if(ay&4)b1|=32;if(ay&8)b2|=8;if(ay&16)b2|=16;if(ay&32)b2|=32;if(ay&64)b3|=2;
  if(dx<0)b3|=0x20;if(dy<0)b3|=0x40;if(jump)b3|=0x10;return[b1,b2,b3]}
