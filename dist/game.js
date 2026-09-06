import * as T from './vendor/three.module.js';
import { FPSControls } from './controls.js?v=3';
import { movePlayer } from './movement.js';
import { WeaponSystem, reloadPose, segmentSphere } from './weapons.js';

const $=id=>document.getElementById(id);
const canvas=$('game');
let renderer;
try {renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});} catch { $('status').textContent='WebGL is unavailable. Enable hardware acceleration and reload in a desktop browser.'; $('play').disabled=true; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#63898d');scene.fog=new T.FogExp2('#729799',.004);
const camera=new T.PerspectiveCamera(76,innerWidth/innerHeight,.05,400);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new T.HemisphereLight('#c6e7f4','#273f43',1.55));
const sun=new T.DirectionalLight('#fff0c5',3.1);sun.position.set(-30,55,-40);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-44,right:44,top:44,bottom:-44,near:1,far:130});sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);
const mats={floor:new T.MeshStandardMaterial({color:'#839296',roughness:.88}),wall:new T.MeshStandardMaterial({color:'#b2b9ae',roughness:.8}),dark:new T.MeshStandardMaterial({color:'#243a42',metalness:.6,roughness:.5}),trim:new T.MeshStandardMaterial({color:'#46616a',metalness:.5,roughness:.6}),cyan:new T.MeshStandardMaterial({color:'#95faff',emissive:'#51dcea',emissiveIntensity:2}),orange:new T.MeshStandardMaterial({color:'#e77738',emissive:'#af4010',emissiveIntensity:.3}),lime:new T.MeshStandardMaterial({color:'#d2fa76',emissive:'#93bc36',emissiveIntensity:.7})};
const solids=[],shotMeshes=[];
function box(x,y,z,w,h,d,mat,solid=false){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.receiveShadow=true;m.castShadow=solid&&h>.3;scene.add(m);if(solid){solids.push({minX:x-w/2,maxX:x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2});shotMeshes.push(m);}return m;}
// Shared visual and collision dimensions. Platforms are reached by low, jumpable steps.
box(0,-.6,0,64,1.2,64,mats.floor,true);
for(let i=-30;i<=30;i+=4){box(i,.012,0,.035,.024,63,mats.trim);box(0,.015,i,63,.024,.035,mats.trim);}
for(const s of [-1,1]){
 box(s*32,1.3,0,1.4,2.6,65,mats.dark,true);box(0,1.3,s*32,65,2.6,1.4,mats.dark,true);
 box(s*31.2,2.65,0,.12,.1,62,mats.cyan);box(0,2.65,s*31.2,62,.1,.12,mats.cyan);
 box(s*23,1.5,0,11,3,30,mats.dark,true);box(s*23,3.03,0,11,.08,30,mats.floor);
 for(let n=0;n<6;n++){box(s*23,(n+1)*.25,18.5-n,7,(n+1)*.5,1,mats.wall,true);box(s*23,(n+1)*.25,-18.5+n,7,(n+1)*.5,1,mats.wall,true);}
 box(s*23,3.1,0,.1,.08,27,mats.cyan);
 for(const z of [-12,12]){box(s*23,4,z,4,2,1.5,mats.wall,true);box(s*23,5.03,z,4,.06,1.6,mats.orange);}
 for(const z of [-25,25]){box(s*12,1.25,z,5,2.5,3,mats.wall,true);box(s*12,2.55,z,5,.1,3,mats.dark);box(s*12-2.55,1,z,.08,1.4,1.5,mats.orange);}
 box(s*8,1.1,5*s,4,2.2,7,mats.wall,true);box(s*8,2.23,5*s,4,.06,7,mats.dark);
 box(s*8,1.6,5*s+3.52,2.5,.12,.08,mats.cyan);
}
function sign(text,color,x,y,z,rotation=0){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#162c34';ctx.fillRect(0,0,512,256);ctx.fillStyle=color;ctx.fillRect(0,0,12,256);ctx.font='bold 142px Arial';ctx.textAlign='center';ctx.fillText(text,260,164);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(3.6,1.8),new T.MeshBasicMaterial({map:tex}));m.position.set(x,y,z);m.rotation.y=rotation;scene.add(m);}
sign('A','#91e9ff',-23,4,-11.23);sign('B','#ffb478',23,4,-11.23);
for(const x of [-23,23]){box(x,.02,24,6,.03,.18,mats.orange);box(x,.02,-24,6,.03,.18,mats.orange);}
// Relay core and four supporting fins.
box(0,.6,0,7,1.2,7,mats.dark,true);box(0,1.22,0,6.7,.06,6.7,mats.trim);
box(0,5.5,0,2.4,8.6,2.4,mats.dark,true);
for(const s of [-1,1]){box(s*1.23,5.5,0,.06,7.3,.5,mats.cyan);box(0,5.5,s*1.23,.5,7.3,.06,mats.cyan);box(s*3,2.7,0,.65,3,5,mats.wall,true);}
const coreRing=new T.Mesh(new T.TorusGeometry(4.2,.1,8,72),mats.cyan);coreRing.rotation.x=Math.PI/2;coreRing.position.y=9.5;scene.add(coreRing);
box(0,11.2,0,4,.65,4,mats.dark);
// Skyline: geometric mountain ridges and a monumental tilted orbital ring.
const rng=(()=>{let s=42;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
const terrainGeo=new T.PlaneGeometry(450,450,100,100);terrainGeo.rotateX(-Math.PI/2);
const vertices=terrainGeo.attributes.position;
for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=vertices.getZ(i),r=Math.hypot(x,z);const ridge=Math.pow(Math.abs(Math.sin(x*.023+Math.sin(z*.019))*Math.cos(z*.025)+.35*Math.sin(x*.071+z*.048)),1.5);const fade=T.MathUtils.smoothstep(r,62,95);vertices.setY(i,-23+fade*(16+ridge*57));}
terrainGeo.computeVertexNormals();const terrain=new T.Mesh(terrainGeo,new T.MeshStandardMaterial({color:'#4b6c70',roughness:1,flatShading:true}));scene.add(terrain);
const sky=new T.Mesh(new T.SphereGeometry(330,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#1c526f')},horizon:{value:new T.Color('#adcbc6')}},vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 horizon;varying vec3 vPosition;void main(){float h=clamp(normalize(vPosition).y*1.3,0.,1.);gl_FragColor=vec4(mix(horizon,top,pow(h,.7)),1.);}' }));scene.add(sky);
box(0,-18,0,500,1,500,new T.MeshStandardMaterial({color:'#416c72',metalness:.5,roughness:.3}));
const ringMat=new T.MeshStandardMaterial({color:'#9cb6b5',metalness:.35,roughness:.6});
const ring=new T.Mesh(new T.TorusGeometry(100,3.1,8,160),ringMat);ring.position.set(10,82,-145);ring.rotation.set(.12,-.3,-.45);scene.add(ring);
const ringEdge=new T.Mesh(new T.TorusGeometry(96.5,.24,5,160),mats.cyan);ringEdge.position.copy(ring.position);ringEdge.rotation.copy(ring.rotation);scene.add(ringEdge);
const planet=new T.Mesh(new T.SphereGeometry(15,32,24),new T.MeshStandardMaterial({color:'#d0cdb0',roughness:1}));planet.position.set(70,65,-150);scene.add(planet);
for(const x of [-28,28])for(const z of [-28,28]){box(x,5,z,1,10,1,mats.dark,true);box(x,9.7,z,1.15,.4,1.15,mats.cyan);}
// First-person weapon, rendered in its own scene to avoid clipping through walls.
const viewScene=new T.Scene();const viewCamera=new T.PerspectiveCamera(60,innerWidth/innerHeight,.01,10);
viewScene.add(new T.HemisphereLight('#e0faff','#213b41',3));const vLight=new T.DirectionalLight('#fff1d9',2);vLight.position.set(-2,3,1);viewScene.add(vLight);
const gun=new T.Group();viewScene.add(gun);
function gunBox(x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);gun.add(m);return m;}
gunBox(.25,-.24,-.5,.17,.18,.49,mats.dark);gunBox(.25,-.19,-.52,.19,.06,.39,mats.trim);gunBox(.25,-.24,-.81,.08,.09,.21,mats.dark);gunBox(.25,-.12,-.5,.05,.065,.21,mats.dark);gunBox(.25,-.09,-.55,.03,.02,.04,mats.cyan);const magazine=gunBox(.25,-.35,-.39,.11,.2,.13,mats.trim);const pump=gunBox(.25,-.32,-.62,.16,.1,.23,mats.dark);const gunStripe=gunBox(.339,-.2,-.52,.008,.035,.22,mats.cyan);
const receiver=gunBox(.25,-.22,-.58,.22,.13,.43,mats.orange);receiver.visible=false;
const supportHand=gunBox(.25,-.36,-.63,.14,.08,.19,mats.trim);
const barrel2=gunBox(.31,-.25,-.8,.055,.07,.25,mats.dark);barrel2.visible=false;
const flash=new T.Mesh(new T.ConeGeometry(.09,.22,5),new T.MeshBasicMaterial({color:'#daff9a',transparent:true,opacity:.9}));flash.rotation.x=-Math.PI/2;flash.position.set(.25,-.24,-.97);flash.visible=false;gun.add(flash);
const arsenal=new WeaponSystem();
let recoil=0,flashTime=0,lastReloadPhase=-1;
const player={pos:new T.Vector3(0,1.7,25),vy:0,ground:true,hp:100,shield:100,hurtAt:-10};
let playing=false,started=false,dead=false,time=0,kills=0,wave=1,nextWave=0,hitTime=0,noticeTime=0,damageTime=0;
let audio;let walking=false;let hudClock=0;
const bots=[],projectiles=[],effects=[];const ray=new T.Raycaster();
const spawns=[[-15,-23],[15,-23],[-15,12],[15,12],[0,-24],[26,5],[-26,-5],[10,22]];
function tone(freq,duration=.08,type='square',vol=.1){if(!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.25),audio.currentTime+duration);g.gain.setValueAtTime(vol*Number($('volume').value),audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function notify(text,seconds=2){$('notice').textContent=text;noticeTime=seconds;}
function makeBot(i){const p=spawns[i%spawns.length];const group=new T.Group();const armor=new T.MeshStandardMaterial({color:'#ae5539',metalness:.65,roughness:.45});const body=new T.Mesh(new T.IcosahedronGeometry(.72,1),armor);body.scale.set(1,.75,1);group.add(body);const eye=new T.Mesh(new T.BoxGeometry(.72,.13,.13),mats.orange);eye.position.set(0,.1,.64);group.add(eye);for(const s of [-1,1]){const wing=new T.Mesh(new T.BoxGeometry(.55,.2,.8),mats.dark);wing.position.x=s*.8;group.add(wing);const glow=new T.Mesh(new T.BoxGeometry(.38,.06,.6),mats.cyan);glow.position.set(s*.8,-.13,0);group.add(glow);}const y=Math.abs(p[0])>17?5:1.9;group.position.set(p[0],y,p[1]);scene.add(group);const b={group,hp:100,baseY:y,phase:i*2,fire:1.2+i*.35,alive:true};group.traverse(m=>{if(m.isMesh){m.userData.bot=b;m.castShadow=true;}});bots.push(b);}
const sharedMaterials=new Set(Object.values(mats));
function disposeBot(b){scene.remove(b.group);const ownMaterials=new Set();b.group.traverse(m=>{if(m.isMesh){m.geometry.dispose();if(!sharedMaterials.has(m.material))ownMaterials.add(m.material);}});ownMaterials.forEach(m=>m.dispose());}
function clearEffects(){for(const e of effects){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}effects.length=0;}
function clearProjectiles(){for(const p of projectiles){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}projectiles.length=0;}
function spawnWave(){clearProjectiles();for(const b of bots)disposeBot(b);bots.length=0;for(let i=0;i<Math.min(3+wave,8);i++)makeBot(i);notify('WAVE '+String(wave).padStart(2,'0')+' / CLEAR THE DRONES',3);}
function reset(){for(const p of projectiles){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}projectiles.length=0;player.pos.set(0,1.7,25);player.vy=0;player.hp=100;player.shield=100;player.hurtAt=-10;player.ground=true;controls.yaw=0;controls.pitch=0;kills=0;wave=1;time=0;nextWave=0;dead=false;arsenal.reset();syncWeapon();recoil=0;flashTime=0;hitTime=0;damageTime=0;noticeTime=0;lastReloadPhase=-1;camera.fov=76;camera.updateProjectionMatrix();gun.position.set(0,0,0);gun.rotation.set(0,0,0);clearEffects();spawnWave();}
function showPause(){playing=false;accumulator=0;document.body.classList.remove('playing');$('menu').classList.remove('hidden');$('hud').classList.add('hidden');if(started&&!dead){$('play').innerHTML='RESUME SIMULATION <span>↗</span>';$('status').textContent='Paused · Click Resume to capture your mouse. Escape releases it.';}}
function pause(){controls.pause();if(playing)showPause();}
function begin(){if(!started||dead){reset();started=true;}playing=true;accumulator=0;last=performance.now();camera.position.copy(player.pos);camera.rotation.set(controls.pitch,controls.yaw,0,'YXZ');previousPos.copy(player.pos);document.body.classList.add('playing');$('menu').classList.add('hidden');$('hud').classList.remove('hidden');hud();}
const controls=new FPSControls(canvas,{onStart:begin,onPause:showPause,onError:()=>{
  $('status').textContent='Mouse capture was blocked. Open the game in its own tab, then click Deploy again.';
  $('openTab').classList.remove('hidden');
},onAction:code=>{if(code==='Digit1')switchWeapon(0);if(code==='Digit2')switchWeapon(1);if(code==='KeyR')reload();}});
controls.sensitivity=Number($('sensitivity').value);
$('sensitivity').oninput=()=>{controls.sensitivity=Number($('sensitivity').value);$('sensitivityValue').textContent=controls.sensitivity.toFixed(1);};
function play(){
  controls.request();
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}
}
$('play').onclick=play;$('menuButton').onclick=()=>playing?pause():play();
function syncWeapon(){const shotgun=arsenal.active===1;barrel2.visible=shotgun;receiver.visible=shotgun;gunStripe.material=shotgun?mats.orange:mats.cyan;magazine.scale.set(shotgun?1.3:1,shotgun?.7:1,1);}
function switchWeapon(n){if(!arsenal.switchTo(n))return;syncWeapon();recoil=0;flashTime=0;lastReloadPhase=-1;controls.aiming=false;tone(300,.06,'sine',.08);hud();}
function reload(){if(arsenal.reload()){controls.aiming=false;lastReloadPhase=-1;flashTime=0;hud();}}
function blocked(x,z,feet){return solids.some(b=>feet<b.maxY-.12&&feet+1.65>b.minY+.1&&x+.38>b.minX&&x-.38<b.maxX&&z+.38>b.minZ&&z-.38<b.maxZ);}
function move(dt){walking=movePlayer(player,controls.keys,controls.yaw,dt,solids);if(player.pos.y<-20)hurt(1000);camera.position.copy(player.pos);camera.rotation.set(controls.pitch,controls.yaw,0,'YXZ');camera.updateMatrixWorld(true);}
function line(a,b,color,ttl=.075){const geo=new T.BufferGeometry().setFromPoints([a,b]);const mat=new T.LineBasicMaterial({color,transparent:true,opacity:.8});const mesh=new T.Line(geo,mat);scene.add(mesh);effects.push({mesh,ttl,max:ttl});}
function explode(pos){for(let i=0;i<9;i++){const end=pos.clone().add(new T.Vector3((Math.random()-.5)*3,(Math.random()-.3)*3,(Math.random()-.5)*3));line(pos.clone(),end,'#ffa563',.24);}}
function fire(){const w=arsenal.definition;if(!arsenal.fire())return;recoil=1;flashTime=.045;tone(arsenal.active===0?160:75,arsenal.active===0?.09:.23,'sawtooth',arsenal.active===0?.13:.25);
 const targets=[...shotMeshes,...bots.filter(b=>b.alive).map(b=>b.group)];
 for(let i=0;i<w.pellets;i++){const dir=new T.Vector3((Math.random()-.5)*w.spread,(Math.random()-.5)*w.spread,-1).normalize().applyQuaternion(camera.quaternion);ray.set(camera.position,dir);ray.far=110;const hit=ray.intersectObjects(targets,true).find(h=>!h.object.userData.bot||h.object.userData.bot.alive);const end=hit?hit.point:camera.position.clone().addScaledVector(dir,90);line(camera.position.clone().add(new T.Vector3(.22,-.2,-.5).applyQuaternion(camera.quaternion)),end,arsenal.active===0?'#cfff90':'#ffc777');if(hit?.object.userData.bot){const b=hit.object.userData.bot;if(!b.alive)continue;const damage=arsenal.active===1?w.damage*Math.max(.2,1-hit.distance/35):w.damage;b.hp-=damage;hitTime=.13;if(b.hp<=0){b.alive=false;b.group.visible=false;kills++;explode(b.group.position);tone(550,.15,'triangle',.12);notify('DRONE ELIMINATED',1.1);}}}
}
function hurt(n){if(dead)return;player.hurtAt=time;damageTime=.35;const previousShield=player.shield;const absorbed=Math.min(player.shield,n);player.shield-=absorbed;player.hp-=n-absorbed;tone(previousShield>0&&player.shield===0?95:420,.08,'sine',.14);if(previousShield>0&&player.shield===0)notify('SHIELD OFFLINE / FIND COVER',1.5);if(player.hp<=0){player.hp=0;dead=true;arsenal.action=null;flashTime=0;pause();$('play').innerHTML='REDEPLOY <span>↗</span>';$('status').textContent='Simulation ended · '+kills+' eliminations · Wave '+wave;}}
function updateBots(dt){for(const b of bots){if(!b.alive)continue;const p=b.group.position;b.group.lookAt(player.pos.x,p.y,player.pos.z);p.y=b.baseY+Math.sin(time*2+b.phase)*.25;const distance=p.distanceTo(player.pos);const orbit=new T.Vector3(Math.sin(time*.4+b.phase),0,Math.cos(time*.4+b.phase)).multiplyScalar(dt*1.4);if(Math.abs(p.x+orbit.x)<30&&Math.abs(p.z+orbit.z)<30&&!blocked(p.x+orbit.x,p.z+orbit.z,p.y-.6)){p.add(orbit);}b.fire-=dt;if(b.fire<=0&&distance<52){b.fire=Math.max(.65,2.1-wave*.12)+Math.random()*.6;const direction=player.pos.clone().sub(p).normalize();ray.set(p,direction);ray.far=distance;const cover=ray.intersectObjects(shotMeshes,false)[0];if(!cover){const mesh=new T.Mesh(new T.SphereGeometry(.13,6,6),new T.MeshBasicMaterial({color:'#ff7848'}));mesh.position.copy(p).addScaledVector(direction,1);scene.add(mesh);projectiles.push({mesh,vel:direction.multiplyScalar(12+Math.min(wave,8)),life:5});}}}
 for(let i=projectiles.length-1;i>=0;i--){
  const p=projectiles[i],step=p.vel.clone().multiplyScalar(dt),end=p.mesh.position.clone().add(step);
  ray.set(p.mesh.position,step.clone().normalize());ray.far=step.length();
  const wall=ray.intersectObjects(shotMeshes,false)[0];
  const impact=segmentSphere(p.mesh.position,end,player.pos.clone().add(new T.Vector3(0,-.45,0)),.65);
  const hit=impact!==null&&(!wall||impact*step.length()<wall.distance);
  p.mesh.position.copy(end);p.life-=dt;
  if(hit)hurt(18);
  if(hit||wall||p.life<0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();projectiles.splice(i,1);}
  if(dead)return;
 }

 if(bots.every(b=>!b.alive)&&nextWave===0){clearProjectiles();nextWave=4;notify('SECTOR CLEAR / NEXT WAVE INCOMING',3.8);player.shield=100;player.hp=Math.min(100,player.hp+30);}if(nextWave>0){nextWave-=dt;if(nextWave<=0){nextWave=0;wave++;spawnWave();}}
}
function hud(){const w=arsenal.definition,ammo=arsenal.ammo[arsenal.active];$('ammo').textContent=String(ammo).padStart(2,'0');$('weaponName').textContent=w.name;$('shieldBar').style.width=player.shield+'%';$('health').textContent=Math.ceil(player.hp);$('kills').textContent=String(kills).padStart(2,'0');$('wave').textContent='WAVE '+String(wave).padStart(2,'0');
 $('reloadHint').textContent=arsenal.reloading?'RELOADING '+Math.round(arsenal.progress*100)+'%':arsenal.busy?'EQUIPPING…':ammo===w.cap?'MAGAZINE FULL':'R  RELOAD';
 $('reloadTrack').hidden=!arsenal.reloading;$('reloadProgress').style.width=(arsenal.progress*100)+'%';
 $('slot1').classList.toggle('selected',arsenal.active===0);$('slot2').classList.toggle('selected',arsenal.active===1);$('hit').style.opacity=hitTime>0?'1':'0';$('damage').style.opacity=Math.max(0,damageTime*1.7);
}
const STEP_TIME=1/120;
let last=performance.now(),accumulator=0;
const previousPos=player.pos.clone();
function simulate(dt){
 time+=dt;recoil=Math.max(0,recoil-dt*8);flashTime-=dt;hitTime-=dt;noticeTime-=dt;damageTime=Math.max(0,damageTime-dt);
 if(noticeTime<=0)$('notice').textContent='';
 const completed=arsenal.tick(dt);if(completed==='reload'){tone(430,.07,'triangle',.1);lastReloadPhase=-1;}
 if(arsenal.reloading){const phase=arsenal.progress<.2?0:arsenal.progress<.55?1:arsenal.progress<.75?2:3;if(phase!==lastReloadPhase){tone([220,170,320,450][phase],.055,'triangle',.09);lastReloadPhase=phase;}}
 if(time-player.hurtAt>5)player.shield=Math.min(100,player.shield+24*dt);
 previousPos.copy(player.pos);move(dt);if(!playing)return;
 updateBots(dt);if(!playing)return;scene.updateMatrixWorld(true);
 if(controls.firing)fire();
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.ttl-=dt;e.mesh.material.opacity=Math.max(0,e.ttl/e.max);if(e.ttl<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1);}}
}
function loop(now){
 requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.1);last=now;
 if(playing){
  accumulator+=dt;
  while(accumulator>=STEP_TIME&&playing){simulate(STEP_TIME);accumulator-=STEP_TIME;}
  accumulator=Math.max(0,accumulator);
  camera.position.lerpVectors(previousPos,player.pos,accumulator/STEP_TIME);
  camera.rotation.set(controls.pitch,controls.yaw,0,'YXZ');
  const aiming=controls.aiming&&!arsenal.busy;const targetFov=aiming?58:76;camera.fov=T.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-16*dt));camera.updateProjectionMatrix();
  const bob=walking&&player.ground?Math.sin(time*10)*.004:0;
  const pose=reloadPose(arsenal.reloading?arsenal.progress:0);
  const equip=arsenal.action?.type==='equip'?1-arsenal.progress:0;
  // Three-phase reload: tilt to expose magazine, remove/seat cell, return to aim.
  // All components are assigned each frame so cancellation cannot leave stale transforms.
  const targetX=(aiming?-.15:0)-pose.tilt*.025;
  gun.position.x=T.MathUtils.lerp(gun.position.x,targetX,1-Math.exp(-18*dt));
  gun.position.y=.025+bob+pose.tilt*.11-equip*.22;
  gun.position.z=recoil*.065+pose.tilt*.025;
  gun.rotation.set(recoil*.08+pose.tilt*.17+equip*.3,pose.tilt*.12,-pose.tilt*.3);
  magazine.position.set(.25+pose.magazine*.065,-.35-pose.magazine*.10,-.39+pose.magazine*.035);
  magazine.rotation.z=-pose.magazine*.12;
  pump.position.z=-.62+(arsenal.active===1?recoil*.085:pose.latch*.025);
  supportHand.position.set(.25+pose.magazine*.065,-.36-pose.magazine*.12,-.63+pose.tilt*.18);
  hudClock+=dt;if(hudClock>.04){hud();hudClock=0;}
 }else if(!started){const t=now*.000025;camera.position.set(14+Math.sin(t)*2,8.5,28);camera.lookAt(-3,4,-5);}
 coreRing.rotation.z=now*.00015;renderer.autoClear=true;renderer.render(scene,camera);
 if(playing){flash.visible=flashTime>0;renderer.autoClear=false;renderer.clearDepth();renderer.render(viewScene,viewCamera);}
}
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();viewCamera.aspect=camera.aspect;viewCamera.updateProjectionMatrix();});
requestAnimationFrame(loop);
