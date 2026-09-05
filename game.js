const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const W = 1440, H = 900;   // arena is 1.2x the original 1200x750 (same 1.6 aspect)
const MOVE = 1.15;         // how much of that growth travel speeds take on
const $ = id => document.querySelector(id);
const ui = { hp: $('#healthFill'), hpText: $('#healthText'), xp: $('#xpFill'), xpText: $('#xpText'), level: $('#levelText'), weapons: $('#weaponList'), room: $('#waveNumber'), roomState: $('#waveState'), kills: $('#killCount'), timer: $('#timer'), best: $('#bestWave'), overlay: $('#overlay') };
const keys = new Set();
const types = {
  square: { hp: 3, speed: 42, r: 16, color: '#ff6387', xp: 8, sides: 4 },
  triangle: { hp: 1, speed: 78, r: 14, color: '#ffc857', xp: 6, sides: 3 },
  hex: { hp: 5, speed: 31, r: 20, color: '#ac80ff', xp: 11, sides: 6 },
  trap: { hp: 8, speed: 20, r: 23, color: '#ff965d', xp: 15, sides: 4 },
  bowtie: { hp: 4, speed: 34, r: 18, color: '#6de0bd', xp: 11, sides: 4 },
  diamond: { hp: 3, speed: 92, r: 15, color: '#f36bff', xp: 9, sides: 4 },
  pentagon: { hp: 20, speed: 24, r: 24, color: '#e88bff', xp: 18, sides: 5 },
  prism: { hp: 7, speed: 58, r: 21, color: '#72a8ff', xp: 16, sides: 6 },
  boss: { hp: 360, speed: 27, r: 52, color: '#ff4f9a', xp: 120, sides: 8 }
};
let player, enemies, arrows, enemyBullets, stars, particles, blasts, echoShots, damageNumbers, delayedBlasts, state;
let highscore = Math.max(1, parseInt(localStorage.getItem('shapeshift_best_room'), 10) || 0);
// the footer tracks the best room ever reached, overtaken live by the current run
function recordRoom(room){
  if(room<=highscore)return;
  highscore=room;
  localStorage.setItem('shapeshift_best_room',highscore);
  paintBest();
}
const difficulties = { easy: { label: 'EASY', hp: .86, speed: .88, note: 'Relaxed enemy stats' }, medium: { label: 'MEDIUM', hp: 1, speed: 1, note: 'Standard enemy stats' }, hard: { label: 'HARD', hp: 1.28, speed: 1.2, note: 'Fast, reinforced enemies' }, impossible: { label: 'IMPOSSIBLE', hp: 3, speed: 1.8, note: 'Absolute carnage. Good luck.' } };

function resize() {
  // capped at 1.75 rather than 2: the arena grew 44%, this keeps the backing
  // store near its old pixel count so the additive/glow passes stay cheap
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize(); addEventListener('resize', resize);
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(k)) e.preventDefault(); keys.add(k); if (k === ' ') pause(); if (k === 'shift') dash(); if (k === 'e') phaseCloak(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function reset(difficulty = 'medium') {
  player = { x: W / 2, y: H / 2, r: 16, hp: 100, maxHp: 100, speed: 288, regen: 3, hurtAt: -10, aim: 0, vx: 0, vy: 0 };
  enemies = []; arrows = []; enemyBullets = []; stars = []; particles = []; blasts = []; delayedBlasts = []; echoShots = []; damageNumbers = [];
  state = { difficulty, last: performance.now(), time: 0, room: 1, level: 1, xp: 0, need: 60, kills: 0, left: 0, spawnIn: 0, active: true, paused: false, upgradeOpen: false, intermission: false, transitioning: false, roomTransition: 0, exit: null, relicRooms: {}, globals: {}, relicsTaken: [], history: [], echo: null, cloakTime: 0, cloakCooldown: 0, bowIn: 0, laserIn: 0, bombIn: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, dashPower: 1, lastMoveX: 1, lastMoveY: 0, shake: 0, playerAlpha: 1, screenAlpha: 0, cameraZoom: 1, zoomCenterX: W/2, zoomCenterY: H/2, victoryPortal: null, victorySequence: null, victoryTimer: 0, roomBanner: null, cameraRot: 0, flash: 0, warp: null, suckR: 0, suckA: 0, suckDir: 1, portalCharge: 0, hurtFlash: 0, weapons: { bow: { name: 'LONGBOW', color: '#55e6ff', damage: 2, rate: 1.3, level: 0, upgrades: 0, taken: [], ultimate: false } } };
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
  enemies.push({type:name,x:p.x,y:p.y,hp,maxHp:hp,r:spec.r,shoot:rand(1,3),phase:Math.random()*7,flash:0,rot:Math.random()*7,rotSpeed:rand(-1.1,1.1),born:state.time,numIn:0});
}
function beginRoom() {
  // the arena is ~44% larger, so counts rise a little to keep the floor from feeling empty
  state.active=true; state.intermission=false; state.exit=null; state.left=state.room===10?0:11+state.room*3; state.spawnIn=.55;
  if(state.room===10) spawnBoss();
  for(let i=0;i<Math.min(8,state.left);i++){spawn();state.left--;}
  ui.room.textContent=state.room; ui.roomState.textContent=state.room===10?'BOSS CHAMBER':'ROOM HOSTILES INBOUND';
  recordRoom(state.room);
  state.roomBanner={room:state.room,life:BANNER_TIME};
}
function spawnBoss(){const spec=types.boss,difficulty=difficulties[state.difficulty],hp=Math.ceil(spec.hp*difficulty.hp);enemies.push({type:'boss',x:W/2,y:150,hp,maxHp:hp,r:spec.r,shoot:1.1,phase:0,flash:0,boss:true,rot:0,rotSpeed:.45,born:state.time,numIn:0});}
function nearest() {
  let best=null, bestD=Infinity;
  for(const e of enemies){const d=dist(player,e);if(d<bestD){best=e;bestD=d;}}
  return best;
}
function fire() {
  const target=nearest(); if(!target)return;
  player.aim=ang(player,target); const w=state.weapons.bow;
  const shotCount=(w.shots||1)+(w.ultimate?2:0), offsets=shotCount>1?Array.from({length:shotCount},(_,i)=>(i-(shotCount-1)/2)*.15):[0];
  for(const o of offsets){const a=player.aim+o;arrows.push({x:player.x+Math.cos(a)*27,y:player.y+Math.sin(a)*27,vx:Math.cos(a)*(w.projectileSpeed||620),vy:Math.sin(a)*(w.projectileSpeed||620),life:1.6,damage:w.damage,pierce:(w.pierce||0)+(w.ultimate?1:0),color:w.color,homing:w.homing?1:0});}
  burst(player.x+Math.cos(player.aim)*28,player.y+Math.sin(player.aim)*28,w.color,4,70,{size:2,drag:6});
}
function hurt(n){if(state.cloakTime>0)return;player.hp=Math.max(0,player.hp-n);player.hurtAt=state.time;player.flash=0.1;state.hurtFlash=Math.min(1,(state.hurtFlash||0)+clamp(n/45,.3,1));burst(player.x,player.y,'#ff557d',10,150,{size:2.6,drag:4,spread:player.r});shake(12);}
function phaseCloak(){if(!state||!state.hasCloak||state.paused||state.victorySequence||state.cloakTime>0||state.cloakCooldown>0)return;state.cloakTime=3;state.cloakCooldown=12;burst(player.x,player.y,'#bca7ff',30,180);}
function dash(){
  if(!state||state.paused||state.transitioning||state.victorySequence||(!state.exit&&state.intermission)||state.dashCooldown>0||state.dashTime>0)return;
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  if(!x&&!y){x=state.lastMoveX;y=state.lastMoveY;}
  const len=Math.hypot(x,y)||1;state.dashX=x/len;state.dashY=y/len;state.dashTime=.22;state.dashCooldown=3;shake(4);
  burst(player.x,player.y,'#55e6ff',Math.round(24*(state.dashPower||1)),220*(state.dashPower||1));
}
function update(dt) {
  state.time+=dt;
  if(state.roomBanner){state.roomBanner.life-=dt;if(state.roomBanner.life<=0)state.roomBanner=null;}
  state.hurtFlash=Math.max(0,(state.hurtFlash||0)-dt*2.4);
  state.dashCooldown=Math.max(0,state.dashCooldown-dt);
  state.cloakCooldown=Math.max(0,state.cloakCooldown-dt);state.cloakTime=Math.max(0,state.cloakTime-dt);
  if(state.victoryPortal&&!state.victorySequence){
    const p=state.victoryPortal;
    const d=dist(player,p);
    if(d<180){
      const pull= (180-d)/180 * 230 * dt;
      player.vx+=(p.x-player.x)/d*pull;
      player.vy+=(p.y-player.y)/d*pull;
    }
    if(d<p.r+player.r){
      state.victorySequence='swirl';
      state.victoryTimer=T_SWIRL;
      state.zoomCenterX=p.x;
      state.zoomCenterY=p.y;
      state.suckR=d;
      state.suckA=ang(p,player);
      // keep orbiting the way the player was already travelling
      const cross=(player.x-p.x)*player.vy-(player.y-p.y)*player.vx;
      state.suckDir=cross>=0?1:-1;
      burst(p.x,p.y,'#eaffff',24,190,{size:2.6,drag:3});
    }
  }
  if(state.victorySequence){
    state.victoryTimer-=dt;
    if(state.victorySequence==='swirl'){
      // caught in the vortex: flung wide, then wound inward on a tightening spiral
      const p=clamp(1-state.victoryTimer/T_SWIRL,0,1);
      const peak=Math.max(state.suckR+58,128);
      const r=p<.26?state.suckR+(peak-state.suckR)*easeOut(p/.26):peak*Math.pow(1-(p-.26)/.74,1.55);
      const a=state.suckA+state.suckDir*Math.PI*2*(.55*p+2.05*p*p);
      player.x=state.zoomCenterX+Math.cos(a)*r;
      player.y=state.zoomCenterY+Math.sin(a)*r;
      player.vx=0;player.vy=0;
      player.aim=a+state.suckDir*Math.PI/2;
      state.history.unshift({x:player.x,y:player.y});if(state.history.length>24)state.history.pop();
      state.portalCharge=easeOut(p);
      state.cameraZoom=1+easeIn(p)*(SUCK_Z0-1);
      state.cameraRot=-easeIn(p)*.12;
      state.shake=Math.max(state.shake,p*p*3);
      // debris caught in the same current
      for(let i=0;i<2;i++){
        const sa=Math.random()*Math.PI*2, sr=90+Math.random()*190;
        particles.push({x:state.zoomCenterX+Math.cos(sa)*sr,y:state.zoomCenterY+Math.sin(sa)*sr,
          vx:-Math.cos(sa)*sr*1.5-Math.sin(sa)*state.suckDir*300,vy:-Math.sin(sa)*sr*1.5+Math.cos(sa)*state.suckDir*300,
          life:.42,maxLife:.42,color:Math.random()<.5?'#55e6ff':'#eaffff',size:2.4,drag:.6});
      }
      updateParticles(dt);
      if(state.victoryTimer<=0){
        player.x=state.zoomCenterX;player.y=state.zoomCenterY;
        state.suckR=0;state.portalCharge=1;
        state.victorySequence='sucking';state.victoryTimer=T_SUCK;
      }
    }else if(state.victorySequence==='sucking'){
      const p=clamp(1-state.victoryTimer/T_SUCK,0,1);
      // slide onto the portal centre in the first fraction of a second, then hold
      // dead still so the zoom has a stable subject
      const settle=clamp(p/.2,0,1), r=state.suckR*Math.pow(1-settle,2);
      player.x=state.zoomCenterX+Math.cos(state.suckA)*r;
      player.y=state.zoomCenterY+Math.sin(state.suckA)*r;
      player.vx=0;player.vy=0;
      player.aim+=4*dt;
      // let the motion trail collapse onto the centre instead of hanging off to the side
      state.history.unshift({x:player.x,y:player.y});if(state.history.length>24)state.history.pop();
      state.cameraZoom=SUCK_Z0+easeIn(p)*(46-SUCK_Z0);
      state.cameraRot=-.12-easeIn(p)*.98;
      state.playerAlpha=1-p*p*.5;
      state.shake=Math.max(state.shake,p*3);
      // debris spiralling into the throat
      for(let i=0;i<2;i++){
        const sa=Math.random()*Math.PI*2, sr=120+Math.random()*180;
        particles.push({x:state.zoomCenterX+Math.cos(sa)*sr,y:state.zoomCenterY+Math.sin(sa)*sr,
          vx:-Math.cos(sa)*sr*2.6-Math.sin(sa)*220,vy:-Math.sin(sa)*sr*2.6+Math.cos(sa)*220,
          life:.36,color:Math.random()<.5?'#55e6ff':'#eaffff'});
      }
      updateParticles(dt);
      if(state.victoryTimer<=0){
        player.x=state.zoomCenterX;player.y=state.zoomCenterY;
        state.victorySequence='flash';state.victoryTimer=T_FLASH;
        state.flash=1;state.playerAlpha=0;state.shake=0;
        state.victoryPortal=null;state.portalCharge=0;
        state.warp=Array.from({length:150},()=>({a:Math.random()*Math.PI*2,d:.02+Math.random()*.9,len:.35+Math.random()*.75,w:.8+Math.random()*2.4}));
      }
    }else if(state.victorySequence==='flash'){
      state.flash=clamp(state.victoryTimer/T_FLASH,0,1);
      state.screenAlpha=1-state.flash;
      if(state.victoryTimer<=0){state.victorySequence='warp';state.victoryTimer=T_WARP;state.screenAlpha=1;state.flash=0;}
    }else if(state.victorySequence==='warp'){
      const p=clamp(1-state.victoryTimer/T_WARP,0,1);
      const speed=.55+Math.sin(p*Math.PI)*3.1;
      for(const s of state.warp){
        s.d+=(.18+s.d*2.7)*speed*dt;
        if(s.d>1.5){s.d=.015+Math.random()*.05;s.a=Math.random()*Math.PI*2;s.len=.35+Math.random()*.75;}
      }
      state.screenAlpha=1;
      if(state.victoryTimer<=0){
        state.victorySequence='arrive';state.victoryTimer=T_ARRIVE;
        state.zoomCenterX=W/2;state.zoomCenterY=H/2;
        state.flash=1;state.screenAlpha=0;state.warp=null;
        nextRoom();
        blasts.push({x:W/2,y:H/2,radius:410,life:.5,maxLife:.5,color:'#eaffff'});
        burst(W/2,H/2,'#55e6ff',34,320);
        shake(9);
      }
    }else if(state.victorySequence==='arrive'){
      const p=clamp(1-state.victoryTimer/T_ARRIVE,0,1);
      const e=easeOut(p);
      state.cameraZoom=1+(1-e)*17;
      state.cameraRot=(1-e)*.42;
      state.playerAlpha=clamp(p*2.4,0,1);
      state.flash=Math.pow(1-clamp(p*1.8,0,1),2);
      updateParticles(dt);updateBlasts(dt);
      if(state.victoryTimer<=0){state.victorySequence=null;state.cameraZoom=1;state.cameraRot=0;state.flash=0;state.playerAlpha=1;}
    }
    hud();return;
  }
  let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  const ml=Math.hypot(mx,my)||1;
  if(mx||my){state.lastMoveX=mx/ml;state.lastMoveY=my/ml;}
  if(state.dashTime>0){
    state.dashTime=Math.max(0,state.dashTime-dt);
    const ds=1380*(state.dashPower||1);
    player.x=clamp(player.x+state.dashX*ds*dt,45,W-45);
    player.y=clamp(player.y+state.dashY*ds*dt,65,H-45);
    burst(player.x-state.dashX*10,player.y-state.dashY*10,'#55e6ff',2,90);
  }else{
    const targetVx=(mx/ml)*player.speed,targetVy=(my/ml)*player.speed;
    if(mx||my){player.vx+=(targetVx-player.vx)*12*dt;player.vy+=(targetVy-player.vy)*12*dt;}else{player.vx-=player.vx*15*dt;player.vy-=player.vy*15*dt;}
    player.x=clamp(player.x+player.vx*dt,45,W-45);player.y=clamp(player.y+player.vy*dt,65,H-45);
  }
  const target=nearest();
  if(target){
    const targetAim=ang(player,target);
    let diff=targetAim-player.aim;
    while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
    player.aim+=diff*15*dt;
  }
  state.history.unshift({x:player.x,y:player.y});if(state.history.length>24)state.history.pop();updateRelics(dt);
  if(state.time-player.hurtAt>2) player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
  player.flash=Math.max(0,player.flash-dt);
  if(state.active&&state.left>0){state.spawnIn-=dt;if(state.spawnIn<=0){spawn();state.left--;state.spawnIn=Math.max(.2,.62-state.room*.02);}}
  state.bowIn-=dt;if(state.bowIn<=0){fire();state.bowIn=1/state.weapons.bow.rate;}
  for(const e of enemies) moveEnemy(e,dt);
  weapons(dt); updateArrows(dt); updateEchoShots(dt); updateEnemyBullets(dt); updateStars(dt); deaths(); updateParticles(dt); updateBlasts(dt); updateDelayedBlasts(dt); updateDamageNumbers(dt);
  if(state.active&&state.left===0&&enemies.length===0) finishRoom();
  if(player.hp<=0) gameOver();
  hud();
}
function moveEnemy(e,dt) {
  const difficulty=difficulties[state.difficulty], spec=types[e.type], a=ang(e,player)+(e.type==='bowtie'?Math.sin(state.time*5+e.phase)*.75:0);

  if(e.boss){
    e.dashCooldown=(e.dashCooldown||0)-dt;
    e.dashTime=(e.dashTime||0)-dt;
    if(e.dashCooldown<=0 && e.dashTime<=0){
      e.dashTime=0.3;
      e.dashCooldown=3+rand(0,2);
    }
    if(e.dashTime>0){
      const dashSpeed=spec.speed*5*difficulty.speed*MOVE;
      e.x+=Math.cos(a)*dashSpeed*dt;e.y+=Math.sin(a)*dashSpeed*dt;
      burst(e.x,e.y,spec.color,2,100);
    }else{
      const s=spec.speed*difficulty.speed*MOVE;
      e.x+=Math.cos(a)*s*dt;e.y+=Math.sin(a)*s*dt;
    }
  }else{
    const s=spec.speed*difficulty.speed*MOVE;
    e.x+=Math.cos(a)*s*dt;e.y+=Math.sin(a)*s*dt;
  }

  e.flash=Math.max(0,e.flash-dt);
  e.rot=(e.rot||0)+(e.rotSpeed||0)*dt;
  e.numIn=(e.numIn||0)-dt;
  e.touch=(e.touch||0)-dt;
  if(dist(e,player)<e.r+player.r&&e.touch<=0){if(state.dashTime<=0){const baseDamage=e.boss?28:10+spec.hp*1.5+(spec.speed>=60?5:0),damage=baseDamage*(1+(state.room-1)*.025)*difficulty.speed*(state.weapons.sword?.guard?.7:1);const lethal=!e.boss&&(state.difficulty==='hard'||state.difficulty==='impossible')&&(e.type==='trap'||e.type==='pentagon');hurt(lethal?player.hp:damage);if(!e.boss){e.hp=0;spawnDamageNumber(e.x,e.y,999,'#fff');shake(4);}}e.touch=.55;burst(e.x,e.y,spec.color,10,110);}
  e.shoot-=dt;
  if((e.type==='bowtie'||e.boss)&&e.shoot<=0){const b=ang(e,player),shots=e.boss?[-.24,-.12,0,.12,.24]:[0];for(const offset of shots)enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b+offset)*(e.boss?282:224),vy:Math.sin(b+offset)*(e.boss?282:224),r:e.boss?7:5,life:4,damage:(e.boss?16:8+state.room*.5)*difficulty.speed});e.shoot=e.boss?1.15:rand(2,3.4);}
}
function weapons(dt) {
  if(state.weapons.laser){
    const w=state.weapons.laser;
    w.beamT=Math.max(0,(w.beamT||0)-dt);
    for(const e of enemies)if(e.laserLinger>0){e.laserLinger-=dt;e.hp-=(e.burnDps||0)*dt;}
    state.laserIn-=dt;
    if(state.laserIn<=0){
      const e=nearest();
      if(e&&dist(e,player)<=(w.range||505)){
        hitLaser(w,e);
        w.ticks=(w.ticks||0)+1;
        if(w.split&&w.ticks%3===0){const second=enemies.filter(x=>x!==e).sort((a,b)=>dist(a,player)-dist(b,player))[0];if(second)hitLaser(w,second,true);}
      }
      state.laserIn=1/w.rate;
    }
  }
  if(state.weapons.bomb){state.bombIn-=dt;if(state.bombIn<=0){const w=state.weapons.bomb,t=nearest();if(t)detonate(w,t.x,t.y,w.radius||115,w.damage,w.double?{timer:.75,damage:w.damage*.55}:null);state.bombIn=1/w.rate;}}
  if(state.weapons.sword){
    const w=state.weapons.sword,reach=w.reach||68,hilt=16,width=w.width||11;
    for(const a of bladeAngles(w)){
      const x1=player.x+Math.cos(a)*hilt,y1=player.y+Math.sin(a)*hilt;
      const x2=player.x+Math.cos(a)*reach,y2=player.y+Math.sin(a)*reach;
      for(const e of enemies){
        if(segDist(e.x,e.y,x1,y1,x2,y2)>e.r+width)continue;
        e.hp-=w.damage*dt*3.6;e.flash=Math.max(e.flash,.05);
        if(Math.random()<dt*22)particles.push({x:e.x+rand(-6,6),y:e.y+rand(-6,6),vx:rand(-90,90),vy:rand(-90,90),life:.22,maxLife:.22,color:'#fff6c9',size:2.2,drag:5});
        if(e.numIn<=0){e.numIn=.22;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage*.8),w.color);shake(1);}
      }
    }
  }
}
// the sword's cutting edges: one blade, plus an opposed second edge once ultimate
function bladeAngles(w){const a=state.time*(w.spin||4);return w.ultimate?[a,a+Math.PI]:[a];}
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;const t=L?clamp(((px-x1)*dx+(py-y1)*dy)/L,0,1):0;return Math.hypot(px-(x1+dx*t),py-(y1+dy*t));}
function hitLaser(w,e,secondary){
  e.hp-=w.damage;e.flash=.12;
  if(w.linger){e.laserLinger=w.linger;e.burnDps=w.damage*2.2;}
  spawnDamageNumber(e.x,e.y,Math.ceil(w.damage),w.color);
  burst(e.x,e.y,'#c879ff',6,110,{size:2.2,drag:4.5});
  if(!secondary){w.beamT=.14;w.bx=e.x;w.by=e.y;w.nova=null;shake(1);}
}
function detonate(w,x,y,radius,damage,followUp){
  for(const e of enemies)if(dist(e,{x,y})<radius){
    e.hp-=damage;e.flash=.18;
    spawnDamageNumber(e.x,e.y,Math.ceil(damage),w.color);
    if(w.pull){e.x+=(x-e.x)*.26;e.y+=(y-e.y)*.26;}
  }
  blasts.push({x,y,radius,life:.42,maxLife:.42,color:w.color});
  burst(x,y,w.color,26,240,{size:3.2,drag:2.6});
  burst(x,y,'#fff2d6',10,120,{size:2.2,drag:4});
  shake(8);
  if(followUp)delayedBlasts.push({x,y,radius,timer:followUp.timer,damage:followUp.damage,color:w.color});
}
function updateArrows(dt) {
  for(const a of arrows){
    if(a.homing){
      const t=enemies.reduce((best,e)=>{const d=dist(e,a);return d<360&&(!best||d<best.d)?{e,d}:best;},null);
      if(t){
        const want=ang(a,t.e),speed=Math.hypot(a.vx,a.vy);
        let cur=Math.atan2(a.vy,a.vx),diff=want-cur;
        while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
        cur+=clamp(diff,-4.5*dt,4.5*dt);
        a.vx=Math.cos(cur)*speed;a.vy=Math.sin(cur)*speed;
      }
    }
    a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;
    // an arrow may only score once per enemy — pierce carries it through to the next one
    for(const e of enemies)if(a.life>0&&dist(a,e)<e.r+5&&!(a.hit&&a.hit.includes(e))){
      (a.hit||(a.hit=[])).push(e);
      e.hp-=a.damage;e.flash=.1;spawnDamageNumber(e.x,e.y,Math.ceil(a.damage),a.color);shake(2);
      if(a.pierce>0)a.pierce--;else a.life=0;
      burst(a.x,a.y,a.color,6,120,{size:2.2,drag:5});
    }
  }
  arrows=arrows.filter(a=>a.life>0&&a.x>0&&a.x<W&&a.y>0&&a.y<H);
}
function updateEchoShots(dt){for(const s of echoShots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;for(const e of enemies)if(s.life>0&&dist(s,e)<e.r+6){e.hp-=s.damage;e.flash=.12;spawnDamageNumber(e.x,e.y,Math.ceil(s.damage),s.color);s.life=0;burst(s.x,s.y,'#a6d8ff',5,80);}}echoShots=echoShots.filter(s=>s.life>0&&s.x>0&&s.x<W&&s.y>0&&s.y<H);}
function updateEnemyBullets(dt) {
  for(const b of enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(state.dashTime<=0&&dist(b,player)<b.r+player.r){hurt(b.damage||10);b.life=0;burst(player.x,player.y,'#ff6387',8,80);}}
  enemyBullets=enemyBullets.filter(b=>b.life>0&&b.x>0&&b.x<W&&b.y>0&&b.y<H);
}
function updateStars(dt) {
  for(const s of stars){s.spin+=dt*5;const d=dist(s,player);if(d<250){s.x+=(player.x-s.x)*dt*12;s.y+=(player.y-s.y)*dt*12;}if(d<32){state.xp+=s.value;s.dead=true;burst(s.x,s.y,'#ffe17a',9,130,{size:2.2,drag:5});}}
  stars=stars.filter(s=>!s.dead);if(state.xp>=state.need) levelUp();
}
function xpValue(spec){const difficultyBonus=state.difficulty==='hard'?1.1:state.difficulty==='easy'?.95:1;const healthBonus=1+Math.max(0,spec.hp-1)*.03;const speedBonus=spec.speed>=60?1.08:1;return Math.max(1,Math.round(spec.xp*healthBonus*speedBonus*difficultyBonus));}
function deaths(){
  const alive=[];
  for(const e of enemies){
    if(e.hp>0){alive.push(e);continue;}
    const sp=types[e.type];
    state.kills++;
    stars.push({x:e.x,y:e.y,value:xpValue(sp),spin:Math.random()*7});
    burst(e.x,e.y,sp.color,e.boss?60:15,e.boss?340:190,{size:e.boss?3.6:2.8,drag:3});
    burst(e.x,e.y,'#ffffff',e.boss?18:5,e.boss?200:110,{size:2,drag:5});
    blasts.push({x:e.x,y:e.y,radius:e.boss?260:e.r*2.6,life:e.boss?.6:.26,maxLife:e.boss?.6:.26,color:sp.color});
    if(e.boss)shake(20);
  }
  enemies=alive;
}
function burst(x,y,color,n,speed,opts){
  const size=opts&&opts.size||2.8, drag=opts&&opts.drag||3.4, spread=opts&&opts.spread||0;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=rand(speed*.2,speed), life=rand(.22,.68);
    particles.push({x:x+Math.cos(a)*spread,y:y+Math.sin(a)*spread,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,maxLife:life,color,size:size*rand(.6,1.25),drag});
  }
}
function updateParticles(dt){for(const p of particles){const d=1-(p.drag||3.4)*dt;p.vx*=d;p.vy*=d;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
function updateBlasts(dt){for(const b of blasts)b.life-=dt;blasts=blasts.filter(b=>b.life>0);}
function updateDelayedBlasts(dt){for(const b of delayedBlasts){b.timer-=dt;if(b.timer<=0){for(const e of enemies)if(dist(e,b)<b.radius){e.hp-=b.damage;e.flash=.15;spawnDamageNumber(e.x,e.y,Math.ceil(b.damage),b.color);}blasts.push({x:b.x,y:b.y,radius:b.radius,life:.4,maxLife:.4,color:b.color});burst(b.x,b.y,b.color,20,180,{size:2.8,drag:3});shake(4);b.dead=true;} }delayedBlasts=delayedBlasts.filter(b=>!b.dead);}
function finishRoom(){if(state.exit||state.transitioning||state.victoryPortal)return;state.active=false;state.intermission=true;if(state.room%10===0&&!state.relicRooms[state.room]){showRelics();return;}state.victoryPortal={x:W/2,y:H/2,r:34};}
function nextRoom(){
  if(state.difficulty==='hard' && state.room===10){
    localStorage.setItem('shapeshift_hard_beaten', 'true');
  }
  state.room++;player.x=W/2;player.y=H/2;player.vx=0;player.vy=0;state.history=[];beginRoom();
}
function weaponPower(){return Object.values(state.weapons).reduce((sum,w)=>sum+(w.damage||0),0);}
function updateRelics(dt){if(state.echo){const ghost=state.history[Math.min(18,state.history.length-1)]||player;state.echo.x=ghost.x;state.echo.y=ghost.y;state.echo.fireIn-=dt;if(state.echo.fireIn<=0){const target=enemies.reduce((best,e)=>!best||dist(e,state.echo)<dist(best,state.echo)?e:best,null);if(target){const a=ang(state.echo,target);echoShots.push({x:state.echo.x,y:state.echo.y,vx:Math.cos(a)*495,vy:Math.sin(a)*495,life:1.5,damage:weaponPower()*.25});burst(state.echo.x,state.echo.y,'#a6d8ff',8,100);}state.echo.fireIn=.42;}}}
function showRelics(){state.paused=true;show('<div class="modal"><div class="eyebrow">BOSS RELIC // ROOM '+state.room+'</div><h2>Choose a relic</h2><p>The exit will open after you claim one.</p><div class="cards"><div class="card"><span class="card-key">RELIC 01</span><h3>ECHO PHANTOM</h3><p>A ghost copies your movement and attacks for 25% of your combined weapon damage.</p><button data-relic="echo">CLAIM</button></div><div class="card"><span class="card-key">RELIC 02</span><h3>PHASE CLOAK</h3><p>Press E to disappear for 3 seconds. You can move freely and take no damage.</p><button data-relic="cloak">CLAIM</button></div><div class="card"><span class="card-key">RELIC 03</span><h3>CORE OVERDRIVE</h3><p>All current weapons fire 25% faster.</p><button data-relic="overdrive">CLAIM</button></div></div></div>');document.querySelectorAll('[data-relic]').forEach(b=>b.onclick=()=>claimRelic(b.dataset.relic));}
function claimRelic(id){if(id==='echo')state.echo={x:player.x,y:player.y,fireIn:0};if(id==='cloak')state.hasCloak=true;if(id==='overdrive')Object.values(state.weapons).forEach(w=>w.rate*=1.25);state.relicsTaken.push(id);state.relicRooms[state.room]=true;state.paused=false;hide();state.victoryPortal={x:W/2,y:H/2,r:34};}
const weaponUpgrades={
  bow:[
    ['bow-split','SPLIT-FLIGHT','Fire one additional arrow.'],
    ['bow-pierce','PIERCING HEADS','Arrows pass through one extra enemy.'],
    ['bow-heavy','HEAVY HEADS','Arrows deal +2 damage.'],
    ['bow-draw','QUICK DRAW','Fire 35% more often.'],
    ['bow-seeker','SEEKER FLETCHING','Arrows fly 40% faster and steer toward nearby targets.']
  ],
  laser:[
    ['laser-focus','FOCUSED BEAM','Laser damage +0.5 per tick.'],
    ['laser-pulse','STABLE PULSE','Laser fires 35% more often.'],
    ['laser-reach','LONG LENS','Laser targeting range +310.'],
    ['laser-scorch','SCORCHING TRACE','Hits burn for 1.2 seconds of extra damage.'],
    ['laser-prism','PRISM SPLIT','Every third beam tick hits a second target.']
  ],
  bomb:[
    ['bomb-radius','WIDE RUPTURE','Blast radius +36.'],
    ['bomb-cluster','CLUSTER CORE','A second blast follows for 55% damage.'],
    ['bomb-fuse','SHORT FUSE','Bombs trigger 35% more often.'],
    ['bomb-impact','IMPACT CHARGE','Bomb damage +2.'],
    ['bomb-pull','GRAVITY WELL','Blasts drag nearby enemies into the center.']
  ],
  sword:[
    ['sword-reach','EXTENDED EDGE','Blade reach +22.'],
    ['sword-spin','RAPID SPIN','Blade rotates 50% faster.'],
    ['sword-span','LONG SWEEP','Blade reach +35%.'],
    ['sword-sharp','STAR SHARPENING','Blade damage +2.5.'],
    ['sword-guard','KINETIC GUARD','Blade reduces contact damage by 30%.']
  ]
};
const weaponData={laser:['PRISM LASER','#c879ff',.55,5],bomb:['VOID CHARGE','#ff965d',3,.4],sword:['STAR BLADE','#ffe17a',2.5,1]};
const ultimateData={
  bow:['STORM VOLLEY','Fires two extra arrows, and every arrow pierces one more enemy.'],
  laser:['PRISM NOVA','A second beam pulses every 0.4s into the three nearest enemies.'],
  bomb:['VOID SUPERNOVA','A wider secondary blast detonates every 1.6s for double damage.'],
  sword:['CELESTIAL BLADE','A second edge orbits opposite the first.']
};
function availableWeaponChoices(){
  const choices=[];
  for(const id of Object.keys(weaponUpgrades)){
    const w=state.weapons[id];
    if(!w){
      choices.push({id,kind:'unlock',name:weaponData[id][0],desc:id==='laser'?'Unlocks a steady auto-targeting laser.':id==='bomb'?'Unlocks area-damage bombs.':'Unlocks a rotating close-range blade.'});
    }else if(w.taken.length<5){
      for(const u of weaponUpgrades[id])if(!w.taken.includes(u[0]))choices.push({id:u[0],kind:'weapon',weapon:id,name:u[1],desc:u[2]});
    }else if(!w.ultimate){
      choices.push({id:id+'-ultimate',kind:'ultimate',weapon:id,name:ultimateData[id][0],desc:ultimateData[id][1]});
    }
  }
  return choices;
}
function shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function levelUp(){
  if(state.paused||state.upgradeOpen)return;
  state.xp-=state.need;state.need=Math.floor(state.need*1.25);state.level++;state.paused=true;state.upgradeOpen=true;
  const weaponChoices=availableWeaponChoices(),globals=[{id:'health',kind:'global',name:'REINFORCED HULL',desc:'Maximum health +25 and fully repairs.'},{id:'speed',kind:'global',name:'KINETIC THRUSTERS',desc:'Movement speed +18%.'},{id:'regen',kind:'global',name:'NANITE REPAIR',desc:'Health regeneration +2 per second.'}];
  if(!state.globals.dash)globals.push({id:'dash',kind:'global',name:'SLIPSTREAM COILS',desc:'Dash carries you 60% further. Offered once.'});
  // a ready ultimate always gets a slot, but never crowds out the whole draw
  const ults=shuffle(weaponChoices.filter(u=>u.kind==='ultimate')).slice(0,2);
  const rest=shuffle(weaponChoices.filter(u=>u.kind!=='ultimate').concat(globals));
  const choices=ults.concat(rest).slice(0,3);
  show('<div class="modal"><div class="eyebrow">ASCENSION // LEVEL '+state.level+'</div><h2>Choose an upgrade</h2><p>Each card shows the exact change it will make.</p><div class="cards">'+choices.map((u,i)=>'<div class="card'+(u.kind==='ultimate'?' ultimate':'')+'"><span class="card-key">0'+(i+1)+' // '+(u.kind==='ultimate'?'ULTIMATE':u.kind==='unlock'?'NEW WEAPON':'UPGRADE')+'</span><h3>'+u.name+'</h3><p>'+u.desc+'</p><button data-up="'+u.id+'">INSTALL</button></div>').join('')+'</div></div>');
  document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>upgrade(b.dataset.up));
}
function upgrade(id){
  if(!state.upgradeOpen)return;
  state.upgradeOpen=false;
  if(['health','speed','regen','dash'].includes(id)){
    if(id==='dash'&&state.globals.dash){state.paused=false;hide();return;} // one-time only
    state.globals[id]=(state.globals[id]||0)+1;
    if(id==='health'){player.maxHp+=25;player.hp=player.maxHp;}
    if(id==='speed')player.speed*=1.18;
    if(id==='regen')player.regen+=2;
    if(id==='dash'){state.dashPower=1.6;state.dashCooldown=0;burst(player.x,player.y,'#55e6ff',34,300,{size:3,drag:2.6});}
  }
  else if(weaponData[id]){const d=weaponData[id];state.weapons[id]={name:d[0],color:d[1],damage:d[2],rate:d[3],level:0,upgrades:0,taken:[],ultimate:false};}
  else if(id.endsWith('-ultimate')){
    const weapon=id.replace('-ultimate',''),w=state.weapons[weapon];
    if(w&&!w.ultimate){
      w.ultimate=true;w.level=6;w.ultimateIn=0;
      state.flash=Math.max(state.flash,.55);shake(14);
      burst(player.x,player.y,w.color,44,340,{size:3.4,drag:2.4});
      blasts.push({x:player.x,y:player.y,radius:210,life:.55,maxLife:.55,color:w.color});
    }
  }
  else {const weapon=id.split('-')[0],w=state.weapons[weapon],u=weaponUpgrades[weapon]&&weaponUpgrades[weapon].find(x=>x[0]===id);if(w&&u&&!w.taken.includes(id)){w.taken.push(id);w.upgrades++;w.level=w.upgrades;applyWeaponUpgrade(weapon,id);}}
  state.paused=false;hide();
}
function applyWeaponUpgrade(weapon,id){const w=state.weapons[weapon];if(weapon==='bow'){if(id==='bow-split')w.shots=(w.shots||1)+1;if(id==='bow-pierce')w.pierce=(w.pierce||0)+1;if(id==='bow-heavy')w.damage+=2;if(id==='bow-draw')w.rate*=1.35;if(id==='bow-seeker'){w.projectileSpeed=(w.projectileSpeed||540)*1.4;w.homing=true;}}if(weapon==='laser'){if(id==='laser-focus')w.damage+=.5;if(id==='laser-pulse')w.rate*=1.35;if(id==='laser-reach')w.range=(w.range||505)+310;if(id==='laser-scorch')w.linger=1.2;if(id==='laser-prism')w.split=true;}if(weapon==='bomb'){if(id==='bomb-radius')w.radius=(w.radius||115)+36;if(id==='bomb-cluster')w.double=true;if(id==='bomb-fuse')w.rate*=1.35;if(id==='bomb-impact')w.damage+=2;if(id==='bomb-pull')w.pull=true;}if(weapon==='sword'){if(id==='sword-reach')w.reach=(w.reach||68)+22;if(id==='sword-spin')w.spin=(w.spin||4)*1.5;if(id==='sword-span')w.reach=(w.reach||68)*1.35;if(id==='sword-sharp')w.damage+=2.5;if(id==='sword-guard')w.guard=true;}
}
const globalInfo={health:['REINFORCED HULL','Maximum health +25 each'],speed:['KINETIC THRUSTERS','Movement speed +18% each'],regen:['NANITE REPAIR','Health regeneration +2/s each'],dash:['SLIPSTREAM COILS','Dash carries you 60% further']};
const relicInfo={echo:['ECHO PHANTOM','A ghost mirrors your movement and fires with you.'],cloak:['PHASE CLOAK','Press E to phase out for 3 seconds.'],overdrive:['CORE OVERDRIVE','All weapons fire 25% faster.']};
function loadoutMarkup(){
  const weapons=Object.keys(weaponUpgrades).map(id=>{
    const w=state.weapons[id];
    if(!w)return '<div class="lo-weapon locked"><div class="lo-head"><i class="weapon-dot" style="background:#3d4c66"></i><b>'+weaponData[id][0]+'</b><span class="lo-lvl">LOCKED</span></div><p class="lo-note">Not installed — offer it at a level-up.</p></div>';
    const rows=weaponUpgrades[id].map(u=>{
      const has=w.taken.includes(u[0]);
      return '<li class="'+(has?'on':'off')+'"><b>'+u[1]+'</b><span>'+u[2]+'</span></li>';
    }).join('');
    const maxed=w.taken.length>=5;
    const lvl=w.ultimate?'MAX':'&#9733; '+w.taken.length+' / 5';
    const foot=w.ultimate
      ? '<p class="lo-note ult"><b>'+ultimateData[id][0]+'</b> '+ultimateData[id][1]+'</p>'
      : maxed
        ? '<p class="lo-note ready"><b>'+ultimateData[id][0]+'</b> unlocks at your next level-up.</p>'
        : '';
    return '<div class="lo-weapon'+(w.ultimate?' maxed':'')+'"><div class="lo-head"><i class="weapon-dot" style="background:'+w.color+'"></i><b>'+w.name+'</b>'+(w.ultimate?'<span class="lo-ult">ULT</span>':'')+'<span class="lo-lvl">'+lvl+'</span></div><ul class="lo-list">'+rows+'</ul>'+foot+'</div>';
  }).join('');
  const extras=Object.keys(globalInfo).filter(k=>state.globals[k]).map(k=>'<li class="on"><b>'+globalInfo[k][0]+(state.globals[k]>1?' &times;'+state.globals[k]:'')+'</b><span>'+globalInfo[k][1]+'</span></li>').join('')
    +state.relicsTaken.map(k=>'<li class="on relic"><b>'+relicInfo[k][0]+'</b><span>'+relicInfo[k][1]+'</span></li>').join('');
  const stats='<div class="lo-stats"><span>ROOM <b>'+state.room+'</b></span><span>LEVEL <b>'+state.level+'</b></span><span>KILLS <b>'+state.kills+'</b></span><span>HULL <b>'+Math.ceil(player.hp)+'/'+player.maxHp+'</b></span><span>SPEED <b>'+Math.round(player.speed)+'</b></span><span>REGEN <b>'+player.regen.toFixed(0)+'/s</b></span></div>';
  return '<div class="modal wide"><div class="eyebrow">SYSTEM PAUSED</div><h2>Loadout</h2>'+stats
    +'<div class="loadout">'+weapons+'</div>'
    +(extras?'<div class="lo-extras"><span class="lo-title">SYSTEMS &amp; RELICS</span><ul class="lo-list">'+extras+'</ul></div>':'')
    +'<button class="continue" id="resume">RESUME</button></div>';
}
function pause(){if(!state||state.intermission)return;state.paused=!state.paused;if(state.paused){show(loadoutMarkup());$('#resume').onclick=pause;}else hide();}
function gameOver(){
  recordRoom(state.room);
  state.paused=true;show('<div class="modal"><div class="eyebrow">SIGNAL LOST</div><h2>Run terminated</h2><p>Room '+state.room+' • '+state.kills+' hostiles cleared</p><p style="font-size:0.9em; opacity:0.7; margin-bottom:1em;">Best Room: '+highscore+'</p><button class="continue" id="restart">REBOOT RUN</button><button class="continue ghost" id="toStart">CHANGE DIFFICULTY</button></div>');
  $('#restart').onclick=()=>reset(state.difficulty);
  $('#toStart').onclick=()=>{confirmingReset=false;showStart();};
}
function show(markup){ui.overlay.innerHTML=markup;ui.overlay.classList.remove('hidden');}function hide(){ui.overlay.classList.add('hidden');ui.overlay.innerHTML='';}
function hud(){ui.hp.style.width=player.hp/player.maxHp*100+'%';ui.hpText.textContent=Math.ceil(player.hp)+' / '+player.maxHp;ui.xp.style.width=Math.min(100,state.xp/state.need*100)+'%';ui.xpText.textContent=Math.floor(state.xp)+' / '+state.need+' XP';ui.level.textContent='LV '+state.level;ui.kills.textContent=state.kills;paintBest();ui.timer.textContent=new Date(state.time*1000).toISOString().slice(14,19);ui.weapons.innerHTML=Object.values(state.weapons).map(w=>'<span class="weapon-item'+(w.ultimate?' ult':'')+'"><i class="weapon-dot" style="background:'+w.color+'"></i>'+w.name+' <small>'+(w.ultimate?'MAX':'★'+w.taken.length+(w.taken.length>=5?' ▲':''))+'</small></span>').join('');const dash=document.querySelector('.dash-hud'),text=document.querySelector('#dashText');dash.classList.toggle('boosted',!!state.globals.dash);if(state.dashTime>0){text.textContent='DASHING';dash.classList.remove('cooldown');}else if(state.dashCooldown>0){text.textContent=state.dashCooldown.toFixed(1)+'s';dash.classList.add('cooldown');}else{text.textContent='READY';dash.classList.remove('cooldown');}}
function poly(x,y,r,n,rot){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function updateDamageNumbers(dt){for(const d of damageNumbers){d.y-=40*dt;d.life-=dt;}damageNumbers=damageNumbers.filter(d=>d.life>0);}
function drawDamageNumbers(){
  ctx.save();ctx.textAlign='center';
  for(const d of damageNumbers){
    const k=clamp(d.life/.6,0,1);
    ctx.globalAlpha=Math.min(1,k*1.7);
    ctx.font="bold "+(15+(1-k)*4).toFixed(1)+"px 'DM Mono', monospace";
    ctx.fillStyle='rgba(6,10,19,.55)';ctx.fillText(d.n,d.x+1.5,d.y+1.5);
    ctx.fillStyle=d.color;ctx.fillText(d.n,d.x,d.y);
  }
  ctx.restore();
}
const T_SWIRL=.8, T_SUCK=.4, T_FLASH=.16, T_WARP=.9, T_ARRIVE=.75;
const SUCK_Z0=1.45; // zoom the swirl hands off to the pull-in at
const easeIn=t=>t*t*t;
const easeOut=t=>1-Math.pow(1-t,3);
const BANNER_TIME=3;
const grand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
let bannerLayer=null;
function drawRoomBanner(){
  const b=state.roomBanner;if(!b||b.life<=0)return;
  const t=BANNER_TIME-b.life;
  const fade=b.life>.8?1:b.life/.8;
  const intro=Math.min(1,t/.28);
  const step=Math.floor(t*20);
  const heat=.2+(1-intro)*1.7+(1-fade)*1.5+(grand(step*3.7)>.87?1:0);
  const text='ROOM '+b.room;
  const LW=W, LH=150;
  if(!bannerLayer){bannerLayer=document.createElement('canvas');bannerLayer.width=LW;bannerLayer.height=LH;}
  const g=bannerLayer.getContext('2d');
  g.clearRect(0,0,LW,LH);
  g.textAlign='center';g.textBaseline='middle';
  g.font="700 66px 'Space Grotesk',sans-serif";
  const cx=LW/2,cy=LH/2;
  const jx=(grand(step)*2-1)*11*heat,jy=(grand(step+91)*2-1)*3.5*heat;
  g.globalCompositeOperation='lighter';
  g.globalAlpha=.85;
  g.fillStyle='#ff557d';g.fillText(text,cx+jx,cy+jy);
  g.fillStyle='#55e6ff';g.fillText(text,cx-jx,cy-jy);
  g.globalCompositeOperation='source-over';
  g.globalAlpha=grand(step+7)>.94?.3:1;
  g.shadowColor='#55e6ff';g.shadowBlur=26;g.fillStyle='#eff4ff';
  g.fillText(text,cx,cy);
  g.shadowBlur=0;g.globalAlpha=1;
  g.globalCompositeOperation='destination-out';
  g.fillStyle='rgba(0,0,0,.5)';
  for(let y=0;y<LH;y+=4)g.fillRect(0,y,LW,1);
  g.globalCompositeOperation='source-over';
  const top=Math.round(H*.165-LH/2), band=5;
  ctx.save();
  ctx.globalAlpha=fade;
  for(let y=0;y<LH;y+=band){
    const i=y/band, r=grand(step*17+i*3.1);
    if(r>.985&&heat>.6)continue;
    const off=r>.82?Math.round((grand(step*5+i*7.7)*2-1)*46*heat):0;
    ctx.drawImage(bannerLayer,0,y,LW,Math.min(band,LH-y),off,top+y,LW,Math.min(band,LH-y));
  }
  ctx.restore();
}
function drawPortal(){
  if(!state.victoryPortal)return;
  const p=state.victoryPortal, t=state.time, ch=clamp(state.portalCharge||0,0,1);
  const spin=1+ch*3.4;                 // everything winds up as the player spirals in
  const pulse=Math.sin(t*(4+ch*10))*(5+ch*4);
  const core=p.r*(1+ch*.42)+pulse;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  // swirling accretion arcs
  for(let i=0;i<3;i++){
    const rr=p.r+22+i*13+Math.sin(t*3+i)*4-ch*i*7, sp=t*(1.5+i*.7)*spin*(i%2?-1:1);
    ctx.strokeStyle=i%2?'#55e6ff':'#a6d8ff';
    ctx.globalAlpha=(.45-i*.1)*(1+ch*.8);
    ctx.lineWidth=(3-i*.6)*(1+ch);
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,rr),sp,sp+Math.PI*1.15);ctx.stroke();
  }
  // infalling motes
  const motes=9+Math.round(ch*14);
  for(let i=0;i<motes;i++){
    const phase=(t*(.75+ch*1.6)+i/motes)%1, rr=p.r+14+(1-phase)*(120+ch*90), a=i*2.4+t*2.2*spin+phase*3;
    ctx.globalAlpha=phase*.9;
    ctx.fillStyle='#eaffff';
    ctx.beginPath();ctx.arc(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr,1.8+phase*1.8,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  ctx.save();
  const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,core);
  g.addColorStop(0,'#fff');
  g.addColorStop(0.3,'#fff');
  g.addColorStop(0.6,'#55e6ff');
  g.addColorStop(1,'transparent');
  ctx.fillStyle=g;
  ctx.shadowColor='#fff';
  ctx.shadowBlur=30+ch*40;
  ctx.beginPath();
  ctx.arc(p.x,p.y,core,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle='#fff';
  ctx.lineWidth=2+ch*2;
  ctx.globalAlpha=0.5+Math.sin(t*(4+ch*10))*0.5;
  ctx.beginPath();
  ctx.arc(p.x,p.y,core+10,0,Math.PI*2);
  ctx.stroke();
  ctx.restore();
}
function drawVictorySequence(){
  if(state.victorySequence==='warp'&&state.warp){
    const p=clamp(1-state.victoryTimer/T_WARP,0,1);
    const R=Math.hypot(W,H)*.62, spin=state.time*.6;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    for(const s of state.warp){
      const a=s.a+spin+s.d*.5;
      const r0=s.d*R, r1=r0+s.len*s.d*R*1.6;
      const k=clamp(s.d,0,1);
      ctx.globalAlpha=clamp(s.d*2.2,0,1)*clamp((1.5-s.d)*1.6,0,1)*.85;
      ctx.strokeStyle=`rgb(${Math.round(90+165*k)},${Math.round(220+35*k)},255)`;
      ctx.lineWidth=s.w*(.5+k);
      ctx.beginPath();
      ctx.moveTo(W/2+Math.cos(a)*r0,H/2+Math.sin(a)*r0);
      ctx.lineTo(W/2+Math.cos(a)*r1,H/2+Math.sin(a)*r1);
      ctx.stroke();
    }
    // the destination growing at the vanishing point
    const core=8+Math.pow(p,3)*260;
    const cg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,core);
    cg.addColorStop(0,'rgba(255,255,255,'+(.5+p*.5)+')');
    cg.addColorStop(.45,'rgba(140,235,255,'+(.32+p*.4)+')');
    cg.addColorStop(1,'transparent');
    ctx.globalAlpha=1;ctx.fillStyle=cg;
    ctx.beginPath();ctx.arc(W/2,H/2,core,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  if(state.flash>0){
    ctx.save();
    ctx.fillStyle='#fff';
    ctx.globalAlpha=clamp(state.flash,0,1);
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);
  ctx.save();
  if(state.shake>0){ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));state.shake*=0.9;}
  if(state.cameraZoom!==1||state.cameraRot){
    ctx.translate(state.zoomCenterX,state.zoomCenterY);
    ctx.rotate(state.cameraRot);
    ctx.scale(state.cameraZoom,state.cameraZoom);
    ctx.translate(-state.zoomCenterX,-state.zoomCenterY);
  }
  drawBackground();
  drawStars();drawEnemies();drawProjectiles();drawBlasts();drawParticles();drawEcho();drawPortal();drawPlayer();drawWeaponEffects();drawDamageNumbers();
  ctx.restore();
  drawVignette();
  if(state.hurtFlash>0){
    const g=ctx.createRadialGradient(W/2,H/2,H*.26,W/2,H/2,H*.86);
    g.addColorStop(0,'rgba(255,60,110,0)');
    g.addColorStop(1,'rgba(255,60,110,'+(.6*clamp(state.hurtFlash,0,1))+')');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  if(state.screenAlpha>0){ctx.fillStyle='rgba(0,0,0,'+state.screenAlpha+')';ctx.fillRect(0,0,W,H);}
  drawVictorySequence();drawRoomBanner();
}
let bgDots=null,vignette=null;
function drawBackground(){
  if(!bgDots)bgDots=Array.from({length:112},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.7+.5,p:Math.random()*7,s:.4+Math.random()*1.3}));
  for(const d of bgDots){
    ctx.globalAlpha=.1+Math.abs(Math.sin(state.time*d.s+d.p))*.26;
    ctx.fillStyle='#8fb4e0';ctx.fillRect(d.x,d.y,d.r,d.r);
  }
  ctx.globalAlpha=1;ctx.lineWidth=1;
  ctx.strokeStyle='#131f31';ctx.beginPath();
  for(let x=60;x<W;x+=60){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  for(let y=60;y<H;y+=60){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();
  ctx.strokeStyle='#1c2e47';ctx.beginPath();
  for(let x=240;x<W;x+=240){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  for(let y=240;y<H;y+=240){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();
  const L=20,T=32,R=W-20,B=H-26,c=34;
  ctx.strokeStyle='#2a3d59';ctx.strokeRect(L,T,R-L,B-T);
  ctx.save();
  ctx.strokeStyle='#55e6ff';ctx.lineWidth=2.5;ctx.globalAlpha=.55;
  ctx.shadowColor='#55e6ff';ctx.shadowBlur=10;
  ctx.beginPath();
  ctx.moveTo(L,T+c);ctx.lineTo(L,T);ctx.lineTo(L+c,T);
  ctx.moveTo(R-c,T);ctx.lineTo(R,T);ctx.lineTo(R,T+c);
  ctx.moveTo(R,B-c);ctx.lineTo(R,B);ctx.lineTo(R-c,B);
  ctx.moveTo(L+c,B);ctx.lineTo(L,B);ctx.lineTo(L,B-c);
  ctx.stroke();
  ctx.restore();
}
function drawVignette(){
  if(!vignette){
    vignette=ctx.createRadialGradient(W/2,H/2,H*.36,W/2,H/2,H*.96);
    vignette.addColorStop(0,'rgba(4,7,15,0)');
    vignette.addColorStop(1,'rgba(4,7,15,.72)');
  }
  ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
}
const hexCache={};
function rgba(hex,a){
  let c=hexCache[hex];
  if(!c){const h=hex.length===4?'#'+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3]:hex;c=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];hexCache[hex]=c;}
  return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
}
function starPath(r,ir,points,rot){ctx.beginPath();for(let i=0;i<points*2;i++){const a=rot+i*Math.PI/points,rr=i%2?ir:r,x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
function enemyPath(e,sp){
  if(e.type==='bowtie')starPath(e.r*1.18,e.r*.4,4,Math.PI/4);
  else if(e.type==='trap'){ctx.beginPath();ctx.moveTo(-e.r*.92,e.r*.74);ctx.lineTo(e.r*.92,e.r*.74);ctx.lineTo(e.r*.6,-e.r*.78);ctx.lineTo(-e.r*.6,-e.r*.78);ctx.closePath();}
  else poly(0,0,e.r,sp.sides,e.type==='triangle'?-Math.PI/2:Math.PI/4);
}
function drawStars(){
  for(const s of stars){
    const pulse=1+Math.sin(state.time*7+s.spin)*.13, pulled=dist(s,player)<250;
    if(pulled){
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.3;
      ctx.strokeStyle='#ffe17a';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+(s.x-player.x)*.16,s.y+(s.y-player.y)*.16);ctx.stroke();
      ctx.restore();
    }
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.spin);
    ctx.fillStyle='#ffe17a';ctx.shadowColor='#ffe17a';ctx.shadowBlur=20;
    poly(0,0,10*pulse,5,-Math.PI/2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#fff6d4';
    poly(0,0,4.4*pulse,5,-Math.PI/2);ctx.fill();
    ctx.restore();
  }
}
function drawEnemies(){
  for(const e of enemies){
    const sp=types[e.type];
    const grow=clamp((state.time-(e.born||0))/.3,0,1);
    const sc=grow<1?.35+.65*grow+Math.sin(grow*Math.PI)*.16:1;
    const hit=clamp(e.flash/.12,0,1);
    ctx.save();
    ctx.translate(e.x,e.y);
    ctx.globalAlpha=grow;
    if(e.boss){
      ctx.save();
      ctx.globalAlpha=grow*.45;ctx.strokeStyle=sp.color;ctx.lineWidth=3;
      ctx.setLineDash([18,13]);ctx.rotate(state.time*.7);
      ctx.beginPath();ctx.arc(0,0,e.r+22+Math.sin(state.time*2)*4,0,7);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
    }
    ctx.rotate(e.rot||0);
    ctx.scale(sc,sc);
    ctx.shadowColor=sp.color;ctx.shadowBlur=13+hit*28;
    ctx.fillStyle=hit?'#fff':sp.color;
    enemyPath(e,sp);ctx.fill();
    ctx.shadowBlur=0;
    ctx.save();ctx.scale(.58,.58);ctx.globalAlpha=grow*.6;ctx.fillStyle='#0a1120';enemyPath(e,sp);ctx.fill();ctx.restore();
    ctx.globalAlpha=grow*(.5+hit*.5);
    ctx.strokeStyle=hit?'#fff':'#e8f4ff';ctx.lineWidth=1.7;
    enemyPath(e,sp);ctx.stroke();
    ctx.restore();
    if(e.laserLinger>0){
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=.45*clamp(e.laserLinger,0,1);
      ctx.strokeStyle='#c879ff';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+7+Math.sin(state.time*14)*2,0,7);ctx.stroke();
      ctx.restore();
    }
    if(e.hp<e.maxHp&&grow>=1){
      const bw=Math.max(28,e.r*2.2),bx=e.x-bw/2,by=e.y-e.r-13;
      ctx.fillStyle='rgba(7,11,21,.78)';ctx.fillRect(bx-1.5,by-1.5,bw+3,6);
      ctx.fillStyle='#1d2738';ctx.fillRect(bx,by,bw,3);
      ctx.fillStyle=sp.color;ctx.shadowColor=sp.color;ctx.shadowBlur=8;
      ctx.fillRect(bx,by,bw*clamp(e.hp/e.maxHp,0,1),3);
      ctx.shadowBlur=0;
    }
  }
}
function drawProjectiles(){
  ctx.save();ctx.lineCap='round';
  for(const a of arrows){
    const dir=Math.atan2(a.vy,a.vx), sp=Math.hypot(a.vx,a.vy), len=clamp(sp*.055,20,56);
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(dir);
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=a.color;
    ctx.globalAlpha=.22;ctx.lineWidth=8;
    ctx.beginPath();ctx.moveTo(-len,0);ctx.lineTo(1,0);ctx.stroke();
    ctx.globalAlpha=.5;ctx.lineWidth=3.4;
    ctx.beginPath();ctx.moveTo(-len*.6,0);ctx.lineTo(3,0);ctx.stroke();
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    ctx.fillStyle='#f2fdff';ctx.shadowColor=a.color;ctx.shadowBlur=14;
    ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-3,4.4);ctx.lineTo(0,0);ctx.lineTo(-3,-4.4);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  for(const s of echoShots){
    const dir=Math.atan2(s.vy,s.vx);
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(dir);
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.3;ctx.strokeStyle='#a6d8ff';ctx.lineWidth=7;
    ctx.beginPath();ctx.moveTo(-22,0);ctx.lineTo(0,0);ctx.stroke();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    ctx.fillStyle='#dff0ff';ctx.shadowColor='#a6d8ff';ctx.shadowBlur=16;
    ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill();
    ctx.restore();
  }
  for(const b of enemyBullets){
    const dir=Math.atan2(b.vy,b.vx), pu=1+Math.sin(state.time*17+b.life*9)*.14;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(dir);
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.32;ctx.fillStyle='#ff6387';
    ctx.beginPath();ctx.ellipse(-b.r*1.9,0,b.r*3,b.r*.75,0,0,7);ctx.fill();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    ctx.fillStyle='#ff6387';ctx.shadowColor='#ff6387';ctx.shadowBlur=14;
    ctx.beginPath();ctx.arc(0,0,b.r*pu,0,7);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#ffe0e8';
    ctx.beginPath();ctx.arc(0,0,b.r*.42*pu,0,7);ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function drawBlasts(){
  for(const b of blasts){
    const p=clamp(1-b.life/b.maxLife,0,1), R=b.radius*easeOut(p);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    if(p<.55){
      const cf=1-p/.55, cr=b.radius*(.18+p*.62);
      const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,cr);
      g.addColorStop(0,'rgba(255,255,255,'+(.9*cf)+')');
      g.addColorStop(.35,rgba(b.color,.55*cf));
      g.addColorStop(1,rgba(b.color,0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(b.x,b.y,cr,0,7);ctx.fill();
    }
    const n=14, seed=(b.x*.37+b.y*.71)%6.283;
    ctx.strokeStyle=b.color;
    ctx.globalAlpha=Math.pow(1-p,1.7)*.9;
    for(let i=0;i<n;i++){
      const a=seed+i*(Math.PI*2/n), jag=.72+((i*53)%17)/34;
      ctx.lineWidth=3.2*(1-p);
      ctx.beginPath();
      ctx.moveTo(b.x+Math.cos(a)*R*.5,b.y+Math.sin(a)*R*.5);
      ctx.lineTo(b.x+Math.cos(a)*R*(.9+jag*.28),b.y+Math.sin(a)*R*(.9+jag*.28));
      ctx.stroke();
    }
    ctx.globalAlpha=Math.pow(1-p,1.3);
    ctx.lineWidth=1.5+14*(1-p);
    ctx.shadowColor=b.color;ctx.shadowBlur=22;
    ctx.beginPath();ctx.arc(b.x,b.y,R,0,7);ctx.stroke();
    ctx.shadowBlur=0;
    ctx.globalAlpha=Math.pow(1-p,2.2)*.7;
    ctx.strokeStyle='#fff';ctx.lineWidth=2.4;
    ctx.beginPath();ctx.arc(b.x,b.y,b.radius*easeOut(p*.66),0,7);ctx.stroke();
    ctx.restore();
  }
}
function drawParticles(){
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const p of particles){
    const k=clamp(p.life/(p.maxLife||.6),0,1);
    ctx.globalAlpha=k*.95;
    ctx.strokeStyle=p.color;
    ctx.lineWidth=Math.max(.6,(p.size||2.6)*k);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
    ctx.lineTo(p.x-p.vx*.024,p.y-p.vy*.024);
    ctx.stroke();
  }
  ctx.restore();
}
function drawEcho(){
  if(!state?.echo)return;
  const p=state.echo;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=.32;ctx.fillStyle='#a6d8ff';
  ctx.beginPath();ctx.arc(p.x,p.y,player.r*.92,0,7);ctx.fill();
  ctx.globalAlpha=.5;ctx.strokeStyle='#a6d8ff';ctx.lineWidth=1.6;
  ctx.beginPath();ctx.arc(p.x,p.y,player.r+5+Math.sin(state.time*4)*2.5,0,7);ctx.stroke();
  ctx.restore();
}
function drawPlayer(){
  const cloaked=state.cloakTime>0;
  const base=cloaked?'#c7b7ff':'#55e6ff';
  const color=player.flash>0?'#ffffff':base;
  const hpFrac=clamp(player.hp/player.maxHp,0,1);
  const ringColor=hpFrac>.5?base:hpFrac>.25?'#ffc857':'#ff557d';
  const alpha=state.playerAlpha;
  // motion ribbon
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=base;
  for(let i=state.history.length-1;i>0;i--){
    const h=state.history[i],k=1-i/24;
    ctx.globalAlpha=alpha*.17*k*k;
    ctx.beginPath();ctx.arc(h.x,h.y,player.r*k*.92,0,7);ctx.fill();
  }
  ctx.restore();
  // aura
  ctx.save();
  const aur=player.r*3.2*(1+Math.sin(state.time*3)*.06);
  const g=ctx.createRadialGradient(player.x,player.y,player.r*.4,player.x,player.y,aur);
  g.addColorStop(0,rgba(base,.26*alpha*(cloaked?.4:1)));
  g.addColorStop(1,rgba(base,0));
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(player.x,player.y,aur,0,7);ctx.fill();
  ctx.restore();
  // bow arm
  ctx.save();
  ctx.globalAlpha=(cloaked?.25:1)*alpha;
  ctx.translate(player.x,player.y);ctx.rotate(player.aim);
  ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=12;
  ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(33,0);ctx.stroke();
  ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(15,-10);ctx.quadraticCurveTo(30,0,15,10);ctx.stroke();
  ctx.lineWidth=1;ctx.globalAlpha*=.6;
  ctx.beginPath();ctx.moveTo(15,-10);ctx.lineTo(15,10);ctx.stroke();
  ctx.restore();
  // guard shield
  if(state.weapons.sword&&state.weapons.sword.guard){
    ctx.save();ctx.globalAlpha=alpha*.28;ctx.translate(player.x,player.y);ctx.rotate(-state.time*.9);
    ctx.strokeStyle='#ffe17a';ctx.lineWidth=1.5;
    poly(0,0,player.r+13,6,0);ctx.stroke();
    ctx.restore();
  }
  // core
  ctx.save();
  ctx.globalAlpha=(cloaked?.3:1)*alpha;
  ctx.translate(player.x,player.y);
  ctx.rotate(state.time*.6);
  ctx.fillStyle=player.flash>0?'#fff':'#dff6ff';
  ctx.shadowColor=color;ctx.shadowBlur=26;
  poly(0,0,player.r,6,0);ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.arc(0,0,player.r*.42,0,7);ctx.fill();
  ctx.restore();
  // health ring
  ctx.save();
  ctx.globalAlpha=alpha*(cloaked?.4:1);
  ctx.translate(player.x,player.y);
  ctx.strokeStyle='rgba(18,28,44,.9)';ctx.lineWidth=3.5;
  ctx.beginPath();ctx.arc(0,0,player.r+7,0,7);ctx.stroke();
  ctx.strokeStyle=ringColor;ctx.shadowColor=ringColor;ctx.shadowBlur=10;ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(0,0,player.r+7,-Math.PI/2,-Math.PI/2+Math.PI*2*hpFrac);ctx.stroke();
  ctx.restore();
}
function drawWeaponEffects(){
  if(state.weapons.laser)drawLaser(state.weapons.laser);
  if(state.weapons.bomb){
    ctx.save();
    ctx.strokeStyle='#ff965d';ctx.globalAlpha=.16+Math.sin(state.time*2.5)*.06;
    ctx.setLineDash([5,10]);ctx.lineDashOffset=-state.time*24;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(player.x,player.y,state.weapons.bomb.radius||96,0,7);ctx.stroke();
    ctx.restore();
  }
  if(state.weapons.sword)for(const a of bladeAngles(state.weapons.sword))drawBlade(state.weapons.sword,a);
}
function drawBlade(w,a){
  const reach=w.reach||68, hilt=14, width=w.width||11;
  ctx.save();
  ctx.translate(player.x,player.y);
  // sweep afterimage — an annulus wedge spanning the blade, so it grows with reach
  ctx.globalCompositeOperation='lighter';
  ctx.strokeStyle=w.color;
  const mid=(hilt+reach)/2, span=reach-hilt;
  for(let i=1;i<=7;i++){
    const k=i/7, back=-1.2*k;
    ctx.globalAlpha=.08*(1-k);
    ctx.lineWidth=span*(1-k*.5);
    ctx.beginPath();ctx.arc(0,0,mid,a+back-.1,a+back+.1);ctx.stroke();
  }
  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;
  ctx.rotate(a);
  ctx.shadowColor=w.color;ctx.shadowBlur=16;
  ctx.fillStyle=w.color;
  ctx.beginPath();
  ctx.moveTo(hilt,-width*.44);ctx.lineTo(reach-5,-width*.18);ctx.lineTo(reach+7,0);ctx.lineTo(reach-5,width*.18);ctx.lineTo(hilt,width*.44);
  ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#fffbe8';
  ctx.beginPath();
  ctx.moveTo(hilt+5,-width*.16);ctx.lineTo(reach-3,-width*.06);ctx.lineTo(reach+3,0);ctx.lineTo(reach-3,width*.06);ctx.lineTo(hilt+5,width*.16);
  ctx.closePath();ctx.fill();
  ctx.globalCompositeOperation='lighter';
  ctx.fillStyle=w.color;ctx.globalAlpha=.55+Math.sin(state.time*20)*.2;
  ctx.beginPath();ctx.arc(reach+4,0,6,0,7);ctx.fill();
  ctx.restore();
}
function drawLaser(w){
  const e=nearest(), inRange=e&&dist(e,player)<=(w.range||505);
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.lineCap='round';
  if(inRange){
    ctx.globalAlpha=.16;ctx.strokeStyle=w.color;ctx.lineWidth=1.5;
    ctx.setLineDash([3,8]);ctx.lineDashOffset=-state.time*46;
    ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(e.x,e.y);ctx.stroke();
    ctx.setLineDash([]);
  }
  const t=w.beamT||0;
  if(t>0&&w.bx!==undefined){
    const k=clamp(t/.14,0,1);
    const targets=[{x:w.bx,y:w.by}].concat(w.nova||[]);
    for(const g of targets){
      ctx.strokeStyle=w.color;
      ctx.globalAlpha=.28*k;ctx.lineWidth=14*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      ctx.globalAlpha=.7*k;ctx.lineWidth=5.5*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      ctx.globalAlpha=k;ctx.strokeStyle='#ffffff';ctx.lineWidth=2*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      ctx.globalAlpha=k*.9;ctx.fillStyle='#ffffff';
      ctx.beginPath();ctx.arc(g.x,g.y,10*k,0,7);ctx.fill();
      ctx.globalAlpha=k*.6;ctx.strokeStyle=w.color;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(g.x,g.y,14+(1-k)*26,0,7);ctx.stroke();
    }
  }
  ctx.restore();
}
function ultimateEffects(dt){
  if(state.victorySequence||state.intermission)return; // no ultimates mid-transition
  for(const [id,w] of Object.entries(state.weapons)){
    if(!w.ultimate||id==='bow'||id==='sword')continue; // bow and sword ultimates are passive
    w.ultimateIn=(w.ultimateIn||0)-dt;
    if(w.ultimateIn>0)continue;
    if(id==='laser'){
      const range=w.range||505;
      const targets=enemies.filter(e=>dist(e,player)<=range).sort((a,b)=>dist(a,player)-dist(b,player)).slice(0,3);
      if(!targets.length)continue; // hold the charge until something is in range
      for(const e of targets)hitLaser(w,e,true);
      w.beamT=.18;w.bx=targets[0].x;w.by=targets[0].y;w.nova=targets.map(e=>({x:e.x,y:e.y}));
      shake(2);
    }
    if(id==='bomb'){
      const t=nearest();
      if(!t)continue; // hold the charge until there is something to hit
      const radius=(w.radius||115)+48;
      detonate(w,t.x,t.y,radius,w.damage*2,null);
      blasts.push({x:t.x,y:t.y,radius:radius*1.35,life:.5,maxLife:.5,color:'#fff2d6'});
      burst(t.x,t.y,'#ffffff',18,300,{size:3,drag:2.2});
      shake(13);
    }
    w.ultimateIn=id==='laser'?.4:1.6;
  }
}
function frame(now){if(!state){ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);return;}const dt=Math.min(.033,(now-state.last)/1000);state.last=now;if(!state.paused){update(dt);ultimateEffects(dt);}draw();requestAnimationFrame(frame);}
let confirmingReset=false;
// the footer reads from the same source whether or not a run is in progress
function paintBest(){ui.best.textContent=highscore;}
function resetSavedData(){
  localStorage.removeItem('shapeshift_best_room');
  localStorage.removeItem('shapeshift_hard_beaten');
  highscore=1;
  paintBest();
}
function showStart(){
  const hardBeaten = localStorage.getItem('shapeshift_hard_beaten') === 'true';
  const resetRow = confirmingReset
    ? '<div class="reset-row confirming"><span>Erase your best room'+(hardBeaten?' and re-lock IMPOSSIBLE':'')+'? This cannot be undone.</span><button id="resetNo">CANCEL</button><button id="resetYes" class="danger">ERASE</button></div>'
    : '<div class="reset-row"><span>BEST ROOM <b>'+highscore+'</b>'+(hardBeaten?' <i>&bull;</i> IMPOSSIBLE UNLOCKED':'')+'</span><button id="resetData">RESET DATA</button></div>';
  show('<div class="modal"><div class="eyebrow">SHAPESHIFT // NEON SURVIVORS</div><h2>Choose your difficulty</h2><p>Move with WASD or arrow keys. Your bow fires automatically at the nearest enemy.</p><div class="cards"><div class="card"><span class="card-key">01 // EASY</span><h3>EASY</h3><p>Enemies have reduced health and move slower.</p><button data-difficulty="easy">START EASY</button></div><div class="card"><span class="card-key">02 // MEDIUM</span><h3>MEDIUM</h3><p>Standard enemy health and speed.</p><button data-difficulty="medium">START MEDIUM</button></div><div class="card"><span class="card-key">03 // HARD</span><h3>HARD</h3><p>Enemies are faster and have 28% more health.</p><button data-difficulty="hard">START HARD</button></div>' + (hardBeaten ? '<div class="card" style="border-color:#ff0000; box-shadow: 0 0 15px #ff000044;"><span class="card-key" style="color:#ff4f9a">04 // ELITE</span><h3 style="color:#ff4f9a">IMPOSSIBLE</h3><p>Absolute carnage. Good luck.</p><button data-difficulty="impossible" style="background:#ff4f9a">START IMPOSSIBLE</button></div>' : '') + '</div>' + resetRow + '</div>');
  document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{confirmingReset=false;reset(b.dataset.difficulty);});
  const ask=$('#resetData'),no=$('#resetNo'),yes=$('#resetYes');
  if(ask)ask.onclick=()=>{confirmingReset=true;showStart();};
  if(no)no.onclick=()=>{confirmingReset=false;showStart();};
  if(yes)yes.onclick=()=>{resetSavedData();confirmingReset=false;showStart();};
}
$('#pauseBtn').onclick=pause;
paintBest();showStart();requestAnimationFrame(frame);
