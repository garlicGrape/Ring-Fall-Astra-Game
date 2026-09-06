export const EYE=1.7, RADIUS=.36, STEP=.52;
const EPS=.0001;
function overlaps(b,x,z){return x+RADIUS>b.minX+EPS&&x-RADIUS<b.maxX-EPS&&z+RADIUS>b.minZ+EPS&&z-RADIUS<b.maxZ-EPS;}
function collides(solids,x,z,feet){return solids.some(b=>overlaps(b,x,z)&&feet<b.maxY-EPS&&feet+EYE>b.minY+EPS);}
export function movePlayer(player,keys,yaw,dt,solids){
  let x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  let z=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);
  const length=Math.hypot(x,z);if(length){x/=length;z/=length;}
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?9:6;
  const vx=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed;
  const vz=(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed;
  // Small substeps prevent passing through thin walls even after a slow frame.
  const steps=Math.max(1,Math.ceil(speed*dt/.15));
  for(let i=0;i<steps;i++)for(const [axis,delta] of [['x',vx*dt/steps],['z',vz*dt/steps]]){
    if(!delta)continue;
    const nx=player.pos.x+(axis==='x'?delta:0),nz=player.pos.z+(axis==='z'?delta:0),feet=player.pos.y-EYE;
    if(!collides(solids,nx,nz,feet)){player.pos[axis]+=delta;continue;}
    if(!player.ground)continue;
    // Step onto the exact surface, never a repeated arbitrary upward nudge.
    const tops=solids.filter(b=>overlaps(b,nx,nz)&&b.maxY>feet+EPS&&b.maxY<=feet+STEP+EPS).map(b=>b.maxY).sort((a,b)=>a-b);
    for(const top of tops)if(!collides(solids,nx,nz,top)){player.pos[axis]+=delta;player.pos.y=top+EYE;break;}
  }
  if(keys.has('Space')&&player.ground){player.vy=8;player.ground=false;keys.delete('Space');}
  const oldFeet=player.pos.y-EYE,oldHead=player.pos.y;
  player.vy-=20*dt;let next=player.pos.y+player.vy*dt;player.ground=false;
  if(player.vy<=0){
    let floor=-Infinity;
    for(const b of solids)if(overlaps(b,player.pos.x,player.pos.z)&&oldFeet>=b.maxY-EPS&&next-EYE<=b.maxY)floor=Math.max(floor,b.maxY);
    if(floor!==-Infinity){next=floor+EYE;player.vy=0;player.ground=true;}
  }else{
    let ceiling=Infinity;
    for(const b of solids)if(overlaps(b,player.pos.x,player.pos.z)&&oldHead<=b.minY+EPS&&next>=b.minY)ceiling=Math.min(ceiling,b.minY);
    if(ceiling!==Infinity){next=ceiling-EPS;player.vy=0;}
  }
  player.pos.y=next;return length>0;
}
