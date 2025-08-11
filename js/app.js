
// js/app.js
import { $, setStatus, bump, initTabs, initLog, log, logError, cvReady, hexToRgb, rgbToHex, clamp } from './lib/ui.js'
import { initDrawTab, getDrawCanvas } from './lib/draw.js'
import { preprocessForQuantize } from './lib/preprocess.js'
import { autoSubjectMaskGrabCut, segmentWithDeeplab } from './lib/segment.js'
import { quantizeSafe, sampleDominant } from './lib/quantize.js'
import { planStitches, drawPreviewColored, HOOP_MM } from './lib/stitches.js'
import { writeDST } from './lib/export_dst.js'

const state = {
  work: document.createElement('canvas'),
  wctx: null,
  paint: null,
  pctx: null,
  userMask: null,
}

const isIOS = /\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent||'')

function ensureMask() {
  const { paint } = state
  if (!state.userMask && paint?.width) state.userMask = new Uint8Array(paint.width * paint.height)
}

function redrawPaint() {
  const { paint, pctx, work, userMask } = state
  $('#paintOverlay')?.classList.add('hidden')
  pctx.clearRect(0, 0, paint.width, paint.height)
  if (work.width) pctx.drawImage(work, 0, 0, paint.width, paint.height)
  if (!userMask) return
  const W = paint.width, H = paint.height, imgD = pctx.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    if (userMask[i]) { imgD.data[i * 4] = 255; imgD.data[i * 4 + 3] = 80; }
  }
  pctx.putImageData(imgD, 0, 0)
}

// ====== Color picker helpers ======
function rebuildColorPickers(seed) {
  const k = clamp(+$('#colors').value || 4, 2, 6)
  const cont = $('#manualColors'); cont.innerHTML = ''
  const palette = seed?.length ? seed : ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00'].slice(0,k)
  for (let i = 0; i < k; i++) {
    const inp = document.createElement('input'); inp.type = 'color'
    inp.value = palette[i] || '#888888'; cont.appendChild(inp)
  }
}
function suggestPaletteToPickers() {
  const { work } = state
  if (!work.width) { rebuildColorPickers(); return }
  const seed = sampleDominant(work, 6).slice(0, clamp(+$('#colors').value || 4, 2, 6)).map(rgbToHex)
  rebuildColorPickers(seed)
}

// ====== Subject paint events ======
function bindPaintEvents() {
  const { paint } = state
  const brushRange = $('#brush'), eraser = $('#eraser'), selectToggle = $('#selectToggle')
  let painting = false
  const toXY = (e) => {
    const r = paint.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top
    return [Math.round(x * (paint.width / r.width)), Math.round(y * (paint.height / r.height))]
  }
  const stamp = (cx,cy,rad,on)=>{
    ensureMask()
    const W=paint.width,H=paint.height,r2=rad*rad,m=state.userMask
    for (let y=Math.max(0,cy-rad); y<Math.min(H,cy+rad); y++){
      const dy=y-cy
      for (let x=Math.max(0,cx-rad); x<Math.min(W,cx+rad); x++){
        const dx=x-cx; if (dx*dx+dy*dy<=r2) m[y*W+x]=on?1:0
      }
    }
    redrawPaint()
  }
  const start = (e)=>{ if (selectToggle.dataset.active!=='1') return; painting=true; const [x,y]=toXY(e); stamp(x,y,+brushRange.value,!eraser.checked); e.preventDefault() }
  const move  = (e)=>{ if (!painting) return; const [x,y]=toXY(e); stamp(x,y,+brushRange.value,!eraser.checked); e.preventDefault() }
  const end   = ()=>{ painting=false }
  paint.addEventListener('mousedown',start); paint.addEventListener('mousemove',move); window.addEventListener('mouseup',end)
  paint.addEventListener('touchstart',start,{passive:false}); paint.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',end)
}

// ====== HEIC support (lazy) ======
async function heicToJpeg(file){
  if(!window.heic2any){
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'
    await new Promise((res,rej)=>{s.onload=res;s.onerror=rej;document.head.appendChild(s)})
  }
  const out=await window.heic2any({blob:file,toType:'image/jpeg',quality:0.92})
  const b=Array.isArray(out)?out[0]:out
  return new File([b],(file.name||'image').replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'})
}
function loadImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file); const im=new Image()
    im.onload=()=>{URL.revokeObjectURL(url); resolve(im)}
    im.onerror=reject; im.src=url
  })
}

// ====== App init ======
async function init() {
  initTabs()
  initLog()
  $('#year').textContent = new Date().getFullYear()

  state.wctx = state.work.getContext('2d', { willReadFrequently: true })
  state.paint = $('#paint'); state.pctx = state.paint.getContext('2d', { willReadFrequently: true })

  // Refine panel toggle
  $('#refineToggle').onchange = ()=> $('#refineBox').classList.toggle('hidden', !$('#refineToggle').checked)

  // Subject buttons
  const selectToggle = $('#selectToggle')
  selectToggle.onclick = ()=> {
    if (selectToggle.dataset.active === '1') { selectToggle.dataset.active = '0'; selectToggle.textContent = '✍️ Select subject' }
    else { selectToggle.dataset.active = '1'; selectToggle.textContent = '✅ Painting (drag)' }
  }
  $('#clearMask').onclick = ()=> { if (state.userMask) { state.userMask.fill(0); redrawPaint() } }
  $('#autoMask').onclick = async ()=>{
    setStatus('Selecting subject…'); bump(15)
    let m = null
    try { if ($('#smartAI').checked) { log('AI segment: DeepLab'); m = await segmentWithDeeplab(state.work) } }
    catch(e){ logError(e,'AI SEGMENT') }
    if (!m) { log('AI not used/failed; falling back to GrabCut'); m = await autoSubjectMaskGrabCut(state.work, state.userMask) }
    if (m && m.some(v=>v)) { state.userMask = m; redrawPaint(); selectToggle.dataset.active='0'; selectToggle.textContent='✍️ Select subject'; setStatus('Subject selected. You can refine by painting.','ok') }
    else { setStatus('Could not find a subject. Try painting a rough area.','error') }
  }

  // Auto/manual options visibility
  $('#autoMode').addEventListener('change', ()=>{ applyModeVisibility() })
  function applyModeVisibility(){ $('#adv').style.display=$('#autoMode').checked?'none':'flex' }
  applyModeVisibility()

  // Size label
  const sizePctRange=$('#sizePct'), sizeOut=$('#sizeOut'); sizeOut.textContent=sizePctRange.value+'%';
  sizePctRange.oninput=()=>sizeOut.textContent=sizePctRange.value+'%'

  // Colors UI
  $('#colors').addEventListener('input',()=>rebuildColorPickers())
  $('#autoColors').addEventListener('change',()=>{
    $('#manualColors').classList.toggle('hidden',$('#autoColors').checked)
    if(!$('#autoColors').checked) suggestPaletteToPickers()
  })
  rebuildColorPickers()

  // Draw tab
  initDrawTab(()=>{
    const drawCv = getDrawCanvas()
    state.work.width = drawCv.width; state.work.height = drawCv.height
    state.wctx.clearRect(0,0,state.work.width,state.work.height)
    state.wctx.drawImage(drawCv,0,0)
    state.paint.width = state.work.width; state.paint.height = state.work.height
    state.userMask = new Uint8Array(state.work.width*state.work.height)
    redrawPaint()
    $('#process').disabled = false; $('#selectToggle').disabled = false; $('#clearMask').disabled = false; $('#autoMask').disabled = false
    $('#download').classList.add('disabled'); $('#downloadPalette').classList.add('disabled')
    if(!$('#autoColors').checked) suggestPaletteToPickers()
    setStatus('Drawing ready. Paint subject or Process.','ok')
  })

  // File input
  $('#file').onchange = async ()=>{
    const f = $('#file').files?.[0]; if(!f) return
    try{
      const safe = $('#safeMode')?.checked
      setStatus('Loading image…'); bump(5); log('File selected: '+(f.name||'(blob)'))
      let chosen=f; const n=(f.name||'').toLowerCase(), t=(f.type||'').toLowerCase()
      if(t.includes('heic')||t.includes('heif')||n.endsWith('.heic')||n.endsWith('.heif')){
        setStatus('Converting HEIC to JPEG…'); bump(10); chosen=await heicToJpeg(f); log('HEIC converted to JPEG')
      }
      const im=await loadImageFromFile(chosen)

      // Downscale large images (stronger in Safe Mode)
      const maxSide = safe ? (isIOS ? 1200 : 1600) : (isIOS ? 1600 : 2200)
      const scale = Math.min(1, maxSide/Math.max(im.width,im.height))
      const W=Math.max(1,Math.round(im.width*scale)), H=Math.max(1,Math.round(im.height*scale))

      state.work.width=W; state.work.height=H
      state.wctx.clearRect(0,0,W,H); state.wctx.drawImage(im,0,0,W,H)

      state.paint.width=W; state.paint.height=H; state.userMask=new Uint8Array(W*H)
      redrawPaint(); $('#process').disabled=false; $('#selectToggle').disabled=false; $('#clearMask').disabled=false; $('#autoMask').disabled=false
      $('#download').classList.add('disabled'); $('#downloadPalette').classList.add('disabled')
      if(!$('#autoColors').checked) suggestPaletteToPickers()
      setStatus(`Image ready (${W}×${H}). Refine subject if needed, then Process.`,'ok'); bump(12)
    }catch(e){logError(e,'FILE LOAD'); setStatus('Could not read image. Try a JPG/PNG.','error')}
  }

  // Self‑check
  $('#envCheck').addEventListener('click', async ()=>{
    log('=== SELF‑CHECK START ===')
    try{
      log(`UserAgent: ${navigator.userAgent}`)
      log(`Cross-origin isolation: ${self.crossOriginIsolated ? 'yes' : 'no'}`)
      log('Checking OpenCV…')
      await cvReady(); log(`cv.Mat OK. ${cv?.getBuildInformation ? 'has build info' : 'basic build'}`)
      log(`CLAHE available: ${!!(cv.CLAHE && cv.Size)}`)
      const c=document.createElement('canvas'); c.width=c.height=64
      const ctx=c.getContext('2d'); ctx.fillStyle='#f00'; ctx.fillRect(0,0,64,64)
      const m=cv.imread(c); const g=new cv.Mat(); cv.cvtColor(m,g,cv.COLOR_RGBA2GRAY)
      log(`OpenCV ops OK (gray ${g.rows}×${g.cols})`); m.delete(); g.delete()
      // Worker test
      let ok=true; try{
        const url=URL.createObjectURL(new Blob(['onmessage=(e)=>postMessage(e.data+1)'],{type:'text/javascript'}))
        const w=new Worker(url); const p=new Promise((res,rej)=>{w.onmessage=e=>res(e.data); w.onerror=rej})
        w.postMessage(41); const ans=await p; w.terminate(); URL.revokeObjectURL(url); ok=(ans===42)
      }catch(_){ok=false}
      log(`Blob worker: ${ok?'OK':'BLOCKED'}`)
    }catch(err){logError(err,'SELF‑CHECK')}
    log('=== SELF‑CHECK END ===')
  })
  $('#logClear').addEventListener('click', ()=> { $('#log').textContent='' })

  // Process
  $('#process').onclick = async ()=>{
    const { work } = state
    if(!work.width){ setStatus('No image loaded.','error'); log('Aborting: work canvas empty','error'); return }

    $('#process').disabled=true; $('#download').classList.add('disabled'); $('#downloadPalette').classList.add('disabled'); bump(0)
    log('=== PROCESS START ===')
    try{
      const auto = $('#autoMode').checked
      const safe = $('#safeMode')?.checked

      // Cap colors in Safe Mode to reduce memory/CPU
      let k = clamp(+$('#colors').value || 4, 2, safe ? 4 : 6)
      if (k !== (+$('#colors').value||4)) { $('#colors').value = k; log(`Safe Mode: limiting colors to ${k}`,'warn') }

      const fixedPalette = $('#autoColors').checked ? null :
        [...$('#manualColors').querySelectorAll('input[type="color"]')].slice(0,k).map(el=>hexToRgb(el.value))
      const hoop = HOOP_MM[$('#hoop').value]

      const removeBg   = auto ? true : $('#removeBg').checked
      const wantOutline= auto ? true : $('#outline').checked
      const angleDeg   = auto ? 45   : (+$('#angle').value||45)
      const densityDefault = safe ? 0.50 : 0.40
      const densityMM  = auto ? densityDefault : (+$('#density').value||densityDefault)
      const sizePct    = auto ? 80   : (+$('#sizePct').value||80)

      // If Safe Mode, quietly disable AI to avoid large downloads
      if (safe && $('#smartAI').checked) { $('#smartAI').checked = false; log('Safe Mode: disabling AI segmenter','warn') }

      setStatus('Preparing…'); bump(5)
      log(`Settings: k=${k}, auto=${auto}, safe=${!!safe}, angle=${angleDeg}, density=${densityMM}, sizePct=${sizePct}, hoop=${$('#hoop').value}`)
      if (fixedPalette) log(`Manual palette: ${fixedPalette.map(rgbToHex).join(', ')}`)

      log('Waiting for OpenCV…'); await cvReady(); bump(8)

      // Subject mask
      let activeMask = null
      try{
        const hasUser = !!(state.userMask && state.userMask.some(v=>v))
        if (removeBg || hasUser) {
          setStatus('Finding subject…'); log('Running GrabCut (with optional paint mask)…')
          activeMask = await autoSubjectMaskGrabCut(work, state.userMask)
          log(`GrabCut mask: ${activeMask && activeMask.some(v=>v) ? 'OK' : 'empty'}`)
        } else if (hasUser) {
          activeMask = state.userMask; log('Using user-painted mask only.')
        }
      }catch(e){ logError(e,'Subject selection') }

      // Preprocess
      setStatus('Enhancing contrast…'); bump(12)
      const pre = preprocessForQuantize(work)
      log(`Preprocess canvas: ${pre.width}×${pre.height}`)

      // Quantize
      setStatus('Reducing colors…'); bump(18)
      const imgData = pre.getContext('2d',{willReadFrequently:true}).getImageData(0,0,pre.width,pre.height)
      const {indexed, palette, W, H} = await quantizeSafe(imgData, k, activeMask)
      const finalPalette = fixedPalette || palette
      log(`Quantized palette (${finalPalette.length}): ${finalPalette.map(rgbToHex).join(', ')}`)
      if (!finalPalette.length) throw new Error('Palette empty after quantization')

      // Stitches plan
      setStatus('Planning stitches…'); bump(40)
      const plan = planStitches({indexed, palette: finalPalette, W, H}, {hoop, sizePct, angleDeg, densityMM, wantOutline})
      log(`Total stitch ops: ${plan.stitches.length}`)

      // Preview & export
      drawPreviewColored(plan, hoop, sizePct)
      setStatus('Writing .DST…')
      const dstBlob=new Blob([writeDST(plan)],{type:'application/octet-stream'})
      $('#download').href=URL.createObjectURL(dstBlob); $('#download').classList.remove('disabled')
      const palText=plan.colors.map((rgb,i)=>`Color ${i+1}: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`).join('\n')
      const palBlob=new Blob([palText],{type:'text/plain'})
      $('#downloadPalette').href=URL.createObjectURL(palBlob); $('#downloadPalette').classList.remove('disabled')

      bump(100); setStatus('Done! Download your .DST and palette.txt.','ok')
      log('=== PROCESS OK ===')
    }catch(err){
      logError(err,'PROCESS')
      setStatus('Processing failed. Check log and try a simpler image.','error')
    }finally{
      $('#process').disabled=false; setTimeout(()=>bump(0),1200)
    }
  }

  // Enable subject painting gestures
  bindPaintEvents()
}

window.addEventListener('error', (e)=>{ log(`Window error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, 'error'); if(e.error?.stack) log(e.error.stack,'error') })
window.addEventListener('unhandledrejection', (e)=>{ log(`Unhandled rejection: ${e.reason?.message || e.reason}`, 'error'); if(e.reason?.stack) log(e.reason.stack,'error') })

init()