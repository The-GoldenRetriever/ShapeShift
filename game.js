const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const W = 1040, H = 660;
const $ = id => document.querySelector(id);
const ui = { hp: $('#healthFill'), hpText: $('#healthText'), xp: $('#xpFill'), xpText: $('#xpText'), level: $('#levelText'), weapons: $('#weaponList'), room: $('#waveNumber'), roomState: $('#waveState'), kills: $('#killCount'), timer: $('#timer'), overlay: $('#overlay') };
const keys = new Set();
const types = {
  square: { hp: 3, speed: 42, r: 16, color: '#ff6387', xp: 8, sides: 4 },
  triangle: { hp: 1, speed: 78, r: 14, color: '#ffc857', xp: 6, sides: 3 },
  hex: { hp: 5, speed: 31, r: 20, color: '#ac80ff', xp: 11, sides: 6 },
  trap: { hp: 8, speed: 20, r: 23, color: '#ff965d', xp: 15, sides: 4 },
  bowtie: { hp: 4, speed: 34, r: 18, color: '#6de0bd', xp: 11, sides: 4 },
  diamond: { hp: 3, speed: 92, r: 15, color: '#f36bff', xp: 9, sides: 4 },
  pentagon: { hp: 12, speed: 24, r: 24, color: '#e88bff', xp: 18, sides: 5 },
  prism: { hp: 7, speed: 58, r: 21, color: '#72a8ff', xp: 16, sides: 6 },
  boss: { hp: 360, speed: 27, r: 52, color: '#ff4f9a', xp: 120, sides: 8 }
};
let player, enemies, arrows, enemyBullets, stars, particles, blasts, echoShots, damageNumbers, state;
const difficulties = { easy: { label: 'EASY', hp: .86, speed: .88, note: 'Relaxed enemy stats' }, medium: { label: 'MEDIUM', hp: 1, speed: 1, note: 'Standard enemy stats' }, hard: { label: 'HARD', hp: 1.28, speed: 1.2, note: 'Fast, reinforced enemies' } };

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize(); addEventListener('resize', resize);
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(k)) e.preventDefault(); keys.add(k); if (k === ' ') pause(); if (k === 'shift') dash(); if (k === 'e') phaseCloak(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function reset(difficulty = 'medium') {
  player = { x: W / 2, y: H / 2, r: 16, hp: 100, maxHp: 100, speed: 250, regen: 3, hurtAt: -10, aim: 0 };
  enemies = []; arrows = []; enemyBullets = []; stars = []; particles = []; blasts = []; echoShots = []; damageNumbers = [];
  state = { difficulty, last: performance.now(), time: 0, room: 1, level: 1, xp: 0, need: 60, kills: 0, left: 0, spawnIn: 0, active: true, paused: false, upgradeOpen: false, intermission: false, transitioning: false, roomTransition: 0, exit: null, relicRooms: {}, history: [], echo: null, cloakTime: 0, cloakCooldown: 0, bowIn: 0, laserIn: 0, bombIn: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, lastMoveX: 1, lastMoveY: 0, shake: 0, weapons: { bow: { name: 'LONGBOW', color: '#55e6ff', damage: 2, rate: 1.3, level: 0, upgrades: 0, taken: [], ultimate: false } } };
  beginRoom(); hide();
}
const rand = (a,b) => a + Math.random() * (b-a);
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const ang = (a,b) => Math.atan2(b.y-a.y,b.x-a.x);
const shake = (n) => state.shake = n;
const spawnDamageNumber = (x, y, n, color) => damageNumbers.push({x, y, n, color, life: 0.6});
function edge() {
  const s = Math.floor(Math.random()*4);
  if(s===0) return {x:rand(45,W-45),y:54};
  if(s===1) return {x:W-42,y:rand(60,H-42)};
  if(s===2) return {x:rand(45,W-45),y:H-42};
  return {x:42,y:rand(60,H-42)};
}
function type() {
  const pool=['square','square','triangle'];
  if(state.room>=3) pool.push('hex');
  if(state.room>=6) pool.push('trap');
  if(state.room>=8) pool.push('bowtie');
  if(state.room>=4) pool.push('diamond');
  if(state.room>=10) pool.push('pentagon');
  if(state.room>=12) pool.push('prism');
  return pool[Math.floor(Math.random()*pool.length)];
}
function spawn() {
  const name=type(), spec=types[name], p=edge();
  const difficulty = difficulties[state.difficulty];
  const hp = Math.max(1, Math.ceil(spec.hp * 1.1 * difficulty.hp * (1 + (state.room - 1) * .035)));
  enemies.push({type:name,x:p.x,y:p.y,hp,maxHp:hp,r:spec.r,shoot:rand(1,3),phase:Math.random()*7,flash:0});
}
function beginRoom() {
  state.active=true; state.intermission=false; state.exit=null; state.left=state.room===10?0:9+state.room*3; state.spawnIn=.55;
  if(state.room===10) spawnBoss();
  for(let i=0;i<Math.min(6,state.left);i++){spawn();state.left--;}
  ui.room.textContent=state.room; ui.roomState.textContent=state.room===10?'BOSS CHAMBER':'ROOM HOSTILES INBOUND';
}
function spawnBoss(){const spec=types.boss,difficulty=difficulties[state.difficulty],hp=Math.ceil(spec.hp*difficulty.hp);enemies.push({type:'boss',x:W/2,y:130,hp,maxHp:hp,r:spec.r,shoot:1.1,phase:0,flash:0,boss:true});}
function nearest() {
  let best=null, bestD=Infinity;
  for(const e of enemies){const d=dist(player,e);if(d<bestD){best=e;bestD=d;}}
  return best;
}
function fire() {
  const target=nearest(); if(!target)return;
  player.aim=ang(player,target); const w=state.weapons.bow;
  const shotCount=w.ultimate?3:(w.shots||1), offsets=shotCount>1?Array.from({length:shotCount},(_,i)=>(i-(shotCount-1)/2)*.15):[0];
  for(const o of offsets){const a=player.aim+o;arrows.push({x:player.x+Math.cos(a)*27,y:player.y+Math.sin(a)*27,vx:Math.cos(a)*(w.projectileSpeed||540),vy:Math.sin(a)*(w.projectileSpeed||540),life:1.5,damage:w.damage,pierce:w.pierce||0,color:w.color});}
  burst(player.x+Math.cos(player.aim)*28,player.y+Math.sin(player.aim)*28,w.color,3,55);
}
function hurt(n){if(state.cloakTime>0)return;player.hp=Math.max(0,player.hp-n);player.hurtAt=state.time;shake(12);}
function phaseCloak(){if(!state||!state.hasCloak||state.paused||state.cloakTime>0||state.cloakCooldown>0)return;state.cloakTime=3;state.cloakCooldown=12;burst(player.x,player.y,'#bca7ff',30,180);}
function dash(){
  if(!state||state.paused||state.transitioning||(!state.exit&&state.intermission)||state.dashCooldown>0||state.dashTime>0)return;
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  if(!x&&!y){x=state.lastMoveX;y=state.lastMoveY;}
  const len=Math.hypot(x,y)||1;state.dashX=x/len;state.dashY=y/len;state.dashTime=.22;state.dashCooldown=3;burst(player.x,player.y,'#55e6ff',24,220);
}
function update(dt) {
  state.time+=dt;
  state.dashCooldown=Math.max(0,state.dashCooldown-dt);
  state.cloakCooldown=Math.max(0,state.cloakCooldown-dt);state.cloakTime=Math.max(0,state.cloakTime-dt);
  if(state.transitioning){state.roomTransition-=dt;updateParticles(dt);updateBlasts(dt);if(state.roomTransition<=0)nextRoom();hud();return;}
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  const l=Math.hypot(x,y)||1; if(x||y){state.lastMoveX=x/l;state.lastMoveY=y/l;} if(state.dashTime>0){state.dashTime=Math.max(0,state.dashTime-dt);player.x=clamp(player.x+state.dashX*1200*dt,45,W-45);player.y=clamp(player.y+state.dashY*1200*dt,65,H-45);burst(player.x-state.dashX*10,player.y-state.dashY*10,'#55e6ff',2,90);}else{player.x=clamp(player.x+x/l*player.speed*dt,45,W-45);player.y=clamp(player.y+y/l*player.speed*dt,65,H-45);}
  state.history.unshift({x:player.x,y:player.y});if(state.history.length>24)state.history.pop();updateRelics(dt);
  if(state.time-player.hurtAt>2) player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
  if(state.active&&state.left>0){state.spawnIn-=dt;if(state.spawnIn<=0){spawn();state.left--;state.spawnIn=Math.max(.22,.68-state.room*.02);}}
  state.bowIn-=dt;if(state.bowIn<=0){fire();state.bowIn=1/state.weapons.bow.rate;}
  for(const e of enemies) moveEnemy(e,dt);
  weapons(dt); updateArrows(dt); updateEchoShots(dt); updateEnemyBullets(dt); updateStars(dt); deaths(); updateParticles(dt); updateBlasts(dt); updateDamageNumbers(dt);
  if(state.active&&state.left===0&&enemies.length===0) finishRoom();
  if(state.exit&&dist(player,state.exit)<34)enterTunnel();
  if(player.hp<=0) gameOver();
  hud();
}
function moveEnemy(e,dt) {
  const difficulty=difficulties[state.difficulty], spec=types[e.type], a=ang(e,player)+(e.type==='bowtie'?Math.sin(state.time*5+e.phase)*.75:0);
  e.x+=Math.cos(a)*spec.speed*difficulty.speed*dt;e.y+=Math.sin(a)*spec.speed*difficulty.speed*dt;e.flash=Math.max(0,e.flash-dt);
  e.touch=(e.touch||0)-dt;
  if(dist(e,player)<e.r+player.r&&e.touch<=0){if(state.dashTime<=0){const baseDamage=e.boss?28:10+spec.hp*1.5+(spec.speed>=60?5:0),damage=baseDamage*(1+(state.room-1)*.025)*difficulty.speed*(state.weapons.sword?.guard?.8:1);const lethal=!e.boss&&state.difficulty==='hard'&&(e.type==='trap'||e.type==='pentagon');hurt(lethal?player.hp:damage);}if(!e.boss){e.hp=0;spawnDamageNumber(e.x,e.y,999,'#fff');shake(4);}e.touch=.55;burst(e.x,e.y,spec.color,10,110);}
  e.shoot-=dt;
  if((e.type==='bowtie'||e.boss)&&e.shoot<=0){const b=ang(e,player),shots=e.boss?[-.24,-.12,0,.12,.24]:[0];for(const offset of shots)enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b+offset)*(e.boss?245:195),vy:Math.sin(b+offset)*(e.boss?245:195),r:e.boss?7:5,life:4,damage:(e.boss?16:8+state.room*.5)*difficulty.speed});e.shoot=e.boss?1.15:rand(2,3.4);}
}
function weapons(dt) {
  if(state.weapons.laser){const w=state.weapons.laser;for(const e of enemies)if(e.laserLinger>0){e.laserLinger-=dt;e.hp-=.12*dt;}state.laserIn-=dt;if(state.laserIn<=0){const e=nearest();if(e&&dist(e,player)<=(w.range||420)){e.hp-=w.damage;e.laserLinger=w.linger||0;e.flash=.12;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);shake(1);burst(e.x,e.y,'#c879ff',5,90);w.ticks=(w.ticks||0)+1;if(w.split&&w.ticks%4===0){const second=enemies.filter(x=>x!==e).sort((a,b)=>dist(a,player)-dist(b,player))[0];if(second){second.hp-=w.damage;spawnDamageNumber(second.x,second.y,Math.ceil(w.damage),w.color);}}}state.laserIn=1/w.rate;}}
  if(state.weapons.bomb){state.bombIn-=dt;if(state.bombIn<=0){const w=state.weapons.bomb,t=nearest(),radius=w.radius||96;if(t){for(const e of enemies)if(dist(e,t)<radius){e.hp-=w.damage;e.flash=.18;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);if(w.double){e.hp-=w.damage;spawnDamageNumber(e.x,e.y+10,Math.ceil(w.damage),w.color);}if(w.pull){e.x+=(t.x-e.x)*.18;e.y+=(t.y-e.y)*.18;}}blasts.push({x:t.x,y:t.y,radius,life:.32,maxLife:.32,color:w.color});burst(t.x,t.y,w.color,30,210);shake(8);}state.bombIn=1/w.rate;}}
  if(state.weapons.sword){const w=state.weapons.sword,a=state.time*(w.spin||4),p={x:player.x+Math.cos(a)*(w.reach||68),y:player.y+Math.sin(a)*(w.reach||68)};for(const e of enemies)if(dist(e,p)<e.r+(w.width||11)){e.hp-=w.damage*dt*3;e.flash=.05;if(state.time%0.1<dt){spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);shake(1);}}}
}
function updateArrows(dt) {
  for(const a of arrows){a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;for(const e of enemies)if(a.life>0&&dist(a,e)<e.r+5){e.hp-=a.damage;e.flash=.1;spawnDamageNumber(e.x,e.y,Math.ceil(a.damage),a.color);shake(2);if(a.pierce>0)a.pierce--;else a.life=0;burst(a.x,a.y,a.color,5,80);}}
  arrows=arrows.filter(a=>a.life>0&&a.x>0&&a.x<W&&a.y>0&&a.y<H);
}
function updateEchoShots(dt){for(const s of echoShots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;for(const e of enemies)if(s.life>0&&dist(s,e)<e.r+6){e.hp-=s.damage;e.flash=.12;spawnDamageNumber(e.x,e.y,Math.ceil(s.damage),s.color);s.life=0;burst(s.x,s.y,'#a6d8ff',5,80);}}echoShots=echoShots.filter(s=>s.life>0&&s.x>0&&s.x<W&&s.y>0&&s.y<H);}
function updateEnemyBullets(dt) {
  for(const b of enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(state.dashTime<=0&&dist(b,player)<b.r+player.r){hurt(b.damage||10);b.life=0;burst(player.x,player.y,'#ff6387',8,80);}}
  enemyBullets=enemyBullets.filter(b=>b.life>0&&b.x>0&&b.x<W&&b.y>0&&b.y<H);
}
function updateStars(dt) {
  for(const s of stars){s.spin+=dt*5;const d=dist(s,player);if(d<210){s.x+=(player.x-s.x)*dt*3;s.y+=(player.y-s.y)*dt*3;}if(d<28){state.xp+=s.value;s.dead=true;burst(s.x,s.y,'#ffe17a',8,90);}}
  stars=stars.filter(s=>!s.dead);if(state.xp>=state.need) levelUp();
}
function xpValue(spec){const difficultyBonus=state.difficulty==='hard'?1.1:state.difficulty==='easy'?.95:1;const healthBonus=1+Math.max(0,spec.hp-1)*.03;const speedBonus=spec.speed>=60?1.08:1;return Math.max(1,Math.round(spec.xp*healthBonus*speedBonus*difficultyBonus));}
function deaths(){const alive=[];for(const e of enemies){if(e.hp>0){alive.push(e);continue;}const sp=types[e.type];state.kills++;stars.push({x:e.x,y:e.y,value:xpValue(sp),spin:Math.random()*7});burst(e.x,e.y,sp.color,14,140);if(e.boss)shake(20);}enemies=alive;}
function burst(x,y,color,n,speed){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2;particles.push({x,y,vx:Math.cos(a)*rand(speed*.2,speed),vy:Math.sin(a)*rand(speed*.2,speed),life:rand(.2,.65),color});}}
function updateParticles(dt){for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
function updateBlasts(dt){for(const b of blasts)b.life-=dt;blasts=blasts.filter(b=>b.life>0);}
function makeExit(){const dir=Math.floor(Math.random()*4),margin=115;if(dir===0)return {dir,x:rand(margin,W-margin),y:58};if(dir===1)return {dir,x:W-58,y:rand(margin,H-margin)};if(dir===2)return {dir,x:rand(margin,W-margin),y:H-58};return {dir,x:58,y:rand(margin,H-margin)};}
function finishRoom(){if(state.exit||state.transitioning)return;state.active=false;state.intermission=true;if(state.room%10===0&&!state.relicRooms[state.room]){showRelics();return;}openExit();}
function openExit(){state.exit=makeExit();ui.roomState.textContent='EXIT OPEN — ENTER THE LIGHT';burst(state.exit.x,state.exit.y,'#fff2a8',34,190);}
function enterTunnel(){if(!state.exit||state.transitioning)return;state.transitioning=true;state.roomTransition=.65;state.transitionDir=state.exit.dir;state.exit=null;ui.roomState.textContent='TRAVERSING TUNNEL';}
function nextRoom(){const dir=state.transitionDir;state.room++;state.transitioning=false;state.roomTransition=0;if(dir===0){player.x=W/2;player.y=H-80;}else if(dir===1){player.x=80;player.y=H/2;}else if(dir===2){player.x=W/2;player.y=80;}else{player.x=W-80;player.y=H/2;}beginRoom();}
function weaponPower(){return Object.values(state.weapons).reduce((sum,w)=>sum+(w.damage||0),0);}
function updateRelics(dt){if(state.echo){const ghost=state.history[Math.min(18,state.history.length-1)]||player;state.echo.x=ghost.x;state.echo.y=ghost.y;state.echo.fireIn-=dt;if(state.echo.fireIn<=0){const target=enemies.reduce((best,e)=>!best||dist(e,state.echo)<dist(best,state.echo)?e:best,null);if(target){const a=ang(state.echo,target);echoShots.push({x:state.echo.x,y:state.echo.y,vx:Math.cos(a)*430,vy:Math.sin(a)*430,life:1.5,damage:weaponPower()*.25});burst(state.echo.x,state.echo.y,'#a6d8ff',8,100);}state.echo.fireIn=.42;}}}
function showRelics(){state.paused=true;show('<div class="modal"><div class="eyebrow">BOSS RELIC // ROOM '+state.room+'</div><h2>Choose a relic</h2><p>The exit will open after you claim one.</p><div class="cards"><div class="card"><span class="card-key">RELIC 01</span><h3>ECHO PHANTOM</h3><p>A ghost copies your movement and attacks for 25% of your combined weapon damage.</p><button data-relic="echo">CLAIM</button></div><div class="card"><span class="card-key">RELIC 02</span><h3>PHASE CLOAK</h3><p>Press E to disappear for 3 seconds. You can move freely and take no damage.</p><button data-relic="cloak">CLAIM</button></div><div class="card"><span class="card-key">RELIC 03</span><h3>CORE OVERDRIVE</h3><p>All current weapons fire 25% faster.</p><button data-relic="overdrive">CLAIM</button></div></div></div>');document.querySelectorAll('[data-relic]').forEach(b=>b.onclick=()=>claimRelic(b.dataset.relic));}
function claimRelic(id){if(id==='echo')state.echo={x:player.x,y:player.y,fireIn:0};if(id==='cloak')state.hasCloak=true;if(id==='overdrive')Object.values(state.weapons).forEach(w=>w.rate*=1.25);state.relicRooms[state.room]=true;state.paused=false;hide();openExit();}
const weaponUpgrades={
  bow:[
    ['bow-split','SPLIT-FLIGHT','Fire one additional arrow.'],
    ['bow-pierce','PIERCING HEADS','Arrows pass through one extra enemy.'],
    ['bow-heavy','HEAVY HEADS','Arrows deal +2 damage.'],
    ['bow-draw','QUICK DRAW','Fire 25% more often.'],
    ['bow-seeker','SEEKER FLETCHING','Arrows travel 35% faster.']
  ],
  laser:[
    ['laser-focus','FOCUSED BEAM','Laser damage +0.15 per tick.'],
    ['laser-pulse','STABLE PULSE','Laser fires 20% more often.'],
    ['laser-reach','LONG LENS','Laser can target enemies from farther away.'],
    ['laser-scorch','SCORCHING TRACE','Laser damage-over-time lingers for 0.4 seconds.'],
    ['laser-prism','PRISM SPLIT','Every fourth beam tick hits a second target.']
  ],
  bomb:[
    ['bomb-radius','WIDE RUPTURE','Blast radius +24.'],
    ['bomb-cluster','CLUSTER CORE','Blast deals damage twice.'],
    ['bomb-fuse','SHORT FUSE','Bombs trigger 25% more often.'],
    ['bomb-impact','IMPACT CHARGE','Bomb damage +2.'],
    ['bomb-pull','GRAVITY WELL','Blasts pull nearby enemies toward the center.']
  ],
  sword:[
    ['sword-reach','EXTENDED EDGE','Blade reach +18.'],
    ['sword-spin','RAPID SPIN','Blade rotates 30% faster.'],
    ['sword-arc','WIDE ARC','Blade hit width +10.'],
    ['sword-sharp','STAR SHARPENING','Blade damage +1.'],
    ['sword-guard','KINETIC GUARD','Blade reduces contact damage by 20%.']
  ]
};
const weaponData={laser:['PRISM LASER','#c879ff',.4,4],bomb:['VOID CHARGE','#ff965d',7,.55],sword:['STAR BLADE','#ffe17a',2,1]};
function availableWeaponChoices(){
  const choices=[];
  for(const id of Object.keys(weaponUpgrades)){
    const w=state.weapons[id];
    if(!w) choices.push({id,kind:'unlock',name:weaponData[id][0],desc:id==='laser'?'Unlocks a steady auto-targeting laser.':id==='bomb'?'Unlocks area-damage bombs.':'Unlocks a rotating close-range blade.'});
    else if(w.level<5) for(const u of weaponUpgrades[id]) if(!w.taken.includes(u[0])) choices.push({id:u[0],kind:'weapon',weapon:id,name:u[1],desc:u[2]});
    else if(w.level===5&&!w.ultimate) choices.push({id:id+'-ultimate',kind:'ultimate',weapon:id,name:id==='laser'?'PRISM NOVA':id==='bomb'?'VOID SUPERNOVA':'CELESTIAL BLADE',desc:id==='laser'?'Every pulse targets the three nearest enemies.':id==='bomb'?'Blasts become much larger and deal full damage twice.':'Blade creates a second orbiting edge.'});
  }
  return choices;
}
function shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function levelUp(){
  if(state.paused||state.upgradeOpen)return;
  state.xp-=state.need;state.need=Math.floor(state.need*1.25);state.level++;state.paused=true;state.upgradeOpen=true;
  const weaponChoices=availableWeaponChoices(),globals=[{id:'health',kind:'global',name:'REINFORCED HULL',desc:'Maximum health +25 and fully repairs.'},{id:'speed',kind:'global',name:'RUNNING SHOES',desc:'Movement speed +18%.'},{id:'regen',kind:'global',name:'NANITE REPAIR',desc:'Health regeneration +2 per second.'}],pendingUltimates=weaponChoices.filter(u=>u.kind==='ultimate');
  const choices=pendingUltimates.length?shuffle(pendingUltimates).slice(0,3).concat(shuffle(globals).slice(0,Math.max(0,3-pendingUltimates.length))):shuffle(weaponChoices.concat(globals)).slice(0,3);
  show('<div class="modal"><div class="eyebrow">ASCENSION // LEVEL '+state.level+'</div><h2>Choose an upgrade</h2><p>Each card shows the exact change it will make.</p><div class="cards">'+choices.map((u,i)=>'<div class="card"><span class="card-key">0'+(i+1)+' // '+(u.kind==='ultimate'?'ULTIMATE':'UPGRADE')+'</span><h3>'+u.name+'</h3><p>'+u.desc+'</p><button data-up="'+u.id+'">INSTALL</button></div>').join('')+'</div></div>');
  document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>upgrade(b.dataset.up));
}
function upgrade(id){
  if(!state.upgradeOpen)return;
  state.upgradeOpen=false;
  if(['health','speed','regen'].includes(id)){if(id==='health'){player.maxHp+=25;player.hp=player.maxHp;}if(id==='speed')player.speed*=1.18;if(id==='regen')player.regen+=2;}
  else if(weaponData[id]){const d=weaponData[id];state.weapons[id]={name:d[0],color:d[1],damage:d[2],rate:d[3],level:0,upgrades:0,taken:[],ultimate:false};}
  else if(id.endsWith('-ultimate')){const weapon=id.replace('-ultimate',''),w=state.weapons[weapon];w.ultimate=true;w.level=6;}
  else {const weapon=id.split('-')[0],w=state.weapons[weapon],u=weaponUpgrades[weapon].find(x=>x[0]===id);if(!w||!u||w.taken.includes(id))return;w.taken.push(id);w.upgrades++;w.level=w.upgrades;applyWeaponUpgrade(weapon,id);}
  state.paused=false;hide();
}
function applyWeaponUpgrade(weapon,id){const w=state.weapons[weapon];if(weapon==='bow'){if(id==='bow-split')w.shots=(w.shots||1)+1;if(id==='bow-pierce')w.pierce=(w.pierce||0)+1;if(id==='bow-heavy')w.damage+=2;if(id==='bow-draw')w.rate*=1.25;if(id==='bow-seeker')w.projectileSpeed=(w.projectileSpeed||540)*1.35;}if(weapon==='laser'){if(id==='laser-focus')w.damage+=.15;if(id==='laser-pulse')w.rate*=1.2;if(id==='laser-reach')w.range=Infinity;if(id==='laser-scorch')w.linger=.4;if(id==='laser-prism')w.split=true;}if(weapon==='bomb'){if(id==='bomb-radius')w.radius=(w.radius||96)+24;if(id==='bomb-cluster')w.double=true;if(id==='bomb-fuse')w.rate*=1.25;if(id==='bomb-impact')w.damage+=2;if(id==='bomb-pull')w.pull=true;}if(weapon==='sword'){if(id==='sword-reach')w.reach=(w.reach||68)+18;if(id==='sword-spin')w.spin=5.2;if(id==='sword-arc')w.width=21;if(id==='sword-sharp')w.damage+=1;if(id==='sword-guard')w.guard=true;}
}
function pause(){if(!state||state.intermission)return;state.paused=!state.paused;if(state.paused){show('<div class="modal"><div class="eyebrow">SYSTEM PAUSED</div><h2>Hold the line.</h2><p>Press SPACE or resume when ready.</p><button class="continue" id="resume">RESUME</button></div>');$('#resume').onclick=pause;}else hide();}
function gameOver(){state.paused=true;show('<div class="modal"><div class="eyebrow">SIGNAL LOST</div><h2>Run terminated</h2><p>Room '+state.room+' • '+state.kills+' hostiles cleared</p><button class="continue" id="restart">REBOOT RUN</button></div>');$('#restart').onclick=()=>reset(state.difficulty);}
function show(markup){ui.overlay.innerHTML=markup;ui.overlay.classList.remove('hidden');}function hide(){ui.overlay.classList.add('hidden');ui.overlay.innerHTML='';}
function hud(){ui.hp.style.width=player.hp/player.maxHp*100+'%';ui.hpText.textContent=Math.ceil(player.hp)+' / '+player.maxHp;ui.xp.style.width=Math.min(100,state.xp/state.need*100)+'%';ui.xpText.textContent=Math.floor(state.xp)+' / '+state.need+' XP';ui.level.textContent='LV '+state.level;ui.kills.textContent=state.kills;ui.timer.textContent=new Date(state.time*1000).toISOString().slice(14,19);ui.weapons.innerHTML=Object.values(state.weapons).map(w=>'<span class="weapon-item"><i class="weapon-dot" style="background:'+w.color+'"></i>'+w.name+' <small>★'+w.level+'</small></span>').join('');const dash=document.querySelector('.dash-hud'),text=document.querySelector('#dashText');if(state.dashTime>0){text.textContent='DASHING';dash.classList.remove('cooldown');}else if(state.dashCooldown>0){text.textContent=state.dashCooldown.toFixed(1)+'s';dash.classList.add('cooldown');}else{text.textContent='READY';dash.classList.remove('cooldown');}}
function poly(x,y,r,n,rot){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function updateDamageNumbers(dt){for(const d of damageNumbers){d.y-=40*dt;d.life-=dt;}damageNumbers=damageNumbers.filter(d=>d.life>0);}
function drawDamageNumbers(){ctx.font="bold 16px 'DM Mono', monospace";ctx.textAlign='center';for(const d of damageNumbers){ctx.globalAlpha=d.life/0.6;ctx.fillStyle=d.color;ctx.fillText(d.n,d.x,d.y);}}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);
  const progress=state?.transitioning?1-state.roomTransition/.65:0,dir=state?.transitionDir,dx=dir===1?-progress*W:dir===3?progress*W:0,dy=dir===0?-progress*H:dir===2?progress*H:0;
  ctx.save();
  if(state.shake>0){ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));state.shake*=0.9;}
  ctx.translate(dx,dy);ctx.strokeStyle='#17243a';for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.strokeStyle='#304762';ctx.strokeRect(20,32,W-40,H-58);drawExit();drawStars();drawEnemies();drawProjectiles();drawBlasts();drawParticles();drawEcho();drawPlayer();drawWeaponEffects();drawDamageNumbers();ctx.restore();drawRoomTransition();
}
function drawStars(){for(const s of stars){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.spin);ctx.fillStyle='#ffe17a';ctx.shadowColor='#ffe17a';ctx.shadowBlur=18;poly(0,0,10,5,-Math.PI/2);ctx.fill();ctx.restore();}}
function drawEnemies(){for(const e of enemies){const sp=types[e.type];ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.flash?'#fff':sp.color;ctx.shadowColor=sp.color;ctx.shadowBlur=17;if(e.type==='bowtie'){ctx.rotate(Math.PI/4);ctx.fillRect(-17,-5,34,10);ctx.fillRect(-5,-17,10,34);}else if(e.type==='trap'){ctx.beginPath();ctx.moveTo(-20,17);ctx.lineTo(20,17);ctx.lineTo(13,-18);ctx.lineTo(-13,-18);ctx.fill();}else{poly(0,0,e.r,sp.sides,e.type==='triangle'?-Math.PI/2:Math.PI/4);ctx.fill();}ctx.restore();if(e.hp<e.maxHp){ctx.fillStyle='#1d2738';ctx.fillRect(e.x-17,e.y-e.r-10,34,4);ctx.fillStyle=sp.color;ctx.fillRect(e.x-17,e.y-e.r-10,34*e.hp/e.maxHp,4);}}}
function drawProjectiles(){for(const a of arrows){ctx.save();ctx.strokeStyle=a.color;ctx.shadowColor=a.color;ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x-a.vx*.018,a.y-a.vy*.018);ctx.lineTo(a.x,a.y);ctx.stroke();ctx.restore();}for(const s of echoShots){ctx.fillStyle='#a6d8ff';ctx.shadowColor='#a6d8ff';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.fill();}for(const b of enemyBullets){ctx.fillStyle='#ff6387';ctx.shadowColor='#ff6387';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();ctx.shadowBlur=0;}}
function drawBlasts(){for(const b of blasts){const progress=1-b.life/b.maxLife;ctx.save();ctx.globalAlpha=1-progress;ctx.strokeStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=18;ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*progress,0,Math.PI*2);ctx.stroke();ctx.restore();}}
function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;}
function drawExit(){if(!state?.exit)return;const e=state.exit,dir=[[0,1],[-1,0],[0,-1],[1,0]][e.dir],g=ctx.createRadialGradient(e.x,e.y,3,e.x,e.y,180);g.addColorStop(0,'#fff8c8');g.addColorStop(.2,'#e9d17a99');g.addColorStop(1,'#e9d17a00');ctx.save();ctx.fillStyle=g;ctx.fillRect(e.x-185,e.y-185,370,370);ctx.globalAlpha=.3;ctx.fillStyle='#fff1a3';ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+dir[0]*240-dir[1]*105,e.y+dir[1]*240+dir[0]*105);ctx.lineTo(e.x+dir[0]*240+dir[1]*105,e.y+dir[1]*240-dir[0]*105);ctx.closePath();ctx.fill();ctx.globalAlpha=.8;ctx.fillStyle='#fff8c8';ctx.shadowColor='#ffe17a';ctx.shadowBlur=34;ctx.beginPath();ctx.moveTo(e.x-dir[1]*18,e.y+dir[0]*18);ctx.lineTo(e.x+dir[0]*42-dir[1]*18,e.y+dir[1]*42+dir[0]*18);ctx.lineTo(e.x+dir[0]*42+dir[1]*18,e.y+dir[1]*42-dir[0]*18);ctx.lineTo(e.x+dir[1]*18,e.y-dir[0]*18);ctx.closePath();ctx.fill();ctx.restore();}
function drawEcho(){if(!state?.echo)return;ctx.save();ctx.globalAlpha=.38;ctx.translate(state.echo.x,state.echo.y);ctx.fillStyle='#a6d8ff';ctx.shadowColor='#a6d8ff';ctx.shadowBlur=24;ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawPlayer(){const e=nearest();if(e)player.aim=ang(player,e);ctx.save();ctx.globalAlpha=state.cloakTime>0?.2:1;ctx.translate(player.x,player.y);ctx.rotate(player.aim);ctx.strokeStyle=state.cloakTime>0?'#c7b7ff':'#55e6ff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(32,0);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(14,-9);ctx.quadraticCurveTo(28,0,14,9);ctx.stroke();ctx.restore();ctx.save();ctx.globalAlpha=state.cloakTime>0?.25:1;ctx.translate(player.x,player.y);ctx.fillStyle='#effaff';ctx.shadowColor='#55e6ff';ctx.shadowBlur=28;ctx.beginPath();ctx.arc(0,0,player.r,0,7);ctx.fill();ctx.strokeStyle='#55e6ff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,player.r+6,-Math.PI/2,-Math.PI/2+Math.PI*2*player.hp/player.maxHp);ctx.stroke();ctx.restore();}
function drawWeaponEffects(){if(state.weapons.laser){const e=nearest();if(e){ctx.globalAlpha=.22;ctx.strokeStyle='#c879ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.globalAlpha=1;}}if(state.weapons.bomb){ctx.strokeStyle='#ff965d';ctx.globalAlpha=.25;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(player.x,player.y,state.weapons.bomb.radius||96,0,7);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}if(state.weapons.sword){const w=state.weapons.sword,a=state.time*(w.spin||4);ctx.save();ctx.translate(player.x,player.y);ctx.rotate(a);ctx.strokeStyle='#ffe17a';ctx.shadowColor='#ffe17a';ctx.shadowBlur=14;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(30,0);ctx.lineTo(w.reach||68,0);ctx.stroke();ctx.restore();}}
function drawRoomTransition(){if(!state?.transitioning)return;const progress=1-state.roomTransition/.65,dir=state.transitionDir;ctx.save();ctx.globalAlpha=.15+.45*progress;ctx.fillStyle='#fff1a3';for(let i=0;i<12;i++){const p=(i/12+progress)%1,thickness=2+progress*5;if(dir===0||dir===2)ctx.fillRect(0,p*H,W,thickness);else ctx.fillRect(p*W,0,thickness,H);}ctx.globalAlpha=.8;ctx.fillStyle='#c5f4ff';ctx.font="14px 'DM Mono', monospace";ctx.textAlign='center';ctx.fillText('ENTERING ROOM '+(state.room+1),W/2,H-28);ctx.restore();}
function ultimateEffects(dt){
  for(const [id,w] of Object.entries(state.weapons))if(w.ultimate){w.ultimateIn=(w.ultimateIn||0)-dt;if(w.ultimateIn<=0){
    if(id==='laser')enemies.slice().sort((a,b)=>dist(a,player)-dist(b,player)).slice(0,3).forEach(e=>{e.hp-=w.damage;e.flash=.15;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);});
    if(id==='bomb'){const t=nearest(),radius=(w.radius||96)+30;if(t){for(const e of enemies)if(dist(e,t)<radius){e.hp-=w.damage*2;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage*2),w.color);}blasts.push({x:t.x,y:t.y,radius,life:.32,maxLife:.32,color:w.color});shake(12);}else shake(5);}
    if(id==='sword'){const a=state.time*(w.spin||4)+Math.PI,p={x:player.x+Math.cos(a)*(w.reach||54),y:player.y+Math.sin(a)*(w.reach||54)};for(const e of enemies)if(dist(e,p)<e.r+(w.width||11)){e.hp-=w.damage*dt*3;if(state.time%0.1<dt){spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);}}}
    w.ultimateIn=id==='laser'?.4:id==='bomb'?1:.05;
  }}
}
function frame(now){if(!state){ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);return;}const dt=Math.min(.033,(now-state.last)/1000);state.last=now;if(!state.paused){update(dt);ultimateEffects(dt);}draw();requestAnimationFrame(frame);}
function showStart(){show('<div class="modal"><div class="eyebrow">SHAPEFALL // NEON SURVIVORS</div><h2>Choose your difficulty</h2><p>Move with WASD or arrow keys. Your bow fires automatically at the nearest enemy.</p><div class="cards"><div class="card"><span class="card-key">01 // EASY</span><h3>EASY</h3><p>Enemies have reduced health and move slower.</p><button data-difficulty="easy">START EASY</button></div><div class="card"><span class="card-key">02 // MEDIUM</span><h3>MEDIUM</h3><p>Standard enemy health and speed.</p><button data-difficulty="medium">START MEDIUM</button></div><div class="card"><span class="card-key">03 // HARD</span><h3>HARD</h3><p>Enemies are faster and have 28% more health.</p><button data-difficulty="hard">START HARD</button></div></div></div>');document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>reset(b.dataset.difficulty));}
$('#pauseBtn').onclick=pause;
showStart();requestAnimationFrame(frame);
