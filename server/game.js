// Authoritative game world. The server decides movement, combat, items, shops and rewards;
// clients only send intentions (move / attack / use item / buy ...).
import { MAP, OVER, TOWN, SPAWN, CX, CY, GATES, VIEW_RADIUS, TICK_HZ, SNAP_HZ, MONSTERS, LOOKS, DUNGEON, ABBEY, ABBEY_SLOTS, ABBEY_SPAWNS, instanceAt, buildWorld, isSafe, portalAt, findPath, expNeed, dirOf, rng } from '../shared/world.js';
import { TITLES, TITLE_BY, titleName, ITEMS, SLOTS, INV_SIZE, DROPS, NPCS, CLASSES, CLASS_LEVEL, ADV, ADV_LEVEL, ADV_OF, classInfo, statsFor, itemStats, ENH_RATE, enhCost, sellPrice, itemName, BANK_SIZE, QUESTS,
  ABBEY_LOOT, DIFFICULTY, weekKey,
  SKILLS, GCD, RESOURCES, MAX_CUTS, resourceOf, skillsFor, skillRange, TALENT_BY, talentPoints, talentBlock, talentMods, spentTotal, talentResetCost, effSkill, baseClass } from '../shared/rules.js';
import { accountForToken, loadCharacter, saveCharacter } from './db.js';
import { createSocial } from './social.js';
import { adminCommand, logEvent, banInfo, isAdmin } from './admin.js';
import { createGuilds } from './guild.js';
import { createMarket } from './market.js';

const W = buildWorld();
const R = Math.random;
let nextId = 1;
const ents = new Map();          // id -> entity (player | monster | drop | npc)
const clients = new Set();
const now = () => Date.now();
const KIND = { player: 1, monster: 2, drop: 3, npc: 4 };
const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const worldStart = now();   // day/night: 10 real minutes per game day
const dayPhase = () => ((now() - worldStart) / 600000) % 1;
// weather: 0 clear, 1 rain, 2 fog — changes every 8–18 minutes, clear most of the time
let weather = 0, weatherUntil = now() + 6 * 60000;
export function setWeather(w) { weather = w; weatherUntil = now() + 8 * 60000; }
setInterval(() => { if (now() < weatherUntil) return; const r = R(); weather = weather ? 0 : r < .55 ? 1 : 2; weatherUntil = now() + (weather ? 5 + R() * 6 : 8 + R() * 10) * 60000; if (weather) broadcastAll({ t: 'chat', sys: true, msg: weather === 1 ? '🌧 비가 내리기 시작합니다.' : '🌫 안개가 짙어집니다.' }); }, 10000).unref();

const findPlayerByName = name => { const n = String(name || '').toLowerCase(); for (const e of ents.values()) if (e.kind === 'player' && e.name.toLowerCase() === n) return e; return null; };
export const STARTER = { gold: 300, inventory: [{ id: 'hpPotion', n: 5 }, { id: 'scroll', n: 2 }], equipment: { weapon: { id: 'dagger', enh: 0 } } };

// ── helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// spatial hash, rebuilt once per tick; membership can lag a tick, so queries pad by one cell and re-check exact bounds
const CELL = 8, grid = new Map(); let gridBuilt = false;
function rebuildGrid() { grid.clear(); for (const e of ents.values()) { const k = ((e.x / CELL) | 0) * 1024 + ((e.y / CELL) | 0); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(e); } gridBuilt = true; }
function near(x, y, r, pred) {
  const out = []; if (!gridBuilt) rebuildGrid();
  const x0 = ((x - r) / CELL | 0) - 1, x1 = ((x + r) / CELL | 0) + 1, y0 = ((y - r) / CELL | 0) - 1, y1 = ((y + r) / CELL | 0) + 1;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const b = grid.get(cx * 1024 + cy); if (!b) continue; for (const e of b) if (Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r && ents.get(e.id) === e && (!pred || pred(e))) out.push(e); }
  return out;
}
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
  if (isPlayer(a) && isPlayer(b) && (social.sameParty(a, b) || guilds.sameGuild(a, b))) return false;
  if (isPlayer(a) && isPlayer(b) && (a.level < PK_MIN || b.level < PK_MIN)) return false;   // newcomers are neither prey nor hunters
  if (isSafe(a.x, a.y) || isSafe(b.x, b.y)) return false;
  return true;
}

// ── world population
function spawnMonster(type, sx, sy, elite) {
  const m = MONSTERS[type];
  const e = { id: nextId++, kind: 'monster', type, sprite: m.sprite || type, scale: m.scale || 1, boss: !!m.boss, name: m.name, level: m.level, x: sx, y: sy, sx, sy, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, speed: m.speed,
    range: m.ranged || (m.boss ? 1.7 : 1.45), ranged: !!m.ranged, atkSpeed: m.boss ? 1400 : 1300, cd: 0, path: null, pathT: 0, target: null, dir: Math.floor(R() * 8), dead: false, metaVer: 1, wanderT: 0, stunT: 0, fx: {}, sk: {} };
  if (elite) { e.elite = true; e.name = '정예 ' + m.name; e.level += 2; e.maxHp = e.hp = Math.round(m.hp * 2.2); e.atk = Math.round(m.atk * 1.4); e.def = Math.round(m.def * 1.3); e.scale = 1.25; }
  ents.set(e.id, e); return e;
}
function freeTileIn(ring, r) {
  const c = (TOWN.x0 + TOWN.x1) / 2 + .5;
  for (let i = 0; i < 4000; i++) { const x = 3 + Math.floor(r() * (OVER - 6)), y = 3 + Math.floor(r() * (OVER - 6)); const d = Math.max(Math.abs(x + .5 - c), Math.abs(y + .5 - c)); if (d < ring[0] || d > ring[1] || W.monsterBlock[y * MAP + x]) continue; return [x + .5, y + .5]; }
  return [20.5, 20.5];
}
// catacomb dwellers live in a depth band (rows y0..y1 of the dungeon strip), on open floor
function freeCryptTile([y0, y1], r) {
  for (let i = 0; i < 4000; i++) { const x = DUNGEON.x0 + Math.floor(r() * (DUNGEON.x1 - DUNGEON.x0 + 1)), y = y0 + Math.floor(r() * (y1 - y0 + 1)); if (W.monsterBlock[y * MAP + x]) continue; return [x + .5, y + .5]; }
  return [214.5, 30.5];
}
{ const r = rng(7); for (const [type, m] of Object.entries(MONSTERS)) for (let i = 0; i < m.count; i++) { const [x, y] = m.fixed ? m.fixed : m.crypt ? freeCryptTile(m.crypt, r) : freeTileIn(m.ring, r); spawnMonster(type, x, y, !m.boss && i % 12 === 11); } }
const npcById = {};
for (const n of NPCS) { const e = { ...n, npcId: n.id, id: nextId++, kind: 'npc', level: 0, hp: 1, maxHp: 1, dir: n.guard ? 0 : 1, metaVer: 1, speed: 1.6, path: null, wanderT: 0, fx: {} }; ents.set(e.id, e); npcById[n.id] = e; }
function villagerAI(e, dt) { if (!e.path) { e.moving = false; if (now() > e.wanderT) { e.wanderT = now() + 3000 + R() * 7000; const a = e.area; const tx = a[0] + Math.floor(R() * a[2]), ty = a[1] + Math.floor(R() * a[3]); if (!W.block[ty * MAP + tx]) setPath(e, tx + .5, ty + .5); } } step(e, dt); }

// ── drops on the ground
function spawnDrop(x, y, item, gold, owner) {
  const a = R() * Math.PI * 2, r = .3 + R() * .6; let dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r;
  if (W.block[Math.floor(dy) * MAP + Math.floor(dx)]) { dx = x; dy = y; }
  const e = { id: nextId++, kind: 'drop', item, gold, x: dx, y: dy, owner: owner ? owner.id : 0, ownerParty: owner ? owner.partyId || 0 : 0, ownerUntil: now() + 10000, expires: now() + 120000, dir: 0, hp: 1, maxHp: 1, metaVer: 1,
    name: gold ? `금화 ${gold}` : itemName(item) + (item.n > 1 ? ` ×${item.n}` : ''), sprite: gold ? 'gold' : ITEMS[item.id].icon };
  ents.set(e.id, e); return e;
}
function tryPick(p, d) {
  if (!ents.has(d.id)) return;
  if (d.owner && d.owner !== p.id && now() < d.ownerUntil && !(d.ownerParty && p.partyId === d.ownerParty)) { sys(p, '아직 다른 사람의 전리품입니다. 잠시 후에 주울 수 있습니다.'); return; }
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
// talents go to the client whenever class, level or the picks change (checked on every snapshot round; cheap string compare)
const talentKey = p => `${p.cls}|${p.level}|${JSON.stringify(p.talents || {})}`;
function sendTalents(p) { p.talentsSent = talentKey(p); sendTo(p, { t: 'talents', talents: p.talents || {}, points: talentPoints(p.level), reset: talentResetCost(p.level) }); }
function learnTalent(p, id) {
  const why = talentBlock(p.cls, p.level, p.talents, id); if (why) return sys(p, why);
  p.talents[id] = (p.talents[id] || 0) + 1; applyStats(p); p.saveDirty = true;
  const t = TALENT_BY[id]; sys(p, `특성 「${t.name}」 ${p.talents[id]}/${t.max}`);
}
function resetTalents(p) {
  if (!Object.keys(p.talents).length) return sys(p, '초기화할 특성이 없습니다.');
  if (!isSafe(p.x, p.y)) return sys(p, '특성 초기화는 마을 안에서만 할 수 있습니다.');
  const cost = talentResetCost(p.level); if (p.gold < cost) return sys(p, `금화 ${cost}이(가) 필요합니다.`);
  p.gold -= cost; p.talents = {}; applyStats(p); invChanged(p); sys(p, `금화 ${cost}을(를) 내고 특성을 초기화했습니다.`);
}
function sendInv(p) { p.invDirty = false; sendTo(p, { t: 'inv', inv: p.inv, equip: p.equip, gold: p.gold }); }

// ── player stats
function applyStats(p, heal) {
  const s = statsFor(p.level, p.cls); const c = classInfo(p.cls);
  let atk = s.atk, def = s.def, spd = 1;
  for (const slot of SLOTS) { const it = p.equip[slot]; if (!it) continue; const st = itemStats(it); atk += st.atk; def += st.def; if (st.spd) spd = st.spd; }
  const bless = p.fx && p.fx.bless > now() ? 1.25 : 1;
  p.res = resourceOf(p.cls);
  // talents: drop anything that no longer fits (another class's talent, or fewer points after a level change), then add up the effects
  p.talents = p.talents || {}; for (const [id, r] of Object.entries(p.talents)) if (!TALENT_BY[id] || TALENT_BY[id].cls !== baseClass(p.cls) || !(r > 0)) delete p.talents[id]; else p.talents[id] = Math.min(r, TALENT_BY[id].max);
  if (spentTotal(p.talents) > talentPoints(p.level)) { p.talents = {}; if (p.client) sys(p, '특성 점수가 줄어 특성을 초기화했습니다.'); }
  const tm = p.tm = talentMods(p.talents);
  p.maxHp = Math.round(s.maxHp * (1 + (tm.hpPct || 0))); p.maxMp = RESOURCES[p.res].max || s.maxMp;
  p.atk = Math.round(atk * bless * (1 + (tm.atkPct || 0))); p.def = Math.round(def * bless * (1 + (tm.defPct || 0)));
  p.atkSpeed = Math.round(900 / spd / (c.aspd || 1) / (1 + (tm.haste || 0))); p.dmgMul = c.dmg || 1; p.threatMul = (c.threat || 1) * Math.max(.2, 1 + (tm.threat || 0));
  p.speed = 4.2 * (1 + (tm.speedPct || 0));
  p.ranged = !!c.ranged || p.look === 'mage' && p.cls === 'commoner'; p.range = c.ranged || (p.ranged ? 4.5 : 1.45);
  if (heal) { p.hp = p.maxHp; p.mp = p.res === 'grit' ? 0 : p.maxMp; p.cuts = 0; } else { p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp); }
}
const resName = p => RESOURCES[p.res || 'mana'].name;
const gainRes = (p, n) => { if (isPlayer(p)) p.mp = Math.min(p.maxMp, p.mp + n * (1 + ((p.tm && p.tm.resGain) || 0))); };
const tmOf = e => (isPlayer(e) && e.tm) || {};

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
function rollDamage(a, b, mul = 1) {
  const tm = tmOf(a); const crit = R() < .1 + (tm.crit || 0);
  if (tm.executeBelow && b.hp <= b.maxHp * tm.executeBelow) mul *= 1 + tm.executeMul;   // 처형자: finish off weakened foes
  let d = a.atk * (a.dmgMul || 1) * (a.fx && a.fx.rage > now() ? 1.3 : 1) * mul * (0.85 + R() * .3) - b.def * .6; if (crit) d *= 1.6; return [Math.max(1, Math.round(d)), crit];
}
function attack(a, b) {
  a.cd = now() + a.atkSpeed; face(a, b);
  broadcastNear(a.x, a.y, { t: 'ev', k: 'atk', a: a.id, b: b.id, r: a.ranged ? 1 : 0 });
  const delay = a.ranged ? 120 + dist(a, b) * 60 : 220;
  const swing = () => { if (!canFight(a, b)) return; if (!a.ranged && dist(a, b) > a.range + 1) return; const [d, c] = rollDamage(a, b); damage(b, d, a, c); };
  setTimeout(swing, delay);
  const ds = tmOf(a).doubleStrike; if (ds && R() < ds) setTimeout(() => { broadcastNear(a.x, a.y, { t: 'ev', k: 'atk', a: a.id, b: b.id, r: a.ranged ? 1 : 0 }); swing(); }, delay + 180);   // 연속 공격
}
// thr: extra threat multiplier for this hit (tank skills); the attacker's class multiplier applies on top
function damage(b, dmg, a, crit, thr = 1) {
  if (b.dead) return;
  const btm = tmOf(b);
  if (btm.dodge && a && R() < btm.dodge) { b.combatT = now(); broadcastNear(b.x, b.y, { t: 'ev', k: 'dmg', b: b.id, v: 0, a: a.id, miss: 1 }); return; }   // 받아넘기기·날렵함·은총
  if (b.invuln) { broadcastNear(b.x, b.y, { t: 'ev', k: 'dmg', b: b.id, v: 0, a: a ? a.id : 0, imm: 1 }); return; }   // warded boss
  if (b.fx && b.fx.bulwark > now()) dmg = Math.max(1, Math.round(dmg * (1 - (b.bulwarkReduce || .4))));
  if (b.fx && b.fx.shroud > now()) dmg = Math.max(1, Math.round(dmg * .5));
  let ab = 0; if (b.shield > 0 && b.shieldT > now()) { ab = Math.min(b.shield, dmg); b.shield -= ab; dmg -= ab; }
  b.hp -= dmg; b.combatT = now(); if (a) a.combatT = now();
  broadcastNear(b.x, b.y, { t: 'ev', k: 'dmg', b: b.id, v: dmg, c: crit ? 1 : 0, a: a ? a.id : 0, ab });
  if (isMonster(b) && isPlayer(a)) addThreat(b, a, (dmg + ab) * (a.threatMul || 1) * thr);
  const ls = tmOf(a).lifesteal; if (ls && dmg > 0 && !a.dead) a.hp = Math.min(a.maxHp, a.hp + dmg * ls);   // 피의 맛 / 피의 갈증 / 정의의 흡수
  if (isMonster(b) && (!b.target || !ents.has(b.target.id))) b.target = a;
  if (isPlayer(a) && a.res === 'grit') gainRes(a, 4);
  if (isPlayer(b) && b.res === 'grit') gainRes(b, 3 + Math.round((dmg + ab) / b.maxHp * 60));
  if (isPlayer(b) && !b.target && !b.path && a) { b.target = a; b.engaged = true; }
  if (isPlayer(a) && isPlayer(b) && b.align >= 0 && !(b.flagT > now())) { if (!(a.flagT > now())) sys(a, '선량한 모험가를 공격했습니다. 1분 동안 보라색 이름(공격자)으로 표시됩니다.'); a.flagT = now() + 60000; bump(a); }
  if (b.hp <= 0) kill(b, a);
}
function kill(b, a) {
  b.hp = 0; b.dead = true; b.deadT = now(); b.path = null; b.target = null; b.engaged = false; b.amove = null; b.threat = null; b.cast = null; b.shield = 0;
  if (b.casting) cancelCast(b);
  for (const e of ents.values()) if (e.target === b) { e.target = null; e.engaged = false; }
  broadcastNear(b.x, b.y, { t: 'ev', k: 'die', id: b.id });
  if (isMonster(b)) {
    const m = MONSTERS[b.type]; b.respawnAt = b.temp ? Infinity : now() + (m.respawn || 20000); b.cast = null; b.charging = null;
    if (b.temp) setTimeout(() => ents.delete(b.id), 3000);
    if (isPlayer(a)) {
      const mul = b.elite ? 3 : 1; const g = (m.gold[0] + Math.floor(R() * (m.gold[1] - m.gold[0] + 1))) * mul;
      spawnDrop(b.x, b.y, null, g, a);
      for (const [id, p] of DROPS[b.type] || []) if (R() < p * (b.elite ? 2 : 1)) spawnDrop(b.x, b.y, { id, n: 1, enh: 0 }, 0, a);
      if (b.elite && R() < .25) spawnDrop(b.x, b.y, { id: ['ironHelm', 'chainMail', 'silverRing', 'longSword', 'ironShield'][Math.floor(R() * 5)], n: 1, enh: 1 + Math.floor(R() * 3) }, 0, a);
      social.shareExp(a, m.exp * mul, gainExp); questKill(a, b.type, b.elite);
      if (social.partyOf(a)) for (const mm of social.partyOf(a).members) if (mm !== a && !mm.dead && dist(mm, a) <= 22) questKill(mm, b.type, b.elite);
      a.stats.mkills = (a.stats.mkills || 0) + 1; if (m.boss) { a.stats.bossKills = (a.stats.bossKills || 0) + 1; if (social.partyOf(a)) for (const mm of social.partyOf(a).members) if (mm !== a && dist(mm, a) <= 22) { mm.stats.bossKills = (mm.stats.bossKills || 0) + 1; checkTitles(mm); } } checkTitles(a);
      if (m.boss && b.inst == null) broadcastAll({ t: 'chat', sys: true, msg: `👑 ${a.name}이(가) ${m.name}을(를) 쓰러뜨렸습니다!` });
      if (m.boss && b.inst != null) instanceBoss(b);
      if (b.raid && raid) { raid.part.add(a.accountId); if (social.partyOf(a)) for (const mm of social.partyOf(a).members) if (dist(mm, a) <= 22) raid.part.add(mm.accountId); raid.left--; raidCheck(); }
    }
  } else if (isPlayer(b)) {
    b.respawnAt = now() + 5000;
    const chaotic = b.align < 0; const lost = Math.floor(b.gold * (chaotic ? .2 : .1)); b.gold -= lost;
    b.exp = Math.max(0, b.exp - Math.floor(expNeed(b.level) * .05));
    if (lost > 0) spawnDrop(b.x, b.y, null, lost, isPlayer(a) ? a : null);
    if (chaotic && b.inv.length) { const it = b.inv.splice(Math.floor(R() * b.inv.length), 1)[0]; spawnDrop(b.x, b.y, it, 0, isPlayer(a) ? a : null); sys(b, `무법자 상태로 쓰러져 ${itemName(it)}을(를) 떨어뜨렸습니다.`); }
    sys(b, `${a ? a.name + '에게 ' : ''}쓰러졌습니다. 금화 ${lost}과 경험치 일부를 잃었습니다. 5초 뒤 마을에서 깨어납니다.`);
    if (isPlayer(a)) {
      const innocent = b.align >= 0 && !(b.flagT > now());
      if (innocent) { a.align -= 1; a.kills++; sys(a, `${b.name}을(를) 살해했습니다. 명예가 떨어져 무법자(붉은 이름)가 됩니다.`); }
      else { a.align = Math.min(a.align + 1, 30); sys(a, `${b.name}을(를) 처단했습니다.`); }
      a.stats.pks = (a.stats.pks || 0) + 1; b.stats.deaths = (b.stats.deaths || 0) + 1; checkTitles(a); bump(a); a.saveDirty = true;
      broadcastAll({ t: 'chat', sys: true, msg: `⚔ ${a.name}이(가) 성 밖에서 ${b.name}을(를) 쓰러뜨렸습니다.` }); logEvent('pk', a.name, b.name, { innocent, lost });
    }
    invChanged(b);
  }
}
function gainExp(p, n) {
  p.exp += n; let up = false; if (n > 0) sendTo(p, { t: 'ev', k: 'xp', id: p.id, v: Math.round(n) }); const pts0 = talentPoints(p.level);
  while (p.exp >= expNeed(p.level)) { p.exp -= expNeed(p.level); p.level++; up = true; }
  p.saveDirty = true;
  if (up) { applyStats(p, true); bump(p); checkTitles(p); broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level }); sys(p, `레벨 ${p.level} 달성!` + (p.level >= CLASS_LEVEL && p.cls === 'commoner' ? ' 이제 전직할 수 있습니다. 기사단·마법사 탑·예배당·여관의 스승을 찾아가세요.' : p.level >= ADV_LEVEL && CLASSES[p.cls] && ADV_OF[p.cls] ? ' 스승에게 돌아가면 승급(2차 전직)할 수 있습니다.' : '') + (talentPoints(p.level) > pts0 ? ' 특성 점수를 얻었습니다 (T 키).' : '')); }
}

// ── skills: one entry point for every class skill (see SKILLS in shared/rules.js). Costs, cooldowns, the global cooldown,
// cast times, targets and ranges are all checked here; the client only says "use skill X on target Y".
// threat: every monster keeps a table of who hurt (or healed against) it and attacks the top entry (see pickTarget)
function addThreat(m, p, n) { if (!m.threat) m.threat = new Map(); m.threat.set(p.id, (m.threat.get(p.id) || 0) + n); }
function healThreat(healer, target, amount) { for (const m of near(target.x, target.y, 14, isMonster)) if (m.threat && m.threat.has(target.id)) addThreat(m, healer, amount * .5); }
function healUnit(healer, t, amount) {
  amount *= (1 + (tmOf(healer).healPower || 0)) * (1 + (tmOf(t).healTaken || 0));
  const h = Math.min(Math.round(amount), t.maxHp - Math.ceil(t.hp)); t.hp = Math.min(t.maxHp, t.hp + Math.round(amount));
  broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'heal', id: t.id, v: Math.round(amount) }); if (h > 0) healThreat(healer, t, h);
}
// interrupt a monster's or player's cast; monsters can't start another spell for 3 s
function interrupt(t) {
  if (isMonster(t) && t.cast && t.cast.intr) { t.cast = null; t.silencedT = now() + 3000; broadcastNear(t.x, t.y, { t: 'ev', k: 'castend', id: t.id, cut: 1 }); return true; }
  if (isPlayer(t) && t.casting) { cancelCast(t, true); return true; }
  return false;
}
function cancelCast(p, cut) { if (!p.casting) return; p.casting = null; broadcastNear(p.x, p.y, { t: 'ev', k: 'castend', id: p.id, cut: cut ? 1 : 0 }); if (cut) sys(p, '시전이 끊겼습니다.'); }
// the friendly player a support skill lands on: your selected target if it's a player you can't fight, else yourself
function allyTarget(p, s, tid) { const t = ents.get(+tid); return t && isPlayer(t) && !t.dead && t !== p && !canFight(p, t) && dist(p, t) <= s.range ? t : p; }
function enemyTarget(p, s, tid) {
  const range = skillRange(s, p.range);
  let t = ents.get(+tid); if (!t || !canFight(p, t)) t = p.target && ents.get(p.target.id);
  if (!t || !canFight(p, t)) { t = null; let bd = range; for (const e of near(p.x, p.y, range, isMonster)) { const d = dist(p, e); if (d < bd && canFight(p, e)) { bd = d; t = e; } } }
  return t;
}
function trySkill(p, id, tid) {
  if (!SKILLS[id] || !skillsFor(p.cls).includes(id)) return; const s = effSkill(id, p.tm);
  const friendly = s.target === 'self' || s.target === 'ally';
  if (!friendly && isSafe(p.x, p.y)) return sys(p, '성내에서는 기술을 쓸 수 없습니다.');
  if (p.casting) return sys(p, '이미 주문을 외우는 중입니다.');
  if (p.stunT > now()) return;
  if (!s.offGcd && now() < (p.gcd || 0)) return;
  if ((p.cds[id] || 0) > now()) return sys(p, `${s.name}이(가) 아직 준비되지 않았습니다.`);
  if (p.mp < s.cost && !p.freeNext) return sys(p, `${resName(p)}이(가) 부족합니다.`);
  if (s.finisher && !p.cuts) return sys(p, '칼자국이 없습니다. 먼저 칼질로 칼자국을 내세요.');
  let t = null;
  if (s.target === 'self') t = p; else if (s.target === 'ally') t = allyTarget(p, s, tid);
  else if (s.range) { t = enemyTarget(p, s, tid); if (!t) return sys(p, '대상이 없습니다.'); if (dist(p, t) > skillRange(s, p.range)) return sys(p, '대상이 너무 멉니다.'); face(p, t); }
  if (!s.offGcd) p.gcd = now() + GCD;
  if (s.cast) {
    // casting: stand still; moving, being stunned or interrupted cancels it. Cost and cooldown are paid when it completes.
    p.casting = { id, tid: t ? t.id : 0, until: now() + s.cast, total: s.cast }; p.path = null; p.amove = null;
    broadcastNear(p.x, p.y, { t: 'ev', k: 'cast', id: p.id, s: id, ms: s.cast }); return;
  }
  execSkill(p, id, t);
}
function finishCast(p) {
  const c = p.casting; p.casting = null; const s = effSkill(c.id, p.tm); let t = c.tid ? ents.get(c.tid) : null;
  const ok = (p.mp >= s.cost || p.freeNext) && (s.target === 'self' || s.target === 'ally' ? (t && !t.dead) : (t && canFight(p, t) && dist(p, t) <= skillRange(s, p.range) + 1));
  broadcastNear(p.x, p.y, { t: 'ev', k: 'castend', id: p.id, cut: ok ? 0 : 1 });
  if (!ok) { if (s.target === 'ally' && (!t || t.dead)) t = p; else return sys(p, '주문이 대상에 닿지 않았습니다.'); }
  execSkill(p, c.id, t);
}
function execSkill(p, id, t) {
  const s = effSkill(id, p.tm), tm = p.tm || {};
  // 마력 순환 / 축복받은 손: a lucky cast makes the next one free
  if (p.freeNext && s.cost) p.freeNext = false; else p.mp -= s.cost;
  if (s.cost && tm.clearcast && R() < tm.clearcast) { p.freeNext = true; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'clear', id: p.id }); }
  if (s.cd) p.cds[id] = now() + s.cd; p.combatT = s.target === 'self' || s.target === 'ally' ? p.combatT : now();
  if (s.gain) gainRes(p, s.gain);
  const hit = (e, mul, crit) => { let [d, c] = rollDamage(p, e, mul); if (crit && !c) { d = Math.round(d * 1.6); c = true; } damage(e, d, p, c, s.threat || 1); return c; };
  const aoeAround = (x, y, r) => near(x, y, r + .5, e => canFight(p, e)).filter(e => Math.hypot(e.x - x, e.y - y) <= r);
  if (t && t !== p && !s.aoeAt) broadcastNear(p.x, p.y, { t: 'ev', k: 'atk', a: p.id, b: t.id, r: s.proj ? 1 : 0 });
  else if (!t) broadcastNear(p.x, p.y, { t: 'ev', k: 'atk', a: p.id, b: 0, r: 0 });
  // single target strike (+ stun / interrupt / bleed / combo points)
  if (s.mul && t && t !== p && !s.aoeAt && !s.chain && !s.hits) {
    let mul = s.finisher ? s.mul + s.perCut * p.cuts : s.mul; if (s.finisher) p.cuts = 0;
    if (s.execBelow && t.hp <= t.maxHp * s.execBelow) mul *= 1 + s.execMul;   // 마무리
    if (s.interrupt) interrupt(t);
    hit(t, mul);
    if (s.stun && !t.dead) { t.stunT = now() + s.stun; t.path = null; if (t.casting) cancelCast(t, true); broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'stun', id: t.id }); }
    if (s.bleed && !t.dead) { t.fx.bleed = now() + s.bleed; t.bleedBy = p; broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'bleed', id: t.id }); }
  }
  if (s.cuts) p.cuts = Math.min(MAX_CUTS, (p.cuts || 0) + s.cuts + (s.extraCut && R() < s.extraCut ? 1 : 0));
  // fireball-style: projectile, then a blast around the target
  if (s.aoeAt && t) { const tx = t.x, ty = t.y; broadcastNear(p.x, p.y, { t: 'ev', k: 'atk', a: p.id, b: t.id, r: 1 }); setTimeout(() => { broadcastNear(tx, ty, { t: 'ev', k: 'fx', fx: 'fire', x: tx, y: ty }); let crit = false; for (const e of aoeAround(tx, ty, s.aoeAt)) crit = hit(e, s.mul) || crit;
    if (crit && tm.fireReset) { p.cds[id] = 0; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'clear', id: p.id }); } }, 120 + dist(p, t) * 60); }   // 화염 폭주
  // around yourself: damage, slow, taunt
  if (s.aoe) {
    broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: s.slow ? 'frost' : s.taunt ? 'taunt' : s.selfHeal ? 'holy' : 'slam', id: p.id, x: p.x, y: p.y, r: s.aoe });
    for (const e of aoeAround(p.x, p.y, s.aoe)) {
      if (s.mul) hit(e, s.mul);
      if (s.slow && !e.dead) e.fx.slow = now() + s.slow;
      if (s.stun && !e.dead) { e.stunT = now() + s.stun; e.path = null; if (isMonster(e) && e.cast) interrupt(e); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'stun', id: e.id }); }   // 영원한 겨울
      if (s.taunt && isMonster(e) && !e.dead) { let top = 0; if (e.threat) for (const v of e.threat.values()) top = Math.max(top, v); e.threat = e.threat || new Map(); e.threat.set(p.id, top * 1.1 + 50); e.tauntBy = p; e.tauntUntil = now() + s.taunt; e.target = p; }
    }
  }
  if (s.chain && t) { let cur = t; const seen = new Set(), seq = []; for (let i = 0; i < s.chain && cur; i++) { seen.add(cur); seq.push(cur); let nx = null, nd = 4; for (const e of near(cur.x, cur.y, 4, x => canFight(p, x) && !seen.has(x))) { const dd = dist(cur, e); if (dd < nd) { nd = dd; nx = e; } } cur = nx; }
    seq.forEach((e, i) => setTimeout(() => { if (!canFight(p, e)) return; hit(e, s.mul, false); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'chain', id: e.id, from: i ? seq[i - 1].id : p.id }); }, i * 130)); }
  if (s.hits && t) for (let i = 0; i < s.hits; i++) setTimeout(() => { if (!canFight(p, t) || dist(p, t) > 2.2) return; p.atkT = now(); broadcastNear(p.x, p.y, { t: 'ev', k: 'atk', a: p.id, b: t.id, r: 0 }); hit(t, s.mul, i === s.hits - 1); }, i * 220);
  if (s.heal && t) healUnit(p, t, t.maxHp * s.heal);
  const party = social.partyOf(p);
  if (id === 'mend' && t && tm.mendSplash && party) for (const mm of party.members) if (mm !== t && !mm.dead && dist(mm, t) <= 4) healUnit(p, mm, mm.maxHp * s.heal * tm.mendSplash);   // 기적
  if (s.selfHeal) healUnit(p, p, p.maxHp * s.selfHeal);
  if (s.shield && t) { t.shield = Math.round(t.maxHp * s.shield); t.shieldT = now() + s.dur; broadcastNear(t.x, t.y, { t: 'ev', k: 'fx', fx: 'shield', id: t.id }); if (t !== p) healThreat(p, t, t.shield * .5); }
  if (s.buff === 'bulwark') { p.fx.bulwark = now() + s.dur; p.bulwarkReduce = .4 + (s.reduce || 0); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'shield', id: p.id });
    if (tm.bulwarkShield && party) for (const mm of party.members) if (mm !== p && !mm.dead && dist(mm, p) <= 6) { mm.shield = Math.round(mm.maxHp * tm.bulwarkShield); mm.shieldT = now() + s.dur; broadcastNear(mm.x, mm.y, { t: 'ev', k: 'fx', fx: 'shield', id: mm.id }); } }   // 희생
  if (s.buff === 'bless') { p.fx.bless = now() + s.dur; applyStats(p); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'holy', x: p.x, y: p.y }); setTimeout(() => { if (!p.dead) applyStats(p); }, s.dur + 100); }
  if (s.vanish) { for (const m of near(p.x, p.y, s.vanish, isMonster)) { if (m.threat) m.threat.delete(p.id); if (m.target === p) m.target = null; if (m.tauntBy === p) m.tauntBy = null; } p.engaged = false; p.target = null; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'smoke', id: p.id, x: p.x, y: p.y }); if (tm.shroud) p.fx.shroud = now() + tm.shroud; }   // 그림자 망토
}

// ── NPC services
function npcFor(p, npcId) { const n = npcById[npcId]; if (!n) return null; if (dist(p, n) > 3.2) { sys(p, `${n.name}에게 더 가까이 가세요.`); return null; } return n; }
function talkTo(p, n) { face(p, n); if (n.villager) { n.dir = dirOf(p.x - n.x, p.y - n.y); n.path = null; n.wanderT = now() + 6000; sys(p, `${n.name}: "${n.lines[Math.floor(R() * n.lines.length)]}"`); return; } p.npcOpen = n.npcId; sendTo(p, npcInfo(n, p)); }
function npcInfo(n, p) { const quests = QUESTS.filter(q => q.giver === n.npcId).map(q => ({ id: q.id, st: questState(p, q), prog: questProgress(p, q) })); return { t: 'npc', id: n.npcId, name: n.name, shop: n.shop || null, craft: n.craft || null, enhance: !!n.enhance, rest: n.rest || 0, master: n.master || null, atone: !!n.atone, guard: !!n.guard, bank: !!n.bank, quests, bankItems: n.bank ? p.bank : undefined, bankGold: n.bank ? p.bankGold : undefined, market: n.market ? market.view(p) : undefined }; }
function refreshNpc(p) { if (p.npcOpen) { const n = npcById[p.npcOpen]; if (n && dist(p, n) <= 3.2) sendTo(p, npcInfo(n, p)); else p.npcOpen = null; } }
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
    p.cls = cls; applyStats(p, true); bump(p); sys(p, `${CLASSES[cls].master}의 인도로 ${CLASSES[cls].name}이(가) 되었습니다. 새 기술 ${skillsFor(cls).map((k, i) => `${i + 1} ${SKILLS[k].name}`).join(' · ')}`);
    broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level, txt: CLASSES[cls].name + ' 전직!' });
  } else if (m.t === 'advance') {
    const base = n.master; const adv = ADV_OF[base]; if (!adv) return; if (p.cls !== base) return sys(p, ADV[p.cls] ? '이미 승급했습니다.' : '이 스승의 제자가 아닙니다.'); if (p.level < ADV_LEVEL) return sys(p, `레벨 ${ADV_LEVEL}이 되어야 승급할 수 있습니다.`);
    p.cls = adv; applyStats(p, true); bump(p); sys(p, `${ADV[adv].master}의 인도로 ${ADV[adv].name}(으)로 승급했습니다. 새 기술 '${SKILLS[skillsFor(adv).find(k => SKILLS[k].adv === adv)].name}'이(가) 기술 칸에 생겼습니다.`);
    broadcastNear(p.x, p.y, { t: 'ev', k: 'lvl', id: p.id, lv: p.level, txt: ADV[adv].name + ' 승급!' }); broadcastAll({ t: 'chat', sys: true, msg: `✨ ${p.name}이(가) ${ADV[adv].name}(으)로 승급했습니다.` });
  } else if (m.t === 'bankIn') {
    if (!n.bank) return; const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return;
    const b = ITEMS[it.id]; const dst = b.stack ? p.bank.find(x => x.id === it.id) : null;
    if (!dst && p.bank.length >= BANK_SIZE) return sys(p, '창고가 가득 찼습니다.');
    p.inv.splice(m.i | 0, 1); if (dst) dst.n += it.n; else p.bank.push(it);
  } else if (m.t === 'bankOut') {
    if (!n.bank) return; const it = p.bank[m.i | 0]; if (!it || it.id !== m.id) return;
    if (!addItem(p, it)) return sys(p, '가방이 가득 찼습니다.'); p.bank.splice(m.i | 0, 1);
  } else if (m.t === 'bankGold') {
    if (!n.bank) return; let v = Math.floor(+m.v || 0); if (!v) return;
    if (v > 0) { v = Math.min(v, p.gold); p.gold -= v; p.bankGold += v; } else { v = Math.min(-v, p.bankGold); p.bankGold -= v; p.gold += v; }
  } else if (m.t === 'qaccept') {
    const q = QBY[m.q]; if (!q || q.giver !== n.npcId || questState(p, q) !== 'avail') return; p.quests[q.id] = { st: 'active', k: 0 }; sys(p, `의뢰 수락: ${q.title}`);
  } else if (m.t === 'qdone') {
    const q = QBY[m.q]; if (!q || q.giver !== n.npcId || !questReady(p, q)) return;
    if (q.type === 'collect') takeItem(p, q.target, q.n);
    const r = q.reward; p.gold += r.gold || 0; if (r.items) for (const [id, cnt] of Object.entries(r.items)) addItem(p, { id, n: cnt, enh: 0 });
    p.quests[q.id].st = 'done'; if (q.daily) p.quests[q.id].day = dayKey(); checkTitles(p); sys(p, `의뢰 완료: ${q.title} · 금화 ${r.gold}${r.items ? ' · ' + Object.keys(r.items).map(k => ITEMS[k].name).join(', ') : ''}`); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'craft', id: p.id }); if (r.exp) gainExp(p, r.exp);
  } else if (m.t === 'mlist') { if (n.market) market.list(p, m.i | 0, m.price);
  } else if (m.t === 'mbuy') { if (n.market) market.buy(p, m.id);
  } else if (m.t === 'mcancel') { if (n.market) market.cancel(p, m.id);
  } else if (m.t === 'atone') {
    if (!n.atone || p.align >= 0) return; const cost = -p.align * 150; if (p.gold < cost) return sys(p, `헌금 ${cost} G가 필요합니다.`); p.gold -= cost; p.align = 0; bump(p); sys(p, '죄가 씻겼습니다. 명예가 0으로 돌아왔습니다.');
  }
  invChanged(p); refreshNpc(p);
}
// ── quests
// titles
function titlesOf(p) { return TITLES.filter(t => { try { return t.req(p, p.stats); } catch { return false; } }).map(t => t.id); }
function sendTitles(p) { sendTo(p, { t: 'titles', have: titlesOf(p), cur: p.stats.title || 'none', stats: { mkills: p.stats.mkills || 0, bossKills: p.stats.bossKills || 0, pks: p.stats.pks || 0, deaths: p.stats.deaths || 0, raids: p.stats.raids || 0 } }); }
function checkTitles(p) { const have = titlesOf(p); const had = p.stats.had || []; const fresh = have.filter(id => !had.includes(id) && id !== 'none' && id !== 'novice'); if (fresh.length) { p.stats.had = have; for (const id of fresh) sys(p, `🏅 새 칭호를 얻었습니다: 「${TITLE_BY[id].name}」 — ${TITLE_BY[id].desc} (캐릭터 창에서 선택)`); sendTitles(p); } p.saveDirty = true; }
function setTitle(p, id) { if (!TITLE_BY[id] || !titlesOf(p).includes(id)) return sys(p, '아직 얻지 못한 칭호입니다.'); p.stats.title = id; p.metaVer++; p.saveDirty = true; sendTitles(p); }
const dayKey = () => new Date(now() + 9 * 3600000).toISOString().slice(0, 10);   // KST calendar day
function questState(p, q) { const s = p.quests[q.id]; if (s && q.daily && s.st === 'done' && s.day !== dayKey()) return p.level >= q.lvl ? 'avail' : 'locked'; return s ? s.st : (p.level >= q.lvl ? 'avail' : 'locked'); }
function questProgress(p, q) { const s = p.quests[q.id]; if (!s) return 0; return q.type === 'collect' ? Math.min(q.n, countItem(p, q.target)) : (s.k || 0); }
function questReady(p, q) { const s = p.quests[q.id]; return !!s && s.st === 'active' && questProgress(p, q) >= q.n; }
function questKill(p, type, elite) { for (const q of QUESTS) { const s = p.quests[q.id]; if (!s || s.st !== 'active' || q.type !== 'kill' || !(q.target === type || (q.target === 'elite' && elite))) continue; s.k = (s.k || 0) + 1; p.saveDirty = true; if (s.k <= q.n) sys(p, `${q.title}: ${Math.min(s.k, q.n)}/${q.n}` + (s.k === q.n ? ' — 의뢰인에게 돌아가세요.' : '')); } }
function questMarks(p) { const out = {}; for (const q of QUESTS) { const st = questState(p, q); const cur = out[q.giver]; if (st === 'active' && questReady(p, q)) out[q.giver] = 2; else if (st === 'avail' && cur !== 2) out[q.giver] = 1; } return out; }

const social = createSocial({ ents, sys, sendTo, broadcastAll, findPlayerByName, isSafe, dist, invChanged, addItem, now });
export { social };

// ── AI
function bossAI(e, t, dt) {
  const m = MONSTERS[e.type];
  // the abbot's ward drops once every guardian he called is dead
  if (e.invuln && !(e.guards || []).some(g => !g.dead && ents.get(g.id) === g)) { e.invuln = false; broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'unward', id: e.id }); for (const o of near(e.x, e.y, 20, isPlayer)) sys(o, `${e.name}의 결계가 깨졌습니다!`); }
  if (e.cast) { const c = e.cast; if (now() < c.until) { e.moving = false; return true; } e.cast = null;
    if (c.k === 'slam' || c.k === 'bolt' || c.k === 'darkmend') broadcastNear(e.x, e.y, { t: 'ev', k: 'castend', id: e.id, cut: 0 });
    if (c.k === 'darkmend') { const h = Math.round(e.maxHp * c.heal); e.hp = Math.min(e.maxHp, e.hp + h); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'heal', id: e.id, v: h }); }
    // a dark bolt finishes: big hit on whoever it was aimed at, if they're still in reach
    if (c.k === 'bolt') { const o = ents.get(c.tid); if (o && !o.dead && canFight(e, o) && dist(e, o) <= e.range + 2.5) { broadcastNear(e.x, e.y, { t: 'ev', k: 'atk', a: e.id, b: o.id, r: 1 }); const [d] = rollDamage(e, o, c.mul); setTimeout(() => { if (!o.dead && canFight(e, o)) damage(o, d, e, true); }, 120 + dist(e, o) * 60); } }
    if (c.k === 'slam') { broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'slam', x: e.x, y: e.y, r: c.r }); for (const o of near(e.x, e.y, c.r + .5, x => canFight(e, x))) if (dist(e, o) <= c.r + .4) { const [d] = rollDamage(e, o, c.mul); damage(o, d, e, true); } }
    else if (c.k === 'charge') { e.charging = { tx: c.tx, ty: c.ty, until: now() + 800, mul: c.mul, hit: false }; }
  }
  if (e.charging) { const ch = e.charging; const dx = ch.tx - e.x, dy = ch.ty - e.y, d = Math.hypot(dx, dy); const sp = e.speed * 3.8 * dt;
    if (d > sp && now() < ch.until) { const nx = e.x + dx / d * sp, ny = e.y + dy / d * sp; if (!W.monsterBlock[Math.floor(ny) * MAP + Math.floor(nx)]) { e.x = nx; e.y = ny; e.dir = dirOf(dx, dy); } else e.charging = null; e.moving = true; } else e.charging = null;
    if (e.charging && !ch.hit) for (const o of near(e.x, e.y, 1.3, x => canFight(e, x))) if (dist(e, o) < 1.2) { ch.hit = true; const [d] = rollDamage(e, o, ch.mul); damage(o, d, e, true); o.stunT = now() + 800; broadcastNear(o.x, o.y, { t: 'ev', k: 'fx', fx: 'stun', id: o.id }); }
    return true; }
  const d = dist(e, t);
  for (const s of m.skills) {
    if ((e.sk[s.k] || 0) > now()) continue;
    if (s.k === 'slam' && d <= s.r + .3) { e.sk[s.k] = now() + s.cd; e.cast = { k: 'slam', until: now() + s.wind, r: s.r, mul: s.mul }; e.path = null; face(e, t); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'tele_slam', id: e.id, x: e.x, y: e.y, r: s.r, ms: s.wind }); broadcastNear(e.x, e.y, { t: 'ev', k: 'cast', id: e.id, n: s.name || '내려찍기', ms: s.wind, intr: 0 }); return true; }
    // 어둠의 기도: once hurt, a long self-heal that must be interrupted
    if (s.k === 'darkmend' && e.hp < e.maxHp * .85 && !(e.silencedT > now())) { e.sk[s.k] = now() + s.cd; e.cast = { k: 'darkmend', until: now() + s.wind, heal: s.heal, intr: true }; e.path = null; e.moving = false; broadcastNear(e.x, e.y, { t: 'ev', k: 'cast', id: e.id, n: s.name, ms: s.wind, intr: 1 }); return true; }
    // 불타는 종유: a warning ring under up to n players, then a burning puddle for `life` ms — spread out and step away
    if (s.k === 'puddle') { e.sk[s.k] = now() + s.cd; const tg = near(e.x, e.y, 14, o => isPlayer(o) && canFight(e, o)).sort(() => R() - .5).slice(0, s.n + (e.hard ? 1 : 0));
      for (const o of tg) { const h = { x: o.x, y: o.y, r: s.r, start: now() + s.warn, end: now() + s.warn + s.life, pct: s.pct, src: e, slot: e.inst, next: 0 }; hazards.push(h); broadcastNear(h.x, h.y, { t: 'ev', k: 'fx', fx: 'hazard', x: h.x, y: h.y, r: h.r, warn: s.warn, life: s.life }); }
      if (tg.length) broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'roar', id: e.id, x: e.x, y: e.y }); return false; }
    // 결계: at each health threshold, call guardians and become immune until they all fall
    if (s.k === 'adds') { const ph = e.phase || 0; if (ph < s.at.length && e.hp <= e.maxHp * s.at[ph]) { e.phase = ph + 1; e.invuln = true; e.guards = [];
      for (let i = 0; i < s.n + (e.hard ? 1 : 0); i++) { const a = (i / s.n) * Math.PI * 2; let gx = e.x + Math.cos(a) * 2.5, gy = e.y + Math.sin(a) * 2.5; if (W.monsterBlock[Math.floor(gy) * MAP + Math.floor(gx)]) { gx = e.x; gy = e.y; } const g = spawnMonster(s.mob, gx, gy); g.target = t; if (e.inst != null) adoptMonster(e.inst, g); else g.temp = true; e.guards.push(g); }
      broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'ward', id: e.id }); for (const o of near(e.x, e.y, 20, isPlayer)) sys(o, `${e.name}이(가) 결계를 쳤습니다! 결계 수호자를 모두 쓰러뜨리세요.`); return false; } continue; }
    // 격노: a long fight makes him hit 30% harder for good
    if (s.k === 'enrage') { if (!e.enraged && e.fightStart && now() - e.fightStart > s.after) { e.enraged = true; e.fx.rage = Infinity; broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'roar', id: e.id, x: e.x, y: e.y }); for (const o of near(e.x, e.y, 20, isPlayer)) sys(o, `${e.name}이(가) 격노합니다!`); } continue; }
    // interruptible spell: a visible cast bar; 방패 강타·마력 차단·꾸짖음·목 치기 cut it (and lock the caster out for 3 s)
    if (s.k === 'bolt' && d <= e.range + 1.5 && !(e.silencedT > now())) { e.sk[s.k] = now() + s.cd; e.cast = { k: 'bolt', until: now() + s.wind, mul: s.mul, tid: t.id, intr: true }; e.path = null; e.moving = false; face(e, t); broadcastNear(e.x, e.y, { t: 'ev', k: 'cast', id: e.id, n: s.name, ms: s.wind, intr: 1 }); return true; }
    if (s.k === 'charge' && d >= 2.5 && d <= 8) { e.sk[s.k] = now() + s.cd; e.cast = { k: 'charge', until: now() + 500, tx: t.x, ty: t.y, mul: s.mul }; e.path = null; face(e, t); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'tele_charge', id: e.id, x: t.x, y: t.y, ms: 500 }); return true; }
    if (s.k === 'roar' && d <= s.r) { e.sk[s.k] = now() + s.cd; broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'roar', id: e.id, x: e.x, y: e.y }); for (const o of near(e.x, e.y, s.r, x => canFight(e, x))) if (dist(e, o) <= s.r) { o.stunT = now() + 1500; o.path = null; broadcastNear(o.x, o.y, { t: 'ev', k: 'fx', fx: 'stun', id: o.id }); } return false; }
    if (s.k === 'howl' && d <= 7) { e.sk[s.k] = now() + s.cd; e.fx.rage = now() + 8000; broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'roar', id: e.id, x: e.x, y: e.y }); for (let i = 0; i < 2; i++) { const w = spawnMonster('skel_minion', e.x + (R() - .5) * 2, e.y + (R() - .5) * 2); w.temp = true; w.target = t; if (e.inst != null) adoptMonster(e.inst, w); } return false; }
    if (s.k === 'summon' && d <= 9) { e.sk[s.k] = now() + s.cd; broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'summon', id: e.id, x: e.x, y: e.y }); for (let i = 0; i < 3; i++) { let sx = e.x + (R() - .5) * 3, sy = e.y + (R() - .5) * 3; if (W.monsterBlock[Math.floor(sy) * MAP + Math.floor(sx)]) { sx = e.x; sy = e.y; } const w = spawnMonster(s.mob || 'skel_warrior', sx, sy); w.temp = true; w.target = t; if (e.inst != null) adoptMonster(e.inst, w); } return false; }
    if (s.k === 'lunge' && d >= 1.8 && d <= 4.5) { e.sk[s.k] = now() + s.cd; const dx = t.x - e.x, dy = t.y - e.y; const nx = t.x - dx / d, ny = t.y - dy / d; if (!W.monsterBlock[Math.floor(ny) * MAP + Math.floor(nx)]) { e.x = nx; e.y = ny; } face(e, t); broadcastNear(e.x, e.y, { t: 'ev', k: 'atk', a: e.id, b: t.id, r: 0 }); const [dm] = rollDamage(e, t, s.mul); damage(t, dm, e, true); return true; }
    if (s.k === 'regen' && e.hp < e.maxHp * .6) { e.sk[s.k] = now() + s.cd; const h = Math.round(e.maxHp * .15); e.hp = Math.min(e.maxHp, e.hp + h); broadcastNear(e.x, e.y, { t: 'ev', k: 'fx', fx: 'heal', id: e.id, v: h }); return false; }
  }
  return false;
}
// who a monster attacks: whoever taunted it (while the taunt lasts), else the top of its threat table — but it only
// switches away from its current target once someone else has 10% more threat, so tanks keep hold of it
function pickTarget(e) {
  const ok = p => p && !p.dead && ents.get(p.id) === p && canFight(e, p) && dist(e, p) <= 13;
  if (e.tauntBy && e.tauntUntil > now() && ok(e.tauntBy)) return e.tauntBy;
  if (e.threat && e.threat.size) {
    let best = null, bv = -1; for (const [id, v] of e.threat) { const p = ents.get(id); if (!ok(p)) { e.threat.delete(id); continue; } if (v > bv) { bv = v; best = p; } }
    if (best && ok(e.target) && best !== e.target && bv < (e.threat.get(e.target.id) || 0) * 1.1) return e.target;
    if (best) return best;
  }
  return ok(e.target) ? e.target : null;
}
function monsterAI(e, dt) {
  if (e.stunT > now()) { e.moving = false; return; }
  const m = MONSTERS[e.type]; const leash = Math.hypot(e.x - e.sx, e.y - e.sy);
  if (leash > 15 && !e.returning) { e.target = null; e.threat = null; e.tauntBy = null; e.cast = null; e.returning = true; e.fightStart = 0; e.enraged = false; e.phase = 0; e.invuln = false; if (e.fx.rage === Infinity) e.fx.rage = 0; setPath(e, e.sx, e.sy); }
  if (e.returning) { step(e, dt); if (!e.path) { e.returning = false; e.hp = e.maxHp; } return; }
  e.target = pickTarget(e);
  if (!e.target) { let best = null, bd = m.aggro; for (const p of near(e.x, e.y, m.aggro, isPlayer)) { const d = dist(e, p); if (d < bd && canFight(e, p)) { bd = d; best = p; } } e.target = best; if (best) addThreat(e, best, 1); }
  if (e.target && !e.fightStart) e.fightStart = now(); else if (!e.target) e.fightStart = 0;
  if (e.target) { if (m.skills && bossAI(e, e.target, dt)) return; pursue(e, e.target, dt); return; }
  e.cast = null; e.charging = null;
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
function setPathNpc(e, tx, ty) { return setPath(e, tx, ty); }
function playerTick(p, dt) {
  if (p.dead) { if (now() >= p.respawnAt) { p.dead = false; p.x = SPAWN.x + (R() - .5) * 2; p.y = SPAWN.y + (R() - .5) * 2; applyStats(p, true); bump(p); } return; }
  // class resources: grit drains and 칼자국 fade once you've been out of combat for 6 s; breath always refills fast
  const idle = now() - (p.combatT || 0) > 6000;
  const rg = 1 + ((p.tm && p.tm.regen) || 0);
  if (p.res === 'grit' && idle) p.mp = Math.max(0, p.mp - 6 * dt); else if (p.res === 'breath') p.mp = Math.min(p.maxMp, p.mp + 14 * dt * (1 + ((p.tm && p.tm.resGain) || 0)));
  if (idle && p.cuts) p.cuts = 0;
  if (p.stunT > now()) { if (p.casting) cancelCast(p, true); p.moving = false; return; }
  if (idle && (p.hp < p.maxHp || (p.res === 'mana' && p.mp < p.maxMp))) { const town = (isSafe(p.x, p.y) ? 2 : 1) * rg; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .015 * town * dt); if (p.res === 'mana') p.mp = Math.min(p.maxMp, p.mp + p.maxMp * .02 * town * dt); }
  // casting: stand still and don't swing; the spell lands when the bar fills
  if (p.casting) { p.moving = false; if (now() >= p.casting.until) finishCast(p); return; }
  if (p.pick) { const d = ents.get(p.pick); if (!d) p.pick = 0; else if (dist(p, d) <= 1.2) { p.pick = 0; p.path = null; tryPick(p, d); } else if (!p.path) { setPath(p, d.x, d.y); if (!p.path) p.pick = 0; } }
  if (!p.pick && p.pickQ && p.pickQ.length) { while (p.pickQ.length) { const id = p.pickQ.shift(); const d = ents.get(id); if (d && d.kind === 'drop') { p.pick = id; if (dist(p, d) > 1.2) setPath(p, d.x, d.y); break; } } if (!p.pickQ.length) p.pickQ = null; }
  if (p.talk) { const n = npcById[p.talk]; if (n && dist(p, n) <= 2.2) { p.talk = null; p.path = null; talkTo(p, n); } else if (!p.path) p.talk = null; }
  if (p.npcOpen) { const n = npcById[p.npcOpen]; if (!n || dist(p, n) > 3.5) { p.npcOpen = null; sendTo(p, { t: 'npcclose' }); } }
  if (p.engaged && p.target) { const t = ents.get(p.target.id); if (!t || t.dead || !canFight(p, t)) { p.engaged = false; p.target = null; } else pursue(p, t, dt); }
  else {
    // attack-move: only monsters are picked up on the way (other players are never auto-attacked)
    const am = p.amove;
    if (am && now() >= am.scanT) { am.scanT = now() + 250; let best = null, bd = 5.5; for (const e of near(p.x, p.y, 5.5, isMonster)) { const d = dist(p, e); if (d < bd && canFight(p, e)) { bd = d; best = e; } }
      if (best) { p.target = best; p.engaged = true; }
      else if (Math.hypot(p.x - am.x, p.y - am.y) < 1.2) p.amove = null;
      else if (!p.path) { setPath(p, am.x, am.y); if (!p.path) p.amove = null; } }
    if (!p.engaged) step(p, dt);
  }
  // portals (crypt entrance / exits): stepping onto one moves you; a short cooldown stops ping-ponging
  // a portal fires when you step onto its tile, not again while you keep standing there (e.g. after being turned away)
  const tileKey = Math.floor(p.x) * 1024 + Math.floor(p.y), stepped = tileKey !== p.lastTile; p.lastTile = tileKey;
  const pt = stepped ? portalAt(p.x, p.y) : null;
  if (pt && pt.inst && now() > (p.portalT || 0)) { p.portalT = now() + 1500; enterInstance(p, pt.inst); }
  else if (pt && now() > (p.portalT || 0)) {
    p.portalT = now() + 1500; p.path = null; p.engaged = false; p.target = null; p.pick = 0; p.pickQ = null; p.talk = null; p.amove = null;
    broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'tele', id: p.id }); p.x = pt.tx; p.y = pt.ty; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'tele', id: p.id });
    sys(p, pt.msg); if (pt.x < OVER && p.level < 14) sys(p, '⚠ 지하 묘지의 망자들은 14레벨 이상에게도 버겁습니다. 파티를 꾸려 오는 것이 좋습니다.');
  }
  const safe = isSafe(p.x, p.y);
  const rg2 = 1 + ((p.tm && p.tm.regen) || 0); p.hp = Math.min(p.maxHp, p.hp + (safe ? 5 : .6) * rg2 * dt); if (p.res === 'mana') p.mp = Math.min(p.maxMp, p.mp + (safe ? 3 : 1) * rg2 * dt);
  if (p.flagT && p.flagT < now()) { p.flagT = 0; bump(p); }
}
function effectsTick(e) {
  if (e.fx.bleed > now() && now() - (e.bleedTick || 0) >= 1000) { e.bleedTick = now(); const src = e.bleedBy; if (src && canFight(src, e)) damage(e, Math.max(1, Math.round(e.maxHp * .03 * (1 + (tmOf(src).bleedPct || 0)))), src, false); }
}

// ── tick
// ── gate raids: every 25–40 minutes (when someone is online) a skeleton warband appears outside a random gate.
let raid = null, nextRaid = now() + 20 * 60000;
const PK_MIN = 6;
const DIRN = { S: '남', E: '동', N: '북', W: '서' };
export function startRaid(force) {
  if (raid) return false; const players = [...ents.values()].filter(isPlayer); if (!players.length && !force) return false;
  const lv = Math.max(1, Math.round(players.reduce((s, p) => s + p.level, 0) / Math.max(1, players.length)));
  const g = GATES[Math.floor(R() * GATES.length)]; const out = { S: [0, 1], E: [1, 0], N: [0, -1], W: [-1, 0] }[g.dir];
  const mix = lv < 5 ? ['skel_minion', 'skel_minion', 'skel_rogue'] : lv < 10 ? ['skel_minion', 'skel_rogue', 'skel_rogue', 'skel_warrior'] : lv < 16 ? ['skel_rogue', 'skel_warrior', 'skel_warrior', 'skel_mage'] : ['skel_warrior', 'skel_mage', 'skel_mage'];
  const mons = []; const n = 10;
  for (let i = 0; i < n; i++) { const d = 4 + Math.floor(R() * 7); const side = (R() - .5) * 10; let x = g.x + .5 + out[0] * d + (out[0] ? 0 : side), y = g.y + .5 + out[1] * d + (out[1] ? 0 : side); x = Math.max(2, Math.min(MAP - 3, x)); y = Math.max(2, Math.min(MAP - 3, y)); if (W.monsterBlock[Math.floor(y) * MAP + Math.floor(x)]) continue; const e = spawnMonster(mix[Math.floor(R() * mix.length)], x, y, i === n - 1); e.temp = true; e.raid = true; e.wanderT = now() + 600000; mons.push(e); }
  raid = { gate: g, mons, left: mons.length, part: new Set(), until: now() + 10 * 60000 };
  broadcastAll({ t: 'chat', notice: true, msg: `⚔ 해골 무리가 ${DIRN[g.dir]}문 밖에 나타났습니다! 10분 안에 ${mons.length}마리를 모두 물리치면 참가자 전원에게 보상이 주어집니다.` }); logEvent('raid', 'server', g.dir, `${mons.length}마리, Lv${lv}`);
  return true;
}
function raidCheck() {
  if (!raid) return;
  if (raid.left <= 0) { const bonusG = 150 + 25 * Math.max(...raid.mons.map(m => m.level)), bonusX = 100 + 40 * Math.max(...raid.mons.map(m => m.level)); for (const acc of raid.part) { const p = online.get(acc); if (!p) continue; p.gold += bonusG; gainExp(p, bonusX); invChanged(p); p.stats.raids = (p.stats.raids || 0) + 1; checkTitles(p); sys(p, `습격 격퇴 보상: 금화 ${bonusG} · 경험치 ${bonusX}`); } broadcastAll({ t: 'chat', notice: true, msg: `🛡 ${DIRN[raid.gate.dir]}문의 습격을 물리쳤습니다! (참가 ${raid.part.size}명)` }); raid = null; nextRaid = now() + (25 + R() * 15) * 60000; return; }
  if (now() > raid.until) { for (const m of raid.mons) if (!m.dead) { m.dead = true; m.hp = 0; broadcastNear(m.x, m.y, { t: 'ev', k: 'die', id: m.id }); setTimeout(() => ents.delete(m.id), 2000); } broadcastAll({ t: 'chat', sys: true, msg: `해골 무리가 ${DIRN[raid.gate.dir]}문에서 물러갔습니다.` }); raid = null; nextRaid = now() + (25 + R() * 15) * 60000; }
}
setInterval(() => { if (raid) raidCheck(); else if (now() >= nextRaid) { if (!startRaid()) nextRaid = now() + 5 * 60000; } }, 5000).unref();
export const raidInfo = () => raid ? { gate: raid.gate.dir, left: raid.left, until: raid.until } : null;

// ── instanced dungeon (잿빛 수도원): one copy per party, or per player when solo. A copy keeps its monsters (never respawned)
// until nobody has been inside for INSTANCE_IDLE ms, then it is wiped and its slot freed.
const INSTANCE_IDLE = +process.env.INSTANCE_IDLE_MS || 120000;
const instances = new Map();   // slot -> { slot, key, diff, mons:Set, killed:Set, emptySince }
const hazards = [];            // burning puddles: { x, y, r, start, end, pct, src, slot, next }
const instKey = p => { const pt = social.partyOf(p); return pt ? 'party:' + pt.id : 'solo:' + p.accountId; };
const playersIn = slot => [...ents.values()].filter(e => isPlayer(e) && instanceAt(e.x, e.y) === slot);
function adoptMonster(slot, m) { const inst = instances.get(slot); if (!inst) return; m.inst = slot; m.temp = true; inst.mons.add(m); }
function enterInstance(p, diff) {
  if (p.level < ABBEY.minLevel[diff]) return sys(p, `${ABBEY.name}(${DIFFICULTY[diff].name})은 레벨 ${ABBEY.minLevel[diff]}부터 들어갈 수 있습니다.`);
  const key = instKey(p); let inst = [...instances.values()].find(i => i.key === key);
  if (inst && inst.diff !== diff) sys(p, `일행의 수도원은 ${DIFFICULTY[inst.diff].name} 난이도로 열려 있어 그곳으로 들어갑니다.`);
  if (!inst) {
    const slot = ABBEY_SLOTS.findIndex((_, i) => !instances.has(i)); if (slot < 0) return sys(p, '모든 수도원이 사용 중입니다. 잠시 뒤 다시 시도하세요.');
    inst = { slot, key, diff, mons: new Set(), killed: new Set(), emptySince: 0 }; instances.set(slot, inst);
    const s = ABBEY_SLOTS[slot], d = DIFFICULTY[diff];
    for (const [type, dx, dy] of ABBEY_SPAWNS) { const m = spawnMonster(type, s.x0 + dx + .5, s.y0 + dy + .5); m.maxHp = m.hp = Math.round(m.maxHp * d.hp); m.atk = Math.round(m.atk * d.atk); m.level += d.lv; m.hard = diff === 'hard'; adoptMonster(slot, m); }
    logEvent('instance', p.name, null, { slot, diff, key });
  }
  const s = ABBEY_SLOTS[inst.slot]; p.path = null; p.engaged = false; p.target = null; p.amove = null; if (p.casting) cancelCast(p);
  broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'tele', id: p.id }); p.x = s.x0 + ABBEY.entry[0]; p.y = s.y0 + ABBEY.entry[1]; inst.emptySince = 0;
  sys(p, `${ABBEY.name}(${DIFFICULTY[inst.diff].name})에 들어왔습니다. 보스 ${inst.killed.size}/3 처치. 입구 옆 보라색 계단으로 나갈 수 있습니다.`);
}
function destroyInstance(inst) {
  for (const m of inst.mons) ents.delete(m.id);
  for (const e of [...ents.values()]) if (e.kind === 'drop' && instanceAt(e.x, e.y) === inst.slot) ents.delete(e.id);
  for (let i = hazards.length - 1; i >= 0; i--) if (hazards[i].slot === inst.slot) hazards.splice(i, 1);
  instances.delete(inst.slot);
}
function instanceTick() {
  for (const inst of [...instances.values()]) { if (playersIn(inst.slot).length) inst.emptySince = 0; else if (!inst.emptySince) inst.emptySince = now(); else if (now() - inst.emptySince > INSTANCE_IDLE) destroyInstance(inst); }
  // puddles: harmless while the warning ring shows, then burn everyone standing in them once a second
  for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; if (now() > h.end) { hazards.splice(i, 1); continue; } if (now() < h.start || now() < h.next) continue; h.next = now() + 1000;
    for (const o of near(h.x, h.y, h.r + .5, isPlayer)) if (!o.dead && Math.hypot(o.x - h.x, o.y - h.y) <= h.r) damage(o, Math.max(1, Math.round(o.maxHp * h.pct)), h.src && !h.src.dead ? h.src : null, false); }
}
// a boss of the instance falls: everyone inside gets their own reward, once per boss + difficulty + week
function instanceBoss(b) {
  const inst = instances.get(b.inst); if (!inst) return; inst.killed.add(b.type);
  const d = DIFFICULTY[inst.diff], wk = weekKey(), lock = `${inst.diff}:${b.type}`, inside = playersIn(inst.slot);
  for (const p of inside) {
    p.stats.lockouts = p.stats.lockouts || {};
    if (p.stats.lockouts[lock] === wk) { sys(p, `이번 주에 이미 ${b.name}의 보상(${d.name})을 받았습니다. 월요일에 초기화됩니다.`); continue; }
    p.stats.lockouts[lock] = wk; const pool = ABBEY_LOOT[b.type]; const it = { id: pool[Math.floor(R() * pool.length)], n: 1, enh: d.enh ? 1 + Math.floor(R() * d.enh) : 0 };
    const g = Math.round((300 + 200 * inst.killed.size) * d.gold); p.gold += g; if (!addItem(p, it)) spawnDrop(p.x, p.y, it, 0, p);
    if (inst.diff === 'hard') addItem(p, { id: 'soulGem', n: 2 });
    invChanged(p); p.saveDirty = true; sys(p, `🎁 ${b.name} 보상: ${itemName(it)} · 금화 ${g}${inst.diff === 'hard' ? ' · 영혼석 2' : ''}`);
  }
  for (const p of inside) sys(p, inst.killed.size >= 3 ? `🏆 ${ABBEY.name}(${d.name})을 정복했습니다!` : `${b.name} 처치 — 보스 ${inst.killed.size}/3`);
  if (inst.killed.size >= 3) for (const p of inside) { p.stats.abbeyClears = (p.stats.abbeyClears || 0) + 1; checkTitles(p); }
}
export const instanceCount = () => instances.size;
// admin tools act on your selected monster, else the nearest boss (or monster) within 12 tiles
function adminTarget(p) { if (p.target && isMonster(p.target) && !p.target.dead && ents.get(p.target.id) === p.target && dist(p, p.target) <= 12) return p.target;
  const ms = near(p.x, p.y, 12, e => isMonster(e) && !e.dead).sort((a, b) => (b.boss - a.boss) || dist(p, a) - dist(p, b)); return ms[0] || null; }
let lastSnap = 0, lastSave = 0, lastInst = 0;
setInterval(() => { for (const c of [...clients]) { if (!c.player && now() - c.lastMsg > 20000) { c.sock.close(); continue; } if (now() - c.sock.lastPong > 45000 && now() - c.lastMsg > 45000) { c.sock.close(); continue; } c.sock.ping(); } }, 15000).unref();
const perf = { tickMs: 0, maxMs: 0, n: 0 }; let lastTick = performance.now();
setInterval(() => {
  // advance by the real elapsed time: timers fire late (Windows ~62ms for 50ms, or a busy server), and a fixed step would slow the whole world down
  const t0 = performance.now(); const DT = Math.min(.1, Math.max(.001, (t0 - lastTick) / 1000)); lastTick = t0; rebuildGrid();
  if (now() - lastInst >= 250) { lastInst = now(); instanceTick(); }
  const players = [...ents.values()].filter(isPlayer);
  for (const e of [...ents.values()]) {
    if (isPlayer(e)) { playerTick(e, DT); if (!e.dead) effectsTick(e); continue; }
    if (e.kind === 'drop') { if (now() > e.expires) ents.delete(e.id); continue; }
    if (e.kind === 'npc') { if (e.villager) { let awake = false; for (const p of players) if (Math.abs(p.x - e.x) < 32 && Math.abs(p.y - e.y) < 32) { awake = true; break; } if (awake) villagerAI(e, DT); } continue; }
    if (!isMonster(e)) continue;
    if (e.dead) { if (now() >= e.respawnAt) { e.dead = false; e.x = e.sx; e.y = e.sy; e.hp = e.maxHp; e.target = null; e.path = null; e.fx = {}; e.sk = {}; e.threat = null; e.tauntBy = null; e.cast = null; if (e.boss) broadcastAll({ t: 'chat', sys: true, msg: `${e.name}이(가) 다시 나타났습니다.` }); } continue; }
    let awake = false; for (const p of players) if (Math.abs(p.x - e.x) < 32 && Math.abs(p.y - e.y) < 32) { awake = true; break; }
    if (awake) { monsterAI(e, DT); effectsTick(e); }
  }
  if (now() - lastSnap >= 1000 / SNAP_HZ) { lastSnap = now(); for (const c of clients) if (c.player) { if (c.player.invDirty) sendInv(c.player); if (c.player.talentsSent !== talentKey(c.player)) sendTalents(c.player); snapshot(c); } }
  if (now() - lastSave >= 10000) { lastSave = now(); for (const p of players) if (p.saveDirty) { p.saveDirty = false; try { saveCharacter(p); } catch (err) { console.error('save failed', err); } } }
  const ms = performance.now() - t0; perf.tickMs += (ms - perf.tickMs) * .05; if (ms > perf.maxMs) perf.maxMs = ms; if (++perf.n % 1200 === 0) perf.maxMs = ms;
}, 1000 / TICK_HZ);

function meta(e) {
  const flag = isPlayer(e) ? (e.align < 0 ? 2 : e.flagT > now() ? 1 : 0) : 0;
  return [e.id, KIND[e.kind], e.name, e.sprite, e.level || 0, flag, e.maxHp, isPlayer(e) ? e.cls : (e.npcId || ''), e.scale || 1, e.boss ? 1 : e.elite ? 2 : 0, e.guildName || '', isPlayer(e) ? titleName(e.stats.title) : ''];
}
function snapshot(c) {
  const p = c.player; const seen = new Set(); const list = [], metas = [];
  for (const e of near(p.x, p.y, VIEW_RADIUS)) {
    seen.add(e.id);
    if (c.known.get(e.id) !== e.metaVer) { c.known.set(e.id, e.metaVer); metas.push(meta(e)); }
    // row + key are computed once per entity per snapshot round and shared between clients
    if (e._rowT !== lastSnap) { e._rowT = lastSnap; e._row = [e.id, Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, e.dir, e.dead ? 4 : e.moving ? 1 : 0, Math.ceil(e.hp), statusBits(e)]; e._key = e._row.join(','); }
    const row = e._row, key = e._key;
    // delta: skip rows identical to what this client already has (resent at least every 2 s as a safety net)
    const prev = c.last.get(e.id); if (prev && prev.k === key && now() - prev.t < 2000) continue; c.last.set(e.id, { k: key, t: now() }); list.push(row);
  }
  const gone = []; for (const id of c.known.keys()) if (!seen.has(id)) { gone.push(id); c.known.delete(id); c.last.delete(id); }
  const t = now(), cds = {}; for (const [k, v] of Object.entries(p.cds)) if (v > t) cds[k] = v - t;
  const buffs = []; if (p.fx.bless > t) buffs.push(['bless', p.fx.bless - t]); if (p.fx.bulwark > t) buffs.push(['bulwark', p.fx.bulwark - t]); if (p.shield > 0 && p.shieldT > t) buffs.push(['shield', p.shieldT - t]); if (p.fx.bleed > t) buffs.push(['bleed', p.fx.bleed - t]); if (p.fx.slow > t) buffs.push(['slow', p.fx.slow - t]); if (p.stunT > t) buffs.push(['stun', p.stunT - t]); if (p.fx.shroud > t) buffs.push(['shroud', p.fx.shroud - t]); if (p.freeNext) buffs.push(['clear', 0]);
  c.sock.send(JSON.stringify({ t: 'snap', s: t, e: list, m: metas, g: gone, day: +dayPhase().toFixed(4), w: weather, qm: questMarks(p), raid: raid ? [raid.gate.dir, raid.left, Math.max(0, Math.round((raid.until - t) / 1000))] : 0, ins: insInfo(p),
    // me: 0 hp 1 maxHp 2 res 3 maxRes 4 lv 5 exp 6 need 7 gold 8 atk 9 def 10 honour 11 cls 12-14 (unused) 15 atkSpeed 16 range 17 kills 18-19 (unused) 20 blessed 21 party
    //     22 resource kind 23 칼자국 24 global cooldown left 25 {skill: cooldown left} 26 [skill, left, total] while casting 27 [[buff, left]] 28 shield
    me: [Math.ceil(p.hp), p.maxHp, Math.floor(p.mp), p.maxMp, p.level, p.exp, expNeed(p.level), p.gold, p.atk, p.def, p.align, p.cls, 0, 0, 0, p.atkSpeed, p.range, p.kills, 0, 0, p.fx.bless > t ? 1 : 0, p.partyId || 0,
      p.res, p.cuts || 0, Math.max(0, (p.gcd || 0) - t), cds, p.casting ? [p.casting.id, Math.max(0, p.casting.until - t), p.casting.total] : 0, buffs, p.shieldT > t ? p.shield : 0] }));
}
// status flags shown on every unit: 1 stunned 2 bleeding 4 slowed 8 shielded 16 bulwark 32 blessed 64 taunted 128 warded (immune)
function insInfo(p) { const sl = instanceAt(p.x, p.y); const inst = sl >= 0 && instances.get(sl); return inst ? [DIFFICULTY[inst.diff].name, inst.killed.size, 3] : 0; }
function statusBits(e) { const t = now(), f = e.fx || {}; return (e.stunT > t ? 1 : 0) | (f.bleed > t ? 2 : 0) | (f.slow > t ? 4 : 0) | (e.shield > 0 && e.shieldT > t ? 8 : 0) | (f.bulwark > t ? 16 : 0) | (f.bless > t ? 32 : 0) | (e.tauntBy && e.tauntUntil > t ? 64 : 0) | (e.invuln ? 128 : 0); }

// ── connections
const online = new Map();   // accountId -> player
const guilds = createGuilds({ online, sys, sendTo, findPlayerByName, now, logEvent });
const market = createMarket({ online, sys, addItem, invChanged, now, logEvent });
export function onConnection(sock) {
  const c = { sock, player: null, known: new Map(), last: new Map(), chatT: 0, msgs: 0, winT: now() };
  clients.add(c);
  function handle(raw) {
    if (now() - c.winT > 1000) { c.winT = now(); c.msgs = 0; } if (++c.msgs > 40) return;   // flood guard
    let m; try { m = JSON.parse(raw); } catch { return; }
    c.lastMsg = now();
    const p = c.player;
    if (m.t === 'join' && !p) {
      const acc = accountForToken(m.token); if (!acc) { sock.send(JSON.stringify({ t: 'err', msg: '로그인이 만료되었습니다. 다시 로그인하세요.', relogin: true })); return; }
      const prev = online.get(acc); if (prev) { sys(prev, '다른 곳에서 접속하여 연결을 끊습니다.'); prev.client.sock.close(); }
      const ch = loadCharacter(acc); if (!ch) { sock.send(JSON.stringify({ t: 'err', msg: '캐릭터를 찾을 수 없습니다.' })); return; }
      const ban = banInfo(ch.name); if (ban) { sock.send(JSON.stringify({ t: 'err', msg: `차단된 계정입니다${ban.reason ? ' (' + ban.reason + ')' : ''}${ban.until ? ' · ' + new Date(ban.until).toLocaleString('ko-KR') + '까지' : ''}.`, relogin: true })); return; }
      const pl = { id: nextId++, kind: 'player', accountId: acc, client: c, name: ch.name, look: LOOKS[ch.look] ? ch.look : 'knight', sprite: LOOKS[ch.look] ? ch.look : 'knight', cls: CLASSES[ch.cls] || ADV[ch.cls] ? ch.cls : 'commoner',   // advanced classes live in ADV, not CLASSES
        level: ch.level, exp: ch.exp, gold: ch.gold, align: ch.align, kills: ch.kills, inv: ch.inventory.filter(x => ITEMS[x.id]), equip: {}, bank: (ch.bank || []).filter(x => ITEMS[x.id]), bankGold: ch.bank_gold || 0, quests: ch.quests || {}, stats: ch.stats || {}, talents: ch.talents || {}, npcOpen: null,
        x: SPAWN.x + (R() - .5) * 3, y: SPAWN.y + (R() - .5) * 3, speed: 4.2, dir: 0, path: null, target: null, engaged: false, cd: 0, metaVer: 1, flagT: 0, stunT: 0, fx: {}, pick: 0, talk: null, cds: {}, gcd: 0, cuts: 0, casting: null, shield: 0, shieldT: 0 };
      for (const s of SLOTS) { const it = ch.equipment[s]; if (it && ITEMS[it.id] && ITEMS[it.id].type === s) pl.equip[s] = { id: it.id, enh: it.enh || 0 }; }
      applyStats(pl, true); ents.set(pl.id, pl); c.player = pl; online.set(acc, pl);
      pl.admin = isAdmin(pl.name); guilds.attach(pl); sock.send(JSON.stringify({ t: 'welcome', id: pl.id, name: pl.name, admin: pl.admin })); sendInv(pl); sendTitles(pl); logEvent('login', pl.name, null, (c.sock.sock.remoteAddress || ''));
      broadcastAll({ t: 'chat', sys: true, msg: `${pl.name}님이 레이븐무어에 들어왔습니다. (접속 ${online.size}명)` });
      const alive = [...ents.values()].filter(e => isMonster(e) && e.boss && !e.dead).map(e => e.name); if (alive.length) sys(pl, `지금 깨어 있는 보스: ${alive.join(', ')}`);
      if (online.size > 1) sys(pl, `접속 중: ${[...online.values()].filter(x => x !== pl).map(x => x.name).join(', ')}`);
      return;
    }
    if (!p) return;
    if (p.dead && m.t !== 'chat') return;
    const clearIntent = () => { p.engaged = false; p.target = null; p.pick = 0; p.pickQ = null; p.talk = null; p.amove = null; };
    if (m.t === 'move' || m.t === 'attack') p.npcOpen = null;
    if (p.casting && ['move', 'amove', 'stop', 'attack', 'pick', 'pickall', 'talk'].includes(m.t)) cancelCast(p);   // moving or switching action breaks a cast
    switch (m.t) {
      case 'move': { const x = +m.x, y = +m.y; if (!(x >= 0 && y >= 0 && x < MAP && y < MAP)) return; clearIntent(); setPath(p, x, y); break; }
      // attack-move: walk to the point, but fight any monster that comes within reach on the way, then carry on
      case 'amove': { const x = +m.x, y = +m.y; if (!(x >= 0 && y >= 0 && x < MAP && y < MAP)) return; clearIntent(); p.amove = { x, y, scanT: 0 }; setPath(p, x, y); break; }
      case 'attack': { const t = ents.get(+m.id); if (!t || t === p) return; if (!canFight(p, t)) { sys(p, isSafe(p.x, p.y) || isSafe(t.x, t.y) ? '마을 안에서는 싸울 수 없습니다. 성문 밖으로 나가세요.' : isPlayer(t) && (p.level < PK_MIN || t.level < PK_MIN) ? `레벨 ${PK_MIN} 미만의 모험가는 서로 공격할 수 없습니다.` : '공격할 수 없는 대상입니다.'); return; } clearIntent(); p.target = t; p.engaged = true; break; }
      case 'stop': clearIntent(); p.path = null; break;
      case 'pick': { const d = ents.get(+m.id); if (!d || d.kind !== 'drop') return; clearIntent(); p.pickQ = null; p.pick = d.id; if (dist(p, d) > 1.2) setPath(p, d.x, d.y); break; }
      case 'pickall': { const ds = near(p.x, p.y, 7, e => e.kind === 'drop' && (!e.owner || e.owner === p.id || now() >= e.ownerUntil || (e.ownerParty && e.ownerParty === p.partyId))).sort((a, b) => dist(p, a) - dist(p, b)); if (!ds.length) return sys(p, '근처에 주울 것이 없습니다.'); clearIntent(); p.pickQ = ds.slice(1).map(d => d.id); p.pick = ds[0].id; if (dist(p, ds[0]) > 1.2) setPath(p, ds[0].x, ds[0].y); break; }
      case 'talk': { const n = npcById[m.npc]; if (!n) return; clearIntent(); if (dist(p, n) <= 2.2) talkTo(p, n); else { p.talk = m.npc; setPath(p, n.x, n.y); } break; }
      case 'npcclose': p.npcOpen = null; break;
      case 'title': setTitle(p, String(m.id || 'none')); break;
      case 'titles': sendTitles(p); break;
      case 'quests': sendTo(p, { t: 'quests', q: QUESTS.map(q => ({ id: q.id, st: questState(p, q), prog: questProgress(p, q) })) }); break;
      case 'cast': trySkill(p, String(m.id || ''), m.tid); break;
      case 'talent': learnTalent(p, String(m.id || '')); break;
      case 'talentReset': resetTalents(p); break;
      case 'use': {
        const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return; const b = ITEMS[it.id];
        if (b.type === 'potion') { if (b.heal && p.hp >= p.maxHp) return sys(p, '체력이 가득 차 있습니다.'); if (b.mana && p.res !== 'mana') return sys(p, `${resName(p)}을(를) 쓰는 직업은 마나 물약이 필요 없습니다.`); if (b.mana && p.mp >= p.maxMp) return sys(p, '마나가 가득 차 있습니다.'); takeItem(p, it.id); if (b.heal) p.hp = Math.min(p.maxHp, p.hp + b.heal); if (b.mana) p.mp = Math.min(p.maxMp, p.mp + b.mana); broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: b.heal ? 'heal' : 'mana', id: p.id, v: b.heal || b.mana }); }
        else if (b.type === 'scroll') { takeItem(p, it.id); clearIntent(); cancelCast(p); p.path = null; p.x = SPAWN.x + (R() - .5) * 2; p.y = SPAWN.y + (R() - .5) * 2; broadcastNear(p.x, p.y, { t: 'ev', k: 'fx', fx: 'tele', id: p.id }); sys(p, '두루마리가 빛나며 마을 광장으로 돌아왔습니다.'); }
        else if (SLOTS.includes(b.type)) return equip(p, m.i | 0);
        invChanged(p); break;
      }
      case 'equip': equip(p, m.i | 0, m.id); break;
      case 'unequip': { const s = String(m.slot); const it = p.equip[s]; if (!it) return; if (p.inv.length >= INV_SIZE) return sys(p, '가방이 가득 찼습니다.'); delete p.equip[s]; p.inv.push({ id: it.id, n: 1, enh: it.enh || 0 }); applyStats(p); invChanged(p); break; }
      case 'drop': { const it = p.inv[m.i | 0]; if (!it || it.id !== m.id) return; p.inv.splice(m.i | 0, 1); spawnDrop(p.x, p.y, it, 0, null); sys(p, `${itemName(it)}을(를) 바닥에 내려놓았습니다.`); invChanged(p); break; }
      case 'buy': case 'sell': case 'craft': case 'enhance': case 'rest': case 'job': case 'advance': case 'atone': case 'bankIn': case 'bankOut': case 'bankGold': case 'qaccept': case 'qdone': case 'mlist': case 'mbuy': case 'mcancel': service(p, m); break;
      case 'chat': {
        const text = String(m.msg || '').slice(0, 160).trim(); if (!text || now() - c.chatT < 500) return; c.chatT = now();
        if (text[0] === '/') {
          if (adminCommand(p, text, { sys, broadcastAll, findPlayerByName, ents, addItem, invChanged, applyStats, bump, MONSTERS, spawnMonster, startRaid, setWeather, kill, adminTarget })) return;
          const [cmd, ...args] = text.split(/\s+/); const rest = args.join(' ');
          if (cmd === '/귓' || cmd === '/w') { if (args.length < 2) return sys(p, '사용법: /귓 이름 내용'); social.whisper(p, args[0], args.slice(1).join(' ')); }
          else if (cmd === '/파티' || cmd === '/p') { if (args.length < 1) return sys(p, '사용법: /파티 초대 이름 · /파티 수락 · /파티 나가기 · /파티 추방 이름 · /파티 내용(파티 채팅)'); const sub = args[0]; if (sub === '초대') social.invite(p, args[1]); else if (sub === '수락') social.accept(p); else if (sub === '나가기' || sub === '탈퇴') social.leaveParty(p); else if (sub === '추방') social.kick(p, args[1] || ''); else social.partyChat(p, rest); }
          else if (cmd === '/길드' || cmd === '/g') guilds.command(p, args);
          else if (cmd === '/길') guilds.guildChat(p, rest);
          else if (cmd === '/거래') { if (args[0] === '수락') social.tradeAccept(p); else if (args[0] === '취소') social.cancelTrade(p); else if (args[0]) social.tradeRequest(p, args[0]); else sys(p, '사용법: /거래 이름 · /거래 수락 · /거래 취소'); }
          else if (cmd === '/전체' || cmd === '/all') { if (now() - (c.allT || 0) < 10000) return sys(p, '전체 채팅은 10초에 한 번만 쓸 수 있습니다.'); c.allT = now(); broadcastAll({ t: 'chat', all: true, id: p.id, n: p.name, msg: rest }); }
          else if (cmd === '/순위') sendTo(p, { t: 'chat', sys: true, msg: '순위는 화면 오른쪽 아래 순위표(L)에서 볼 수 있습니다.' });
          else if (cmd === '/도움' || cmd === '/help') sys(p, '명령: /귓 이름 내용 · /파티 초대|수락|나가기|추방 · /길드 생성|초대|수락|탈퇴|정보|순위 · /길 내용 · /거래 이름|수락|취소 · /전체 내용 · /도움');
          else sys(p, '알 수 없는 명령입니다. /도움');
          return;
        }
        broadcastNear(p.x, p.y, { t: 'chat', id: p.id, n: p.name, msg: text }, 30); break;
      }
      case 'pinvite': social.invite(p, String(m.name || '')); break;
      case 'paccept': social.accept(p); break;
      case 'ginvite': guilds.command(p, ['초대', String(m.name || '')]); break;
      case 'gaccept': guilds.accept(p); break;
      case 'guild': guilds.command(p, Array.isArray(m.args) ? m.args.map(String).slice(0, 4) : ['정보']); break;
      case 'pleave': social.leaveParty(p); break;
      case 'pkick': social.kick(p, String(m.name || '')); break;
      case 'trade': social.tradeRequest(p, String(m.name || '')); break;
      case 'taccept': social.tradeAccept(p); break;
      case 'toffer': social.tradeOffer(p, m.items, m.gold); break;
      case 'tconfirm': { const r = social.tradeConfirm(p); if (r) logEvent('trade', r.a, r.b, r); break; }
      case 'tcancel': social.cancelTrade(p); break;
      case 'leaderboard': sendTo(p, { t: 'leaderboard', rows: leaderboardRows(), guilds: guilds.ranking(10) }); break;
      case 'ping': sock.send(JSON.stringify({ t: 'pong', c: m.c, s: now() })); break;
    }
  }
  c.lastMsg = now();
  sock.on('message', raw => { try { handle(raw); } catch (err) { console.error('message error', err); } });
  sock.on('close', () => {
    clients.delete(c); const p = c.player; if (!p) return;
    social.onDisconnect(p); guilds.detach(p); logEvent('logout', p.name);
    try { saveCharacter(p); } catch (err) { console.error('save failed', err); }
    ents.delete(p.id); if (online.get(p.accountId) === p) online.delete(p.accountId);
    for (const e of ents.values()) if (e.target === p) { e.target = null; e.engaged = false; }
    broadcastAll({ t: 'chat', sys: true, msg: `${p.name}님이 떠났습니다.` });
  });
}
function equip(p, i, id) {
  const it = p.inv[i]; if (!it || (id && it.id !== id)) return; const b = ITEMS[it.id]; if (!SLOTS.includes(b.type)) return;
  if (b.type === 'shield' && (p.cls === 'mage' || p.cls === 'archmage')) return sys(p, '마법사는 방패를 들 수 없습니다.');
  p.inv.splice(i, 1); const prev = p.equip[b.type]; p.equip[b.type] = { id: it.id, enh: it.enh || 0 }; if (prev) p.inv.push({ id: prev.id, n: 1, enh: prev.enh || 0 });
  applyStats(p); invChanged(p); sys(p, `${itemName(it)} 장착`);
}
import { leaderboard } from './admin.js';
function leaderboardRows() { return leaderboard(20).map(r => ({ name: r.name, level: r.level, cls: r.cls, kills: r.kills, align: r.align, online: !!findPlayerByName(r.name) })); }
export function saveAll() { for (const e of ents.values()) if (isPlayer(e)) try { saveCharacter(e); } catch {} }
export function stats() { let players = 0, monsters = 0, drops = 0; for (const e of ents.values()) { if (isPlayer(e)) players++; else if (isMonster(e)) monsters++; else if (e.kind === 'drop') drops++; } return { players, monsters, drops, instances: instances.size, tickMs: +perf.tickMs.toFixed(2), tickMaxMs: +perf.maxMs.toFixed(1), mem: Math.round(process.memoryUsage().rss / 1048576) }; }
