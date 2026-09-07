const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const W = 1440, H = 900;      // viewport: what the canvas shows
const RW = 3000, RH = 1875;  // room: ~2.1x the viewport each way (4.3x the area)
let camX = 0, camY = 0;
// the camera centres on the player, but stops at the room edges — so approaching
// a wall walks you off-centre, and leaving it recentres you automatically
function camera(){
  camX = clamp(player.x - W/2, 0, RW - W);
  camY = clamp(player.y - H/2, 0, RH - H);
}
const MOVE = 1.15;         // how much of that growth travel speeds take on
const $ = id => document.querySelector(id);
const ui = { hp: $('#healthFill'), hpText: $('#healthText'), xp: $('#xpFill'), xpText: $('#xpText'), level: $('#levelText'), weapons: $('#weaponList'), room: $('#waveNumber'), roomState: $('#waveState'), areaBox: $('#areaReadout'), brandSub: $('#brandSub'), kills: $('#killCount'), timer: $('#timer'), best: $('#bestWave'), toast: $('#toast'), dashRow: $('#dashRow'), dashText: $('#dashText'), phaseRow: $('#phaseRow'), phaseText: $('#phaseText'), pulseRow: $('#pulseRow'), pulseText: $('#pulseText'), soundBtn: $('#soundBtn'), xpHud: $('.xp-hud'), arena: $('.arena-label'), fsBtn: $('#fsBtn'), fsExit: $('#fsExit'), fsPause: $('#fsPause'), fsMute: $('#fsMute'), overlay: $('#overlay') };
const keys = new Set();

// ---- audio ---------------------------------------------------------------
// everything is synthesised at runtime: no files to load, nothing to 404.
// the context is created on the first click, which satisfies autoplay policy.
const SOUND_KEY='shapeshift_sound';
let actx=null, master=null, noiseBuf=null;
let soundOn = localStorage.getItem(SOUND_KEY)!=='off';
function initAudio(){
  if(actx||typeof AudioContext==='undefined')return actx;
  try{
    actx=new AudioContext();
    master=actx.createGain(); master.gain.value=.22; master.connect(actx.destination);
    const n=(actx.sampleRate*.4)|0;
    noiseBuf=actx.createBuffer(1,n,actx.sampleRate);
    const d=noiseBuf.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  }catch(e){actx=null;}
  return actx;
}
function tone(freq,dur,type,vol,slideTo,delay){
  if(!actx||!soundOn)return;
  const t=actx.currentTime+(delay||0);
  const o=actx.createOscillator(), g=actx.createGain();
  o.type=type||'square';
  o.frequency.setValueAtTime(freq,t);
  if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t+dur);
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.014,dur*.35));
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.03);
}
function noiseHit(dur,vol,from,to){
  if(!actx||!soundOn||!noiseBuf)return;
  const t=actx.currentTime;
  const src=actx.createBufferSource(); src.buffer=noiseBuf;
  const f=actx.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1;
  f.frequency.setValueAtTime(from,t);
  if(to)f.frequency.exponentialRampToValueAtTime(Math.max(60,to),t+dur);
  const g=actx.createGain();
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  src.connect(f);f.connect(g);g.connect(master);src.start(t);src.stop(t+dur+.02);
}
// minimum spacing per sound, so rapid-fire weapons cannot turn into a buzz
const SFX_GAP={shoot:.08,laser:.11,arc:.13,hit:.045,kill:.05,boom:.09,hurt:.14,
  dash:.2,level:.35,pick:.06,ui:.04,portal:.4,boss:.6,cleared:.4,ult:.4,death:.6,beat:.85,pip:.035};
const sfxAt={};
function sfx(name){
  if(!actx||!soundOn)return;
  const now=actx.currentTime;
  if(sfxAt[name]!==undefined&&now-sfxAt[name]<(SFX_GAP[name]||0))return;
  sfxAt[name]=now;
  switch(name){
    case 'shoot':  tone(660,.06,'square',.04,380); break;
    case 'laser':  tone(1500,.05,'sawtooth',.028,880); break;
    case 'arc':    noiseHit(.09,.05,2600,700); tone(900,.07,'square',.02,1600); break;
    case 'hit':    noiseHit(.04,.04,1900); break;
    case 'kill':   noiseHit(.15,.075,1000,200); tone(230,.13,'triangle',.035,90); break;
    case 'boom':   noiseHit(.34,.14,520,70);  tone(95,.3,'sine',.09,38); break;
    case 'hurt':   tone(190,.22,'sawtooth',.1,70); noiseHit(.12,.05,700,180); break;
    case 'dash':   noiseHit(.22,.07,320,2400); break;
    case 'level':  [523,659,784,1046].forEach((f,i)=>tone(f,.2,'triangle',.06,0,i*.06)); break;
    case 'pick':   tone(880,.09,'sine',.07,1320); break;
    case 'pip':    tone(1180,.05,'sine',.028,1560); break;
    case 'ui':     tone(540,.045,'square',.035); break;
    case 'portal': tone(300,.55,'sine',.08,1250); noiseHit(.5,.04,400,3000); break;
    case 'boss':   tone(120,.85,'sawtooth',.12,55); tone(180,.85,'sine',.07,80); break;
    case 'cleared':[784,988,1319].forEach((f,i)=>tone(f,.28,'sine',.07,0,i*.08)); break;
    case 'ult':    [392,523,659,880].forEach((f,i)=>tone(f,.5,'triangle',.075,0,i*.05)); noiseHit(.4,.07,600,4000); break;
    case 'death':  tone(300,.9,'sawtooth',.11,45); noiseHit(.7,.08,800,60); break;
    case 'beat':   tone(72,.16,'sine',.11,52); break;
  }
}
function setSound(on){
  soundOn=on;
  localStorage.setItem(SOUND_KEY,on?'on':'off');
  if(on)initAudio();
  paintSoundBtn();
}
function paintSoundBtn(){
  // the topbar's button and the in-arena one are the same control in two places
  for(const b of [ui.soundBtn,ui.fsMute]){
    if(!b)continue;
    b.textContent=soundOn?'\u266A':'\u2717';
    b.title=touchMode?(soundOn?'Mute':'Unmute'):(soundOn?'Mute (M)':'Unmute (M)');
    b.classList.toggle('on',soundOn);
  }
}
const types = {
  square: { hp: 3, speed: 42, r: 16, color: '#ff6387', xp: 8, sides: 4 },
  triangle: { hp: 1, speed: 78, r: 14, color: '#ffc857', xp: 6, sides: 3 },
  hex: { hp: 6, speed: 31, r: 20, color: '#ac80ff', xp: 11, sides: 6 },
  trap: { hp: 10, speed: 20, r: 23, color: '#ff965d', xp: 15, sides: 4 },
  bowtie: { hp: 4, speed: 34, r: 18, color: '#6de0bd', xp: 11, sides: 4, hold: 250 },
  // the only shape that outruns a stock drifter (288px/s) — it is fragile because of it
  diamond: { hp: 3, speed: 264, r: 15, color: '#f36bff', xp: 9, sides: 4 },
  pentagon: { hp: 20, speed: 24, r: 24, color: '#e88bff', xp: 18, sides: 5 },
  prism: { hp: 7, speed: 58, r: 21, color: '#72a8ff', xp: 16, sides: 6 },
  seeker: { hp: 9, speed: 44, r: 19, color: '#ff6bd6', xp: 22, sides: 7, hold: 300 },
  raker: { hp: 14, speed: 24, r: 22, color: '#b6ff5c', xp: 27, sides: 4, hold: 330 },
  boss: { hp: 360, speed: 27, r: 52, color: '#ff4f9a', xp: 120, sides: 8 },
  sentinel: { hp: 360, speed: 27, r: 66, color: '#ff4f9a', xp: 120, sides: 8 },
  lance:    { hp: 360, speed: 62, r: 52, color: '#ff8a3d', xp: 155, sides: 3 },
  orbiter:  { hp: 300, speed: 15, r: 70, color: '#8f7dff', xp: 185, sides: 6 },
  beacon:   { hp: 460, speed: 24, r: 58, color: '#5ce0d8', xp: 215, sides: 5 },
  hollow:   { hp: 420, speed: 19, r: 74, color: '#c14dff', xp: 255, sides: 7 },
  // the carrier: the biggest hull in the game, and the slowest
  mothership:{ hp: 420, speed: 16, r: 96, color: '#ff4d4d', xp: 400, sides: 6 },
  // ---- SECTOR 02 ----------------------------------------------------------
  // the SENTINEL pattern, built at fighter scale and flown in numbers: the thing
  // that held area 10 of the first sector is line infantry in the second
  sentry:  { hp: 9,  speed: 34,  r: 19, color: '#ff4f9a', xp: 24, sides: 8, hold: 260, ring: true },
  stalker: { hp: 8,  speed: 40,  r: 18, color: '#ff9f4d', xp: 26, sides: 5, hold: 300 },
  bastion: { hp: 34, speed: 18,  r: 27, color: '#8ad6ff', xp: 34, sides: 6 },
  // outruns everything in the game, and folds to a single hit
  dart:    { hp: 2,  speed: 330, r: 12, color: '#ff5fd2', xp: 16, sides: 3 },
  // the screen: fast, moderately built, and it will not give you a clean shot at
  // anything fragile. `guard` puts it on the line between you and its ward.
  picket:  { hp: 24, speed: 175, r: 22, color: '#7cf2ff', xp: 42, sides: 5, guard: true },
  // does not die so much as come apart — killing it is only half the job
  splitter:{ hp: 22, speed: 46,  r: 25, color: '#ffe06b', xp: 34, sides: 6, splits: 3, splitInto: 'dart' },
  // the RAKER's two upgrades. Same weapon; what changes is how long the lane it
  // paints keeps burning, which is what turns the floor itself into the threat.
  scorcher:{ hp: 18, speed: 22,  r: 23, color: '#ff8f4d', xp: 44, sides: 4, hold: 360 },
  pyre:    { hp: 26, speed: 18,  r: 26, color: '#ff5c3d', xp: 58, sides: 5, hold: 400 },
  // ---- SECTOR 02 bosses ---------------------------------------------------
  // the drift holds its own rotation: none of the five fights the first sector
  // trained you on comes back for the second
  monolith: { hp: 400, speed: 26,  r: 88, color: '#ff7a4d', xp: 300, sides: 6 },
  shrike:   { hp: 340, speed: 105, r: 46, color: '#ffd24d', xp: 320, sides: 3 },
  breacher: { hp: 400, speed: 30,  r: 74, color: '#6dffb8', xp: 350, sides: 5 },
  wraith:   { hp: 360, speed: 40,  r: 54, color: '#b26bff', xp: 380, sides: 4 },
  leviathan:{ hp: 480, speed: 34,  r: 94, color: '#ff2f6a', xp: 520, sides: 8 }
};
// one boss per ten rooms, cycling once the roster is exhausted.
// hpMult trades bulk against how dangerous each one's pattern is.
const bossOrder = [
  { id:'sentinel', name:'SENTINEL', hpMult:1,    contact:28, blurb:'Volleys and charges' },
  { id:'lance',    name:'LANCE',    hpMult:.78,  contact:34, blurb:'Charges hard, seeds homing orbs' },
  { id:'orbiter',  name:'ORBITER',  hpMult:1.18, contact:26, blurb:'Orbital strikes and a gravity tether' },
  { id:'beacon',   name:'BEACON',   hpMult:.95,  contact:24, blurb:'Sweeping beams, blinks away' },
  { id:'hollow',   name:'HOLLOW',   hpMult:.86,  contact:30, blurb:'Shields itself, calls escorts, rings' },
  // ---- the drift's rotation ------------------------------------------------
  { id:'monolith', name:'MONOLITH', hpMult:2,    contact:34, blurb:'A wall of hull that fires from every face' },
  { id:'shrike',   name:'SHRIKE',   hpMult:.85,  contact:26, blurb:'Fast hull, faster rounds' },
  { id:'breacher', name:'BREACHER', hpMult:1.15, contact:38, blurb:'Slow? Be Ready' },
  { id:'wraith',   name:'WRAITH',   hpMult:.85,  contact:24, blurb:'Blinks out, blinks in on top of you' }
];
// ---- sectors ---------------------------------------------------------------
// a sector is a whole run's worth of context: how steeply the curve climbs, which
// shapes fly in it, which bosses hold it, and what the sky over it looks like.
// Every scaling constant a run reads comes from here rather than from the code.
const SECTORS=[
  { id:1, name:'NEON SECTOR', short:'SECTOR 01',
    blurb:'Open space over a lit deck. Where every wing cuts its teeth.',
    line:'The baseline curve. Squares and triangles early, gunboats late.',
    hpBase:1, hpCurve:.035, wave:1, dmgCurve:.025, bossHp:1, bossCurve:.085,
    credits:1, skill:1, xp:1,
    color:'#55e6ff',
    sky:{ stars:['#38507a','#7f9bd6','#eef4ff'],
          deck:['rgba(24,42,76,.42)','rgba(16,28,54,.24)','rgba(8,13,26,0)'],
          band:'rgba(64,140,215,', rim:'#2a3d59', edge:'#55e6ff', haze:null } },
  { id:2, name:'CRIMSON DRIFT', short:'SECTOR 02', req:2,
    blurb:'A collapsed shipping lane, still burning. Nothing in it is a warm-up.',
    line:'Opens where the first sector ends: heavier hulls, homing fire, five bosses you have never flown against, and a curve that climbs half again as fast.',
    hpBase:1.6, hpCurve:.055, wave:1.22, dmgCurve:.038, bossHp:1.5, bossCurve:.12,
    // it costs more to fly, so it pays more: better remnants in the air, and a
    // bigger bank at the end of it
    credits:1.6, skill:1.5, xp:1.35,
    color:'#ff5f8d',
    sky:{ stars:['#5c2740','#b04d6b','#ffdce6'],
          deck:['rgba(86,22,44,.44)','rgba(50,14,30,.26)','rgba(18,6,13,0)'],
          band:'rgba(226,72,110,', rim:'#4a2333', edge:'#ff5f8d', haze:'#ff3d6e' } },
  { id:3, name:'UNCHARTED', short:'SECTOR 03', req:3, soon:true,
    blurb:'Beyond the drift the charts run out.',
    line:'Coming soon.' }
];
const sectorDef=id=>SECTORS.find(x=>x.id===id)||SECTORS[0];
// during a run the sector is fixed on `state`; on the menus it is whatever is picked
const sector=()=>sectorDef(state&&state.sector?state.sector:chosenSector);
// the last area of a run, and the only fight the rotation does not supply: the
// MOTHERSHIP is what the roster has been building toward.
const FINAL_ROOM=50;
const MOTHERSHIP={ id:'mothership', name:'MOTHERSHIP', hpMult:1.15, contact:34,
  blurb:'Shells you from range, never stops launching' };
const LEVIATHAN={ id:'leviathan', name:'LEVIATHAN', hpMult:1.35, contact:36,
  blurb:'Spirals the room shut, then opens up' };
// every sector ends on a fight of its own, and none of them are on the rotation
const SECTOR_FINALE={ 1:MOTHERSHIP, 2:LEVIATHAN };
const finaleBoss=()=>SECTOR_FINALE[sector().id]||MOTHERSHIP;
// a sector's rotation is its own: the drift shares no fight with the first
// sector, finale included. Only the first four entries are ever reached — area 50
// is the finale, off the rotation — so a rotation lists exactly what it uses,
// except the first sector's HOLLOW, which its area-50 cap has always kept out of reach.
const SECTOR_BOSSES={1:['sentinel','lance','orbiter','beacon','hollow'],
                     2:['monolith','shrike','breacher','wraith']};
const bossRoster=()=>(SECTOR_BOSSES[sector().id]||SECTOR_BOSSES[1])
  .map(id=>bossOrder.find(b=>b.id===id));
const bossForRoom = room => {
  if(room===FINAL_ROOM)return finaleBoss();
  const roster=bossRoster();
  return roster[(Math.max(1,Math.floor(room/10))-1) % roster.length];
};
let player, enemies, arrows, enemyBullets, stars, particles, blasts, echoShots, damageNumbers, delayedBlasts, strikes, rings, pulses, beams, mines, wells, rockets, walls, dashGhosts, state;
// ---- roster -------------------------------------------------------------
// hp/speed are multipliers on the 100hp / 288px-per-second baseline.
// `weapon` grants a weapon nobody else can be offered.
const characters = {
  drifter:   { name:'DRIFTER',    cost:0,    hp:1,    speed:1,    color:'#55e6ff', tag:'BALANCED', plane:'fighter', sides:6, mark:'none',
               blurb:'The standard frame. No strengths, no holes.', perks:['100 hull','288 speed','no trade-offs'] },
  bulwark:   { name:'BULWARK',    cost:200,  hp:1.5,  speed:.8,   color:'#6de0bd', tag:'HEAVY', regen:2, plane:'bomber', sides:8, mark:'plate',
               blurb:'Armour plating traded for pace.', perks:['+50% hull','-20% speed','+2 regen/s'] },
  skirmisher:{ name:'SKIRMISHER', cost:200,  hp:.7,   speed:1.25, color:'#ffc857', tag:'FRAGILE', dashCd:2, dashPower:1.25, plane:'jet', sides:3, mark:'fins',
               blurb:'Fast and thin. Dying is the only real mistake.', perks:['-30% hull','+25% speed','dash recharges in 2s','dash 25% further'] },
  archivist: { name:'ARCHIVIST',  cost:450,  hp:.88,  speed:1.05, color:'#a6d8ff', tag:'SCHOLAR', plane:'recon', sides:5, mark:'motes', xp:1.5,
               blurb:'Reads the remnants faster than anyone. Levels early, levels often.', perks:['+50% XP gained','-12% hull','+5% speed'] },
  warden:    { name:'WARDEN',     cost:800,  hp:1.2,  speed:.92,  color:'#7ee0ff', tag:'GUARDIAN', plane:'gunship', sides:6, mark:'plate', weapon:'aegis',
               blurb:'Carries a deflector projector. Nothing gets close without paying for it.', perks:['exclusive: DEFLECTOR SHIELD','+20% hull','-8% speed'] },
  revenant:  { name:'REVENANT',   cost:1000, hp:.8,   speed:1.1,  color:'#c879ff', tag:'VOLATILE', plane:'delta', sides:4, mark:'sparks', weapon:'arc',
               blurb:'Wired to an ion arc that leaps between targets.', perks:['exclusive: ION ARC','-20% hull','+10% speed'] },
  paragon:   { name:'PARAGON',    cost:2000, hp:1.1,  speed:1.1,  color:'#ffe17a', tag:'APEX', plane:'apex', sides:6, mark:'star', damage:1.2, xp:1.2, shock:10,
               blurb:'Every system tuned past spec, down to a repulsor nobody else can carry.', perks:[()=>ctrlWave()+' &mdash; 10s cooldown','+20% weapon damage','+20% XP gained','+10% hull','+10% speed'] }
};
// v2 introduces the skill tree, which changes what a run is allowed to offer you.
// Progress earned under the old economy has no meaning here, so every profile is
// cleared once and starts again from the root of the tree.
const SAVE_VERSION='2';
const SAVE_KEYS=['shapeshift_best_room','shapeshift_hard_beaten','shapeshift_points',
  'shapeshift_unlocked','shapeshift_character','shapeshift_run','shapeshift_skill','shapeshift_tree',
  'shapeshift_sectors','shapeshift_sector'];
if(localStorage.getItem('shapeshift_version')!==SAVE_VERSION){
  for(const k of SAVE_KEYS)localStorage.removeItem(k);
  localStorage.setItem('shapeshift_version',SAVE_VERSION);
}
const STARTER='drifter';
let highscore = Math.max(1, parseInt(localStorage.getItem('shapeshift_best_room'), 10) || 0);
let points = Math.max(0, parseInt(localStorage.getItem('shapeshift_points'), 10) || 0);
let unlocked = new Set([STARTER]);
(localStorage.getItem('shapeshift_unlocked')||'').split(',').forEach(id=>{if(characters[id])unlocked.add(id);});
let chosen = characters[localStorage.getItem('shapeshift_character')] ? localStorage.getItem('shapeshift_character') : STARTER;
if(!unlocked.has(chosen)) chosen=STARTER;
let devMode=false, devBackup=null;
let sectorsOpen = new Set([1]);
(localStorage.getItem('shapeshift_sectors')||'').split(',').forEach(id=>{const n=parseInt(id,10);if(sectorDef(n)&&!sectorDef(n).soon)sectorsOpen.add(n);});
let chosenSector = parseInt(localStorage.getItem('shapeshift_sector'),10)||1;
if(!sectorsOpen.has(chosenSector))chosenSector=1;
const sectorOpen=id=>sectorsOpen.has(id)||devMode;
let skill = Math.max(0, parseInt(localStorage.getItem('shapeshift_skill'), 10) || 0);
let tree = (()=>{ try{ const t=JSON.parse(localStorage.getItem('shapeshift_tree')||'{}'); return (t&&typeof t==='object')?t:{}; }catch(e){ return {}; } })();
const RUN_KEY='shapeshift_run';
function loadRun(){
  try{ const r=JSON.parse(localStorage.getItem(RUN_KEY)||'null'); return r&&r.v===1?r:null; }catch(e){ return null; }
}
let savedRun = loadRun();
function clearRun(){ savedRun=null; if(!devMode)localStorage.removeItem(RUN_KEY); }
// only the run's meaning is stored — the room repopulates on resume
function storeRun(){
  if(!state||devMode)return;
  savedRun={ v:1, difficulty:state.difficulty, character:state.character, sector:state.sector,
    room:state.room, level:state.level, xp:state.xp, need:state.need,
    kills:state.kills, time:state.time, paid:state.paidCredits||0,
    globals:state.globals, relicsTaken:state.relicsTaken, relicRooms:state.relicRooms,
    hasCloak:!!state.hasCloak, echo:!!state.echo, beatBest:!!state.beatBest,
    dashPower:state.dashPower, dashCd:state.dashCd, charXp:state.charXp, charDamage:state.charDamage,
    rateScale:state.rateScale, critChance:state.critChance, critMult:state.critMult, paidSkill:state.paidSkill||0,
    dashShear:state.dashShear||0, dashShove:!!state.dashShove,
    // relic scalars: the stat relics are already banked in player/weapons above,
    // but these four have nowhere else to live
    enemyPace:state.enemyPace||1, armor:state.armor||1, siphon:state.siphon||0,
    thorns:state.thorns||0, magnet:state.magnet||0,
    weapons:state.weapons, hp:player.hp, maxHp:player.maxHp, speed:player.speed, regen:player.regen };
  try{ localStorage.setItem(RUN_KEY,JSON.stringify(savedRun)); }catch(e){}
}
function resumeRun(){
  const r=savedRun; if(!r)return;
  if(characters[r.character]) chosen=r.character;
  if(r.sector&&sectorOpen(r.sector)) chosenSector=r.sector;
  reset(r.difficulty);
  state.room=r.room; state.level=r.level; state.xp=r.xp; state.need=r.need;
  state.kills=r.kills; state.time=r.time; state.paidCredits=r.paid||0;
  state.globals=r.globals||{}; state.relicsTaken=r.relicsTaken||[]; state.relicRooms=r.relicRooms||{};
  state.hasCloak=!!r.hasCloak; state.beatBest=!!r.beatBest;
  state.dashPower=r.dashPower||1; state.dashCd=r.dashCd||3;
  state.charXp=r.charXp||1; state.charDamage=r.charDamage||1;
  state.rateScale=r.rateScale||1; state.critChance=r.critChance||0; state.critMult=r.critMult||1.3;
  state.dashShear=r.dashShear||0; state.dashShove=!!r.dashShove;
  state.enemyPace=r.enemyPace||1; state.armor=r.armor||1; state.siphon=r.siphon||0;
  state.thorns=r.thorns||0; state.magnet=r.magnet||0;
  state.paidSkill=r.paidSkill||0;
  state.sector=r.sector||1;
  state.freeDraws=0;   // a resumed run already spent its refits
  if(r.weapons) state.weapons=r.weapons;
  state.hasDraw=hasDraw();
  player.maxHp=r.maxHp; player.hp=Math.min(r.hp,r.maxHp); player.speed=r.speed; player.regen=r.regen;
  if(r.echo) state.echo={x:player.x,y:player.y,fireIn:0};
  enemies.length=0; player.x=RW/2; player.y=RH/2;
  beginRoom(); hide();
}
function saveProfile(){
  if(devMode)return;                       // dev mode is a sandbox: the real profile is untouched
  localStorage.setItem('shapeshift_sectors',[...sectorsOpen].join(','));
  localStorage.setItem('shapeshift_sector',chosenSector);
  localStorage.setItem('shapeshift_points',points);
  localStorage.setItem('shapeshift_unlocked',[...unlocked].join(','));
  localStorage.setItem('shapeshift_character',chosen);
}
// points scale with how deep you got, weighted by how hard you made it
const creditRate=d=>(difficulties[d]||difficulties.medium).credits;
// a sector's own multipliers on what a run is worth, defaulting to the first's
const sectorCredits=()=>sector().credits||1;
const sectorSkill=()=>sector().skill||1;
const sectorXp=()=>sector().xp||1;
// the room term compounds ~4.5% per room (capped), so depth pays disproportionately
const roomCreditBonus=room=>Math.min(8,Math.pow(1.045,Math.max(0,room-1)));
// nothing banks until you are past room 5, so bailing out early cannot be farmed
const CREDIT_MIN_ROOM=6;
const creditsOwed=()=>Math.max(0,runReward()-(state.paidCredits||0));
const runReward=()=>state.room<CREDIT_MIN_ROOM?0:Math.max(1,Math.round((state.room*1.5*roomCreditBonus(state.room)+state.kills*.05)*creditRate(state.difficulty)*sectorCredits()));
// the footer tracks the best room ever reached, overtaken live by the current run
function recordRoom(room){
  if(room<=highscore)return;
  const previous=highscore;
  highscore=room;
  if(!devMode)localStorage.setItem('shapeshift_best_room',highscore);
  paintBest();
  // announce once per run, and not on the very first run when there is no record to beat
  if(state&&!state.beatBest&&previous>1){state.beatBest=true;toast('NEW BEST — AREA '+room);}
}
let toastTimer=null;
function toast(msg){
  if(!ui.toast)return;
  ui.toast.textContent=msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),2400);
}
const difficulties = {
  easy:       { label: 'EASY',       hp: .86, speed: .88, dmg: .85, heavy: 1.15, credits: .7,  mass: .85, mix: .6,  shot: .85, shotLife: .9,  note: 'Relaxed enemy stats' },
  medium:     { label: 'MEDIUM',     hp: 1,   speed: 1,   dmg: 1,   heavy: 1.3,  credits: 1,   mass: 1,   mix: 1,   shot: 1,   shotLife: 1,   note: 'Standard enemy stats' },
  hard:       { label: 'HARD',       hp: 1.28,speed: 1.2, dmg: 1.35,heavy: 2.2,  credits: 1.75,mass: 1.22,mix: 1.4, shot: 1.25,shotLife: 1.3, note: 'Fast, reinforced enemies' },
  impossible: { label: 'IMPOSSIBLE', hp: 3,   speed: 1.8, dmg: 2,   heavy: 2.2,  credits: 3,   mass: 1.5, mix: 1.9, shot: 1.5, shotLife: 1.6, note: 'Absolute carnage. Good luck.' }
};
// enemy fire is scaled where it moves rather than where it is fired, so every
// spawn site — shapes, boss volleys, homing orbs — is covered by the one rule.
// `shot` is how fast it travels, `shotLife` how long it stays on the board.
const shotSpeed=()=>(difficulties[state.difficulty]||difficulties.medium).shot||1;
const shotLife=()=>(difficulties[state.difficulty]||difficulties.medium).shotLife||1;
// heavy shapes hit far harder than the rest, but nothing one-shots you:
// a single contact can never take more than this share of your hull.
const CONTACT_CAP = .7;
const BOSS_SLAM = 2.2;          // bosses hit far harder than their nominal contact value
const BOSS_CONTACT_CAP = .92;   // and are allowed much closer to a kill than anything else
const HEAVY_SHAPES = ['trap','pentagon','bastion'];
// the beam family: one weapon at three grades, and `life` — how long the lane
// keeps burning once it lands — is the whole difference between them. A longer
// burn is paid for with a longer reload, so the floor never fills faster than it
// clears. BEAM_CAP is the hard stop that keeps a late room from becoming solid light.
const BEAM_ENEMIES={
  raker:   { lanes:[0],           life:3.4, len:620, warn:.85, damage:20, reload:[3.6,5.2] },
  scorcher:{ lanes:[-.26,.26],    life:6.5, len:680, warn:.8,  damage:22, reload:[4.6,6.4] },
  pyre:    { lanes:[-.42,0,.42],  life:9.5, len:740, warn:.75, damage:24, reload:[6,8.4]   }
};
const BEAM_CAP=15;
// what a screen will cover: the fragile things that fight from a distance. It
// will not screen another screen, and it will not chase one across the room.
const GUARD_LEAD=150, GUARD_KEEP=175, GUARD_REACH=900;
const wardable=e=>e.hp>0&&!e.boss&&!types[e.type].guard&&((types[e.type].hold||0)>0||!!BEAM_ENEMIES[e.type]);
function guardWard(e){
  // whichever ward *you* are closest to, since that is the one your guns are
  // about to pick out of the crowd
  let best=null,bestD=Infinity;
  for(const o of enemies){
    if(o===e||!wardable(o))continue;
    const d=dist(player,o);
    if(d<bestD&&dist(e,o)<GUARD_REACH){best=o;bestD=d;}
  }
  return best;
}

function resize() {
  // capped at 1.75 rather than 2: the arena grew 44%, this keeps the backing
  // store near its old pixel count so the additive/glow passes stay cheap
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin='round'; ctx.lineCap='round';
}
resize(); addEventListener('resize', ()=>{resize();measureCanvas();});
addEventListener('keydown', e => { if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;   // let text fields have their keys
  const k = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(k)) e.preventDefault(); keys.add(k); if (k === ' ') pause(); if (k === 'shift') dash(); if (k === 'e') phaseCloak(); if (k === 'q') shockPulse(); if (k === 'f') toggleFullscreen(); if (k === 'm'){initAudio();setSound(!soundOn);}
  // the sector reel is the one screen that reads the arrow keys as a menu
  if(sectorScreenOpen()&&(k==='arrowleft'||k==='arrowright')){sfx('ui');cycleSector(k==='arrowleft'?-1:1);} });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ---- touch controls ------------------------------------------------------
// a phone gets the same three inputs a keyboard has, since the guns fire
// themselves: a floating stick under the left thumb, and DASH / PHASE / WAVE
// under the right. Geometry is written in CSS pixels and converted to viewport
// units, so a thumb-sized button stays thumb-sized however large or small the
// arena happens to be drawn.
const touchParam=(location.search.match(/[?&]touch=([^&]+)/)||[])[1];
const touchCapable=()=>{
  if(typeof matchMedia==='function')return matchMedia('(pointer:coarse)').matches;
  return 'ontouchstart' in window||(navigator.maxTouchPoints||0)>0;
};
let touchMode=touchParam==='1'?true:touchParam==='0'?false:touchCapable();
const STICK_R=92, STICK_DEAD=.16, BTN_R=52, TOUCH_EDGE=26;
const stick={id:null,active:false,ox:0,oy:0,x:0,y:0,dx:0,dy:0};
const touchPress={};                       // pointerId -> button id, so a lifted finger unlights its button
const btnFlash={dash:0,phase:0,wave:0};
let canvasRect=null;
const measureCanvas=()=>{canvasRect=canvas.getBoundingClientRect();};
const tScale=()=>{if(!canvasRect||!canvasRect.width)measureCanvas();return clamp(W/(canvasRect.width||W),.6,3.4);};
const viewPoint=e=>{
  if(!canvasRect||!canvasRect.width)measureCanvas();
  return {x:(e.clientX-canvasRect.left)/canvasRect.width*W,y:(e.clientY-canvasRect.top)/canvasRect.height*H};
};
// the cluster fans out from the bottom-right corner: dash sits under the thumb,
// the other two arc away from it
function touchButtons(){
  const s=tScale(), r=BTN_R*s, r2=r*.86, d=r+r2+13*s;
  const ax=W-TOUCH_EDGE*s-r, ay=H-TOUCH_EDGE*s-r;
  return [{id:'dash', label:'DASH', x:ax,      y:ay,        r,     color:'#55e6ff'},
          {id:'phase',label:'PHASE',x:ax-d,    y:ay,        r:r2,  color:'#bca7ff'},
          {id:'wave', label:'WAVE', x:ax-d*.5, y:ay-d*.87,  r:r2,  color:'#ffe17a'}];
}
// each pad mirrors the ability row it replaces, cooldown and all
function abilityState(id){
  if(id==='dash') return {on:!!state.hasDash, cd:state.dashCooldown||0, max:state.dashCd||3, live:state.dashTime>0};
  if(id==='phase')return {on:!!state.hasCloak,cd:state.cloakCooldown||0,max:12,             live:state.cloakTime>0};
  return              {on:!!state.hasPulse,cd:state.pulseCooldown||0,max:state.pulseCd||10,live:false};
}
const fireAbility=id=>{if(id==='dash')dash();else if(id==='phase')phaseCloak();else shockPulse();};
// the pads only exist while a run is actually being flown: not on a menu, not
// mid-cinematic, not while the death fade is running
// deliberately NOT gated on state.active: that flag means "the room is still
// fighting", and finishRoom clears it the moment the last shape dies. Gating
// the stick on it took the controls away during the intermission — exactly when
// you have to fly into the portal — with no way out of the area but parking the
// run. The keyboard is live whenever update() runs, so this matches it: the run
// is in the air, and nothing has taken control away from you.
const touchLive=()=>touchMode&&!!state&&inRun&&!state.paused&&!state.over&&!state.dying&&!state.victorySequence;
function releaseTouch(){stick.id=null;stick.active=false;stick.dx=0;stick.dy=0;for(const k in touchPress)delete touchPress[k];}
function setTouchMode(on){
  touchMode=!!on;
  if(!touchMode)releaseTouch();
  paintControlHints();
  if(tutorial.open)showHowTo();            // the field manual teaches whichever controls are live
  if(rosterOpen())showRoster();            // and the hangar names the control PARAGON is flown with
  return touchMode;
}
canvas.addEventListener('pointerdown',e=>{
  // a hybrid machine reports a fine pointer right up until a finger lands on it
  if(e.pointerType==='touch'&&!touchMode)setTouchMode(true);
  if(!touchLive())return;
  measureCanvas();
  const p=viewPoint(e);
  for(const b of touchButtons()){
    if(Math.hypot(p.x-b.x,p.y-b.y)>b.r*1.15)continue;
    e.preventDefault();
    if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
    touchPress[e.pointerId]=b.id;
    if(abilityState(b.id).on){btnFlash[b.id]=.22;fireAbility(b.id);}else sfx('hurt');
    return;
  }
  // anywhere down the left of the arena raises the stick under the finger, so
  // there is never a pad to find first
  if(stick.id===null&&p.x<W*.58&&p.y>H*.14){
    e.preventDefault();
    if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
    stick.id=e.pointerId;stick.active=true;
    stick.ox=stick.x=p.x;stick.oy=stick.y=p.y;stick.dx=stick.dy=0;
  }
},{passive:false});
canvas.addEventListener('pointermove',e=>{
  if(stick.id!==e.pointerId)return;
  e.preventDefault();
  const p=viewPoint(e), r=STICK_R*tScale();
  let dx=p.x-stick.ox, dy=p.y-stick.oy;
  const l=Math.hypot(dx,dy);
  if(l>r){                                 // past the ring the origin follows, so the stick never runs out of travel
    const over=1-r/l;
    stick.ox+=dx*over;stick.oy+=dy*over;
    dx*=r/l;dy*=r/l;
  }
  stick.x=stick.ox+dx;stick.y=stick.oy+dy;
  const push=Math.min(1,Math.hypot(dx,dy)/r);
  const throttle=push<STICK_DEAD?0:(push-STICK_DEAD)/(1-STICK_DEAD);
  const u=Math.hypot(dx,dy)||1;
  stick.dx=dx/u*throttle;stick.dy=dy/u*throttle;
},{passive:false});
function endTouch(e){
  if(stick.id===e.pointerId){stick.id=null;stick.active=false;stick.dx=0;stick.dy=0;}
  delete touchPress[e.pointerId];
}
canvas.addEventListener('pointerup',endTouch);
canvas.addEventListener('pointercancel',endTouch);
addEventListener('blur',releaseTouch);

function reset(difficulty = 'medium') {
  const c = characters[chosen] || characters[STARTER];
  const maxHp = Math.round(100 * c.hp);
  player = { x: RW / 2, y: RH / 2, r: 16, hp: maxHp, maxHp, speed: Math.round(288 * c.speed * treeSpeed()), regen: 3 + (c.regen || 0), hurtAt: -10, aim: 0, heading: 0, thrust: 0, vx: 0, vy: 0 };
  enemies = []; arrows = []; enemyBullets = []; stars = []; particles = []; blasts = []; delayedBlasts = []; echoShots = []; damageNumbers = []; strikes = []; rings = []; pulses = []; beams = []; mines = []; wells = []; rockets = []; walls = []; dashGhosts = [];
  state = { difficulty, last: performance.now(), time: 0, room: 1, level: 1, xp: 0, need: 60, kills: 0, left: 0, spawnIn: 0, active: true, paused: false, upgradeOpen: false, intermission: false, transitioning: false, roomTransition: 0, exit: null, relicRooms: {}, globals: {}, relicsTaken: [], relicOpen: false, relicDraw: null, enemyPace: 1, armor: 1, siphon: 0, thorns: 0, magnet: 0, vacuum: false, beatBest: false, over: false, dying: 0, hitStop: 0, beatIn: 0, lowPulse: 0, knockX: 0, knockY: 0, knockT: 0, paidCredits: 0, portalArm: 0, history: [], echo: null, cloakTime: 0, cloakCooldown: 0, bowIn: 0, laserIn: 0, bombIn: 0, mineIn: 0, missileIn: 0, phalanxIn: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, dashPower: 1, dashCd: 3, pulseCooldown: 0, pulseCd: 10, arcIn: 0, character: STARTER, charXp: 1, charDamage: 1, lastMoveX: 1, lastMoveY: 0, shake: 0, playerAlpha: 1, screenAlpha: 0, cameraZoom: 1, zoomCenterX: RW/2, zoomCenterY: RH/2, victoryPortal: null, victorySequence: null, victoryTimer: 0, roomBanner: null, cameraRot: 0, flash: 0, warp: null, suckR: 0, suckA: 0, suckDir: 1, portalCharge: 0, hurtFlash: 0, weapons: { bow: { name: 'VULCAN CANNON', color: '#55e6ff', damage: 2, rate: 1.3, level: 0, upgrades: 0, taken: [], ultimate: false } } };
  state.sector=sectorOpen(chosenSector)?chosenSector:1;
  state.character=chosen;
  state.charXp=c.xp||1;
  state.charDamage=(c.damage||1)*treeDamage();
  state.rateScale=treeRate();
  state.critChance=treeCritChance();
  state.critMult=treeCritMult();
  state.hasDash=treeHas('dashDrive');
  state.dashShear=treeDashShear();state.dashShove=treeDashShove();
  // the repulsor rides on the airframe, so a resumed run gets it back for free
  state.hasPulse=!!c.shock; if(c.shock)state.pulseCd=c.shock;
  state.paidSkill=0;
  if(c.dashCd) state.dashCd=c.dashCd;
  if(c.dashPower) state.dashPower=c.dashPower;
  if(c.weapon) state.weapons[c.weapon]=newWeapon(c.weapon);
  for(const w of Object.values(state.weapons)) scaleWeapon(w);
  state.hasDraw=hasDraw();
  // FIELD REFIT is spent as ordinary level-up draws, taken before you fly
  state.freeDraws=treeRank('headstart');
  beginRoom(); hide();
}
// pilot and tree multipliers land on a weapon the moment it is created
function scaleWeapon(w){ w.damage*=state.charDamage||1; w.rate*=state.rateScale||1; return w; }
function newWeapon(id){
  const d=weaponData[id];
  return {name:d[0],color:d[1],damage:d[2],rate:d[3],level:0,upgrades:0,taken:[],ultimate:false};
}
// what a weapon *looks* like is read straight off what has been bolted onto it,
// rather than tracked alongside it. `taken` is already saved with the run, so a
// parked run repaints correctly on resume and the two can never fall out of sync.
// Anything that outlives the shot — a mine, a wall, a blast — copies the flag it
// needs at spawn, since by the time it is drawn the weapon is not in reach.
const upg=(w,id)=>!!w&&w.taken.indexOf(id)>=0;
// the one upgrade per weapon that changes how it *looks* as well as what it does.
// Every draw reads this rather than naming an id inline, so re-tuning which
// upgrade carries the look is a single edit here.
const DMG_UPGRADE={bow:'bow-heavy',laser:'laser-focus',bomb:'bomb-impact',sword:'sword-sharp',
  aegis:'aegis-power',arc:'arc-power',mine:'mine-power',missile:'missile-heavy',phalanx:'phalanx-power'};
const heavyShot=id=>upg(state.weapons[id],DMG_UPGRADE[id]);
const rand = (a,b) => a + Math.random() * (b-a);
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const ang = (a,b) => Math.atan2(b.y-a.y,b.x-a.x);
const shake = (n) => state.shake = Math.max(state.shake,n);
const hitStop = (n) => state.hitStop = Math.max(state.hitStop||0,n);
function knockback(from,power,time){
  const d=dist(player,from)||1;
  state.knockX=(player.x-from.x)/d*power;
  state.knockY=(player.y-from.y)/d*power;
  state.knockT=time;
}
const spawnDamageNumber = (x, y, n, color, crit) => damageNumbers.push({x, y, n, color, life: 0.6, crit});
function edge() {
  // spawn just outside the view rather than at the room's corners: in a room
  // this size a far-corner spawn would take a slow shape over a minute to reach you
  const m = 120, MIN = 520;   // never closer than this, whatever the camera says
  let x=0, y=0;
  for(let i=0;i<14;i++){
    const s = Math.floor(Math.random()*4);
    if(s===0){ x=rand(camX-m, camX+W+m); y=camY-m; }
    else if(s===1){ x=camX+W+m; y=rand(camY-m, camY+H+m); }
    else if(s===2){ x=rand(camX-m, camX+W+m); y=camY+H+m; }
    else { x=camX-m; y=rand(camY-m, camY+H+m); }
    if(x>35 && x<RW-35 && y>45 && y<RH-35 && Math.hypot(x-player.x,y-player.y)>MIN) return {x,y};
  }
  // view jammed into a corner: pull the last pick back inside rather than
  // banishing it to the far side of the room, but never drop one in your lap
  const cx=clamp(x,35,RW-35), cy=clamp(y,45,RH-35);
  if(Math.hypot(cx-player.x,cy-player.y)>MIN) return {x:cx,y:cy};
  // sit it exactly MIN away on a bearing that still has room — clamping a fixed
  // bearing into the walls would drag it back towards the player
  const base=Math.random()*Math.PI*2;
  for(let k=0;k<12;k++){
    const a=base+k*Math.PI/6;
    const nx=player.x+Math.cos(a)*MIN, ny=player.y+Math.sin(a)*MIN;
    if(nx>35 && nx<RW-35 && ny>45 && ny<RH-35) return {x:nx,y:ny};
  }
  return {x:cx,y:cy};
}
// one table per sector. The second opens roughly where the first was getting
// dangerous — nothing in it is a warm-up, and its own shapes climb from there.
const SECTOR_SPAWNS={
  1:[
    {t:'square',   from:1,  base:34, growth:-.72},
    {t:'triangle', from:1,  base:22, growth:-.62},
    {t:'hex',      from:3,  base:18, growth:-.28},
    {t:'diamond',  from:4,  base:16, growth:-.2 },
    {t:'trap',     from:6,  base:12, growth: .35},
    {t:'bowtie',   from:8,  base:12, growth: .15},
    {t:'pentagon', from:10, base: 8, growth:1.5 },
    {t:'prism',    from:12, base: 9, growth:1.2 },
    {t:'seeker',   from:21, base: 9, growth:1.3 },
    {t:'raker',    from:25, base: 8, growth:1.3 }
  ],
  2:[
    {t:'triangle', from:1,  base:22, growth:-.8 },
    {t:'hex',      from:1,  base:20, growth:-.45},
    {t:'diamond',  from:1,  base:14, growth:-.3 },
    {t:'dart',     from:2,  base: 9, growth: .8 },
    {t:'trap',     from:2,  base:13, growth: .35},
    {t:'bowtie',   from:3,  base:13, growth: .2 },
    {t:'sentry',   from:4,  base:13, growth:1.1 },
    {t:'stalker',  from:6,  base:11, growth:1.35},
    {t:'bastion',  from:8,  base:10, growth:1.45},
    {t:'pentagon', from:10, base: 9, growth:1.1 },
    {t:'prism',    from:11, base: 9, growth:1   },
    {t:'seeker',   from:13, base: 9, growth:1.2 },
    // the drift's signature: burning lanes underfoot, from early on and in numbers
    {t:'raker',    from:6,  base:14, growth:1.25},
    {t:'scorcher', from:18, base:12, growth:1.4 },
    {t:'pyre',     from:28, base: 9, growth:1.55},
    // and the things that make the lane-painters hard to reach
    {t:'picket',   from:9,  base:12, growth:1.3 },
    {t:'splitter', from:12, base:10, growth:1.1 }
  ]
};
function spawnWeights(room,mix){
  const out=[];
  for(const e of (SECTOR_SPAWNS[sector().id]||SECTOR_SPAWNS[1])){
    if(room<e.from)continue;
    const progress=clamp((room-e.from)/25,0,1);
    // harder settings lean into the shift; weak shapes fade faster, strong ones swell
    const g=e.growth*(e.growth<0?Math.min(mix,1.6):mix);
    out.push({t:e.t,w:Math.max(1.5,e.base*(1+g*progress))});
  }
  return out;
}
function type() {
  const mix=(difficulties[state.difficulty]||difficulties.medium).mix||1;
  const w=spawnWeights(state.room,mix);
  let total=0; for(const e of w)total+=e.w;
  let r=Math.random()*total;
  for(const e of w){ r-=e.w; if(r<=0)return e.t; }
  return w[w.length-1].t;
}
// one hp curve for every spawn site, so a sector's steepness cannot drift apart
// between the drip-feed and whatever a boss launches
function enemyHp(spec){
  const sec=sector(), difficulty=difficulties[state.difficulty]||difficulties.medium;
  return Math.max(1, Math.ceil(spec.hp * 1.1 * sec.hpBase * difficulty.hp * (1 + (state.room-1) * sec.hpCurve)));
}
function spawn() {
  const name=type(), spec=types[name], p=edge();
  const hp = enemyHp(spec);
  enemies.push({type:name,x:p.x,y:p.y,hp,maxHp:hp,r:spec.r,shoot:rand(1,3),phase:Math.random()*7,flash:0,slowT:0,slowAmt:0,rot:ang(p,player),born:state.time,numIn:0});
}
// the top-left readout reports the area you are flying. Outside a run there is no
// area, so it is hidden rather than left showing whatever the last one said.
let inRun=false;
function setInRun(on){inRun=on;if(ui.areaBox)ui.areaBox.classList.toggle('idle',!on);paintBrand();}
// the strapline under the wordmark is the sector you are in, or the one you have picked
function paintBrand(){
  if(!ui.brandSub)return;
  const sec=sectorDef(inRun&&state&&state.sector?state.sector:chosenSector);
  ui.brandSub.textContent=sec.name+' // '+sec.short;
  ui.brandSub.style.color=sec.color||'';
}
function beginRoom() {
  camera();   // the opening wave spawns relative to the view, so fix it on the player first
  const bossRoom=state.room%10===0;
  const mass=(difficulties[state.difficulty]||difficulties.medium).mass||1;
  const wave=Math.round((12+state.room*6+Math.pow(state.room,1.3)*.35)*mass*sector().wave);
  state.active=true; state.intermission=false; state.exit=null; state.vacuum=false; state.left=bossRoom?0:wave; state.spawnIn=.55;
  if(bossRoom){spawnBoss();sfx('boss');}
  for(let i=0;i<Math.min(Math.round(14*mass),state.left);i++){spawn();state.left--;}
  ui.room.textContent=state.room; ui.roomState.textContent=bossRoom?bossForRoom(state.room).name+' // '+bossForRoom(state.room).blurb:'HOSTILES INBOUND';
  setInRun(true);
  recordRoom(state.room);
  const bossDef=bossRoom?bossForRoom(state.room):null;
  state.roomBanner={room:state.room,life:bossRoom?4.2:BANNER_TIME,total:bossRoom?4.2:BANNER_TIME,
    boss:bossDef?bossDef.name:null,bossNote:bossDef?bossDef.blurb.toUpperCase():null,
    bossColor:bossDef?types[bossDef.id].color:null};
}
function spawnBoss(){
  const def=bossForRoom(state.room), spec=types[def.id], difficulty=difficulties[state.difficulty];
  // each full pass through the roster adds a flat bulk bonus, so cycling back
  // to SENTINEL at room 60 is still tougher than HOLLOW at room 50
  const cycle=state.room===FINAL_ROOM?0
    :Math.floor((Math.max(1,Math.floor(state.room/10))-1)/Math.max(1,bossRoster().length));
  const sec=sector();
  const hp=Math.ceil(spec.hp*def.hpMult*sec.bossHp*difficulty.hp*(1+Math.max(0,state.room-10)*sec.bossCurve)*(1+cycle*.75));
  enemies.push({type:def.id,bossId:def.id,contact:def.contact,x:RW/2,y:220,hp,maxHp:hp,r:spec.r,
    shoot:1.1,phase:0,flash:0,slowT:0,slowAmt:0,boss:true,rot:0,born:state.time,numIn:0,
    mode:'idle',timer:1.2,beamRot:0,shield:0,adds:0,blinkT:0});
  state.bossName=def.name;
}
// weapons only acquire what is on screen — no sniping something you cannot see
const onScreen=(e,pad)=>{
  const m=(pad||0)+(e.r||0);
  return e.x>camX-m && e.x<camX+W+m && e.y>camY-m && e.y<camY+H+m;
};
// a shape at 0 hp is a corpse waiting for deaths() at the end of the frame: it is
// still in `enemies`, and firing at it would throw the shot away
const liveTarget=e=>e.hp>0;
function nearest() {
  let best=null, bestD=Infinity;
  for(const e of enemies){ if(!liveTarget(e)||!onScreen(e))continue; const d=dist(player,e); if(d<bestD){best=e;bestD=d;} }
  return best;
}
function fire() {
  const target=nearest(); if(!target)return;
  player.aim=ang(player,target); const w=state.weapons.bow;
  const shotCount=(w.shots||1)+(w.ultimate?2:0), speed=w.projectileSpeed||620;
  // every round leaves the nose along the plane's heading, then banks toward its target
  const h=player.heading, muzzle=player.r*1.8*PLANE_SCALE, nx=player.x+Math.cos(h)*muzzle, ny=player.y+Math.sin(h)*muzzle, perp=h+Math.PI/2;
  for(let i=0;i<shotCount;i++){
    const lane=shotCount>1?i-(shotCount-1)/2:0;
    const a=h+lane*.15;
    arrows.push({
      x:nx+Math.cos(perp)*lane*8, y:ny+Math.sin(perp)*lane*8,
      vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
      life:1.75,damage:w.damage,pierce:(w.pierce||0)+(w.ultimate?1:0),color:w.color,
      homing:1,turn:w.homing?12:6.5,tgt:target,
      grade:w.taken.length+(w.ultimate?1:0),heavy:heavyShot('bow'),seeker:!!w.homing,
      seed:Math.floor(Math.random()*1000),
      homeIn:.05,
      lane:lane*.16      // each round curves in on its own line, closing well before impact
    });
  }
  burst(nx,ny,w.color,4,70,{size:2,drag:6});sfx('shoot');
}
function hurt(n){if(state.cloakTime>0||state.dying>0)return;n*=state.armor||1;sfx('hurt');hitStop(n>=player.maxHp*.25?.07:0);player.hp=Math.max(0,player.hp-n);player.hurtAt=state.time;player.flash=0.1;state.hurtFlash=Math.min(1,(state.hurtFlash||0)+clamp(n/45,.3,1));burst(player.x,player.y,'#ff557d',10,150,{size:2.6,drag:4,spread:player.r});shake(12);if(state.thorns)staticDischarge();}
function phaseCloak(){if(!state||!state.hasCloak||state.paused||state.victorySequence||state.cloakTime>0||state.cloakCooldown>0)return;state.cloakTime=3;state.cloakCooldown=12;burst(player.x,player.y,'#bca7ff',30,180);}
// paragon only: the ultimate's clear-the-floor wave on a cooldown. It deals no
// damage — it buys the second of space that a swarm was about to close.
function shockPulse(){
  if(!state||!state.hasPulse||state.paused||state.transitioning||state.victorySequence||state.dying>0||state.pulseCooldown>0)return;
  state.pulseCooldown=state.pulseCd||10;
  const col=pilotColor();
  sfx('ult');hitStop(.06);shake(16);state.flash=Math.max(state.flash,.28);
  burst(player.x,player.y,col,44,340,{size:3.2,drag:2.4});
  burst(player.x,player.y,'#ffffff',18,220,{size:2.4,drag:3});
  shockwave(player.x,player.y,col,1500);
}
// where the pilot is asking to go, as a vector whose length is the throttle:
// the keys are all or nothing, the touch stick is analog
function moveInput(){
  if(stick.active)return {x:stick.dx,y:stick.dy};
  const x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  const y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  const l=Math.hypot(x,y)||1;
  return {x:x/l,y:y/l};
}
// what the dash is carrying. Each upgrade adds a layer to the animation rather
// than replacing the last, so the dash itself reads as a readout of what has been
// bought for it: a bare drive leaves silhouettes, coils tear a lane open behind
// you, SHEAR DRIVE puts edges on it, and its second rank throws a bow shock ahead.
const dashKit=()=>({
  coils:(state.dashPower||1)>1,
  shear:(state.dashShear||0)>0,
  shove:!!state.dashShove
});
const dashTier=()=>{const k=dashKit();return (k.coils?1:0)+(k.shear?1:0)+(k.shove?1:0);};
// how often the lane records a silhouette. Under a frame at 60Hz, so the trail is
// solid there; on a faster panel it thins out to roughly the same spacing on the
// floor rather than stacking silhouettes on top of each other.
const DASH_GHOST_GAP=.008;
function dash(){
  if(!state||!state.hasDash||state.paused||state.transitioning||state.victorySequence||(!state.exit&&state.intermission)||state.dashCooldown>0||state.dashTime>0)return;
  const aim=moveInput();
  let x=aim.x, y=aim.y;
  if(!x&&!y){x=state.lastMoveX;y=state.lastMoveY;}
  const len=Math.hypot(x,y)||1;state.dashX=x/len;state.dashY=y/len;state.dashTime=.22;state.dashCooldown=state.dashCd||3;sfx('dash');
  state.dashHit=[];      // one shear per shape per dash, however long you are inside it
  const tier=dashTier();
  shake(4+tier*2);
  // the mark you launched off, which the ring and the plume are drawn from
  state.dashBurst={x:player.x,y:player.y,a:Math.atan2(state.dashY,state.dashX),life:.42,max:.42};
  burst(player.x,player.y,pilotColor(),Math.round(24*(state.dashPower||1))+tier*8,220*(state.dashPower||1)+tier*40);
  if(tier>=2)burst(player.x,player.y,'#ffffff',10,180,{size:2.2,drag:3.4});
}
// the afterimages age on `dt`, so the lane stretches out under hit-stop the same
// way everything else does
function updateDashFx(dt){
  if(state.dashTime>0){
    state.ghostIn=(state.ghostIn||0)-dt;
    if(state.ghostIn<=0){
      const life=.26+dashTier()*.05;
      dashGhosts.push({x:player.x,y:player.y,a:player.heading,life,max:life});
      state.ghostIn=DASH_GHOST_GAP;
    }
  }
  for(const g of dashGhosts)g.life-=dt;
  dashGhosts=dashGhosts.filter(g=>g.life>0);
  if(state.dashBurst){state.dashBurst.life-=dt;if(state.dashBurst.life<=0)state.dashBurst=null;}
}
// SHEAR DRIVE. The dash already passes through everything harmlessly; this makes
// the pass cost the shape something, and at the second rank throws it sideways out
// of the lane so the way through stays open behind you.
function shearDash(){
  const hit=state.dashHit||(state.dashHit=[]);
  const nx=state.dashX, ny=state.dashY;
  for(const e of enemies){
    if(!liveTarget(e)||hit.includes(e))continue;
    if(dist(e,player)>e.r+player.r+8)continue;
    hit.push(e);
    const h=critHit(state.dashShear*(state.charDamage||1));
    e.hp-=h.dmg;e.flash=h.crit?.22:.14;
    spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),pilotColor(),h.crit);
    burst(e.x,e.y,pilotColor(),8,170,{size:2.2,drag:4});
    sfx('hit');
    if(state.dashShove){
      // sideways, never backwards: shoving along the dash would drag it with you
      const dx=e.x-player.x, dy=e.y-player.y;
      let sx=-ny, sy=nx;
      if(dx*sx+dy*sy<0){sx=-sx;sy=-sy;}      // whichever side it is already drifting
      e.kx=sx*DASH_SHOVE;e.ky=sy*DASH_SHOVE;e.kt=.3;e.ktMax=.3;
      e.slowT=Math.max(e.slowT||0,.35);e.slowAmt=Math.max(e.slowAmt||0,.3);
    }
  }
}
function update(dt,real) {
  real=real||dt;
  camera();
  state.time+=dt;
  if(state.roomBanner){state.roomBanner.life-=dt;if(state.roomBanner.life<=0)state.roomBanner=null;}
  state.hurtFlash=Math.max(0,(state.hurtFlash||0)-dt*2.4);
  state.shake=Math.max(0,state.shake-state.shake*Math.min(1,real*6.4)-real*2);   // framerate-independent falloff
  state.dashCooldown=Math.max(0,state.dashCooldown-dt);
  state.cloakCooldown=Math.max(0,state.cloakCooldown-dt);state.cloakTime=Math.max(0,state.cloakTime-dt);
  state.pulseCooldown=Math.max(0,state.pulseCooldown-dt);
  for(const k in btnFlash)btnFlash[k]=Math.max(0,btnFlash[k]-real*4);   // the tap flash is wall-clock: slow motion should not stretch it
  if(state.victoryPortal&&!state.victorySequence){
    const p=state.victoryPortal;
    const d=dist(player,p);
    state.portalArm=Math.max(0,(state.portalArm||0)-dt);
    if(d>.001&&d<180){   // d can be exactly 0: rooms start the player on the portal's spawn point
      const pull= (180-d)/180 * 230 * dt;
      player.vx+=(p.x-player.x)/d*pull;
      player.vy+=(p.y-player.y)/d*pull;
    }
    if(d<p.r+player.r&&state.portalArm<=0){
      // nothing you earned is left behind, however you entered
      for(const s of stars){state.xp+=s.value;burst(s.x,s.y,'#ffe17a',5,120,{size:2,drag:5});}
      stars.length=0;
      state.victorySequence='swirl';
      state.victoryTimer=T_SWIRL;
      state.zoomCenterX=p.x;
      state.zoomCenterY=p.y;
      state.suckR=d;
      state.suckA=ang(p,player);
      // keep orbiting the way the player was already travelling
      const cross=(player.x-p.x)*player.vy-(player.y-p.y)*player.vx;
      state.suckDir=cross>=0?1:-1;
      burst(p.x,p.y,'#eaffff',24,190,{size:2.6,drag:3});sfx('portal');
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
        state.zoomCenterX=RW/2;state.zoomCenterY=RH/2;
        state.flash=1;state.screenAlpha=0;state.warp=null;
        nextRoom();
        blasts.push({x:RW/2,y:RH/2,radius:410,life:.5,maxLife:.5,color:'#eaffff'});
        burst(RW/2,RH/2,'#55e6ff',34,320);
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
  state.flash=Math.max(0,state.flash-dt*2.2);   // the ultimate's white burst fades out
  const lowHp=player.hp/player.maxHp;
  const danger=player.hp>0?clamp((LOW_HP-lowHp)/LOW_HP,0,1):0;
  state.lowPulse=(state.lowPulse||0)+(danger-(state.lowPulse||0))*Math.min(1,real*4.5);
  if(state.lowPulse<.004)state.lowPulse=0;
  if(danger>0){
    state.beatIn=(state.beatIn||0)-real;
    if(state.beatIn<=0){sfx('beat');state.beatIn=.34+lowHp*1.9;}
  }else state.beatIn=0;
  const aim=moveInput();
  const mx=aim.x, my=aim.y;
  const ml=Math.hypot(mx,my);           // 0 while idle, up to 1 at full throw
  if(ml>.001){state.lastMoveX=mx/ml;state.lastMoveY=my/ml;}
  if(state.dashTime>0){
    state.dashTime=Math.max(0,state.dashTime-dt);
    const ds=1380*(state.dashPower||1);
    player.x=clamp(player.x+state.dashX*ds*dt,45,RW-45);
    player.y=clamp(player.y+state.dashY*ds*dt,65,RH-45);
    burst(player.x-state.dashX*10,player.y-state.dashY*10,pilotColor(),2,90);
    if(state.dashShear>0)shearDash();
  }else{
    const targetVx=mx*player.speed,targetVy=my*player.speed;
    if(ml>.001){player.vx+=(targetVx-player.vx)*12*dt;player.vy+=(targetVy-player.vy)*12*dt;}else{player.vx-=player.vx*15*dt;player.vy-=player.vy*15*dt;}
    player.x=clamp(player.x+player.vx*dt,45,RW-45);player.y=clamp(player.y+player.vy*dt,65,RH-45);
  }
  if(state.knockT>0){
    const f=clamp(state.knockT/.3,0,1);
    state.knockT=Math.max(0,state.knockT-dt);
    player.x=clamp(player.x+state.knockX*f*dt,45,RW-45);
    player.y=clamp(player.y+state.knockY*f*dt,65,RH-45);
    burst(player.x,player.y,'#ff90a8',2,120,{size:2,drag:5});
  }
  const target=nearest();
  if(target){
    const targetAim=ang(player,target);
    let diff=targetAim-player.aim;
    while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
    player.aim+=diff*15*dt;
  }
  // the plane noses toward whatever it is shooting at — or into its direction of
  // travel when nothing is in range — and throttles up while moving
  {
    const dashing=state.dashTime>0, sp=Math.hypot(player.vx,player.vy);
    const wantThrust=dashing?1.6+dashTier()*.2:(mx||my)?1:0;
    player.thrust+=(wantThrust-player.thrust)*Math.min(1,dt*10);
    const want=target?player.aim:dashing?Math.atan2(state.dashY,state.dashX):sp>30?Math.atan2(player.vy,player.vx):null;
    if(want!==null){
      let diff=want-player.heading;
      while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
      player.heading+=diff*Math.min(1,dt*(target?14:9));
    }
  }
  state.history.unshift({x:player.x,y:player.y});if(state.history.length>24)state.history.pop();updateRelics(dt);
  if(player.hp>0&&state.time-player.hurtAt>2) player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);   // never regen out of a death
  player.flash=Math.max(0,player.flash-dt);
  if(state.active&&state.left>0){state.spawnIn-=dt;if(state.spawnIn<=0){spawn();state.left--;state.spawnIn=Math.max(.16,(.55-state.room*.02)/((difficulties[state.difficulty]||difficulties.medium).mass||1));}}
  state.bowIn-=dt;if(state.bowIn<=0){fire();state.bowIn=1/state.weapons.bow.rate;}
  for(const e of enemies) moveEnemy(e,dt);
  weapons(dt); updateArrows(dt); updateRockets(dt); updateWalls(dt); updateEchoShots(dt); updateEnemyBullets(dt); updateStars(dt); deaths(); updateParticles(dt); updateBlasts(dt); updateDelayedBlasts(dt); updateMines(dt); updateWells(dt); updateStrikes(dt); updateRings(dt); updatePulses(dt); updateBeams(dt); updateDashFx(dt); updateDamageNumbers(dt);
  if(state.active&&state.left===0&&enemies.length===0) finishRoom();
  if(player.hp<=0&&!state.dying&&!state.over){
    state.dying=1.05;
    hitStop(.2);shake(24);sfx('death');
    burst(player.x,player.y,pilotColor(),64,460,{size:3.4,drag:2});
    burst(player.x,player.y,'#ffffff',26,280,{size:2.6,drag:3});
    blasts.push({x:player.x,y:player.y,radius:300,life:.7,maxLife:.7,color:pilotColor()});
  }
  if(state.dying>0){
    state.dying=Math.max(0,state.dying-real);
    state.playerAlpha=clamp(state.dying/1.05,0,1);
    if(Math.random()<real*30)burst(player.x,player.y,pilotColor(),2,220,{size:2.4,drag:2.4});
    if(state.dying===0){gameOver();hud();return;}
  }
  hud();
}
const pilotColor=()=>((state&&characters[state.character])||characters[STARTER]).color;
// ---- boss patterns ------------------------------------------------------
const bossStep=(e,dt,mult,difficulty,ang0)=>{
  const s=types[e.type].speed*mult*difficulty.speed*MOVE*slowFactor(e);
  e.x=clamp(e.x+Math.cos(ang0)*s*dt,e.r,RW-e.r);
  e.y=clamp(e.y+Math.sin(ang0)*s*dt,e.r,RH-e.r);
};
function bossOrb(e,angle,speed,damage){
  enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:9,life:8,
    damage,homing:1,turn:1.9,color:'#ffb066',keep:true});
}
const bossBehaviour={
  // room 10 — the baseline: pressure with volleys, closes with charges
  sentinel(e,dt,difficulty,spec,a){
    e.dashCooldown=(e.dashCooldown||0)-dt;
    e.dashTime=(e.dashTime||0)-dt;
    if(e.dashCooldown<=0&&e.dashTime<=0){e.dashTime=.3;e.dashCooldown=3+rand(0,2);}
    if(e.dashTime>0){bossStep(e,dt,5,difficulty,a);burst(e.x,e.y,spec.color,2,100);}
    else bossStep(e,dt,1,difficulty,a);
  },
  // room 20 — fast pursuer. Winds up visibly, then commits to a straight charge:
  // the tell is the window to time your own dash. Pauses to seed homing orbs.
  lance(e,dt,difficulty,spec,a){
    e.timer-=dt;
    if(e.mode==='idle'||e.mode==='pursue'){
      bossStep(e,dt,1,difficulty,a);
      if(e.timer<=0){
        if(Math.random()<.32){e.mode='volley';e.timer=1.25;}
        else{e.mode='windup';e.timer=.55;e.lockA=a;}
      }
    }else if(e.mode==='windup'){
      let d=a-e.lockA;while(d<-Math.PI)d+=Math.PI*2;while(d>Math.PI)d-=Math.PI*2;
      e.lockA+=d*Math.min(1,dt*1.6); // tracks slowly, so the charge can be juked
      e.flash=Math.max(e.flash,.06);
      if(e.timer<=0){e.mode='charge';e.timer=.42;burst(e.x,e.y,spec.color,18,240,{size:3,drag:2});shake(5);}
    }else if(e.mode==='charge'){
      bossStep(e,dt,9,difficulty,e.lockA);
      burst(e.x,e.y,spec.color,3,140,{size:2.6,drag:3});
      if(e.timer<=0){e.mode='recover';e.timer=.6;}
    }else if(e.mode==='recover'){
      if(e.timer<=0){e.mode='pursue';e.timer=rand(.7,1.5);}
    }else if(e.mode==='volley'){
      if(!e.fired&&e.timer<.85){
        e.fired=true;
        for(let i=0;i<5;i++)bossOrb(e,a+(i-2)*.42,235*difficulty.speed,14*difficulty.dmg);
        shake(4);
      }
      if(e.timer<=0){e.mode='pursue';e.timer=rand(.6,1.2);e.fired=false;}
    }
  },
  // room 30 — keeps its distance and rains telegraphed strikes. Stray too far
  // and it tethers you back in, so you cannot outrun the bombardment.
  orbiter(e,dt,difficulty,spec,a){
    const d=dist(e,player);
    if(d<340) bossStep(e,dt,1,difficulty,a+Math.PI);
    else if(d>620) bossStep(e,dt,.7,difficulty,a);
    else bossStep(e,dt,.5,difficulty,a+Math.PI/2);
    e.timer-=dt;
    if(e.timer<=0){
      const n=2+Math.floor(Math.random()*2);
      for(let i=0;i<n;i++){
        const lead=i===0?0:rand(60,190), la=Math.random()*Math.PI*2;
        strikes.push({x:clamp(player.x+Math.cos(la)*lead,40,RW-40),y:clamp(player.y+Math.sin(la)*lead,50,RH-40),
          r:78,timer:1.15,maxTimer:1.15,damage:24*difficulty.dmg,color:spec.color});
      }
      e.timer=rand(1.3,1.9);
    }
    e.tether=d>430;
    if(e.tether&&state.dashTime<=0){
      const pull=(d-430)/d*.9*dt*60;
      player.x=clamp(player.x+(e.x-player.x)/d*pull,45,RW-45);
      player.y=clamp(player.y+(e.y-player.y)/d*pull,65,RH-45);
    }
  },
  // room 40 — a lighthouse. Rotating beams deny space; it blinks when cornered.
  beacon(e,dt,difficulty,spec,a){
    e.beamRot+=dt*.85*difficulty.speed;
    e.blinkT-=dt;
    if(e.blinkT<=0){
      e.blinkFade=.45;
      // blink within the view: in a scrolling room, hopping anywhere would
      // turn the fight into a walk, and it can no longer be shot off screen
      e.x=clamp(camX+rand(170,W-170),e.r,RW-e.r);
      e.y=clamp(camY+rand(150,H-150),e.r,RH-e.r);
      burst(e.x,e.y,spec.color,26,260,{size:3,drag:2.4});
      e.blinkT=rand(4.5,6.5);
    }
    e.blinkFade=Math.max(0,(e.blinkFade||0)-dt);
    bossStep(e,dt,.5,difficulty,a);
    const reach=330, half=.13;
    for(let i=0;i<3;i++){
      const ba=e.beamRot+i*Math.PI*2/3;
      const rel=Math.atan2(player.y-e.y,player.x-e.x)-ba;
      const norm=Math.atan2(Math.sin(rel),Math.cos(rel));
      const pd=dist(e,player);
      if(Math.abs(norm)<half&&pd<reach&&pd>e.r&&state.dashTime<=0&&(e.beamHit||0)<=0){
        hurt(20*difficulty.dmg);e.beamHit=.7;
      }
    }
    e.beamHit=(e.beamHit||0)-dt;
  },
  // room 50 — cycles between an escorted shield phase and a vulnerable phase
  // that pays for the opening with expanding shockwaves.
  hollow(e,dt,difficulty,spec,a){
    bossStep(e,dt,1,difficulty,a);
    e.timer-=dt;
    const escorts=enemies.filter(x=>x.escortOf===e).length;
    if(e.mode==='idle'){e.mode='shield';e.timer=0;}
    if(e.mode==='shield'){
      e.shield=1;
      if(e.adds<3&&e.timer<=0){
        const p=edge();
        const add=spawnAt('diamond',p.x,p.y);
        if(add){add.escortOf=e;e.adds++;}
        e.timer=.5;
      }
      if(e.adds>=3&&escorts===0){
        e.mode='open';e.timer=9;e.adds=0;e.shield=0;e.ringIn=.4;
        burst(e.x,e.y,'#ffffff',30,300,{size:3,drag:2.5});shake(9);
      }
    }else if(e.mode==='open'){
      e.shield=0;
      e.ringIn=(e.ringIn||0)-dt;
      if(e.ringIn<=0){
        rings.push({x:e.x,y:e.y,r:e.r,speed:340*difficulty.speed,damage:22*difficulty.dmg,life:2.2,color:spec.color});
        e.ringIn=1.5;
      }
      if(e.timer<=0){e.mode='shield';e.timer=0;e.adds=0;}
    }
  },
  // ---- SECTOR 02 -----------------------------------------------------------
  // area 10 — a damage check with the hull to back it up. It barely closes; what
  // it does is fill the room with radial fire, so the fight is reading the gaps
  // rather than dodging the boss itself.
  monolith(e,dt,difficulty,spec,a){
    bossStep(e,dt,1,difficulty,a);
    e.timer-=dt;
    if(e.mode==='idle'){e.mode='rest';e.timer=1.6;}
    if(e.mode==='rest'){
      // an aimed three-shot between bursts, so standing off it is not free either
      e.potIn=(e.potIn||0)-dt;
      if(e.potIn<=0){
        for(const off of [-.18,0,.18])
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a+off)*250,vy:Math.sin(a+off)*250,r:7,life:5,damage:13*difficulty.dmg,color:spec.color});
        sfx('shoot');e.potIn=1.5;
      }
      if(e.timer<=0){e.mode='wind';e.timer=1;e.spin=Math.random()*Math.PI*2;}
    }else if(e.mode==='wind'){
      e.flash=Math.max(e.flash,.05);
      if(e.timer<=0){e.mode='burst';e.timer=0;e.wave=0;shake(6);}
    }else if(e.mode==='burst'){
      if(e.timer<=0){
        // three waves, each rotated half a gap off the last: the lane that was
        // safe a moment ago is the one the next wave fires down
        const n=16, half=Math.PI/n;
        for(let i=0;i<n;i++){
          const ba=e.spin+i*Math.PI*2/n+(e.wave%2?half:0);
          enemyBullets.push({x:e.x+Math.cos(ba)*e.r*.8,y:e.y+Math.sin(ba)*e.r*.8,
            vx:Math.cos(ba)*205,vy:Math.sin(ba)*205,r:7,life:6,damage:14*difficulty.dmg,color:spec.color});
        }
        burst(e.x,e.y,spec.color,16,240,{size:2.8,drag:3});sfx('shoot');shake(4);
        e.wave++;e.timer=.42;
        if(e.wave>=3){e.mode='rest';e.timer=rand(1.9,2.6);}
      }
    }
  },
  // area 20 — the fastest hull in the drift firing the fastest rounds in it. It
  // rides a strafing band spitting paired shots, then commits to a raking pass
  // that lays fire out of both flanks instead of ahead of it.
  shrike(e,dt,difficulty,spec,a){
    e.timer-=dt;
    if(e.mode==='idle'){e.mode='strafe';e.timer=rand(2,3.2);}
    if(e.mode==='strafe'){
      const d=dist(e,player), orbit=e.orbit||(e.orbit=Math.random()<.5?-1:1);
      if(d>430)bossStep(e,dt,1.6,difficulty,a);
      else if(d<300)bossStep(e,dt,1.2,difficulty,a+Math.PI);
      else bossStep(e,dt,1.7,difficulty,a+orbit*Math.PI/2);
      e.potIn=(e.potIn||0)-dt;
      if(e.potIn<=0){
        for(const off of [-.07,.07])
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a+off)*470,vy:Math.sin(a+off)*470,r:5,life:4,damage:11*difficulty.dmg,color:spec.color});
        sfx('shoot');e.potIn=.5;
      }
      if(e.timer<=0){e.mode='wind';e.timer=.4;e.lockA=a;}
    }else if(e.mode==='wind'){
      e.lockA=a;e.flash=Math.max(e.flash,.05);   // it tracks right up to the launch
      if(e.timer<=0){e.mode='pass';e.timer=.55;e.passIn=0;burst(e.x,e.y,spec.color,14,220,{size:2.6,drag:2.6});sfx('dash');}
    }else if(e.mode==='pass'){
      bossStep(e,dt,4.2,difficulty,e.lockA);
      burst(e.x,e.y,spec.color,2,120);
      e.passIn=(e.passIn||0)-dt;
      if(e.passIn<=0){
        for(const side of [-1,1])
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(e.lockA+side*Math.PI/2)*400,vy:Math.sin(e.lockA+side*Math.PI/2)*400,r:5,life:3.4,damage:10*difficulty.dmg,color:spec.color});
        e.passIn=.14;
      }
      if(e.timer<=0){e.mode='strafe';e.timer=rand(1.8,2.8);e.orbit=Math.random()<.5?-1:1;}
    }
  },
  // area 30 — "Slow? Be Ready". It crawls, and then it does not. The lunge is
  // telegraphed and juke-able; what actually kills you is the burst it sheds the
  // moment it stops, so the safe ground is behind it, not away from it.
  breacher(e,dt,difficulty,spec,a){
    e.timer-=dt;
    if(e.mode==='idle'){e.mode='creep';e.timer=rand(1.4,2.2);}
    if(e.mode==='creep'){
      bossStep(e,dt,1,difficulty,a);
      if(e.timer<=0){e.mode='aim';e.timer=.85;e.lockA=a;}
    }else if(e.mode==='aim'){
      let d=a-e.lockA;while(d<-Math.PI)d+=Math.PI*2;while(d>Math.PI)d-=Math.PI*2;
      e.lockA+=d*Math.min(1,dt*1.1);
      e.flash=Math.max(e.flash,.05);
      if(e.timer<=0){e.mode='lunge';e.timer=.5;shake(7);sfx('dash');burst(e.x,e.y,spec.color,20,260,{size:3,drag:2.4});}
    }else if(e.mode==='lunge'){
      bossStep(e,dt,13,difficulty,e.lockA);
      burst(e.x,e.y,spec.color,3,150,{size:2.8,drag:3});
      if(e.timer<=0){
        e.mode='slam';e.timer=.95;
        const n=18, spin=Math.random()*Math.PI*2;
        for(let i=0;i<n;i++){
          const ba=spin+i*Math.PI*2/n;
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*265,vy:Math.sin(ba)*265,r:7,life:5,damage:15*difficulty.dmg,color:spec.color});
        }
        rings.push({x:e.x,y:e.y,r:e.r,speed:430*difficulty.speed,damage:18*difficulty.dmg,life:1.7,color:spec.color});
        shake(14);hitStop(.05);sfx('boom');burst(e.x,e.y,spec.color,30,340,{size:3.2,drag:2.6});
      }
    }else if(e.mode==='slam'){
      if(e.timer<=0){e.mode='creep';e.timer=rand(1.3,2.1);}
    }
  },
  // area 40 — never where you last shot at it. It blinks off a wound, blinks in
  // on top of you to empty a clip, and blinks straight back out. Damage has to be
  // spent the moment it arrives, because standing on it is what sends it away.
  wraith(e,dt,difficulty,spec,a){
    const blink=(x,y)=>{
      burst(e.x,e.y,spec.color,22,240,{size:2.8,drag:2.6});
      e.ghostX=e.x;e.ghostY=e.y;e.ghost=.4;      // the afterimage it leaves behind
      e.x=clamp(x,e.r,RW-e.r);e.y=clamp(y,e.r,RH-e.r);
      burst(e.x,e.y,spec.color,22,240,{size:2.8,drag:2.6});
      sfx('dash');
    };
    e.ghost=Math.max(0,(e.ghost||0)-dt);
    e.dodgeCd=(e.dodgeCd||0)-dt;
    e.timer-=dt;
    if(e.mark===undefined)e.mark=e.hp;
    // it will not stand and take fire: enough damage in one place and it is gone.
    // mid-ambush it commits, so the window it hands you is a real one.
    if(e.hp<e.mark-e.maxHp*.06&&e.dodgeCd<=0&&e.mode!=='strike'){
      const ba=Math.random()*Math.PI*2;
      blink(player.x+Math.cos(ba)*rand(360,520),player.y+Math.sin(ba)*rand(360,520));
      e.mark=e.hp;e.dodgeCd=1.7;
    }
    if(e.mode==='idle'){e.mode='drift';e.timer=rand(1.6,2.6);}
    if(e.mode==='drift'){
      const orbit=e.orbit||(e.orbit=Math.random()<.5?-1:1);
      bossStep(e,dt,.9,difficulty,a+orbit*Math.PI/2);
      e.potIn=(e.potIn||0)-dt;
      if(e.potIn<=0){
        enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*480,vy:Math.sin(a)*480,r:6,life:4,damage:12*difficulty.dmg,color:spec.color});
        sfx('shoot');e.potIn=.75;
      }
      if(e.timer<=0){
        const ba=Math.random()*Math.PI*2;
        blink(player.x+Math.cos(ba)*rand(150,215),player.y+Math.sin(ba)*rand(150,215));
        e.mode='strike';e.timer=.8;e.shots=0;e.shotIn=.2;e.mark=e.hp;
      }
    }else if(e.mode==='strike'){
      e.shotIn-=dt;
      if(e.shotIn<=0&&(e.shots||0)<3){
        const b=ang(e,player);
        for(const off of [-.16,0,.16])
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b+off)*440,vy:Math.sin(b+off)*440,r:6,life:3.6,damage:12*difficulty.dmg,color:spec.color});
        e.shots=(e.shots||0)+1;e.shotIn=.2;sfx('shoot');
      }
      if(e.timer<=0){
        // it leaves inside the view — hopping across the room would turn the
        // fight into a walk, and it cannot be shot where it cannot be seen
        blink(camX+rand(190,W-190),camY+rand(160,H-160));
        e.mode='drift';e.timer=rand(1.7,2.7);e.mark=e.hp;e.orbit=Math.random()<.5?-1:1;
      }
    }
  }
};
// how the carrier fights: it holds this far out, keeps this many launches in the
// air at once, and picks its brood from shapes that can actually close on you
const MOTHER_HOLD=560, MOTHER_BROOD=10;
const MOTHER_BROOD_TYPES=['triangle','diamond','bowtie','prism'];
// area 50 — the finale, and the only boss that never comes to you. It sits at the
// far edge of the view shelling the ground you stand on while its bays keep the
// floor full. Closing that distance, and staying closed, is the whole fight.
bossBehaviour.mothership=function(e,dt,difficulty,spec,a){
  const d=dist(e,player)||1;
  if(d<MOTHER_HOLD)bossStep(e,dt,-1.5,difficulty,a);              // backs off when you close
  else if(d>MOTHER_HOLD+260)bossStep(e,dt,1.2,difficulty,a);      // and reels you back in if you run
  // a slow lateral wander on top, so it is never a parked target
  e.driftA=(e.driftA||0)+dt*.55;
  e.x=clamp(e.x+Math.cos(e.driftA)*52*dt*difficulty.speed,e.r,RW-e.r);
  e.y=clamp(e.y+Math.sin(e.driftA*.8)*34*dt*difficulty.speed,e.r,RH-e.r);
  // ---- launch bays ----------------------------------------------------------
  const brood=enemies.reduce((n,x)=>n+(x.escortOf===e?1:0),0);
  const cap=Math.round(MOTHER_BROOD*(difficulty.mass||1));
  e.launchIn=(e.launchIn||0)-dt;
  if(e.launchIn<=0){
    const n=Math.min(Math.max(0,cap-brood),3);
    for(let i=0;i<n;i++){
      const ba=state.time*.6+i*Math.PI*2/3+rand(-.3,.3);
      const add=spawnAt(MOTHER_BROOD_TYPES[Math.floor(Math.random()*MOTHER_BROOD_TYPES.length)],
        clamp(e.x+Math.cos(ba)*(e.r+26),40,RW-40),clamp(e.y+Math.sin(ba)*(e.r+26),50,RH-50));
      if(add){add.escortOf=e;burst(add.x,add.y,spec.color,9,170,{size:2.4,drag:3});}
    }
    if(n){e.bayFlash=.35;sfx('pip');}
    e.launchIn=n?2.6:1;      // a full deck retries sooner than it relaunches
  }
  e.bayFlash=Math.max(0,(e.bayFlash||0)-dt);
  // ---- the guns -------------------------------------------------------------
  e.shellIn=(e.shellIn||0)-dt;
  if(e.shellIn<=0){
    for(const off of [-.26,0,.26])bossOrb(e,a+off,215*difficulty.speed,11*difficulty.dmg);
    // and one telegraphed shell on your position — the range is only safe if you move
    strikes.push({x:clamp(player.x,40,RW-40),y:clamp(player.y,50,RH-40),
      r:96,timer:1.25,maxTimer:1.25,damage:22*difficulty.dmg,color:spec.color});
    sfx('shoot');
    e.gunFlash=.3;e.shellIn=rand(2.6,3.4);
  }
  e.gunFlash=Math.max(0,(e.gunFlash||0)-dt);
};
// area 50 in the drift — what the second sector has been building toward. It
// cycles three patterns that deny different ground: a rotating fountain you walk
// the gaps of, a closing volley phase, and a wind-up that pays out in rings. At
// half hull it stops taking turns and runs all three harder.
bossBehaviour.leviathan=function(e,dt,difficulty,spec,a){
  const rage=e.hp<=e.maxHp*.5;
  if(rage&&!e.raged){
    e.raged=true;
    shake(20);hitStop(.08);sfx('boss');state.flash=Math.max(state.flash,.3);
    burst(e.x,e.y,spec.color,50,420,{size:3.4,drag:2.4});
    rings.push({x:e.x,y:e.y,r:e.r,speed:520*difficulty.speed,damage:20*difficulty.dmg,life:2,color:'#ffffff'});
  }
  e.timer-=dt;
  if(e.mode==='idle'){e.mode='spiral';e.timer=5;e.spin=0;}
  if(e.mode==='spiral'){
    // it barely moves while the fountain turns: the room is the pattern, and
    // standing still anywhere in it is what kills you
    bossStep(e,dt,.5,difficulty,a);
    e.spin+=dt*(rage?2.4:1.6);
    e.spiralIn=(e.spiralIn||0)-dt;
    if(e.spiralIn<=0){
      const arms=rage?4:2;
      for(let i=0;i<arms;i++){
        const ba=e.spin+i*Math.PI*2/arms;
        enemyBullets.push({x:e.x+Math.cos(ba)*e.r*.7,y:e.y+Math.sin(ba)*e.r*.7,
          vx:Math.cos(ba)*235,vy:Math.sin(ba)*235,r:6,life:6,damage:12*difficulty.dmg,color:spec.color});
      }
      e.spiralIn=.08;
    }
    if(e.timer<=0){e.mode='hunt';e.timer=rage?3:3.8;}
  }else if(e.mode==='hunt'){
    bossStep(e,dt,1.6,difficulty,a);
    e.potIn=(e.potIn||0)-dt;
    if(e.potIn<=0){
      for(const off of [-.22,0,.22])
        enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a+off)*300,vy:Math.sin(a+off)*300,r:7,life:5,damage:14*difficulty.dmg,color:spec.color});
      if(rage)bossOrb(e,a,215*difficulty.speed,13*difficulty.dmg);   // and one that follows you home
      sfx('shoot');e.potIn=rage?.9:1.3;
    }
    if(e.timer<=0){e.mode='nova';e.timer=1.15;}
  }else if(e.mode==='nova'){
    bossStep(e,dt,.2,difficulty,a);
    e.flash=Math.max(e.flash,.05);
    e.charge=clamp(1-e.timer/1.15,0,1);           // the wind-up the art draws
    if(e.timer<=0){e.mode='pulse';e.timer=0;e.waves=0;shake(10);}
  }else if(e.mode==='pulse'){
    e.charge=0;
    if(e.timer<=0){
      rings.push({x:e.x,y:e.y,r:e.r,speed:400*difficulty.speed,damage:20*difficulty.dmg,life:2.4,color:spec.color});
      const n=rage?14:10, spin=Math.random()*Math.PI*2;
      for(let i=0;i<n;i++){
        const ba=spin+i*Math.PI*2/n;
        enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*225,vy:Math.sin(ba)*225,r:7,life:6,damage:13*difficulty.dmg,color:spec.color});
      }
      burst(e.x,e.y,spec.color,22,300,{size:3,drag:2.6});sfx('boom');shake(6);
      e.waves=(e.waves||0)+1;e.timer=.45;
      if(e.waves>=(rage?3:2)){e.mode='spiral';e.timer=rage?4:5;}
    }
  }
};
function spawnAt(name,x,y){
  const spec=types[name];if(!spec)return null;
  const hp=enemyHp(spec);
  const e={type:name,x,y,hp,maxHp:hp,r:spec.r,shoot:rand(1,3),phase:Math.random()*7,flash:0,slowT:0,slowAmt:0,
    rot:ang({x,y},player),born:state.time,numIn:0};
  enemies.push(e);
  return e;
}
// telegraphed ground strikes: a reticle you are given time to leave
function updateStrikes(dt){
  for(const s of strikes){
    s.timer-=dt;
    if(s.timer<=0&&!s.done){
      s.done=true;
      if(state.dashTime<=0&&dist(player,s)<s.r+player.r)hurt(s.damage);
      blasts.push({x:s.x,y:s.y,radius:s.r,life:.42,maxLife:.42,color:s.color});
      burst(s.x,s.y,s.color,22,260,{size:3,drag:2.6});
      shake(7);
    }
  }
  strikes=strikes.filter(s=>!s.done);
}
// expanding shockwave rings: damage lives at the ring edge, so dash through it
// an outward wave from the player: it does not hurt anything, it just clears
// the floor. Bosses only stagger rather than being flung across the room.
function shockwave(x,y,color,power,radius){
  pulses.push({x,y,r:0,max:radius||960,speed:1900,power,color,hit:[],life:.75});
}
function updatePulses(dt){
  for(const p of pulses){
    p.r+=p.speed*dt;p.life-=dt;
    for(const e of enemies){
      if(p.hit.includes(e))continue;
      const d=dist(e,p);
      if(d>p.r)continue;
      p.hit.push(e);
      const falloff=1-clamp(d/p.max,0,1)*.5;
      const push=p.power*falloff*(e.boss?.45:1);   // bosses lurch, they do not fly
      const dir=d||1;
      e.kx=(e.x-p.x)/dir*push;e.ky=(e.y-p.y)/dir*push;
      e.kt=e.ktMax=.55;
      e.flash=Math.max(e.flash,.12);
      burst(e.x,e.y,p.color,6,190,{size:2.4,drag:3});
    }
  }
  pulses=pulses.filter(p=>p.life>0&&p.r<p.max*1.25);
}
function drawPulses(){
  for(const p of pulses){
    const grow=clamp(p.r/p.max,0,1), fade=clamp(p.life/.75,0,1)*(1-grow*.55);
    if(fade<=0)continue;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=fade*.85;
    ctx.strokeStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=26;
    ctx.lineWidth=16*(1-grow*.6)+3;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.stroke();
    ctx.shadowBlur=0;
    ctx.globalAlpha=fade;
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3.5*(1-grow*.5);
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.stroke();
    ctx.globalAlpha=fade*.3;
    ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*.82,0,7);ctx.stroke();
    ctx.restore();
  }
}
// a raker's beam stays put after it fires — a wall of light you have to dash across
function updateBeams(dt){
  for(const b of beams){
    if(b.warn>0){b.warn-=dt;continue;}
    b.life-=dt;
    b.hit=Math.max(0,b.hit-dt);
    if(b.hit>0||state.dashTime>0)continue;
    const x2=b.x+Math.cos(b.a)*b.len, y2=b.y+Math.sin(b.a)*b.len;
    if(segDist(player.x,player.y,b.x,b.y,x2,y2)<player.r+13){hurt(b.damage);b.hit=.65;}
  }
  beams=beams.filter(b=>b.life>0);
}
function drawBeams(){
  for(const b of beams){
    const x2=b.x+Math.cos(b.a)*b.len, y2=b.y+Math.sin(b.a)*b.len;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    if(b.warn>0){
      // telegraph: a thin thread showing exactly where it will land
      const k=1-b.warn/.85;
      ctx.globalAlpha=.35+Math.sin(state.time*30)*.2;
      ctx.strokeStyle=b.color;ctx.lineWidth=1.5+k*2;
      ctx.setLineDash([9,8]);ctx.lineDashOffset=-state.time*60;
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.setLineDash([]);
    }else{
      const fade=clamp(b.life/.6,0,1);
      const w=1+Math.sin(state.time*22)*.12;
      ctx.globalAlpha=.22*fade;ctx.strokeStyle=b.color;ctx.lineWidth=26*w;
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.globalAlpha=.7*fade;ctx.lineWidth=11*w;
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.globalAlpha=fade;ctx.strokeStyle='#ffffff';ctx.lineWidth=3.5*w;
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.globalAlpha=fade*.9;ctx.fillStyle=b.color;
      ctx.beginPath();ctx.arc(b.x,b.y,9*w,0,7);ctx.fill();
    }
    ctx.restore();
  }
}
function updateRings(dt){
  for(const r of rings){
    r.r+=r.speed*dt;r.life-=dt;
    if(!r.hit&&state.dashTime<=0){
      const d=dist(player,r);
      if(Math.abs(d-r.r)<player.r+14){r.hit=true;hurt(r.damage);}
    }
  }
  rings=rings.filter(r=>r.life>0&&r.r<Math.hypot(RW,RH));
}
const slowFactor=e=>(e.slowT>0?1-(e.slowAmt||0):1)*(state.enemyPace||1);
function moveEnemy(e,dt) {
  const difficulty=difficulties[state.difficulty], spec=types[e.type], a=ang(e,player);

  if(e.boss){
    (bossBehaviour[e.bossId]||bossBehaviour.sentinel)(e,dt,difficulty,spec,a);
  }else{
    const s=spec.speed*difficulty.speed*MOVE*slowFactor(e);
    // everything steers toward you; a screen steers toward a point instead — a
    // little in front of whatever it is covering, on the line between you and it.
    // It does not block your shots, it just makes itself the nearest thing you
    // can see, which is all it takes for your guns to pick it first.
    let aimX=player.x, aimY=player.y;
    if(spec.guard){
      const ward=e.ward=guardWard(e);
      if(ward){
        const wd=dist(player,ward)||1;
        // never closer to you than GUARD_KEEP: a screen that walks into your hull
        // has traded itself for nothing
        const lead=Math.min(GUARD_LEAD,Math.max(0,wd-GUARD_KEEP));
        aimX=ward.x+(player.x-ward.x)/wd*lead;
        aimY=ward.y+(player.y-ward.y)/wd*lead;
      }
    }
    const d=Math.hypot(aimX-e.x,aimY-e.y)||1, ux=(aimX-e.x)/d, uy=(aimY-e.y)/d, tx=-uy, ty=ux;
    const hold=spec.hold||0;
    let fx=0,fy=0;
    // gunboats hold a standoff range and strafe; everything else closes in
    if(hold){
      const orbit=e.orbit||(e.orbit=Math.random()<.5?-1:1);
      if(d<hold*.85){fx-=ux;fy-=uy;}else if(d>hold*1.15){fx+=ux;fy+=uy;}
      fx+=tx*orbit*.7;fy+=ty*orbit*.7;
    }else{fx+=ux;fy+=uy;}
    // keep clear of each other, and slide sideways off anything sharing the same approach
    for(const o of enemies){
      if(o===e)continue;
      const dx=e.x-o.x, dy=e.y-o.y, dd=Math.hypot(dx,dy)||1, gap=e.r+o.r+12;
      if(dd<gap){const p=(gap-dd)/gap;fx+=dx/dd*p*2.4;fy+=dy/dd*p*2.4;}
      else if(dd<210){const side=(dx*tx+dy*ty)>=0?1:-1, w=(1-dd/210)*.9;fx+=tx*side*w;fy+=ty*side*w;}
    }
    const fl=Math.hypot(fx,fy)||1, sp=spec.guard?s*clamp(d/45,.2,1):s;
    e.x=clamp(e.x+fx/fl*sp*dt,e.r,RW-e.r);e.y=clamp(e.y+fy/fl*sp*dt,e.r,RH-e.r);
  }

  if(e.kt>0){
    const f=clamp(e.kt/(e.ktMax||.55),0,1);
    e.x=clamp(e.x+e.kx*f*dt,e.r,RW-e.r);
    e.y=clamp(e.y+e.ky*f*dt,e.r,RH-e.r);
    e.kt-=dt;
  }
  e.flash=Math.max(0,e.flash-dt);
  {  // hulls turn to face you rather than tumbling
    let dr=a-(e.rot||0);
    while(dr<-Math.PI)dr+=Math.PI*2;while(dr>Math.PI)dr-=Math.PI*2;
    e.rot=(e.rot||0)+dr*Math.min(1,dt*6);
  }
  e.numIn=(e.numIn||0)-dt;
  e.slowT=Math.max(0,(e.slowT||0)-dt);
  e.deflect=Math.max(0,(e.deflect||0)-dt);
  e.touch=(e.touch||0)-dt;
  if(dist(e,player)<e.r+player.r&&e.touch<=0){
    if(state.dashTime<=0){
      const mitigation=(state.weapons.sword?.guard?.7:1)*(state.weapons.aegis?.plating?.75:1);
      if(e.boss){
        // a boss body is not something you brush past
        if(state.difficulty==='impossible'){
          // the one-shot is the rule of the difficulty, not a damage number:
          // ABLATIVE PLATING is undone here so it still kills outright
          hurt(player.hp/(state.armor||1));
        }else{
          const raw=(e.contact||28)*BOSS_SLAM*(1+(state.room-1)*sector().dmgCurve)*difficulty.dmg*mitigation;
          hurt(Math.min(raw,player.maxHp*BOSS_CONTACT_CAP));
        }
        knockback(e,1500,.3);
        shake(18);hitStop(.09);sfx('boom');
        burst(player.x,player.y,spec.color,26,320,{size:3,drag:2.6});
        e.touch=.9;
      }else{
        // a wounded shape hits softer than a fresh one — it is running on fumes
        const wounded=.15+.85*clamp(e.hp/e.maxHp,0,1);
        const heavy=HEAVY_SHAPES.includes(e.type)?difficulty.heavy:1;
        const raw=(10+spec.hp*1.5+(spec.speed>=60?5:0))*wounded*heavy*(1+(state.room-1)*sector().dmgCurve)*difficulty.dmg*mitigation;
        hurt(Math.min(raw,player.maxHp*CONTACT_CAP));
        e.hp=0;spawnDamageNumber(e.x,e.y,999,'#fff');shake(4);
        e.touch=.55;
      }
    }else e.touch=.55;
    burst(e.x,e.y,spec.color,10,110);
  }
  e.shoot-=dt;
  if(e.type==='seeker'&&e.shoot<=0){
    // faster, tighter-turning missiles than the ones LANCE seeds
    const b=ang(e,player);
    enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b)*310,vy:Math.sin(b)*310,r:7,life:7,
      damage:(11+state.room*.35)*difficulty.dmg,homing:1,turn:2.6,color:spec.color,keep:true});
    e.shoot=rand(2.1,3.4);
  }
  // STALKER fire tracks: slower than a SEEKER missile, but it turns harder and
  // there is usually more than one of them in the air
  if(e.type==='stalker'&&e.shoot<=0){
    const b=ang(e,player);
    enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b)*236,vy:Math.sin(b)*236,r:6,life:6,
      damage:(9+state.room*.3)*difficulty.dmg,homing:1,turn:3.1,color:spec.color,keep:true});
    e.shoot=rand(1.8,2.9);
  }
  const beamKind=BEAM_ENEMIES[e.type];
  if(beamKind&&e.shoot<=0){
    // paints lanes across the floor that linger; you dash through them
    if(beams.length+beamKind.lanes.length<=BEAM_CAP){   // a volley lands whole or not at all
      const b=ang(e,player);
      for(const lane of beamKind.lanes)
        beams.push({x:e.x,y:e.y,a:b+lane,len:beamKind.len,warn:beamKind.warn,
          life:beamKind.life,maxLife:beamKind.life,hit:0,damage:beamKind.damage*difficulty.dmg,color:spec.color});
      e.shoot=rand(beamKind.reload[0],beamKind.reload[1]);
    }else e.shoot=.6;   // floor is full: check back shortly rather than dumping the moment it clears
  }
  // the SENTINEL volley, at three scales: the boss, the fighter built on its
  // pattern, and the bowtie's single pot-shot
  if((e.type==='bowtie'||e.type==='sentry'||e.bossId==='sentinel')&&e.shoot<=0){const b=ang(e,player),boss=e.bossId==='sentinel',sentry=e.type==='sentry',shots=boss?[-.24,-.12,0,.12,.24]:sentry?[-.15,0,.15]:[0];for(const offset of shots)enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b+offset)*(boss?282:sentry?252:224),vy:Math.sin(b+offset)*(boss?282:sentry?252:224),r:boss?7:sentry?6:5,life:4,damage:(boss?16:sentry?10+state.room*.35:8+state.room*.5)*difficulty.dmg});e.shoot=boss?1.15:sentry?rand(1.9,2.8):rand(2,3.4);}
}
function weapons(dt) {
  if(state.weapons.laser){
    const w=state.weapons.laser;
    w.beamT=Math.max(0,(w.beamT||0)-dt);
    for(const e of enemies)if(e.laserLinger>0){
      e.laserLinger-=dt;e.hp-=(e.burnDps||0)*dt;
      if(Math.random()<dt*22)particles.push({
        x:e.x+rand(-e.r*.8,e.r*.8), y:e.y+rand(-e.r*.5,e.r*.5),
        vx:rand(-26,26), vy:rand(-120,-58),
        life:.5,maxLife:.5,color:Math.random()<.45?'#ffd9ff':'#c879ff',size:2.1,drag:1.1});
    }
    state.laserIn-=dt;
    if(state.laserIn<=0){
      const e=nearest();
      if(e&&dist(e,player)<=(w.range||640)){
        hitLaser(w,e);
        w.ticks=(w.ticks||0)+1;
        if(w.split&&w.ticks%3===0){const second=enemies.filter(x=>x!==e&&onScreen(x)).sort((a,b)=>dist(a,player)-dist(b,player))[0];if(second)hitLaser(w,second,true);}
      }
      state.laserIn=1/w.rate;
    }
  }
  if(state.weapons.bomb){state.bombIn-=dt;if(state.bombIn<=0){const w=state.weapons.bomb,t=nearest();if(t)detonate(w,t.x,t.y,w.radius||135,w.damage,w.double?{timer:.75,damage:w.damage*.55}:null,heavyShot('bomb'));state.bombIn=1/w.rate;}}
  if(state.weapons.missile){
    const w=state.weapons.missile;
    state.missileIn-=dt;
    if(state.missileIn<=0){
      const t=nearest();
      if(t){
        const a=ang(player,t);
        if(w.ultimate)for(const off of [-.2,-.07,.07,.2])spawnRocket(w,a+off,470,off);
        else{ spawnRocket(w,a,470,0); if(w.twin)spawnRocket(w,a+rand(-.16,.16),470,0); }
        sfx('boom');
        state.missileIn=1/w.rate;
      }else state.missileIn=.12;      // hold the salvo until there is a target
    }
  }
  if(state.weapons.phalanx){
    const w=state.weapons.phalanx;
    state.phalanxIn-=dt;
    if(state.phalanxIn<=0){
      const t=nearest();
      if(t){
        const a=ang(player,t);
        spawnWall(w,a);
        if(w.ultimate)spawnWall(w,a+Math.PI);
        sfx('portal');shake(3);
        state.phalanxIn=1/w.rate;
      }else state.phalanxIn=.12;
    }
  }
  if(state.weapons.mine){
    const w=state.weapons.mine;
    state.mineIn-=dt;
    if(state.mineIn<=0){
      const t=nearest();
      if(t){
        spawnMine(w,t.x,t.y);
        if(w.multi){
          const second=enemies.filter(e=>liveTarget(e)&&e!==t&&onScreen(e)).sort((a,b)=>dist(a,player)-dist(b,player))[0];
          if(second)spawnMine(w,second.x,second.y);
        }
      }
      state.mineIn=1/w.rate;
    }
  }
  if(state.weapons.aegis){
    const w=state.weapons.aegis,radius=w.radius||125,slow=w.drag||.35;
    for(const e of enemies){
      const d=dist(e,player);
      if(d>radius+e.r)continue;
      e.hp-=w.damage*dt;
      e.slowT=Math.max(e.slowT||0,.12);
      e.slowAmt=Math.max(e.slowAmt||0,slow);
      if(w.pull&&d>1){e.x+=(player.x-e.x)/d*38*dt;e.y+=(player.y-e.y)/d*38*dt;}
      if(e.numIn<=0){e.numIn=.5;spawnDamageNumber(e.x,e.y,Math.max(1,Math.ceil(w.damage*.5)),w.color);}
    }
    if(w.pulse){
      w.pulseIn=(w.pulseIn||0)-dt;
      // EVENT HORIZON drags everything inwards, so the burst must fire before
      // anything actually reaches you — a proximity trigger guards the pull
      const closing=w.ultimate&&enemies.some(e=>dist(e,player)<player.r+e.r+AEGIS_GUARD);
      const sinceLast=AEGIS_CYCLE-(w.pulseIn||0);
      if(w.pulseIn<=0||(closing&&sinceLast>=AEGIS_GUARD_GAP)){
        aegisBurst(w,radius);
        w.pulseIn=AEGIS_CYCLE;
      }
    }
  }
  if(state.weapons.arc){
    const w=state.weapons.arc;
    w.boltT=Math.max(0,(w.boltT||0)-dt);
    state.arcIn=(state.arcIn||0)-dt;
    if(state.arcIn<=0){
      const first=nearest();
      if(first){
        const jumps=(w.chain||1)+(w.ultimate?0:0), reach=w.reach||320;
        const hit=[], path=[{x:player.x,y:player.y}];
        let node=first, dmg=w.damage;
        for(let i=0;i<=jumps&&node;i++){
          hit.push(node);path.push({x:node.x,y:node.y});
          zapEnemy(w,node,dmg);
          dmg*=.78;
          node=enemies.filter(e=>liveTarget(e)&&!hit.includes(e)&&onScreen(e)&&dist(e,node)<reach).sort((a,b)=>dist(a,node)-dist(b,node))[0];
        }
        if(w.ultimate){
          const extra=enemies.filter(e=>liveTarget(e)&&!hit.includes(e)&&onScreen(e)).sort((a,b)=>dist(a,player)-dist(b,player)).slice(0,2);
          for(const e of extra){zapEnemy(w,e,w.damage*.6);path.push({x:player.x,y:player.y},{x:e.x,y:e.y});}
        }
        w.bolt=path;w.boltT=.16;shake(2);
      }
      state.arcIn=1/w.rate;
    }
  }
  if(state.weapons.sword){
    const w=state.weapons.sword,reach=w.reach||78,hilt=16,width=w.width||11;
    // CELESTIAL BLADES wind up when something comes into range
    const near=enemies.some(e=>onScreen(e)&&dist(e,player)<reach+110);
    w.rush=(w.rush||0)+((near?1:0)-(w.rush||0))*Math.min(1,dt*5);
    w.angle=(w.angle||0)+(w.spin||4)*(1+(w.ultimate?w.rush*1.7:0))*dt;
    for(const a of bladeAngles(w)){
      const x1=player.x+Math.cos(a)*hilt,y1=player.y+Math.sin(a)*hilt;
      const x2=player.x+Math.cos(a)*reach,y2=player.y+Math.sin(a)*reach;
      for(const e of enemies){
        if(segDist(e.x,e.y,x1,y1,x2,y2)>e.r+width)continue;
        e.hp-=w.damage*dt*3.6*(w.ultimate?.78:1);e.flash=Math.max(e.flash,.05);   // four edges each bite a little softer
        if(Math.random()<dt*22)particles.push({x:e.x+rand(-6,6),y:e.y+rand(-6,6),vx:rand(-90,90),vy:rand(-90,90),life:.22,maxLife:.22,color:'#fff6c9',size:2.2,drag:5});
        if(e.numIn<=0){e.numIn=.22;spawnDamageNumber(e.x,e.y,Math.ceil(w.damage*.8),w.color);shake(1);}
      }
    }
  }
}
// the sword's cutting edges: one blade, plus an opposed second edge once ultimate
function bladeAngles(w){
  const a=w.angle||0;
  return w.ultimate?[a,a+Math.PI/2,a+Math.PI,a+Math.PI*1.5]:[a];
}
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;const t=L?clamp(((px-x1)*dx+(py-y1)*dy)/L,0,1):0;return Math.hypot(px-(x1+dx*t),py-(y1+dy*t));}
const AEGIS_CYCLE=2.2;        // normal spacing between discharges
const AEGIS_GUARD=46;         // fires early once something is this close to touching you
const AEGIS_GUARD_GAP=.7;     // but no more often than this
function aegisBurst(w,radius){
  const dmg=w.damage*(w.ultimate?6.5:1.7);
  for(const e of enemies){
    if(dist(e,player)>=radius+e.r)continue;
    const h=critHit(dmg);
    e.hp-=h.dmg;e.flash=Math.max(e.flash,h.crit?.24:.16);
    spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),'#dffaff',h.crit);
  }
  blasts.push({x:player.x,y:player.y,radius,life:.4,maxLife:.4,color:w.color});
  burst(player.x,player.y,w.color,w.ultimate?24:16,260,{size:2.8,drag:2.8});
  // and throw the survivors back out of the well
  // the wave must not out-reach the damage, or it would fling enemies clear
  // of the well before the burst ever touches them
  if(w.ultimate)shockwave(player.x,player.y,w.color,620,radius);
  shake(w.ultimate?7:3);
  sfx('boom');
}
function zapEnemy(w,e,dmg){
  const h=critHit(dmg);
  e.hp-=h.dmg;e.flash=h.crit?.2:.12;
  spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),w.color,h.crit);
  burst(e.x,e.y,'#e6d4ff',5,130,{size:2,drag:5});
  if(w.overload){e.slowT=Math.max(e.slowT||0,1.2);e.slowAmt=Math.max(e.slowAmt||0,.4);}
  sfx('arc');
}
function hitLaser(w,e,secondary){
  const h=critHit(w.damage);
  e.hp-=h.dmg;e.flash=h.crit?.2:.12;
  if(w.linger){e.laserLinger=w.linger;e.burnDps=w.damage*2.2;}   // burn ticks are continuous, so never a crit
  spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),w.color,h.crit);
  burst(e.x,e.y,'#c879ff',6,110,{size:2.2,drag:4.5});
  if(!secondary){w.beamT=.14;w.bx=e.x;w.by=e.y;w.nova=null;shake(1);sfx('laser');}
}
// `heavy` is passed rather than looked up: the same crater is made by the torpedo
// and by a WARHEAD SALVO rocket, and each has its own upgrade behind it
function detonate(w,x,y,radius,damage,followUp,heavy){
  for(const e of enemies)if(dist(e,{x,y})<radius){
    const h=critHit(damage);
    e.hp-=h.dmg;e.flash=h.crit?.26:.18;
    spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),w.color,h.crit);
  }
  blasts.push({x,y,radius,life:.42,maxLife:.42,color:w.color,heavy:!!heavy});
  burst(x,y,w.color,26,240,{size:3.2,drag:2.6});
  burst(x,y,'#fff2d6',10,120,{size:2.2,drag:4});
  shake(8);hitStop(.045);sfx('boom');
  // GRAVITY WELL: the crater keeps pulling after the flash, dragging survivors — and
  // anything that was standing just outside the blast — into the centre. With CLUSTER
  // CORE the follow-up detonation then lands on a clump instead of a scattered field.
  if(w.pull)spawnWell(x,y,radius*1.3,300,.55,w.color);
  if(followUp)delayedBlasts.push({x,y,radius,timer:followUp.timer,damage:followUp.damage,color:w.color});
}
// a well can only haul so many shapes at once: the nearest `cap` are caught, and
// anything past that walks straight through the field
const MINE_CAP=5, WELL_CAP=6;
function grip(x,y,radius,cap){
  const found=[];
  for(const e of enemies){
    const d=Math.hypot(e.x-x,e.y-y);
    if(d<=radius)found.push({e,d});
  }
  found.sort((a,b)=>a.d-b.d);
  return found.slice(0,cap);
}
// a short-lived pull with no detonation of its own — what a bomb crater leaves behind
function spawnWell(x,y,radius,force,life,color,cap){
  wells.push({x,y,radius,force,life,maxLife:life,color,cap:cap||WELL_CAP,held:0});
}
function updateWells(dt){
  for(const wl of wells){
    wl.life-=dt;
    const caught=grip(wl.x,wl.y,wl.radius,wl.cap);
    wl.held=caught.length;
    for(const {e,d} of caught){
      if(d<1)continue;
      const pull=wl.force*(1-clamp(d/wl.radius,0,1)*.5)*(e.boss?.3:1);   // bosses barely budge
      e.x+=(wl.x-e.x)/d*pull*dt;e.y+=(wl.y-e.y)/d*pull*dt;
      e.slowT=Math.max(e.slowT||0,.12);e.slowAmt=Math.max(e.slowAmt||0,.35);
    }
    if(Math.random()<dt*24){
      const a=Math.random()*Math.PI*2, rr=wl.radius*(.5+Math.random()*.5);
      particles.push({x:wl.x+Math.cos(a)*rr,y:wl.y+Math.sin(a)*rr,
        vx:-Math.cos(a)*rr*1.6,vy:-Math.sin(a)*rr*1.6,life:.3,maxLife:.3,color:wl.color,size:2,drag:1.4});
    }
  }
  wells=wells.filter(w=>w.life>0);
}
// a gravity mine drops, arms, hauls enemies to its center, then collapses
function spawnMine(w,x,y){
  const hold=w.hold||1.5;
  mines.push({x,y,armT:.4,holdT:hold,holdT0:hold,radius:w.radius||160,damage:w.damage,pullForce:w.pullForce||230,color:w.color,crush:w.crush,cap:w.cap||MINE_CAP,held:0,
    heavy:heavyShot('mine'),chain:w.ultimate?2:0});   // SINGULARITY COLLAPSE: the wreckage blinks back and detonates twice more
}
function updateMines(dt){
  for(const m of mines){
    if(m.armT>0){m.armT-=dt;continue;}
    m.holdT-=dt;
    const caught=grip(m.x,m.y,m.radius,m.cap);
    m.held=caught.length;
    for(const {e,d} of caught){
      if(d<1)continue;
      e.x+=(m.x-e.x)/d*m.pullForce*dt;e.y+=(m.y-e.y)/d*m.pullForce*dt;
      e.slowT=Math.max(e.slowT||0,.12);e.slowAmt=Math.max(e.slowAmt||0,.5);
    }
    if(Math.random()<dt*30)particles.push({x:m.x+rand(-4,4),y:m.y+rand(-4,4),vx:rand(-20,20),vy:rand(-20,20),life:.3,maxLife:.3,color:m.color,size:1.8,drag:2});
    if(m.holdT<=0){
      for(const e of enemies){
        const d=dist(e,m);
        if(d>m.radius)continue;
        const core=m.crush&&d<m.radius*.45,h=critHit(m.damage*(core?1.75:1));
        e.hp-=h.dmg;e.flash=h.crit?.28:.2;spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),m.color,h.crit);
        // CRUSH DEPTH hurls every survivor clear, the cored ones included — they were
        // dragged to the middle, so excluding them meant almost nothing was ever thrown.
        // Hand it to the knockback the enemy already integrates rather than teleporting.
        if(m.crush){
          let ux,uy;
          if(d<1){const a=Math.random()*Math.PI*2;ux=Math.cos(a);uy=Math.sin(a);}   // dead centre: any way out will do
          else{ux=(e.x-m.x)/d;uy=(e.y-m.y)/d;}
          const push=560*(1-clamp(d/m.radius,0,1)*.45)*(e.boss?.4:1);
          e.kx=ux*push;e.ky=uy*push;e.kt=e.ktMax=.5;
          burst(e.x,e.y,m.color,5,170,{size:2.2,drag:3});
        }
      }
      blasts.push({x:m.x,y:m.y,radius:m.radius,life:.4,maxLife:.4,color:m.color});
      burst(m.x,m.y,m.color,30,260,{size:3,drag:2.4});
      burst(m.x,m.y,'#ffffff',14,190,{size:2.2,drag:3.2});
      shake(9);hitStop(.05);sfx('boom');
      if(m.chain>0)mines.push({x:m.x,y:m.y,armT:.25,holdT:m.holdT0,holdT0:m.holdT0,radius:m.radius,damage:m.damage,pullForce:m.pullForce,color:m.color,crush:m.crush,cap:m.cap,held:0,heavy:m.heavy,chain:m.chain-1});
      m.dead=true;
    }
  }
  mines=mines.filter(m=>!m.dead);
}
// ---- WARHEAD SALVO ---------------------------------------------------------
// unlike the torpedo, which simply detonates on a target, a warhead is a physical
// thing that has to fly there. It steers loosely, so a shape that moves after the
// launch can still be missed — the trade for how hard it lands.
function spawnRocket(w,a,speed,spread){
  rockets.push({x:player.x,y:player.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
    a,life:2.6,damage:w.damage,radius:w.radius||150,color:w.color,heavy:heavyShot('missile'),
    cluster:!!w.cluster,turn:spread?1.1:2.3,drift:spread||0});
}
function updateRockets(dt){
  const w=state.weapons.missile;
  for(const r of rockets){
    const t=enemies.filter(liveTarget).reduce((best,e)=>onScreen(e)&&(!best||dist(e,r)<dist(best,r))?e:best,null);
    if(t){
      let cur=Math.atan2(r.vy,r.vx),want=ang(r,t)+r.drift,diff=want-cur;
      while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
      cur+=clamp(diff,-r.turn*dt,r.turn*dt);
      const sp=Math.hypot(r.vx,r.vy);
      r.vx=Math.cos(cur)*sp;r.vy=Math.sin(cur)*sp;
    }
    r.x+=r.vx*dt;r.y+=r.vy*dt;r.life-=dt;
    if(Math.random()<dt*30)particles.push({x:r.x,y:r.y,vx:rand(-40,40),vy:rand(-40,40),life:.34,maxLife:.34,color:'#ffb066',size:2.2,drag:3});
    const hit=enemies.find(e=>liveTarget(e)&&dist(r,e)<e.r+9);
    if(hit||r.life<=0||r.x<0||r.x>RW||r.y<0||r.y>RH){
      if(w)detonate(w,clamp(r.x,0,RW),clamp(r.y,0,RH),r.radius,r.damage,
        r.cluster?{timer:.55,damage:r.damage*.45}:null,r.heavy);
      if(r.cluster&&w)for(let i=0;i<3;i++){
        const ca=Math.random()*Math.PI*2, cd=r.radius*.7;
        delayedBlasts.push({x:clamp(r.x+Math.cos(ca)*cd,0,RW),y:clamp(r.y+Math.sin(ca)*cd,0,RH),
          radius:r.radius*.5,timer:.35+i*.22,damage:r.damage*.4,color:r.color});
      }
      r.life=0;
    }
  }
  rockets=rockets.filter(r=>r.life>0);
}
function drawRockets(){
  ctx.save();
  for(const r of rockets){
    const dir=Math.atan2(r.vy,r.vx), sz=r.heavy?1.45:1;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(dir);
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.5;ctx.fillStyle='#ff7a2a';flameTongue(-4,0,Math.PI,26*sz,4.4*sz);
    if(r.heavy){
      // HEAVY WARHEAD: more missile, and a plume that says so
      ctx.globalAlpha=.55;ctx.fillStyle='#ffd9a8';flameTongue(-4,0,Math.PI,15*sz,2.2*sz);
    }
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;ctx.fillStyle='#ffe6cf';ctx.shadowColor=r.color;ctx.shadowBlur=12+(r.heavy?8:0);
    ctx.beginPath();ctx.moveTo(13*sz,0);ctx.lineTo(-5*sz,5*sz);ctx.lineTo(-2*sz,0);ctx.lineTo(-5*sz,-5*sz);ctx.closePath();ctx.fill();
    if(r.heavy){   // a banded warhead collar behind the nose
      ctx.shadowBlur=0;ctx.fillStyle=r.color;
      ctx.beginPath();ctx.moveTo(5*sz,0);ctx.lineTo(0,3.4*sz);ctx.lineTo(0,-3.4*sz);ctx.closePath();ctx.fill();
    }
    ctx.shadowBlur=0;ctx.restore();
  }
  ctx.restore();
}
// ---- PHALANX WALL ----------------------------------------------------------
// a launched slab rather than a shot: it barely hurts, but nothing it touches
// stays where it was. Its job is to buy back the space around you.
const WALL_SPEED=560;
// the throw has to outrange its own shove: KINETIC RAM pushes a crowd a long way,
// and a wall that stopped short would leave the next one nothing to catch
const WALL_LEG=1.9;
function spawnWall(w,a,recall){
  const back=recall===undefined?!!w.recall:recall;
  const life=back?WALL_LEG*2:WALL_LEG;
  walls.push({x:player.x,y:player.y,a,span:w.span||200,speed:WALL_SPEED,
    damage:w.damage,push:(w.push||1)*1100,color:w.color,life,maxLife:life,
    heavy:heavyShot('phalanx'),recall:back,stun:!!w.ultimate,hit:[]});
}
function updateWalls(dt){
  for(const wl of walls){
    wl.life-=dt;
    // RECALL FIELD flips the wall around at the halfway mark and sweeps it home
    const back=wl.recall&&wl.life<wl.maxLife*.5;
    const dir=back?-1:1;
    wl.x+=Math.cos(wl.a)*wl.speed*dir*dt;
    wl.y+=Math.sin(wl.a)*wl.speed*dir*dt;
    if(back&&!wl.flipped){wl.flipped=true;wl.hit=[];}   // it may catch the same shape once each way
    const nx=Math.cos(wl.a), ny=Math.sin(wl.a);
    for(const e of enemies){
      if(!liveTarget(e)||wl.hit.includes(e))continue;
      // distance along the wall's face, and across it
      const dx=e.x-wl.x, dy=e.y-wl.y;
      const across=dx*nx+dy*ny, along=-dx*ny+dy*nx;
      if(Math.abs(across)>e.r+16||Math.abs(along)>wl.span/2+e.r)continue;
      wl.hit.push(e);
      const h=critHit(wl.damage);
      e.hp-=h.dmg;e.flash=h.crit?.24:.16;
      spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),wl.color,h.crit);
      if(!back){e.kx=nx*wl.push;e.ky=ny*wl.push;e.kt=.34;e.ktMax=.34;}
      if(wl.stun){e.slowT=Math.max(e.slowT||0,1);e.slowAmt=Math.max(e.slowAmt||0,.75);}
      burst(e.x,e.y,wl.color,7,150,{size:2.2,drag:4});
    }
    if(wl.x<-200||wl.x>RW+200||wl.y<-200||wl.y>RH+200)wl.life=0;
  }
  walls=walls.filter(w=>w.life>0);
}
function drawPhalanx(){
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for(const wl of walls){
    const k=clamp(wl.life/wl.maxLife,0,1);
    ctx.save();ctx.translate(wl.x,wl.y);ctx.rotate(wl.a);
    const h=wl.span/2;
    const g=ctx.createLinearGradient(0,-h,0,h);
    g.addColorStop(0,rgba(wl.color,0));
    g.addColorStop(.5,rgba(wl.color,.55*k+.2));
    g.addColorStop(1,rgba(wl.color,0));
    const th=wl.heavy?15:9;
    ctx.fillStyle=g;ctx.fillRect(-th,-h,th*2,h*2);
    ctx.globalAlpha=.75*k;
    ctx.strokeStyle='#ffffff';ctx.lineWidth=wl.heavy?3.5:2;
    ctx.beginPath();ctx.moveTo(0,-h*.92);ctx.lineTo(0,h*.92);ctx.stroke();
    // a leading edge that reads as a shove rather than a beam
    ctx.globalAlpha=.35*k;ctx.strokeStyle=wl.color;ctx.lineWidth=6;
    ctx.beginPath();ctx.arc(0,0,h*1.02,-1.05,1.05);ctx.stroke();
    if(wl.heavy){
      // KINETIC MASS: the slab gets a hard face, and ribs across it, so it reads
      // as something with weight behind it rather than a sheet of light
      ctx.globalAlpha=.8*k;ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(0,0,h*1.02,-1.05,1.05);ctx.stroke();
      ctx.globalAlpha=.4*k;ctx.strokeStyle=wl.color;ctx.lineWidth=3;
      for(let i=-2;i<=2;i++){
        const y=i*h*.34;
        ctx.beginPath();ctx.moveTo(-th,y);ctx.lineTo(th*1.6,y);ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
function updateArrows(dt) {
  for(const a of arrows){
    if(a.homing){
      a.homeIn=(a.homeIn||0)-dt;
      // each arrow chases whatever is nearest to itself — an enemy, or an incoming bullet worth intercepting
      let t=[...enemies.filter(liveTarget),...enemyBullets].reduce((best,e)=>{if(!onScreen(e))return best;const d=dist(e,a);return d<440&&(!best||d<best.d)?{e,d}:best;},null);
      // stay on the target it was fired at unless something else is right on top of it
      if(a.tgt&&a.tgt.hp>0&&enemies.includes(a.tgt)&&(!t||t.d>120))t={e:a.tgt,d:dist(a.tgt,a)};
      // long shots fan out before steering; a point-blank shot has no time to
      // fan, so it corrects immediately rather than sailing past
      if(t&&(a.homeIn<=0||t.d<150)){
        const fan=(a.lane||0)*clamp((t.d-60)/120,0,1);
        const want=ang(a,t.e)+fan,speed=Math.hypot(a.vx,a.vy);
        let cur=Math.atan2(a.vy,a.vx),diff=want-cur;
        while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
        const turn=a.turn||7.5;
        cur+=clamp(diff,-turn*dt,turn*dt);
        a.vx=Math.cos(cur)*speed;a.vy=Math.sin(cur)*speed;
      }
    }
    a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;
    if(Math.random()<dt*14)particles.push({x:a.x-a.vx*.012,y:a.y-a.vy*.012,vx:rand(-30,30),vy:rand(-30,30),life:.22,maxLife:.22,color:'#ffb54a',size:1.5,drag:6});
    // an arrow may only score once per enemy — pierce carries it through to the next one
    for(const e of enemies)if(a.life>0&&liveTarget(e)&&dist(a,e)<e.r+5&&!(a.hit&&a.hit.includes(e))){
      (a.hit||(a.hit=[])).push(e);
      const ah=critHit(a.damage);
      e.hp-=ah.dmg;e.flash=ah.crit?.2:.1;spawnDamageNumber(e.x,e.y,Math.ceil(ah.dmg),a.color,ah.crit);shake(ah.crit?4:2);sfx('hit');
      if(a.pierce>0)a.pierce--;else a.life=0;
      burst(a.x,a.y,a.color,6,120,{size:2.2,drag:5});
    }
    // meeting an enemy bullet head-on cancels both projectiles out
    if(a.life>0)for(const b of enemyBullets)if(b.life>0&&dist(a,b)<b.r+5){
      b.life=0;a.life=0;burst(a.x,a.y,'#fff6c9',8,140,{size:2.4,drag:5});sfx('hit');
      break;
    }
  }
  arrows=arrows.filter(a=>a.life>0&&a.x>0&&a.x<RW&&a.y>0&&a.y<RH);
}
function updateEchoShots(dt){for(const s of echoShots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;for(const e of enemies)if(s.life>0&&e.hp>0&&dist(s,e)<e.r+6){e.hp-=s.damage;e.flash=.12;spawnDamageNumber(e.x,e.y,Math.ceil(s.damage),s.color);s.life=0;burst(s.x,s.y,'#a6d8ff',5,80);}}echoShots=echoShots.filter(s=>s.life>0&&s.x>0&&s.x<W&&s.y>0&&s.y<H);}
function updateEnemyBullets(dt) {
  for(const b of enemyBullets){
    if(b.homing){
      const want=ang(b,player), sp=Math.hypot(b.vx,b.vy);
      let cur=Math.atan2(b.vy,b.vx), diff=want-cur;
      while(diff<-Math.PI)diff+=Math.PI*2;while(diff>Math.PI)diff-=Math.PI*2;
      cur+=clamp(diff,-(b.turn||1.5)*dt,(b.turn||1.5)*dt);
      b.vx=Math.cos(cur)*sp;b.vy=Math.sin(cur)*sp;
    }
    const sp=shotSpeed();
    b.x+=b.vx*sp*dt;b.y+=b.vy*sp*dt;b.life-=dt/shotLife();
    if(state.dashTime<=0&&dist(b,player)<b.r+player.r){hurt(b.damage||10);b.life=0;burst(player.x,player.y,'#ff6387',8,80);}
  }
  enemyBullets=enemyBullets.filter(b=>b.life>0&&(b.keep||(b.x>0&&b.x<RW&&b.y>0&&b.y<RH)));
}
// tougher shapes scatter more remnants than a square does — the total worth is
// unchanged, it just arrives as a burst you can see instead of one pickup
function starCount(spec,boss){
  if(boss)return 10;
  const ratio=xpValue(spec)/Math.max(1,xpValue(types.square));
  return clamp(Math.ceil(ratio-.15),1,5);
}
function dropStars(e,spec){
  const total=xpValue(spec), n=starCount(spec,e.boss);
  const each=Math.floor(total/n), extra=total-each*n;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=n>1?rand(70,190):0;
    stars.push({
      x:e.x+Math.cos(a)*(n>1?rand(2,10):0), y:e.y+Math.sin(a)*(n>1?rand(2,10):0),
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      value:Math.max(1,each+(i<extra?1:0)), spin:Math.random()*7
    });
  }
}
function updateStars(dt) {
  for(const s of stars){
    s.spin+=dt*5;
    if(s.vx||s.vy){
      const drag=1-Math.min(1,dt*7);
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      s.vx*=drag;s.vy*=drag;
      s.x=clamp(s.x,25,RW-25);s.y=clamp(s.y,35,RH-25);
      if(Math.hypot(s.vx,s.vy)<12){s.vx=0;s.vy=0;}
    }
    const d=dist(s,player);
    const k=state.vacuum?17:d<(state.magnet?1250:250)?12:0;
    if(k){s.x+=(player.x-s.x)*dt*k;s.y+=(player.y-s.y)*dt*k;}
    if(d<32){state.xp+=s.value;s.dead=true;sfx('pip');burst(s.x,s.y,'#ffe17a',7,130,{size:2.2,drag:5});}
  }
  stars=stars.filter(s=>!s.dead);
  if(state.freeDraws>0&&state.hasDraw)levelUp(true);
  else if(state.xp>=state.need&&state.hasDraw) levelUp();
}
function xpValue(spec){const difficultyBonus=state.difficulty==='impossible'?1.25:state.difficulty==='hard'?1.1:state.difficulty==='easy'?.95:1;const healthBonus=1+Math.max(0,spec.hp-1)*.03;const speedBonus=spec.speed>=60?1.08:1;return Math.max(1,Math.round(spec.xp*healthBonus*speedBonus*difficultyBonus*sectorXp()*(state.charXp||1)));}
function deaths(){
  for(const e of enemies){
    if(e.shield){
      if(e.shieldHp===undefined)e.shieldHp=e.hp;
      if(e.hp<e.shieldHp){e.deflect=.2;e.hp=e.shieldHp;}   // shots bounce off entirely
    }else if(e.shieldHp!==undefined)e.shieldHp=undefined;
  }
  const alive=[], shards=[];
  for(const e of enemies){
    if(e.hp>0){alive.push(e);continue;}
    const sp=types[e.type];
    // shrapnel is queued rather than spawned here: the sweep below reassigns
    // `enemies`, and anything pushed mid-loop would be walked over by it
    if(sp.splits&&!e.split)shards.push({sp,x:e.x,y:e.y,r:e.r});
    state.kills++;
    if(state.siphon&&player.hp>0)player.hp=Math.min(player.maxHp,player.hp+state.siphon*(e.boss?20:1));
    dropStars(e,sp);
    burst(e.x,e.y,sp.color,e.boss?60:15,e.boss?340:190,{size:e.boss?3.6:2.8,drag:3});
    burst(e.x,e.y,'#ffffff',e.boss?18:5,e.boss?200:110,{size:2,drag:5});
    blasts.push({x:e.x,y:e.y,radius:e.boss?260:e.r*2.6,life:e.boss?.6:.26,maxLife:e.boss?.6:.26,color:sp.color});
    if(e.boss){
      shake(24);hitStop(.16);sfx('boom');
      // everything it put in the air goes with it, so the area cannot end in a
      // long mop-up of a dead carrier's leftovers
      for(const add of enemies)if(add.escortOf===e&&add.hp>0)add.hp=0;
    }else sfx('kill');
  }
  enemies=alive;
  for(const s of shards){
    for(let i=0;i<s.sp.splits;i++){
      const a=Math.random()*Math.PI*2;
      const kid=spawnAt(s.sp.splitInto,clamp(s.x+Math.cos(a)*s.r*.7,40,RW-40),clamp(s.y+Math.sin(a)*s.r*.7,50,RH-50));
      // thrown clear on the way out, and flagged so shrapnel cannot itself split
      if(kid){kid.split=true;kid.kt=.4;kid.ktMax=.4;kid.kx=Math.cos(a)*560;kid.ky=Math.sin(a)*560;}
    }
  }
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
function finishRoom(){
  if(state.exit||state.transitioning||state.victoryPortal)return;
  state.active=false;state.intermission=true;
  enemyBullets.length=0;strikes.length=0;rings.length=0;pulses.length=0;beams.length=0;   // the room is won; no dying to a stray shot afterwards
  state.vacuum=true;
  sfx('cleared');hitStop(.07);
  toast('AREA '+state.room+' CLEARED');
  blasts.push({x:player.x,y:player.y,radius:340,life:.65,maxLife:.65,color:'#9cf0bd'});       // and sweep up every remnant you earned
  if(state.room%10===0&&state.room!==FINAL_ROOM&&!state.relicRooms[state.room]){showRelics();return;}
  openPortal();
}
// a short arm delay so a player standing on the spawn point isn't swallowed
// instantly, and the remnant sweep has time to land
function openPortal(){state.victoryPortal={x:RW/2,y:RH/2,r:34};state.portalArm=.7;}
function nextRoom(){
  if(state.room>=FINAL_ROOM){runCleared();return;}   // there is no area 51 to fly to
  state.room++;player.x=RW/2;player.y=RH/2;player.vx=0;player.vy=0;state.history=[];beginRoom();
}
// the run ends here rather than rolling on: the sector is clear, so it is banked,
// closed out, and you are asked what to fly next
function runCleared(){
  if(state.over)return;
  state.over=true;
  setInRun(false);
  // the portal was mid-warp when this fired — put the camera back before the modal
  state.victorySequence=null;state.warp=null;state.cameraZoom=1;state.cameraRot=0;
  state.flash=0;state.screenAlpha=0;state.playerAlpha=1;state.victoryPortal=null;
  recordRoom(state.room);
  const earned=Math.max(0,runReward()-(state.paidCredits||0)), spEarned=skillOwed();
  state.paidCredits=runReward();
  state.paidSkill=skillReward(state.room,state.difficulty);
  points+=earned;skill+=spEarned;saveProfile();saveTree();
  clearRun();                      // a finished run is not one you continue
  let note='';
  if((state.difficulty===IMPOSSIBLE_KEY||state.difficulty==='impossible')&&!devMode){
    const first=localStorage.getItem('shapeshift_hard_beaten')!=='true';
    localStorage.setItem('shapeshift_hard_beaten','true');   // key predates the area-50 rule
    if(first)note='<p class="payout-note">IMPOSSIBLE is now open on the difficulty screen.</p>';
    // taking the sector to its end on HARD is what opens the next one along
    const next=sectorDef(state.sector+1);
    if(next&&!next.soon&&!sectorsOpen.has(next.id)){
      sectorsOpen.add(next.id);saveProfile();
      note+='<div class="sector-unlock"><span>SECTOR UNLOCKED</span><b>'+next.name+'</b><i>'+next.line+'</i></div>';
    }
  }
  state.paused=true;
  sfx('cleared');
  const c=characters[state.character]||characters[STARTER], d=difficulties[state.difficulty];
  show('<div class="modal"><div class="eyebrow">SECTOR CLEAR // '+d.label+'</div><h2>All areas cleared</h2>'
    +'<p>All '+FINAL_ROOM+' areas flown and the '+finaleBoss().name+' is down &mdash; flying <b style="color:'+c.color+'">'+c.name+'</b></p>'
    +'<div class="payout"><span>CREDITS EARNED <b>+'+earned+'</b> <em>&times;'+creditRate(state.difficulty)+' '+d.label+'</em></span>'
      +'<span>SKILL POINTS <b>+'+spEarned+'</b> <em>'+skillNote(state.difficulty)+'</em></span>'
      +'<span>BALANCE <b>'+points+'</b> &middot; <b>'+skill+' SP</b></span>'
      +'<span>RUN TIME <b>'+new Date(state.time*1000).toISOString().slice(14,19)+'</b></span></div>'
    +note
    +'<p class="payout-note">'+(state.difficulty==='impossible'
      ?'Nothing in this sector flies higher. Spend what you earned, or take it again.'
      :'Nothing left in this sector. Take it again on a harder setting, or spend what you earned.')+'</p>'
    +'<button class="continue" id="clearDiff">CHANGE DIFFICULTY</button>'
    +'<button class="continue ghost" id="clearRoster">HANGAR</button>'
    +'<button class="continue ghost" id="clearHome">MAIN MENU</button></div>');
  $('#clearDiff').onclick=()=>{sfx('ui');showStart();};
  $('#clearRoster').onclick=()=>{sfx('ui');showRoster();};
  $('#clearHome').onclick=()=>{sfx('ui');showHome();};
}
function weaponPower(){return Object.values(state.weapons).reduce((sum,w)=>sum+(w.damage||0),0);}
function updateRelics(dt){if(state.echo){const ghost=state.history[Math.min(18,state.history.length-1)]||player;state.echo.x=ghost.x;state.echo.y=ghost.y;state.echo.fireIn-=dt;if(state.echo.fireIn<=0){const target=enemies.reduce((best,e)=>liveTarget(e)&&onScreen(e)&&(!best||dist(e,state.echo)<dist(best,state.echo))?e:best,null);if(target){const a=ang(state.echo,target);echoShots.push({x:state.echo.x,y:state.echo.y,vx:Math.cos(a)*495,vy:Math.sin(a)*495,life:1.5,damage:weaponPower()*.25});burst(state.echo.x,state.echo.y,'#a6d8ff',8,100);}state.echo.fireIn=.42;}}}
// ---- relics ---------------------------------------------------------------
// one relic per boss, drawn three cards at a time from whatever is still on the
// table, so no two runs are handed the same kit and no relic is ever offered
// twice. `apply` runs once, on claim; anything it writes to `state` or `player`
// has to survive storeRun/resumeRun, so a parked run keeps what it earned.
// `desc` is the card, `line` the one-line pause-menu readout — either may be a
// function when its wording depends on the live control scheme.
const RELICS={
  echo:{name:'ECHO PHANTOM',
    desc:'A ghost copies your movement and attacks for 25% of your combined weapon damage.',
    line:'A ghost mirrors your movement and fires with you.',
    apply(){state.echo={x:player.x,y:player.y,fireIn:0};}},
  cloak:{name:'PHASE CLOAK',
    desc:()=>ctrlPhase()+' to disappear for 3 seconds. You can move freely and take no damage.',
    line:()=>ctrlPhase()+' to phase out for 3 seconds.',
    apply(){state.hasCloak=true;}},
  overdrive:{name:'CORE OVERDRIVE',
    desc:'Every weapon you are carrying cycles 25% faster.',
    line:'All weapons fire 25% faster.',
    apply(){Object.values(state.weapons).forEach(w=>w.rate*=1.25);}},
  // the amplifier applies to what you carry now *and* what you pick up later, so
  // it is worth as much taken early as taken late
  focus:{name:'FOCUSING ARRAY',
    desc:'Every weapon hits 18% harder — the ones you carry now, and anything you install later.',
    line:'All weapon damage +18%.',
    apply(){state.charDamage=(state.charDamage||1)*1.18;Object.values(state.weapons).forEach(w=>w.damage*=1.18);}},
  drag:{name:'INERTIAL DRAG',
    desc:'Fouls every hostile drive in the sector: they close 20% slower, bosses included.',
    line:'Hostiles move 20% slower.',
    apply(){state.enemyPace=(state.enemyPace||1)*.8;}},
  plate:{name:'ABLATIVE PLATING',
    desc:'Sheds the edge off everything that lands. All damage you take is cut by 20%.',
    line:'Damage taken −20%.',
    apply(){state.armor=(state.armor||1)*.8;}},
  siphon:{name:'SIPHON CORE',
    desc:'Every kill bleeds a little of itself back into your hull — 2 health a shape, 40 off a boss.',
    line:'Kills repair 2 hull, 40 from a boss.',
    apply(){state.siphon=(state.siphon||0)+2;}},
  thorns:{name:'STATIC BARRIER',
    desc:'Anything that lands a hit on you eats the discharge: a shock that damages everything close.',
    line:'Taking a hit discharges a damaging shock.',
    apply(){state.thorns=(state.thorns||0)+1;}},
  lattice:{name:'PREDICTOR LATTICE',
    desc:'+10 percentage points of critical chance, and +0.5x on every critical you land.',
    line:'+10% crit chance, +0.5x crit damage.',
    apply(){state.critChance=clamp((state.critChance||0)+.1,0,1);state.critMult=(state.critMult||1.3)+.5;}},
  mender:{name:'AUTO-MENDER',
    desc:'Field repair that never stops: +4 health a second for the rest of the run.',
    line:'+4 health regenerated per second.',
    apply(){player.regen+=4;}},
  bulkhead:{name:'DRIFT BULKHEAD',
    desc:'+45 maximum hull, and a full repair on the spot.',
    line:'+45 maximum hull.',
    apply(){player.maxHp+=45;player.hp=player.maxHp;}},
  burner:{name:'AFTERBURNER',
    desc:'+15% airframe speed, and the dash recharges a third sooner.',
    line:'+15% speed, faster dash recharge.',
    apply(){player.speed*=1.15;state.dashCd=(state.dashCd||3)*.67;}},
  magnet:{name:'SALVAGE MAGNET',
    desc:'Drags remnants in from across the floor, and every one of them is worth 25% more.',
    line:'+25% XP, and remnants come to you.',
    apply(){state.charXp=(state.charXp||1)*1.25;state.magnet=1;}}
};
const RELIC_IDS=Object.keys(RELICS);
// a card's wording may depend on the control scheme, so it is resolved at read time
const relicText=v=>typeof v==='function'?v():v;
const relicPool=()=>RELIC_IDS.filter(id=>!state.relicsTaken.includes(id));
function showRelics(){
  const draw=shuffle(relicPool()).slice(0,3);
  if(!draw.length){openPortal();return;}     // nothing left to hand out, so nothing to stop for
  state.relicDraw=draw;
  state.paused=true;state.relicOpen=true;
  const cards=draw.map((id,i)=>'<div class="card"><span class="card-key">RELIC 0'+(i+1)+'</span><h3>'+RELICS[id].name
    +'</h3><p>'+relicText(RELICS[id].desc)+'</p><button data-relic="'+id+'">CLAIM</button></div>').join('');
  show('<div class="modal"><div class="eyebrow">BOSS RELIC // AREA '+state.room+'</div><h2>Choose a relic</h2>'
    +'<p>The exit will open after you claim one.</p><div class="cards">'+cards+'</div></div>');
  document.querySelectorAll('[data-relic]').forEach(b=>b.onclick=()=>claimRelic(b.dataset.relic));
}
function claimRelic(id){
  const relic=RELICS[id];
  if(!relic||state.relicsTaken.includes(id))return;
  relic.apply();
  state.relicsTaken.push(id);state.relicRooms[state.room]=true;state.relicDraw=null;
  state.relicOpen=false;state.paused=false;hide();openPortal();
}
// STATIC BARRIER: whatever put a hit on you is standing close enough to pay for it
function staticDischarge(){
  const reach=210, dmg=(16+state.room*2.2)*state.thorns*(state.charDamage||1);
  for(const e of enemies){
    if(dist(e,player)>reach+e.r)continue;
    const h=critHit(dmg);
    e.hp-=h.dmg;e.flash=.15;
    spawnDamageNumber(e.x,e.y,Math.ceil(h.dmg),h.crit?'#ffe17a':'#bff0ff',h.crit);
  }
  blasts.push({x:player.x,y:player.y,radius:reach,life:.32,maxLife:.32,color:'#bff0ff'});
  burst(player.x,player.y,'#bff0ff',14,220,{size:2.4,drag:3});
}
const weaponUpgrades={
  bow:[
    ['bow-split','SPLIT BARREL','Fire one additional bolt.'],
    ['bow-pierce','PIERCING ROUNDS','Bolts pass through one extra enemy.'],
    ['bow-heavy','HEAVY SLUGS','Bolts deal +2 damage.'],
    ['bow-draw','QUICK DRAW','Fire 35% more often.'],
    ['bow-seeker','SEEKER ROUNDS','Bolts fly 40% faster and bank twice as hard toward their target.']
  ],
  laser:[
    ['laser-focus','FOCUSED BEAM','Laser damage +0.5 per tick.'],
    ['laser-pulse','STABLE PULSE','Laser fires 35% more often.'],
    ['laser-reach','LONG LENS','Laser reaches +260 — enough for the screen corners.'],
    ['laser-scorch','SCORCHING TRACE','Hits burn for 1.2 seconds of extra damage.'],
    ['laser-prism','PHOTON SPLIT','Every third beam tick hits a second target.']
  ],
  bomb:[
    ['bomb-radius','WIDE RUPTURE','Blast radius +40.'],
    ['bomb-cluster','CLUSTER CORE','A second blast follows for 55% damage.'],
    ['bomb-fuse','SHORT FUSE','Bombs trigger 35% more often.'],
    ['bomb-impact','IMPACT CHARGE','Bomb damage +2.'],
    ['bomb-pull','GRAVITY WELL','Blasts drag nearby enemies into the center.']
  ],
  aegis:[
    ['aegis-radius','WIDE MANTLE','Field radius +46.'],
    ['aegis-power','OVERCHARGE','Field damage +1.4 per second.'],
    ['aegis-drag','GRAVITIC DRAG','Enemies inside are slowed 55% instead of 35%.'],
    ['aegis-pulse','SHOCK LATTICE','The field discharges a burst every 2.2 seconds.'],
    ['aegis-plating','REACTIVE PLATING','Contact damage taken is reduced by 25%.']
  ],
  arc:[
    ['arc-chain','FORKED PATH','The bolt jumps to one more enemy.'],
    ['arc-power','HIGH VOLTAGE','Arc damage +2.2.'],
    ['arc-rate','CAPACITOR BANK','Arcs fire 30% more often.'],
    ['arc-reach','CONDUCTIVE REACH','Jump distance +130.'],
    ['arc-overload','OVERLOAD','Struck enemies are slowed 40% for 1.2 seconds.']
  ],
  sword:[
    ['sword-reach','EXTENDED EDGE','Blade reach +26.'],
    ['sword-spin','RAPID SPIN','Blade rotates 50% faster.'],
    ['sword-span','LONG SWEEP','Blade reach +35%.'],
    ['sword-sharp','PLASMA HONE','Blade damage +4.'],
    ['sword-guard','KINETIC GUARD','Blade reduces contact damage by 30%.']
  ],
  missile:[
    ['missile-yield','WIDE WARHEAD','Blast radius +60.'],
    ['missile-twin','TWIN RACK','A second warhead launches with every salvo.'],
    ['missile-rate','RAPID LOADER','Reloads 45% faster.'],
    ['missile-heavy','DENSE CORE','Warheads deal +7 damage.'],
    ['missile-cluster','CLUSTER MUNITION','Each blast seeds three delayed sub-detonations around the crater.']
  ],
  phalanx:[
    ['phalanx-force','KINETIC RAM','The wall shoves 70% harder.'],
    ['phalanx-wide','BROAD FACE','The wall is 55% wider.'],
    ['phalanx-power','CHARGED PLATE','The wall deals +7 damage &mdash; over three times what it leaves the rail with.'],
    ['phalanx-rate','FAST CYCLE','Launches 40% more often.'],
    ['phalanx-return','RECALL FIELD','The wall returns to you, sweeping everything a second time.']
  ],
  mine:[
    ['mine-radius','WIDE COLLAPSE','Pull and blast radius +70, and the well holds 4 more enemies at once.'],
    ['mine-power','DENSE CORE','Detonation damage +4.'],
    ['mine-haste','RAPID DEPLOY','Mines deploy 35% more often.'],
    ['mine-multi','TWIN CHARGES','A second mine drops on the next-nearest target each cycle.'],
    ['mine-crush','CRUSH DEPTH','Enemies dragged into the core take 75% more damage, and survivors are hurled outward.']
  ]
};
// ---- skill tree ---------------------------------------------------------
// Meta-progression that decides what a run is even allowed to offer. A weapon or one
// of its upgrades stays out of the level-up draw until it is bought here, so the first
// runs are deliberately thin and every point spent widens the pool permanently.
// Later tiers cost more, which is what keeps deep runs paying off rather than trivial.
const WEAPON_TIER={bow:0,laser:1,sword:1,bomb:2,mine:2,aegis:3,arc:3,missile:3,phalanx:3};
// the second sector's armaments: bought on the same curve, but the tree keeps
// them out of sight until you have flown there
const SECTOR2_WEAPONS=['missile','phalanx'];
const TIER_WEAPON=[0,14,22,30], TIER_ULT=[45,70,95,120];
// a weapon's five upgrades climb in price across the set rather than costing a flat
// rate, so finishing a weapon is a real commitment and the cheap first pick stays
// cheap. Position on the list sets the price; the tier multiplier scales the whole
// curve, so tier 1 runs 6/8/10/14/20 and tier 3 runs 12/16/20/28/40.
const UPGRADE_CURVE=[3,4,5,7,10], TIER_UPGRADE_MULT=[1,2,3,4];
// anything you can take more than once gets dearer each time, scaled to what it
// cost to begin with: a 6 SP node creeps up by 3, a 20 SP node by 6. Enough that
// stacking one line has a price, not so much that the last rank is unreachable.
const costStep=base=>Math.max(3,Math.round(base*.28));
const upgradeCost=(tier,i)=>UPGRADE_CURVE[Math.min(i,UPGRADE_CURVE.length-1)]*TIER_UPGRADE_MULT[tier];
const BOW_NAME='VULCAN CANNON', BOW_COLOR='#55e6ff';
// per-rank costs; the length of the list is how many times a node can be taken
// two stages per line. The first is cheap enough to take early and often; taking
// every rank of it opens a second that moves the number far harder for far more,
// so the tree keeps something worth saving for once the easy ranks run dry.
// `reqMax` means "that node, fully taken" — an ordinary `req` only wants one rank.
const PASSIVES={
  power:{name:'OVERCHARGE',branch:'amp',cost:8,max:3,req:['w:bow'],
    desc:'Every weapon you carry deals 5% more damage, on top of anything else.'},
  powerII:{name:'OVERCHARGE II',branch:'amp',cost:20,max:3,req:['w:bow'],reqMax:['power'],
    desc:'A second amplifier stage: +12% weapon damage a rank, once OVERCHARGE is fully taken.'},
  crit:{name:'CRITICAL SYSTEMS',branch:'amp',cost:26,req:['power'],
    desc:'Direct hits can now critical: a 1% chance to land 1.3x damage. Both numbers can be raised.'},
  critChance:{name:'TARGETING LATTICE',branch:'amp',cost:8,max:5,req:['crit'],
    desc:'Critical chance +2 percentage points.'},
  critChanceII:{name:'TARGETING LATTICE II',branch:'amp',cost:20,max:3,req:['crit'],reqMax:['critChance'],
    desc:'A finer lattice: +5 percentage points of critical chance a rank, once TARGETING LATTICE is fully taken.'},
  critPower:{name:'FRACTURE ROUNDS',branch:'amp',cost:11,max:4,req:['crit'],
    desc:'Critical hits multiply for a further +0.2x.'},
  critPowerII:{name:'FRACTURE ROUNDS II',branch:'amp',cost:20,max:3,req:['crit'],reqMax:['critPower'],
    desc:'Deeper fracturing: +0.5x on every critical a rank, once FRACTURE ROUNDS is fully taken.'},
  dashDrive:{name:'DASH DRIVE',branch:'systems',cost:12,req:['w:bow'],
    desc:'Unlocks the dash on SHIFT: a short burst of speed that also carries you straight through anything that would have hit you.'},
  // two ranks that do different jobs, so the cost jumps rather than creeps: the
  // first makes the dash worth aiming, the second turns it into a way out of a wall
  dashStrike:{name:'SHEAR DRIVE',branch:'systems',cost:26,max:2,step:44,req:['dashDrive'],
    desc:'Dashing shears anything you pass through for a little damage. Take it twice and the dash also shoulders them clear of your path — the second rank is the expensive one.'},
  rate:{name:'CYCLE TUNING',branch:'rate',cost:7,max:4,req:['w:bow'],
    desc:'Every weapon fires 6% faster.'},
  rateII:{name:'CYCLE TUNING II',branch:'rate',cost:20,max:3,req:['w:bow'],reqMax:['rate'],
    desc:'Re-cut timing gear: +14% fire rate a rank, once CYCLE TUNING is fully taken.'},
  speed:{name:'THRUST VECTORING',branch:'speed',cost:6,max:4,req:['w:bow'],
    desc:'Your airframe moves 4% faster.'},
  speedII:{name:'THRUST VECTORING II',branch:'speed',cost:20,max:3,req:['w:bow'],reqMax:['speed'],
    desc:'Overhauled thrust: +9% airframe speed a rank, once THRUST VECTORING is fully taken.'},
  // ---- third stages, opened by reaching the second sector --------------------
  powerIII:{name:'OVERCHARGE III',branch:'amp2',cost:44,max:3,sector:2,req:['w:bow'],reqMax:['powerII'],
    desc:'Drift-grade amplifiers: +22% weapon damage a rank.'},
  critChanceIII:{name:'TARGETING LATTICE III',branch:'amp2',cost:44,max:3,sector:2,req:['crit'],reqMax:['critChanceII'],
    desc:'Drift-grade optics: +9 percentage points of critical chance a rank.'},
  critPowerIII:{name:'FRACTURE ROUNDS III',branch:'amp2',cost:44,max:3,sector:2,req:['crit'],reqMax:['critPowerII'],
    desc:'Drift-grade payloads: +0.9x on every critical a rank.'},
  rateIII:{name:'CYCLE TUNING III',branch:'amp2',cost:44,max:3,sector:2,req:['w:bow'],reqMax:['rateII'],
    desc:'Drift-grade timing: +25% fire rate a rank.'},
  headstart:{name:'FIELD REFIT',branch:'sys2',cost:38,max:3,sector:2,req:['w:bow'],
    desc:'Launch with a refit already installed: one extra level-up choice at the start of every run, per rank.'}
};
// in-run system upgrades. `run` is the level-up card, `each` the pause-menu line,
// `desc` the tree tooltip — one definition so the three can never disagree.
const GLOBALS={
  health:{name:'REINFORCED HULL',cost:8,run:'Maximum health +25 and fully repairs.',each:'Maximum health +25 each',
    desc:'Lets a level-up offer REINFORCED HULL: +25 maximum health and a full repair, every time you take it.'},
  speed:{name:'KINETIC THRUSTERS',cost:8,run:'Movement speed +18%.',each:'Movement speed +18% each',
    desc:'Lets a level-up offer KINETIC THRUSTERS: +18% movement speed, every time you take it.'},
  regen:{name:'NANITE REPAIR',cost:10,run:'Health regeneration +2 per second.',each:'Health regeneration +2/s each',
    desc:'Lets a level-up offer NANITE REPAIR: +2 health regenerated per second, every time you take it.'},
  dash:{name:'SLIPSTREAM COILS',cost:14,req:['dashDrive'],run:'Dash carries you 60% further. Offered once.',each:'Dash carries you 60% further',
    desc:'Lets a level-up offer SLIPSTREAM COILS, which carries your dash 60% further. Offered once per run. Needs DASH DRIVE — there is nothing to extend without it.'},
  // ---- SYSTEMS V2: the same three systems, rebuilt --------------------------
  hull2:{name:'DRIFT PLATING',cost:34,sector:2,branch:'sys2',req:['g:health'],run:'Maximum health +55 and fully repairs.',each:'Maximum health +55 each',
    desc:'Replaces the hull card with a heavier one: +55 maximum health and a full repair, every time you take it.'},
  regen2:{name:'NANITE SURGE',cost:36,sector:2,branch:'sys2',req:['g:regen'],run:'Health regeneration +5 per second.',each:'Health regeneration +5/s each',
    desc:'Replaces the repair card with a faster one: +5 health regenerated per second, every time you take it.'},
  thrust2:{name:'KINETIC OVERDRIVE',cost:34,sector:2,branch:'sys2',req:['g:speed'],run:'Movement speed +30%.',each:'Movement speed +30% each',
    desc:'Replaces the thruster card with a harder one: +30% movement speed, every time you take it.'}
};
const PASSIVE_STEP={power:'+5% damage',powerII:'+12% damage',powerIII:'+22% damage',
  crit:'unlocks critical hits',critChance:'+2% chance',critChanceII:'+5% chance',critChanceIII:'+9% chance',
  critPower:'+0.2x multiplier',critPowerII:'+0.5x multiplier',critPowerIII:'+0.9x multiplier',
  rate:'+6% fire rate',rateII:'+14% fire rate',rateIII:'+25% fire rate',
  speed:'+4% speed',speedII:'+9% speed',headstart:'+1 opening refit',
  dashStrike:'rank 1 cuts, rank 2 shoves clear'};
function buildTree(){
  const nodes=[];
  for(const id of ['bow','laser','sword','bomb','mine','aegis','arc','missile','phalanx']){
    const t=WEAPON_TIER[id], core=id==='bow', v2=SECTOR2_WEAPONS.includes(id);
    const arm=core?'core':v2?'arms2':'arms';
    const wname=core?BOW_NAME:weaponData[id][0], wcol=core?BOW_COLOR:weaponData[id][1];
    nodes.push({id:'w:'+id,name:wname,color:wcol,branch:arm,group:id,head:true,
      cost:exclusiveWeapons[id]?0:TIER_WEAPON[t],req:core?[]:['w:bow'],sector:v2?2:undefined,
      grantedBy:exclusiveWeapons[id]||null,
      desc:core?'The cannon every run starts with. It costs nothing — take it and fly.'
        :exclusiveWeapons[id]?('Comes with '+characters[exclusiveWeapons[id]].name+' — you already have it. Its upgrades are bought below.')
        :('Adds '+wname+' to the level-up draw, so runs can offer it.')});
    weaponUpgrades[id].forEach((u,i)=>
      nodes.push({id:'u:'+id+':'+u[0],name:u[1],color:wcol,branch:arm,group:id,
        cost:upgradeCost(t,i),req:['w:'+id],sector:v2?2:undefined,desc:u[2]}));
    nodes.push({id:'ult:'+id,name:ultimateData[id][0],color:'#ffe17a',branch:arm,group:id,ult:true,
      cost:TIER_ULT[t],req:weaponUpgrades[id].map(u=>'u:'+id+':'+u[0]),sector:v2?2:undefined,desc:ultimateData[id][1]});
  }
  for(const id of Object.keys(PASSIVES))nodes.push(Object.assign({id,group:'passive'},PASSIVES[id]));
  for(const id of Object.keys(GLOBALS))
    nodes.push({id:'g:'+id,name:GLOBALS[id].name,color:'#9cf0bd',branch:GLOBALS[id].branch||'systems',
      group:GLOBALS[id].branch==='sys2'?'system2':'system',sector:GLOBALS[id].sector,
      cost:GLOBALS[id].cost,req:GLOBALS[id].req||['w:bow'],desc:GLOBALS[id].desc});
  for(const n of nodes){n.max=n.max||1;if(n.step===undefined)n.step=n.max>1?costStep(n.cost):0;}
  return nodes;
}
// DEFLECTOR SHIELD and ION ARC come with WARDEN and REVENANT rather than being
// bought: owning the pilot counts as owning the weapon node, which satisfies the
// prerequisite on its upgrades. The upgrades themselves are still paid for.
const grantedBy=id=>id.indexOf('w:')===0?exclusiveWeapons[id.slice(2)]:null;
const nodeGranted=id=>{const owner=grantedBy(id);return !!owner&&unlocked.has(owner);};
// and the whole group stays off the tree until you have the pilot to fly it
// a node can be hidden by needing a pilot you do not own, or a sector you have
// not opened — in both cases the whole group stays off the tree until then
const nodeVisible=n=>{const owner=exclusiveWeapons[n.group];
  return (!owner||unlocked.has(owner))&&(!n.sector||sectorOpen(n.sector));};
const treeRank=id=>nodeGranted(id)?1:(tree[id]||0);
const treeHas=id=>treeRank(id)>0;
// what the next rank costs: the base, plus one step for every rank already held
const nodeCost=n=>n.cost+n.step*treeRank(n.id);
const nextRankCost=n=>n.cost+n.step*(treeRank(n.id)+1);
const nodeAtMax=id=>{const n=TREE_BY_ID[id];return !!n&&treeRank(id)>=n.max;};
// `req` wants one rank; `reqMax` wants every rank, which is what opens a second stage
const nodeReqMet=n=>n.req.every(r=>treeHas(r))&&(!n.reqMax||n.reqMax.every(nodeAtMax));
const nodeMaxed=n=>treeRank(n.id)>=n.max;
const nodeBuyable=n=>!nodeMaxed(n)&&nodeVisible(n)&&nodeReqMet(n)&&skill>=nodeCost(n);
function saveTree(){
  if(devMode)return;                       // dev edits never touch the real profile
  localStorage.setItem('shapeshift_skill',skill);
  localStorage.setItem('shapeshift_tree',JSON.stringify(tree));
}
function buyNode(id){
  const n=TREE_BY_ID[id];
  if(!n||!nodeBuyable(n))return false;
  skill-=nodeCost(n);
  tree[id]=treeRank(id)+1;
  saveTree();
  return true;
}
// clearing this area on HARD is what opens IMPOSSIBLE. Easier settings can
// still be played to 50 and beyond; they just do not count as the proof.
const IMPOSSIBLE_ROOM=FINAL_ROOM;
const IMPOSSIBLE_KEY='hard';
// a run pays out a handful of points, weighted hard toward depth. IMPOSSIBLE pays
// double, which is the only reason to take a setting that can end a run on contact.
// EASY pays none at all: it is there to learn the game on, not to farm the tree from.
const SKILL_RATE={easy:0,medium:1,hard:1,impossible:2};
const skillRate=d=>SKILL_RATE[d]===undefined?1:SKILL_RATE[d];
// what the payout line says under the skill figure
const skillNote=d=>skillRate(d)===0?difficulties[d].label+' &mdash; NO SKILL':
  'AREA '+state.room+(skillRate(d)!==1?' &times;'+skillRate(d):'');
// round the room curve first, then multiply: rounding a doubled figure would pay
// 13 where twice 6 is 12, and "double" has to mean exactly double
const skillBase=room=>room<2?0:Math.max(1,Math.round(Math.pow(room,1.22)/2.6));
const skillReward=(room,difficulty)=>Math.round(skillBase(room)*skillRate(difficulty)*sectorSkill());
const skillOwed=()=>Math.max(0,skillReward(state.room,state.difficulty)-(state.paidSkill||0));
// what the tree is worth to a run, read fresh at reset
const treeDamage=()=>1+.05*treeRank('power')+.12*treeRank('powerII')+.22*treeRank('powerIII');
const treeRate=()=>1+.06*treeRank('rate')+.14*treeRank('rateII')+.25*treeRank('rateIII');
const treeSpeed=()=>1+.04*treeRank('speed')+.09*treeRank('speedII');
// the shear does a flat, deliberately small amount — it is a repositioning tool
// that happens to hurt, not a weapon you can build a run around
const DASH_SHEAR=15, DASH_SHOVE=1250;
const treeDashShear=()=>treeRank('dashStrike')>0?DASH_SHEAR:0;
const treeDashShove=()=>treeRank('dashStrike')>1;
const treeCritChance=()=>treeHas('crit')?.01+.02*treeRank('critChance')+.05*treeRank('critChanceII')+.09*treeRank('critChanceIII'):0;
const treeCritMult=()=>1.3+.2*treeRank('critPower')+.5*treeRank('critPowerII')+.9*treeRank('critPowerIII');
// what the tree is worth right now, as the five numbers a run actually flies on
const treeStats=()=>({damage:treeDamage(),rate:treeRate(),speed:treeSpeed(),
  critChance:treeCritChance(),critMult:treeCritMult()});
const STAT_LABEL={damage:'DAMAGE',rate:'FIRE RATE',speed:'SPEED',critChance:'CRIT CHANCE',critMult:'CRIT DAMAGE'};
const STAT_ORDER=['damage','critMult','critChance','speed','rate'];
// which of those five a node moves, so its card can show the before and after
const NODE_STAT={power:'damage',powerII:'damage',powerIII:'damage',crit:'critChance',
  critChance:'critChance',critChanceII:'critChance',critChanceIII:'critChance',
  critPower:'critMult',critPowerII:'critMult',critPowerIII:'critMult',
  rate:'rate',rateII:'rate',rateIII:'rate',speed:'speed',speedII:'speed'};
const statText=(k,v)=>k==='critChance'?(v*100).toFixed(v>0&&v<.1?1:0)+'%':v.toFixed(2)+'\u00d7';
// a crit rolls per discrete hit. Continuous damage — the blade's edge, the shield's
// field, laser burn — is left alone so a crit always reads as one big number.
function critHit(dmg){
  return (state&&state.critChance>0&&Math.random()<state.critChance)
    ? {dmg:dmg*state.critMult,crit:true} : {dmg,crit:false};
}
const weaponData={laser:['PHOTON LANCE','#c879ff',.55,5],bomb:['PLASMA TORPEDO','#ff965d',3,.4],sword:['ORBITAL BLADE','#ffe17a',4,1],aegis:['DEFLECTOR SHIELD','#7ee0ff',1.5,1],arc:['ION ARC','#c8a2ff',3,1.05],mine:['GRAVITY MINE','#9d6bff',4,.55],
  // SECTOR 02 hardware: one hits like nothing else and reloads like nothing else,
  // the other barely scratches but clears the space around you outright
  missile:['WARHEAD SALVO','#ff7a4d',11,.3],phalanx:['PHALANX WALL','#6ef0c4',3,.75]};
// weapons only a specific character brings; never offered as a normal unlock
const exclusiveWeapons={aegis:'warden',arc:'revenant'};
const ultimateData={
  bow:['STORM VOLLEY','Fires two extra bolts, and every bolt pierces one more enemy.'],
  laser:['PHOTON NOVA','A second beam pulses every 0.4s into the three nearest enemies.'],
  bomb:['VOID SUPERNOVA','A wider secondary blast detonates every 1.6s for double damage.'],
  sword:['CELESTIAL BLADES','Four edges orbit you instead of one, and they spin up sharply whenever something comes close.'],
  aegis:['EVENT HORIZON','The field hauls enemies inward, then detonates before they can touch you — vaporising the weak and hurling the rest back out.'],
  arc:['STORM LATTICE','Every discharge also forks to the two enemies nearest you.'],
  mine:['SINGULARITY COLLAPSE','The wreckage blinks back and collapses twice more, each blink dealing full damage to everything nearby.'],
  missile:['SATURATION SALVO','Every launch becomes a volley of four that walk outward across the target.'],
  phalanx:['BULWARK BREAKER','Two walls launch back to back in opposite directions, and everything they hit is left reeling.']
};
// built here rather than beside buildTree(): it reads weaponData, exclusiveWeapons
// and ultimateData, all of which are declared above this point but below the builder
const TREE_NODES=buildTree();
const TREE_BY_ID={};for(const n of TREE_NODES)TREE_BY_ID[n.id]=n;
function availableWeaponChoices(){
  const choices=[];
  for(const id of Object.keys(weaponUpgrades)){
    const w=state.weapons[id];
    if(!w){
      if(exclusiveWeapons[id])continue;
      if(!treeHas('w:'+id))continue;                       // not bought in the tree, not in the draw
      choices.push({id,kind:'unlock',name:weaponData[id][0],desc:id==='laser'?'Unlocks a steady auto-targeting beam lance.':id==='bomb'?'Unlocks area-damage plasma torpedoes.':id==='sword'?'Unlocks a rotating close-range orbital blade.':id==='missile'?'Unlocks slow-reloading warheads that fly to a target and level everything around it.':id==='phalanx'?'Unlocks a launched wall that shoves everything it meets clear. It barely scratches until you plate it.':'Unlocks thrown mines that crush enemies together before detonating.'});
    }else if(w.taken.length<5){
      for(const u of weaponUpgrades[id])if(!w.taken.includes(u[0])&&treeHas('u:'+id+':'+u[0]))choices.push({id:u[0],kind:'weapon',weapon:id,name:u[1],desc:u[2]});
    }else if(!w.ultimate&&treeHas('ult:'+id)){
      choices.push({id:id+'-ultimate',kind:'ultimate',weapon:id,name:ultimateData[id][0],desc:ultimateData[id][1]});
    }
  }
  return choices;
}
// system upgrades the tree has unlocked and the run can still use
function globalChoices(){
  const out=[];
  for(const id of Object.keys(GLOBALS)){
    if(!treeHas('g:'+id))continue;
    if(id==='dash'&&(state.globals.dash||!state.hasDash))continue;   // one-off, and pointless without the dash
    out.push({id,kind:'global',name:GLOBALS[id].name,desc:GLOBALS[id].run});
  }
  return out;
}
// with nothing unlocked there is nothing a level-up could hand you, so the run
// stops tracking XP entirely and the bar comes off the HUD
const hasDraw=()=>availableWeaponChoices().length>0||globalChoices().length>0;
function shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function levelUp(free){
  if(state.paused||state.upgradeOpen)return;
  // work out the draw before spending anything: a level-up with no cards to show
  // would burn the XP for nothing
  const weaponChoices=availableWeaponChoices(), globals=globalChoices();
  if(!weaponChoices.length&&!globals.length){state.hasDraw=false;if(free)state.freeDraws=0;return;}
  if(free)state.freeDraws--;
  else{state.xp-=state.need;state.need=Math.floor(state.need*1.25);state.level++;}
  state.paused=true;state.upgradeOpen=true;
  sfx('level');burst(player.x,player.y,'#9cf0bd',36,320,{size:3,drag:2.4});blasts.push({x:player.x,y:player.y,radius:200,life:.5,maxLife:.5,color:'#9cf0bd'});
  // a ready ultimate always gets a slot, but never crowds out the whole draw
  const ults=shuffle(weaponChoices.filter(u=>u.kind==='ultimate')).slice(0,2);
  const rest=shuffle(weaponChoices.filter(u=>u.kind!=='ultimate').concat(globals));
  const choices=ults.concat(rest).slice(0,3);
  show('<div class="modal"><div class="eyebrow">'+(free?'FIELD REFIT // PRE-FLIGHT':'REFIT // LEVEL '+state.level)+'</div><h2>Choose an upgrade</h2><p>Each card shows the exact change it will make.</p><div class="cards">'+choices.map((u,i)=>'<div class="card'+(u.kind==='ultimate'?' ultimate':'')+'"><span class="card-key">0'+(i+1)+' // '+(u.kind==='ultimate'?'ULTIMATE':u.kind==='unlock'?'NEW WEAPON':'UPGRADE')+'</span><h3>'+u.name+'</h3><p>'+u.desc+'</p><button data-up="'+u.id+'">INSTALL</button></div>').join('')+'</div></div>');
  document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>upgrade(b.dataset.up));
}
function upgrade(id){
  if(!state.upgradeOpen)return;
  state.upgradeOpen=false;
  if(GLOBALS[id]){
    if(id==='dash'&&state.globals.dash){state.paused=false;hide();return;} // one-time only
    state.globals[id]=(state.globals[id]||0)+1;
    if(id==='health'){player.maxHp+=25;player.hp=player.maxHp;}
    if(id==='hull2'){player.maxHp+=55;player.hp=player.maxHp;}
    if(id==='speed')player.speed*=1.18;
    if(id==='thrust2')player.speed*=1.3;
    if(id==='regen')player.regen+=2;
    if(id==='regen2')player.regen+=5;
    if(id==='dash'){sfx('pick');state.dashPower=1.6;state.dashCooldown=0;burst(player.x,player.y,pilotColor(),34,300,{size:3,drag:2.6});}
  }
  else if(weaponData[id]){state.weapons[id]=scaleWeapon(newWeapon(id));}
  else if(id.endsWith('-ultimate')){
    const weapon=id.replace('-ultimate',''),w=state.weapons[weapon];
    if(w&&!w.ultimate){
      w.ultimate=true;w.level=6;w.ultimateIn=0;sfx('ult');hitStop(.14);
      if(weapon==='aegis'){w.pull=true;w.pulse=true;w.pulseIn=Math.min(w.pulseIn||2.2,2.2);}
      state.flash=Math.max(state.flash,.7);shake(22);
      burst(player.x,player.y,w.color,54,380,{size:3.6,drag:2.2});
      burst(player.x,player.y,'#ffffff',22,240,{size:2.6,drag:3});
      shockwave(player.x,player.y,w.color,1500);
    }
  }
  else {const weapon=id.split('-')[0],w=state.weapons[weapon],u=weaponUpgrades[weapon]&&weaponUpgrades[weapon].find(x=>x[0]===id);if(w&&u&&!w.taken.includes(id)){w.taken.push(id);w.upgrades++;w.level=w.upgrades;applyWeaponUpgrade(weapon,id);}}
  state.hasDraw=hasDraw();      // taking one can empty the pool
  state.paused=false;hide();
}
function applyWeaponUpgrade(weapon,id){const w=state.weapons[weapon];if(weapon==='bow'){if(id==='bow-split')w.shots=(w.shots||1)+1;if(id==='bow-pierce')w.pierce=(w.pierce||0)+1;if(id==='bow-heavy')w.damage+=2;if(id==='bow-draw')w.rate*=1.35;if(id==='bow-seeker'){w.projectileSpeed=(w.projectileSpeed||540)*1.4;w.homing=true;}}if(weapon==='laser'){if(id==='laser-focus')w.damage+=.5;if(id==='laser-pulse')w.rate*=1.35;if(id==='laser-reach')w.range=(w.range||640)+260;if(id==='laser-scorch')w.linger=1.2;if(id==='laser-prism')w.split=true;}if(weapon==='bomb'){if(id==='bomb-radius')w.radius=(w.radius||135)+40;if(id==='bomb-cluster')w.double=true;if(id==='bomb-fuse')w.rate*=1.35;if(id==='bomb-impact')w.damage+=2;if(id==='bomb-pull')w.pull=true;}if(weapon==='aegis'){if(id==='aegis-radius')w.radius=(w.radius||125)+46;if(id==='aegis-power')w.damage+=1.4;if(id==='aegis-drag')w.drag=.55;if(id==='aegis-pulse'){w.pulse=true;w.pulseIn=2.2;}if(id==='aegis-plating')w.plating=true;}if(weapon==='arc'){if(id==='arc-chain')w.chain=(w.chain||1)+1;if(id==='arc-power')w.damage+=2.2;if(id==='arc-rate')w.rate*=1.3;if(id==='arc-reach')w.reach=(w.reach||320)+130;if(id==='arc-overload')w.overload=true;}if(weapon==='sword'){if(id==='sword-reach')w.reach=(w.reach||78)+26;if(id==='sword-spin')w.spin=(w.spin||4)*1.5;if(id==='sword-span')w.reach=(w.reach||78)*1.35;if(id==='sword-sharp')w.damage+=4;if(id==='sword-guard')w.guard=true;}if(weapon==='missile'){if(id==='missile-yield')w.radius=(w.radius||150)+60;if(id==='missile-twin')w.twin=true;if(id==='missile-rate')w.rate*=1.45;if(id==='missile-heavy')w.damage+=7;if(id==='missile-cluster')w.cluster=true;}if(weapon==='phalanx'){if(id==='phalanx-force')w.push=(w.push||1)*1.7;if(id==='phalanx-wide')w.span=(w.span||200)*1.55;if(id==='phalanx-power')w.damage+=7;if(id==='phalanx-rate')w.rate*=1.4;if(id==='phalanx-return')w.recall=true;}if(weapon==='mine'){if(id==='mine-radius'){w.radius=(w.radius||160)+70;w.cap=(w.cap||MINE_CAP)+4;}if(id==='mine-power')w.damage+=4;if(id==='mine-haste')w.rate*=1.35;if(id==='mine-multi')w.multi=true;if(id==='mine-crush')w.crush=true;}
}
const globalInfo={};
for(const id of Object.keys(GLOBALS))globalInfo[id]=[GLOBALS[id].name,GLOBALS[id].each];
const relicInfo={};
for(const id of RELIC_IDS)relicInfo[id]=[RELICS[id].name,RELICS[id].line];
// the cloak is the one relic you have to press something for, so its line is
// resolved here rather than stored — it follows whichever controls are live
const relicLine=k=>RELICS[k]?relicText(RELICS[k].line):'';
function loadoutMarkup(){
  const weapons=Object.keys(weaponUpgrades).filter(id=>state.weapons[id]||!exclusiveWeapons[id]).map(id=>{
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
    +state.relicsTaken.map(k=>'<li class="on relic"><b>'+relicInfo[k][0]+'</b><span>'+relicLine(k)+'</span></li>').join('');
  const stats='<div class="lo-stats"><span>AREA <b>'+state.room+'</b></span><span>LEVEL <b>'+state.level+'</b></span><span>KILLS <b>'+state.kills+'</b></span><span>HULL <b>'+Math.ceil(player.hp)+'/'+player.maxHp+'</b></span><span>SPEED <b>'+Math.round(player.speed)+'</b></span><span>REGEN <b>'+player.regen.toFixed(0)+'/s</b></span></div>';
  return '<div class="modal wide"><div class="eyebrow">SYSTEM PAUSED</div><h2>Loadout</h2>'+stats
    +'<div class="loadout">'+weapons+'</div>'
    +(extras?'<div class="lo-extras"><span class="lo-title">SYSTEMS &amp; RELICS</span><ul class="lo-list">'+extras+'</ul></div>':'')
    +(devMode
      ? '<div class="dev-row"><span>DEV &middot; JUMP TO AREA</span>'
        +'<input id="devArea" type="number" min="1" max="'+FINAL_ROOM+'" value="'+state.room+'">'
        +'<button id="devJump">JUMP</button>'
        +'<span class="dev-quick">'+[10,20,30,40,FINAL_ROOM].map(r=>'<button data-area="'+r+'">'+r+'</button>').join('')+'</span>'
        +'<em>the area is rebuilt from scratch &mdash; your loadout, level and hull come with you</em></div>'
        +'<div class="dev-row"><span>DEV &middot; FIELD REFITS</span>'
        +'<button data-refit="1">+1</button><button data-refit="5">+5</button><button data-refit="0">CLEAR</button>'
        +'<span class="dev-count">'+(state.freeDraws||0)+' PENDING</span>'
        +'<em>'+(state.hasDraw
          ? 'free level-up draws, the same ones FIELD REFIT pays for &mdash; resume and they open one after another'
          : 'the draw pool is empty, so a refit has nothing to offer &mdash; install more in the bay first')+'</em></div>'
      : '')
    +(confirmingEnd
      ? '<div class="reset-row confirming"><span>'+(creditsOwed()?'Leave the run here and bank '+creditsOwed()+' credits?':'Leave the run here? Nothing new to bank yet.')+' The run is saved and you can continue it from the main menu.</span><button id="endNo">KEEP PLAYING</button><button id="endYes" class="danger">LEAVE RUN</button></div>'
      : '<div class="reset-row"><span>'+(creditsOwed()?'LEAVING NOW BANKS <b>'+creditsOwed()+'</b> CREDITS':(state.room<CREDIT_MIN_ROOM?'NO CREDITS UNTIL AREA <b>'+CREDIT_MIN_ROOM+'</b> &mdash; YOU ARE ON <b>'+state.room+'</b>':'NOTHING NEW TO BANK YET'))+'</span><button id="endRun">LEAVE RUN</button></div>')
    +'<button class="continue" id="resume">RESUME</button></div>';
}
// pausing is allowed at the portal (the natural moment to review a build), but not
// mid-transition or on top of a choice that is still owed an answer
let confirmingEnd=false;
// leaving from the pause menu keeps the run alive: you are paid for the ground
// you covered, and can pick it up again later
function bankAndPark(){
  recordRoom(state.room);
  const owed=Math.max(0,runReward()-(state.paidCredits||0));
  const spOwed=skillOwed();
  state.paidCredits=runReward();
  state.paidSkill=skillReward(state.room,state.difficulty);
  points+=owed;skill+=spOwed;saveProfile();saveTree();
  storeRun();
  const c=characters[state.character]||characters[STARTER];
  state.paused=true;
  show('<div class="modal"><div class="eyebrow">RUN PARKED</div><h2>Progress saved</h2>'
    +'<p>Area '+state.room+' &bull; '+state.kills+' hostiles cleared &bull; flying '+c.name+'</p>'
    +'<div class="payout"><span>CREDITS BANKED <b>+'+owed+'</b></span><span>SKILL POINTS <b>+'+spOwed+'</b></span><span>BALANCE <b>'+points+'</b> &middot; <b>'+skill+' SP</b></span></div>'
    +'<p class="payout-note">Continue from the main menu whenever you like. Further credits are only paid for new ground.</p>'
    +'<button class="continue" id="parkResume">BACK TO THE RUN</button>'
    +'<button class="continue ghost" id="parkRoster">HANGAR</button>'
    +'<button class="continue ghost" id="parkHome">MAIN MENU</button>'
  +'</div>');
  $('#parkResume').onclick=()=>{state.paused=false;hide();};
  $('#parkRoster').onclick=showRoster;
  $('#parkHome').onclick=showHome;
}
function pause(){
  if(!state||state.over||state.victorySequence||state.upgradeOpen||state.relicOpen)return;
  state.paused=!state.paused;
  confirmingEnd=false;
  if(state.paused)openPauseMenu(); else hide();
}
function openPauseMenu(){
  show(loadoutMarkup());
  $('#resume').onclick=pause;
  const end=$('#endRun'),no=$('#endNo'),yes=$('#endYes');
  if(end)end.onclick=()=>{confirmingEnd=true;openPauseMenu();};
  if(no)no.onclick=()=>{confirmingEnd=false;openPauseMenu();};
  if(yes)yes.onclick=()=>{confirmingEnd=false;bankAndPark();};
  const jump=$('#devJump'),area=$('#devArea');
  if(jump)jump.onclick=()=>devJumpToArea(area?+area.value:state.room);
  if(area)area.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();devJumpToArea(+area.value);}};
  document.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>devJumpToArea(+b.dataset.area));
  document.querySelectorAll('[data-refit]').forEach(b=>b.onclick=()=>devGrantRefits(+b.dataset.refit));
}
function gameOver(){
  setInRun(false);
  if(state.over)return;
  state.over=true;
  clearRun();                      // a death cannot be continued
  recordRoom(state.room);
  const earned=Math.max(0,runReward()-(state.paidCredits||0)), c=characters[state.character]||characters[STARTER];
  const spEarned=skillOwed();
  state.paidSkill=skillReward(state.room,state.difficulty);
  points+=earned;skill+=spEarned;saveProfile();saveTree();
  const newlyAffordable=Object.keys(characters).filter(id=>!unlocked.has(id)&&points>=characters[id].cost&&points-earned<characters[id].cost);
  state.paused=true;
  show('<div class="modal"><div class="eyebrow">SIGNAL LOST</div><h2>Run terminated</h2>'
    +'<p>Area '+state.room+' &bull; '+state.kills+' hostiles cleared &bull; flying '+c.name+'</p>'
    +'<div class="payout"><span>CREDITS EARNED <b>+'+earned+'</b> <em>&times;'+creditRate(state.difficulty)+' '+difficulties[state.difficulty].label+'</em></span><span>SKILL POINTS <b>+'+spEarned+'</b> <em>'+skillNote(state.difficulty)+'</em></span><span>BALANCE <b>'+points+'</b> &middot; <b>'+skill+' SP</b></span><span>BEST AREA <b>'+highscore+'</b></span></div>'
    +(earned?(newlyAffordable.length?'<p class="payout-note">You can now afford '+newlyAffordable.map(id=>characters[id].name).join(', ')+'.</p>':''):'<p class="payout-note warn">Runs only start paying once you get past area '+(CREDIT_MIN_ROOM-1)+'.</p>')
    +'<button class="continue" id="restart">REBOOT RUN</button>'
    +'<button class="continue ghost" id="toRoster">HANGAR</button>'
    +'<button class="continue ghost" id="toStart">MAIN MENU</button>'
  +'</div>');
  $('#restart').onclick=()=>reset(state.difficulty);
  $('#toRoster').onclick=showRoster;
  $('#toStart').onclick=showHome;
}
function show(markup){ui.overlay.innerHTML=markup;ui.overlay.classList.remove('hidden');}function hide(){ui.overlay.classList.add('hidden');ui.overlay.innerHTML='';}
function hud(){ui.hp.style.width=player.hp/player.maxHp*100+'%';ui.hpText.textContent=Math.ceil(player.hp)+' / '+player.maxHp;if(ui.xpHud)ui.xpHud.style.display=state.hasDraw?'':'none';ui.xp.style.width=Math.min(100,state.xp/state.need*100)+'%';ui.xpText.textContent=Math.floor(state.xp)+' / '+state.need+' XP';ui.level.textContent='LV '+state.level;ui.kills.textContent=state.kills;paintBest();if(ui.arena)ui.arena.innerHTML='AREA '+state.room+' <span>&bull;</span> BEST '+highscore;ui.timer.textContent=new Date(state.time*1000).toISOString().slice(14,19);ui.weapons.innerHTML=Object.values(state.weapons).map(w=>'<span class="weapon-item'+(w.ultimate?' ult':'')+'"><i class="weapon-dot" style="background:'+w.color+'"></i>'+w.name+' <small>'+(w.ultimate?'MAX':'★'+w.taken.length+(w.taken.length>=5?' ▲':''))+'</small></span>').join('');paintAbilities();}
// every line of on-screen instruction reads from these, so the manual, the
// difficulty screen and the HUD can never disagree about what the controls are
const ctrlMove=()=>touchMode?'drag the left of the arena to fly':'WASD or arrows to move';
const ctrlDash=()=>touchMode?'tap DASH':'SHIFT to dash';
const ctrlWave=()=>touchMode?'tap WAVE':'Q for a shockwave';
const ctrlPhase=()=>touchMode?'Tap PHASE':'Press E';
const DASH_NODE_DESC={
  key:'Unlocks the dash on SHIFT: a short burst of speed that also carries you straight through anything that would have hit you.',
  touch:'Unlocks the DASH pad: a short burst of speed that also carries you straight through anything that would have hit you.'};
function paintControlHints(){
  document.body.classList.toggle('touch',touchMode);
  const hint=document.querySelector('.move-hint');
  if(hint)hint.innerHTML=touchMode?'DRAG LEFT <span>FLY</span>':'WASD / ARROWS <span>MOVE</span>';
  const caps=touchMode?{dashRow:'PAD',phaseRow:'PAD',pulseRow:'PAD'}:{dashRow:'SHIFT',phaseRow:'E',pulseRow:'Q'};
  for(const id in caps){const el=document.querySelector('#'+id+' small');if(el)el.textContent=caps[id];}
  // the keyboard shortcut in a tooltip is a lie on a device with no keyboard
  const tip=(sel,txt)=>{const el=document.querySelector(sel);if(el)el.title=txt;};
  tip('#soundBtn',touchMode?'Mute':'Mute (M)');
  tip('#fsBtn',touchMode?'Fullscreen':'Fullscreen (F)');
  tip('#pauseBtn',touchMode?'Pause':'Pause (Space)');
  const node=TREE_BY_ID&&TREE_BY_ID.dashDrive;
  if(node)node.desc=touchMode?DASH_NODE_DESC.touch:DASH_NODE_DESC.key;
}
function paintAbilities(){
  const dash=ui.dashRow, text=ui.dashText, phase=ui.phaseRow, ptext=ui.phaseText;
  if(dash&&text){
    let cls='ability'+(state.globals.dash?' boosted':'');
    if(!state.hasDash){text.textContent='LOCKED';cls+=' locked';}
    else if(state.dashTime>0){text.textContent='DASHING';cls+=' active';}
    else if(state.dashCooldown>0){text.textContent=state.dashCooldown.toFixed(1)+'s';cls+=' cooldown';}
    else {text.textContent='READY';cls+=' ready';}
    dash.className=cls;
  }
  const wave=ui.pulseRow, wtext=ui.pulseText;
  if(wave&&wtext){
    let cls='ability';
    if(!state.hasPulse){wtext.textContent='LOCKED';cls+=' locked';}
    else if(state.pulseCooldown>0){wtext.textContent=state.pulseCooldown.toFixed(1)+'s';cls+=' cooldown';}
    else {wtext.textContent='READY';cls+=' ready';}
    wave.className=cls;
  }
  if(phase&&ptext){
    let cls='ability';
    if(!state.hasCloak){ptext.textContent='LOCKED';cls+=' locked';}
    else if(state.cloakTime>0){ptext.textContent=state.cloakTime.toFixed(1)+'s';cls+=' active';}
    else if(state.cloakCooldown>0){ptext.textContent=state.cloakCooldown.toFixed(1)+'s';cls+=' cooldown';}
    else {ptext.textContent='READY';cls+=' ready';}
    phase.className=cls;
  }
}
function poly(x,y,r,n,rot){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function updateDamageNumbers(dt){for(const d of damageNumbers){d.y-=40*dt;d.life-=dt;}damageNumbers=damageNumbers.filter(d=>d.life>0);}
function drawDamageNumbers(){
  ctx.save();ctx.textAlign='center';
  for(const d of damageNumbers){
    const k=clamp(d.life/.6,0,1);
    ctx.globalAlpha=Math.min(1,k*1.7);
    ctx.font="bold "+((d.crit?30:15)+(1-k)*4).toFixed(1)+"px 'DM Mono', monospace";
    const label=d.crit?d.n+'!':d.n;
    ctx.fillStyle='rgba(6,10,19,.55)';ctx.fillText(label,d.x+1.5,d.y+1.5);
    if(d.crit){ctx.shadowColor='#ffb300';ctx.shadowBlur=16;}
    ctx.fillStyle=d.crit?'#ffd400':d.color;ctx.fillText(label,d.x,d.y);
    ctx.shadowBlur=0;
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
  const total=b.total||BANNER_TIME;
  const t=total-b.life;
  const fade=b.life>.8?1:b.life/.8;
  const intro=Math.min(1,t/.28);
  const step=Math.floor(t*20);
  const heat=.2+(1-intro)*1.7+(1-fade)*1.5+(grand(step*3.7)>.87?1:0);
  const LW=W, LH=220, MAIN_Y=58;
  if(!bannerLayer){bannerLayer=document.createElement('canvas');bannerLayer.width=LW;bannerLayer.height=LH;}
  const g=bannerLayer.getContext('2d');
  g.clearRect(0,0,LW,LH);
  g.textAlign='center';g.textBaseline='middle';
  const cx=LW/2;
  const jx=(grand(step)*2-1)*11*heat, jy=(grand(step+91)*2-1)*3.5*heat;
  // one glitched line: pink/cyan channel split under a bright core
  const line=(text,y,size,tint,split,alpha)=>{
    g.font="700 "+size+"px 'Space Grotesk',sans-serif";
    g.globalCompositeOperation='lighter';
    g.globalAlpha=.85*alpha;
    g.fillStyle='#ff557d';g.fillText(text,cx+jx*split,y+jy*split);
    g.fillStyle=tint;g.fillText(text,cx-jx*split,y-jy*split);
    g.globalCompositeOperation='source-over';
    g.globalAlpha=(grand(step+7)>.94?.3:1)*alpha;
    g.shadowColor=tint;g.shadowBlur=26*split;
    g.fillStyle='#f2f7ff';g.fillText(text,cx,y);
    g.shadowBlur=0;g.globalAlpha=1;
  };
  g.letterSpacing='0.16em';
  line('AREA '+String(b.room).padStart(2,'0'),MAIN_Y,44,'#55e6ff',1,1);
  g.letterSpacing='0px';
  // a rule that opens outward under the number: the one bit of motion that says
  // a new room just latched
  const ruleW=(b.boss?300:210)*(.25+.75*Math.min(1,t/.45));
  g.globalAlpha=.85*(b.boss?1:.7);
  g.strokeStyle='#55e6ff';g.lineWidth=1.5;
  g.beginPath();g.moveTo(cx-ruleW/2,MAIN_Y+30);g.lineTo(cx+ruleW/2,MAIN_Y+30);g.stroke();
  g.globalAlpha=1;
  if(b.boss){
    // the boss announces itself under the room number, in its own colour
    const reveal=clamp((t-.22)/.3,0,1);
    if(reveal>0){
      line(b.boss,MAIN_Y+62,30,b.bossColor||'#ff4f9a',.7,reveal);
      g.globalAlpha=reveal*.7;
      g.font="500 12px 'DM Mono', monospace";
      g.fillStyle=b.bossColor||'#ff4f9a';
      g.fillText(b.bossNote||'',cx,MAIN_Y+92);
      g.globalAlpha=1;
    }
  }
  g.globalCompositeOperation='destination-out';
  g.fillStyle='rgba(0,0,0,.34)';
  for(let y=0;y<LH;y+=3)g.fillRect(0,y,LW,1);
  g.globalCompositeOperation='source-over';
  const top=Math.round(H*.165-MAIN_Y), band=5;
  ctx.save();
  ctx.globalAlpha=fade;
  for(let y=0;y<LH;y+=band){
    const i=y/band, r=grand(step*17+i*3.1);
    if(r>.985&&heat>.6)continue;
    const off=r>.86?Math.round((grand(step*5+i*7.7)*2-1)*32*heat):0;
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
// the stick and the ability pads are drawn in screen space, over everything the
// room draws but under the death fade and the banners
function drawTouchControls(){
  if(!touchMode)return;
  if(!touchLive()){if(stick.active||stick.id!==null)releaseTouch();return;}
  const s=tScale(), r=STICK_R*s;
  ctx.save();
  if(stick.active){
    const col=pilotColor();
    ctx.lineWidth=2.4*s;ctx.strokeStyle=rgba(col,.3);
    ctx.beginPath();ctx.arc(stick.ox,stick.oy,r,0,7);ctx.stroke();
    ctx.lineWidth=1.4*s;ctx.strokeStyle=rgba(col,.14);
    ctx.beginPath();ctx.arc(stick.ox,stick.oy,r*.42,0,7);ctx.stroke();
    ctx.lineWidth=2*s;ctx.strokeStyle=rgba(col,.26);
    ctx.beginPath();ctx.moveTo(stick.ox,stick.oy);ctx.lineTo(stick.x,stick.y);ctx.stroke();
    ctx.shadowColor=col;ctx.shadowBlur=18*s;
    ctx.fillStyle=rgba(col,.42);
    ctx.beginPath();ctx.arc(stick.x,stick.y,r*.34,0,7);ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,.72)';
    ctx.beginPath();ctx.arc(stick.x,stick.y,r*.15,0,7);ctx.fill();
  }else{
    // idle: a dim home ring in the corner it is dragged from, so the control is
    // discoverable without a finger already on the glass
    const hx=TOUCH_EDGE*s+r, hy=H-TOUCH_EDGE*s-r;
    ctx.setLineDash([6*s,7*s]);
    ctx.lineWidth=1.6*s;ctx.strokeStyle='rgba(150,190,240,.15)';
    ctx.beginPath();ctx.arc(hx,hy,r*.8,0,7);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(160,200,245,.28)';
    ctx.font='500 '+(11*s)+"px 'DM Mono', monospace";
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('DRAG TO FLY',hx,hy);
  }
  ctx.restore();
  for(const b of touchButtons())drawTouchPad(b,s);
}
function drawTouchPad(b,s){
  const st=abilityState(b.id), flash=btnFlash[b.id]||0;
  let held=false;for(const k in touchPress)if(touchPress[k]===b.id)held=true;
  ctx.save();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=st.on?rgba(b.color,.1+flash*.5+(held?.12:0)):'rgba(14,20,32,.42)';
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();
  ctx.lineWidth=2*s;
  ctx.strokeStyle=st.on?rgba(b.color,st.cd>0?.3:.7):'rgba(120,140,175,.26)';
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.stroke();
  if(st.on&&st.cd>0){
    // the ring fills back round as the cooldown runs out
    const done=clamp(1-st.cd/(st.max||1),0,1);
    ctx.strokeStyle=rgba(b.color,.85);ctx.lineWidth=3.4*s;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,-Math.PI/2,-Math.PI/2+done*Math.PI*2);ctx.stroke();
  }else if(st.on){
    ctx.shadowColor=b.color;ctx.shadowBlur=(st.live?26:13)*s;
    ctx.strokeStyle=rgba(b.color,.8);ctx.lineWidth=2.4*s;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.stroke();
    ctx.shadowBlur=0;
  }
  ctx.fillStyle=st.on?rgba(b.color,1):'rgba(150,168,196,.5)';
  ctx.font='700 '+(b.r*.3)+"px 'Space Grotesk', sans-serif";
  ctx.fillText(b.label,b.x,b.y-b.r*.12);
  ctx.font='500 '+(b.r*.21)+"px 'DM Mono', monospace";
  ctx.fillStyle=st.on?'rgba(226,240,255,.7)':'rgba(130,148,178,.45)';
  ctx.fillText(!st.on?'LOCKED':st.live?'ACTIVE':st.cd>0?st.cd.toFixed(1)+'s':'READY',b.x,b.y+b.r*.36);
  ctx.restore();
}
function draw(){
  camera();
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#060a14';ctx.fillRect(0,0,W,H);
  ctx.save();
  if(state.shake>0)ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));
  if(state.cameraZoom!==1||state.cameraRot){
    // zoom about where the focus point currently sits on screen
    const zx=state.zoomCenterX-camX, zy=state.zoomCenterY-camY;
    ctx.translate(zx,zy);
    ctx.rotate(state.cameraRot);
    ctx.scale(state.cameraZoom,state.cameraZoom);
    ctx.translate(-zx,-zy);
  }
  ctx.translate(-camX,-camY);
  drawBackground();
  drawStrikes();drawBeams();drawStars();drawEnemies();drawBossArt();drawProjectiles();drawRockets();drawPhalanx();drawRings();drawMines();drawWells();drawPulses();drawBlasts();drawParticles();drawEcho();drawPortal();drawDashFx();drawPlayer();drawWeaponEffects();drawDamageNumbers();
  ctx.restore();
  drawOffscreenMarkers();
  drawVignette();
  if(state.hurtFlash>0){
    const g=ctx.createRadialGradient(W/2,H/2,H*.26,W/2,H/2,H*.86);
    g.addColorStop(0,'rgba(255,60,110,0)');
    g.addColorStop(1,'rgba(255,60,110,'+(.6*clamp(state.hurtFlash,0,1))+')');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  drawLowHealthBorder();
  drawTouchControls();
  if(state.screenAlpha>0){ctx.fillStyle='rgba(0,0,0,'+state.screenAlpha+')';ctx.fillRect(0,0,W,H);}
  drawVictorySequence();drawRoomBanner();
}
// the room is larger than the screen, so anything important that is off-view
// gets a marker pinned to the edge pointing at it
function edgeMarker(wx,wy,color,size,label,bright){
  const sx=wx-camX, sy=wy-camY, m=bright?64:52;
  if(sx>m&&sx<W-m&&sy>m&&sy<H-m)return false;
  const ix=clamp(sx,m,W-m), iy=clamp(sy,m,H-m);
  // aim from the marker's own position at the target, so it points AT the portal
  // rather than merely in its general direction from the screen centre
  let dx=sx-ix, dy=sy-iy;
  if(Math.abs(dx)<.001&&Math.abs(dy)<.001){dx=sx-W/2;dy=sy-H/2;}
  const a=Math.atan2(dy,dx);
  ctx.save();
  ctx.translate(ix,iy);
  ctx.globalCompositeOperation='lighter';
  if(bright){
    const g=ctx.createRadialGradient(0,0,0,0,0,size*2.6);
    g.addColorStop(0,rgba(color,.55));
    g.addColorStop(.5,rgba(color,.2));
    g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,size*2.6,0,7);ctx.fill();
  }
  ctx.rotate(a);
  ctx.globalAlpha=1;
  ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=bright?28:12;
  ctx.beginPath();
  ctx.moveTo(size,0);ctx.lineTo(-size*.72,size*.74);ctx.lineTo(-size*.24,0);ctx.lineTo(-size*.72,-size*.74);
  ctx.closePath();ctx.fill();
  if(bright){
    ctx.shadowBlur=0;
    ctx.fillStyle='#ffffff';
    ctx.beginPath();
    ctx.moveTo(size*.55,0);ctx.lineTo(-size*.3,size*.36);ctx.lineTo(-size*.06,0);ctx.lineTo(-size*.3,-size*.36);
    ctx.closePath();ctx.fill();
  }
  ctx.restore();
  if(label){
    // sit the label behind the arrow so the point stays clean
    const lx=clamp(ix-Math.cos(a)*(size+26),46,W-46), ly=clamp(iy-Math.sin(a)*(size+26),22,H-22);
    ctx.save();
    ctx.font="bold 13px 'DM Mono', monospace";ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.globalAlpha=.85;ctx.fillStyle='rgba(6,10,19,.75)';
    ctx.fillText(label,lx+1.5,ly+1.5);
    ctx.globalAlpha=1;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;
    ctx.fillText(label,lx,ly);
    ctx.restore();
  }
  return true;
}
function drawOffscreenMarkers(){
  if(state.victorySequence)return;
  if(state.victoryPortal){
    const p=state.victoryPortal;
    const d=Math.round(dist(player,p));
    const pulse=21+Math.sin(state.time*6)*3;
    edgeMarker(p.x,p.y,'#9df3ff',pulse,'EXIT '+d,true);
  }
  // only when the room is nearly clear, so you are never left hunting a last straggler
  if(state.active&&enemies.length&&enemies.length<=3&&state.left===0)
    for(const e of enemies)edgeMarker(e.x,e.y,types[e.type].color,9,null);
}
let starLayers=null,vignette=null,skySector=null;
// three depth layers of starlight drifting slower than the world scrolls beneath them
function makeStarLayer(n,rMin,rMax,color){
  return {color,stars:Array.from({length:n},()=>({x:Math.random()*RW,y:Math.random()*RH,r:rMin+Math.random()*(rMax-rMin),p:Math.random()*7,s:.15+Math.random()*.5}))};
}
function drawStarLayer(layer,pf){
  ctx.save();
  ctx.translate(camX*(1-pf),camY*(1-pf));   // only pf of the camera's motion reaches this layer
  ctx.fillStyle=layer.color;
  for(const s of layer.stars){
    ctx.globalAlpha=.25+Math.abs(Math.sin(state.time*s.s+s.p))*.55;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill();
  }
  ctx.restore();
}
// the deck the fight happens on. Without it the room is a void and you cannot
// feel yourself move; the grid gives the eye something to slide past.
const DECK=20;
let deckGrad=null;
function drawDeck(){
  const L=DECK,T=DECK,R=RW-DECK,B=RH-DECK;
  if(!deckGrad){
    const d=sector().sky.deck;
    deckGrad=ctx.createRadialGradient(RW/2,RH/2,120,RW/2,RH/2,RW*.62);
    deckGrad.addColorStop(0,d[0]);
    deckGrad.addColorStop(.55,d[1]);
    deckGrad.addColorStop(1,d[2]);
  }
  ctx.save();
  ctx.fillStyle=deckGrad;ctx.fillRect(L,T,R-L,B-T);
  ctx.restore();
}
// the wall reads as a lit containment edge rather than a hairline rectangle
function drawWalls(){
  const L=DECK,T=DECK,R=RW-DECK,B=RH-DECK,fade=120,c=64;
  const sky=sector().sky;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  // each band starts at its own wall and fades inward
  const band=(x,y,w,h,gx0,gy0,gx1,gy1)=>{
    const g=ctx.createLinearGradient(gx0,gy0,gx1,gy1);
    g.addColorStop(0,sky.band+'.08)');
    g.addColorStop(1,sky.band+'0)');
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  };
  band(L,T,R-L,fade, L,T, L,T+fade);
  band(L,B-fade,R-L,fade, L,B, L,B-fade);
  band(L,T,fade,B-T, L,T, L+fade,T);
  band(R-fade,T,fade,B-T, R,T, R-fade,T);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle=sky.rim;ctx.lineWidth=1;
  ctx.strokeRect(L,T,R-L,B-T);
  ctx.strokeStyle=sky.edge;ctx.lineWidth=2.5;ctx.globalAlpha=.55;
  ctx.shadowColor=sky.edge;ctx.shadowBlur=10;
  ctx.beginPath();
  ctx.moveTo(L,T+c);ctx.lineTo(L,T);ctx.lineTo(L+c,T);
  ctx.moveTo(R-c,T);ctx.lineTo(R,T);ctx.lineTo(R,T+c);
  ctx.moveTo(R,B-c);ctx.lineTo(R,B);ctx.lineTo(R-c,B);
  ctx.moveTo(L+c,B);ctx.lineTo(L,B);ctx.lineTo(L,B-c);
  ctx.stroke();
  ctx.restore();
}
// the palette is cached per sector: rebuilding a 300-star field every frame is
// wasted work, but it has to be thrown away the moment the sector changes
function skyFor(){
  const sec=sector();
  if(skySector!==sec.id){
    skySector=sec.id;
    starLayers=[makeStarLayer(160,.5,1,sec.sky.stars[0]),
                makeStarLayer(100,.8,1.6,sec.sky.stars[1]),
                makeStarLayer(sec.id===1?55:74,1.2,2.3,sec.sky.stars[2])];
    deckGrad=null;
  }
  return sec;
}
function drawBackground(){
  const sec=skyFor();
  ctx.globalAlpha=1;
  drawStarLayer(starLayers[0],.1);
  drawStarLayer(starLayers[1],.28);
  drawStarLayer(starLayers[2],.52);
  ctx.globalAlpha=1;
  if(sec.sky.haze)drawHaze(sec);
  drawDeck();
  drawWalls();
}
// CRIMSON DRIFT is not empty space: burning bands drift across the lane, slow
// enough to read as scenery and never bright enough to hide a shape
function drawHaze(sec){
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){
    const drift=(state.time*(9+i*4)+i*760)%(RW+900)-450;
    const y=RH*(.16+i*.23)+Math.sin(state.time*.16+i)*70;
    const g=ctx.createRadialGradient(drift,y,0,drift,y,430);
    g.addColorStop(0,rgba(sec.sky.haze,.085));
    g.addColorStop(1,rgba(sec.sky.haze,0));
    ctx.fillStyle=g;ctx.fillRect(drift-430,y-430,860,860);
  }
  ctx.restore();
}
const LOW_HP=.35;   // the border starts creeping in below this share of hull
// a red frame that breathes faster the closer you are to dying, and drains
// away on its own as soon as you heal back up
function drawLowHealthBorder(){
  const k=clamp(state.lowPulse||0,0,1);
  if(k<.01||state.victorySequence)return;
  const pulse=.5+Math.sin(state.time*(4.2+k*7.5))*.5;
  const alpha=(.2+.5*pulse)*k;
  const t=(26+42*k)*(.7+pulse*.3);
  const col=a=>'rgba(255,44,78,'+Math.max(0,a).toFixed(3)+')';
  ctx.save();
  const band=(x,y,w,h,gx0,gy0,gx1,gy1)=>{
    const g=ctx.createLinearGradient(gx0,gy0,gx1,gy1);
    g.addColorStop(0,col(alpha));g.addColorStop(1,col(0));
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  };
  band(0,0,W,t, 0,0,0,t);
  band(0,H-t,W,t, 0,H,0,H-t);
  band(0,0,t,H, 0,0,t,0);
  band(W-t,0,t,H, W,0,W-t,0);
  ctx.globalCompositeOperation='lighter';
  ctx.strokeStyle=col(Math.min(.95,alpha*1.6));
  ctx.lineWidth=2+4*k*pulse;
  ctx.strokeRect(1.5,1.5,W-3,H-3);
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
// blend two hex colours; the enemy health ramp is the only caller so far
function mixHex(a,b,t){
  rgba(a,1);rgba(b,1);
  const A=hexCache[a],B=hexCache[b];t=clamp(t,0,1);
  return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')';
}
// hull silhouettes, nose along +x; each is one closed path so fills, outlines and
// overlays all share it
const HULLS={
  interceptor:[[1.1,0],[-.5,.35],[-.9,.9],[-.7,.15],[-.7,-.15],[-.9,-.9],[-.5,-.35]],
  pod:[[.8,-.5],[1,0],[.8,.5],[-.5,.5],[-.5,.9],[-1,.9],[-1,-.9],[-.5,-.9],[-.5,-.5]],
  cruiser:[[1.1,0],[.5,.6],[-.6,.7],[-1,.35],[-1,-.35],[-.6,-.7],[.5,-.6]],
  hauler:[[.7,-.4],[1,0],[.7,.4],[.2,.5],[.1,.95],[-.9,.95],[-1,.4],[-1,-.4],[-.9,-.95],[.1,-.95],[.2,-.5]],
  gunship:[[1,0],[.4,.3],[.3,1],[-.3,1],[-.4,.3],[-1,.2],[-1,-.2],[-.4,-.3],[-.3,-1],[.3,-1],[.4,-.3]],
  racer:[[1.3,0],[-.2,.45],[-.9,.6],[-.7,0],[-.9,-.6],[-.2,-.45]],
  dreadnought:[[1.1,0],[.7,.55],[.1,.6],[-.1,1],[-.8,1],[-1,.5],[-1,-.5],[-.8,-1],[-.1,-1],[.1,-.6],[.7,-.55]],
  corvette:[[1.1,0],[.3,.4],[-.2,.95],[-.7,.95],[-.5,.4],[-1,.3],[-1,-.3],[-.5,-.4],[-.7,-.95],[-.2,-.95],[.3,-.4]],
  frigate:[[1,0],[.6,.35],[.6,.8],[-.2,.9],[-.6,.55],[-1,.55],[-1,-.55],[-.6,-.55],[-.2,-.9],[.6,-.8],[.6,-.35]],
  barge:[[1,0],[.8,.5],[-.2,.6],[-.4,1],[-1,1],[-.9,.3],[-.9,-.3],[-1,-1],[-.4,-1],[-.2,-.6],[.8,-.5]],
  capital:[[1.2,0],[.6,.45],[.2,.45],[0,1],[-.7,1],[-.9,.5],[-1.1,.5],[-1.1,-.5],[-.9,-.5],[-.7,-1],[0,-1],[.2,-.45],[.6,-.45]]
};
const HULL_OF={square:'pod',triangle:'interceptor',hex:'cruiser',trap:'hauler',bowtie:'gunship',diamond:'racer',pentagon:'dreadnought',prism:'corvette',seeker:'frigate',raker:'barge',
  boss:'capital',sentinel:'capital',lance:'racer',orbiter:'cruiser',beacon:'gunship',hollow:'capital',
  monolith:'barge',shrike:'racer',breacher:'dreadnought',wraith:'corvette',leviathan:'capital',
  picket:'corvette',splitter:'hauler',scorcher:'barge',pyre:'dreadnought'};
function enemyPath(e,sp){
  const pts=HULLS[HULL_OF[e.type]||'pod'];
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){const x=pts[i][0]*e.r,y=pts[i][1]*e.r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.closePath();
}
function drawStars(){
  for(const s of stars){
    const pulse=1+Math.sin(state.time*7+s.spin)*.13, pulled=state.vacuum||dist(s,player)<250;
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
function flameTongue(x,y,a,len,w){
  const tx=x+Math.cos(a)*len, ty=y+Math.sin(a)*len;
  const px=Math.cos(a+Math.PI/2)*w, py=Math.sin(a+Math.PI/2)*w;
  const bx=Math.cos(a)*len*.5, by=Math.sin(a)*len*.5;
  ctx.beginPath();
  ctx.moveTo(x+px,y+py);
  ctx.quadraticCurveTo(x+px*1.6+bx, y+py*1.6+by, tx, ty);
  ctx.quadraticCurveTo(x-px*1.6+bx, y-py*1.6+by, x-px, y-py);
  ctx.closePath();
  ctx.fill();
}
// SCORCHING TRACE: the target is visibly alight for as long as the burn lasts
function drawBurn(e){
  const k=clamp(e.laserLinger/1.2,0,1);
  const step=Math.floor(state.time*15);
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  // heat bloom around the body
  const g=ctx.createRadialGradient(e.x,e.y,e.r*.25,e.x,e.y,e.r+18);
  g.addColorStop(0,rgba('#c879ff',.4*k));
  g.addColorStop(.6,rgba('#8c3dff',.18*k));
  g.addColorStop(1,rgba('#8c3dff',0));
  ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(e.x,e.y,e.r+18,0,7);ctx.fill();
  // tongues licking upward off the hull, flickering frame to frame
  const n=5;
  for(let i=0;i<n;i++){
    const seed=i*37+step;
    const bx=e.x+(i-(n-1)/2)*(e.r*.52)+ (grand(seed)-.5)*5;
    const by=e.y+(grand(seed+3)-.5)*e.r*.5;
    const a=-Math.PI/2+(grand(seed+11)-.5)*.7;
    const len=(e.r*.75+grand(seed+5)*e.r*1.15)*(.55+k*.45);
    ctx.globalAlpha=.5*k;
    ctx.fillStyle='#a24dff';
    flameTongue(bx,by,a,len,e.r*.3);
    ctx.globalAlpha=.75*k;
    ctx.fillStyle='#e39bff';
    flameTongue(bx,by,a,len*.68,e.r*.19);
    ctx.globalAlpha=.85*k;
    ctx.fillStyle='#fff0ff';
    flameTongue(bx,by,a,len*.36,e.r*.1);
  }
  ctx.restore();
}
function drawEnemies(){
  for(const e of enemies){
    const sp=types[e.type];
    if(sp.guard&&e.ward&&e.ward.hp>0){
      // the tie between a screen and its ward, so the shape of the problem reads
      // at a glance rather than feeling like your guns are picking wrong
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=.26;ctx.strokeStyle=sp.color;ctx.lineWidth=1.6;
      ctx.setLineDash([7,6]);ctx.lineDashOffset=-state.time*40;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.ward.x,e.ward.y);ctx.stroke();
      ctx.setLineDash([]);
      // and the face it keeps turned toward you
      const fa=Math.atan2(player.y-e.y,player.x-e.x);
      ctx.globalAlpha=.45+Math.sin(state.time*4)*.1;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+9,fa-.9,fa+.9);ctx.stroke();
      ctx.restore();
    }
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
    ctx.shadowColor=sp.color;ctx.shadowBlur=10+hit*24;
    ctx.fillStyle=hit?'#fff':sp.color;
    enemyPath(e,sp);ctx.fill();
    ctx.shadowBlur=0;
    // canopy and engine lights
    ctx.fillStyle='#0a1120';ctx.globalAlpha=grow*.8;
    ctx.beginPath();ctx.ellipse(e.r*.35,0,e.r*.22,e.r*.14,0,0,7);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.globalAlpha=grow*(.55+Math.sin(state.time*18+(e.phase||0))*.2);
    for(const s of [-1,1]){ctx.beginPath();ctx.arc(-e.r*.9,s*e.r*.32,e.r*.09,0,7);ctx.fill();}
    if(sp.ring){
      // the marking that says what pattern this hull was built on
      ctx.save();
      ctx.globalAlpha=grow*.5;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.4;
      ctx.setLineDash([5,4]);ctx.rotate(-(e.rot||0)+state.time*1.1);
      ctx.beginPath();ctx.arc(0,0,e.r*.62,0,7);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
    }
    if(e.laserLinger>0){
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=grow*.45*clamp(e.laserLinger/1.2,0,1)*(.7+Math.sin(state.time*17)*.3);
      ctx.fillStyle='#c879ff';enemyPath(e,sp);ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha=grow*(.35+hit*.65);
    ctx.strokeStyle=hit?'#fff':(e.laserLinger>0?'#f0c8ff':'#e8f4ff');ctx.lineWidth=1.3;
    enemyPath(e,sp);ctx.stroke();
    ctx.restore();
    if(e.slowT>0){
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=.3*clamp(e.slowT*3,0,1);
      ctx.strokeStyle='#7ee0ff';ctx.lineWidth=2;ctx.setLineDash([4,5]);
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+5,state.time*-1.6,state.time*-1.6+5.4);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
    }
    if(e.laserLinger>0)drawBurn(e);
    if(e.hp<e.maxHp&&grow>=1){
      // an arc riding the hull reads as damage to *that* ship; a bar floating
      // overhead reads as debris once a dozen of them are on screen.
      // Colour carries the reading so you never have to measure arc length --
      // green is fresh, red is one more hit -- and it never uses the shape's own
      // colour, which would vanish against the hull it sits on.
      const k=clamp(e.hp/e.maxHp,0,1), rr=e.r+10, a0=-Math.PI*.97, sweep=Math.PI*.94;
      const th=clamp(e.r*.24,3.6,8);          // bosses get a chunkier ring
      const col=k>.5?mixHex('#fbbf24','#4ade80',(k-.5)*2):mixHex('#ff3b30','#fbbf24',k*2);
      ctx.save();ctx.lineCap='round';
      // a dark outline first, so the readout survives on top of bright particles
      ctx.strokeStyle='rgba(3,6,13,.9)';ctx.lineWidth=th+5;
      ctx.beginPath();ctx.arc(e.x,e.y,rr,a0,a0+sweep);ctx.stroke();
      // the empty track stays visible, so the fill reads as a proportion
      ctx.strokeStyle='rgba(126,146,180,.5)';ctx.lineWidth=th;
      ctx.beginPath();ctx.arc(e.x,e.y,rr,a0,a0+sweep);ctx.stroke();
      ctx.strokeStyle=col;ctx.lineWidth=th;ctx.shadowColor=col;ctx.shadowBlur=7;
      ctx.beginPath();ctx.arc(e.x,e.y,rr,a0,a0+sweep*k);ctx.stroke();
      ctx.restore();
    }
  }
}
function drawProjectiles(){
  ctx.save();ctx.lineCap='round';
  const step=Math.floor(state.time*30);
  for(const a of arrows){
    // the round is a readout of the gun that fired it: every upgrade puts a
    // little more mass behind it, and the ones that change how it flies say so
    const g=a.grade||0, sz=1+g*.1+(a.heavy?.42:0);
    const dir=Math.atan2(a.vy,a.vx), sp=Math.hypot(a.vx,a.vy),
          len=clamp(sp*.05,18,44)*(.85+grand(step+a.seed)*.3)*(1+g*.12);
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(dir);
    // a flickering fire tail behind the round
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.3;ctx.fillStyle='#ff7a2a';flameTongue(-2,0,Math.PI,len,3.6*sz);
    ctx.globalAlpha=.45;ctx.fillStyle='#ffb54a';flameTongue(-2,0,Math.PI,len*.6,2.4*sz);
    ctx.globalAlpha=.7;ctx.fillStyle='#fff2c8';flameTongue(-2,0,Math.PI,len*.3,1.3*sz);
    if(a.heavy){
      // HEAVY SLUG rides inside its own bloom — the tell that the round hits hard
      ctx.globalAlpha=.26+Math.sin(state.time*22+a.seed)*.08;ctx.fillStyle=a.color;
      ctx.beginPath();ctx.arc(1,0,9.5*sz,0,7);ctx.fill();
    }
    if(a.seeker){
      // SEEKER ROUNDS grow vanes, so a round that will turn looks like one
      ctx.globalAlpha=.6;ctx.strokeStyle=a.color;ctx.lineWidth=1.6;
      for(const side of [-1,1]){
        ctx.beginPath();ctx.moveTo(-1*sz,side*3.2*sz);ctx.lineTo(-7.5*sz,side*7*sz);ctx.stroke();
      }
    }
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    ctx.fillStyle='#f2fdff';ctx.shadowColor=a.color;ctx.shadowBlur=10+g*3;
    ctx.beginPath();ctx.moveTo(11*sz,0);ctx.lineTo(-3*sz,4*sz);ctx.lineTo(0,0);ctx.lineTo(-3*sz,-4*sz);ctx.closePath();ctx.fill();
    if(a.pierce){
      // PIERCING ROUNDS get the spike that earns the name
      ctx.beginPath();ctx.moveTo(16.5*sz,0);ctx.lineTo(9*sz,2.1*sz);ctx.lineTo(9*sz,-2.1*sz);ctx.closePath();ctx.fill();
    }
    if(a.heavy){
      ctx.shadowBlur=0;ctx.fillStyle='#ffffff';
      ctx.beginPath();ctx.moveTo(6.5*sz,0);ctx.lineTo(-1*sz,2*sz);ctx.lineTo(-1*sz,-2*sz);ctx.closePath();ctx.fill();
    }
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
// ground reticles fill up as the strike closes in, so the wind-up is readable
function drawStrikes(){
  for(const s of strikes){
    const k=clamp(1-s.timer/s.maxTimer,0,1);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.1+k*.16;
    ctx.fillStyle=s.color;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill();
    ctx.globalAlpha=.55+k*.45;
    ctx.strokeStyle=s.color;ctx.lineWidth=2+k*2;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.stroke();
    ctx.globalAlpha=.85;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r*k,0,7);ctx.stroke();
    ctx.lineWidth=1.6;ctx.globalAlpha=.5;
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+k*1.2;
      ctx.beginPath();
      ctx.moveTo(s.x+Math.cos(a)*(s.r-12),s.y+Math.sin(a)*(s.r-12));
      ctx.lineTo(s.x+Math.cos(a)*(s.r+9),s.y+Math.sin(a)*(s.r+9));
      ctx.stroke();
    }
    ctx.restore();
  }
}
function drawRings(){
  for(const r of rings){
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=clamp(r.life/2.2,0,1)*.9;
    ctx.strokeStyle=r.color;ctx.shadowColor=r.color;ctx.shadowBlur=18;ctx.lineWidth=9;
    ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,7);ctx.stroke();
    ctx.shadowBlur=0;ctx.globalAlpha*=.8;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,7);ctx.stroke();
    ctx.restore();
  }
}
// per-boss flourishes drawn over the enemy layer
function drawBossArt(){
  for(const e of enemies){
    if(!e.boss)continue;
    const spec=types[e.type];
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    if(e.bossId==='lance'&&e.mode==='windup'){
      // the charge tell: a lane you have to be out of
      const len=520;
      ctx.globalAlpha=.28+Math.sin(state.time*30)*.12;
      ctx.strokeStyle=spec.color;ctx.lineWidth=e.r*1.3;
      ctx.beginPath();ctx.moveTo(e.x,e.y);
      ctx.lineTo(e.x+Math.cos(e.lockA)*len,e.y+Math.sin(e.lockA)*len);ctx.stroke();
      ctx.globalAlpha=.9;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(e.x,e.y);
      ctx.lineTo(e.x+Math.cos(e.lockA)*len,e.y+Math.sin(e.lockA)*len);ctx.stroke();
    }
    if(e.bossId==='orbiter'&&e.tether){
      ctx.globalAlpha=.45+Math.sin(state.time*9)*.2;
      ctx.strokeStyle=spec.color;ctx.lineWidth=3;ctx.setLineDash([12,9]);
      ctx.lineDashOffset=-state.time*70;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(player.x,player.y);ctx.stroke();
      ctx.setLineDash([]);
    }
    if(e.bossId==='beacon'){
      const reach=330;
      for(let i=0;i<3;i++){
        const ba=e.beamRot+i*Math.PI*2/3;
        const g=ctx.createLinearGradient(e.x,e.y,e.x+Math.cos(ba)*reach,e.y+Math.sin(ba)*reach);
        g.addColorStop(0,rgba(spec.color,.65));
        g.addColorStop(1,rgba(spec.color,0));
        ctx.globalAlpha=1;ctx.strokeStyle=g;ctx.lineWidth=13;
        ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(ba)*reach,e.y+Math.sin(ba)*reach);ctx.stroke();
        ctx.strokeStyle=rgba('#ffffff',.6);ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(ba)*reach,e.y+Math.sin(ba)*reach);ctx.stroke();
      }
    }
    if(e.bossId==='mothership'){
      ctx.globalAlpha=.45+Math.sin(state.time*2)*.12;
      ctx.strokeStyle=spec.color;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+16,0,7);ctx.stroke();
      // three bays that light as they cycle
      for(let i=0;i<3;i++){
        const ba=state.time*.6+i*Math.PI*2/3;
        ctx.globalAlpha=.3+(e.bayFlash||0)*1.8;
        ctx.fillStyle=spec.color;
        ctx.beginPath();ctx.arc(e.x+Math.cos(ba)*(e.r+6),e.y+Math.sin(ba)*(e.r+6),9+(e.bayFlash||0)*16,0,7);ctx.fill();
      }
      if(e.gunFlash){
        const ga=ang(e,player);
        ctx.globalAlpha=e.gunFlash*2.4;
        ctx.strokeStyle='#ffd9a8';ctx.lineWidth=5;
        ctx.beginPath();ctx.moveTo(e.x+Math.cos(ga)*e.r,e.y+Math.sin(ga)*e.r);
        ctx.lineTo(e.x+Math.cos(ga)*(e.r+50),e.y+Math.sin(ga)*(e.r+50));ctx.stroke();
      }
      // a thread to everything it launched, so the source of the swarm is obvious
      for(const add of enemies){
        if(add.escortOf!==e)continue;
        ctx.globalAlpha=.14;ctx.strokeStyle=spec.color;ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(add.x,add.y);ctx.stroke();
      }
    }
    if(e.bossId==='hollow'&&e.shield){
      const hit=clamp((e.deflect||0)/.2,0,1);
      ctx.globalAlpha=.35+Math.sin(state.time*4)*.12+hit*.55;
      ctx.strokeStyle='#ffffff';ctx.lineWidth=4+hit*5;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+18,0,7);ctx.stroke();
      ctx.globalAlpha=.16;ctx.fillStyle=spec.color;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+18,0,7);ctx.fill();
      for(const add of enemies){
        if(add.escortOf!==e)continue;
        ctx.globalAlpha=.3;ctx.strokeStyle=spec.color;ctx.lineWidth=1.6;
        ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(add.x,add.y);ctx.stroke();
      }
    }
    // ---- SECTOR 02 -----------------------------------------------------------
    if(e.bossId==='monolith'){
      const wind=e.mode==='wind'?clamp(1-e.timer,0,1):0;
      ctx.globalAlpha=.3+wind*.5;
      ctx.strokeStyle=spec.color;ctx.lineWidth=3+wind*5;
      poly(e.x,e.y,e.r+14+Math.sin(state.time*2)*3,6,state.time*.35);ctx.stroke();
      if(wind){
        // a ring closing on the hull is the count-in: when it lands, so does the burst
        ctx.globalAlpha=.5;ctx.lineWidth=3;
        poly(e.x,e.y,e.r+16+(1-wind)*150,6,-state.time*.9);ctx.stroke();
      }
      ctx.globalAlpha=.22+wind*.45;ctx.fillStyle=spec.color;
      poly(e.x,e.y,e.r*.45,6,state.time*-.5);ctx.fill();
    }
    if(e.bossId==='shrike'&&(e.mode==='wind'||e.mode==='pass')){
      const wind=e.mode==='wind', len=wind?460:230, dir=wind?1:-1;   // the pass streaks the lane it just flew
      ctx.globalAlpha=wind?.3+Math.sin(state.time*34)*.12:.45;
      ctx.strokeStyle=spec.color;ctx.lineWidth=wind?4:e.r*1.1;
      ctx.beginPath();ctx.moveTo(e.x,e.y);
      ctx.lineTo(e.x+Math.cos(e.lockA||0)*len*dir,e.y+Math.sin(e.lockA||0)*len*dir);ctx.stroke();
    }
    if(e.bossId==='breacher'&&(e.mode==='aim'||e.mode==='lunge')){
      // the lane fills as the wind-up runs, so the moment to leave it is readable
      const len=560, k=e.mode==='aim'?clamp(1-e.timer/.85,0,1):1;
      const tx=e.x+Math.cos(e.lockA||0)*len*k, ty=e.y+Math.sin(e.lockA||0)*len*k;
      ctx.globalAlpha=(e.mode==='aim'?.14+k*.22:.34)+Math.sin(state.time*26)*.06;
      ctx.strokeStyle=spec.color;ctx.lineWidth=e.r*1.5;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(tx,ty);ctx.stroke();
      ctx.globalAlpha=.85;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(tx,ty);ctx.stroke();
    }
    if(e.bossId==='wraith'&&e.ghost>0){
      // where it just was, and the thread back to it — the only warning you get
      const k=e.ghost/.4;
      ctx.save();
      ctx.globalAlpha=k*.5;ctx.translate(e.ghostX,e.ghostY);ctx.rotate(e.rot||0);
      ctx.strokeStyle=spec.color;ctx.lineWidth=2;
      enemyPath(e,spec);ctx.stroke();
      ctx.restore();
      ctx.globalAlpha=k*.35;ctx.strokeStyle=spec.color;ctx.lineWidth=1.6;ctx.setLineDash([9,7]);
      ctx.beginPath();ctx.moveTo(e.ghostX,e.ghostY);ctx.lineTo(e.x,e.y);ctx.stroke();
      ctx.setLineDash([]);
    }
    if(e.bossId==='leviathan'){
      const arms=e.raged?4:2;
      ctx.globalAlpha=.5;ctx.strokeStyle=spec.color;ctx.lineWidth=4;
      for(let i=0;i<arms;i++){
        const ba=(e.spin||0)+i*Math.PI*2/arms;
        ctx.beginPath();ctx.moveTo(e.x+Math.cos(ba)*e.r*.5,e.y+Math.sin(ba)*e.r*.5);
        ctx.lineTo(e.x+Math.cos(ba)*(e.r+42),e.y+Math.sin(ba)*(e.r+42));ctx.stroke();
      }
      ctx.globalAlpha=.35+Math.sin(state.time*3)*.12;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+18,0,7);ctx.stroke();
      if(e.charge>0){
        // the nova wind-up: a disc that fills while a ring closes on it
        ctx.globalAlpha=.2+e.charge*.45;ctx.fillStyle=spec.color;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r*e.charge*1.4,0,7);ctx.fill();
        ctx.globalAlpha=.8;ctx.strokeStyle='#ffffff';ctx.lineWidth=2+e.charge*3;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r+30+(1-e.charge)*95,0,7);ctx.stroke();
      }
      if(e.raged){
        ctx.globalAlpha=.28+Math.sin(state.time*8)*.14;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(e.x,e.y,e.r+32,0,7);ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function drawMines(){
  for(const m of mines){
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    if(m.armT>0){
      const p=1-m.armT/.4;
      ctx.globalAlpha=.5+p*.4;ctx.strokeStyle=m.color;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(m.x,m.y,10+p*8,0,7);ctx.stroke();
    }else{
      const p=clamp(m.holdT/m.holdT0,0,1), load=clamp((m.held||0)/(m.cap||MINE_CAP),0,1);
      ctx.globalAlpha=.18+load*.14;ctx.fillStyle=m.color;
      ctx.beginPath();ctx.arc(m.x,m.y,m.radius,0,7);ctx.fill();
      ctx.globalAlpha=.55+Math.sin(state.time*14)*.15;ctx.strokeStyle=m.color;ctx.shadowColor=m.color;ctx.shadowBlur=16;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(m.x,m.y,m.radius*(.14+(1-p)*.12),0,7);ctx.stroke();
      if(m.heavy){
        // COLLAPSE CHARGE: a second containment ring winding the other way, and
        // a core heavy enough to see from across the room
        ctx.globalAlpha=.4+Math.sin(state.time*9)*.12;ctx.lineWidth=2;
        const sw=state.time*-1.7;
        for(let i=0;i<3;i++){
          const rr=m.radius*(.3+i*.13), a0=sw*(1+i*.35)+i*2.1;
          ctx.beginPath();ctx.arc(m.x,m.y,rr,a0,a0+Math.PI*.62);ctx.stroke();
        }
        ctx.globalAlpha=.5+Math.sin(state.time*16)*.2;ctx.fillStyle=m.color;
        ctx.beginPath();ctx.arc(m.x,m.y,14,0,7);ctx.fill();
      }
      ctx.shadowBlur=0;ctx.globalAlpha=.9;ctx.fillStyle='#0b0c14';
      ctx.beginPath();ctx.arc(m.x,m.y,m.heavy?11:9,0,7);ctx.fill();
      ctx.globalAlpha=.7;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();
  }
}
function drawWells(){
  for(const wl of wells){
    const p=clamp(wl.life/wl.maxLife,0,1);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=p*.2;ctx.fillStyle=wl.color;
    ctx.beginPath();ctx.arc(wl.x,wl.y,wl.radius,0,7);ctx.fill();
    // arcs winding inward as the crater closes
    ctx.globalAlpha=p*.7;ctx.strokeStyle=wl.color;ctx.lineWidth=2.5;
    for(let i=0;i<3;i++){
      const rr=wl.radius*(.26+(((1-p)+i/3)%1)*.7), a=state.time*4+i*2.1;
      ctx.beginPath();ctx.arc(wl.x,wl.y,rr,a,a+Math.PI*.7);ctx.stroke();
    }
    ctx.restore();
  }
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
    if(b.heavy){
      // a fused warhead — IMPACT FUSING on the torpedo, HEAVY WARHEAD on a rocket —
      // puts a hard shock front out ahead of the fireball, so it reads as a crack
      // rather than a bloom
      const kr=b.radius*(.92+easeOut(p)*.5);
      ctx.globalAlpha=(1-p)*.4;ctx.strokeStyle=b.color;ctx.lineWidth=2+9*(1-p);
      ctx.beginPath();ctx.arc(b.x,b.y,kr*.94,0,7);ctx.stroke();
      ctx.globalAlpha=(1-p)*.8;ctx.strokeStyle='#ffffff';ctx.lineWidth=1+3.5*(1-p);
      ctx.beginPath();ctx.arc(b.x,b.y,kr,0,7);ctx.stroke();
    }
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
  drawPlane((cloaked?.3:1)*state.playerAlpha);
}
// the dash, drawn in layers that switch on with what has been bought for it. The
// silhouette trail is the bare drive; everything past it is an upgrade showing
// its work, so a fully-built dash reads as a different move to a stock one.
function drawDashFx(){
  if(!dashGhosts.length&&!state.dashBurst&&state.dashTime<=0)return;
  const col=pilotColor(), P=planeOf(), r=player.r*PLANE_SCALE, kit=dashKit();
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  // ---- the lane behind you: silhouettes of where you just were -------------
  for(const g of dashGhosts){
    const k=clamp(g.life/g.max,0,1), fade=k*k;
    ctx.save();
    ctx.translate(g.x,g.y);ctx.rotate(g.a);
    ctx.globalAlpha=fade*(.15+(kit.coils?.05:0)+(kit.shear?.05:0));
    ctx.fillStyle=col;planePath(P,r);ctx.fill();
    if(kit.shear){   // SHEAR DRIVE etches an edge onto every afterimage
      ctx.globalAlpha=fade*.45;
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.2;
      planePath(P,r);ctx.stroke();
    }
    ctx.restore();
  }
  // ---- the launch mark ------------------------------------------------------
  const b=state.dashBurst;
  if(b){
    const k=1-b.life/b.max, out=1-k;
    ctx.save();
    ctx.globalAlpha=out*.5;ctx.strokeStyle=col;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(b.x,b.y,16+k*90,0,7);ctx.stroke();
    if(kit.coils){   // the coils dump a second, wider ring off the same mark
      ctx.globalAlpha=out*.28;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(b.x,b.y,8+k*160,0,7);ctx.stroke();
    }
    // and a plume pointing the way you went
    ctx.translate(b.x,b.y);ctx.rotate(b.a);
    ctx.globalAlpha=out*.32;ctx.fillStyle=col;
    const w=r*.9+k*r*1.2, len=r*2+k*r*5;
    ctx.beginPath();ctx.moveTo(0,-w);ctx.lineTo(len,0);ctx.lineTo(0,w);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  // ---- and the live pass, while you are still inside it ---------------------
  if(state.dashTime>0){
    const prog=clamp(1-state.dashTime/.22,0,1), step=Math.floor(state.time*40);
    ctx.save();
    ctx.translate(player.x,player.y);ctx.rotate(Math.atan2(state.dashY,state.dashX));
    // SLIPSTREAM COILS: the lane tears open behind you
    if(kit.coils){
      ctx.globalAlpha=.3;ctx.strokeStyle=col;ctx.lineWidth=2;ctx.lineCap='round';
      for(let i=0;i<5;i++){
        const off=(i-2)*r*.42, len=r*(2.5+grand(step*3+i)*4);
        ctx.beginPath();ctx.moveTo(-r*1.2,off);ctx.lineTo(-r*1.2-len,off*1.6);ctx.stroke();
      }
    }
    // SHEAR DRIVE: the edges that make the pass cost something
    if(kit.shear){
      ctx.globalAlpha=.5+Math.sin(state.time*40)*.16;
      ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.lineCap='round';
      for(const side of [-1,1]){
        ctx.beginPath();ctx.moveTo(r*1.5,side*r*.22);ctx.lineTo(-r*1.1,side*r*1.05);ctx.stroke();
      }
      ctx.globalAlpha=.45;ctx.strokeStyle=col;ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(0,0,r*1.5,-.5,.5);ctx.stroke();
    }
    // SHEAR DRIVE II: the bow shock that shoulders the lane open ahead of you
    if(kit.shove){
      const reach=r*(1.9+prog*.6);
      ctx.globalAlpha=.22+prog*.16;ctx.fillStyle=col;
      ctx.beginPath();ctx.arc(r*.5,0,reach,-.85,.85);ctx.lineTo(r*.5,0);ctx.closePath();ctx.fill();
      ctx.globalAlpha=.6;ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(r*.5,0,reach,-.85,.85);ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
// top-down planes: one vibrant plate in the pilot's colour, so the silhouette alone
// says which airframe you are flying. Half-outlines, nose first and tail last, both
// ending on the centreline; the other side is mirrored at draw time. x is length in
// radii, y is half-span, and `jets` are the exhaust offsets across the tail.
const PLANE_SCALE=1.25;
const PLANES={
  fighter:{jets:[-.34,.34],pts:[[1.75,0],[1.15,.20],[.45,.22],[.10,.95],[-.30,1.05],[-.25,.30],[-1.05,.32],[-1.35,.80],[-1.55,.78],[-1.45,.16],[-1.60,0]]},
  jet:{jets:[0],pts:[[2.05,0],[1.45,.13],[.55,.15],[.05,.62],[-.35,.70],[-.30,.22],[-1.05,.24],[-1.30,.62],[-1.48,.60],[-1.42,.12],[-1.55,0]]},
  bomber:{jets:[-.72,-.26,.26,.72],pts:[[1.45,0],[1.20,.30],[.55,.38],[.35,1.35],[-.05,1.40],[-.20,.42],[-1.00,.44],[-1.20,1.00],[-1.45,.98],[-1.38,.20],[-1.55,0]]},
  recon:{jets:[-.30,.30],pts:[[1.65,0],[1.15,.17],[.50,.19],[.30,1.30],[.05,1.32],[-.15,.26],[-1.00,.28],[-1.28,.78],[-1.46,.76],[-1.40,.14],[-1.55,0]]},
  gunship:{jets:[-.52,0,.52],pts:[[1.50,0],[1.20,.26],[.50,.34],[.42,1.15],[-.10,1.20],[-.22,.38],[-.95,.40],[-1.18,.92],[-1.42,.90],[-1.36,.18],[-1.52,0]]},
  delta:{jets:[-.30,.30],pts:[[1.90,0],[1.30,.14],[.60,.16],[-.55,1.15],[-.95,1.18],[-.85,.24],[-1.20,.26],[-1.35,.70],[-1.50,.68],[-1.44,.12],[-1.58,0]]},
  apex:{jets:[-.36,.36],pts:[[1.80,0],[1.25,.18],[.50,.20],[.85,1.00],[.50,1.08],[-.30,.30],[-1.05,.32],[-1.30,.82],[-1.50,.80],[-1.44,.16],[-1.58,0]]}
};
const planeOf=()=>PLANES[((state&&characters[state.character])||characters[STARTER]).plane]||PLANES.fighter;
// the hangar needs the same silhouette without a canvas, so the half-outline is
// mirrored into a closed polygon and swung a quarter turn to stand nose-up.
function planeSvg(c){
  const P=PLANES[c.plane]||PLANES.fighter, pts=P.pts;
  const turn=p=>[p[1],-p[0]];
  const poly=pts.concat(pts.slice(1,-1).reverse().map(p=>[p[0],-p[1]])).map(turn);
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const p of poly){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}
  const n=v=>v.toFixed(2), pad=.3, flame=.6;
  const vb=[x0-pad,y0-pad,(x1-x0)+pad*2,(y1-y0)+pad+flame].map(n).join(' ');
  const tail=pts[pts.length-1][0];
  const jets=P.jets.map(j=>{const q=turn([tail,j]);return '<line x1="'+n(q[0])+'" y1="'+n(q[1])+'" x2="'+n(q[0])+'" y2="'+n(q[1]+flame*.85)+'"/>';}).join('');
  const cp=turn([.72,0]);
  return '<svg class="pilot-ship" viewBox="'+vb+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
    +'<g class="ship-jets" stroke="'+c.color+'">'+jets+'</g>'
    +'<polygon class="ship-hull" points="'+poly.map(p=>n(p[0])+','+n(p[1])).join(' ')+'" fill="'+c.color+'"/>'
    +'<ellipse class="ship-canopy" cx="'+n(cp[0])+'" cy="'+n(cp[1])+'" rx=".14" ry=".3"/>'
  +'</svg>';
}
function planePath(P,r){
  const pts=P.pts;
  ctx.beginPath();
  ctx.moveTo(pts[0][0]*r,0);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]*r,pts[i][1]*r);
  for(let i=pts.length-2;i>0;i--)ctx.lineTo(pts[i][0]*r,-pts[i][1]*r);
  ctx.closePath();
}
function drawPlane(alpha){
  const r=player.r*PLANE_SCALE, hit=player.flash>0, col=pilotColor(), P=planeOf();
  const tail=P.pts[P.pts.length-1][0]*r;
  ctx.save();
  ctx.translate(player.x,player.y);ctx.rotate(player.heading);
  const th=player.thrust;
  if(th>.05){
    const step=Math.floor(state.time*28);
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<P.jets.length;i++){
      const y=P.jets[i]*r, len=r*(.85+grand(step*3+i)*.5)*th, w=r*.13;
      ctx.globalAlpha=alpha*.45;ctx.fillStyle=col;flameTongue(tail,y,Math.PI,len,w);
      ctx.globalAlpha=alpha*.8;ctx.fillStyle='#ffffff';flameTongue(tail,y,Math.PI,len*.34,w*.5);
    }
    ctx.restore();
  }
  ctx.globalAlpha=alpha;
  ctx.fillStyle=hit?'#ffffff':col;
  ctx.shadowColor=col;ctx.shadowBlur=hit?26:14;
  planePath(P,r);ctx.fill();
  ctx.shadowBlur=0;
  // a dark rim and canopy slit keep the plate readable over a bright floor
  ctx.strokeStyle='rgba(6,9,16,.5)';ctx.lineWidth=1.6;planePath(P,r);ctx.stroke();
  ctx.fillStyle='rgba(6,9,16,.55)';
  ctx.beginPath();ctx.ellipse(r*.72,0,r*.3,r*.14,0,0,7);ctx.fill();
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
  if(state.weapons.aegis)drawAegis(state.weapons.aegis);
  if(state.weapons.arc)drawArc(state.weapons.arc);
  if(state.weapons.sword)for(const a of bladeAngles(state.weapons.sword))drawBlade(state.weapons.sword,a);
}
function drawAegis(w){
  const r=w.radius||125, t=state.time;
  const charge=w.pulse?clamp(1-(w.pulseIn||0)/2.2,0,1):0;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(player.x,player.y,r*.35,player.x,player.y,r);
  g.addColorStop(0,rgba(w.color,0));
  g.addColorStop(.72,rgba(w.color,.07+charge*.06));
  g.addColorStop(1,rgba(w.color,.2+charge*.16));
  ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(player.x,player.y,r,0,7);ctx.fill();
  ctx.globalAlpha=.5+Math.sin(t*3)*.12+charge*.3;
  ctx.strokeStyle=w.color;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(player.x,player.y,r,0,7);ctx.stroke();
  // rotating containment arcs
  ctx.globalAlpha=.32;
  ctx.lineWidth=3.5;
  for(let i=0;i<3;i++){
    const sp=t*(.7+i*.35)*(i%2?-1:1);
    ctx.beginPath();ctx.arc(player.x,player.y,r-6-i*7,sp,sp+Math.PI*.5);ctx.stroke();
  }
  // nodes riding the rim — FIELD DENSITY adds emitters and a lit inner band
  const dense=upg(w,DMG_UPGRADE.aegis);
  if(dense){
    ctx.globalAlpha=.3+Math.sin(t*5)*.08;ctx.strokeStyle=w.color;ctx.lineWidth=6;
    ctx.beginPath();ctx.arc(player.x,player.y,r*.72,0,7);ctx.stroke();
  }
  ctx.globalAlpha=.75;
  ctx.fillStyle='#e8fbff';
  const nodes=dense?10:6;
  for(let i=0;i<nodes;i++){
    const a=t*.9+i*Math.PI*2/nodes;
    ctx.beginPath();ctx.arc(player.x+Math.cos(a)*r,player.y+Math.sin(a)*r,(dense?3.1:2.2)+charge*2,0,7);ctx.fill();
  }
  if(w.pull){
    ctx.globalAlpha=.22;ctx.strokeStyle=w.color;ctx.lineWidth=1.5;
    for(let i=0;i<10;i++){
      const a=t*1.4+i*Math.PI/5, k=(t*.5+i/10)%1;
      const r0=r*(1-k*.6), r1=r0-16;
      ctx.beginPath();ctx.moveTo(player.x+Math.cos(a)*r0,player.y+Math.sin(a)*r0);ctx.lineTo(player.x+Math.cos(a)*r1,player.y+Math.sin(a)*r1);ctx.stroke();
    }
  }
  ctx.restore();
}
function drawArc(w){
  if(!(w.boltT>0)||!w.bolt||w.bolt.length<2)return;
  const k=clamp(w.boltT/.16,0,1);
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.lineCap='round';ctx.lineJoin='round';
  // OVERCHARGE wraps the bolt in a corona: one more pass, wider and dimmer, laid
  // under the ones that were already there
  const heavy=upg(w,DMG_UPGRADE.arc);
  const passes=heavy?[[.16,20],[.34,11],[.62,5],[1,2.4]]:[[.3,11],[.6,5],[1,2]];
  for(let pass=0;pass<passes.length;pass++){
    ctx.strokeStyle=pass===passes.length-1?'#ffffff':w.color;
    ctx.globalAlpha=passes[pass][0]*k;
    ctx.lineWidth=passes[pass][1]*k;
    ctx.beginPath();
    for(let i=1;i<w.bolt.length;i++){
      const a=w.bolt[i-1],b=w.bolt[i];
      const segs=5, nx=-(b.y-a.y), ny=b.x-a.x, nl=Math.hypot(nx,ny)||1;
      ctx.moveTo(a.x,a.y);
      for(let j=1;j<=segs;j++){
        const f=j/segs;
        const jitter=j===segs?0:(grand(i*31+j*7+Math.floor(state.time*60))*2-1)*13;
        ctx.lineTo(a.x+(b.x-a.x)*f+nx/nl*jitter, a.y+(b.y-a.y)*f+ny/nl*jitter);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha=k*.9;ctx.fillStyle='#ffffff';
  for(let i=1;i<w.bolt.length;i++){ctx.beginPath();ctx.arc(w.bolt[i].x,w.bolt[i].y,(heavy?9.5:7)*k,0,7);ctx.fill();}
  ctx.restore();
}
function drawBlade(w,a){
  const reach=w.reach||78, hilt=14, width=w.width||11;
  ctx.save();
  ctx.translate(player.x,player.y);
  // sweep afterimage — an annulus wedge spanning the blade, so it grows with reach
  ctx.globalCompositeOperation='lighter';
  ctx.strokeStyle=w.color;
  const mid=(hilt+reach)/2, span=reach-hilt;
  const sweep=1.2*(1+(w.ultimate?(w.rush||0)*.8:0));
  for(let i=1;i<=7;i++){
    const k=i/7, back=-sweep*k;
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
  if(upg(w,DMG_UPGRADE.sword)){
    // HONED EDGE: a glint that runs the length of the blade and off the tip
    const k=(state.time*1.7)%1, gx=hilt+(reach-hilt)*k;
    ctx.globalAlpha=(1-Math.abs(k*2-1))*.9;
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(gx-9,0);ctx.lineTo(gx+9,0);ctx.stroke();
    ctx.globalAlpha=.5;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(hilt,-width*.34);ctx.lineTo(reach+5,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hilt,width*.34);ctx.lineTo(reach+5,0);ctx.stroke();
  }
  ctx.restore();
}
function drawLaser(w){
  const e=nearest(), inRange=e&&dist(e,player)<=(w.range||640);
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
  // FOCUSING OPTICS collapses the beam into a filament: a wider bloom around a
  // core that is thinner and far brighter than an unfocused lance manages
  const focus=upg(w,DMG_UPGRADE.laser);
  if(t>0&&w.bx!==undefined){
    const k=clamp(t/.14,0,1);
    const targets=[{x:w.bx,y:w.by}].concat(w.nova||[]);
    for(const g of targets){
      ctx.strokeStyle=w.color;
      ctx.globalAlpha=.28*k;ctx.lineWidth=(focus?19:14)*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      ctx.globalAlpha=.7*k;ctx.lineWidth=5.5*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      ctx.globalAlpha=k;ctx.strokeStyle='#ffffff';ctx.lineWidth=2*k;
      ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      if(focus){
        ctx.globalAlpha=k*(.75+Math.sin(state.time*40)*.25);ctx.lineWidth=.9*k;
        ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(g.x,g.y);ctx.stroke();
      }
      ctx.globalAlpha=k*.9;ctx.fillStyle='#ffffff';
      ctx.beginPath();ctx.arc(g.x,g.y,(focus?14:10)*k,0,7);ctx.fill();
      ctx.globalAlpha=k*.6;ctx.strokeStyle=w.color;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(g.x,g.y,14+(1-k)*26,0,7);ctx.stroke();
      if(focus){   // and the burn mark it leaves on whatever it settled on
        ctx.globalAlpha=k*.5;ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(g.x,g.y,22+(1-k)*40,0,7);ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function ultimateEffects(dt){
  if(state.victorySequence||state.intermission)return; // no ultimates mid-transition
  for(const [id,w] of Object.entries(state.weapons)){
    if(!w.ultimate||id==='bow'||id==='sword'||id==='mine'||id==='missile'||id==='phalanx')continue; // these ultimates ride the weapon's own firing block
    w.ultimateIn=(w.ultimateIn||0)-dt;
    if(w.ultimateIn>0)continue;
    if(id==='laser'){
      const range=w.range||640;
      const targets=enemies.filter(e=>onScreen(e)&&dist(e,player)<=range).sort((a,b)=>dist(a,player)-dist(b,player)).slice(0,3);
      if(!targets.length)continue; // hold the charge until something is in range
      for(const e of targets)hitLaser(w,e,true);
      w.beamT=.18;w.bx=targets[0].x;w.by=targets[0].y;w.nova=targets.map(e=>({x:e.x,y:e.y}));
      shake(2);
    }
    if(id==='bomb'){
      const t=nearest();
      if(!t)continue; // hold the charge until there is something to hit
      const radius=(w.radius||135)+48;
      detonate(w,t.x,t.y,radius,w.damage*2,null);
      blasts.push({x:t.x,y:t.y,radius:radius*1.35,life:.5,maxLife:.5,color:'#fff2d6'});
      burst(t.x,t.y,'#ffffff',18,300,{size:3,drag:2.2});
      shake(13);
    }
    w.ultimateIn=id==='laser'?.4:1.6;
  }
}
function frame(now){
  if(tutorial.open){const d=tutorial.last?Math.min(.05,(now-tutorial.last)/1000):0;tutorial.last=now;drawTutorial(d);}
  if(!state){ctx.clearRect(0,0,W,H);ctx.fillStyle='#090f1b';ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);return;}
  const real=Math.min(.033,(now-state.last)/1000);
  state.last=now;
  // impacts bite for a few frames, and dying drops into slow motion
  let dt=real;
  if(state.hitStop>0){ state.hitStop=Math.max(0,state.hitStop-real); dt=real*.12; }
  else if(state.dying>0) dt=real*.4;
  if(!state.paused){ update(dt,real); ultimateEffects(dt); }
  draw();
  requestAnimationFrame(frame);
}
// ---- how to play --------------------------------------------------------
// each card runs a small looping animation drawn on its own canvas
const DEMO_W=270, DEMO_H=142;
const tutorial={open:false,t:0,last:0,cards:[]};
const lerp=(a,b,k)=>a+(b-a)*k;
function dot(g,x,y,r,fill,glow){
  g.save();
  if(glow){g.shadowColor=glow;g.shadowBlur=14;}
  g.fillStyle=fill;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  g.restore();
}
function tpoly(g,x,y,r,n,rot,fill){
  g.beginPath();
  for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?g.lineTo(px,py):g.moveTo(px,py);}
  g.closePath();
  if(fill){g.fillStyle=fill;g.fill();}
}
function demoBg(g){
  g.fillStyle='#0a1120';g.fillRect(0,0,DEMO_W,DEMO_H);
  g.strokeStyle='#16233a';g.lineWidth=1;g.beginPath();
  for(let x=22;x<DEMO_W;x+=22){g.moveTo(x,0);g.lineTo(x,DEMO_H);}
  for(let y=22;y<DEMO_H;y+=22){g.moveTo(0,y);g.lineTo(DEMO_W,y);}
  g.stroke();
}
function keycap(g,x,y,label,lit){
  g.save();
  g.fillStyle=lit?'#1b4a5e':'#141c2b';
  g.strokeStyle=lit?'#55e6ff':'#2c3b52';
  g.lineWidth=1;
  g.beginPath();g.roundRect?g.roundRect(x-9,y-9,18,18,3):g.rect(x-9,y-9,18,18);g.fill();g.stroke();
  g.fillStyle=lit?'#d6f6ff':'#7d8ca7';
  g.font="bold 9px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
  g.fillText(label,x,y+.5);
  g.restore();
}
const demos=[
  { title:'MOVE & DASH', period:4.6,
    text:'WASD or arrows to move. SHIFT dashes — you are untouchable mid-dash.',
    draw(g,t){
      demoBg(g);
      // a lap that uses every direction, so each key lights when it is actually held
      const legs=[
        {t0:0,   t1:.8,  x0:44, y0:88, x1:116,y1:88, k:'D'},
        {t0:.8,  t1:1.45,x0:116,y0:88, x1:116,y1:38, k:'W'},
        {t0:1.45,t1:2.15,x0:116,y0:38, x1:52, y1:38, k:'A'},
        {t0:2.15,t1:2.8, x0:52, y0:38, x1:52, y1:88, k:'S'},
        {t0:2.8, t1:3.2, x0:52, y0:88, x1:104,y1:88, k:'D'},
        {t0:3.2, t1:3.5, x0:104,y0:88, x1:238,y1:88, k:'D', dash:true}
      ];
      const at=time=>{
        if(time<=0)return {x:legs[0].x0,y:legs[0].y0,k:'',dash:false};
        for(const l of legs){
          if(time<l.t1){
            const f=clamp((time-l.t0)/(l.t1-l.t0),0,1);
            return {x:lerp(l.x0,l.x1,f),y:lerp(l.y0,l.y1,f),k:l.k,dash:!!l.dash};
          }
        }
        const last=legs[legs.length-1];
        return {x:last.x1,y:last.y1,k:'',dash:false};
      };
      const now=at(t);
      for(let i=1;i<=8;i++){
        const p=at(t-i*.042);
        g.globalAlpha=.17*(1-i/9);
        dot(g,p.x,p.y,9*(1-i/10),'#55e6ff');
      }
      g.globalAlpha=1;
      dot(g,now.x,now.y,9,now.dash?'#ffffff':'#dff6ff','#55e6ff');
      // WASD laid out the way it sits under your hand
      keycap(g,54,101,'W',now.k==='W');
      keycap(g,32,122,'A',now.k==='A');
      keycap(g,54,122,'S',now.k==='S');
      keycap(g,76,122,'D',now.k==='D');
      g.save();
      const lit=now.dash;
      g.fillStyle=lit?'#1b4a5e':'#141c2b';
      g.strokeStyle=lit?'#55e6ff':'#2c3b52';
      g.lineWidth=1;
      g.beginPath();
      if(g.roundRect)g.roundRect(96,113,52,18,3); else g.rect(96,113,52,18);
      g.fill();g.stroke();
      g.fillStyle=lit?'#d6f6ff':'#7d8ca7';
      g.font="bold 9px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
      g.fillText('SHIFT',122,122.5);
      g.restore();
    }},
  { title:'YOUR GUNS AIM THEMSELVES', period:3,
    text:'Every weapon fires on its own at whatever is closest. Your only job is where you stand.',
    draw(g,t){
      demoBg(g);
      const px=58,py=71;
      const foes=[{x:206,y:44,ph:0},{x:222,y:104,ph:1.5}];
      for(const f of foes){
        const dead=((t+f.ph)%3)>2.4;
        if(!dead){g.globalAlpha=1;tpoly(g,f.x,f.y,12,4,Math.PI/4,'#ff6387');}
        else {g.globalAlpha=Math.max(0,1-(((t+f.ph)%3)-2.4)/.6);
          for(let i=0;i<6;i++){const a=i*1.05;dot(g,f.x+Math.cos(a)*18,f.y+Math.sin(a)*18,2,'#ff6387');}}
      }
      g.globalAlpha=1;
      for(let i=0;i<3;i++){
        const k=((t*1.3+i/3)%1);
        const tgt=foes[i%2];
        const ax=lerp(px,tgt.x,k), ay=lerp(py,tgt.y,k);
        g.save();g.globalAlpha=.85;g.strokeStyle='#55e6ff';g.lineWidth=2.4;g.lineCap='round';
        g.beginPath();g.moveTo(ax-9,ay-(tgt.y-py)/(tgt.x-px)*9);g.lineTo(ax,ay);g.stroke();g.restore();
      }
      tpoly(g,px,py,11,6,0,'#dff6ff');
      dot(g,px,py,4,'#ffffff','#55e6ff');
    }},
  { title:'REMNANTS LEVEL YOU UP', period:4,
    text:'Kills drop ✦ remnants. Collect them to level, and each level offers three upgrades.',
    draw(g,t){
      demoBg(g);
      const px=64,py=64;
      const k=Math.min(1,t/1.9);
      const sx=lerp(200,px,k*k), sy=lerp(50,py,k*k);
      if(t<2.1){
        g.save();g.translate(sx,sy);g.rotate(t*5);
        tpoly(g,0,0,8,5,-Math.PI/2,'#ffe17a');
        g.restore();
      }
      tpoly(g,px,py,11,6,0,'#dff6ff');
      dot(g,px,py,4,'#ffffff','#55e6ff');
      const fill=t<2.1?t/2.1*.8:(t<2.6?.8+ (t-2.1)/.5*.2:1);
      g.fillStyle='#19273a';g.fillRect(30,116,210,8);
      g.fillStyle='#35c9eb';g.fillRect(30,116,210*Math.min(1,fill),8);
      g.save();
      g.font="bold 10px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
      if(t>2.6){g.globalAlpha=Math.min(1,(t-2.6)*4)*(1-Math.max(0,(t-3.6))*2.5);g.fillStyle='#9cf0bd';g.fillText('LEVEL UP',135,100);}
      else {g.fillStyle='#5d6c85';g.fillText('REFIT',135,102);}
      g.restore();
    }},
  { title:'BUILD YOUR LOADOUT', period:5,
    text:'Take five upgrades in one weapon to unlock its ultimate. Pause any time to review what you have.',
    draw(g,t){
      demoBg(g);
      const pick=Math.floor(t/1.7)%3;
      for(let i=0;i<3;i++){
        const x=22+i*80, on=i===pick&&t%1.7>.6;
        g.fillStyle=on?'#132235':'#101827';
        g.strokeStyle=on?'#55e6ff':'#2a3b56';
        g.lineWidth=on?2:1;
        g.beginPath();g.rect(x,26,70,62);g.fill();g.stroke();
        g.fillStyle=on?'#c5f4ff':'#5d6c85';
        g.font="bold 8px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
        g.fillText(['SPLIT','PIERCE','HEAVY'][i],x+35,44);
        g.fillStyle=on?'#55e6ff':'#26354c';
        g.fillRect(x+12,60,46,4);
      }
      g.save();
      g.font="bold 9px 'DM Mono', monospace";g.textAlign='left';g.textBaseline='middle';
      for(let i=0;i<5;i++){
        const lit=i<=Math.floor(t/1.0)%6;
        g.fillStyle=lit?'#ffe17a':'#26354c';
        tpoly(g,32+i*15,110,5,5,-Math.PI/2,lit?'#ffe17a':'#26354c');
      }
      g.fillStyle=(Math.floor(t/1.0)%6)>=5?'#ffe17a':'#3d4c66';
      g.fillText((Math.floor(t/1.0)%6)>=5?'ULTIMATE READY':'5 UPGRADES = ULTIMATE',118,110);
      g.restore();
    }},
  { title:'CLEAR THE AREA, TAKE THE PORTAL', period:4.5,
    text:'Kill everything, then step into the portal at the centre to descend. Rooms get harder as you go.',
    draw(g,t){
      demoBg(g);
      const cx=135,cy=64;
      const open=Math.min(1,t/.8);
      g.save();
      g.globalCompositeOperation='lighter';
      const gr=g.createRadialGradient(cx,cy,0,cx,cy,26*open);
      gr.addColorStop(0,'rgba(255,255,255,.95)');
      gr.addColorStop(.55,'rgba(85,230,255,.5)');
      gr.addColorStop(1,'rgba(85,230,255,0)');
      g.fillStyle=gr;g.beginPath();g.arc(cx,cy,26*open,0,7);g.fill();
      for(let i=0;i<3;i++){
        const sp=t*(1.6+i*.8)*(i%2?-1:1);
        g.globalAlpha=.4;g.strokeStyle='#55e6ff';g.lineWidth=2;
        g.beginPath();g.arc(cx,cy,20+i*7,sp,sp+2.2);g.stroke();
      }
      g.restore();
      if(t>1.1){
        const k=Math.min(1,(t-1.1)/2.1);
        const r=42*Math.pow(1-k,1.6), a=k*k*11;
        const px=cx+Math.cos(a)*r, py=cy+Math.sin(a)*r;
        g.globalAlpha=1-Math.max(0,(k-.86)/.14);
        tpoly(g,px,py,9*(1-k*.5),6,0,'#dff6ff');
        g.globalAlpha=1;
      }
      g.save();
      g.font="bold 11px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
      if(t>3.5){g.globalAlpha=Math.min(1,(t-3.5)*3);
        g.fillStyle='#ff557d';g.fillText('AREA 2',135+2,116);
        g.fillStyle='#55e6ff';g.fillText('AREA 2',135-2,116);
        g.fillStyle='#eff4ff';g.fillText('AREA 2',135,116);}
      else {g.fillStyle='#5d6c85';g.fillText('AREA CLEARED',135,116);}
      g.restore();
    }},
  { title:'BOSSES EVERY TEN AREAS', period:4,
    text:'Rooms 10, 20, 30… each hold a different boss with its own attack pattern. Beat one and you claim a permanent relic.',
    draw(g,t){
      demoBg(g);
      const cx=100,cy=64;
      const hp=Math.max(.06,1-(t%4)/3.4);
      g.save();
      g.globalAlpha=.45;g.strokeStyle='#ff4f9a';g.lineWidth=2;g.setLineDash([9,7]);
      g.translate(cx,cy);g.rotate(t*.8);
      g.beginPath();g.arc(0,0,40,0,7);g.stroke();
      g.restore();
      const flash=(t*6)%1<.18;
      tpoly(g,cx,cy,27,8,t*.4,flash?'#ffffff':'#ff4f9a');
      g.fillStyle='#1d2738';g.fillRect(cx-34,cy-40,68,5);
      g.fillStyle='#ff4f9a';g.fillRect(cx-34,cy-40,68*hp,5);
      g.save();
      g.font="bold 8px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
      const relic=t>3.1;
      g.globalAlpha=relic?Math.min(1,(t-3.1)*4):.5;
      g.fillStyle=relic?'#101827':'#101827';
      g.strokeStyle=relic?'#ffe17a':'#2a3b56';g.lineWidth=relic?2:1;
      g.beginPath();g.rect(186,38,62,52);g.fill();g.stroke();
      g.fillStyle=relic?'#ffe17a':'#3d4c66';
      g.fillText('RELIC',217,56);
      tpoly(g,217,74,9,5,-Math.PI/2,relic?'#ffe17a':'#26354c');
      g.restore();
    }}
];
// the same first card, taught for a thumb: the manual shows whichever set of
// controls the device is actually going to give you
const touchMoveDemo={ title:'FLY & DASH', period:4.6,
  text:'Drag anywhere down the left of the arena and a stick appears under your thumb — push it to fly. Tap DASH on the right for a burst of speed nothing can hit you during.',
  draw(g,t){
    demoBg(g);
    const legs=[
      {t0:0,   t1:.8,  x0:60, y0:74, x1:132,y1:74},
      {t0:.8,  t1:1.45,x0:132,y0:74, x1:132,y1:34},
      {t0:1.45,t1:2.15,x0:132,y0:34, x1:68, y1:34},
      {t0:2.15,t1:2.8, x0:68, y0:34, x1:68, y1:74},
      {t0:2.8, t1:3.2, x0:68, y0:74, x1:120,y1:74},
      {t0:3.2, t1:3.5, x0:120,y0:74, x1:246,y1:74, dash:true}
    ];
    const at=time=>{
      if(time<=0)return {x:legs[0].x0,y:legs[0].y0,dx:0,dy:0,dash:false};
      for(const l of legs){
        if(time<l.t1){
          const f=clamp((time-l.t0)/(l.t1-l.t0),0,1), len=Math.hypot(l.x1-l.x0,l.y1-l.y0)||1;
          return {x:lerp(l.x0,l.x1,f),y:lerp(l.y0,l.y1,f),dx:(l.x1-l.x0)/len,dy:(l.y1-l.y0)/len,dash:!!l.dash};
        }
      }
      const last=legs[legs.length-1];
      return {x:last.x1,y:last.y1,dx:0,dy:0,dash:false};
    };
    const now=at(t);
    for(let i=1;i<=8;i++){
      const p=at(t-i*.042);
      g.globalAlpha=.17*(1-i/9);
      dot(g,p.x,p.y,9*(1-i/10),'#55e6ff');
    }
    g.globalAlpha=1;
    dot(g,now.x,now.y,9,now.dash?'#ffffff':'#dff6ff','#55e6ff');
    // the stick, bottom left, held over exactly the way it is being flown
    const sx=38,sy=112,sr=19;
    g.save();
    g.strokeStyle='rgba(85,230,255,.35)';g.lineWidth=1.4;
    g.beginPath();g.arc(sx,sy,sr,0,7);g.stroke();
    const kx=sx+now.dx*sr*.72, ky=sy+now.dy*sr*.72;
    g.strokeStyle='rgba(85,230,255,.28)';
    g.beginPath();g.moveTo(sx,sy);g.lineTo(kx,ky);g.stroke();
    dot(g,kx,ky,7.5,'rgba(85,230,255,.5)','#55e6ff');
    dot(g,kx,ky,3,'#e8fbff');
    g.restore();
    // the dash pad, bottom right, lit for the leg it is driving
    const bx=236,by=112,br=17, lit=now.dash;
    g.save();
    g.fillStyle=lit?'rgba(85,230,255,.34)':'rgba(85,230,255,.08)';
    g.beginPath();g.arc(bx,by,br,0,7);g.fill();
    g.strokeStyle=lit?'#8df1ff':'rgba(85,230,255,.4)';g.lineWidth=lit?2:1.3;
    g.beginPath();g.arc(bx,by,br,0,7);g.stroke();
    g.fillStyle=lit?'#eaffff':'#7fd6e8';
    g.font="bold 8px 'DM Mono', monospace";g.textAlign='center';g.textBaseline='middle';
    g.fillText('DASH',bx,by+.5);
    g.restore();
  }};
// dev mode can preview either manual whatever the machine is running, so the
// mobile cards can be proofread from a desktop
let devManual=null;                                    // null = whatever the device is actually flying
const manualTouch=()=>devManual?devManual==='touch':touchMode;
const demoList=()=>manualTouch()?[touchMoveDemo].concat(demos.slice(1)):demos;
function showHowTo(){
  setInRun(false);
  tutorial.open=true;tutorial.t=0;tutorial.last=0;
  const list=demoList();
  const cards=list.map((d,i)=>'<div class="how-card"><canvas id="demo'+i+'" width="'+DEMO_W*2+'" height="'+DEMO_H*2+'"></canvas>'
    +'<b>'+d.title+'</b><p>'+d.text+'</p></div>').join('');
  const devRow=devMode
    ? '<div class="dev-switch"><span>DEV PREVIEW</span>'
      +'<button'+(manualTouch()?'':' class="on"')+' data-manual="key">COMPUTER</button>'
      +'<button'+(manualTouch()?' class="on"':'')+' data-manual="touch">MOBILE</button>'
      +'<i>LIVE &middot; '+(touchMode?'MOBILE':'COMPUTER')+'</i></div>'
    : '';
  show('<div class="modal wide"><div class="eyebrow">FIELD MANUAL</div><h2>How to play</h2>'
    +'<p>You control where you stand. Everything else fires itself.</p>'
    +devRow
    +'<div class="how-grid">'+cards+'</div>'
    +'<button class="continue ghost" id="howBack">BACK</button></div>');
  tutorial.cards=list.map((d,i)=>{
    const el=document.querySelector('#demo'+i);
    if(!el||!el.getContext)return null;
    const g=el.getContext('2d');
    g.setTransform(2,0,0,2,0,0);
    return {def:d,g};
  }).filter(Boolean);
  document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=()=>{sfx('ui');devManual=b.dataset.manual==='touch'?'touch':'key';showHowTo();});
  $('#howBack').onclick=()=>{closeHowTo();showHome();};
}
function closeHowTo(){tutorial.open=false;tutorial.cards=[];}
function drawTutorial(dt){
  tutorial.t+=dt;
  for(const c of tutorial.cards){
    const t=tutorial.t%c.def.period;
    c.g.save();
    c.def.draw(c.g,t);
    c.g.restore();
  }
}
let confirmingReset=false, confirmingNew=false, confirmingDrop=false;
function showHome(){
  setInRun(false);
  closeHowTo();
  confirmingReset=false;
  const c=characters[chosen]||characters[STARTER];
  show('<button class="dev-toggle'+(devMode?' on':'')+'" id="devBtn" title="Developer mode">'+(devMode?'DEV MODE ON':'DEV')+'</button>'
    // the stick and the pads are otherwise unreachable on a machine with a keyboard
    +(devMode?'<button class="dev-toggle dev-sub'+(touchMode?' on':'')+'" id="devTouch" title="Force the touch controls">MOBILE '+(touchMode?'ON':'OFF')+'</button>':'')
    +'<div class="modal home">'
    +'<div class="eyebrow">STARWING</div>'
    +'<h1 class="home-title">NEON SURVIVORS</h1>'
    +'<p>Fly the sector end to end. Everything in it wants your hull.</p>'
    +'<div class="home-stats"><span>BEST AREA <b>'+highscore+'</b></span><span>CREDITS <b>'+points+'</b></span><span>SKILL <b'+(devMode?' class="dev"':'')+'>'+(devMode?'DEV':skill)+'</b></span><span>AIRCRAFT <b style="color:'+c.color+'">'+c.name+'</b></span>'
      +(sectorsOpen.size>1?'<span>SECTOR <b style="color:'+sectorDef(chosenSector).color+'">'+sectorDef(chosenSector).name+'</b></span>':'')+'</div>'
    +(savedRun?'<div class="home-run"><span>RUN IN PROGRESS</span><b>AREA '+savedRun.room+'</b><i>'+((characters[savedRun.character]||characters[STARTER]).name)+' &bull; '+difficulties[savedRun.difficulty].label+'</i></div>':'')
    +'<div class="home-actions">'
      +(savedRun
        ? '<button class="continue big" id="homeContinue">CONTINUE RUN</button>'
          +'<button class="continue ghost" id="homePlay">'+(confirmingNew?'START OVER? THIS ENDS THE SAVED RUN':'NEW RUN')+'</button>'
          // parking already paid for the ground it covered, so letting it go costs nothing — it just clears the slot
          +'<button class="continue ghost'+(confirmingDrop?' danger':'')+'" id="homeDrop">'+(confirmingDrop?'DISCARD IT? THIS CANNOT BE UNDONE':'DISCARD RUN')+'</button>'
        : '<button class="continue big" id="homePlay">PLAY</button>')
      +'<button class="continue ghost" id="homeTree">OVERHAUL BAY'+(treeAffordable()?' <em class="pip">'+treeAffordable()+'</em>':'')+'</button>'
      +'<button class="continue ghost" id="homeHow">HOW TO PLAY</button>'
      +'<button class="continue ghost" id="homeRoster">HANGAR'+(affordableCount()?' <em class="pip">'+affordableCount()+'</em>':'')+'</button>'
    +'</div>'
  +'</div>');
  $('#homeTree').onclick=()=>{sfx('ui');confirmingNew=confirmingDrop=false;showTree();};
  $('#devBtn').onclick=()=>{sfx('ui');if(devMode){exitDev();showHome();}else showDevPrompt();};
  const devTouch=$('#devTouch');
  if(devTouch)devTouch.onclick=()=>{sfx('ui');setTouchMode(!touchMode);toast(touchMode?'MOBILE CONTROLS ON':'MOBILE CONTROLS OFF');showHome();};
  $('#homePlay').onclick=()=>{sfx('ui');confirmingDrop=false;
    if(!treeHas('w:bow')){showTree();return;}      // cannot fly without the cannon
    if(savedRun&&!confirmingNew){confirmingNew=true;showHome();return;}
    confirmingNew=false;
    if(savedRun)clearRun();
    // with more than one sector open, which one you are flying is the first choice
    if(sectorsOpen.size>1)showSectors(); else showStart();
  };
  if(savedRun)$('#homeContinue').onclick=()=>{confirmingNew=confirmingDrop=false;resumeRun();};
  const drop=$('#homeDrop');
  if(drop)drop.onclick=()=>{
    sfx('ui');confirmingNew=false;
    if(!confirmingDrop){confirmingDrop=true;showHome();return;}
    confirmingDrop=false;
    clearRun();
    toast('SAVED RUN DISCARDED');
    showHome();
  };
  $('#homeHow').onclick=()=>{sfx('ui');confirmingNew=confirmingDrop=false;showHowTo();};
  $('#homeRoster').onclick=()=>{sfx('ui');confirmingNew=confirmingDrop=false;showRoster();};
}
const affordableCount=()=>Object.keys(characters).filter(id=>!unlocked.has(id)&&points>=characters[id].cost).length;
function showRoster(){
  setInRun(false);
  closeHowTo();
  const cards=Object.keys(characters).map(id=>{
    const c=characters[id], have=unlocked.has(id), active=chosen===id, can=points>=c.cost;
    const perks=c.perks.length?'<ul class="pilot-perks">'+c.perks.map(p=>'<li>'+(typeof p==='function'?p():p)+'</li>').join('')+'</ul>':'';
    const action=active?'<button class="pilot-btn active" disabled>SELECTED</button>'
      :have?'<button class="pilot-btn" data-pick="'+id+'">SELECT</button>'
      :'<button class="pilot-btn'+(can?' buy':' locked')+'"'+(can?' data-buy="'+id+'"':' disabled')+'>'+(can?'UNLOCK '+c.cost:'LOCKED '+c.cost)+'</button>';
    return '<div class="pilot'+(active?' on':'')+(have?'':' dim')+'" style="--pilot:'+c.color+'">'
      +'<div class="pilot-art">'+planeSvg(c)+'</div>'
      +'<div class="pilot-head"><i class="weapon-dot" style="background:'+c.color+'"></i><b>'+c.name+'</b>'+(c.tag?'<span class="pilot-tag">'+c.tag+'</span>':'')+'</div>'
      +'<p class="pilot-blurb">'+c.blurb+'</p>'+perks+action+'</div>';
  }).join('');
  show('<div class="modal wide">'
    +'<div class="eyebrow">HANGAR</div><h2>Aircraft</h2>'
    +'<p>Credits are earned by finishing runs. Deeper rooms and harder settings pay more.</p>'
    +'<div class="lo-stats"><span>CREDITS <b>'+points+'</b></span><span>UNLOCKED <b>'+unlocked.size+' / '+Object.keys(characters).length+'</b></span></div>'
    +(savedRun?'<p class="pilot-lock">A run is in progress in area '+savedRun.room+'. It keeps flying '+((characters[savedRun.character]||characters[STARTER]).name)+' &mdash; finish or restart it to change aircraft.</p>':'')
    +'<div class="pilots">'+cards+'</div>'
    +'<button class="continue ghost" id="rosterBack">BACK</button>'
  +'</div>');
  document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.buy, c=characters[id];
    if(!c||unlocked.has(id)||points<c.cost)return;
    points-=c.cost;unlocked.add(id);chosen=id;saveProfile();sfx('level');
    toast('UNLOCKED — '+c.name);
    showRoster();
  });
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
    if(!unlocked.has(b.dataset.pick))return;
    if(savedRun){
      toast('RUN IN PROGRESS — IT CONTINUES AS '+((characters[savedRun.character]||characters[STARTER]).name));
      return;
    }
    chosen=b.dataset.pick;saveProfile();showRoster();
  });
  $('#rosterBack').onclick=showHome;
}
// the footer reads from the same source whether or not a run is in progress
function paintBest(){ui.best.textContent=highscore;}
function resetSavedData(){
  localStorage.removeItem('shapeshift_best_room');
  localStorage.removeItem('shapeshift_hard_beaten');
  localStorage.removeItem('shapeshift_points');
  localStorage.removeItem('shapeshift_unlocked');
  localStorage.removeItem('shapeshift_character');
  localStorage.removeItem('shapeshift_skill');
  localStorage.removeItem('shapeshift_tree');
  clearRun();
  highscore=1;points=0;skill=0;tree={};unlocked=new Set([STARTER]);chosen=STARTER;
  paintBest();
}
// cycled with the arrow keys or the chevrons either side. Locked entries stay on
// the reel rather than being hidden: what is next is part of the reward.
let sectorPick=1;
function showSectors(){
  setInRun(false);
  sectorPick=SECTORS.findIndex(x=>x.id===chosenSector);
  if(sectorPick<0)sectorPick=0;
  paintSectors();
}
function paintSectors(){
  const sec=SECTORS[sectorPick], open=!sec.soon&&sectorOpen(sec.id);
  const dots=SECTORS.map((x,i)=>'<i class="'+(i===sectorPick?'on':'')+(!x.soon&&sectorOpen(x.id)?'':' locked')+'"></i>').join('');
  show('<div class="modal sector-modal">'
    +'<div class="eyebrow">CHOOSE A SECTOR</div>'
    +'<div class="sector-reel">'
      +'<button class="sector-arrow" id="secPrev" aria-label="Previous sector">&#10094;</button>'
      +'<div class="sector-card'+(open?'':' locked')+'" style="--sc:'+(sec.color||'#5d6c85')+'">'
        +'<span class="sector-tag">'+sec.short+'</span>'
        +'<h2>'+(open?sec.name:sec.soon?'SECTOR 03':'LOCKED')+'</h2>'
        +'<p>'+sec.blurb+'</p>'
        +'<p class="sector-line">'+sec.line+'</p>'
        +(open?'<div class="sector-stats"><span>HULLS <b>&times;'+sec.hpBase.toFixed(2)+'</b></span>'
              +'<span>CURVE <b>+'+Math.round(sec.hpCurve*1000)/10+'%/area</b></span>'
              +'<span>NUMBERS <b>&times;'+sec.wave+'</b></span>'
              +'<span>BOSSES <b>&times;'+sec.bossHp+'</b></span></div>'
          :'<div class="sector-locked">'+(sec.soon
              ?'Not flyable yet.'
              :'Clear area '+FINAL_ROOM+' of '+sectorDef(sec.id-1).name+' on HARD.')+'</div>')
      +'</div>'
      +'<button class="sector-arrow" id="secNext" aria-label="Next sector">&#10095;</button>'
    +'</div>'
    +'<div class="sector-dots">'+dots+'</div>'
    +'<p class="sector-hint">&#9664; &#9654; or the chevrons to cycle</p>'
    +'<button class="continue"'+(open?'':' disabled')+' id="secGo">'+(open?'FLY '+sec.name:'LOCKED')+'</button>'
    +'<button class="continue ghost" id="secBack">BACK</button>'
  +'</div>');
  paintBrand();
  $('#secPrev').onclick=()=>{sfx('ui');cycleSector(-1);};
  $('#secNext').onclick=()=>{sfx('ui');cycleSector(1);};
  $('#secBack').onclick=()=>{sfx('ui');showHome();};
  const go=$('#secGo');
  if(go&&open)go.onclick=()=>{sfx('pick');chosenSector=sec.id;saveProfile();showStart();};
}
function cycleSector(dir){
  sectorPick=(sectorPick+dir+SECTORS.length)%SECTORS.length;
  const sec=SECTORS[sectorPick];
  // the arena is visible behind the modal, so the reel previews the sky too
  if(!sec.soon&&sectorOpen(sec.id)&&!inRun)chosenSector=sec.id;
  paintSectors();
}
const sectorScreenOpen=()=>!!$('#secGo');
const rosterOpen=()=>!!$('#rosterBack');
function showStart(){
  setInRun(false);
  closeHowTo();
  const pilot=characters[chosen]||characters[STARTER];
  const hardStored = localStorage.getItem('shapeshift_hard_beaten') === 'true';
  const hardAvailable = hardStored || devMode;
  const resetRow = confirmingReset
    ? '<div class="reset-row confirming"><span>Erase your best room, '+points+' credits and '+unlocked.size+' unlocked pilot'+(unlocked.size===1?'':'s')+(hardStored?', and re-lock IMPOSSIBLE':'')+'? This cannot be undone.</span><button id="resetNo">CANCEL</button><button id="resetYes" class="danger">ERASE</button></div>'
    : '<div class="reset-row"><span>BEST AREA <b>'+highscore+'</b> <i>&bull;</i> '+points+' CREDITS'+(hardStored?' <i>&bull;</i> IMPOSSIBLE UNLOCKED':devMode?' <i>&bull;</i> IMPOSSIBLE VIA DEV':'')+'</span><button id="resetData">RESET DATA</button></div>';
  show('<div class="modal"><div class="eyebrow">STARWING // '+sectorDef(chosenSector).name+'</div><h2>Choose your difficulty</h2><p>Flying as <b style="color:PILOTCOLOR">PILOTNAME</b> &middot; '+ctrlMove()+(treeHas('dashDrive')?', '+ctrlDash():'')+(pilot.shock?', '+ctrlWave():'')+'. Your cannon fires itself.</p><div class="cards"><div class="card"><span class="card-key">01 // EASY</span><h3>EASY</h3><p>14% less enemy health, 12% slower, 15% softer hits, a thinner crowd, and slower enemy fire that fades sooner.</p><p class="pay">CREDITS &times;0.7 &middot; NO SKILL POINTS</p><button data-difficulty="easy">START EASY</button></div><div class="card"><span class="card-key">02 // MEDIUM</span><h3>MEDIUM</h3><p>Baseline health, speed, damage and numbers. The intended run.</p><p class="pay">CREDITS &times;1</p><button data-difficulty="medium">START MEDIUM</button></div><div class="card"><span class="card-key">03 // HARD</span><h3>HARD</h3><p>+28% health, +20% speed, +35% damage, +22% more enemies, a nastier mix &mdash; and enemy fire that flies 25% faster and hangs about 30% longer.</p><p class="pay">CREDITS &times;1.75</p><button data-difficulty="hard">START HARD</button></div>' + (!hardAvailable ? '<div class="card card-locked"><span class="card-key">04 // LOCKED</span><h3>IMPOSSIBLE</h3><p>Clear area '+IMPOSSIBLE_ROOM+' on HARD to unlock. Easier settings do not count, however far you get. It pays double skill points.</p><p class="pay">BEST AREA '+highscore+' / '+IMPOSSIBLE_ROOM+' &middot; HARD ONLY</p></div>' : '')
    + (hardAvailable ? '<div class="card" style="border-color:#ff0000; box-shadow: 0 0 15px #ff000044;"><span class="card-key" style="color:#ff4f9a">04 // '+(hardStored?'ELITE':'DEV')+'</span><h3 style="color:#ff4f9a">IMPOSSIBLE</h3><p>Triple health, +80% speed, double damage, half again as many enemies, enemy fire 50% faster and lasting 60% longer &mdash; and touching a boss kills you outright.</p><p class="pay hot">CREDITS &times;3 &middot; SKILL &times;2</p><button data-difficulty="impossible" style="background:#ff4f9a">START IMPOSSIBLE</button></div>' : '') + '</div>' + resetRow + '<button class="continue ghost" id="startBack">BACK</button></div>');
  ui.overlay.innerHTML=ui.overlay.innerHTML.replace('PILOTCOLOR',pilot.color).replace('PILOTNAME',pilot.name);
  document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{
    if(!treeHas('w:bow')){showTree();return;}      // no weapon, no run
    confirmingReset=false;clearRun();reset(b.dataset.difficulty);});
  $('#startBack').onclick=()=>{sfx('ui');if(sectorsOpen.size>1)showSectors();else showHome();};
  const ask=$('#resetData'),no=$('#resetNo'),yes=$('#resetYes');
  if(ask)ask.onclick=()=>{confirmingReset=true;showStart();};
  if(no)no.onclick=()=>{confirmingReset=false;showStart();};
  if(yes)yes.onclick=()=>{resetSavedData();confirmingReset=false;showTree();};   // wiped: the cannon has to be taken again
}
// ---- overhaul bay (the upgrade tree) ------------------------------------
const treeAffordable=()=>devMode?0:TREE_NODES.filter(nodeBuyable).length;   // nodeBuyable already excludes hidden groups
// zero anything whose prerequisite has gone away, repeatedly, so dev toggles
// can never leave the tree in a state a normal purchase could not reach
function pruneTree(){
  for(let pass=0;pass<8;pass++){
    let changed=false;
    for(const n of TREE_NODES)if(treeHas(n.id)&&!nodeReqMet(n)){tree[n.id]=0;changed=true;}
    if(!changed)break;
  }
}
// the whole loadout, so a card is read against what you already fly with rather
// than in the abstract. The stat this node moves shows its after-value too, which
// means simulating one more rank of it and putting the tree straight back.
function statBlock(n){
  const key=NODE_STAT[n.id];
  if(!key)return '';
  const before=treeStats();
  let after=before;
  if(!nodeMaxed(n)){
    const held=tree[n.id];
    tree[n.id]=treeRank(n.id)+1;
    after=treeStats();
    if(held===undefined)delete tree[n.id]; else tree[n.id]=held;
  }
  return '<dl class="tip-stats">'+STAT_ORDER.map(k=>{
    const moved=k===key&&after[k]!==before[k];
    return '<dt'+(moved?' class="on"':'')+'>'+STAT_LABEL[k]+'</dt><dd>'+statText(k,before[k])
      +(moved?' <b>&rarr; '+statText(k,after[k])+'</b>':'')+'</dd>';
  }).join('')+'</dl>';
}
function treeNodeHtml(n){
  const rank=treeRank(n.id), maxed=nodeMaxed(n), reqOk=nodeReqMet(n), cost=nodeCost(n);
  const cls=maxed?'own':devMode?'buy':!reqOk?'lock':skill>=cost?'buy':'poor';
  const pips=n.max>1?'<span class="tn-pips">'+Array.from({length:n.max},(_,i)=>'<i'+(i<rank?' class="on"':'')+'></i>').join('')+'</span>':'';
  const granted=nodeGranted(n.id);
  const meta=granted?'INCLUDED':maxed?(n.max>1?'MAX':'OWNED'):(cost===0?'FREE':cost+' SP');
  const missing=n.req.filter(r=>!treeHas(r)).map(r=>TREE_BY_ID[r].name)
    .concat((n.reqMax||[]).filter(r=>!nodeAtMax(r)).map(r=>'every rank of '+TREE_BY_ID[r].name));
  const times=granted
    ? 'Arrives with '+characters[n.grantedBy].name+' at no cost &mdash; nothing to buy here'
    : n.max>1
      ? 'Can be taken '+n.max+' times &mdash; '+rank+' taken'+(maxed?', fully upgraded':', '+(n.max-rank)+' still available')
      : (maxed?'Taken &mdash; this one is a single unlock':'Can be taken once');
  const step=PASSIVE_STEP[n.id]?'<em class="tip-step">Per rank: '+PASSIVE_STEP[n.id]+'</em>':'';
  const tip='<span class="tip"><b>'+n.name+'</b><em>'+n.desc+'</em>'+step+'<i>'+times+'</i>'
    +(maxed?'':'<u>'+(cost===0?'Costs nothing':'Costs '+cost+' SP'+(skill<cost&&!devMode?' &mdash; you have '+skill:''))
      +(n.step&&rank+1<n.max?' &middot; next rank '+nextRankCost(n)+'</u>':'</u>'))
    +(missing.length?'<s>Needs '+missing.join(' + ')+'</s>':'')+statBlock(n)+'</span>';
  return '<button class="tnode '+cls+(n.ult?' ult':'')+'" data-node="'+n.id+'" style="--nc:'+(n.color||'#7fd6ff')+'">'
    +'<span class="tn-name">'+n.name+'</span><span class="tn-meta">'+meta+'</span>'+pips+tip+'</button>';
}
function treeWeaponGroup(id,nodes){
  return '<div class="tgroup"><div class="tg-head"><i style="background:'+nodes[0].color+'"></i><b>'+nodes[0].name+'</b>'
    +'<span class="tg-tier">TIER '+(WEAPON_TIER[id]+1)+'</span></div>'
    +'<div class="trow">'+nodes.map(treeNodeHtml).join('')+'</div></div>';
}
function showTree(){
  setInRun(false);
  closeHowTo();
  const started=treeHas('w:bow');
  const groups={};
  for(const n of TREE_NODES)(groups[n.group]||(groups[n.group]=[])).push(n);
  const shown=TREE_NODES.filter(nodeVisible);
  const taken=shown.reduce((a,n)=>a+treeRank(n.id),0);
  const total=shown.reduce((a,n)=>a+n.max,0);
  const section=(title,note,body)=>'<div class="tbranch"><div class="tb-head"><b>'+title+'</b><span>'+note+'</span></div>'+body+'</div>';
  const byBranch=b=>TREE_NODES.filter(n=>n.branch===b).map(treeNodeHtml).join('');

  let body;
  if(!started){
    // the very first screen: one node, and nothing else to think about yet
    body=section('CORE ARMAMENT','the cannon you always carry',
      '<div class="trow">'+treeNodeHtml(TREE_BY_ID['w:bow'])+'</div>')
      +'<p class="tree-gate">Take the cannon &mdash; it is free. Every other overhaul in the bay opens up once you have it, and is paid for with skill points earned by surviving rooms.</p>';
  }else{
    body=section('CORE ARMAMENT','the cannon you always carry','<div class="trow">'+groups.bow.map(treeNodeHtml).join('')+'</div>')
      +section('ARMAMENTS','unlock weapons so runs can offer them',
        ['laser','sword','bomb','mine','aegis','arc'].filter(id=>!exclusiveWeapons[id]||unlocked.has(exclusiveWeapons[id]))
          .map(id=>treeWeaponGroup(id,groups[id])).join(''))
      +section('SYSTEMS','airframe upgrades a level-up can hand you mid-run','<div class="trow">'+byBranch('systems')+'</div>')
      +section('AMPLIFIERS','raw damage, and the critical hits it opens','<div class="trow">'+byBranch('amp')+'</div>')
      +section('CADENCE','how fast everything you carry fires','<div class="trow">'+byBranch('rate')+'</div>')
      +section('VELOCITY','how fast the airframe moves','<div class="trow">'+byBranch('speed')+'</div>')
      // everything the second sector opens sits together at the foot of the tree
      +(sectorOpen(2)
        ? section('ARMAMENTS V2','hardware recovered from the drift',
            SECTOR2_WEAPONS.map(id=>treeWeaponGroup(id,groups[id])).join(''))
          +section('SYSTEMS V2','the same systems, rebuilt heavier','<div class="trow">'+byBranch('sys2')+'</div>')
          +section('AMPLIFIERS V2','third-stage damage, criticals and cadence','<div class="trow">'+byBranch('amp2')+'</div>')
        : '<div class="tbranch locked-branch"><div class="tb-head"><b>ARMAMENTS V2 &middot; SYSTEMS V2 &middot; AMPLIFIERS V2</b>'
          +'<span>sealed until you reach '+sectorDef(2).name+'</span></div>'
          +'<p class="tree-gate">Clear area '+FINAL_ROOM+' of '+sectorDef(1).name+' on HARD. The drift carries two more weapons, heavier systems, and a third stage on damage, criticals and cadence.</p></div>');
  }
  show('<div class="modal wide tree-modal">'
    +'<div class="eyebrow">OVERHAUL BAY</div><h2>Systems</h2>'
    +'<div class="tree-bar"><span>SKILL POINTS <b'+(devMode?' class="dev"':'')+'>'+(devMode?'DEV':skill)+'</b></span>'
      +'<span>UNLOCKED <b>'+taken+' / '+total+'</b></span>'
      +'<span class="tree-hint">'+(devMode?'Dev mode: click any node to toggle it':'Hover a node for detail')+'</span>'
      +(devMode?'<span class="dev-actions"><button id="treeAll">ENABLE ALL</button><button id="treeNone">CLEAR ALL</button></span>':'')+'</div>'
    +'<div class="tree">'+body+'</div>'
    +(started?'<button class="continue" id="treeBack">BACK</button>':'')
  +'</div>');
  document.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.node, n=TREE_BY_ID[id];
    if(!n)return;
    if(devMode){
      tree[id]=treeRank(id)>=n.max?0:treeRank(id)+1;
      if(!treeHas(id))pruneTree();
      sfx('ui');showTree();return;
    }
    if(!nodeBuyable(n)){sfx('hurt');return;}
    buyNode(id);
    sfx(n.ult?'ult':'level');
    showTree();
  });
  const all=$('#treeAll'), none=$('#treeNone');
  if(all)all.onclick=()=>{sfx('ult');devMaxTree();toast('EVERY OVERHAUL INSTALLED — FLY A NEW RUN TO USE THEM');showTree();};
  if(none)none.onclick=()=>{sfx('ui');devClearTree();toast('OVERHAULS CLEARED — CANNON KEPT');showTree();};
  const back=$('#treeBack'); if(back)back.onclick=()=>{sfx('ui');showHome();};
}
// ---- developer mode -----------------------------------------------------
// a sandbox: the real profile is held aside in memory and nothing is written to
// disk while it is on, so leaving dev mode hands the account back untouched
function enterDev(){
  if(devMode)return;
  devBackup={points,skill,highscore,chosen,unlocked:new Set(unlocked),tree:Object.assign({},tree),
    sectorsOpen:new Set(sectorsOpen),chosenSector,touchMode};
  devMode=true;
  for(const id of Object.keys(characters))unlocked.add(id);
  toast('DEVELOPER MODE ON');
}
function exitDev(){
  if(!devMode)return;
  devMode=false;
  points=devBackup.points;skill=devBackup.skill;highscore=devBackup.highscore;
  chosen=devBackup.chosen;unlocked=devBackup.unlocked;tree=devBackup.tree;
  sectorsOpen=devBackup.sectorsOpen;chosenSector=devBackup.chosenSector;
  setTouchMode(devBackup.touchMode);      // whatever the device itself asked for
  devManual=null;                         // and the manual goes back to teaching it
  devBackup=null;
  savedRun=loadRun();                     // whatever was on disk before we started
  paintBest();
  toast('DEVELOPER MODE OFF — PROFILE RESTORED');
}
// fill the bay in one press. Only visible nodes are touched, so a group still
// behind a pilot or a sector gate cannot be switched on through the back door,
// and granted nodes are left alone — the pilot already owns those.
function devMaxTree(){
  for(const n of TREE_NODES)if(nodeVisible(n)&&!nodeGranted(n.id))tree[n.id]=n.max;
}
// the cannon survives a clear: without it the bay draws its one-node first
// screen, which has no way back out of it
function devClearTree(){
  for(const n of TREE_NODES)if(n.id!=='w:bow')delete tree[n.id];
  tree['w:bow']=TREE_BY_ID['w:bow'].max;
}
// drop the run into any area, from the pause menu. It is a room change rather
// than a portal, so everything in flight — hostiles, shots, mines, a warp that
// was halfway through — is thrown away and the area is built clean.
function devJumpToArea(room){
  if(!state||state.over)return;
  const target=clamp(Math.round(room)||1,1,FINAL_ROOM);
  for(const list of [enemies,arrows,enemyBullets,particles,blasts,delayedBlasts,echoShots,damageNumbers,
    strikes,rings,pulses,beams,mines,wells,rockets,walls,dashGhosts])list.length=0;
  state.room=target;
  state.victoryPortal=null;state.victorySequence=null;state.warp=null;state.portalArm=0;
  state.transitioning=false;state.intermission=false;state.exit=null;state.vacuum=false;
  state.cameraZoom=1;state.cameraRot=0;state.flash=0;state.screenAlpha=0;state.playerAlpha=1;
  state.dying=0;state.hitStop=0;state.hurtFlash=0;state.history=[];
  player.x=RW/2;player.y=RH/2;player.vx=0;player.vy=0;
  confirmingEnd=false;
  state.paused=false;hide();
  beginRoom();
  sfx('ui');toast('DEV JUMP — AREA '+target);
}
// a refit is a free level-up draw — exactly what FIELD REFIT buys, handed over
// mid-run instead of at pre-flight. `n` of 0 clears the queue rather than adding.
// hasDraw is recomputed because toggling nodes in the bay changes what the pool
// can offer while the run is in the air, and a stale false would swallow every
// refit granted here the moment it resumed.
function devGrantRefits(n){
  if(!state||state.over)return;
  state.freeDraws=n?Math.max(0,(state.freeDraws||0)+n):0;
  state.hasDraw=hasDraw();
  sfx('ui');
  toast(!state.hasDraw?'NOTHING LEFT TO DRAW — INSTALL MORE IN THE BAY'
    :state.freeDraws?'REFITS PENDING — '+state.freeDraws+' (RESUME TO SPEND)'
    :'REFITS CLEARED');
  if(state.paused&&!state.upgradeOpen)openPauseMenu();   // repaint the pending count
}
function showDevPrompt(){
  show('<div class="modal dev-modal"><div class="eyebrow">DEVELOPER</div><h2>Enter password</h2>'
    +'<p>Unlocks every pilot, lets you switch any overhaul on or off (or install the whole bay at once), jump a live run to any area and hand yourself free refits from the pause menu, and force the mobile controls on a machine with a keyboard. Your saved profile is set aside while it is on, and handed straight back when you leave.</p>'
    +'<input id="devPass" class="dev-input" type="password" autocomplete="off" spellcheck="false" placeholder="PASSWORD">'
    +'<div class="dev-msg" id="devMsg"></div>'
    +'<button class="continue" id="devGo">ENTER</button>'
    +'<button class="continue ghost" id="devCancel">CANCEL</button></div>');
  const go=()=>{
    const el=$('#devPass');
    if(el&&el.value==='bunnybob'){enterDev();showHome();}
    else{const m=$('#devMsg');if(m)m.textContent='WRONG PASSWORD';sfx('hurt');}
  };
  $('#devGo').onclick=go;
  $('#devCancel').onclick=()=>{sfx('ui');showHome();};
  const inp=$('#devPass');
  if(inp){inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go();}};if(inp.focus)inp.focus();}
}
const fsTarget=()=>document.querySelector('.game-wrap');
// iOS has no element fullscreen API at all — only a <video> can go fullscreen
// there — so on every browser on an iPhone `enter` was undefined and the button
// did nothing whatsoever, with no feedback to say why. When the real thing is
// missing, or the browser refuses the request, we stand in for it: `body.fs-fallback`
// pins the arena over the page at canvas aspect and hides the chrome. It cannot
// retract Safari's own toolbars — nothing on the page can — but it wins back the
// topbar and the footer, and the same button turns it off again.
let fsFallback=false;
const fsNative=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
const fsCanNative=()=>{const el=fsTarget();return !!(el&&(el.requestFullscreen||el.webkitRequestFullscreen));};
const fsActive=()=>fsNative()||fsFallback;
function setFsFallback(on){
  fsFallback=!!on;
  document.body.classList.toggle('fs-fallback',fsFallback);
  paintFsBtn();
  measureCanvas();      // the arena just changed size, and the pads are hit-tested against it
}
function toggleFullscreen(){
  const el=fsTarget();
  if(!el)return;
  if(fsFallback){setFsFallback(false);return;}
  if(!fsCanNative()){setFsFallback(true);return;}
  if(fsNative()){
    try{
      const exit=document.exitFullscreen||document.webkitExitFullscreen;
      if(exit){const r=exit.call(document);if(r&&r.catch)r.catch(()=>{});}
    }catch(e){}
    return;                 // a failed exit must not drop the stand-in on top of real fullscreen
  }
  try{
    const enter=el.requestFullscreen||el.webkitRequestFullscreen;
    // a rejected request (permissions policy in an iframe, a browser that simply
    // says no) lands on the stand-in rather than on nothing happening at all
    const r=enter.call(el);if(r&&r.catch)r.catch(()=>setFsFallback(true));
  }catch(e){setFsFallback(true);}
}
function paintFsBtn(){
  const on=fsActive();
  // the in-arena cluster is the only chrome that survives fullscreen — the topbar
  // is display:none in the stand-in, and outside the painted subtree natively —
  // so one class drives it for both paths
  document.body.classList.toggle('fs-on',on);
  if(!ui.fsBtn)return;
  ui.fsBtn.textContent=on?'\u2715':'\u26F6';
  ui.fsBtn.title=touchMode?(on?'Exit fullscreen':'Fullscreen')
    :on?(fsFallback?'Exit fullscreen (F)':'Exit fullscreen (F or Esc)'):'Fullscreen (F)';
  ui.fsBtn.classList.toggle('on',on);
}
addEventListener('fullscreenchange',()=>{paintFsBtn();measureCanvas();});
addEventListener('webkitfullscreenchange',()=>{paintFsBtn();measureCanvas();});
if(ui.fsBtn)ui.fsBtn.onclick=toggleFullscreen;
// fullscreen hides the topbar, so pause, mute and the way out are repeated inside
// the arena where they still render
if(ui.fsExit)ui.fsExit.onclick=toggleFullscreen;
if(ui.fsPause)ui.fsPause.onclick=()=>pause();
if(ui.fsMute)ui.fsMute.onclick=()=>{initAudio();setSound(!soundOn);sfx('ui');};
if(ui.soundBtn)ui.soundBtn.onclick=()=>{initAudio();setSound(!soundOn);sfx('ui');};
paintSoundBtn();
// browsers only allow audio to start from a gesture, so open the context on the first one
addEventListener('pointerdown',()=>{if(soundOn)initAudio();},{once:true});
$('#pauseBtn').onclick=pause;
paintBest();paintBrand();paintControlHints();measureCanvas();setInRun(false);if(treeHas('w:bow'))showHome();else showTree();requestAnimationFrame(frame);
