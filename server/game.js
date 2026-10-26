// Authoritative game world. The server decides movement, combat, damage, deaths and rewards;
// clients only send intentions (move here / attack that / chat).
import fs from 'node:fs';
import path from 'node:path';
import { MAP, TOWN, SPAWN, VIEW_RADIUS, TICK_HZ, SNAP_HZ, MONSTERS, LOOKS, buildWorld, isSafe, findPath, expNeed, statsFor, dirOf, rng } from '../shared/world.js';

const W = buildWorld();
const DT = 1 / TICK_HZ;
const R = Math.random;
let nextId = 1;
const ents = new Map();          // id -> entity
const clients = new Set();       // connected client records
const now = () => Date.now();

// ── persistence (JSON file; swap for a real database later)
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch { saves = {}; }
let saveDirty = false;
function persist(p) { saves[p.name.toLowerCase()] = { name: p.name, look: p.look, level: p.level, exp: p.exp, gold: p.gold, align: p.align, kills: p.kills }; saveDirty = true; }
setInterval(() => { if (!saveDirty) return; saveDirty = false; fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFile(SAVE_FILE + '.tmp', JSON.stringify(saves), () => fs.rename(SAVE_FILE + '.tmp', SAVE_FILE, () => {})); }, 5000);

// ── helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function near(x, y, r, pred) { const out = []; for (const e of ents.values()) if (Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r && (!pred || pred(e))) out.push(e); return out; }
function broadcastNear(x, y, msg, r = VIEW_RADIUS) { const s = JSON.stringify(msg); for (const c of clients) if (c.player && Math.abs(c.player.x - x) <= r && Math.abs(c.player.y - y) <= r) c.sock.send(s); }
function sendTo(p, msg) { if (p.client) p.client.sock.send(JSON.stringify(msg)); }
function sys(p, text) { sendTo(p, { t: 'chat', sys: true, msg: text }); }
function bump(e) { e.metaVer++; }

function canFight(a, b) {
  if (!a || !b || a === b || a.dead || b.dead) return false;
  if (a.kind === 'monster' && b.kind === 'monster') return false;
  if (isSafe(a.x, a.y) || isSafe(b.x, b.y)) return false;
  return true;
}

// ── spawning
function spawnMonster(type, sx, sy) {
  const m = MONSTERS[type];
  const e = { id: nextId++, kind: 'monster', type, sprite: type, name: m.name, level: m.level, x: sx, y: sy, sx, sy, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, speed: m.speed,
    range: m.ranged || 1.45, ranged: !!m.ranged, atkSpeed: 1300, cd: 0, path: null, pathT: 0, target: null, dir: Math.floor(R() * 8), anim: 'idle', dead: false, metaVer: 1, wanderT: 0 };
  ents.set(e.id, e); return e;
}
function freeTileIn(ring, r) {
  const c = (TOWN.x0 + TOWN.x1) / 2 + .5;
  for (let i = 0; i < 4000; i++) {
    const x = 3 + Math.floor(r() * (MAP - 6)), y = 3 + Math.floor(r() * (MAP - 6));
    const d = Math.max(Math.abs(x + .5 - c), Math.abs(y + .5 - c)); if (d < ring[0] || d > ring[1]) continue;
    if (W.monsterBlock[y * MAP + x]) continue; return [x + .5, y + .5];
  }
  return [20.5, 20.5];
}
{ const r = rng(7); for (const [type, m] of Object.entries(MONSTERS)) for (let i = 0; i < m.count; i++) { const [x, y] = freeTileIn(m.ring, r); spawnMonster(type, x, y); } }

// ── movement
function setPath(e, tx, ty) {
  const blk = e.kind === 'monster' ? W.monsterBlock : W.block;
  const p = findPath(blk, Math.floor(e.x), Math.floor(e.y), Math.floor(tx), Math.floor(ty));
  e.path = p && p.length ? p : null; return !!e.path;
}
function step(e, dt) {
  if (!e.path || !e.path.length) { e.moving = false; return; }
  const [nx, ny] = e.path[0]; const tx = nx + .5, ty = ny + .5;
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), sp = e.speed * dt;
  if (d <= sp) { e.x = tx; e.y = ty; e.path.shift(); } else { e.x += dx / d * sp; e.y += dy / d * sp; }
  e.moving = true; if (d > 1e-3) e.dir = dirOf(dx, dy);
}
function face(e, t) { e.dir = dirOf(t.x - e.x, t.y - e.y); }

// ── combat
function attack(a, b) {
  a.cd = now() + a.atkSpeed; face(a, b);
  broadcastNear(a.x, a.y, { t: 'ev', k: 'atk', a: a.id, b: b.id, r: a.ranged ? 1 : 0 });
  const delay = a.ranged ? 120 + dist(a, b) * 60 : 220;
  setTimeout(() => {
    if (!canFight(a, b)) return;
    if (!a.ranged && dist(a, b) > a.range + 1) return;   // target stepped out of reach mid-swing
    const crit = R() < .1; let dmg = a.atk * (0.85 + R() * .3) - b.def * .6; if (crit) dmg *= 1.6; dmg = Math.max(1, Math.round(dmg));
    damage(b, dmg, a, crit);
  }, delay);
}
function damage(b, dmg, a, crit) {
  b.hp -= dmg;
  broadcastNear(b.x, b.y, { t: 'ev', k: 'dmg', b: b.id, v: dmg, c: crit ? 1 : 0 });
  if (b.kind === 'monster' && (!b.target || !ents.has(b.target.id))) b.target = a;
  if (b.kind === 'player') { if (!b.target && !b.path) { b.target = a; b.engaged = true; } if (a.kind === 'player' && !isSafe(b.x, b.y)) { /* victim may retaliate freely */ } }
  if (a.kind === 'player' && b.kind === 'player' && b.align >= 0 && !(b.flagT > now())) { if (!(a.flagT > now())) sys(a, '선량한 모험가를 공격했습니다. 1분 동안 보라색 이름(공격자)으로 표시됩니다.'); a.flagT = now() + 60000; bump(a); }
  if (b.hp <= 0) kill(b, a);
}
function kill(b, a) {
  b.hp = 0; b.dead = true; b.deadT = now(); b.path = null; b.target = null; b.engaged = false; b.anim = 'death';
  for (const e of ents.values()) if (e.target === b) { e.target = null; e.engaged = false; }
  broadcastNear(b.x, b.y, { t: 'ev', k: 'die', id: b.id });
  if (b.kind === 'monster') {
    b.respawnAt = now() + 20000;
    if (a && a.kind === 'player') {
      const m = MONSTERS[b.type]; const g = m.gold[0] + Math.floor(R() * (m.gold[1] - m.gold[0] + 1));
      a.gold += g; gainExp(a, m.exp); sys(a, `${b.name} 처치 · 경험치 ${m.exp} · 금화 ${g}`); persist(a);
    }
  } else if (b.kind === 'player') {
    b.respawnAt = now() + 5000;
    const lost = Math.floor(b.gold * (b.align < 0 ? .2 : .1)); b.gold -= lost;
    b.exp = Math.max(0, b.exp - Math.floor(expNeed(b.level) * .05));
    sys(b, `${a ? a.name + '에게 ' : ''}쓰러졌습니다. 금화 ${lost}과 경험치 일부를 잃었습니다. 5초 뒤 마을에서 깨어납니다.`);
    if (a && a.kind === 'player') {
      const innocent = b.align >= 0 && !(b.flagT > now());
      if (innocent) { a.align -= 1; a.kills++; sys(a, `${b.name}을(를) 살해했습니다. 성향이 떨어져 카오틱(붉은 이름)이 됩니다.`); bump(a); }
      else { a.align = Math.min(a.align + 1, 30); sys(a, `${b.name}을(를) 처단했습니다.`); bump(a); }
      a.gold += lost; persist(a);
      broadcastAll({ t: 'chat', sys: true, msg: `⚔ ${a.name}이(가) 성 밖에서 ${b.name}을(를) 쓰러뜨렸습니다.` });
    }
    persist(b);
  }
}
function gainExp(p, n) {
  p.exp += n; let up = false;
  while (p.exp >= expNeed(p.level)) { p.exp -= expNeed(p.level); p.level++; up = true; }
  if (up) { applyStats(p, true); bump(p); broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level }); sys(p, `레벨 ${p.level} 달성!${p.level === 10 ? ' 이제 전직할 수 있습니다 (다음 업데이트).' : ''}`); }
}
function applyStats(p, heal) { const s = statsFor(p.level); p.maxHp = s.maxHp; p.maxMp = s.maxMp; p.atk = Math.round(s.atk * (p.look === 'barbarian' ? 1.1 : 1)); p.def = Math.round(s.def * (p.look === 'knight' ? 1.25 : 1)); if (heal) { p.hp = p.maxHp; p.mp = p.maxMp; } }
function broadcastAll(msg) { const s = JSON.stringify(msg); for (const c of clients) if (c.player) c.sock.send(s); }

// ── AI
function monsterAI(e, dt) {
  const m = MONSTERS[e.type];
  const leash = Math.hypot(e.x - e.sx, e.y - e.sy);
  if (leash > 15 && !e.returning) { e.target = null; e.returning = true; setPath(e, e.sx, e.sy); }
  if (e.returning) { step(e, dt); if (!e.path) { e.returning = false; e.hp = e.maxHp; } return; }
  if (e.target && (e.target.dead || !canFight(e, e.target) || dist(e, e.target) > 13)) e.target = null;
  if (!e.target) {
    let best = null, bd = m.aggro;
    for (const p of near(e.x, e.y, m.aggro, o => o.kind === 'player')) { const d = dist(e, p); if (d < bd && canFight(e, p)) { bd = d; best = p; } }
    e.target = best;
  }
  if (e.target) { pursue(e, e.target, dt); return; }
  if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * .03 * dt);
  if (!e.path) { e.moving = false; if (now() > e.wanderT) { e.wanderT = now() + 2500 + R() * 4000; const tx = e.sx + (R() - .5) * 8, ty = e.sy + (R() - .5) * 8; if (!W.monsterBlock[Math.floor(ty) * MAP + Math.floor(tx)]) setPath(e, tx, ty); } }
  step(e, dt);
}
function pursue(e, t, dt) {
  const d = dist(e, t);
  if (d <= e.range) { e.path = null; e.moving = false; face(e, t); if (now() >= e.cd) attack(e, t); return; }
  if (!e.path || now() - e.pathT > 400) { e.pathT = now(); setPath(e, t.x, t.y); }
  step(e, dt);
}
function playerTick(p, dt) {
  if (p.dead) { if (now() >= p.respawnAt) { p.dead = false; p.x = SPAWN.x + (R() - .5) * 2; p.y = SPAWN.y + (R() - .5) * 2; applyStats(p, true); p.anim = 'idle'; bump(p); } return; }
  if (p.engaged && p.target) {
    const t = ents.get(p.target.id);
    if (!t || t.dead || !canFight(p, t)) { p.engaged = false; p.target = null; }
    else pursue(p, t, dt);
  } else step(p, dt);
  const safe = isSafe(p.x, p.y);
  p.hp = Math.min(p.maxHp, p.hp + (safe ? 5 : .6) * dt); p.mp = Math.min(p.maxMp, p.mp + (safe ? 3 : 1) * dt);
  if (p.flagT && p.flagT < now()) { p.flagT = 0; bump(p); }
}

// ── tick
let lastSnap = 0;
setInterval(() => {
  const players = [...ents.values()].filter(e => e.kind === 'player');
  for (const e of ents.values()) {
    if (e.kind === 'player') { playerTick(e, DT); continue; }
    if (e.dead) { if (now() >= e.respawnAt) { e.dead = false; e.x = e.sx; e.y = e.sy; e.hp = e.maxHp; e.target = null; e.path = null; e.anim = 'idle'; } continue; }
    // only simulate monsters that someone can see
    let awake = false; for (const p of players) if (Math.abs(p.x - e.x) < 32 && Math.abs(p.y - e.y) < 32) { awake = true; break; }
    if (awake) monsterAI(e, DT);
  }
  for (const e of ents.values()) if (!e.dead) e.anim = e.moving ? 'walk' : 'idle';
  if (now() - lastSnap >= 1000 / SNAP_HZ) { lastSnap = now(); for (const c of clients) if (c.player) snapshot(c); }
}, 1000 / TICK_HZ);

function meta(e) { return [e.id, e.kind === 'player' ? 1 : 2, e.name, e.sprite, e.level, e.kind === 'player' ? (e.align < 0 ? 2 : e.flagT > now() ? 1 : 0) : 0, e.maxHp]; }
function snapshot(c) {
  const p = c.player; const seen = new Set(); const list = [], metas = [];
  for (const e of near(p.x, p.y, VIEW_RADIUS)) {
    seen.add(e.id);
    if (c.known.get(e.id) !== e.metaVer) { c.known.set(e.id, e.metaVer); metas.push(meta(e)); }
    list.push([e.id, Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, e.dir, e.dead ? 4 : e.moving ? 1 : 0, Math.ceil(e.hp)]);
  }
  const gone = []; for (const id of c.known.keys()) if (!seen.has(id)) { gone.push(id); c.known.delete(id); }
  c.sock.send(JSON.stringify({ t: 'snap', s: now(), e: list, m: metas, g: gone,
    me: [Math.ceil(p.hp), p.maxHp, Math.floor(p.mp), p.maxMp, p.level, p.exp, expNeed(p.level), p.gold, p.atk, p.def, p.align] }));
}

// ── connections
const NAME_RE = /^[가-힣A-Za-z0-9_]{2,10}$/;
export function onConnection(sock) {
  const c = { sock, player: null, known: new Map(), lastMsg: 0, chatT: 0 };
  clients.add(c);
  sock.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const p = c.player;
    if (m.t === 'join' && !p) {
      const name = String(m.name || '').trim(); const look = LOOKS[m.look] ? m.look : 'knight';
      if (!NAME_RE.test(name)) { sock.send(JSON.stringify({ t: 'err', msg: '이름은 한글·영문·숫자 2~10자로 입력하세요.' })); return; }
      for (const e of ents.values()) if (e.kind === 'player' && e.name.toLowerCase() === name.toLowerCase()) { sock.send(JSON.stringify({ t: 'err', msg: '이미 접속 중인 이름입니다.' })); return; }
      const s = saves[name.toLowerCase()];
      const pl = { id: nextId++, kind: 'player', client: c, name: s ? s.name : name, look: s ? s.look : look, sprite: s ? s.look : look, level: s ? s.level : 1, exp: s ? s.exp : 0, gold: s ? s.gold : 100, align: s ? s.align : 0, kills: s ? s.kills : 0,
        x: SPAWN.x + (R() - .5) * 3, y: SPAWN.y + (R() - .5) * 3, speed: 4.2, dir: 0, anim: 'idle', path: null, target: null, engaged: false, cd: 0, atkSpeed: 900, metaVer: 1, flagT: 0 };
      pl.range = pl.look === 'mage' ? 4.5 : 1.45; pl.ranged = pl.look === 'mage';
      applyStats(pl, true); ents.set(pl.id, pl); c.player = pl; persist(pl);
      sock.send(JSON.stringify({ t: 'welcome', id: pl.id, name: pl.name, returning: !!s }));
      broadcastAll({ t: 'chat', sys: true, msg: `${pl.name}님이 레이븐무어에 들어왔습니다. (접속 ${[...clients].filter(x => x.player).length}명)` });
      return;
    }
    if (!p) return;
    if (m.t === 'move') { if (p.dead) return; const x = +m.x, y = +m.y; if (!(x >= 0 && y >= 0 && x < MAP && y < MAP)) return; p.engaged = false; p.target = null; setPath(p, x, y); }
    else if (m.t === 'attack') { if (p.dead) return; const t = ents.get(+m.id); if (!t || t === p) return; if (!canFight(p, t)) { sys(p, isSafe(p.x, p.y) || isSafe(t.x, t.y) ? '마을 안에서는 싸울 수 없습니다. 성문 밖으로 나가세요.' : '공격할 수 없는 대상입니다.'); return; } p.target = t; p.engaged = true; }
    else if (m.t === 'stop') { p.path = null; p.engaged = false; p.target = null; }
    else if (m.t === 'chat') { const text = String(m.msg || '').slice(0, 120).trim(); if (!text || now() - c.chatT < 600) return; c.chatT = now(); broadcastNear(p.x, p.y, { t: 'chat', id: p.id, n: p.name, msg: text }, 30); }
    else if (m.t === 'ping') sock.send(JSON.stringify({ t: 'pong', c: m.c, s: now() }));
  });
  sock.on('close', () => {
    clients.delete(c);
    if (c.player) { persist(c.player); ents.delete(c.player.id); for (const e of ents.values()) if (e.target === c.player) { e.target = null; e.engaged = false; } broadcastAll({ t: 'chat', sys: true, msg: `${c.player.name}님이 떠났습니다.` }); }
  });
}
export function stats() { return { players: [...ents.values()].filter(e => e.kind === 'player').length, monsters: [...ents.values()].filter(e => e.kind === 'monster').length }; }
