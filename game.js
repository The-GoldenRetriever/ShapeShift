const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const W = 1040, H = 660;
const $ = id => document.querySelector(id);
const ui = { hp: $('#healthFill'), hpText: $('#healthText'), xp: $('#xpFill'), xpText: $('#xpText'), level: $('#levelText'), weapons: $('#weaponList'), wave: $('#waveNumber'), waveState: $('#waveState'), kills: $('#killCount'), timer: $('#timer'), overlay: $('#overlay') };
const keys = new Set();
const types = {
  square: { hp: 3, speed: 42, r: 16, color: '#ff6387', xp: 8, sides: 4 },
  triangle: { hp: 1, speed: 78, r: 14, color: '#ffc857', xp: 6, sides: 3 },
  hex: { hp: 5, speed: 31, r: 20, color: '#ac80ff', xp: 11, sides: 6 },
  trap: { hp: 8, speed: 20, r: 23, color: '#ff965d', xp: 15, sides: 4 },
  bowtie: { hp: 4, speed: 34, r: 18, color: '#6de0bd', xp: 11, sides: 4 },
  diamond: { hp: 3, speed: 92, r: 15, color: '#f36bff', xp: 9, sides: 4 },
  pentagon: { hp: 12, speed: 24, r: 24, color: '#e88bff', xp: 18, sides: 5 },
  prism: { hp: 7, speed: 58, r: 21, color: '#72a8ff', xp: 16, sides: 6 }
};
let player, enemies, arrows, enemyBullets, stars, particles, state;
const difficulties = { easy: { label: 'EASY', hp: .86, speed: .88, note: 'Relaxed enemy stats' }, medium: { label: 'MEDIUM', hp: 1, speed: 1, note: 'Standard enemy stats' }, hard: { label: 'HARD', hp: 1.28, speed: 1.2, note: 'Fast, reinforced enemies' } };

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize(); addEventListener('resize', resize);
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(k)) e.preventDefault(); keys.add(k); if (k === ' ') pause(); if (k === 'shift') dash(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function reset(difficulty = 'medium') {
  player = { x: W / 2, y: H / 2, r: 16, hp: 100, maxHp: 100, speed: 250, regen: 3, hurtAt: -10, aim: 0 };
  enemies = []; arrows = []; enemyBullets = []; stars = []; particles = [];
  state = { difficulty, last: performance.now(), time: 0, wave: 1, level: 1, xp: 0, need: 60, kills: 0, left: 0, spawnIn: 0, active: true, paused: false, intermission: false, bowIn: 0, laserIn: 0, bombIn: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, lastMoveX: 1, lastMoveY: 0, weapons: { bow: { name: 'LONGBOW', color: '#55e6ff', damage: 2, rate: 1.3, level: 1 } } };
  beginWave(); hide();
}
const rand = (a,b) => a + Math.random() * (b-a);
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const ang = (a,b) => Math.atan2(b.y-a.y,b.x-a.x);
function edge() {
  const s = Math.floor(Math.random()*4);
  if(s===0) return {x:rand(45,W-45),y:54};
  if(s===1) return {x:W-42,y:rand(60,H-42)};
  if(s===2) return {x:rand(45,W-45),y:H-42};
  return {x:42,y:rand(60,H-42)};
}
function type() {
  const pool=['square','square','triangle'];
  if(state.wave>=3) pool.push('hex');
  if(state.wave>=6) pool.push('trap');
  if(state.wave>=8) pool.push('bowtie');
  if(state.wave>=4) pool.push('diamond');
  if(state.wave>=10) pool.push('pentagon');
  if(state.wave>=12) pool.push('prism');
  return pool[Math.floor(Math.random()*pool.length)];
}
function spawn() {
  const name=type(), spec=types[name], p=edge();
  const difficulty = difficulties[state.difficulty];
  const hp = Math.max(1, Math.ceil(spec.hp * 1.1 * difficulty.hp * (1 + (state.wave - 1) * .035)));
  enemies.push({type:name,x:p.x,y:p.y,hp,maxHp:hp,r:spec.r,shoot:rand(1,3),phase:Math.random()*7,flash:0});
}
function beginWave() {
  state.active=true; state.intermission=false; state.left=9+state.wave*3; state.spawnIn=.55;
  for(let i=0;i<Math.min(6,state.left);i++){spawn();state.left--;}
  ui.wave.textContent=state.wave; ui.waveState.textContent='HOSTILES INBOUND';
}
function nearest() {
  let best=null, bestD=Infinity;
  for(const e of enemies){const d=dist(player,e);if(d<bestD){best=e;bestD=d;}}
  return best;
}
function fire() {
  const target=nearest(); if(!target)return;
  player.aim=ang(player,target); const w=state.weapons.bow, spread=w.level>=5?[-.15,0,.15]:[0];
  for(const o of spread){const a=player.aim+o;arrows.push({x:player.x+Math.cos(a)*27,y:player.y+Math.sin(a)*27,vx:Math.cos(a)*540,vy:Math.sin(a)*540,life:1.5,damage:w.damage,color:w.color});}
  burst(player.x+Math.cos(player.aim)*28,player.y+Math.sin(player.aim)*28,w.color,3,55);
}
function hurt(n){player.hp=Math.max(0,player.hp-n);player.hurtAt=state.time;}
function dash(){
  if(!state||state.paused||state.intermission||state.dashCooldown>0||state.dashTime>0)return;
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  if(!x&&!y){x=state.lastMoveX;y=state.lastMoveY;}
  const len=Math.hypot(x,y)||1;state.dashX=x/len;state.dashY=y/len;state.dashTime=.18;state.dashCooldown=5;burst(player.x,player.y,'#55e6ff',12,130);
}
function update(dt) {
  state.time+=dt;
  state.dashCooldown=Math.max(0,state.dashCooldown-dt);
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  const l=Math.hypot(x,y)||1; if(x||y){state.lastMoveX=x/l;state.lastMoveY=y/l;} if(state.dashTime>0){state.dashTime=Math.max(0,state.dashTime-dt);player.x=clamp(player.x+state.dashX*560*dt,45,W-45);player.y=clamp(player.y+state.dashY*560*dt,65,H-45);}else{player.x=clamp(player.x+x/l*player.speed*dt,45,W-45);player.y=clamp(player.y+y/l*player.speed*dt,65,H-45);}
  if(state.time-player.hurtAt>2) player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
  if(state.active&&state.left>0){state.spawnIn-=dt;if(state.spawnIn<=0){spawn();state.left--;state.spawnIn=Math.max(.22,.68-state.wave*.02);}}
  state.bowIn-=dt;if(state.bowIn<=0){fire();state.bowIn=1/state.weapons.bow.rate;}
  for(const e of enemies) moveEnemy(e,dt);
  weapons(dt); updateArrows(dt); updateEnemyBullets(dt); updateStars(dt); deaths(); updateParticles(dt);
  if(state.active&&state.left===0&&enemies.length===0) finishWave();
  if(player.hp<=0) gameOver();
  hud();
}
function moveEnemy(e,dt) {
  const difficulty=difficulties[state.difficulty], spec=types[e.type], a=ang(e,player)+(e.type==='bowtie'?Math.sin(state.time*5+e.phase)*.75:0);
  e.x+=Math.cos(a)*spec.speed*difficulty.speed*dt;e.y+=Math.sin(a)*spec.speed*difficulty.speed*dt;e.flash=Math.max(0,e.flash-dt);
  e.touch=(e.touch||0)-dt;
  if(dist(e,player)<e.r+player.r&&e.touch<=0){if(state.dashTime<=0){const damage=(10+spec.hp*1.5+(spec.speed>=60?5:0))*(1+(state.wave-1)*.025)*difficulty.speed;const lethal=state.difficulty==='hard'&&(e.type==='trap'||e.type==='pentagon');hurt(lethal?player.hp:damage);}e.hp=0;e.touch=.55;burst(e.x,e.y,spec.color,10,110);}
  e.shoot-=dt;
  if(e.type==='bowtie'&&e.shoot<=0){const b=ang(e,player);enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b)*195,vy:Math.sin(b)*195,r:5,life:4,damage:(8+state.wave*.5)*difficulty.speed});e.shoot=rand(2,3.4);}
}
function weapons(dt) {
  if(state.weapons.laser){state.laserIn-=dt;if(state.laserIn<=0){const e=nearest();if(e){e.hp-=state.weapons.laser.damage;e.flash=.12;burst(e.x,e.y,'#c879ff',5,90);}state.laserIn=1/state.weapons.laser.rate;}}
  if(state.weapons.bomb){state.bombIn-=dt;if(state.bombIn<=0){const t=nearest();if(t){for(const e of enemies)if(dist(e,t)<84)e.hp-=state.weapons.bomb.damage;burst(t.x,t.y,'#ff965d',22,170);}state.bombIn=1/state.weapons.bomb.rate;}}
  if(state.weapons.sword){const a=state.time*4,p={x:player.x+Math.cos(a)*54,y:player.y+Math.sin(a)*54};for(const e of enemies)if(dist(e,p)<e.r+11)e.hp-=state.weapons.sword.damage*dt*3;}
}
function updateArrows(dt) {
  for(const a of arrows){a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;for(const e of enemies)if(a.life>0&&dist(a,e)<e.r+5){e.hp-=a.damage;e.flash=.1;a.life=0;burst(a.x,a.y,a.color,5,80);}}
  arrows=arrows.filter(a=>a.life>0&&a.x>0&&a.x<W&&a.y>0&&a.y<H);
}
function updateEnemyBullets(dt) {
  for(const b of enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(state.dashTime<=0&&dist(b,player)<b.r+player.r){hurt(b.damage||10);b.life=0;burst(player.x,player.y,'#ff6387',8,80);}}
  enemyBullets=enemyBullets.filter(b=>b.life>0&&b.x>0&&b.x<W&&b.y>0&&b.y<H);
}
function updateStars(dt) {
  for(const s of stars){s.spin+=dt*5;const d=dist(s,player);if(d<210){s.x+=(player.x-s.x)*dt*3;s.y+=(player.y-s.y)*dt*3;}if(d<28){state.xp+=s.value;s.dead=true;burst(s.x,s.y,'#ffe17a',8,90);}}
  stars=stars.filter(s=>!s.dead);if(state.xp>=state.need) levelUp();
}
function xpValue(spec){const difficultyBonus=state.difficulty==='hard'?1.1:state.difficulty==='easy'?.95:1;const healthBonus=1+Math.max(0,spec.hp-1)*.03;const speedBonus=spec.speed>=60?1.08:1;return Math.max(1,Math.round(spec.xp*healthBonus*speedBonus*difficultyBonus));}
function deaths(){const alive=[];for(const e of enemies){if(e.hp>0){alive.push(e);continue;}const sp=types[e.type];state.kills++;stars.push({x:e.x,y:e.y,value:xpValue(sp),spin:Math.random()*7});burst(e.x,e.y,sp.color,14,140);}enemies=alive;}
function burst(x,y,color,n,speed){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2;particles.push({x,y,vx:Math.cos(a)*rand(speed*.2,speed),vy:Math.sin(a)*rand(speed*.2,speed),life:rand(.2,.65),color});}}
function updateParticles(dt){for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
function finishWave(){state.active=false;state.intermission=true;ui.waveState.textContent='SECTOR CLEAR';if(state.wave%10===0){showMilestone();return;}if(state.auto){setTimeout(nextWave,700);return;}show('<div class="modal"><div class="eyebrow">WAVE '+state.wave+' COMPLETE</div><h2>Sector cleared</h2><p>Prepare for the next surge.</p><button class="continue" id="continueWave">BEGIN WAVE '+(state.wave+1)+' →</button></div>');$('#continueWave').onclick=nextWave;}
function nextWave(){state.wave++;beginWave();hide();}
function showMilestone(){show('<div class="modal"><div class="eyebrow">MILESTONE // WAVE '+state.wave+'</div><h2>Choose a relic</h2><p>Claim a permanent run bonus before the next wave.</p><div class="cards"><div class="card"><span class="card-key">RELIC 01</span><h3>OVERDRIVE HEART</h3><p>Double all weapon fire rates.</p><button id="relicSpeed">CLAIM</button></div><div class="card"><span class="card-key">RELIC 02</span><h3>REINFORCED CORE</h3><p>Maximum health +50 and full repair.</p><button id="relicHealth">CLAIM</button></div><div class="card"><span class="card-key">RELIC 03</span><h3>STAR ORBIT</h3><p>Gain a damaging orbit effect.</p><button id="relicOrbit">CLAIM</button></div></div></div>');$('#relicSpeed').onclick=()=>{Object.values(state.weapons).forEach(w=>w.rate*=2);nextWave();};$('#relicHealth').onclick=()=>{player.maxHp+=50;player.hp=player.maxHp;nextWave();};$('#relicOrbit').onclick=()=>{state.weapons.orbit={name:'STAR ORBIT',color:'#ffe17a',damage:2,rate:1,level:1};nextWave();};}
function levelUp(){state.xp-=state.need;state.need=Math.floor(state.need*1.25);state.level++;state.paused=true;const all=[['bow','TUNED STRING','Longbow damage +1 and fires faster.'],['laser','PRISM LASER','Unlocks a rapid auto-targeting laser.'],['bomb','VOID CHARGE','Unlocks an explosive area strike.'],['sword','STAR BLADE','Unlocks a rotating close-range blade.'],['health','REINFORCED HULL','+25 maximum health and full repair.'],['speed','RUNNING SHOES','+18% movement speed.'],['regen','NANITE REPAIR','+2 health regenerated per second.']].sort(()=>Math.random()-.5).slice(0,3);show('<div class="modal"><div class="eyebrow">ASCENSION // LEVEL '+state.level+'</div><h2>Choose an upgrade</h2><p>The arena is paused while you evolve.</p><div class="cards">'+all.map((u,i)=>'<div class="card"><span class="card-key">0'+(i+1)+' // UPGRADE</span><h3>'+u[1]+'</h3><p>'+u[2]+'</p><button data-up="'+u[0]+'">INSTALL</button></div>').join('')+'</div></div>');document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>upgrade(b.dataset.up));}
function upgrade(id){if(id==='bow'){let w=state.weapons.bow;w.level++;w.damage++;w.rate*=1.2;}else if(id==='health'){player.maxHp+=25;player.hp=player.maxHp;}else if(id==='speed')player.speed*=1.18;else if(id==='regen')player.regen+=2;else if(!state.weapons[id]){const d={laser:['PRISM LASER','#c879ff',2,2.7],bomb:['VOID CHARGE','#ff965d',3,.65],sword:['STAR BLADE','#ffe17a',2,1]}[id];state.weapons[id]={name:d[0],color:d[1],damage:d[2],rate:d[3],level:1};}else{state.weapons[id].level++;state.weapons[id].damage++;state.weapons[id].rate*=1.15;}state.paused=false;if(state.intermission)showIntermission();else hide();}
function pause(){if(!state||state.intermission)return;state.paused=!state.paused;if(state.paused){show('<div class="modal"><div class="eyebrow">SYSTEM PAUSED</div><h2>Hold the line.</h2><p>Press SPACE or resume when ready.</p><button class="continue" id="resume">RESUME</button></div>');$('#resume').onclick=pause;}else hide();}
function gameOver(){state.paused=true;show('<div class="modal"><div class="eyebrow">SIGNAL LOST</div><h2>Run terminated</h2><p>Wave '+state.wave+' • '+state.kills+' hostiles cleared</p><button class="continue" id="restart">REBOOT RUN</button></div>');$('#restart').onclick=()=>reset(state.difficulty);}
function show(markup){ui.overlay.innerHTML=markup;ui.overlay.classList.remove('hidden');}function hide(){ui.overlay.classList.add('hidden');ui.overlay.innerHTML='';}
function hud(){ui.hp.style.width=player.hp/player.maxHp*100+'%';ui.hpText.textContent=Math.ceil(player.hp)+' / '+player.maxHp;ui.xp.style.width=Math.min(100,state.xp/state.need*100)+'%';ui.xpText.textContent=Math.floor(state.xp)+' / '+state.need+' XP';ui.level.textContent='LV '+state.level;ui.kills.textContent=state.kills;ui.timer.textContent=new Date(state.time*1000).toISOString().slice(14,19);ui.weapons.innerHTML=Object.values(state.weapons).map(w=>'<span class="weapon-item"><i class="weapon-dot" style="background:'+w.color+'"></i>'+w.name+' <small>★'+w.level+'</small></span>').join('');const dash=document.querySelector('.dash-hud'),text=document.querySelector('#dashText');if(state.dashTime>0){text.textContent='DASHING';dash.classList.remove('cooldown');}else if(state.dashCooldown>0){text.textContent=state.dashCooldown.toFixed(1)+'s';dash.classList.add('cooldown');}else{text.textContent='READY';dash.classList.remove('cooldown');}}
function poly(x,y,r,n,rot){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#17243a';for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.strokeStyle='#304762';ctx.strokeRect(20,32,W-40,H-58);drawStars();drawEnemies();drawProjectiles();drawParticles();drawPlayer();drawWeaponEffects();}
function drawStars(){for(const s of stars){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.spin);ctx.fillStyle='#ffe17a';ctx.shadowColor='#ffe17a';ctx.shadowBlur=18;poly(0,0,10,5,-Math.PI/2);ctx.fill();ctx.restore();}}
function drawEnemies(){for(const e of enemies){const sp=types[e.type];ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.flash?'#fff':sp.color;ctx.shadowColor=sp.color;ctx.shadowBlur=17;if(e.type==='bowtie'){ctx.rotate(Math.PI/4);ctx.fillRect(-17,-5,34,10);ctx.fillRect(-5,-17,10,34);}else if(e.type==='trap'){ctx.beginPath();ctx.moveTo(-20,17);ctx.lineTo(20,17);ctx.lineTo(13,-18);ctx.lineTo(-13,-18);ctx.fill();}else{poly(0,0,e.r,sp.sides,e.type==='triangle'?-Math.PI/2:Math.PI/4);ctx.fill();}ctx.restore();if(e.hp<e.maxHp){ctx.fillStyle='#1d2738';ctx.fillRect(e.x-17,e.y-e.r-10,34,4);ctx.fillStyle=sp.color;ctx.fillRect(e.x-17,e.y-e.r-10,34*e.hp/e.maxHp,4);}}}
function drawProjectiles(){for(const a of arrows){ctx.save();ctx.strokeStyle=a.color;ctx.shadowColor=a.color;ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x-a.vx*.018,a.y-a.vy*.018);ctx.lineTo(a.x,a.y);ctx.stroke();ctx.restore();}for(const b of enemyBullets){ctx.fillStyle='#ff6387';ctx.shadowColor='#ff6387';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();ctx.shadowBlur=0;}}
function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;}
function drawPlayer(){const e=nearest();if(e)player.aim=ang(player,e);ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.aim);ctx.strokeStyle='#55e6ff';ctx.shadowColor='#55e6ff';ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(32,0);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(14,-9);ctx.quadraticCurveTo(28,0,14,9);ctx.stroke();ctx.restore();ctx.save();ctx.translate(player.x,player.y);ctx.fillStyle='#effaff';ctx.shadowColor='#55e6ff';ctx.shadowBlur=28;ctx.beginPath();ctx.arc(0,0,player.r,0,7);ctx.fill();ctx.strokeStyle='#55e6ff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,player.r+6,-Math.PI/2,-Math.PI/2+Math.PI*2*player.hp/player.maxHp);ctx.stroke();ctx.restore();}
function drawWeaponEffects(){if(state.weapons.laser){const e=nearest();if(e){ctx.globalAlpha=.22;ctx.strokeStyle='#c879ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.globalAlpha=1;}}if(state.weapons.bomb){ctx.strokeStyle='#ff965d';ctx.globalAlpha=.25;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(player.x,player.y,84,0,7);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}if(state.weapons.sword){const a=state.time*4;ctx.save();ctx.translate(player.x,player.y);ctx.rotate(a);ctx.strokeStyle='#ffe17a';ctx.shadowColor='#ffe17a';ctx.shadowBlur=14;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(30,0);ctx.lineTo(68,0);ctx.stroke();ctx.restore();}}
function ultimateEffects(dt){if(state.weapons.laser&&state.weapons.laser.level>=5){state.ultimateLaser=(state.ultimateLaser||0)-dt;if(state.ultimateLaser<=0){const targets=enemies.slice().sort((a,b)=>dist(a,player)-dist(b,player)).slice(0,3);targets.forEach(e=>{e.hp-=state.weapons.laser.damage;e.flash=.15;burst(e.x,e.y,'#c879ff',4,80);});state.ultimateLaser=.4;}}}
function frame(now){if(!state){ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);return;}const dt=Math.min(.033,(now-state.last)/1000);state.last=now;if(!state.paused){update(dt);ultimateEffects(dt);}draw();requestAnimationFrame(frame);}
function levelUp(){state.xp-=state.need;state.need=Math.floor(state.need*1.25);state.level++;state.paused=true;const upgrades=[['bow','LONGBOW','Damage +1 and fire rate +20%. At ★5: triple arrow volley.'],['laser','PRISM LASER',state.weapons.laser?'Damage +1 and fire rate +15%. At ★5: hits 3 enemies.':'Unlocks auto-targeting laser.'],['bomb','VOID CHARGE',state.weapons.bomb?'Damage +1 and cooldown -15%. At ★5: larger blasts.':'Unlocks area-damage bombs.'],['sword','STAR BLADE',state.weapons.sword?'Damage +1 and spin speed +15%. At ★5: double blade.':'Unlocks rotating close-range blade.'],['health','REINFORCED HULL','Maximum health +25 and fully repairs.'],['speed','RUNNING SHOES','Movement speed +18%.'],['regen','NANITE REPAIR','Health regeneration +2 per second.']].sort(()=>Math.random()-.5).slice(0,3);show('<div class="modal"><div class="eyebrow">ASCENSION // LEVEL '+state.level+'</div><h2>Choose an upgrade</h2><p>Each card shows the exact change it will make.</p><div class="cards">'+upgrades.map((u,i)=>'<div class="card"><span class="card-key">0'+(i+1)+' // UPGRADE</span><h3>'+u[1]+'</h3><p>'+u[2]+'</p><button data-up="'+u[0]+'">INSTALL</button></div>').join('')+'</div></div>');document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>upgrade(b.dataset.up));}
function showStart(){show('<div class="modal"><div class="eyebrow">SHAPEFALL // NEON SURVIVORS</div><h2>Choose your difficulty</h2><p>Move with WASD or arrow keys. Your bow fires automatically at the nearest enemy.</p><div class="cards"><div class="card"><span class="card-key">01 // EASY</span><h3>EASY</h3><p>Enemies have reduced health and move slower.</p><button data-difficulty="easy">START EASY</button></div><div class="card"><span class="card-key">02 // MEDIUM</span><h3>MEDIUM</h3><p>Standard enemy health and speed.</p><button data-difficulty="medium">START MEDIUM</button></div><div class="card"><span class="card-key">03 // HARD</span><h3>HARD</h3><p>Enemies are faster and have 28% more health.</p><button data-difficulty="hard">START HARD</button></div></div></div>');document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>reset(b.dataset.difficulty));}
$('#pauseBtn').onclick=pause;$('#autoContinue').onchange=e=>{if(state)state.auto=e.target.checked;};
showStart();requestAnimationFrame(frame);
