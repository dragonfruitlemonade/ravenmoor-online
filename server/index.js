// Ravenmoor Online server: serves the client, the account API and the game WebSocket (/ws).
// Start: npm start   (PORT=8080 by default, DATA_DIR=./data)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attach } from './ws.js';
import { register, login, logout } from './db.js';
import { onConnection, stats, saveAll, STARTER } from './game.js';
import { LOOKS } from '../shared/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = { '/client/': 'client', '/shared/': 'shared', '/assets/': 'assets' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const PORT = +process.env.PORT || 8080;

// simple per-IP limiter for the account endpoints: 10 attempts per 5 minutes
const attempts = new Map();
function limited(ip) { const t = Date.now(); const a = (attempts.get(ip) || []).filter(x => t - x < 300_000); a.push(t); attempts.set(ip, a); return a.length > 10; }
setInterval(() => { const t = Date.now(); for (const [k, v] of attempts) if (!v.some(x => t - x < 300_000)) attempts.delete(k); }, 60_000).unref();

function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((resolve, reject) => { let b = ''; req.on('data', d => { b += d; if (b.length > 4096) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } }); }); }

const server = http.createServer(async (req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (u === '/health') return json(res, 200, stats());
  if (u.startsWith('/api/') && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch { return json(res, 400, { error: '잘못된 요청입니다.' }); }
    if (u === '/api/logout') { logout(body.token); return json(res, 200, { ok: true }); }
    if (limited(ip)) return json(res, 429, { error: '시도가 너무 많습니다. 5분 뒤에 다시 시도하세요.' });
    if (u === '/api/register') { const r = register(String(body.name || '').trim(), body.password, LOOKS[body.look] ? body.look : 'knight', STARTER); return json(res, r.error ? 400 : 200, r); }
    if (u === '/api/login') { const r = login(String(body.name || '').trim(), body.password); return json(res, r.error ? 401 : 200, r); }
    return json(res, 404, { error: 'not found' });
  }
  if (u === '/') u = '/client/index.html';
  const base = Object.keys(PUBLIC).find(k => u.startsWith(k));
  if (!base) { res.writeHead(404); return res.end('not found'); }
  const dir = path.join(ROOT, PUBLIC[base]); const file = path.join(dir, u.slice(base.length));
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.png' ? 'public, max-age=86400' : 'no-cache', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
});
attach(server, '/ws', sock => onConnection(sock));
server.listen(PORT, () => console.log(`Ravenmoor Online: http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveAll(); process.exit(0); });
