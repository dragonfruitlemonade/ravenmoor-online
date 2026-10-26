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
A.send({ t: 'talk', npc: 'market' }); await sleep(3500);
check(A.npc && A.npc.id === 'market' && A.npc.shop.includes('leatherArmor'), 'talking to the merchant opens her shop');
const g0 = A.inv.gold; A.send({ t: 'buy', npc: 'market', item: 'leatherArmor' }); await sleep(300);
check(A.inv.gold === g0 - 150 && A.inv.inv.some(x => x.id === 'leatherArmor'), 'buy leather armour for 150 G');
const def0 = A.me[9]; const idx = A.inv.inv.findIndex(x => x.id === 'leatherArmor'); A.send({ t: 'equip', i: idx, id: 'leatherArmor' }); await sleep(300);
check(A.inv.equip.armor?.id === 'leatherArmor' && A.me[9] === def0 + 4, `equipping raises defence (${def0} -> ${A.me[9]})`);
A.send({ t: 'buy', npc: 'smith', item: 'longSword' }); await sleep(250); check(A.said('더 가까이'), 'shops check distance to the NPC');

// safe zone and PK
A.send({ t: 'attack', id: B.id }); await sleep(300); check(A.said('마을 안에서는'), 'attacking inside town is refused');
A.send({ t: 'move', x: 64.5, y: 82.5 }); B.send({ t: 'move', x: 65.5, y: 82.5 }); await sleep(5200);
const pa = A.pos(); check(pa && pa[1] > 78, `walked out through the south gate (y=${pa && pa[1]})`);
const hp0 = B.me[0]; A.send({ t: 'attack', id: B.id }); await sleep(2500);
check(B.me[0] < hp0, `PK outside walls deals damage (B hp ${hp0} -> ${B.me[0]})`);
check(A.meta.get(A.id)?.[5] >= 1, 'attacker gets a purple/red name');
A.send({ t: 'stop' }); B.send({ t: 'move', x: 64.5, y: 66.5 }); await sleep(5500);
A.send({ t: 'move', x: 64.5, y: 70.5 }); await sleep(4500); await sleep(6000); A.send({ t: 'move', x: 64.5, y: 82.5 }); await sleep(4500);

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
A.send({ t: 'talk', npc: 'knights' }); await sleep(3500); const hp10 = A.me[1];
A.send({ t: 'job', npc: 'knights' }); await sleep(300);
check(A.me[11] === 'knight' && A.me[1] > hp10, `class change to knight (maxHp ${hp10} -> ${A.me[1]})`);
A.send({ t: 'skill' }); await sleep(200); check(A.said('성내에서는'), 'skills are blocked inside town');

const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
check(health.players === 2 && health.monsters > 50, `health ${JSON.stringify(health)}`);
check((await fetch(`http://127.0.0.1:${PORT}/`)).ok, 'client page is served');
A.ws.close(); B.ws.close(); srv.kill();
const failed = results.filter(r => !r[0]).length; console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
