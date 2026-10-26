// Accounts, characters and sessions in SQLite (built into Node 22+: node:sqlite). No external dependencies.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(path.join(DATA_DIR, 'ravenmoor.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS characters (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  look TEXT NOT NULL,
  cls TEXT NOT NULL DEFAULT 'commoner',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 100,
  align INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  inventory TEXT NOT NULL DEFAULT '[]',
  equipment TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
`);

const q = {
  findAcc: db.prepare('SELECT * FROM accounts WHERE name = ?'),
  insAcc: db.prepare('INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)'),
  touch: db.prepare('UPDATE accounts SET last_login = ? WHERE id = ?'),
  insChar: db.prepare('INSERT INTO characters (account_id, look, gold, inventory, equipment, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
  getChar: db.prepare('SELECT a.name, c.* FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.account_id = ?'),
  saveChar: db.prepare('UPDATE characters SET cls=?, level=?, exp=?, gold=?, align=?, kills=?, inventory=?, equipment=?, updated_at=? WHERE account_id=?'),
  insSess: db.prepare('INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)'),
  getSess: db.prepare('SELECT account_id FROM sessions WHERE token = ? AND expires_at > ?'),
  delSess: db.prepare('DELETE FROM sessions WHERE token = ?'),
  purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
};

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
export const NAME_RE = /^[가-힣A-Za-z0-9_]{2,10}$/;

export function register(name, password, look, starter) {
  if (!NAME_RE.test(name)) return { error: '이름은 한글·영문·숫자 2~10자로 입력하세요.' };
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) return { error: '비밀번호는 6~64자로 입력하세요.' };
  if (q.findAcc.get(name)) return { error: '이미 사용 중인 이름입니다.' };
  const salt = crypto.randomBytes(16).toString('hex'); const t = Date.now();
  const r = q.insAcc.run(name, hash(password, salt), salt, t);
  q.insChar.run(r.lastInsertRowid, look, starter.gold || 100, JSON.stringify(starter.inventory), JSON.stringify(starter.equipment), t);
  return { token: newSession(Number(r.lastInsertRowid)) };
}
export function login(name, password) {
  const a = q.findAcc.get(String(name || ''));
  const ok = a && typeof password === 'string' && crypto.timingSafeEqual(Buffer.from(hash(password, a.salt), 'hex'), Buffer.from(a.pass_hash, 'hex'));
  if (!ok) return { error: '이름 또는 비밀번호가 맞지 않습니다.' };
  q.touch.run(Date.now(), a.id);
  return { token: newSession(a.id) };
}
function newSession(accountId) { const token = crypto.randomBytes(32).toString('base64url'); q.insSess.run(token, accountId, Date.now() + SESSION_MS); return token; }
export function accountForToken(token) { const r = q.getSess.get(String(token || ''), Date.now()); return r ? r.account_id : null; }
export function logout(token) { q.delSess.run(String(token || '')); }
export function loadCharacter(accountId) { const c = q.getChar.get(accountId); if (!c) return null; c.inventory = JSON.parse(c.inventory); c.equipment = JSON.parse(c.equipment); return c; }
export function saveCharacter(p) { q.saveChar.run(p.cls, p.level, p.exp, p.gold, p.align, p.kills, JSON.stringify(p.inv), JSON.stringify(p.equip), Date.now(), p.accountId); }
setInterval(() => q.purge.run(Date.now()), 3600_000).unref();
