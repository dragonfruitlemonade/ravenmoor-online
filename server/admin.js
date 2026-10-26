// Operations: admin chat commands, bans, event log and a status page.
// Admin accounts are listed in ADMIN_NAMES (comma separated, case-insensitive); the first registered account is admin when the variable is unset.
import { db } from './db.js';
import { ITEMS, itemName } from '../shared/rules.js';
import { SPAWN, MAP } from '../shared/world.js';

db.exec(`
CREATE TABLE IF NOT EXISTS bans (name TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT, by_name TEXT, until INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT, target TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
`);
const q = {
  ban: db.prepare('INSERT OR REPLACE INTO bans (name, reason, by_name, until, created_at) VALUES (?, ?, ?, ?, ?)'),
  unban: db.prepare('DELETE FROM bans WHERE name = ?'),
  getBan: db.prepare('SELECT * FROM bans WHERE name = ? AND (until IS NULL OR until > ?)'),
  bans: db.prepare('SELECT * FROM bans ORDER BY created_at DESC LIMIT 100'),
  log: db.prepare('INSERT INTO events (at, kind, actor, target, detail) VALUES (?, ?, ?, ?, ?)'),
  recent: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?'),
  firstAcc: db.prepare('SELECT name FROM accounts ORDER BY id LIMIT 1'),
  top: db.prepare('SELECT a.name, c.level, c.exp, c.cls, c.kills, c.align FROM characters c JOIN accounts a ON a.id = c.account_id ORDER BY c.level DESC, c.exp DESC LIMIT ?'),
  countAcc: db.prepare('SELECT COUNT(*) AS n FROM accounts'),
};
const ADMINS = (process.env.ADMIN_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export function isAdmin(name) { if (ADMINS.length) return ADMINS.includes(name.toLowerCase()); const f = q.firstAcc.get(); return !!f && f.name.toLowerCase() === name.toLowerCase(); }
export function logEvent(kind, actor, target, detail) { try { q.log.run(Date.now(), kind, actor || null, target || null, detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null); } catch {} }
export function banInfo(name) { return q.getBan.get(name, Date.now()); }
export const leaderboard = (n = 20) => q.top.all(n);
export const statusInfo = () => ({ accounts: q.countAcc.get().n, bans: q.bans.all(), recent: q.recent.all(60) });

const DUR = { '분': 60e3, '시간': 3600e3, '일': 86400e3 };
function parseDur(s) { const m = /^(\d+)(분|시간|일)$/.exec(s || ''); return m ? +m[1] * DUR[m[2]] : null; }

// returns true if the message was an admin command
export function adminCommand(p, text, ctx) {
  const { sys, broadcastAll, findPlayerByName, ents, addItem, invChanged, applyStats, bump, MONSTERS, spawnMonster } = ctx;
  const [cmd, ...args] = text.trim().split(/\s+/); const a = args.join(' ');
  const ADMIN_CMDS = ['/공지', '/킥', '/차단', '/차단해제', '/텔레포트', '/소환', '/아이템', '/금화', '/레벨', '/접속자', '/몬스터', '/습격', '/날씨', '/도움'];
  if (!ADMIN_CMDS.includes(cmd)) return false;
  if (!isAdmin(p.name)) { sys(p, '관리자만 쓸 수 있는 명령입니다.'); return true; }
  const target = () => { const t = findPlayerByName(args[0] || ''); if (!t) sys(p, '접속 중인 그런 이름이 없습니다.'); return t; };
  switch (cmd) {
    case '/도움': sys(p, '관리자: /공지 글 · /킥 이름 · /차단 이름 [10분|2시간|3일] [사유] · /차단해제 이름 · /텔레포트 이름|x y · /소환 이름 · /아이템 아이템ID [수] · /금화 수 · /레벨 수 · /접속자 · /몬스터 종류 · /습격 · /날씨 맑음|비|안개'); break;
    case '/공지': if (!a) return true; broadcastAll({ t: 'chat', notice: true, msg: a }); logEvent('notice', p.name, null, a); break;
    case '/킥': { const t = target(); if (!t) break; sys(t, '관리자가 연결을 끊었습니다.'); t.client.sock.close(); logEvent('kick', p.name, t.name); sys(p, `${t.name} 내보냄`); break; }
    case '/차단': { const name = args[0]; if (!name) break; const dur = parseDur(args[1]); const reason = (dur ? args.slice(2) : args.slice(1)).join(' ') || null; q.ban.run(name, reason, p.name, dur ? Date.now() + dur : null, Date.now()); const t = findPlayerByName(name); if (t) { sys(t, `차단되었습니다${reason ? ': ' + reason : ''}.`); t.client.sock.close(); } logEvent('ban', p.name, name, { dur, reason }); sys(p, `${name} 차단 (${dur ? args[1] : '영구'})`); break; }
    case '/차단해제': q.unban.run(args[0] || ''); logEvent('unban', p.name, args[0]); sys(p, `${args[0]} 차단 해제`); break;
    case '/텔레포트': { let x, y; if (args.length >= 2 && !isNaN(+args[0])) { x = +args[0]; y = +args[1]; } else { const t = target(); if (!t) break; x = t.x; y = t.y; } if (!(x > 0 && y > 0 && x < MAP && y < MAP)) break; p.path = null; p.x = x; p.y = y; sys(p, `(${Math.round(x)}, ${Math.round(y)})로 이동`); break; }
    case '/소환': { const t = target(); if (!t) break; t.path = null; t.x = p.x + .5; t.y = p.y; sys(t, '관리자가 당신을 소환했습니다.'); break; }
    case '/아이템': { const id = args[0]; if (!ITEMS[id]) { sys(p, '아이템 ID: ' + Object.keys(ITEMS).join(', ')); break; } const n = Math.max(1, Math.min(99, +args[1] || 1)); addItem(p, { id, n, enh: 0 }); invChanged(p); logEvent('give', p.name, p.name, { id, n }); sys(p, `${ITEMS[id].name} ×${n} 지급`); break; }
    case '/금화': { const n = Math.floor(+args[0] || 0); p.gold = Math.max(0, p.gold + n); invChanged(p); logEvent('gold', p.name, p.name, n); break; }
    case '/레벨': { const n = Math.max(1, Math.min(60, +args[0] || 1)); let t = p; if (args[1]) { t = findPlayerByName(args[1]); if (!t) { sys(p, '접속 중인 그런 이름이 없습니다.'); break; } } t.level = n; t.exp = 0; applyStats(t, true); bump(t); t.saveDirty = true; sys(t, `레벨 ${n}`); if (t !== p) sys(p, `${t.name}: 레벨 ${n}`); break; }
    case '/접속자': { const list = [...ents.values()].filter(e => e.kind === 'player').map(e => `${e.name}(Lv${e.level}${e.align < 0 ? ',카오틱' : ''})`); sys(p, `접속 ${list.length}명: ${list.join(', ')}`); break; }
    case '/날씨': { const w = { '맑음': 0, '비': 1, '안개': 2 }[args[0]]; if (w === undefined) { sys(p, '사용법: /날씨 맑음|비|안개'); break; } ctx.setWeather(w); sys(p, `날씨: ${args[0]}`); break; }
    case '/습격': { sys(p, ctx.startRaid(true) ? '습격을 시작했습니다.' : '이미 습격이 진행 중입니다.'); break; }
    case '/몬스터': { const type = args[0]; if (!MONSTERS[type]) { sys(p, '종류: ' + Object.keys(MONSTERS).join(', ')); break; } const m = spawnMonster(type, p.x + 2, p.y); m.temp = true; sys(p, `${m.name} 소환`); break; }
  }
  return true;
}
