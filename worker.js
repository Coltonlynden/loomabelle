// Reserved for heavy ops (vector fill, PES/DST writers).
// Hook: postMessage({type:'write-pes', stitches, bbox, px_per_mm})
self.onmessage = (e)=>{
  const {type} = e.data || {};
  if(type==='ping'){ postMessage({ok:true}); }
  // PES/DST encoders will be added here in the next increment.
};