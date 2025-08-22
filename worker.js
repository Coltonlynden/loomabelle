// Reserved for heavy ops (PES/DST writers). Runs client-side only.
self.onmessage = e => {
  const {type} = e.data || {};
  if(type==='ping') postMessage({ok:true});
};