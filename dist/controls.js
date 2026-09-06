// Input has a single source of truth: gameplay runs only while the canvas owns pointer lock.
export class FPSControls {
  constructor(canvas, { document: doc=globalThis.document, window: win=globalThis.window, onStart=()=>{}, onPause=()=>{}, onError=()=>{}, onAction=()=>{} }={}) {
    Object.assign(this,{canvas,doc,win,onStart,onPause,onError,onAction});
    this.keys=new Set();this.yaw=0;this.pitch=0;this.sensitivity=.9;this.locked=false;this.pending=false;this.firing=false;this.aiming=false;
    doc.addEventListener('pointerlockchange',()=>{
      const acquired=doc.pointerLockElement===canvas;
      if(acquired&&!this.pending&&!this.locked){doc.exitPointerLock();return;}
      this.pending=false;
      if(acquired&&!this.locked){this.clear();this.locked=true;this.onStart();}
      else if(!acquired&&this.locked){this.locked=false;this.clear();this.onPause();}
    });
    doc.addEventListener('pointerlockerror',()=>this.fail());
    win.addEventListener('blur',()=>this.pause());
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)this.pause();});
    doc.addEventListener('mousemove',e=>{if(!this.locked)return;this.look(e.movementX,e.movementY);});
    doc.addEventListener('mousedown',e=>{if(!this.locked)return;if(e.button===0)this.firing=true;if(e.button===2)this.aiming=true;});
    win.addEventListener('mouseup',e=>{if(e.button===0)this.firing=false;if(e.button===2)this.aiming=false;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    win.addEventListener('keydown',e=>{
      if(!this.locked)return;
      if(e.code==='Escape'){this.pause();return;}
      if(['Space','Tab','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat)this.onAction(e.code);
    });
    win.addEventListener('keyup',e=>this.keys.delete(e.code));
  }
  look(dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>1000||Math.abs(dy)>1000)return;
    const scale=.0012*this.sensitivity*(this.aiming?.55:1);
    this.yaw-=dx*scale;
    this.pitch=Math.max(-Math.PI*.485,Math.min(Math.PI*.485,this.pitch-dy*scale));
  }
  clear(){this.keys.clear();this.firing=false;this.aiming=false;}
  fail(){if(this.locked||!this.pending)return;this.pending=false;this.clear();this.onError();}
  request(){
    if(this.locked||this.pending)return;
    this.pending=true;
    // Must happen synchronously within the click gesture, before audio promises.
    try {const result=this.canvas.requestPointerLock();result?.catch(()=>this.fail());}
    catch {this.fail();}
  }
  pause(){
    this.pending=false;
    if(!this.locked){this.clear();return;}
    this.locked=false;this.clear();this.onPause();
    if(this.doc.pointerLockElement===this.canvas)this.doc.exitPointerLock();
  }
}
