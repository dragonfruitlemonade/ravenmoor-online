// Ravenmoor Online server: serves the client files and runs the game over WebSocket at /ws.
// Start: node server/index.js   (PORT=8080 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attach } from './ws.js';
import { onConnection, stats } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = { '/': 'client', '/client/': 'client', '/shared/': 'shared', '/assets/': 'assets' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const PORT = +process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(stats())); }
  if (u === '/') u = '/client/index.html';
  const base = Object.keys(PUBLIC).filter(k => k !== '/').find(k => u.startsWith(k));
  if (!base) { res.writeHead(404); return res.end('not found'); }
  const dir = path.join(ROOT, PUBLIC[base]);
  const file = path.join(dir, u.slice(base.length));
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});
attach(server, '/ws', sock => onConnection(sock));
server.listen(PORT, () => console.log(`Ravenmoor Online: http://localhost:${PORT}`));
