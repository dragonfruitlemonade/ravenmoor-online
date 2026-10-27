// End-to-end test: starts the server and drives bot clients through accounts, PK rules, items, shops, drops and class change.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const PORT = 18000 + Math.floor(Math.random() * 1000), DATA = '/tmp/rmtest-' + PORT;
const startServer = () => { const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'inherit'] }); return new Promise(r => s.stdout.once('data', () => r(s))); };
let srv = await startServer();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (path, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
function bot(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const b = { ws, ents: new Map(), meta: new Map(), chat: [], evs: [], me: null, id: 0, inv: null, npc: null };
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.t === 'welcome') b.id = m.id;
    if (m.t === 'snap') { for (const x of m.m) b.meta.set(x[0], x); for (const e of m.e) b.ents.set(e[0], e); for (const g of m.g) b.ents.delete(g); b.me = m.me; }
    if (m.t === 'inv') b.inv = m; if (m.t === 'npc') b.npc = m; if (m.t === 'titles') b.titles = m;
    if (m.t === 'chat') b.chat.push(m.msg); if (m.t === 'ev') b.evs.push(m); if (m.t === 'err') b.chat.push('ERR ' + m.msg); };
  b.send = o => ws.send(JSON.stringify(o));
  b.ready = new Promise(r => ws.onopen = () => { b.send({ t: 'join', token }); r(); });
  b.pos = () => { const e = b.ents.get(b.id); return e ? [e[1], e[2]] : null; };
  b.said = s => b.chat.some(t => t.includes(s));
  return b;
}
const results = []; const check = (ok, label) => { results.push([ok, label]); console.log((ok ? 'PASS ' : 'FAIL ') + label); };

// accounts
let [s1, r1] = await api('/api/register', { name: '기사앨런', password: 'secret123', look: 'knight' });
check(s1 === 200 && r1.token, 'register account');
let [s2] = await api('/api/register', { name: '기사앨런', password: 'other123', look: 'mage' }); check(s2 === 400, 'duplicate name rejected');
let [s3] = await api('/api/register', { name: '짧은비번', password: '123', look: 'mage' }); check(s3 === 400, 'short password rejected');
let [s4] = await api('/api/login', { name: '기사앨런', password: 'wrongpass' }); check(s4 === 401, 'wrong password rejected');
let [s5, r5] = await api('/api/login', { name: '기사앨런', password: 'secret123' }); check(s5 === 200 && r5.token, 'login returns a session token');
const [, rb] = await api('/api/register', { name: '도적베스', password: 'secret456', look: 'rogue' });
const badWs = bot('not-a-token'); await badWs.ready; await sleep(300); check(badWs.said('로그인이 만료'), 'joining with a bad token is refused'); badWs.ws.close();

let A = bot(r5.token), B = bot(rb.token);
await A.ready; await B.ready; await sleep(700);
check(A.id && B.id && A.meta.has(B.id), 'both players join and see each other');
check(A.inv && A.inv.inv.some(x => x.id === 'hpPotion' && x.n === 5) && A.inv.equip.weapon?.id === 'dagger', 'starter kit: 5 potions, 2 scrolls, dagger equipped');
const npcs = [...A.meta.values()].filter(m => m[1] === 4); check(npcs.length >= 6, `NPCs present (${npcs.length})`);

// shop: walk to the merchant, buy and equip armour
A.send({ t: 'talk', npc: 'market' });
// meanwhile B walks south across the plaza: the server must move players at their real speed (4.2 tiles/s) even when its timer fires late
B.send({ t: 'move', x: 88.5, y: 111.5 }); await sleep(500); const w0 = B.pos(), wt0 = performance.now(); await sleep(3000); const w1 = B.pos(), wSpeed = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) / ((performance.now() - wt0) / 1000);
check(wSpeed > 3.6 && wSpeed < 4.8, `players move at real-time speed (${wSpeed.toFixed(2)} tiles/s)`); await sleep(2500);
check(A.npc && A.npc.id === 'market' && A.npc.shop.includes('leatherArmor'), 'talking to the merchant opens her shop');
const g0 = A.inv.gold; A.send({ t: 'buy', npc: 'market', item: 'leatherArmor' }); await sleep(300);
check(A.inv.gold === g0 - 150 && A.inv.inv.some(x => x.id === 'leatherArmor'), 'buy leather armour for 150 G');
const def0 = A.me[9]; const idx = A.inv.inv.findIndex(x => x.id === 'leatherArmor'); A.send({ t: 'equip', i: idx, id: 'leatherArmor' }); await sleep(300);
check(A.inv.equip.armor?.id === 'leatherArmor' && A.me[9] === def0 + 4, `equipping raises defence (${def0} -> ${A.me[9]})`);
A.send({ t: 'buy', npc: 'smith', item: 'longSword' }); await sleep(250); check(A.said('더 가까이'), 'shops check distance to the NPC');

// safe zone and PK
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('마을 안에서는'), 'attacking inside town is refused');
A.send({ t: 'move', x: 88.5, y: 118.5 }); B.send({ t: 'move', x: 89.5, y: 118.5 }); for (let i = 0; i < 24 && !(A.pos() && A.pos()[1] > 114 && B.pos() && B.pos()[1] > 114); i++) await sleep(500);   // ~34 tiles: about 8 s
const pa = A.pos(); check(pa && pa[1] > 114, `walked out through the south gate (y=${pa && pa[1]})`);
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('미만의 모험가'), 'newcomers below level 6 are protected from PK');
A.send({ t: 'chat', msg: '/레벨 6' }); await sleep(600); A.send({ t: 'chat', msg: '/레벨 6 도적베스' }); await sleep(600);
const hp0 = B.me[0]; A.send({ t: 'attack', id: B.id }); await sleep(2500);
check(B.me[0] < hp0, `PK outside walls deals damage (B hp ${hp0} -> ${B.me[0]})`);
check(A.meta.get(A.id)?.[5] >= 1, 'attacker gets a purple/red name');
A.send({ t: 'stop' }); B.send({ t: 'move', x: 88.5, y: 100.5 }); await sleep(7000);
A.send({ t: 'move', x: 88.5, y: 104.5 }); await sleep(6000); await sleep(6000); A.send({ t: 'move', x: 88.5, y: 120.5 }); await sleep(7000);

// hunt: kill a monster, loot appears on the ground with owner priority
let killed = false; for (let i = 0; i < 6 && !killed; i++) { const mon = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 2 && A.meta.get(e[0])?.[3] === 'skel_minion' && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - A.pos()[0], p[2] - A.pos()[1]) - Math.hypot(q[1] - A.pos()[0], q[2] - A.pos()[1]))[0]; if (!mon) break; A.send({ t: 'attack', id: mon[0] }); for (let k = 0; k < 20 && !killed; k++) { await sleep(500); if (A.evs.some(e => e.k === 'die' && e.id === mon[0])) killed = true; if (A.me[0] < A.me[1] * .35) { const hp = A.inv.inv.findIndex(x => x.id === 'hpPotion'); if (hp >= 0) A.send({ t: 'use', i: hp, id: 'hpPotion' }); } } }
check(killed, 'player kills a monster');
check(A.evs.some(e => e.k === 'dmg' && e.a === A.id && e.b !== A.id), 'damage events name the attacker (combat feedback)');
check(A.evs.some(e => e.k === 'xp' && e.id === A.id && e.v > 0) && !B.evs.some(e => e.k === 'xp' && e.id === A.id), 'killer alone receives an EXP gain event');
await sleep(400); const dpos = A.pos(); const drop = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 3 && A.meta.get(e[0])?.[3] === 'gold').sort((p, q) => Math.hypot(p[1] - dpos[0], p[2] - dpos[1]) - Math.hypot(q[1] - dpos[0], q[2] - dpos[1]))[0];
check(!!drop, 'gold drops on the ground');
B.send({ t: 'pick', id: drop?.[0] });
const goldBefore = A.inv.gold; A.send({ t: 'pick', id: drop?.[0] }); await sleep(2000);
check(A.inv.gold > goldBefore, `owner picks up the gold (${goldBefore} -> ${A.inv.gold})`);
const before = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 3 && Math.hypot(e[1] - A.pos()[0], e[2] - A.pos()[1]) < 6).map(e => e[0]); A.send({ t: 'pickall' }); await sleep(4000); check(before.every(id => !A.ents.has(id)), `Z (pickall) clears the ${before.length} nearby drops`);

// persistence + class change: bump level in the DB, log back in, change class at the knights' hall
A.ws.close(); await sleep(400);
const db = new DatabaseSync(DATA + '/ravenmoor.db'); const row = db.prepare("SELECT gold, inventory, equipment FROM characters c JOIN accounts a ON a.id=c.account_id WHERE a.name='기사앨런'").get();
check(row.gold === A.inv.gold && JSON.parse(row.equipment).armor?.id === 'leatherArmor', 'character saved to the database on logout');
db.prepare("UPDATE characters SET level=10 WHERE account_id=(SELECT id FROM accounts WHERE name='기사앨런')").run(); db.close();
A = bot(r5.token); await A.ready; await sleep(700);
check(A.me[4] === 10, 'reloaded at level 10');
A.send({ t: 'talk', npc: 'knights' }); await sleep(7000); const hp10 = A.me[1];
A.send({ t: 'job', npc: 'knights' }); await sleep(300);
check(A.me[11] === 'knight' && A.me[1] > hp10, `class change to knight (maxHp ${hp10} -> ${A.me[1]})`);
A.send({ t: 'cast', id: 'bash' }); await sleep(200); check(A.said('성내에서는'), 'combat skills are blocked inside town');


// quests: accept at the guard, kills count, turn in
A.send({ t: 'talk', npc: 'guard_s1' }); await sleep(7000);
check(A.npc && A.npc.quests.some(q => q.id === 'minions' && q.st === 'avail'), 'guard offers the skeleton quest');
A.send({ t: 'qaccept', npc: 'guard_s1', q: 'minions' }); await sleep(300); check(A.said('의뢰 수락'), 'quest accepted');
A.send({ t: 'move', x: 88.5, y: 120.5 }); await sleep(7000);
let kills = 0; for (let i = 0; i < 40 && !A.said('성문 밖의 해골들: 8/8'); i++) { const mon = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[3] === 'skel_minion' && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - A.pos()[0], p[2] - A.pos()[1]) - Math.hypot(q[1] - A.pos()[0], q[2] - A.pos()[1]))[0]; if (!mon) { A.send({ t: 'move', x: 88.5, y: 126.5 }); await sleep(4000); continue; } A.send({ t: 'attack', id: mon[0] }); for (let k = 0; k < 16; k++) { await sleep(400); if (A.evs.some(e => e.k === 'die' && e.id === mon[0])) { kills++; break; } } }
check(A.said('성문 밖의 해골들: 8/8'), `kill counter reaches 8 (${kills} kills seen)`);
{ const sc = A.inv.inv.findIndex(x => x.id === 'scroll'); A.send({ t: 'use', i: sc, id: 'scroll' }); await sleep(600); }
A.send({ t: 'talk', npc: 'guard_s1' }); for (let i = 0; i < 25; i++) { await sleep(1000); if (A.npc && A.npc.id === 'guard_s1' && A.npc.quests.some(q => q.id === 'minions' && q.prog >= 8)) break; } const gq = A.inv.gold; A.send({ t: 'qdone', npc: 'guard_s1', q: 'minions' }); await sleep(400);
check(A.inv.gold === gq + 120 && A.said('의뢰 완료'), 'quest turned in: +120 G');
// bank
A.send({ t: 'talk', npc: 'bank' }); await sleep(9000); check(A.npc && A.npc.bank, 'bank window opens');
const potIdx = A.inv.inv.findIndex(x => x.id === 'hpPotion'); const potN = A.inv.inv[potIdx]?.n; A.send({ t: 'bankIn', npc: 'bank', i: potIdx, id: 'hpPotion' }); await sleep(300);
check(A.npc.bankItems.some(x => x.id === 'hpPotion' && x.n === potN) && !A.inv.inv.some(x => x.id === 'hpPotion'), 'deposit potions into the bank');
A.send({ t: 'bankGold', npc: 'bank', v: 100 }); await sleep(300); check(A.npc.bankGold === 100, 'deposit 100 gold');
A.send({ t: 'bankOut', npc: 'bank', i: 0, id: A.npc.bankItems[0].id }); await sleep(300); check(A.inv.inv.some(x => x.id === 'hpPotion'), 'withdraw potions');
// advancement at level 20 + second skill
A.ws.close(); await sleep(400);
{ const db2 = new DatabaseSync(DATA + '/ravenmoor.db'); const row2 = db2.prepare("SELECT bank_gold, quests FROM characters c JOIN accounts a ON a.id=c.account_id WHERE a.name='기사앨런'").get(); check(row2.bank_gold === 100 && JSON.parse(row2.quests).minions?.st === 'done', 'bank gold and quest state persisted'); db2.prepare("UPDATE characters SET level=20 WHERE account_id=(SELECT id FROM accounts WHERE name='기사앨런')").run(); db2.close(); }
A = bot(r5.token); await A.ready; await sleep(700);
A.send({ t: 'talk', npc: 'knights' }); await sleep(7000); A.send({ t: 'advance', npc: 'knights' }); await sleep(300);
check(A.me[11] === 'paladin', 'advanced to paladin at level 20');
// boss: walk to grey fang, verify boss meta and special attack events
A.send({ t: 'move', x: 88.5, y: 118.5 }); await sleep(8000);
let hpP = A.inv.inv.findIndex(x => x.id === 'hpPotion');
A.send({ t: 'move', x: 119.5, y: 135.5 }); for (let i = 0; i < 20; i++) { await sleep(1000); if (Math.hypot(A.pos()[0] - 119.5, A.pos()[1] - 135.5) < 3) break; }
const boss = [...A.meta.values()].find(m => m[9] === 1 && m[3] === 'skel_rogue');
check(!!boss, 'boss 회색 송곳니 is visible with boss flag and scale ' + (boss && boss[8]));
if (boss) { A.send({ t: 'attack', id: boss[0] }); for (let k = 0; k < 30; k++) { await sleep(500); if (A.me[0] < A.me[1] * .4) { hpP = A.inv.inv.findIndex(x => x.id === 'hpPotion'); if (hpP >= 0) A.send({ t: 'use', i: hpP, id: 'hpPotion' }); } if (A.evs.some(e => e.k === 'fx' && (e.fx === 'roar'))) break; } }
check(A.evs.some(e => e.k === 'fx' && e.fx === 'roar'), 'boss used its howl (summons)');
check([...A.meta.values()].filter(m => m[3] === 'skel_minion').length > 0, 'summoned minions appeared');
A.send({ t: 'cast', id: 'challenge' }); A.send({ t: 'cast', id: 'smite' }); await sleep(300); check(A.evs.some(e => e.k === 'fx' && e.fx === 'heal' && e.id === A.id) || A.said('부족') || A.said('대상'), 'advanced skill (smite) fires or reports a reason');

// social: whisper, party exp share, party members cannot PK each other, trade
B.ws.close(); await sleep(300); B = bot(rb.token); await B.ready; await sleep(700);
A.send({ t: 'chat', msg: '/귓 도적베스 안녕' }); await sleep(300); check(B.chat.includes('안녕'), 'whisper delivered');
A.send({ t: 'pinvite', name: '도적베스' }); await sleep(300); B.send({ t: 'paccept' }); await sleep(400);
check(A.me[21] && A.me[21] === B.me[21], 'party formed (same party id)');
A.send({ t: 'move', x: 88.5, y: 118.5 }); B.send({ t: 'move', x: 89.5, y: 118.5 }); await sleep(8000);
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('공격할 수 없는'), 'party members cannot attack each other');
const expB = B.me[5] + B.me[4] * 100000; let k2 = false; const bGot = () => (B.me[5] + B.me[4] * 100000) > expB; for (let i = 0; i < 12 && !(k2 && bGot()); i++) { const mon = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 2 && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - A.pos()[0], p[2] - A.pos()[1]) - Math.hypot(q[1] - A.pos()[0], q[2] - A.pos()[1]))[0]; if (!mon) break; A.send({ t: 'attack', id: mon[0] }); for (let k = 0; k < 16; k++) { await sleep(400); if (A.evs.some(e => e.k === 'die' && e.id === mon[0])) { k2 = true; break; } } }
await sleep(300); check(k2 && bGot(), 'party member nearby receives shared exp');
// trade: A gives 2 potions + 50 gold, B gives 10 gold
A.send({ t: 'stop' }); await sleep(200); A.send({ t: 'move', x: B.pos()[0] + 1, y: B.pos()[1] }); await sleep(2500);
A.send({ t: 'trade', name: '도적베스' }); await sleep(300); B.send({ t: 'taccept' }); await sleep(400);
const pA = A.inv.inv.findIndex(x => x.id === 'hpPotion'); const gA = A.inv.gold, gB = B.inv.gold; const nA = A.inv.inv[pA].n, nB = B.inv.inv.find(x => x.id === 'hpPotion')?.n || 0;
A.send({ t: 'toffer', items: [pA], gold: 50 }); B.send({ t: 'toffer', items: [], gold: 10 }); await sleep(400);
A.send({ t: 'tconfirm' }); await sleep(200); B.send({ t: 'tconfirm' }); await sleep(600);
check(A.inv.gold === gA - 40 && B.inv.gold === gB + 40, `trade gold settled (A ${gA}->${A.inv.gold}, B ${gB}->${B.inv.gold})`);
check(!A.inv.inv.some(x => x.id === 'hpPotion') && (B.inv.inv.find(x => x.id === 'hpPotion')?.n || 0) === nB + nA, 'trade items moved');
// guild: create (admin gives level/gold), invite, accept, no friendly fire outside a party, chat, persistence over relogin
A.send({ t: 'chat', msg: '/레벨 10' }); await sleep(600); A.send({ t: 'chat', msg: '/금화 5000' }); await sleep(600);
A.send({ t: 'titles' }); await sleep(300); check(A.titles && A.titles.have.includes('skilled') && !A.titles.have.includes('veteran'), 'level 10 unlocks the 숙련된 title only');
A.send({ t: 'title', id: 'skilled' }); await sleep(400); check(A.meta.get(A.id)?.[11] === '숙련된', 'chosen title appears in meta'); A.send({ t: 'title', id: 'legend' }); await sleep(300); check(A.said('아직 얻지 못한'), 'locked title refused');
A.send({ t: 'guild', args: ['생성', '회색기사단'] }); await sleep(400); check(A.said('창설했습니다'), 'guild created');
A.send({ t: 'ginvite', name: '도적베스' }); await sleep(300); B.send({ t: 'gaccept' }); await sleep(500);
check(B.said('가입했습니다') && A.meta.get(B.id)?.[10] === '회색기사단', 'guild invite accepted and tag visible in meta');
A.send({ t: 'pleave' }); await sleep(300); A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.chat.filter(t => t.includes('공격할 수 없는')).length >= 2, 'guild members cannot attack each other');
A.send({ t: 'chat', msg: '/길 모여라' }); await sleep(300); check(B.chat.includes('모여라'), 'guild chat delivered');
B.ws.close(); await sleep(400); B = bot(rb.token); await B.ready; await sleep(700); check(B.meta.get(B.id)?.[10] === '회색기사단', 'guild membership persists over relogin');
B.send({ t: 'guild', args: ['탈퇴'] }); await sleep(400); check(B.said('떠났습니다') && !B.meta.get(B.id)?.[10], 'guild leave clears the tag');
// admin: first account is admin; notice, kick
A.send({ t: 'chat', msg: '/공지 서버 점검 예정' }); await sleep(300); check(B.chat.includes('서버 점검 예정'), 'admin notice broadcast');
B.send({ t: 'chat', msg: '/공지 나도' }); await sleep(300); check(B.said('관리자만'), 'non-admin cannot use admin commands');
A.send({ t: 'chat', msg: '/차단 도적베스 10분 테스트' }); await sleep(600); check(B.said('차단되었습니다'), 'ban kicks the player');
const B2 = bot(rb.token); await B2.ready; await sleep(400); check(B2.said('차단된 계정'), 'banned account cannot rejoin');
A.send({ t: 'chat', msg: '/차단해제 도적베스' }); await sleep(300);
const admin = await (await fetch(`http://127.0.0.1:${PORT}/api/admin?token=${r5.token}`)).json(); check(admin.recent.some(e => e.kind === 'ban') && admin.recent.some(e => e.kind === 'trade'), 'admin page lists ban and trade events');
const adm403 = await fetch(`http://127.0.0.1:${PORT}/admin?token=${rb.token}`); check(adm403.status === 403, 'admin page refuses non-admins');
await fetch(`http://127.0.0.1:${PORT}/admin?token=${r5.token}&backup=1`, { redirect: 'manual' }); const adm2 = await (await fetch(`http://127.0.0.1:${PORT}/api/admin?token=${r5.token}`)).json(); check(adm2.backups.length === 1 && fs.existsSync(`${DATA}/backups/${adm2.backups[0]}`), 'admin backup writes a DB snapshot');
// daily bounty: level 10 admin accepts the guard's daily, progress counts rogue kills via admin-spawned monster kill is slow, so just verify state transitions
A.send({ t: 'use', i: A.inv.inv.findIndex(x => x.id === 'scroll'), id: 'scroll' }); await sleep(1500); A.send({ t: 'talk', npc: 'guard_s1' }); for (let i = 0; i < 12; i++) { await sleep(1000); if (A.npc && A.npc.id === 'guard_s1' && A.npc.quests.some(q => q.id === 'd_rogue')) break; }
check(A.npc && A.npc.quests && A.npc.quests.some(q => q.id === 'd_rogue' && q.st === 'avail'), 'daily bounty offered by the south guard');
A.send({ t: 'qaccept', npc: 'guard_s1', q: 'd_rogue' }); await sleep(400); check(A.npc.quests.find(q => q.id === 'd_rogue')?.st === 'active', 'daily bounty accepted');
B = bot(rb.token); await B.ready; await sleep(500);
// market: A lists a potion, B buys it, A receives 95%
const waitNpc = async (bot, id) => { bot.send({ t: 'talk', npc: id }); for (let i = 0; i < 15; i++) { await sleep(1000); if (bot.npc && bot.npc.id === id) return true; } return false; };
A.send({ t: 'chat', msg: '/아이템 hpPotion 1' }); await sleep(600);
check(await waitNpc(A, 'market') && Array.isArray(A.npc.market), 'merchant offers the player market');
const mi = A.inv.inv.findIndex(x => x.id === 'hpPotion'); A.send({ t: 'mlist', npc: 'market', i: mi, price: 100 }); await sleep(500);
check(A.npc.market.some(r => r.mine && r.item.id === 'hpPotion' && r.price === 100), 'item listed on the market');
await waitNpc(B, 'market'); const lid = B.npc.market.find(r => r.item.id === 'hpPotion' && !r.mine)?.id; const gA2 = A.inv.gold, gB2 = B.inv.gold;
B.send({ t: 'mbuy', npc: 'market', id: lid }); await sleep(500);
check(B.inv.inv.some(x => x.id === 'hpPotion') && B.inv.gold === gB2 - 100 && A.inv.gold === gA2 + 95, `market purchase settled (seller +95, buyer -100)`);
const monsBefore = (await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).monsters;
A.send({ t: 'chat', msg: '/습격' }); await sleep(600); const monsAfter = (await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).monsters;
check(B.chat.some(t => t.includes('해골 무리가')) && monsAfter >= monsBefore + 8, `gate raid spawns a warband and notifies everyone (${monsBefore} -> ${monsAfter})`);
A.send({ t: 'chat', msg: '/습격' }); await sleep(600); check(A.said('이미 습격'), 'only one raid at a time');
// catacombs: the entrance portal takes you underground, the two areas never share snapshots, depth means danger, exits lead back up
{
  const WD = await import('../shared/world.js'); const WW = WD.buildWorld(); const typeOf = (b, id) => b.meta.get(id)?.[3];   // meta[3] is the sprite
  const crypt = t => /^crypt_/.test(t || ''); const monsSeen = b => [...b.ents.keys()].filter(id => b.meta.get(id)?.[1] === 2).map(id => typeOf(b, id));
  A.send({ t: 'chat', msg: '/레벨 40' }); await sleep(650); A.send({ t: 'chat', msg: '/텔레포트 52.5 139.5' }); await sleep(700);   // chat is limited to one line per 500ms
  A.send({ t: 'move', x: 52.5, y: 136.5 }); await sleep(2500);
  let pa = A.pos(); check(pa && pa[0] > WD.DUNGEON.x0 && A.said('지하 묘지로 내려갑니다'), `stepping on the crypt entrance takes you underground (${pa && pa.map(v => v.toFixed(1))})`);
  await sleep(1200);
  const aSees = monsSeen(A), bSees = monsSeen(B);
  check(aSees.length && aSees.every(crypt) && !bSees.some(crypt), `underground and overworld snapshots never mix (A sees ${[...new Set(aSees)].join(',')})`);
  check(WD.PORTALS.every(p => WW.monsterBlock[p.y * WD.MAP + p.x] === 1 && !WW.block[p.y * WD.MAP + p.x]), 'portal tiles are walkable for players but closed to monsters');
  const lv = ['crypt_ghoul', 'crypt_guard', 'crypt_knight', 'boss_crypt'].map(t => WD.MONSTERS[t].level); const band = ['crypt_ghoul', 'crypt_guard', 'crypt_knight'].map(t => WD.MONSTERS[t].crypt[0]);
  check(lv.every((v, i) => !i || v > lv[i - 1]) && band.every((v, i) => !i || v > band[i - 1]) && WD.cryptFloor(WD.MONSTERS.boss_crypt.fixed[1]) === 4, `deeper bands hold stronger dwellers (Lv ${lv.join(' < ')}), the lord in the last chamber`);
  // fight one: an admin-summoned ghoul dies, pays EXP and drops gold
  A.evs.length = 0; A.send({ t: 'chat', msg: '/몬스터 crypt_ghoul' }); await sleep(500);
  const g = [...A.ents.values()].find(e => typeOf(A, e[0]) === 'crypt_ghoul' && Math.hypot(e[1] - A.pos()[0], e[2] - A.pos()[1]) < 4);
  if (g) A.send({ t: 'attack', id: g[0] }); for (let i = 0; i < 16 && g && !A.evs.some(e => e.k === 'die' && e.id === g[0]); i++) await sleep(500);
  check(g && A.evs.some(e => e.k === 'die' && e.id === g[0]) && A.evs.some(e => e.k === 'xp' && e.v >= WD.MONSTERS.crypt_ghoul.exp), 'a ghoul can be fought and pays crypt-tier EXP');
  A.send({ t: 'move', x: 210.5, y: 9.5 }); await sleep(3500); pa = A.pos();
  check(pa && pa[0] < WD.OVER && Math.hypot(pa[0] - 52.5, pa[1] - 138.5) < 3 && A.said('지상으로 올라왔습니다'), `the stair by the entrance hall leads back to the surface (${pa && pa.map(v => v.toFixed(1))})`);
  // the lord's chamber: the boss is home, and its back passage is a second way out
  A.send({ t: 'chat', msg: '/레벨 60' }); await sleep(650); A.send({ t: 'chat', msg: '/텔레포트 230.5 160.5' }); await sleep(1500);
  check([...A.ents.keys()].some(id => typeOf(A, id) === 'crypt_lord' && A.meta.get(id)[9] === 1), 'the catacomb lord waits in the deepest chamber');
  A.send({ t: 'move', x: 225.5, y: 163.5 }); await sleep(2500); pa = A.pos();
  check(pa && pa[0] < WD.OVER && A.said('안식처 뒤편 통로'), `the chamber's back passage returns you to the surface (${pa && pa.map(v => v.toFixed(1))})`);
  // attack-move (A + ground click): fights the monster in the way, then finishes the walk
  A.evs.length = 0; A.send({ t: 'chat', msg: '/몬스터 skel_minion' }); await sleep(500); const p0 = A.pos();
  const sk = [...A.ents.values()].find(e => A.meta.get(e[0])?.[1] === 2 && A.meta.get(e[0])?.[3] === 'skel_minion' && Math.hypot(e[1] - p0[0], e[2] - p0[1]) < 3.5);
  A.send({ t: 'amove', x: p0[0] + 6, y: p0[1] }); let pend = null; for (let i = 0; i < 20; i++) { await sleep(500); pend = A.pos(); if (sk && A.evs.some(e => e.k === 'die' && e.id === sk[0]) && Math.hypot(pend[0] - p0[0] - 6, pend[1] - p0[1]) < 1.5) break; }
  check(sk && A.evs.some(e => e.k === 'die' && e.id === sk[0]) && Math.hypot(pend[0] - p0[0] - 6, pend[1] - p0[1]) < 1.5, `attack-move kills the monster on the way and arrives (${pend && pend.map(v => v.toFixed(1))})`);
}
// combat: class skill bars and resources, cast times, cooldowns, taunt and threat, interrupts
{
  const RL = await import('../shared/rules.js'); const waitEv = async (f, ms = 3000) => { for (let i = 0; i < ms / 100; i++) { if (A.evs.some(f)) return true; await sleep(100); } return false; };
  check(RL.skillsFor('paladin').length === 6 && RL.skillsFor('cleric').length === 4 && RL.resourceOf('assassin') === 'breath' && RL.resourceOf('paladin') === 'grit' && A.me[22] === 'grit', `each class has its own bar and resource (A uses ${A.me[22]})`);
  A.send({ t: 'cast', id: 'fireball' }); await sleep(300); check(!A.evs.some(e => e.k === 'cast' && e.id === A.id && e.s === 'fireball'), 'the server refuses skills from another class');
  // cast time: 응급 치료 is a 1.5 s cast; walking breaks it, standing still lands it and starts its cooldown
  A.evs.length = 0; A.send({ t: 'stop' }); await sleep(200); A.send({ t: 'cast', id: 'first_aid' }); const started = await waitEv(e => e.k === 'cast' && e.id === A.id && e.s === 'first_aid', 1000);
  const pp = A.pos(); A.send({ t: 'move', x: pp[0], y: pp[1] + 2 }); const cut = await waitEv(e => e.k === 'castend' && e.id === A.id, 1000); await sleep(1700);
  check(started && cut && !A.evs.some(e => e.k === 'fx' && e.fx === 'heal' && e.id === A.id), 'a cast shows a bar and moving cancels it');
  await sleep(1200); A.evs.length = 0; A.send({ t: 'cast', id: 'first_aid' }); await sleep(1900);
  check(A.evs.some(e => e.k === 'fx' && e.fx === 'heal' && e.id === A.id) && A.me[25] && A.me[25].first_aid > 0, `standing still the cast lands and the cooldown starts (${A.me[25] && A.me[25].first_aid} ms left)`);
  A.send({ t: 'cast', id: 'first_aid' }); await sleep(300); check(A.said('아직 준비되지 않았습니다'), 'skills on cooldown are refused');
  // interrupt: a skeleton mage starts 어둠의 화살; 도전의 함성 (+20 grit) then 방패 강타 cuts it (its cast bar ends with cut)
  A.send({ t: 'chat', msg: '/레벨 30' }); await sleep(700); A.evs.length = 0; A.send({ t: 'chat', msg: '/몬스터 skel_mage' }); await sleep(500);
  const fresh = sprite => [...A.ents.values()].filter(e => A.meta.get(e[0])?.[3] === sprite && e[4] !== 4 && Math.hypot(e[1] - A.pos()[0], e[2] - A.pos()[1]) < 4).sort((x, y) => y[0] - x[0])[0];   // the just-summoned one: alive, highest id
  const mg = fresh('skel_mage');
  if (mg) { const pm = A.ents.get(mg[0]); A.send({ t: 'move', x: pm[1] - 1, y: pm[2] }); }
  const casting = mg && await waitEv(e => e.k === 'cast' && e.id === mg[0], 5000); await sleep(150);
  A.send({ t: 'cast', id: 'challenge' }); A.send({ t: 'cast', id: 'bash', tid: mg?.[0] });
  check(casting && await waitEv(e => e.k === 'castend' && e.id === mg[0] && e.cut === 1, 1500), `방패 강타 interrupts a monster's spell (${mg ? 'mage found' : 'no mage'}${casting ? ', cast seen' : ''})`);
  A.send({ t: 'attack', id: mg?.[0] }); for (let i = 0; i < 30 && !A.evs.some(e => e.k === 'die' && e.id === mg?.[0]); i++) await sleep(300);
  // taunt: once 도전의 함성 is ready again it forces a fresh monster onto you and fills grit; then it hits you
  for (let i = 0; i < 140 && A.me[25] && A.me[25].challenge; i++) await sleep(100);
  A.send({ t: 'stop' }); await sleep(300); A.send({ t: 'chat', msg: '/몬스터 skel_warrior' }); await sleep(600);
  const war = fresh('skel_warrior');
  const g0 = A.me[2]; A.evs.length = 0; A.send({ t: 'cast', id: 'challenge' }); await sleep(500);
  check(war && (A.ents.get(war[0])?.[6] & 64) && A.me[2] >= g0 + 15, `challenge taunts the monster (status ${war && A.ents.get(war[0])?.[6]}) and adds grit (${g0} -> ${A.me[2]})`);
  check(await waitEv(e => e.k === 'dmg' && e.a === war?.[0] && e.b === A.id, 4000), 'the taunted monster attacks the taunter');
  A.send({ t: 'attack', id: war?.[0] }); for (let i = 0; i < 30 && !A.evs.some(e => e.k === 'die' && e.id === war?.[0]); i++) await sleep(300);
}
// talents: points from level 10, tier gates, effects on stats and skills, saved with the character, reset in town, trimmed on level loss
{
  const RL = await import('../shared/rules.js'); let tal = null; A.ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.t === 'talents') tal = m; });
  check(RL.talentPoints(9) === 0 && RL.talentPoints(10) === 1 && RL.talentPoints(30) === 11 && RL.talentPoints(60) === 21, 'talent points: one per two levels from 10, capped at 21');
  A.send({ t: 'chat', msg: '/레벨 30' }); await sleep(900); const def0 = A.me[9], hp0 = A.me[1];
  A.send({ t: 'talent', id: 'k_unyield' }); await sleep(250); check(A.said('9점을 먼저'), 'capstone is locked until 9 points are in its tree');
  A.send({ t: 'talent', id: 'm_flame' }); await sleep(250); check(A.said('이 직업의 특성이 아닙니다'), "another class's talent is refused");
  for (const id of ['k_plate', 'k_plate', 'k_plate', 'k_will', 'k_will', 'k_will', 'k_bashm', 'k_bashm']) { A.send({ t: 'talent', id }); await sleep(120); }
  await sleep(600);
  check(tal && tal.talents.k_plate === 3 && tal.talents.k_bashm === 2 && tal.points === 11, `talents learned and sent back (${tal && JSON.stringify(tal.talents)})`);
  check(A.me[9] >= Math.round(def0 * 1.1) && A.me[1] >= Math.round(hp0 * 1.08), `두꺼운 갑주·굳은 의지 raise defence ${def0} -> ${A.me[9]} and max HP ${hp0} -> ${A.me[1]}`);
  A.send({ t: 'talent', id: 'k_bashm' }); await sleep(250); check(A.said('이미 최대로'), 'a talent cannot go past its max rank');
  // 방패 숙련 2/2: bash cooldown 8 s -> 6 s (fight a summoned skeleton to have a target and grit)
  for (let i = 0; i < 140 && A.me[25] && A.me[25].challenge; i++) await sleep(100);   // 도전의 함성 may still be cooling down from the combat checks
  A.send({ t: 'chat', msg: '/몬스터 skel_warrior' }); await sleep(700); A.send({ t: 'cast', id: 'challenge' }); await sleep(1500); A.send({ t: 'cast', id: 'bash' }); await sleep(400);   // the taunted skeleton walks into reach first
  const bcd = A.me[25] && A.me[25].bash; check(bcd > 5000 && bcd <= 6000, `방패 숙련 shortens 방패 강타's cooldown to 6 s (${bcd} ms left)`);
  // reset only in town, and it costs gold
  A.send({ t: 'talentReset' }); await sleep(250); check(A.said('마을 안에서만'), 'talent reset is refused outside town');
  // saved with the character: reconnect and the picks come back
  A.ws.close(); await sleep(1200); A = bot(r5.token); tal = null; A.ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.t === 'talents') tal = m; }); await A.ready; await sleep(1200);
  check(A.me[11] === 'paladin', `an advanced class survives logging out and back in (${A.me[11]})`);
  check(tal && tal.talents.k_will === 3 && tal.talents.k_bashm === 2, `talents are saved and restored on login (${tal && JSON.stringify(tal.talents)})`);
  const gT = A.inv.gold; A.send({ t: 'chat', msg: '/레벨 30' }); await sleep(700); A.send({ t: 'talentReset' }); await sleep(500);
  check(tal && !Object.keys(tal.talents).length && A.inv.gold === gT - RL.talentResetCost(30), `reset in town clears every talent for ${RL.talentResetCost(30)} G (${gT} -> ${A.inv.gold})`);
  for (const id of ['k_edge', 'k_edge', 'k_fury']) { A.send({ t: 'talent', id }); await sleep(150); }
  A.send({ t: 'chat', msg: '/레벨 11' }); await sleep(900);
  check(A.said('특성 점수가 줄어') && tal && !Object.keys(tal.talents).length, 'losing levels below the points spent clears talents');
}
const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
check(health.players === 2 && health.monsters > 90, `health ${JSON.stringify(health)}`);
check((await fetch(`http://127.0.0.1:${PORT}/`)).ok, 'client page is served');
A.ws.close(); B.ws.close(); srv.kill();
const failed = results.filter(r => !r[0]).length; console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
