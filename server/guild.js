// Guilds: persistent groups of adventurers. Members never fight each other, share a chat channel and a notice.
// Tables live in the main SQLite DB; membership is keyed by account so it survives logouts.
import { db } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  leader_account INTEGER NOT NULL,
  notice TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_members (
  account_id INTEGER PRIMARY KEY,
  guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  rank TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guild_members_guild ON guild_members(guild_id);
`);

const q = {
  byName: db.prepare('SELECT * FROM guilds WHERE name = ?'),
  byId: db.prepare('SELECT * FROM guilds WHERE id = ?'),
  memberOf: db.prepare('SELECT * FROM guild_members WHERE account_id = ?'),
  members: db.prepare('SELECT * FROM guild_members WHERE guild_id = ? ORDER BY rank = \'leader\' DESC, level DESC, name'),
  count: db.prepare('SELECT COUNT(*) AS n FROM guild_members WHERE guild_id = ?'),
  ins: db.prepare('INSERT INTO guilds (name, leader_account, created_at) VALUES (?, ?, ?)'),
  insMember: db.prepare('INSERT INTO guild_members (account_id, guild_id, name, level, rank, joined_at) VALUES (?, ?, ?, ?, ?, ?)'),
  delMember: db.prepare('DELETE FROM guild_members WHERE account_id = ?'),
  delGuild: db.prepare('DELETE FROM guilds WHERE id = ?'),
  setNotice: db.prepare('UPDATE guilds SET notice = ? WHERE id = ?'),
  setLeader: db.prepare('UPDATE guilds SET leader_account = ? WHERE id = ?'),
  setRank: db.prepare('UPDATE guild_members SET rank = ? WHERE account_id = ?'),
  touch: db.prepare('UPDATE guild_members SET level = ?, name = ? WHERE account_id = ?'),
  top: db.prepare('SELECT g.name, g.created_at, COUNT(m.account_id) AS members, SUM(m.level) AS power FROM guilds g LEFT JOIN guild_members m ON m.guild_id = g.id GROUP BY g.id ORDER BY power DESC LIMIT ?'),
};

export const GUILD_NAME_RE = /^[가-힣A-Za-z0-9_]{2,8}$/;
export const GUILD_COST = 3000, GUILD_LEVEL = 10, GUILD_MAX = 30;

export function createGuilds({ online, sys, sendTo, findPlayerByName, now, logEvent }) {
  // --- helpers
  const guildOf = p => { const m = q.memberOf.get(p.accountId); return m ? q.byId.get(m.guild_id) : null; };
  const onlineMembers = g => [...online.values()].filter(x => x.guildId === g.id);
  function info(g) {
    const members = q.members.all(g.id).map(m => { const on = online.get(m.account_id); return { name: m.name, level: on ? on.level : m.level, rank: m.rank, online: !!on, cls: on ? on.cls : '' }; });
    return { t: 'guild', id: g.id, name: g.name, notice: g.notice, leader: members.find(m => m.rank === 'leader')?.name || '', members, max: GUILD_MAX };
  }
  function push(g) { const i = info(g); for (const p of onlineMembers(g)) sendTo(p, i); }
  function chat(g, msg) { for (const p of onlineMembers(g)) sendTo(p, msg); }
  function attach(p) {   // called on login: restore guild id/name onto the entity
    const g = guildOf(p); p.guildId = g ? g.id : 0; p.guildName = g ? g.name : '';
    if (g) { q.touch.run(p.level, p.name, p.accountId); chat(g, { t: 'chat', sys: true, msg: `[길드] ${p.name}님이 접속했습니다.` }); push(g); }
  }
  function detach(p) { const g = p.guildId && q.byId.get(p.guildId); if (g) { q.touch.run(p.level, p.name, p.accountId); setTimeout(() => push(g), 50); } }
  function sameGuild(a, b) { return !!(a.guildId && a.guildId === b.guildId); }

  // --- commands
  function create(p, name) {
    if (p.guildId) return sys(p, '이미 길드에 속해 있습니다.');
    name = String(name || '').trim();
    if (!GUILD_NAME_RE.test(name)) return sys(p, '길드 이름은 한글·영문·숫자 2~8자로 지어주세요.');
    if (p.level < GUILD_LEVEL) return sys(p, `길드는 ${GUILD_LEVEL}레벨부터 만들 수 있습니다.`);
    if (p.gold < GUILD_COST) return sys(p, `길드 창설에는 금화 ${GUILD_COST}이 필요합니다.`);
    if (q.byName.get(name)) return sys(p, '이미 있는 길드 이름입니다.');
    p.gold -= GUILD_COST; p.saveDirty = true;
    const r = q.ins.run(name, p.accountId, now()); const id = Number(r.lastInsertRowid);
    q.insMember.run(p.accountId, id, p.name, p.level, 'leader', now());
    p.guildId = id; p.guildName = name; p.metaVer++; sendTo(p, { ...info(q.byId.get(id)), show: true });
    sys(p, `길드 「${name}」을(를) 창설했습니다. /길드 초대 이름 으로 동료를 부르세요.`); logEvent?.('guild', p.name, name, '창설');
    push(q.byId.get(id)); return true;
  }
  function invite(p, name) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId); if (!me || me.rank === 'member') return sys(p, '길드장이나 부길드장만 초대할 수 있습니다.');
    const t = findPlayerByName(name); if (!t) return sys(p, '그런 이름의 모험가가 접속해 있지 않습니다.');
    if (t === p) return sys(p, '자기 자신은 초대할 수 없습니다.');
    if (t.guildId) return sys(p, `${t.name}님은 이미 길드에 속해 있습니다.`);
    if (q.count.get(g.id).n >= GUILD_MAX) return sys(p, `길드 인원은 최대 ${GUILD_MAX}명입니다.`);
    t.guildInvite = { id: g.id, from: p.name, until: now() + 60000 };
    sendTo(t, { t: 'invite', kind: 'guild', from: p.name, id: p.id, guild: g.name }); sys(p, `${t.name}님에게 길드 초대를 보냈습니다.`);
  }
  function accept(p) {
    const inv = p.guildInvite; p.guildInvite = null;
    if (!inv || inv.until < now()) return sys(p, '유효한 길드 초대가 없습니다.');
    if (p.guildId) return sys(p, '이미 길드에 속해 있습니다.');
    const g = q.byId.get(inv.id); if (!g) return sys(p, '그 길드는 이미 해산되었습니다.');
    if (q.count.get(g.id).n >= GUILD_MAX) return sys(p, '길드가 가득 찼습니다.');
    q.insMember.run(p.accountId, g.id, p.name, p.level, 'member', now());
    p.guildId = g.id; p.guildName = g.name; p.metaVer++;
    chat(g, { t: 'chat', sys: true, msg: `[길드] ${p.name}님이 「${g.name}」에 가입했습니다.` }); push(g);
  }
  function leave(p) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId);
    if (me.rank === 'leader') { if (q.count.get(g.id).n > 1) return sys(p, '길드장은 먼저 /길드 위임 이름 으로 길드장을 넘기거나 /길드 해산 을 해야 합니다.'); return disband(p); }
    q.delMember.run(p.accountId); p.guildId = 0; p.guildName = ''; p.metaVer++;
    sys(p, `「${g.name}」을(를) 떠났습니다.`); sendTo(p, { t: 'guild', id: 0 });
    chat(g, { t: 'chat', sys: true, msg: `[길드] ${p.name}님이 길드를 떠났습니다.` }); push(g);
  }
  function kick(p, name) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId); if (me.rank === 'member') return sys(p, '길드장이나 부길드장만 내보낼 수 있습니다.');
    const m = q.members.all(g.id).find(x => x.name.toLowerCase() === String(name || '').toLowerCase()); if (!m) return sys(p, '길드에 그런 사람이 없습니다.');
    if (m.rank === 'leader') return sys(p, '길드장은 내보낼 수 없습니다.');
    q.delMember.run(m.account_id); const t = online.get(m.account_id); if (t) { t.guildId = 0; t.guildName = ''; t.metaVer++; sys(t, `「${g.name}」에서 내보내졌습니다.`); sendTo(t, { t: 'guild', id: 0 }); }
    chat(g, { t: 'chat', sys: true, msg: `[길드] ${m.name}님이 길드에서 나갔습니다.` }); push(g); logEvent?.('guild', p.name, m.name, '추방');
  }
  function promote(p, name, rank) {   // rank: 'officer' | 'member' | 'leader' (transfer)
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId); if (me.rank !== 'leader') return sys(p, '길드장만 할 수 있습니다.');
    const m = q.members.all(g.id).find(x => x.name.toLowerCase() === String(name || '').toLowerCase()); if (!m || m.account_id === p.accountId) return sys(p, '길드에 그런 사람이 없습니다.');
    if (rank === 'leader') { q.setRank.run('officer', p.accountId); q.setRank.run('leader', m.account_id); q.setLeader.run(m.account_id, g.id); chat(g, { t: 'chat', sys: true, msg: `[길드] ${m.name}님이 새 길드장이 되었습니다.` }); }
    else { q.setRank.run(rank, m.account_id); chat(g, { t: 'chat', sys: true, msg: `[길드] ${m.name}님이 ${rank === 'officer' ? '부길드장이 되었습니다' : '일반 길드원이 되었습니다'}.` }); }
    push(g);
  }
  function notice(p, text) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId); if (me.rank === 'member') return sys(p, '길드장이나 부길드장만 공지를 바꿀 수 있습니다.');
    q.setNotice.run(String(text || '').slice(0, 120), g.id); push(q.byId.get(g.id));
  }
  function disband(p) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    const me = q.memberOf.get(p.accountId); if (me.rank !== 'leader') return sys(p, '길드장만 해산할 수 있습니다.');
    for (const t of onlineMembers(g)) { t.guildId = 0; t.guildName = ''; t.metaVer++; sys(t, `길드 「${g.name}」이(가) 해산되었습니다.`); sendTo(t, { t: 'guild', id: 0 }); }
    q.delGuild.run(g.id); logEvent?.('guild', p.name, g.name, '해산'); return true;
  }
  function guildChat(p, text) {
    const g = p.guildId && q.byId.get(p.guildId); if (!g) return sys(p, '길드에 속해 있지 않습니다.');
    if (!text) return sys(p, '사용법: /길 내용');
    chat(g, { t: 'chat', guild: true, id: p.id, n: p.name, msg: text });
  }
  function show(p) { const g = p.guildId && q.byId.get(p.guildId); if (!g) return sendTo(p, { t: 'guild', id: 0, show: true }); sendTo(p, { ...info(g), show: true }); }
  function ranking(n = 10) { return q.top.all(n); }

  function command(p, args) {
    const [sub, ...rest] = args;
    switch (sub) {
      case '생성': case '창설': return create(p, rest[0]);
      case '초대': return invite(p, rest[0]);
      case '수락': return accept(p);
      case '탈퇴': case '나가기': return leave(p);
      case '추방': return kick(p, rest[0]);
      case '부길드장': return promote(p, rest[0], 'officer');
      case '강등': return promote(p, rest[0], 'member');
      case '위임': return promote(p, rest[0], 'leader');
      case '공지': return notice(p, rest.join(' '));
      case '해산': return disband(p);
      case '정보': return show(p);
      case '순위': { const rows = ranking(10); return sys(p, rows.length ? '길드 순위: ' + rows.map((r, i) => `${i + 1}. ${r.name}(${r.members}명, 합계 Lv${r.power})`).join(' · ') : '아직 길드가 없습니다.'); }
      default: return sys(p, '사용법: /길드 생성 이름 · 초대 이름 · 수락 · 탈퇴 · 추방 이름 · 부길드장 이름 · 강등 이름 · 위임 이름 · 공지 글 · 해산 · 정보 · 순위  (길드 채팅은 /길 내용)');
    }
  }
  return { attach, detach, sameGuild, command, guildChat, accept, show, ranking, guildOf };
}
