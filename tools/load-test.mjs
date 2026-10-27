// Load test: N bot players log in, wander outside the walls and attack whatever is near for a while,
// then the script reports server tick time, memory and snapshot sizes.
//   node tools/load-test.mjs [bots=40] [seconds=60] [port=8099]
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const N = +process.argv[2] || 40, SECONDS = +process.argv[3] || 60, PORT = +process.argv[4] || 8099, DATA = '/tmp/rm-load';
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn(process.execPath, [...(process.env.PROF ? ['--cpu-prof', '--cpu-prof-dir=/tmp/rm-prof'] : []), '--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA, RATE_LIMIT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, b) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();

let bytes = 0, msgs = 0;
function bot(token, i) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const b = { ws, id: 0, ents: new Map(), meta: new Map(), dead: false, hp: 1 };
  ws.onmessage = ev => { bytes += ev.data.length; msgs++; const m = JSON.parse(ev.data); if (m.t === 'welcome') b.id = m.id; if (m.t === 'snap') { for (const x of m.m) b.meta.set(x[0], x); for (const e of m.e) b.ents.set(e[0], e); for (const g of m.g) b.ents.delete(g); b.hp = m.me[0]; b.dead = b.ents.get(b.id)?.[4] === 4; } };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', token }));
  b.send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  b.pos = () => { const e = b.ents.get(b.id); return e ? [e[1], e[2]] : [88, 93]; };
  b.think = () => {
    if (!b.id || b.dead) return;
    const [x, y] = b.pos(); const inTown = x > 64 && x < 112 && y > 64 && y < 112;
    const mon = [...b.ents.values()].filter(e => b.meta.get(e[0])?.[1] === 2 && e[4] !== 4).sort((p, q) => Math.hypot(p[1] - x, p[2] - y) - Math.hypot(q[1] - x, q[2] - y))[0];
    if (!inTown && mon && Math.hypot(mon[1] - x, mon[2] - y) < 9) { b.send({ t: 'attack', id: mon[0] }); if (b.hp < 60 && Math.random() < .3) b.send({ t: 'cast', id: 'first_aid' }); return; }
    const a = (i / N) * Math.PI * 2 + Math.random() * .6, r = 32 + Math.random() * 24;
    b.send({ t: 'move', x: Math.max(2, Math.min(173, 88 + Math.cos(a) * r)), y: Math.max(2, Math.min(173, 88 + Math.sin(a) * r)) });
    if (Math.random() < .05) b.send({ t: 'chat', msg: '부하 테스트 ' + i });
  };
  return b;
}
const bots = [];
for (let i = 0; i < N; i++) { const { token, error } = await api('/api/register', { name: `부하봇${i}`, password: 'loadtest1', look: ['knight', 'rogue', 'mage', 'barbarian'][i % 4] }); if (error) { console.error(error); continue; } bots.push(bot(token, i)); await sleep(30); }
await sleep(1500);
const health = async () => (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
console.log(`${bots.length} bots online →`, await health());
const t0 = Date.now(); let last = t0; bytes = 0; msgs = 0;
const timer = setInterval(() => { for (const b of bots) b.think(); }, 700);
const report = setInterval(async () => { const h = await health(); const dt = (Date.now() - last) / 1000; last = Date.now(); console.log(`t=${Math.round((Date.now() - t0) / 1000)}s players=${h.players} tick=${h.tickMs}ms max=${h.tickMaxMs}ms rss=${h.mem}MB drops=${h.drops} net=${(bytes / dt / 1024).toFixed(0)}KB/s msgs=${(msgs / dt).toFixed(0)}/s`); bytes = 0; msgs = 0; }, 10000);
await sleep(SECONDS * 1000);
clearInterval(timer); clearInterval(report);
const h = await health(); console.log('final', h, `per-bot ${(bytes / Math.max(1, (Date.now() - last) / 1000) / 1024 / bots.length).toFixed(1)} KB/s`);
for (const b of bots) b.ws.close(); srv.kill('SIGINT'); await sleep(1500); process.exit(0);
