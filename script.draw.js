/* Painting tools: paint / erase / wand, text & direction controls */
document.addEventListener('DOMContentLoaded', ()=>{
  const edit = document.getElementById('edit');
  const ctx = edit.getContext('2d',{willReadFrequently:true});

  // tool buttons
  document.querySelectorAll('.brush .toggle').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.brush .toggle').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      EditorState.tool = b.dataset.tool;
    });
  });

  document.getElementById('size').oninput = e => EditorState.size=+e.target.value;

  const lockScrollEl = document.getElementById('lockScroll');
  let drawing=false;

  function applyHistory(){
    if (!EditorState.mask) return;
    EditorState.history.push(EditorState.mask.slice(0));
    if (EditorState.history.length>50) EditorState.history.shift();
    EditorState.redoStack.length=0;
  }
  document.getElementById('undo').onclick=()=>{
    if (EditorState.history.length){
      EditorState.redoStack.push(EditorState.mask);
      EditorState.mask = EditorState.history.pop();
      window.__redraw();
    }
  };
  document.getElementById('redo').onclick=()=>{
    if (EditorState.redoStack.length){
      EditorState.history.push(EditorState.mask);
      EditorState.mask = EditorState.redoStack.pop();
      window.__redraw();
    }
  };
  document.getElementById('clear').onclick=()=>{
    applyHistory();
    EditorState.mask.fill(0);
    window.__redraw();
  };

  // pointer drawing
  const toXY = (e)=>{
    const rect = edit.getBoundingClientRect();
    const x = Math.floor((e.clientX-rect.left) * edit.width / rect.width);
    const y = Math.floor((e.clientY-rect.top) * edit.height/ rect.height);
    return {x,y};
  };

  function dab(x,y,val){
    const r = Math.max(1, (EditorState.size|0));
    const w=edit.width,h=edit.height, m=EditorState.mask;
    for(let j=-r;j<=r;j++){
      for(let i=-r;i<=r;i++){
        const nx=x+i, ny=y+j;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        if (i*i+j*j<=r*r) m[ny*w+nx]=val;
      }
    }
  }

  edit.addEventListener('pointerdown', e=>{
    if (lockScrollEl.checked) document.body.style.overflow='hidden';
    edit.setPointerCapture(e.pointerId);
    const {x,y}=toXY(e);
    if (!EditorState.mask) return;
    applyHistory();
    drawing=true;
    if (EditorState.tool==='wand'){
      const id = ctx.getImageData(0,0,edit.width,edit.height);
      const region = Proc.floodFill(id, x, y, 24);
      for (let i=0;i<region.length;i++){
        if (region[i]) EditorState.mask[i]=255;
      }
      window.__redraw();
      return;
    }
    if (EditorState.tool==='text'||EditorState.tool==='direction') return;
    dab(x,y, EditorState.tool==='erase'?0:255);
    window.__redraw();
  });

  edit.addEventListener('pointermove', e=>{
    if (!drawing) return;
    if (EditorState.tool==='text'||EditorState.tool==='direction'||EditorState.tool==='wand') return;
    const {x,y}=toXY(e);
    dab(x,y, EditorState.tool==='erase'?0:255);
    window.__redraw();
  });

  ['pointerup','pointercancel','pointerleave'].forEach(ev=>{
    edit.addEventListener(ev, e=>{
      drawing=false;
      document.body.style.overflow='';
    });
  });

  // text tool
  document.getElementById('applyText').onclick = ()=>{
    const txt = document.getElementById('text').value.trim();
    if(!txt) return;
    const size = +document.getElementById('textSize').value;
    const angle = +document.getElementById('textAngle').value;
    const curve = +document.getElementById('curve').value; // (not used in this simple baseline)
    EditorState.textLayers.push({text:txt,size,angle,x:edit.width/2,y:edit.height/2,curve});
    window.__redraw();
  };

  // direction overlay
  const dirAngle = document.getElementById('dirAngle');
  dirAngle.oninput = e=>{
    EditorState.directionAngle = +e.target.value;
    document.getElementById('showDir').checked = true;
    drawPreviewHoop(); // update overlay
  };

  // auto highlight
  document.getElementById('autoBtn').onclick = async ()=>{
    if (!EditorState.bmp) return;
    const m = await Proc.autoMask(EditorState.bmp, edit.width, edit.height);
    EditorState.mask = m;
    window.__redraw();
  };

  // show/hide overlay toggles
  document.getElementById('showMask').onchange = window.__redraw;
  document.getElementById('showEdges').onchange = window.__redraw;
});