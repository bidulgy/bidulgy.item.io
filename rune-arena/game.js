"use strict";

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);

const characters = [
  { id: "swordsman", name: "검사", color: "#2de2e6", className: "", desc: "충전 시간에 따라 휘두르기, 검기, 돌진을 전환하는 균형형 전투 유닛.", hp: 100, speed: 280, damage: 1, stats: [78, 58, 82] },
  { id: "guardian", name: "수호자", color: "#56a8ff", className: "guardian", desc: "방패로 피해를 줄이고 가까운 적을 밀어내는 안정적인 방어 유닛.", hp: 145, speed: 225, damage: .82, stats: [58, 94, 50] },
  { id: "mage", name: "룬술사", color: "#b36dff", className: "mage", desc: "기력 회복이 빠르고 룬 투사체와 폭발로 거리를 유지하는 원거리 유닛.", hp: 82, speed: 255, damage: 1.16, stats: [90, 42, 70] }
];

const bosses = [
  { name: "철갑 감시자", color: "#ff5b68", hp: 260, speed: 110, damage: 13, style: "charge", desc: "직선 돌진과 무거운 충격파" },
  { name: "잿불 핵", color: "#ff814a", hp: 230, speed: 125, damage: 12, style: "rings", desc: "팽창하는 원형 화염 고리" },
  { name: "서리 궤도", color: "#65cfff", hp: 245, speed: 105, damage: 11, style: "orbs", desc: "느리지만 오래 남는 얼음탄" },
  { name: "번개 축전기", color: "#f6db58", hp: 215, speed: 165, damage: 10, style: "dash", desc: "빠른 연속 이동과 전기 흔적" },
  { name: "가시 포식자", color: "#7fe06a", hp: 275, speed: 105, damage: 14, style: "burst", desc: "사방으로 퍼지는 가시탄" },
  { name: "공허의 눈", color: "#a978ff", hp: 235, speed: 118, damage: 13, style: "beam", desc: "긴 예고 뒤 발사되는 광선" },
  { name: "프리즘 기사", color: "#ff77c8", hp: 250, speed: 135, damage: 12, style: "fan", desc: "부채꼴 검기와 방향 전환" },
  { name: "무음 집행자", color: "#e6eaf2", hp: 290, speed: 128, damage: 15, style: "mixed", desc: "다른 수호자의 패턴을 혼합" }
];

const $ = (s) => document.querySelector(s);
const screens = [...document.querySelectorAll(".screen")];
const canvas = $("#gameCanvas");
const ctx = canvas.getContext("2d");
let selectedCharacter = 0;
let bossPage = 0;

const state = {
  running: false, paused: false, raf: 0, last: 0, elapsed: 0, wave: 0,
  order: [], player: null, boss: null, projectiles: [], effects: [], warnings: [],
  keys: new Set(), mouse: { x: 640, y: 360, down: false, started: 0 },
  dash: null, impaled: 0, bossStun: 0, nextWave: 0, kills: 0, damageTaken: 0,
  invulnerable: 0, dodgeCd: 0, skillCd: 0, supportCd: 0, ultCd: 0
};

function showScreen(id) {
  screens.forEach(s => s.classList.toggle("active", s.id === id));
}

function orbMarkup(c) {
  return `<div class="unit-preview"><div class="orb ${c.className}" style="--orb:${c.color}"><i class="weapon-shape"></i></div></div>`;
}

function renderCharacters() {
  $("#characterCards").innerHTML = characters.map((c, i) => `
    <button class="character-card ${i === selectedCharacter ? "selected" : ""}" style="--card-color:${c.color}" data-character="${i}" role="radio" aria-checked="${i === selectedCharacter}">
      ${orbMarkup(c)}<h3>${c.name}</h3><p>${c.desc}</p>
    </button>`).join("");
  const c = characters[selectedCharacter];
  $("#selectedDetail").innerHTML = `<div><p class="eyebrow">선택됨</p><h2>${c.name}</h2><p>${c.desc}</p></div><div>${["공격", "방어", "속도"].map((n,i)=>`<div class="stat"><span>${n}</span><div class="stat-track"><i style="width:${c.stats[i]}%;background:${c.color}"></i></div></div>`).join("")}</div>`;
  document.querySelectorAll("[data-character]").forEach(btn => btn.onclick = () => { selectedCharacter = Number(btn.dataset.character); renderCharacters(); });
}

function renderBossPage() {
  const page = bosses.slice(bossPage * 4, bossPage * 4 + 4);
  $("#bossCards").innerHTML = page.map((b, i) => `<article class="boss-card"><div class="boss-orb" style="--boss-color:${b.color}"></div><p class="eyebrow">BOSS ${bossPage * 4 + i + 1}</p><h3>${b.name}</h3><p>${b.desc}</p></article>`).join("");
  $("#bossPage").textContent = `${bossPage + 1} / 2`;
  $("#bossPrev").disabled = bossPage === 0;
  $("#bossNext").disabled = bossPage === 1;
}

document.querySelectorAll(".open-bosses").forEach(b => b.onclick = () => { bossPage = 0; renderBossPage(); $("#bossDialog").showModal(); });
$("#bossClose").onclick = () => $("#bossDialog").close();
$("#bossPrev").onclick = () => { bossPage = Math.max(0, bossPage - 1); renderBossPage(); };
$("#bossNext").onclick = () => { bossPage = Math.min(1, bossPage + 1); renderBossPage(); };
$("#helpButton").onclick = () => $("#helpDialog").showModal();
$("#helpClose").onclick = () => $("#helpDialog").close();
$("#startButton").onclick = () => { renderCharacters(); showScreen("select"); };
$("#selectBack").onclick = () => showScreen("menu");
$("#battleButton").onclick = startRun;
$("#pauseButton").onclick = togglePause;
$("#resumeButton").onclick = togglePause;
$("#quitButton").onclick = quitRun;
$("#retryButton").onclick = startRun;
$("#resultSelectButton").onclick = () => { renderCharacters(); showScreen("select"); };
$("#resultMenuButton").onclick = () => showScreen("menu");

function shuffledBosses() {
  const a = bosses.map((_, i) => i);
  for (let i = a.length - 1; i; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startRun() {
  cancelAnimationFrame(state.raf);
  const c = characters[selectedCharacter];
  Object.assign(state, { running: true, paused: false, last: performance.now(), elapsed: 0, wave: 0, order: shuffledBosses(), projectiles: [], effects: [], warnings: [], dash: null, impaled: 0, bossStun: 0, nextWave: 0, kills: 0, damageTaken: 0, invulnerable: 0, dodgeCd: 0, skillCd: 0, supportCd: 0, ultCd: 0 });
  state.player = { x: 250, y: 540, r: 31, hp: c.hp, maxHp: c.hp, energy: 100, maxEnergy: 100, angle: 0, color: c.color, speed: c.speed, damage: c.damage, id: c.id };
  spawnBoss();
  $("#pauseOverlay").hidden = true;
  showScreen("game");
  state.raf = requestAnimationFrame(loop);
}

function spawnBoss() {
  const base = bosses[state.order[state.wave]];
  const scale = 1 + state.wave * .095;
  state.boss = { ...base, x: 1010, y: 220, r: 58, maxHp: Math.round(base.hp * scale), hp: Math.round(base.hp * scale), angle: Math.PI, attackCd: 1.3, phase: "idle", charge: 0, targetX: 0, targetY: 0 };
  state.projectiles.length = 0; state.warnings.length = 0;
  $("#waveLabel").textContent = `웨이브 ${state.wave + 1} / 8`;
  $("#bossName").textContent = base.name;
  message(`${state.wave + 1} WAVE · ${base.name}`, 1.4);
}

function arena() { return { l: 46, r: 1234, t: 46, b: 674 }; }
function pointerPosition(e) { const r = canvas.getBoundingClientRect(); state.mouse.x = (e.clientX - r.left) * canvas.width / r.width; state.mouse.y = (e.clientY - r.top) * canvas.height / r.height; }
canvas.addEventListener("pointermove", pointerPosition);
canvas.addEventListener("pointerdown", e => { pointerPosition(e); if (!state.running || state.paused) return; state.mouse.down = true; state.mouse.started = performance.now(); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", e => { pointerPosition(e); if (!state.mouse.down) return; const held = (performance.now() - state.mouse.started) / 1000; state.mouse.down = false; performAttack(held); });
window.addEventListener("keydown", e => {
  if (["w","a","s","d","shift","q","e"," "].includes(e.key.toLowerCase())) e.preventDefault();
  state.keys.add(e.key.toLowerCase());
  if (!state.running) return;
  if (e.key === "Escape") togglePause();
  if (e.key === "Shift") dodge();
  if (e.key.toLowerCase() === "q") skillQ();
  if (e.key.toLowerCase() === "e") skillE();
  if (e.code === "Space") ultimate();
});
window.addEventListener("keyup", e => state.keys.delete(e.key.toLowerCase()));

function performAttack(held) {
  if (!state.running || state.paused || !state.player || state.nextWave) return;
  if (state.impaled > 0) { ultimate(); return; }
  const p = state.player;
  if (held < .42) {
    slash(p.x, p.y, p.angle, 104, 17 * p.damage);
    state.effects.push({ type: "arc", x:p.x, y:p.y, angle:p.angle, life:.22, max:.22, color:p.color });
  } else if (held < 1.05) {
    shoot(p.x, p.y, p.angle, 620, 25 * p.damage, p.color, "player", 13, "swordWave");
  } else if (p.energy >= 24) {
    p.energy -= 24;
    state.dash = { vx: Math.cos(p.angle) * 960, vy: Math.sin(p.angle) * 960, time: .34, hit: false };
    state.invulnerable = .38;
  }
}

function slash(x, y, angle, range, damage) {
  const b = state.boss; if (!b || state.nextWave) return;
  const dx = b.x - x, dy = b.y - y;
  if (Math.hypot(dx,dy) < range + b.r && Math.abs(angleDiff(Math.atan2(dy,dx), angle)) < .9) hurtBoss(damage);
}

function shoot(x,y,angle,speed,damage,color,owner,r=10,kind="normal") { state.projectiles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r,damage,color,owner,kind,life:2.5}); }
function angleDiff(a,b) { return Math.atan2(Math.sin(a-b),Math.cos(a-b)); }

function dodge() {
  if (!state.running || state.paused || state.dodgeCd > 0 || state.impaled > 0) return;
  const p = state.player; let dx = 0, dy = 0;
  if(state.keys.has("a")) dx--; if(state.keys.has("d")) dx++; if(state.keys.has("w")) dy--; if(state.keys.has("s")) dy++;
  if (!dx && !dy) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
  const m = Math.hypot(dx,dy); state.dash = { vx:dx/m*780, vy:dy/m*780, time:.2, hit:true };
  state.invulnerable=.32; state.dodgeCd=1.4;
}

function skillQ() {
  if (!state.running || state.paused || state.skillCd > 0) return;
  const p=state.player; state.skillCd=4.2;
  if(p.id === "swordsman") { for(let i=-1;i<=1;i++) shoot(p.x,p.y,p.angle+i*.16,700,18*p.damage,p.color,"player",10,"skill"); }
  if(p.id === "guardian") { state.invulnerable=1.3; state.effects.push({type:"shield",x:p.x,y:p.y,life:1.3,max:1.3,color:p.color}); if(dist(p,state.boss)<180) hurtBoss(22*p.damage); }
  if(p.id === "mage") { for(let i=0;i<8;i++) shoot(p.x,p.y,i*TAU/8,500,13*p.damage,p.color,"player",9,"skill"); }
}

function skillE() {
  if (!state.running || state.paused || state.supportCd > 0) return;
  const p=state.player; state.supportCd=6;
  if(p.id === "swordsman") { state.effects.push({type:"field",x:state.boss.x,y:state.boss.y,life:1,max:1,color:p.color}); hurtBoss(26*p.damage); }
  if(p.id === "guardian") { p.hp=Math.min(p.maxHp,p.hp+22); state.effects.push({type:"heal",x:p.x,y:p.y,life:.8,max:.8,color:p.color}); }
  if(p.id === "mage") { for(let i=0;i<5;i++) shoot(p.x,p.y,p.angle+(i-2)*.12,760,15*p.damage,p.color,"player",8,"skill"); }
}

function ultimate() {
  if (!state.running || state.paused || state.ultCd > 0 || state.player.energy < 45) return;
  const p=state.player; p.energy-=45; state.ultCd=10;
  const target = state.impaled>0 ? state.boss : p;
  state.effects.push({type:"blast",x:target.x,y:target.y,life:.8,max:.8,color:p.color});
  if(dist(target,state.boss)<150) hurtBoss(55*p.damage);
  if(state.impaled>0){state.impaled=0;state.bossStun=.25; p.x-=Math.cos(p.angle)*70;p.y-=Math.sin(p.angle)*70;}
}

function hurtBoss(amount) {
  const b=state.boss; if(!b||state.nextWave)return;
  b.hp=Math.max(0,b.hp-amount); state.effects.push({type:"hit",x:b.x+rand(-20,20),y:b.y+rand(-20,20),life:.25,max:.25,color:"#fff"});
  if(b.hp<=0) bossDefeated();
}
function hurtPlayer(amount) {
  if(state.invulnerable>0||state.nextWave)return;
  const p=state.player; p.hp=Math.max(0,p.hp-amount); state.damageTaken+=amount; state.invulnerable=.55;
  state.effects.push({type:"hit",x:p.x,y:p.y,life:.3,max:.3,color:"#ff4655"});
  if(p.hp<=0) finish(false);
}

function bossDefeated() {
  state.kills++; state.nextWave=2.2; state.bossStun=99; state.player.energy=Math.min(100,state.player.energy+35); state.player.hp=Math.min(state.player.maxHp,state.player.hp+Math.round(state.player.maxHp*.18));
  message("보스 처치",1.4);
}

function update(dt) {
  if(state.paused||!state.running)return;
  state.elapsed+=dt;
  ["invulnerable","dodgeCd","skillCd","supportCd","ultCd","impaled","bossStun"].forEach(k=>state[k]=Math.max(0,state[k]-dt));
  const p=state.player,b=state.boss,a=arena();
  p.angle=Math.atan2(state.mouse.y-p.y,state.mouse.x-p.x);
  p.energy=Math.min(p.maxEnergy,p.energy+dt*(p.id==="mage"?19:13));
  if(state.nextWave>0){state.nextWave-=dt;if(state.nextWave<=0){state.wave++;if(state.wave>=8)finish(true);else spawnBoss();}return;}
  if(state.impaled<=0){
    let dx=0,dy=0;if(state.keys.has("a"))dx--;if(state.keys.has("d"))dx++;if(state.keys.has("w"))dy--;if(state.keys.has("s"))dy++;
    if(dx||dy){const m=Math.hypot(dx,dy);p.x+=dx/m*p.speed*dt;p.y+=dy/m*p.speed*dt;}
  }
  if(state.dash){p.x+=state.dash.vx*dt;p.y+=state.dash.vy*dt;state.dash.time-=dt;state.effects.push({type:"trail",x:p.x,y:p.y,life:.24,max:.24,color:p.color});
    if(!state.dash.hit&&dist(p,b)<p.r+b.r+16){state.dash.hit=true;state.dash.time=0;state.impaled=2;state.bossStun=2;hurtBoss(34*p.damage);p.x=b.x-Math.cos(p.angle)*(p.r+b.r-5);p.y=b.y-Math.sin(p.angle)*(p.r+b.r-5);message("검이 꽂혔습니다 · 스킬 사용 가능",1.2);}
    if(state.dash.time<=0)state.dash=null;
  }
  p.x=clamp(p.x,a.l+p.r,a.r-p.r);p.y=clamp(p.y,a.t+p.r,a.b-p.r);
  if(state.bossStun<=0) updateBoss(dt);
  updateProjectiles(dt);
  updateEffects(dt);
  updateHud();
}

function updateBoss(dt) {
  const b=state.boss,p=state.player,a=arena(); if(!b)return;
  b.attackCd-=dt; b.angle=Math.atan2(p.y-b.y,p.x-b.x);
  if(b.phase==="idle"){
    const d=dist(b,p);if(d>260){b.x+=Math.cos(b.angle)*b.speed*dt;b.y+=Math.sin(b.angle)*b.speed*dt;}
    if(b.attackCd<=0) beginBossAttack();
  } else if(b.phase==="warn"){
    b.charge-=dt;if(b.charge<=0) executeBossAttack();
  } else if(b.phase==="charge"){
    b.x+=Math.cos(b.angle)*b.speed*4.8*dt;b.y+=Math.sin(b.angle)*b.speed*4.8*dt;b.charge-=dt;
    if(dist(b,p)<b.r+p.r)hurtPlayer(b.damage*1.35);if(b.charge<=0){b.phase="idle";b.attackCd=1.5;}
  }
  b.x=clamp(b.x,a.l+b.r,a.r-b.r);b.y=clamp(b.y,a.t+b.r,a.b-b.r);
}

function beginBossAttack() {
  const b=state.boss,p=state.player; b.phase="warn";b.charge=.75;b.targetX=p.x;b.targetY=p.y;
  const type=b.style==="mixed"?["fan","burst","beam"][Math.floor(Math.random()*3)]:b.style;
  b.current=type;
  state.warnings=[{type:type==="rings"?"circle":type==="beam"||type==="charge"||type==="dash"?"line":type==="burst"||type==="orbs"?"circle":"cone",x:b.x,y:b.y,tx:p.x,ty:p.y,life:.75,max:.75,color:b.color}];
}

function executeBossAttack() {
  const b=state.boss,t=b.current;b.phase="idle";b.attackCd=rand(1.1,1.8);state.warnings=[];
  if(t==="charge"||t==="dash"){b.phase="charge";b.charge=.6;return;}
  if(t==="rings"){for(let i=-1;i<=1;i++)shoot(b.x,b.y,b.angle+i*.18,270,b.damage,b.color,"boss",23,"ring");return;}
  if(t==="beam"){const a=Math.atan2(b.targetY-b.y,b.targetX-b.x);for(let i=0;i<7;i++)shoot(b.x,b.y,a+(i-3)*.018,760,b.damage,b.color,"boss",10);return;}
  if(t==="fan"){for(let i=-2;i<=2;i++)shoot(b.x,b.y,b.angle+i*.2,420,b.damage,b.color,"boss",12);return;}
  const count=t==="orbs"?6:10;for(let i=0;i<count;i++)shoot(b.x,b.y,i*TAU/count+(t==="orbs"?.2:0),t==="orbs"?230:380,b.damage,b.color,"boss",t==="orbs"?19:11,t==="orbs"?"ring":"normal");
}

function updateProjectiles(dt) {
  const a=arena();
  state.projectiles.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;});
  for(const wave of state.projectiles){
    if(wave.life<=0||wave.owner!=="player"||wave.kind!=="swordWave")continue;
    for(const ring of state.projectiles){
      if(ring.life<=0||ring.owner!=="boss"||ring.kind!=="ring")continue;
      if(dist(wave,ring)<wave.r+ring.r){
        wave.life=0;ring.life=0;
        state.effects.push({type:"ringBurst",x:ring.x,y:ring.y,life:.55,max:.55,color:ring.color});
        if(dist(ring,state.boss)<235){hurtBoss(34*state.player.damage);message("링 역폭발",.65);}
        break;
      }
    }
  }
  state.projectiles.forEach(q=>{if(q.life<=0)return;if(q.owner==="player"&&dist(q,state.boss)<q.r+state.boss.r){hurtBoss(q.damage);q.life=0;}if(q.owner==="boss"&&dist(q,state.player)<q.r+state.player.r){hurtPlayer(q.damage);q.life=0;}if(q.x<a.l||q.x>a.r||q.y<a.t||q.y>a.b)q.life=0;});
  state.projectiles=state.projectiles.filter(q=>q.life>0);
}

function updateEffects(dt){state.effects.forEach(e=>{e.life-=dt;if(e.type==="enemyRing"){const progress=1-e.life/e.max;const radius=progress*240;if(Math.abs(dist(e,state.player)-radius)<18)hurtPlayer(e.damage);}});state.effects=state.effects.filter(e=>e.life>0);state.warnings.forEach(w=>w.life-=dt);}

function updateHud(){const p=state.player,b=state.boss;if(!p||!b)return;$("#bossHpFill").style.width=`${b.hp/b.maxHp*100}%`;$("#playerHpFill").style.width=`${p.hp/p.maxHp*100}%`;$("#energyFill").style.width=`${p.energy}%`;$("#playerHpText").textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$("#energyText").textContent=Math.floor(p.energy);}

function loop(t){const dt=Math.min(.033,(t-state.last)/1000||0);state.last=t;update(dt);draw();if(state.running)state.raf=requestAnimationFrame(loop);}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);const a=arena();
  ctx.fillStyle="#050912";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a111c";ctx.fillRect(a.l,a.t,a.r-a.l,a.b-a.t);
  ctx.strokeStyle="#152335";ctx.lineWidth=1;for(let x=a.l;x<a.r;x+=64){ctx.beginPath();ctx.moveTo(x,a.t);ctx.lineTo(x,a.b);ctx.stroke();}for(let y=a.t;y<a.b;y+=64){ctx.beginPath();ctx.moveTo(a.l,y);ctx.lineTo(a.r,y);ctx.stroke();}
  ctx.strokeStyle="#2de2e6";ctx.lineWidth=3;ctx.shadowColor="#2de2e6";ctx.shadowBlur=12;ctx.strokeRect(a.l,a.t,a.r-a.l,a.b-a.t);ctx.shadowBlur=0;
  state.warnings.forEach(drawWarning);state.effects.forEach(drawEffect);state.projectiles.forEach(q=>drawProjectile(q));
  if(state.boss) drawUnit(state.boss,true);if(state.player)drawUnit(state.player,false);
  if(state.mouse.down&&state.player){const charge=clamp((performance.now()-state.mouse.started)/1050,0,1);ctx.strokeStyle=charge>=1?"#fff":state.player.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(state.player.x,state.player.y,state.player.r+13,-Math.PI/2,-Math.PI/2+TAU*charge);ctx.stroke();}
}

function drawUnit(u,isBoss){
  ctx.save();ctx.translate(u.x,u.y);ctx.strokeStyle=isBoss?u.color:u.color;ctx.lineWidth=isBoss?7:5;ctx.shadowColor=u.color;ctx.shadowBlur=16;ctx.fillStyle="#07101a";ctx.beginPath();ctx.arc(0,0,u.r,0,TAU);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  const plates=isBoss?5:3;for(let i=0;i<plates;i++){const a=i*TAU/plates;ctx.save();ctx.rotate(a);ctx.translate(u.r+3,0);ctx.fillStyle="#6d788c";ctx.strokeStyle="#c9d4e2";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-17);ctx.lineTo(12,-12);ctx.lineTo(17,0);ctx.lineTo(12,12);ctx.lineTo(-14,17);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  ctx.rotate(u.angle);ctx.fillStyle=u.color;ctx.shadowColor=u.color;ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(u.r-4,-6);ctx.lineTo(u.r+(isBoss?100:62),-6);ctx.lineTo(u.r+(isBoss?126:82),0);ctx.lineTo(u.r+(isBoss?100:62),6);ctx.lineTo(u.r-4,6);ctx.closePath();ctx.fill();ctx.restore();
}

function drawProjectile(q){ctx.save();ctx.fillStyle=q.color;ctx.strokeStyle=q.color;ctx.lineWidth=5;ctx.shadowColor=q.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,TAU);if(q.kind==="ring")ctx.stroke();else ctx.fill();ctx.restore();}
function drawWarning(w){const alpha=clamp(w.life/w.max,.18,.55);ctx.save();ctx.fillStyle=`${w.color}55`;ctx.strokeStyle=w.color;ctx.lineWidth=2;ctx.setLineDash([10,8]);const angle=Math.atan2(w.ty-w.y,w.tx-w.x);if(w.type==="circle"){ctx.beginPath();ctx.arc(w.x,w.y,210,0,TAU);ctx.fill();ctx.stroke();}else if(w.type==="line"){ctx.translate(w.x,w.y);ctx.rotate(angle);ctx.fillRect(0,-40,480,80);ctx.strokeRect(0,-40,480,80);}else{ctx.translate(w.x,w.y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,430,-.45,.45);ctx.closePath();ctx.fill();ctx.stroke();}ctx.globalAlpha=alpha;ctx.restore();}
function drawEffect(e){const p=1-e.life/e.max;ctx.save();ctx.globalAlpha=e.life/e.max;ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=14;if(e.type==="arc"){ctx.lineWidth=9;ctx.beginPath();ctx.arc(e.x,e.y,78,e.angle-.8,e.angle+.8);ctx.stroke();}else if(e.type==="trail"){ctx.beginPath();ctx.arc(e.x,e.y,22*(1-p),0,TAU);ctx.fill();}else if(e.type==="hit"){for(let i=0;i<6;i++){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(i*TAU/6);ctx.fillRect(0,-2,36*p,4);ctx.restore();}}else if(e.type==="ringBurst"){ctx.lineWidth=10*(1-p)+2;ctx.beginPath();ctx.arc(e.x,e.y,105*p,0,TAU);ctx.stroke();}else{ctx.lineWidth=8;ctx.beginPath();ctx.arc(e.x,e.y,120*p,0,TAU);ctx.stroke();}ctx.restore();}

let messageTimer=0;function message(text,seconds){const el=$("#countdown");el.textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>el.textContent="",seconds*1000);}
function togglePause(){if(!state.running)return;state.paused=!state.paused;$("#pauseOverlay").hidden=!state.paused;if(!state.paused){state.last=performance.now();}}
function quitRun(){state.running=false;cancelAnimationFrame(state.raf);$("#pauseOverlay").hidden=true;showScreen("menu");}

function finish(won){state.running=false;cancelAnimationFrame(state.raf);const bestKey="runeArenaBest";const old=Number(localStorage.getItem(bestKey)||0);if(won&&(!old||state.elapsed<old))localStorage.setItem(bestKey,String(state.elapsed));const best=Number(localStorage.getItem(bestKey)||0);$("#resultEyebrow").textContent=won?"RUN COMPLETE":"RUN FAILED";$("#resultTitle").textContent=won?"8웨이브 돌파":"전투 불능";$("#resultStats").innerHTML=`<div>처치 보스<b>${state.kills} / 8</b></div><div>진행 시간<b>${formatTime(state.elapsed)}</b></div><div>최고 기록<b>${best?formatTime(best):"--:--"}</b></div>`;showScreen("result");}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;}

renderCharacters();renderBossPage();
