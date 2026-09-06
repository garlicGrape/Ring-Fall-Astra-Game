export const DEFINITIONS=Object.freeze([
 Object.freeze({name:'AR-7 PULSE RIFLE',cap:30,interval:.105,damage:24,spread:.008,pellets:1,reload:1.65}),
 Object.freeze({name:'SG-6 SCATTERGUN',cap:6,interval:.7,damage:18,spread:.055,pellets:8,reload:1.95})
]);
export class WeaponSystem {
 constructor(){this.reset();}
 reset(){this.active=0;this.ammo=DEFINITIONS.map(w=>w.cap);this.nextShot=[0,0];this.clock=0;this.action=null;}
 get definition(){return DEFINITIONS[this.active];}
 get reloading(){return this.action?.type==='reload';}
 get busy(){return this.action!==null;}
 get progress(){return this.action?Math.min(1,this.action.elapsed/this.action.duration):0;}
 reload(){if(this.busy||this.ammo[this.active]>=this.definition.cap)return false;this.action={type:'reload',weapon:this.active,elapsed:0,duration:this.definition.reload};return true;}
 switchTo(index){
  if(!Number.isInteger(index)||!DEFINITIONS[index]||this.active===index)return false;
  // Cancellation grants no ammo. Per-weapon fire deadlines survive switching.
  this.action={type:'equip',weapon:index,elapsed:0,duration:.32};this.active=index;return true;
 }
 tick(dt){
  if(!Number.isFinite(dt)||dt<0)return null;
  this.clock+=dt;
  if(!this.action)return null;
  const a=this.action;a.elapsed=Math.min(a.duration,a.elapsed+dt);
  if(a.elapsed+1e-9<a.duration)return null;
  this.action=null;
  if(a.type==='reload')this.ammo[a.weapon]=DEFINITIONS[a.weapon].cap;
  return a.type;
 }
 fire(){
  if(this.busy||this.clock+1e-9<this.nextShot[this.active])return false;
  if(this.ammo[this.active]<=0){this.reload();return false;}
  this.ammo[this.active]--;this.nextShot[this.active]=this.clock+this.definition.interval;return true;
 }
}
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// Shared timeline for the visible magazine/cell and weapon pose. Endpoints are neutral.
export function reloadPose(progress){
 const p=Math.max(0,Math.min(1,progress));
 const tilt=ease(p/.2)*(1-ease((p-.78)/.22));
 const out=ease((p-.2)/.16)*(1-ease((p-.52)/.2));
 const latch=Math.sin(ease((p-.73)/.17)*Math.PI);
 return {tilt,magazine:out,latch};
}
// Earliest segment-sphere hit. Used to compare player impacts against cover impacts.
export function segmentSphere(a,b,center,radius){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-center.x,oy=a.y-center.y,oz=a.z-center.z;
 const c=ox*ox+oy*oy+oz*oz-radius*radius;if(c<=0)return 0;
 const aa=dx*dx+dy*dy+dz*dz;if(aa===0)return null;
 const bb=ox*dx+oy*dy+oz*dz,disc=bb*bb-aa*c;if(disc<0)return null;
 const t=(-bb-Math.sqrt(disc))/aa;return t>=0&&t<=1?t:null;
}
