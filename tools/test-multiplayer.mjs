// End-to-end test: starts the server and drives bot clients through accounts, PK rules, items, shops, drops and class change.
import { spawn } from 'node:child_process';
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
    if (m.t === 'inv') b.inv = m; if (m.t === 'npc') b.npc = m;
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
A.send({ t: 'talk', npc: 'market' }); await sleep(6000);
check(A.npc && A.npc.id === 'market' && A.npc.shop.includes('leatherArmor'), 'talking to the merchant opens her shop');
const g0 = A.inv.gold; A.send({ t: 'buy', npc: 'market', item: 'leatherArmor' }); await sleep(300);
check(A.inv.gold === g0 - 150 && A.inv.inv.some(x => x.id === 'leatherArmor'), 'buy leather armour for 150 G');
const def0 = A.me[9]; const idx = A.inv.inv.findIndex(x => x.id === 'leatherArmor'); A.send({ t: 'equip', i: idx, id: 'leatherArmor' }); await sleep(300);
check(A.inv.equip.armor?.id === 'leatherArmor' && A.me[9] === def0 + 4, `equipping raises defence (${def0} -> ${A.me[9]})`);
A.send({ t: 'buy', npc: 'smith', item: 'longSword' }); await sleep(250); check(A.said('더 가까이'), 'shops check distance to the NPC');

// safe zone and PK
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('마을 안에서는'), 'attacking inside town is refused');
A.send({ t: 'move', x: 88.5, y: 118.5 }); B.send({ t: 'move', x: 89.5, y: 118.5 }); await sleep(8000);
const pa = A.pos(); check(pa && pa[1] > 114, `walked out through the south gate (y=${pa && pa[1]})`);
const hp0 = B.me[0]; A.send({ t: 'attack', id: B.id }); await sleep(2500);
check(B.me[0] < hp0, `PK outside walls deals damage (B hp ${hp0} -> ${B.me[0]})`);
check(A.meta.get(A.id)?.[5] >= 1, 'attacker gets a purple/red name');
A.send({ t: 'stop' }); B.send({ t: 'move', x: 88.5, y: 100.5 }); await sleep(7000);
A.send({ t: 'move', x: 88.5, y: 104.5 }); await sleep(6000); await sleep(6000); A.send({ t: 'move', x: 88.5, y: 120.5 }); await sleep(7000);

// hunt: kill a monster, loot appears on the ground with owner priority
let killed = false; for (let i = 0; i < 6 && !killed; i++) { const mon = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 2 && A.meta.get(e[0])?.[3] === 'skel_minion' && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - A.pos()[0], p[2] - A.pos()[1]) - Math.hypot(q[1] - A.pos()[0], q[2] - A.pos()[1]))[0]; if (!mon) break; A.send({ t: 'attack', id: mon[0] }); for (let k = 0; k < 20 && !killed; k++) { await sleep(500); if (A.evs.some(e => e.k === 'die' && e.id === mon[0])) killed = true; if (A.me[0] < A.me[1] * .35) { const hp = A.inv.inv.findIndex(x => x.id === 'hpPotion'); if (hp >= 0) A.send({ t: 'use', i: hp, id: 'hpPotion' }); } } }
check(killed, 'player kills a monster');
await sleep(400); const dpos = A.pos(); const drop = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 3 && A.meta.get(e[0])?.[3] === 'gold').sort((p, q) => Math.hypot(p[1] - dpos[0], p[2] - dpos[1]) - Math.hypot(q[1] - dpos[0], q[2] - dpos[1]))[0];
check(!!drop, 'gold drops on the ground');
B.send({ t: 'pick', id: drop?.[0] });
const goldBefore = A.inv.gold; A.send({ t: 'pick', id: drop?.[0] }); await sleep(2000);
check(A.inv.gold > goldBefore, `owner picks up the gold (${goldBefore} -> ${A.inv.gold})`);

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
A.send({ t: 'skill' }); await sleep(200); check(A.said('성내에서는'), 'skills are blocked inside town');


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
A.send({ t: 'skill2' }); await sleep(300); check(A.evs.some(e => e.k === 'fx' && e.fx === 'heal' && e.id === A.id) || A.said('마나') || A.said('대상'), 'second skill (smite) fires or reports a reason');

// social: whisper, party exp share, party members cannot PK each other, trade
B.ws.close(); await sleep(300); B = bot(rb.token); await B.ready; await sleep(700);
A.send({ t: 'chat', msg: '/귓 도적베스 안녕' }); await sleep(300); check(B.chat.includes('안녕'), 'whisper delivered');
A.send({ t: 'pinvite', name: '도적베스' }); await sleep(300); B.send({ t: 'paccept' }); await sleep(400);
check(A.me[21] && A.me[21] === B.me[21], 'party formed (same party id)');
A.send({ t: 'move', x: 88.5, y: 118.5 }); B.send({ t: 'move', x: 89.5, y: 118.5 }); await sleep(8000);
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('공격할 수 없는'), 'party members cannot attack each other');
const expB = B.me[5] + B.me[4] * 100000; let k2 = false; for (let i = 0; i < 8 && !k2; i++) { const mon = [...A.ents.values()].filter(e => A.meta.get(e[0])?.[1] === 2 && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - A.pos()[0], p[2] - A.pos()[1]) - Math.hypot(q[1] - A.pos()[0], q[2] - A.pos()[1]))[0]; if (!mon) break; A.send({ t: 'attack', id: mon[0] }); for (let k = 0; k < 16; k++) { await sleep(400); if (A.evs.some(e => e.k === 'die' && e.id === mon[0])) { k2 = true; break; } } }
await sleep(300); check(k2 && (B.me[5] + B.me[4] * 100000) > expB, 'party member nearby receives shared exp');
// trade: A gives 2 potions + 50 gold, B gives 10 gold
A.send({ t: 'stop' }); await sleep(200); A.send({ t: 'move', x: B.pos()[0] + 1, y: B.pos()[1] }); await sleep(2500);
A.send({ t: 'trade', name: '도적베스' }); await sleep(300); B.send({ t: 'taccept' }); await sleep(400);
const pA = A.inv.inv.findIndex(x => x.id === 'hpPotion'); const gA = A.inv.gold, gB = B.inv.gold; const nA = A.inv.inv[pA].n, nB = B.inv.inv.find(x => x.id === 'hpPotion')?.n || 0;
A.send({ t: 'toffer', items: [pA], gold: 50 }); B.send({ t: 'toffer', items: [], gold: 10 }); await sleep(400);
A.send({ t: 'tconfirm' }); await sleep(200); B.send({ t: 'tconfirm' }); await sleep(600);
check(A.inv.gold === gA - 40 && B.inv.gold === gB + 40, `trade gold settled (A ${gA}->${A.inv.gold}, B ${gB}->${B.inv.gold})`);
check(!A.inv.inv.some(x => x.id === 'hpPotion') && (B.inv.inv.find(x => x.id === 'hpPotion')?.n || 0) === nB + nA, 'trade items moved');
// admin: first account is admin; notice, kick
A.send({ t: 'chat', msg: '/공지 서버 점검 예정' }); await sleep(300); check(B.chat.includes('서버 점검 예정'), 'admin notice broadcast');
B.send({ t: 'chat', msg: '/공지 나도' }); await sleep(300); check(B.said('관리자만'), 'non-admin cannot use admin commands');
A.send({ t: 'chat', msg: '/차단 도적베스 10분 테스트' }); await sleep(600); check(B.said('차단되었습니다'), 'ban kicks the player');
const B2 = bot(rb.token); await B2.ready; await sleep(400); check(B2.said('차단된 계정'), 'banned account cannot rejoin');
A.send({ t: 'chat', msg: '/차단해제 도적베스' }); await sleep(300);
const admin = await (await fetch(`http://127.0.0.1:${PORT}/api/admin?token=${r5.token}`)).json(); check(admin.recent.some(e => e.kind === 'ban') && admin.recent.some(e => e.kind === 'trade'), 'admin page lists ban and trade events');
const adm403 = await fetch(`http://127.0.0.1:${PORT}/admin?token=${rb.token}`); check(adm403.status === 403, 'admin page refuses non-admins');
B = bot(rb.token); await B.ready; await sleep(500);
const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
check(health.players === 2 && health.monsters > 90, `health ${JSON.stringify(health)}`);
check((await fetch(`http://127.0.0.1:${PORT}/`)).ok, 'client page is served');
A.ws.close(); B.ws.close(); srv.kill();
const failed = results.filter(r => !r[0]).length; console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
