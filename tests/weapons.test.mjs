import test from 'node:test';
import assert from 'node:assert/strict';
import {WeaponSystem,DEFINITIONS,reloadPose,segmentSphere} from '../dist/weapons.js';
for(const index of [0,1]){
 test(`weapon ${index}: repeated manual reload completes and firing resumes after overshoot`,()=>{
  const w=new WeaponSystem();if(index){w.switchTo(index);w.tick(1);}
  for(let cycle=0;cycle<12;cycle++){
   assert.equal(w.fire(),true);assert.equal(w.reload(),true);
   const before=w.ammo[index];w.tick(.1);assert.equal(w.fire(),false);assert.equal(w.ammo[index],before);
   assert.equal(w.tick(2.01),'reload');assert.equal(w.action,null);assert.equal(w.reloading,false);assert.equal(w.progress,0);assert.equal(w.ammo[index],DEFINITIONS[index].cap);
   assert.equal(w.tick(.01),null);
  }
 });
 test(`weapon ${index}: held fire through empty magazine auto-reloads without deadlock`,()=>{
  const w=new WeaponSystem();if(index){w.switchTo(index);w.tick(1);}
  let shots=0,reloads=0;
  for(let i=0;i<120*30;i++){if(w.tick(1/120)==='reload')reloads++;if(w.fire())shots++;}
  assert.ok(reloads>=2);assert.ok(shots>DEFINITIONS[index].cap*2);assert.ok(w.ammo[index]>=0);
 });
}
test('switching during reload cancels it without refilling either weapon',()=>{
 const w=new WeaponSystem();w.fire();w.reload();w.tick(.8);assert.equal(w.switchTo(1),true);assert.equal(w.reloading,false);assert.equal(w.fire(),false);w.tick(.4);assert.equal(w.ammo[0],29);w.switchTo(0);w.tick(2);assert.equal(w.ammo[0],29);assert.equal(w.fire(),true);
});
test('reload spam does not restart timing, and full magazines do not reload',()=>{
 const w=new WeaponSystem();assert.equal(w.reload(),false);w.fire();w.reload();w.tick(.5);const p=w.progress;assert.equal(w.reload(),false);assert.equal(w.progress,p);w.tick(DEFINITIONS[0].reload-.5);assert.equal(w.busy,false);
});
test('switching cannot bypass shotgun shot cooldown',()=>{
 const w=new WeaponSystem();w.switchTo(1);w.tick(.32);w.fire();w.switchTo(0);w.tick(.1);w.switchTo(1);w.tick(.32);assert.equal(w.fire(),false);w.tick(.28);assert.equal(w.fire(),true);
});
test('reset clears reload, equip, ammo, and all fire deadlines',()=>{
 const w=new WeaponSystem();w.fire();w.reload();w.tick(.3);w.reset();assert.equal(w.active,0);assert.equal(w.busy,false);assert.deepEqual(w.ammo,[30,6]);assert.equal(w.fire(),true);
});
test('reload animation has finite, continuous, neutral endpoints',()=>{
 assert.deepEqual(reloadPose(0),{tilt:0,magazine:0,latch:0});
 for(const n of Object.values(reloadPose(1)))assert.ok(Math.abs(n)<1e-12);
 let previous=reloadPose(0);
 for(let i=1;i<=1000;i++){const pose=reloadPose(i/1000);for(const k of Object.keys(pose)){assert.ok(Number.isFinite(pose[k]));assert.ok(Math.abs(pose[k]-previous[k])<.04);}previous=pose;}
 assert.ok(reloadPose(.45).magazine>.9);assert.ok(reloadPose(.8).magazine===0);
});
test('projectile segment detects swept hit and nearest impact fraction',()=>{
 const a={x:0,y:0,z:0},b={x:10,y:0,z:0},c={x:5,y:0,z:0};
 assert.equal(segmentSphere(a,b,c,1),.4);assert.equal(segmentSphere(a,b,{x:5,y:3,z:0},1),null);
 assert.equal(segmentSphere(a,b,a,1),0);const fraction=segmentSphere(a,b,c,1);assert.ok(fraction*10>3,'cover at distance 3 precedes the player');
});
