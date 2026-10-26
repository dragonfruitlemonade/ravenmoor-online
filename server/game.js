// Authoritative game world. The server decides movement, combat, items, shops and rewards;
// clients only send intentions (move / attack / use item / buy ...).
import { MAP, TOWN, SPAWN, VIEW_RADIUS, TICK_HZ, SNAP_HZ, MONSTERS, LOOKS, buildWorld, isSafe, findPath, expNeed, dirOf, rng } from '../shared/world.js';
import { ITEMS, SLOTS, INV_SIZE, DROPS, NPCS, CLASSES, CLASS_LEVEL, statsFor, itemStats, ENH_RATE, enhCost, sellPrice, itemName } from '../shared/rules.js';
import { accountForToken, loadCharacter, saveCharacter } from './db.js';

const W = buildWorld();
const DT = 1 / TICK_HZ;
const R = Math.random;
let nextId = 1;
const ents = new Map();          // id -> entity (player | monster | drop | npc)
const clients = new Set();
const now = () => Date.now();
const KIND = { player: 1, monster: 2, drop: 3, npc: 4 };

export const STARTER = { gold: 300, inventory: [{ id: 'hpPotion', n: 5 }, { id: 'scroll', n: 2 }], equipment: { weapon: { id: 'dagger', enh: 0 } } };

// ── helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function near(x, y, r, pred) { const out = []; for (const e of ents.values()) if (Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r && (!pred || pred(e))) out.push(e); return out; }
function broadcastNear(x, y, msg, r = VIEW_RADIUS) { const s = JSON.stringify(msg); for (const c of clients) if (c.player && Math.abs(c.player.x - x) <= r && Math.abs(c.player.y - y) <= r) c.sock.send(s); }
function broadcastAll(msg) { const s = JSON.stringify(msg); for (const c of clients) if (c.player) c.sock.send(s); }
function sendTo(p, msg) { if (p.client && p.client.sock.open) p.client.sock.send(JSON.stringify(msg)); }
function sys(p, text) { sendTo(p, { t: 'chat', sys: true, msg: text }); }
const bump = e => { e.metaVer++; };
const isPlayer = e => e && e.kind === 'player', isMonster = e => e && e.kind === 'monster';

function canFight(a, b) {
  if (!a || !b || a === b || a.dead || b.dead) return false;
  if (!(isPlayer(a) || isMonster(a)) || !(isPlayer(b) || isMonster(b))) return false;
  if (isMonster(a) && isMonster(b)) return false;
  if (isSafe(a.x, a.y) || isSafe(b.x, b.y)) return false;
  return true;
}

// ── world population
function spawnMonster(type, sx, sy) {
  const m = MONSTERS[type];
  const e = { id: nextId++, kind: 'monster', type, sprite: type, name: m.name, level: m.level, x: sx, y: sy, sx, sy, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, speed: m.speed,
    range: m.ranged || 1.45, ranged: !!m.ranged, atkSpeed: 1300, cd: 0, path: null, pathT: 0, target: null, dir: Math.floor(R() * 8), dead: false, metaVer: 1, wanderT: 0, stunT: 0, fx: {} };
  ents.set(e.id, e); return e;
}
function freeTileIn(ring, r) {
  const c = (TOWN.x0 + TOWN.x1) / 2 + .5;
  for (let i = 0; i < 4000; i++) { const x = 3 + Math.floor(r() * (MAP - 6)), y = 3 + Math.floor(r() * (MAP - 6)); const d = Math.max(Math.abs(x + .5 - c), Math.abs(y + .5 - c)); if (d < ring[0] || d > ring[1] || W.monsterBlock[y * MAP + x]) continue; return [x + .5, y + .5]; }
  return [20.5, 20.5];
}
{ const r = rng(7); for (const [type, m] of Object.entries(MONSTERS)) for (let i = 0; i < m.count; i++) { const [x, y] = freeTileIn(m.ring, r); spawnMonster(type, x, y); } }
const npcById = {};
for (const n of NPCS) { const e = { ...n, npcId: n.id, id: nextId++, kind: 'npc', level: 0, hp: 1, maxHp: 1, dir: n.guard ? 0 : 1, metaVer: 1 }; ents.set(e.id, e); npcById[n.id] = e; }

// ── drops on the ground
function spawnDrop(x, y, item, gold, owner) {
  const a = R() * Math.PI * 2, r = .3 + R() * .6; let dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r;
  if (W.block[Math.floor(dy) * MAP + Math.floor(dx)]) { dx = x; dy = y; }
  const e = { id: nextId++, kind: 'drop', item, gold, x: dx, y: dy, owner: owner ? owner.id : 0, ownerUntil: now() + 10000, expires: now() + 120000, dir: 0, hp: 1, maxHp: 1, metaVer: 1,
    name: gold ? `금화 ${gold}` : itemName(item) + (item.n > 1 ? ` ×${item.n}` : ''), sprite: gold ? 'gold' : ITEMS[item.id].icon };
  ents.set(e.id, e); return e;
}
function tryPick(p, d) {
  if (!ents.has(d.id)) return;
  if (d.owner && d.owner !== p.id && now() < d.ownerUntil) { sys(p, '아직 다른 사람의 전리품입니다. 잠시 후에 주울 수 있습니다.'); return; }
  if (d.gold) { p.gold += d.gold; sys(p, `금화 ${d.gold}을(를) 주웠습니다.`); }
  else { if (!addItem(p, d.item)) { sys(p, '가방이 가득 찼습니다.'); return; } sys(p, `${d.name}을(를) 주웠습니다.`); }
  ents.delete(d.id); invChanged(p);
}

// ── inventory
function addItem(p, it) {
  const b = ITEMS[it.id]; if (!b) return false; const n = it.n || 1;
  if (b.stack) { const s = p.inv.find(x => x.id === it.id); if (s) { s.n += n; return true; } }
  if (p.inv.length >= INV_SIZE) return false;
  p.inv.push(b.stack ? { id: it.id, n } : { id: it.id, n: 1, enh: it.enh || 0 }); return true;
}
function takeItem(p, id, n = 1) { const s = p.inv.find(x => x.id === id); if (!s || s.n < n) return false; s.n -= n; if (s.n <= 0) p.inv.splice(p.inv.indexOf(s), 1); return true; }
const countItem = (p, id) => p.inv.filter(x => x.id === id).reduce((a, x) => a + x.n, 0);
function invChanged(p) { p.invDirty = true; p.saveDirty = true; }
function sendInv(p) { p.invDirty = false; sendTo(p, { t: 'inv', inv: p.inv, equip: p.equip, gold: p.gold }); }

// ── player stats
function applyStats(p, heal) {
  const s = statsFor(p.level, p.cls); const c = CLASSES[p.cls];
  let atk = s.atk, def = s.def, spd = 1;
  for (const slot of SLOTS) { const it = p.equip[slot]; if (!it) continue; const st = itemStats(it); atk += st.atk; def += st.def; if (st.spd) spd = st.spd; }
  p.maxHp = s.maxHp; p.maxMp = s.maxMp; p.atk = atk; p.def = def;
  p.atkSpeed = Math.round(900 / spd / (c.aspd || 1)); p.dmgMul = c.dmg || 1;
  p.ranged = !!c.ranged || p.look === 'mage' && p.cls === 'commoner'; p.range = c.ranged || (p.ranged ? 4.5 : 1.45);
  if (heal) { p.hp = p.maxHp; p.mp = p.maxMp; } else { p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp); }
}

// ── movement
function setPath(e, tx, ty) { const blk = isMonster(e) ? W.monsterBlock : W.block; const p = findPath(blk, Math.floor(e.x), Math.floor(e.y), Math.floor(tx), Math.floor(ty)); e.path = p && p.length ? p : null; return !!e.path; }
function step(e, dt) {
  if (!e.path || !e.path.length) { e.path = null; e.moving = false; return; }
  const [nx, ny] = e.path[0]; const tx = nx + .5, ty = ny + .5; const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  const sp = e.speed * dt * (e.fx.slow > now() ? .6 : 1);
  if (d <= sp) { e.x = tx; e.y = ty; e.path.shift(); } else { e.x += dx / d * sp; e.y += dy / d * sp; }
  e.moving = true; if (d > 1e-3) e.dir = dirOf(dx, dy);
}
const face = (e, t) => { e.dir = dirOf(t.x - e.x, t.y - e.y); };

// ── combat
function rollDamage(a, b, mul = 1) { const crit = R() < .1; let d = a.atk * (a.dmgMul || 1) * mul * (0.85 + R() * .3) - b.def * .6; if (crit) d *= 1.6; return [Math.max(1, Math.round(d)), crit]; }
function attack(a, b) {
  a.cd = now() + a.atkSpeed; face(a, b);
  broadcastNear(a.x, a.y, { t: 'ev', k: 'atk', a: a.id, b: b.id, r: a.ranged ? 1 : 0 });
  const delay = a.ranged ? 120 + dist(a, b) * 60 : 220;
  setTimeout(() => { if (!canFight(a, b)) return; if (!a.ranged && dist(a, b) > a.range + 1) return; const [d, c] = rollDamage(a, b); damage(b, d, a, c); }, delay);
}
function damage(b, dmg, a, crit) {
  if (b.dead) return;
  b.hp -= dmg;
  broadcastNear(b.x, b.y, { t: 'ev', k: 'dmg', b: b.id, v: dmg, c: crit ? 1 : 0 });
  if (isMonster(b) && (!b.target || !ents.has(b.target.id))) b.target = a;
  if (isPlayer(b) && !b.target && !b.path && a) { b.target = a; b.engaged = true; }
  if (isPlayer(a) && isPlayer(b) && b.align >= 0 && !(b.flagT > now())) { if (!(a.flagT > now())) sys(a, '선량한 모험가를 공격했습니다. 1분 동안 보라색 이름(공격자)으로 표시됩니다.'); a.flagT = now() + 60000; bump(a); }
  if (b.hp <= 0) kill(b, a);
}
function kill(b, a) {
  b.hp = 0; b.dead = true; b.deadT = now(); b.path = null; b.target = null; b.engaged = false;
  for (const e of ents.values()) if (e.target === b) { e.target = null; e.engaged = false; }
  broadcastNear(b.x, b.y, { t: 'ev', k: 'die', id: b.id });
  if (isMonster(b)) {
    b.respawnAt = now() + 20000;
    if (isPlayer(a)) {
      const m = MONSTERS[b.type]; const g = m.gold[0] + Math.floor(R() * (m.gold[1] - m.gold[0] + 1));
      spawnDrop(b.x, b.y, null, g, a);
      for (const [id, p] of DROPS[b.type] || []) if (R() < p) spawnDrop(b.x, b.y, { id, n: 1, enh: 0 }, 0, a);
      gainExp(a, m.exp);
    }
  } else if (isPlayer(b)) {
    b.respawnAt = now() + 5000;
    const chaotic = b.align < 0; const lost = Math.floor(b.gold * (chaotic ? .2 : .1)); b.gold -= lost;
    b.exp = Math.max(0, b.exp - Math.floor(expNeed(b.level) * .05));
    if (lost > 0) spawnDrop(b.x, b.y, null, lost, isPlayer(a) ? a : null);
    if (chaotic && b.inv.length) { const it = b.inv.splice(Math.floor(R() * b.inv.length), 1)[0]; spawnDrop(b.x, b.y, it, 0, isPlayer(a) ? a : null); sys(b, `카오틱 상태로 쓰러져 ${itemName(it)}을(를) 떨어뜨렸습니다.`); }
    sys(b, `${a ? a.name + '에게 ' : ''}쓰러졌습니다. 금화 ${lost}과 경험치 일부를 잃었습니다. 5초 뒤 마을에서 깨어납니다.`);
    if (isPlayer(a)) {
      const innocent = b.align >= 0 && !(b.flagT > now());
      if (innocent) { a.align -= 1; a.kills++; sys(a, `${b.name}을(를) 살해했습니다. 성향이 떨어져 카오틱(붉은 이름)이 됩니다.`); }
      else { a.align = Math.min(a.align + 1, 30); sys(a, `${b.name}을(를) 처단했습니다.`); }
      bump(a); a.saveDirty = true;
      broadcastAll({ t: 'chat', sys: true, msg: `⚔ ${a.name}이(가) 성 밖에서 ${b.name}을(를) 쓰러뜨렸습니다.` });
    }
    invChanged(b);
  }
}
function gainExp(p, n) {
  p.exp += n; let up = false;
  while (p.exp >= expNeed(p.level)) { p.exp -= expNeed(p.level); p.level++; up = true; }
  p.saveDirty = true;
  if (up) { applyStats(p, true); bump(p); broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level }); sys(p, `레벨 ${p.level} 달성!` + (p.level >= CLASS_LEVEL && p.cls === 'commoner' ? ' 이제 전직할 수 있습니다. 기사단·마법사 탑·예배당·여관의 스승을 찾아가세요.' : '')); }
}

// ── skills
function heal(p) {
  const cleric = p.cls === 'cleric'; const cost = cleric ? 10 : 15;
  if (now() < p.healT) return sys(p, '치유가 아직 준비되지 않았습니다.');
  if (p.mp < cost) return sys(p, '마나가 부족합니다.');
  p.mp -= cost; p.healT = now() + 5000; const h = Math.round(p.maxHp * (cleric ? .45 : .3)); p.hp = Math.min(p.maxHp, p.hp + h);
  broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'heal', id: p.id, v: h });
}
function useSkill(p, targetId) {
  const c = CLASSES[p.cls]; const s = c.skill;
  if (!s) return sys(p, '평민은 기술이 없습니다. 레벨 10에 전직하면 배웁니다.');
  if (now() < p.skillT) return sys(p, `${s.name}이(가) 아직 준비되지 않았습니다.`);
  if (p.mp < s.mp) return sys(p, '마나가 부족합니다.');
  if (isSafe(p.x, p.y)) return sys(p, '성내에서는 기술을 쓸 수 없습니다.');
  let t = ents.get(+targetId) || (p.target && ents.get(p.target.id));
  if (s.range > 0) {
    if (!t || !canFight(p, t)) { let best = null, bd = s.range; for (const e of near(p.x, p.y, s.range, isMonster)) { const d = dist(p, e); if (d < bd && canFight(p, e)) { bd = d; best = e; } } t = best; }
    if (!t) return sys(p, '대상이 없습니다.'); if (dist(p, t) > s.range) return sys(p, '대상이 너무 멉니다.');
    face(p, t);
  }
  p.mp -= s.mp; p.skillT = now() + s.cd; p.cd = now() + p.atkSpeed;
  broadcastNear(p.x, p.y, { t: 'ev', k: 'atk', a: p.id, b: t ? t.id : 0, r: s.id === 'fireball' ? 1 : 0 });
  if (s.id === 'bash') { const [d] = rollDamage(p, t, 2.2); damage(t, d, p, true); t.stunT = now() + 1500; t.path = null; broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'stun', id: t.id }); }
  else if (s.id === 'backstab') { const [d] = rollDamage(p, t, 2.6); damage(t, d, p, true); t.fx.bleed = now() + 5000; t.bleedBy = p; broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'bleed', id: t.id }); }
  else if (s.id === 'fireball') { const tx = t.x, ty = t.y; setTimeout(() => { broadcastNear(tx, ty, { t: 'ev', k: 'fx', fx: 'fire', x: tx, y: ty }); for (const e of near(tx, ty, 2.2, x => canFight(p, x))) if (Math.hypot(e.x - tx, e.y - ty) <= 2.2) { const [d] = rollDamage(p, e, 1.8); damage(e, d, p, false); } }, 120 + dist(p, t) * 60); }
  else if (s.id === 'holy') { broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'holy', x: p.x, y: p.y }); for (const e of near(p.x, p.y, 3, x => canFight(p, x))) if (dist(p, e) <= 3) { const [d] = rollDamage(p, e, 1.4); damage(e, d, p, false); } const h = Math.round(p.maxHp * .25); p.hp = Math.min(p.maxHp, p.hp + h); }
}

// ── NPC services
function npcFor(p, npcId) { const n = npcById[npcId]; if (!n) return null; if (dist(p, n) > 3.2) { sys(p, `${n.name}에게 더 가까이 가세요.`); return null; } return n; }
function npcInfo(n) { return { t: 'npc', id: n.npcId, name: n.name, shop: n.shop || null, craft: n.craft || null, enhance: !!n.enhance, rest: n.rest || 0, master: n.master || null, atone: !!n.atone, guard: !!n.guard }; }
function service(p, m) {
  const n = npcFor(p, m.npc); if (!n) return;
  if (m.t === 'buy') {
    const id = String(m.item), qty = Math.max(1, Math.min(99, m.n | 0 || 1)); const b = ITEMS[id];
    if (!b || !(n.shop || []).includes(id)) return; if (!b.stack && qty > 1) return;
    const cost = b.price * qty; if (p.gold < cost) return sys(p, '금화가 부족합니다.');
    if (!addItem(p, { id, n: qty })) return sys(p, '가방이 가득 찼습니다.');
    p.gold -= cost; sys(p, `${b.name}${qty > 1 ? ' ×' + qty : ''} 구매 (-${cost} G)`);
  } else if (m.t === 'sell') {
    if (!n.shop) return; const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return; const qty = Math.max(1, Math.min(it.n, m.n | 0 || it.n));
    const price = sellPrice(it) * qty; it.n -= qty; if (it.n <= 0) p.inv.splice(p.inv.indexOf(it), 1); p.gold += price; sys(p, `${itemName(it)}${qty > 1 ? ' ×' + qty : ''} 판매 (+${price} G)`);
  } else if (m.t === 'craft') {
    const id = String(m.item); const b = ITEMS[id]; if (!b || !b.craft || !(n.craft || []).includes(id)) return;
    for (const [k, v] of Object.entries(b.craft)) { if (k === 'gold' ? p.gold < v : countItem(p, k) < v) return sys(p, '재료나 금화가 부족합니다.'); }
    if (p.inv.length >= INV_SIZE) return sys(p, '가방이 가득 찼습니다.');
    for (const [k, v] of Object.entries(b.craft)) { if (k === 'gold') p.gold -= v; else takeItem(p, k, v); }
    addItem(p, { id, n: 1, enh: 0 }); sys(p, `${b.name} 제작 완료! 망치 소리가 마을에 울립니다.`); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'craft', id: p.id });
  } else if (m.t === 'enhance') {
    if (!n.enhance) return; let it, slot;
    if (m.src === 'eq') { slot = String(m.slot); it = p.equip[slot]; } else { it = p.inv[m.i | 0]; if (it && it.id !== m.id) it = null; }
    if (!it || !ITEMS[it.id] || !SLOTS.includes(ITEMS[it.id].type)) return; const e = it.enh || 0;
    if (e >= 9) return sys(p, '더 이상 강화할 수 없습니다 (+9).'); const cost = enhCost(it); if (p.gold < cost) return sys(p, '금화가 부족합니다.');
    p.gold -= cost;
    if (R() * 100 < ENH_RATE[e]) { it.enh = e + 1; sys(p, `강화 성공! ${itemName(it)}`); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'enh_ok', id: p.id }); }
    else if (e >= 4) { it.enh = e - 1; sys(p, `강화 실패… ${itemName(it)}(으)로 떨어졌습니다.`); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'enh_fail', id: p.id }); }
    else sys(p, '강화 실패. 장비는 무사합니다.');
    if (slot) applyStats(p);
  } else if (m.t === 'rest') {
    if (!n.rest) return; if (p.gold < n.rest) return sys(p, '금화가 부족합니다.'); p.gold -= n.rest; p.hp = p.maxHp; p.mp = p.maxMp; sys(p, '푹 쉬었습니다. 체력과 마나가 모두 회복되었습니다.');
  } else if (m.t === 'job') {
    const cls = n.master; if (!cls) return; if (p.cls !== 'commoner') return sys(p, '이미 다른 길을 걷고 있습니다.'); if (p.level < CLASS_LEVEL) return sys(p, `레벨 ${CLASS_LEVEL}이 되어야 전직할 수 있습니다.`);
    p.cls = cls; applyStats(p, true); bump(p); sys(p, `${CLASSES[cls].master}의 인도로 ${CLASSES[cls].name}이(가) 되었습니다. 기술 '${CLASSES[cls].skill.name}'은 S 키입니다.`);
    broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level, txt: CLASSES[cls].name + ' 전직!' });
  } else if (m.t === 'atone') {
    if (!n.atone || p.align >= 0) return; const cost = -p.align * 150; if (p.gold < cost) return sys(p, `헌금 ${cost} G가 필요합니다.`); p.gold -= cost; p.align = 0; bump(p); sys(p, '죄가 씻겼습니다. 성향이 0으로 돌아왔습니다.');
  }
  invChanged(p);
}

// ── AI
function monsterAI(e, dt) {
  if (e.stunT > now()) { e.moving = false; return; }
  const m = MONSTERS[e.type]; const leash = Math.hypot(e.x - e.sx, e.y - e.sy);
  if (leash > 15 && !e.returning) { e.target = null; e.returning = true; setPath(e, e.sx, e.sy); }
  if (e.returning) { step(e, dt); if (!e.path) { e.returning = false; e.hp = e.maxHp; } return; }
  if (e.target && (e.target.dead || !canFight(e, e.target) || dist(e, e.target) > 13)) e.target = null;
  if (!e.target) { let best = null, bd = m.aggro; for (const p of near(e.x, e.y, m.aggro, isPlayer)) { const d = dist(e, p); if (d < bd && canFight(e, p)) { bd = d; best = p; } } e.target = best; }
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
  if (p.dead) { if (now() >= p.respawnAt) { p.dead = false; p.x = SPAWN.x + (R() - .5) * 2; p.y = SPAWN.y + (R() - .5) * 2; applyStats(p, true); bump(p); } return; }
  if (p.stunT > now()) { p.moving = false; return; }
  if (p.pick) { const d = ents.get(p.pick); if (!d) p.pick = 0; else if (dist(p, d) <= 1.2) { p.pick = 0; p.path = null; tryPick(p, d); } else if (!p.path) { setPath(p, d.x, d.y); if (!p.path) p.pick = 0; } }
  if (p.talk) { const n = npcById[p.talk]; if (n && dist(p, n) <= 2.2) { p.talk = null; p.path = null; face(p, n); sendTo(p, npcInfo(n)); } else if (!p.path) p.talk = null; }
  if (p.engaged && p.target) { const t = ents.get(p.target.id); if (!t || t.dead || !canFight(p, t)) { p.engaged = false; p.target = null; } else pursue(p, t, dt); }
  else step(p, dt);
  const safe = isSafe(p.x, p.y);
  p.hp = Math.min(p.maxHp, p.hp + (safe ? 5 : .6) * dt); p.mp = Math.min(p.maxMp, p.mp + (safe ? 3 : 1) * dt);
  if (p.flagT && p.flagT < now()) { p.flagT = 0; bump(p); }
}
function effectsTick(e) {
  if (e.fx.bleed > now() && now() - (e.bleedTick || 0) >= 1000) { e.bleedTick = now(); const src = e.bleedBy; if (src && canFight(src, e)) damage(e, Math.max(1, Math.round(e.maxHp * .03)), src, false); }
}

// ── tick
let lastSnap = 0, lastSave = 0;
setInterval(() => {
  const players = [...ents.values()].filter(isPlayer);
  for (const e of [...ents.values()]) {
    if (isPlayer(e)) { playerTick(e, DT); if (!e.dead) effectsTick(e); continue; }
    if (e.kind === 'drop') { if (now() > e.expires) ents.delete(e.id); continue; }
    if (!isMonster(e)) continue;
    if (e.dead) { if (now() >= e.respawnAt) { e.dead = false; e.x = e.sx; e.y = e.sy; e.hp = e.maxHp; e.target = null; e.path = null; e.fx = {}; } continue; }
    let awake = false; for (const p of players) if (Math.abs(p.x - e.x) < 32 && Math.abs(p.y - e.y) < 32) { awake = true; break; }
    if (awake) { monsterAI(e, DT); effectsTick(e); }
  }
  if (now() - lastSnap >= 1000 / SNAP_HZ) { lastSnap = now(); for (const c of clients) if (c.player) { if (c.player.invDirty) sendInv(c.player); snapshot(c); } }
  if (now() - lastSave >= 10000) { lastSave = now(); for (const p of players) if (p.saveDirty) { p.saveDirty = false; try { saveCharacter(p); } catch (err) { console.error('save failed', err); } } }
}, 1000 / TICK_HZ);

function meta(e) {
  const flag = isPlayer(e) ? (e.align < 0 ? 2 : e.flagT > now() ? 1 : 0) : 0;
  return [e.id, KIND[e.kind], e.name, e.sprite, e.level || 0, flag, e.maxHp, isPlayer(e) ? e.cls : (e.npcId || '')];
}
function snapshot(c) {
  const p = c.player; const seen = new Set(); const list = [], metas = [];
  for (const e of near(p.x, p.y, VIEW_RADIUS)) {
    seen.add(e.id);
    if (c.known.get(e.id) !== e.metaVer) { c.known.set(e.id, e.metaVer); metas.push(meta(e)); }
    list.push([e.id, Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, e.dir, e.dead ? 4 : e.moving ? 1 : 0, Math.ceil(e.hp), (e.stunT > now() ? 1 : 0) | (e.fx && e.fx.bleed > now() ? 2 : 0)]);
  }
  const gone = []; for (const id of c.known.keys()) if (!seen.has(id)) { gone.push(id); c.known.delete(id); }
  const cls = CLASSES[p.cls];
  c.sock.send(JSON.stringify({ t: 'snap', s: now(), e: list, m: metas, g: gone,
    me: [Math.ceil(p.hp), p.maxHp, Math.floor(p.mp), p.maxMp, p.level, p.exp, expNeed(p.level), p.gold, p.atk, p.def, p.align, p.cls, Math.max(0, p.healT - now()), Math.max(0, p.skillT - now()), cls.skill ? cls.skill.cd : 0, p.atkSpeed, p.range, p.kills] }));
}

// ── connections
const online = new Map();   // accountId -> player
export function onConnection(sock) {
  const c = { sock, player: null, known: new Map(), chatT: 0, msgs: 0, winT: now() };
  clients.add(c);
  sock.on('message', raw => {
    if (now() - c.winT > 1000) { c.winT = now(); c.msgs = 0; } if (++c.msgs > 40) return;   // flood guard
    let m; try { m = JSON.parse(raw); } catch { return; }
    const p = c.player;
    if (m.t === 'join' && !p) {
      const acc = accountForToken(m.token); if (!acc) { sock.send(JSON.stringify({ t: 'err', msg: '로그인이 만료되었습니다. 다시 로그인하세요.', relogin: true })); return; }
      const prev = online.get(acc); if (prev) { sys(prev, '다른 곳에서 접속하여 연결을 끊습니다.'); prev.client.sock.close(); }
      const ch = loadCharacter(acc); if (!ch) { sock.send(JSON.stringify({ t: 'err', msg: '캐릭터를 찾을 수 없습니다.' })); return; }
      const pl = { id: nextId++, kind: 'player', accountId: acc, client: c, name: ch.name, look: LOOKS[ch.look] ? ch.look : 'knight', sprite: LOOKS[ch.look] ? ch.look : 'knight', cls: CLASSES[ch.cls] ? ch.cls : 'commoner',
        level: ch.level, exp: ch.exp, gold: ch.gold, align: ch.align, kills: ch.kills, inv: ch.inventory.filter(x => ITEMS[x.id]), equip: {},
        x: SPAWN.x + (R() - .5) * 3, y: SPAWN.y + (R() - .5) * 3, speed: 4.2, dir: 0, path: null, target: null, engaged: false, cd: 0, metaVer: 1, flagT: 0, healT: 0, skillT: 0, stunT: 0, fx: {}, pick: 0, talk: null };
      for (const s of SLOTS) { const it = ch.equipment[s]; if (it && ITEMS[it.id] && ITEMS[it.id].type === s) pl.equip[s] = { id: it.id, enh: it.enh || 0 }; }
      applyStats(pl, true); ents.set(pl.id, pl); c.player = pl; online.set(acc, pl);
      sock.send(JSON.stringify({ t: 'welcome', id: pl.id, name: pl.name })); sendInv(pl);
      broadcastAll({ t: 'chat', sys: true, msg: `${pl.name}님이 레이븐무어에 들어왔습니다. (접속 ${online.size}명)` });
      return;
    }
    if (!p) return;
    if (p.dead && m.t !== 'chat') return;
    const clearIntent = () => { p.engaged = false; p.target = null; p.pick = 0; p.talk = null; };
    switch (m.t) {
      case 'move': { const x = +m.x, y = +m.y; if (!(x >= 0 && y >= 0 && x < MAP && y < MAP)) return; clearIntent(); setPath(p, x, y); break; }
      case 'attack': { const t = ents.get(+m.id); if (!t || t === p) return; if (!canFight(p, t)) { sys(p, isSafe(p.x, p.y) || isSafe(t.x, t.y) ? '마을 안에서는 싸울 수 없습니다. 성문 밖으로 나가세요.' : '공격할 수 없는 대상입니다.'); return; } clearIntent(); p.target = t; p.engaged = true; break; }
      case 'stop': clearIntent(); p.path = null; break;
      case 'pick': { const d = ents.get(+m.id); if (!d || d.kind !== 'drop') return; clearIntent(); p.pick = d.id; if (dist(p, d) > 1.2) setPath(p, d.x, d.y); break; }
      case 'talk': { const n = npcById[m.npc]; if (!n) return; clearIntent(); if (dist(p, n) <= 2.2) { face(p, n); sendTo(p, npcInfo(n)); } else { p.talk = m.npc; setPath(p, n.x, n.y); } break; }
      case 'heal': heal(p); break;
      case 'skill': useSkill(p, m.id); break;
      case 'use': {
        const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return; const b = ITEMS[it.id];
        if (b.type === 'potion') { if (b.heal && p.hp >= p.maxHp) return sys(p, '체력이 가득 차 있습니다.'); if (b.mana && p.mp >= p.maxMp) return sys(p, '마나가 가득 차 있습니다.'); takeItem(p, it.id); if (b.heal) p.hp = Math.min(p.maxHp, p.hp + b.heal); if (b.mana) p.mp = Math.min(p.maxMp, p.mp + b.mana); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: b.heal ? 'heal' : 'mana', id: p.id, v: b.heal || b.mana }); }
        else if (b.type === 'scroll') { takeItem(p, it.id); clearIntent(); p.path = null; p.x = SPAWN.x + (R() - .5) * 2; p.y = SPAWN.y + (R() - .5) * 2; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'tele', id: p.id }); sys(p, '주문서가 빛나며 마을 광장으로 돌아왔습니다.'); }
        else if (SLOTS.includes(b.type)) return equip(p, m.i | 0);
        invChanged(p); break;
      }
      case 'equip': equip(p, m.i | 0, m.id); break;
      case 'unequip': { const s = String(m.slot); const it = p.equip[s]; if (!it) return; if (p.inv.length >= INV_SIZE) return sys(p, '가방이 가득 찼습니다.'); delete p.equip[s]; p.inv.push({ id: it.id, n: 1, enh: it.enh || 0 }); applyStats(p); invChanged(p); break; }
      case 'drop': { const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return; p.inv.splice(m.i | 0, 1); spawnDrop(p.x, p.y, it, 0, null); sys(p, `${itemName(it)}을(를) 바닥에 내려놓았습니다.`); invChanged(p); break; }
      case 'buy': case 'sell': case 'craft': case 'enhance': case 'rest': case 'job': case 'atone': service(p, m); break;
      case 'chat': { const text = String(m.msg || '').slice(0, 120).trim(); if (!text || now() - c.chatT < 600) return; c.chatT = now(); broadcastNear(p.x, p.y, { t: 'chat', id: p.id, n: p.name, msg: text }, 30); break; }
      case 'ping': sock.send(JSON.stringify({ t: 'pong', c: m.c, s: now() })); break;
    }
  });
  sock.on('close', () => {
    clients.delete(c); const p = c.player; if (!p) return;
    try { saveCharacter(p); } catch (err) { console.error('save failed', err); }
    ents.delete(p.id); if (online.get(p.accountId) === p) online.delete(p.accountId);
    for (const e of ents.values()) if (e.target === p) { e.target = null; e.engaged = false; }
    broadcastAll({ t: 'chat', sys: true, msg: `${p.name}님이 떠났습니다.` });
  });
}
function equip(p, i, id) {
  const it = p.inv[i]; if (!it || (id && it.id !== id)) return; const b = ITEMS[it.id]; if (!SLOTS.includes(b.type)) return;
  if (b.type === 'shield' && (p.cls === 'mage')) return sys(p, '마법사는 방패를 들 수 없습니다.');
  p.inv.splice(i, 1); const prev = p.equip[b.type]; p.equip[b.type] = { id: it.id, enh: it.enh || 0 }; if (prev) p.inv.push({ id: prev.id, n: 1, enh: prev.enh || 0 });
  applyStats(p); invChanged(p); sys(p, `${itemName(it)} 장착`);
}
export function saveAll() { for (const e of ents.values()) if (isPlayer(e)) try { saveCharacter(e); } catch {} }
export function stats() { let players = 0, monsters = 0, drops = 0; for (const e of ents.values()) { if (isPlayer(e)) players++; else if (isMonster(e)) monsters++; else if (e.kind === 'drop') drops++; } return { players, monsters, drops }; }
