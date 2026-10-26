// Parties, trades, whispers and chat commands. Pure logic over the entity map; game.js wires the hooks.
import { ITEMS, INV_SIZE, itemName } from '../shared/rules.js';

export function createSocial({ ents, sys, sendTo, broadcastAll, findPlayerByName, isSafe, dist, invChanged, addItem, now }) {
  const parties = new Map(); let nextParty = 1;
  const PARTY_MAX = 5, SHARE_RANGE = 22;

  // ── parties
  function partyOf(p) { return p.partyId ? parties.get(p.partyId) : null; }
  function partyInfo(pt) { return { t: 'party', id: pt.id, leader: pt.leader, members: pt.members.filter(m => !m.dead || true).map(m => ({ id: m.id, name: m.name, level: m.level, cls: m.cls, hp: Math.ceil(m.hp), maxHp: m.maxHp, x: Math.round(m.x), y: Math.round(m.y), online: !!m.client })) }; }
  function pushParty(pt) { const info = partyInfo(pt); for (const m of pt.members) sendTo(m, info); }
  function leaveParty(p, silent) {
    const pt = partyOf(p); if (!pt) return;
    pt.members = pt.members.filter(m => m !== p); p.partyId = 0; sendTo(p, { t: 'party', id: 0, members: [] });
    if (!silent) for (const m of pt.members) sys(m, `${p.name}님이 파티를 떠났습니다.`);
    if (pt.members.length === 0) parties.delete(pt.id);
    else { if (pt.leader === p.id) { pt.leader = pt.members[0].id; sys(pt.members[0], '파티장이 되었습니다.'); } pushParty(pt); }
  }
  function invite(p, name) {
    const t = findPlayerByName(name); if (!t) return sys(p, '그런 이름의 모험가가 접속해 있지 않습니다.');
    if (t === p) return sys(p, '자기 자신은 초대할 수 없습니다.');
    if (t.partyId) return sys(p, `${t.name}님은 이미 다른 파티에 있습니다.`);
    let pt = partyOf(p);
    if (pt && pt.leader !== p.id) return sys(p, '파티장만 초대할 수 있습니다.');
    if (pt && pt.members.length >= PARTY_MAX) return sys(p, `파티는 최대 ${PARTY_MAX}명입니다.`);
    t.partyInvite = { from: p.id, until: now() + 60000 };
    sendTo(t, { t: 'invite', kind: 'party', from: p.name, id: p.id }); sys(p, `${t.name}님에게 파티 초대를 보냈습니다.`);
  }
  function accept(p) {
    const inv = p.partyInvite; p.partyInvite = null;
    if (!inv || inv.until < now()) return sys(p, '유효한 파티 초대가 없습니다.');
    const from = ents.get(inv.from); if (!from || from.kind !== 'player') return sys(p, '초대한 사람이 접속을 끊었습니다.');
    if (p.partyId) leaveParty(p);
    let pt = partyOf(from);
    if (!pt) { pt = { id: nextParty++, leader: from.id, members: [from] }; parties.set(pt.id, pt); from.partyId = pt.id; }
    if (pt.members.length >= PARTY_MAX) return sys(p, '파티가 가득 찼습니다.');
    pt.members.push(p); p.partyId = pt.id;
    for (const m of pt.members) sys(m, `${p.name}님이 파티에 들어왔습니다. (${pt.members.length}/${PARTY_MAX})`);
    pushParty(pt);
  }
  function kick(p, name) { const pt = partyOf(p); if (!pt || pt.leader !== p.id) return sys(p, '파티장만 내보낼 수 있습니다.'); const t = pt.members.find(m => m.name.toLowerCase() === name.toLowerCase()); if (!t || t === p) return sys(p, '파티에 그런 사람이 없습니다.'); sys(t, '파티에서 내보내졌습니다.'); leaveParty(t, true); for (const m of pt.members) sys(m, `${t.name}님이 파티에서 나갔습니다.`); }
  function sameParty(a, b) { return !!(a.partyId && a.partyId === b.partyId); }
  // exp sharing: everyone in range gets a share, with a small bonus for grouping
  function shareExp(killer, exp, gainExp) {
    const pt = partyOf(killer); if (!pt) { gainExp(killer, exp); return; }
    const near = pt.members.filter(m => !m.dead && m.client && dist(m, killer) <= SHARE_RANGE);
    if (near.length <= 1) { gainExp(killer, exp); return; }
    const bonus = 1 + (near.length - 1) * .1; const per = Math.max(1, Math.round(exp * bonus / near.length));
    for (const m of near) gainExp(m, per);
  }
  function partyChat(p, text) { const pt = partyOf(p); if (!pt) return sys(p, '파티에 속해 있지 않습니다.'); for (const m of pt.members) sendTo(m, { t: 'chat', party: true, id: p.id, n: p.name, msg: text }); }
  function onDisconnect(p) { const pt = partyOf(p); if (pt) { for (const m of pt.members) if (m !== p) sys(m, `${p.name}님의 연결이 끊어졌습니다.`); leaveParty(p, true); } cancelTrade(p, true); }

  // ── trades: both sides offer, both confirm, server swaps atomically
  const trades = new Map();   // id -> {a,b,offer:{[pid]:{items:[idx...],gold}},ok:{[pid]:bool}}
  let nextTrade = 1;
  function tradeOf(p) { return p.tradeId ? trades.get(p.tradeId) : null; }
  function tradeView(tr, forP) { const other = tr.a === forP ? tr.b : tr.a; const mk = (p) => ({ name: p.name, items: tr.offer[p.id].items.map(i => p.inv[i]).filter(Boolean), gold: tr.offer[p.id].gold, ok: !!tr.ok[p.id] }); return { t: 'trade', id: tr.id, me: mk(forP), them: mk(other), myIdx: tr.offer[forP.id].items }; }
  function pushTrade(tr) { sendTo(tr.a, tradeView(tr, tr.a)); sendTo(tr.b, tradeView(tr, tr.b)); }
  function tradeRequest(p, name) {
    const t = findPlayerByName(name); if (!t || t === p) return sys(p, '거래할 상대를 찾을 수 없습니다.');
    if (p.tradeId || t.tradeId) return sys(p, '이미 거래 중입니다.');
    if (dist(p, t) > 4) return sys(p, '거래하려면 서로 가까이 있어야 합니다.');
    t.tradeInvite = { from: p.id, until: now() + 30000 };
    sendTo(t, { t: 'invite', kind: 'trade', from: p.name, id: p.id }); sys(p, `${t.name}님에게 거래를 요청했습니다.`);
  }
  function tradeAccept(p) {
    const inv = p.tradeInvite; p.tradeInvite = null;
    if (!inv || inv.until < now()) return sys(p, '유효한 거래 요청이 없습니다.');
    const from = ents.get(inv.from); if (!from || from.kind !== 'player' || from.tradeId || p.tradeId) return sys(p, '거래를 시작할 수 없습니다.');
    if (dist(p, from) > 4) return sys(p, '상대가 너무 멉니다.');
    const tr = { id: nextTrade++, a: from, b: p, offer: { [from.id]: { items: [], gold: 0 }, [p.id]: { items: [], gold: 0 } }, ok: {} };
    trades.set(tr.id, tr); from.tradeId = tr.id; p.tradeId = tr.id; pushTrade(tr);
  }
  function tradeOffer(p, items, gold) {
    const tr = tradeOf(p); if (!tr) return;
    const idx = [...new Set((items || []).map(i => i | 0).filter(i => i >= 0 && i < p.inv.length))].slice(0, 8);
    gold = Math.max(0, Math.min(p.gold, Math.floor(+gold || 0)));
    tr.offer[p.id] = { items: idx, gold }; tr.ok = {}; pushTrade(tr);
  }
  function tradeConfirm(p) {
    const tr = tradeOf(p); if (!tr) return; tr.ok[p.id] = true;
    if (tr.ok[tr.a.id] && tr.ok[tr.b.id]) return finishTrade(tr); pushTrade(tr);
  }
  function finishTrade(tr) {
    const { a, b } = tr; const oa = tr.offer[a.id], ob = tr.offer[b.id];
    if (dist(a, b) > 5) { cancelTrade(a); return; }
    const ia = oa.items.map(i => a.inv[i]).filter(Boolean), ib = ob.items.map(i => b.inv[i]).filter(Boolean);
    if (ia.length !== oa.items.length || ib.length !== ob.items.length || a.gold < oa.gold || b.gold < ob.gold) { sys(a, '거래 내용이 바뀌어 취소되었습니다.'); sys(b, '거래 내용이 바뀌어 취소되었습니다.'); cancelTrade(a, true); return; }
    if (a.inv.length - ia.length + ib.length > INV_SIZE || b.inv.length - ib.length + ia.length > INV_SIZE) { sys(a, '가방 공간이 부족해 거래가 취소되었습니다.'); sys(b, '가방 공간이 부족해 거래가 취소되었습니다.'); cancelTrade(a, true); return; }
    a.inv = a.inv.filter(x => !ia.includes(x)); b.inv = b.inv.filter(x => !ib.includes(x));
    for (const it of ib) addItem(a, it); for (const it of ia) addItem(b, it);
    a.gold += ob.gold - oa.gold; b.gold += oa.gold - ob.gold;
    const desc = (items, g) => [...items.map(itemName), g ? `금화 ${g}` : ''].filter(Boolean).join(', ') || '없음';
    sys(a, `거래 완료 — 받음: ${desc(ib, ob.gold)} / 줌: ${desc(ia, oa.gold)}`); sys(b, `거래 완료 — 받음: ${desc(ia, oa.gold)} / 줌: ${desc(ib, ob.gold)}`);
    a.tradeId = 0; b.tradeId = 0; trades.delete(tr.id); invChanged(a); invChanged(b);
    sendTo(a, { t: 'trade', id: 0 }); sendTo(b, { t: 'trade', id: 0 });
    return { a: a.name, b: b.name, ia: ia.map(itemName), ib: ib.map(itemName), ga: oa.gold, gb: ob.gold };
  }
  function cancelTrade(p, silent) { const tr = tradeOf(p); if (!tr) return; for (const x of [tr.a, tr.b]) { x.tradeId = 0; sendTo(x, { t: 'trade', id: 0 }); if (!silent && x !== p) sys(x, `${p.name}님이 거래를 취소했습니다.`); } trades.delete(tr.id); }

  // ── whispers
  function whisper(p, name, text) { const t = findPlayerByName(name); if (!t) return sys(p, '그런 이름의 모험가가 접속해 있지 않습니다.'); sendTo(t, { t: 'chat', whisper: true, id: p.id, n: p.name, msg: text }); sendTo(p, { t: 'chat', whisper: true, to: t.name, id: p.id, n: p.name, msg: text }); }

  return { partyOf, invite, accept, leaveParty, kick, sameParty, shareExp, partyChat, onDisconnect, tradeRequest, tradeAccept, tradeOffer, tradeConfirm, cancelTrade, whisper, parties };
}
