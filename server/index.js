// Ravenmoor Online server: serves the client, the account API and the game WebSocket (/ws).
// Start: npm start   (PORT=8080 by default, DATA_DIR=./data)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attach } from './ws.js';
import { register, login, logout, backup, listBackups } from './db.js';
import { onConnection, stats, saveAll, STARTER } from './game.js';
import { statusInfo, isAdmin, leaderboard } from './admin.js';
import { accountForToken, loadCharacter } from './db.js';
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
  if (u === '/api/leaderboard') return json(res, 200, leaderboard(20));
  if (u === '/admin' || u === '/api/admin') {
    const tk = new URL(req.url, 'http://x').searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer /, '');
    const acc = accountForToken(tk); const ch = acc && loadCharacter(acc);
    if (!ch || !isAdmin(ch.name)) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('관리자만 볼 수 있습니다. 게임에 로그인한 뒤 설정에서 "운영 페이지"를 여세요.'); }
    const info = { ...stats(), ...statusInfo(), backups: listBackups() };
    if (u === '/api/admin') return json(res, 200, info);
    if (new URL(req.url, 'http://x').searchParams.get('backup') === '1') { try { backup(); } catch (err) { console.error('backup failed', err); } res.writeHead(302, { location: '/admin?token=' + encodeURIComponent(tk) }); return res.end(); }
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><meta charset="utf-8"><title>Ravenmoor 운영</title><style>body{font:14px/1.5 system-ui;background:#15161b;color:#e8e2d4;padding:24px;max-width:960px;margin:auto}h1,h2{font-family:Georgia,serif;color:#d8c27a}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #2c2f3a;padding:5px 8px;text-align:left}code{color:#9ec7ff}.k{display:inline-block;margin-right:18px}</style>
<h1>Ravenmoor 운영</h1><p><span class="k">접속 <b>${info.players}</b></span><span class="k">계정 <b>${info.accounts}</b></span><span class="k">몬스터 <b>${info.monsters}</b></span><span class="k">바닥 전리품 <b>${info.drops}</b></span></p>
<p>게임 안 채팅 명령: <code>/공지 글</code> <code>/킥 이름</code> <code>/차단 이름 [10분|2시간|3일] [사유]</code> <code>/차단해제 이름</code> <code>/텔레포트 이름|x y</code> <code>/소환 이름</code> <code>/아이템 ID [수]</code> <code>/금화 수</code> <code>/레벨 수</code> <code>/접속자</code> <code>/몬스터 종류</code> <code>/습격</code></p>
<h2>백업</h2><p>30분마다 <code>data/backups/</code>에 자동 저장되며 최근 48개를 보관합니다. <a href="/admin?token=${encodeURIComponent(tk)}&backup=1" style="color:#9ec7ff">지금 백업</a></p><ul>${info.backups.map(f => `<li><code>${esc(f)}</code></li>`).join('') || '<li>아직 없음</li>'}</ul>
<h2>차단 목록</h2><table><tr><th>이름</th><th>사유</th><th>처리자</th><th>해제 시각</th></tr>${info.bans.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.reason)}</td><td>${esc(b.by_name)}</td><td>${b.until ? new Date(b.until).toLocaleString('ko-KR') : '영구'}</td></tr>`).join('') || '<tr><td colspan=4>없음</td></tr>'}</table>
<h2>최근 기록</h2><table><tr><th>시각</th><th>종류</th><th>대상</th><th>내용</th></tr>${info.recent.map(e => `<tr><td>${new Date(e.at).toLocaleString('ko-KR')}</td><td>${esc(e.kind)}</td><td>${esc(e.actor)}${e.target ? ' → ' + esc(e.target) : ''}</td><td>${esc(e.detail)}</td></tr>`).join('')}</table>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
  }
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
