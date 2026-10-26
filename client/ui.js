// Windows: inventory, equipment, character, NPC services. Everything here only *requests* actions; the server decides.
import { TITLES, TITLE_BY, ITEMS, SLOTS, SLOT_NAME, INV_SIZE, CLASSES, CLASS_LEVEL, ADV, ADV_LEVEL, ADV_OF, classInfo, ENH_RATE, enhCost, sellPrice, itemName, itemDesc, statsFor, QUESTS, BANK_SIZE } from '/shared/rules.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── icons: baked 3D icons where available, painted icons otherwise
const ICON_CACHE = {};
function painted(key) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
  const path = (pts, fill, stroke) => { g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach(p => g.lineTo(...p)); g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); } };
  const metal = lin(14, 10, 50, 54, [[0, '#e4e8ee'], [.5, '#9aa2ad'], [1, '#5c636e']]);
  switch (key) {
    case 'armor': path([[18, 12], [26, 9], [32, 14], [38, 9], [46, 12], [52, 22], [46, 26], [46, 54], [18, 54], [18, 26], [12, 22]], lin(12, 9, 52, 54, [[0, '#a07850'], [.6, '#7a5636'], [1, '#4a3420']]), '#2a1c10'); g.strokeStyle = 'rgba(30,18,8,.6)'; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 52); g.moveTo(20, 34); g.lineTo(44, 34); g.stroke(); g.setLineDash([]); break;
    case 'helmet': path([[14, 40], [14, 26], [20, 14], [32, 10], [44, 14], [50, 26], [50, 40], [40, 40], [40, 30], [24, 30], [24, 40]], metal, '#2a2e36'); path([[24, 30], [40, 30], [40, 34], [24, 34]], '#1a1c22'); g.fillStyle = '#9a2a24'; g.fillRect(30, 4, 4, 10); break;
    case 'boots': path([[18, 10], [32, 10], [32, 40], [50, 44], [52, 54], [16, 54], [18, 40]], lin(16, 10, 52, 54, [[0, '#8a6a46'], [1, '#3e2a18']]), '#1e140a'); g.fillStyle = '#1e140a'; g.fillRect(16, 51, 37, 4); break;
    case 'gloves': path([[16, 54], [16, 28], [20, 14], [26, 14], [26, 28], [28, 10], [34, 10], [34, 28], [36, 12], [42, 12], [42, 30], [46, 22], [52, 26], [44, 44], [44, 54]], lin(16, 10, 50, 54, [[0, '#a07850'], [1, '#4a3420']]), '#2a1c10'); break;
    case 'ring': g.strokeStyle = lin(12, 20, 52, 56, [[0, '#f0f0f6'], [1, '#8a8a96']]); g.lineWidth = 7; g.beginPath(); g.ellipse(32, 38, 16, 14, 0, 0, 7); g.stroke(); path([[26, 16], [38, 16], [42, 22], [32, 30], [22, 22]], lin(22, 16, 42, 30, [[0, '#9ae0ff'], [1, '#2a70b0']]), '#164060'); break;
    case 'potion_red': case 'potion_blue': { const c1 = key === 'potion_red' ? ['#ff8a7a', '#c0302a', '#601410'] : ['#8ac0ff', '#2d6cb3', '#102c58']; path([[27, 8], [37, 8], [37, 22], [50, 38], [48, 56], [16, 56], [14, 38], [27, 22]], lin(14, 20, 50, 56, [[0, c1[0]], [.5, c1[1]], [1, c1[2]]]), '#1a1a22'); g.fillStyle = '#7a5a34'; g.fillRect(26, 4, 12, 8); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(24, 40, 3, 8, .3, 0, 7); g.fill(); break; }
    case 'scroll': path([[12, 16], [52, 16], [52, 48], [12, 48]], lin(12, 16, 52, 48, [[0, '#f2e4c0'], [1, '#c8b080']]), '#6a5030'); g.fillStyle = '#8a6a40'; g.fillRect(8, 12, 48, 6); g.fillRect(8, 46, 48, 6); g.fillStyle = '#5a4020'; for (let i = 0; i < 4; i++) g.fillRect(18, 24 + i * 5, 28 - (i % 2) * 8, 2); g.fillStyle = '#a02a24'; g.beginPath(); g.arc(44, 40, 4, 0, 7); g.fill(); break;
    case 'bone': g.strokeStyle = '#e8e2d0'; g.lineWidth = 7; g.beginPath(); g.moveTo(16, 48); g.lineTo(48, 16); g.stroke(); for (const [x, y] of [[13, 46], [18, 51], [46, 13], [51, 18]]) { g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(20, 47); g.lineTo(47, 20); g.stroke(); break;
    case 'iron': path([[12, 40], [22, 22], [44, 18], [54, 32], [44, 48], [22, 50]], lin(12, 18, 54, 50, [[0, '#9a8a7a'], [.5, '#6a5a4c'], [1, '#3a3028']]), '#20180e'); g.fillStyle = 'rgba(160,80,30,.6)'; g.beginPath(); g.arc(28, 34, 5, 0, 7); g.arc(40, 40, 3, 0, 7); g.fill(); break;
    case 'cloth': path([[10, 18], [54, 12], [50, 30], [56, 50], [14, 54], [18, 34]], lin(10, 12, 56, 54, [[0, '#6a4a8a'], [1, '#2a1a3a']]), '#140a1e'); g.strokeStyle = 'rgba(160,255,160,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 24); g.quadraticCurveTo(32, 40, 46, 22); g.stroke(); break;
    case 'gem': path([[32, 6], [52, 26], [32, 58], [12, 26]], lin(12, 6, 52, 58, [[0, '#c8a0ff'], [.5, '#7a40d0'], [1, '#2a1060']]), '#1a0840'); path([[32, 6], [40, 26], [32, 58], [24, 26]], 'rgba(255,255,255,.18)'); break;
    case 'gold': for (const [x, y] of [[22, 44], [36, 46], [28, 36], [42, 36], [32, 28]]) { g.fillStyle = lin(x - 8, y - 4, x + 8, y + 4, [[0, '#ffe08a'], [1, '#a07820']]); g.beginPath(); g.ellipse(x, y, 9, 5, 0, 0, 7); g.fill(); g.strokeStyle = '#6a4a10'; g.lineWidth = 1; g.stroke(); } break;
    default: g.fillStyle = '#555'; g.fillRect(16, 16, 32, 32);
  }
  return c.toDataURL();
}
export function iconSrc(MF, key) { if (ICON_CACHE[key]) return ICON_CACHE[key]; const baked = MF.icons && MF.icons[key]; ICON_CACHE[key] = baked ? '/assets/sprites/' + baked : painted(key); return ICON_CACHE[key]; }
const itemIcon = (MF, id) => iconSrc(MF, ITEMS[id] ? ITEMS[id].icon : 'gold');

// ── window manager
export function createUI({ MF, send, log }) {
  const state = { inv: [], equip: {}, gold: 0, me: null, npc: null, npcTab: null, selInv: -1, selEq: null, selEnh: null, quests: [], trade: null, tsel: [], tgold: 0, board: [], guild: null, titles: null };
  const wins = {};
  let z = 20;
  function makeWin(key, title, css) {
    const w = document.createElement('div'); w.className = 'win'; w.id = 'win_' + key; w.hidden = true; if (css) Object.assign(w.style, css);
    w.innerHTML = `<div class="wh"><span class="wt">${title}</span><button class="wx" aria-label="닫기">✕</button></div><div class="wb"></div>`;
    document.body.appendChild(w); wins[key] = w;
    w.querySelector('.wx').onclick = () => hide(key); w.addEventListener('pointerdown', () => { w.style.zIndex = ++z; });
    const h = w.querySelector('.wh'); let drag = null;
    h.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = w.getBoundingClientRect(); drag = [e.clientX - r.left, e.clientY - r.top]; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', e => { if (!drag) return; Object.assign(w.style, { left: Math.max(0, Math.min(innerWidth - 80, e.clientX - drag[0])) + 'px', top: Math.max(0, Math.min(innerHeight - 40, e.clientY - drag[1])) + 'px', right: 'auto', bottom: 'auto', transform: 'none' }); });
    h.addEventListener('pointerup', () => drag = null);
    w.querySelector('.wb').addEventListener('click', e => onClick(key, e)); w.querySelector('.wb').addEventListener('dblclick', e => onDbl(key, e));
    return w;
  }
  makeWin('inv', '가방', { right: '16px', top: '200px' }); makeWin('eq', '장비', { left: '16px', top: '220px' }); makeWin('char', '캐릭터', { left: '350px', top: '220px' });
  makeWin('npc', '', { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(500px, calc(100vw - 32px))' });
  makeWin('quest', '의뢰', { right: '16px', top: '200px', width: 'min(380px, calc(100vw - 32px))' });
  makeWin('trade', '거래', { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(520px, calc(100vw - 32px))' });
  makeWin('guild', '길드', { right: '16px', top: '200px', width: 'min(400px, calc(100vw - 32px))' });
  makeWin('board', '순위표', { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 32px))' });
  const body = k => wins[k].querySelector('.wb');
  const show = k => { wins[k].hidden = false; wins[k].style.zIndex = ++z; render(k); };
  const hide = k => { wins[k].hidden = true; if (k === 'npc') { state.npc = null; send({ t: 'npcclose' }); } if (k === 'trade' && state.trade) { send({ t: 'tcancel' }); state.trade = null; } };
  const toggle = k => wins[k].hidden ? show(k) : hide(k);
  const anyOpen = () => Object.values(wins).some(w => !w.hidden);
  const closeAll = () => Object.keys(wins).forEach(hide);

  const slot = (id, n, enh, attrs, sel) => id ? `<div class="slot${sel ? ' sel' : ''}" ${attrs}><img src="${itemIcon(MF, id)}" alt="" draggable="false">${n > 1 ? `<span class="n">${n}</span>` : ''}${enh ? `<span class="plus">+${enh}</span>` : ''}</div>` : `<div class="slot empty" ${attrs}></div>`;
  const detail = (it, actions) => `<div class="detail"><img src="${itemIcon(MF, it.id)}" alt=""><div class="dt"><div class="dn">${esc(itemName(it))}${it.n > 1 ? ` <span class="ds">×${it.n}</span>` : ''}</div><div class="dd">${itemDesc(it)}</div><div class="dd">판매가 ${sellPrice(it)} G</div></div><div class="da">${actions}</div></div>`;
  const hint = t => `<div class="detail hint">${t}</div>`;
  const statsLine = () => { const m = state.me; return m ? `<div class="stats"><span>공격 <b>${m[8]}</b></span><span>방어 <b>${m[9]}</b></span><span>금화 <b>${state.gold}</b></span></div>` : ''; };
  const QBY = Object.fromEntries(QUESTS.map(q => [q.id, q]));
  const questRow = (q, st, prog, withBtn) => { const r = q.reward; const rw = `보상: 금화 ${r.gold}${r.exp ? ' · 경험치 ' + r.exp : ''}${r.items ? ' · ' + Object.entries(r.items).map(([k, v]) => ITEMS[k].name + (v > 1 ? ' ×' + v : '')).join(', ') : ''}`;
    let act = ''; if (withBtn) { if (st === 'avail') act = `<button class="btn" data-act="qaccept" data-q="${q.id}">수락</button>`; else if (st === 'active') act = prog >= q.n ? `<button class="btn" data-act="qdone" data-q="${q.id}">완료</button>` : `<span class="ds">${prog}/${q.n}</span>`; else if (st === 'done') act = q.daily ? '<span class="ds">내일 다시</span>' : '<span class="ds">완료됨</span>'; else act = `<span class="ds">Lv ${q.lvl} 필요</span>`; }
    else act = st === 'active' ? `<span class="ds ${prog >= q.n ? 'ok' : ''}">${prog >= q.n ? '완료 가능' : prog + '/' + q.n}</span>` : '';
    const mark = st === 'done' ? '✓' : st === 'active' ? (prog >= q.n ? '?' : '…') : '!';
    return `<div class="row q"><div class="qi">${mark}</div><div><div class="nm">${q.title}</div><div class="ds">${q.desc}</div><div class="ds gold">${rw}</div></div><div class="pr">${act}</div></div>`; };

  function render(k) {
    const w = wins[k]; if (!w || w.hidden) return; const body = w.querySelector('.wb'); const title = w.querySelector('.wt');
    if (k === 'inv') {
      let g = ''; for (let i = 0; i < INV_SIZE; i++) { const it = state.inv[i]; g += slot(it && it.id, it && it.n, it && it.enh, `data-i="${i}"`, i === state.selInv); }
      const it = state.inv[state.selInv]; let det = hint('아이템을 누르면 설명이 보이고, 두 번 누르면 사용하거나 장착합니다.');
      if (it) { const b = ITEMS[it.id]; let a = ''; if (SLOTS.includes(b.type)) a += `<button class="btn" data-act="equip">장착</button>`; else if (b.type === 'potion' || b.type === 'scroll') a += `<button class="btn" data-act="use">사용</button>`; if (state.npc && state.npc.shop) a += `<button class="btn" data-act="sell">판매</button>`; a += `<button class="btn" data-act="drop">버리기</button>`; det = detail(it, a); }
      body.innerHTML = `<div class="grid">${g}</div>${det}<div class="wfoot"><span>${state.inv.length} / ${INV_SIZE}칸</span><span class="gold">금화 ${state.gold}</span></div>`;
    } else if (k === 'eq') {
      const layout = [null, 'helmet', null, 'weapon', 'armor', 'shield', 'gloves', 'boots', 'ring'];
      const g = layout.map(s => s ? `<div class="eqcell"><span class="sl">${SLOT_NAME[s]}</span>${slot(state.equip[s] && state.equip[s].id, 1, state.equip[s] && state.equip[s].enh, `data-slot="${s}"`, state.selEq === s)}</div>` : '<div></div>').join('');
      const it = state.equip[state.selEq]; const det = it ? detail({ ...it, n: 1 }, `<button class="btn" data-act="unequip">해제</button>`) : hint('장비 칸을 누르면 설명이 보이고, 두 번 누르면 해제합니다.');
      const m = state.me; body.innerHTML = `<div class="eqgrid">${g}</div>${det}<div class="wfoot"><span>공격 ${m ? m[8] : '-'}</span><span>방어 ${m ? m[9] : '-'}</span><span>공격속도 ${m ? (1000 / m[15]).toFixed(2) : '-'}/초</span></div>`;
    } else if (k === 'char') {
      const m = state.me; if (!m) return; const c = classInfo(m[11]);
      const row = (a, b) => `<div class="cr"><span>${a}</span><b>${b}</b></div>`;
      body.innerHTML = `<div class="cgrid">${row('직업', c.name)}${row('레벨', m[4])}${row('경험치', `${m[5]} / ${m[6]}`)}${row('체력', `${m[0]} / ${m[1]}`)}${row('마나', `${m[2]} / ${m[3]}`)}${row('공격력', m[8])}${row('방어력', m[9])}${row('공격속도', (1000 / m[15]).toFixed(2) + '/초')}${row('사거리', m[16] > 2 ? m[16] + '칸 (원거리)' : '근접')}${row('기술', c.skill ? c.skill.name + (c.skill2 ? ' · ' + c.skill2.name : '') : '없음')}${row('성향', m[10] < 0 ? `카오틱 ${m[10]}` : m[10])}${row('처치한 모험가', m[17])}${state.titles ? row('처치한 몬스터', state.titles.stats.mkills) + row('보스 처치', state.titles.stats.bossKills) + row('습격 격퇴', state.titles.stats.raids) + row('쓰러진 횟수', state.titles.stats.deaths) : ''}</div>${state.titles ? `<div class="qh" style="margin-top:10px">칭호</div><div class="titles">${TITLES.map(t => { const have = state.titles.have.includes(t.id); return `<button class="btn tt${state.titles.cur === t.id ? ' on' : ''}" data-title="${t.id}" ${have ? '' : 'disabled'} title="${t.desc}">${t.name || '없음'}</button>`; }).join('')}</div>` : ''}${m[11] === 'commoner' ? `<p class="say">레벨 ${CLASS_LEVEL}이 되면 기사단·마법사 탑·예배당·여관의 스승에게 전직할 수 있습니다.</p>` : ADV_OF[m[11]] ? `<p class="say">레벨 ${ADV_LEVEL}이 되면 같은 스승에게 ${ADV[ADV_OF[m[11]]].name}(으)로 승급할 수 있습니다.</p>` : ''}`;
    } else if (k === 'trade') {
      const tr = state.trade; if (!tr) { body.innerHTML = hint('거래 중이 아닙니다.'); return; }
      const side = (o, mine) => `<div class="tside${o.ok ? ' ok' : ''}"><div class="qh">${esc(o.name)}${o.ok ? ' ✓ 확인함' : ''}</div><div class="grid t">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const it = o.items[i]; return it ? slot(it.id, it.n, it.enh, '', false) : '<div class="slot empty"></div>'; }).join('')}</div><div class="ds">금화 <b class="gold">${o.gold}</b></div></div>`;
      const mine = state.inv.map((it, i) => ({ it, i })).filter(x => !tr.myIdx.includes(x.i));
      body.innerHTML = `<div class="trade2">${side(tr.me, true)}${side(tr.them, false)}</div>
        <div class="qh" style="margin-top:8px">내 가방 <span class="ds">(누르면 거래 칸에 올림)</span></div><div class="grid">${mine.map(x => slot(x.it.id, x.it.n, x.it.enh, `data-toffer="${x.i}"`, false)).join('') || '<div class="ds">올릴 물건이 없습니다.</div>'}</div>
        <div class="bankgold"><span>내 금화 <b>${state.gold}</b></span><input type="number" id="tradeGold" min="0" value="${tr.me.gold}" placeholder="금화"><button class="btn" data-act="tgold">금화 올리기</button><button class="btn" data-act="tclear">내리기</button><span style="flex:1"></span><button class="btn" data-act="tconfirm" ${tr.me.ok ? 'disabled' : ''}>확인</button><button class="btn" data-act="tcancel">취소</button></div>
        <p class="ds" style="margin:8px 0 0">양쪽이 모두 확인을 누르면 교환됩니다. 상대가 내용을 바꾸면 확인이 풀립니다.</p>`;
    } else if (k === 'board') {
      body.innerHTML = `<table class="board"><tr><th>#</th><th>이름</th><th>레벨</th><th>직업</th><th>처치</th><th>성향</th></tr>${state.board.map((r, i) => `<tr class="${r.online ? 'on' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.online ? ' <span class="ds">접속</span>' : ''}</td><td>${r.level}</td><td>${classInfo(r.cls).name}</td><td>${r.kills}</td><td class="${r.align < 0 ? 'no' : ''}">${r.align}</td></tr>`).join('')}</table>${(state.gboard || []).length ? `<div class="qh" style="margin-top:10px">길드 순위</div><table class="board"><tr><th>#</th><th>길드</th><th>인원</th><th>합계 레벨</th></tr>${state.gboard.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.name)}</td><td>${g.members}</td><td>${g.power || 0}</td></tr>`).join('')}</table>` : ''}`;
    } else if (k === 'guild') {
      const g = state.guild; const RANK = { leader: '길드장', officer: '부길드장', member: '길드원' };
      if (!g) { body.innerHTML = hint('길드에 속해 있지 않습니다.') + `<p>길드는 10레벨부터 금화 3,000으로 만들 수 있습니다. 길드원끼리는 서로 공격할 수 없고, <b>/길 내용</b>으로 길드 채팅을 합니다.</p><div class="row"><input id="gname" class="in" placeholder="길드 이름 (2~8자)" maxlength="8"><button class="btn" data-g="생성">창설</button></div>`; title.textContent = '길드'; return; }
      title.textContent = `길드 「${esc(g.name)}」`;
      body.innerHTML = `<div class="gnotice">${g.notice ? esc(g.notice) : '<span class="ds">공지가 없습니다.</span>'}</div><table class="board"><tr><th>이름</th><th>레벨</th><th>직급</th><th></th></tr>${g.members.map(m => `<tr class="${m.online ? 'on' : ''}"><td>${esc(m.name)}</td><td>${m.level}</td><td>${RANK[m.rank] || m.rank}</td><td>${m.online ? '<span class="ds">접속</span>' : ''}</td></tr>`).join('')}</table><div class="wfoot"><span>${g.members.length} / ${g.max}명 · 길드장 ${esc(g.leader)}</span><button class="btn" data-g="탈퇴">탈퇴</button></div><div class="row"><input id="gnotice" class="in" placeholder="공지 바꾸기 (길드장·부길드장)" maxlength="120"><button class="btn" data-g="공지">공지</button></div>`;
    } else if (k === 'quest') {
      const act = state.quests.filter(x => x.st === 'active'); const done = state.quests.filter(x => x.st === 'done' && !QBY[x.id].daily).length;
      body.innerHTML = (act.length ? act.map(x => questRow(QBY[x.id], x.st, x.prog, false)).join('') : hint('진행 중인 의뢰가 없습니다. 상인·경비병·스승의 머리 위에 ! 표시가 있으면 말을 걸어 보세요.')) + `<div class="wfoot"><span>완료한 의뢰 ${done} / ${QUESTS.filter(q => !q.daily).length} · 매일 현상금은 경비병·기사단·마법사 탑에서</span></div>`;
    } else if (k === 'npc') {
      const n = state.npc; if (!n) return; title.textContent = n.name; const tabs = [];
      if (n.quests && n.quests.length) tabs.push(['quest', '의뢰']); if (n.bank) tabs.push(['bank', '창고']);
      if (n.shop) tabs.push(['buy', '구매'], ['sell', '판매']); if (n.market) tabs.push(['market', '장터']); if (n.craft) tabs.push(['craft', '제작']); if (n.enhance) tabs.push(['enh', '강화']); if (n.rest) tabs.push(['rest', '휴식']);
      if (n.master) { tabs.push(['job', '전직']); if (ADV_OF[n.master]) tabs.push(['adv', '승급']); } if (n.atone) tabs.push(['atone', '속죄']);
      if (!state.npcTab || !tabs.some(t => t[0] === state.npcTab)) state.npcTab = tabs[0] ? tabs[0][0] : null;
      let h = statsLine() + (tabs.length > 1 ? `<div class="tabs">${tabs.map(([k2, l]) => `<button class="btn${state.npcTab === k2 ? ' on' : ''}" data-tab="${k2}">${l}</button>`).join('')}</div>` : '');
      const T = state.npcTab;
      if (T === 'quest') h += `<div class="qsec">${n.quests.map(x => questRow(QBY[x.id], x.st, x.prog, true)).join('')}</div>`;
      else if (T === 'bank') {
        const g = (ids, src, n2) => { let hh = ''; const len = Math.max(n2, Math.ceil((ids.length + 1) / 6) * 6); for (let i = 0; i < len; i++) { const it = ids[i]; hh += it ? `<div class="slot" data-bank="${src}" data-i="${i}" data-id="${it.id}"><img src="${itemIcon(MF, it.id)}" alt="" draggable="false">${it.n > 1 ? `<span class="n">${it.n}</span>` : ''}${it.enh ? `<span class="plus">+${it.enh}</span>` : ''}</div>` : '<div class="slot empty"></div>'; } return `<div class="grid">${hh}</div>`; };
        h += `<p class="say">"맡긴 물건은 안전합니다. 칸을 누르면 통째로 옮깁니다."</p><div class="qh">창고 <span class="ds">(${n.bankItems.length}/${BANK_SIZE})</span></div>${g(n.bankItems, 'bank', 12)}<div class="qh" style="margin-top:8px">가방</div>${g(state.inv, 'inv', 6)}<div class="bankgold"><span>창고 금화 <b>${n.bankGold}</b></span><span>소지 금화 <b>${state.gold}</b></span><input type="number" id="bankAmt" min="1" placeholder="금액" inputmode="numeric"><button class="btn" data-act="bdep">입금</button><button class="btn" data-act="bwd">출금</button><button class="btn" data-act="bdepall">전부 입금</button></div>`;
      }
      else if (T === 'market') {
        const rows = (n.market || []).map(r => `<div class="row"><img class="ri" src="${itemIcon(MF, r.item.id)}" alt=""><div><div class="nm">${esc(itemName(r.item))}${r.item.n > 1 ? ` <span class="ds">×${r.item.n}</span>` : ''}</div><div class="ds">${itemDesc(r.item)} · ${esc(r.seller)}</div></div><div class="pr">${r.price} G${r.mine ? `<button class="btn" data-act="mcancel" data-id="${r.id}">취소</button>` : `<button class="btn" data-act="mbuy" data-id="${r.id}" ${state.gold < r.price ? 'disabled' : ''}>구매</button>`}</div></div>`).join('');
        const opts = state.inv.map((it, i) => `<option value="${i}">${esc(itemName(it))}${it.n > 1 ? ' ×' + it.n : ''}</option>`).join('');
        h += `<p class="say">"모험가들끼리 사고파는 장터예요. 팔리면 5%는 제 몫이에요. 묶음 물건은 묶음째 올라가요."</p><div class="bankgold"><select id="mItem" class="in">${opts || '<option value="-1">가방이 비었습니다</option>'}</select><input type="number" id="mPrice" min="10" placeholder="가격" inputmode="numeric" style="width:90px"><button class="btn" data-act="mlist">올리기</button></div><div class="qh" style="margin-top:10px">장터 물건 <span class="ds">(${(n.market || []).length})</span></div>${rows || '<p class="say">아직 올라온 물건이 없습니다.</p>'}`;
      }
      else if (n.guard && !T) h += `<p class="say">"성 안에서는 칼을 뽑지 마시오. 성문 밖은 그대의 책임이오. 해골들은 남쪽 강가와 북서쪽 황야로 갈수록 강해지오."</p>`;
      else if (T === 'buy') h += n.shop.map(id => { const b = ITEMS[id]; return `<div class="row"><img class="ri" src="${itemIcon(MF, id)}" alt=""><div><div class="nm">${b.name}</div><div class="ds">${itemDesc({ id })}</div></div><div class="pr">${b.price} G<button class="btn" data-act="buy" data-id="${id}" ${state.gold < b.price ? 'disabled' : ''}>구매</button>${b.stack ? `<button class="btn" data-act="buy10" data-id="${id}" ${state.gold < b.price * 10 ? 'disabled' : ''}>×10</button>` : ''}</div></div>`; }).join('');
      else if (T === 'sell') h += state.inv.map((it, i) => `<div class="row"><img class="ri" src="${itemIcon(MF, it.id)}" alt=""><div><div class="nm">${esc(itemName(it))}${it.n > 1 ? ` <span class="ds">×${it.n}</span>` : ''}</div><div class="ds">${itemDesc(it)}</div></div><div class="pr">${sellPrice(it)} G<button class="btn" data-act="sellone" data-i="${i}">판매</button>${it.n > 1 ? `<button class="btn" data-act="sellall" data-i="${i}">전부</button>` : ''}</div></div>`).join('') || '<p class="say">팔 물건이 없습니다.</p>';
      else if (T === 'craft') h += `<p class="say">"재료를 가져오면 좋은 걸 벼려 주지."</p>` + n.craft.map(id => { const b = ITEMS[id]; let ok = true; const need = Object.entries(b.craft).map(([k2, v]) => { const have = k2 === 'gold' ? state.gold : state.inv.filter(x => x.id === k2).reduce((a, x) => a + x.n, 0); if (have < v) ok = false; return `<b class="${have >= v ? 'ok' : 'no'}">${k2 === 'gold' ? '금화' : ITEMS[k2].name} ${k2 === 'gold' ? v : have + '/' + v}</b>`; }).join(' · '); return `<div class="row"><img class="ri" src="${itemIcon(MF, id)}" alt=""><div><div class="nm">${b.name}</div><div class="ds">${itemDesc({ id })}</div><div class="need">${need}</div></div><div class="pr"><button class="btn" data-act="craft" data-id="${id}" ${ok ? '' : 'disabled'}>제작</button></div></div>`; }).join('');
      else if (T === 'enh') {
        const list = SLOTS.filter(s => state.equip[s]).map(s => ({ it: state.equip[s], src: 'eq', key: 'eq:' + s })).concat(state.inv.map((it, i) => ({ it, src: 'inv', i, key: 'inv:' + i })).filter(x => SLOTS.includes(ITEMS[x.it.id].type)));
        h += `<p class="say">"+4부터는 실패하면 한 단계 깎인다. 각오하고 올려라."</p><div class="grid">${list.map(x => slot(x.it.id, 1, x.it.enh, `data-enh="${x.key}"`, state.selEnh === x.key)).join('')}</div>`;
        const sel = list.find(x => x.key === state.selEnh);
        if (sel) { const e = sel.it.enh || 0; const cost = enhCost(sel.it); h += detail({ ...sel.it, n: 1 }, e >= 9 ? '<span class="ds">최대 강화</span>' : `<div class="ds">성공 ${ENH_RATE[e]}%<br>${cost} G</div><button class="btn" data-act="enh" ${state.gold < cost ? 'disabled' : ''}>강화</button>`); }
        else h += hint(list.length ? '강화할 장비를 고르세요. 착용 중인 장비도 강화할 수 있습니다.' : '강화할 장비가 없습니다.');
      }
      else if (T === 'rest') h += `<p class="say">"난로 옆 자리가 비었어요. 하룻밤 묵으면 기운이 돌아올 거예요."</p><div class="row"><img class="ri" src="${iconSrc(MF, 'potion_red')}" alt=""><div><div class="nm">하룻밤 휴식</div><div class="ds">HP · MP 전부 회복</div></div><div class="pr">${n.rest} G<button class="btn" data-act="rest" ${state.gold < n.rest ? 'disabled' : ''}>휴식</button></div></div>`;
      else if (T === 'job') {
        const c = CLASSES[n.master]; const m = state.me; const s10 = statsFor(CLASS_LEVEL, n.master), s10c = statsFor(CLASS_LEVEL, 'commoner');
        let btn = m[11] === n.master ? '<span class="ds">이미 이 길을 걷고 있습니다</span>' : m[11] !== 'commoner' ? '<span class="ds">이미 다른 길을 걷고 있습니다</span>' : m[4] < CLASS_LEVEL ? `<span class="ds">레벨 ${CLASS_LEVEL} 필요 (현재 ${m[4]})</span>` : `<button class="btn" data-act="job">전직</button>`;
        h += `<p class="say">${c.master}: "${c.desc}"</p><div class="row"><div class="ic">${c.name[0]}</div><div><div class="nm">${c.name}</div><div class="ds">전직 즉시 HP ${s10.maxHp - s10c.maxHp >= 0 ? '+' : ''}${s10.maxHp - s10c.maxHp} · MP +${s10.maxMp - s10c.maxMp} · 공격 +${s10.atk - s10c.atk} · 방어 +${s10.def - s10c.def}${c.ranged ? ' · 원거리 공격' : ''}${c.aspd ? ' · 공격속도 +25%' : ''}</div><div class="need">기술 <b class="ok">${c.skill.name}</b> — ${c.skill.desc} (MP ${c.skill.mp}, ${c.skill.cd / 1000}초)</div></div><div class="pr">${btn}</div></div>`;
      }
      else if (T === 'adv') {
        const advId = ADV_OF[n.master]; const a = ADV[advId]; const m = state.me;
        let btn = m[11] === advId ? '<span class="ds">이미 승급했습니다</span>' : m[11] !== n.master ? `<span class="ds">${CLASSES[n.master].name}만 승급할 수 있습니다</span>` : m[4] < ADV_LEVEL ? `<span class="ds">레벨 ${ADV_LEVEL} 필요 (현재 ${m[4]})</span>` : `<button class="btn" data-act="advance">승급</button>`;
        h += `<p class="say">${a.master}: "${a.desc}"</p><div class="row"><div class="ic">${a.name[0]}</div><div><div class="nm">${a.name} <span class="ds">(2차 전직)</span></div><div class="ds">승급 즉시 ${Object.entries(a.bonus).map(([k2, v]) => ({ hp: 'HP', mp: 'MP', atk: '공격', def: '방어' }[k2]) + ' +' + v).join(' · ')}${a.dmg ? ` · 피해 ×${a.dmg}` : ''}${a.aspd ? ' · 공격속도 +40%' : ''}</div><div class="need">기술 <b class="ok">${a.skill2.name}</b> — ${a.skill2.desc} (MP ${a.skill2.mp}, ${a.skill2.cd / 1000}초, D 키)</div></div><div class="pr">${btn}</div></div>`;
      }
      else if (T === 'atone') { const m = state.me; const cost = Math.max(0, -m[10]) * 150; h += `<p class="say">"성벽 밖에서 흘린 피는 영혼에 남습니다. 헌금으로 죄를 씻을 수 있습니다."</p><div class="row"><div class="ic">속</div><div><div class="nm">속죄</div><div class="ds">성향을 0으로 되돌립니다 (현재 ${m[10]})</div></div><div class="pr">${cost} G<button class="btn" data-act="atone" ${m[10] >= 0 || state.gold < cost ? 'disabled' : ''}>헌금</button></div></div>`; }
      body.innerHTML = h;
    }
  }
  function onClick(k, e) {
    const tb = e.target.closest('[data-title]'); if (tb && k === 'char') { send({ t: 'title', id: tb.dataset.title }); return; }
    const gb = e.target.closest('[data-g]'); if (gb && k === 'guild') { const a = gb.dataset.g; if (a === '생성') send({ t: 'guild', args: ['생성', (body(k).querySelector('#gname') || {}).value || ''] }); else if (a === '공지') send({ t: 'guild', args: ['공지', (body(k).querySelector('#gnotice') || {}).value || ''] }); else if (a === '탈퇴') { if (confirm('길드를 떠나시겠습니까?')) send({ t: 'guild', args: ['탈퇴'] }); } return; }
    const to = e.target.closest('[data-toffer]'); if (to && k === 'trade' && state.trade) { const idx = [...state.trade.myIdx, +to.dataset.toffer].slice(0, 8); send({ t: 'toffer', items: idx, gold: state.trade.me.gold }); return; }
    const bk = e.target.closest('[data-bank]'); if (bk && k === 'npc') { send({ t: bk.dataset.bank === 'bank' ? 'bankOut' : 'bankIn', npc: state.npc.id, i: +bk.dataset.i, id: bk.dataset.id }); return; }
    const s = e.target.closest('[data-i],[data-slot],[data-enh]'); const b = e.target.closest('button');
    if (b && b.dataset.tab) { state.npcTab = b.dataset.tab; render('npc'); return; }
    if (b && b.dataset.act) return act(k, b.dataset.act, b.dataset);
    if (!s) return;
    if (k === 'inv' && s.dataset.i != null) { state.selInv = +s.dataset.i; render('inv'); }
    else if (k === 'eq' && s.dataset.slot) { state.selEq = s.dataset.slot; render('eq'); }
    else if (k === 'npc' && s.dataset.enh) { state.selEnh = s.dataset.enh; render('npc'); }
  }
  function onDbl(k, e) {
    const s = e.target.closest('.slot'); if (!s) return;
    if (k === 'inv' && s.dataset.i != null) { const it = state.inv[+s.dataset.i]; if (!it) return; const t = ITEMS[it.id].type; if (SLOTS.includes(t)) send({ t: 'equip', i: +s.dataset.i, id: it.id }); else if (t === 'potion' || t === 'scroll') send({ t: 'use', i: +s.dataset.i, id: it.id }); }
    else if (k === 'eq' && s.dataset.slot && state.equip[s.dataset.slot]) send({ t: 'unequip', slot: s.dataset.slot });
  }
  function act(k, a, d) {
    const n = state.npc; const it = state.inv[state.selInv];
    if (a === 'tgold') { const v = Math.floor(+document.getElementById('tradeGold').value || 0); send({ t: 'toffer', items: state.trade.myIdx, gold: v }); return; }
    if (a === 'tclear') { send({ t: 'toffer', items: [], gold: 0 }); return; }
    if (a === 'tconfirm') { send({ t: 'tconfirm' }); return; }
    if (a === 'tcancel') { send({ t: 'tcancel' }); return; }
    if (a === 'equip' && it) send({ t: 'equip', i: state.selInv, id: it.id });
    else if (a === 'use' && it) send({ t: 'use', i: state.selInv, id: it.id });
    else if (a === 'drop' && it) send({ t: 'drop', i: state.selInv, id: it.id });
    else if (a === 'sell' && it && n) send({ t: 'sell', npc: n.id, i: state.selInv, id: it.id, n: 1 });
    else if (a === 'unequip' && state.selEq) send({ t: 'unequip', slot: state.selEq });
    else if (!n) return;
    else if (a === 'buy') send({ t: 'buy', npc: n.id, item: d.id, n: 1 });
    else if (a === 'buy10') send({ t: 'buy', npc: n.id, item: d.id, n: 10 });
    else if (a === 'sellone' || a === 'sellall') { const x = state.inv[+d.i]; if (x) send({ t: 'sell', npc: n.id, i: +d.i, id: x.id, n: a === 'sellall' ? x.n : 1 }); }
    else if (a === 'craft') send({ t: 'craft', npc: n.id, item: d.id });
    else if (a === 'enh') { const [src, v] = state.selEnh.split(':'); if (src === 'eq') send({ t: 'enhance', npc: n.id, src, slot: v }); else { const x = state.inv[+v]; if (x) send({ t: 'enhance', npc: n.id, src, i: +v, id: x.id }); } }
    else if (a === 'rest' || a === 'job' || a === 'advance' || a === 'atone') send({ t: a, npc: n.id });
    else if (a === 'qaccept' || a === 'qdone') send({ t: a, npc: n.id, q: d.q });
    else if (a === 'mlist') { const sel = document.getElementById('mItem'), pr = document.getElementById('mPrice'); const i = +(sel && sel.value); if (i >= 0) send({ t: 'mlist', npc: n.id, i, price: Math.floor(+(pr && pr.value) || 0) }); }
    else if (a === 'mbuy' || a === 'mcancel') send({ t: a, npc: n.id, id: +d.id });
    else if (a === 'bdep' || a === 'bwd' || a === 'bdepall') { const inp = document.getElementById('bankAmt'); const v = a === 'bdepall' ? state.gold : Math.floor(+(inp && inp.value) || 0); if (v > 0) send({ t: 'bankGold', npc: n.id, v: a === 'bwd' ? -v : v }); }
  }
  return {
    state, toggle, show, hide, closeAll, anyOpen, render, isOpen: k => !wins[k].hidden,
    setInv(m) {
      // keep the enhance selection pointing at the same item after the list changes
      state.inv = m.inv; state.equip = m.equip; state.gold = m.gold;
      if (state.selInv >= state.inv.length) state.selInv = -1;
      if (state.selEnh && state.selEnh.startsWith('inv:') && !state.inv[+state.selEnh.slice(4)]) state.selEnh = null;
      for (const k of Object.keys(wins)) render(k);
    },
    setMe(me) { const changed = !state.me || state.me[4] !== me[4] || state.me[8] !== me[8] || state.me[9] !== me[9] || state.me[11] !== me[11] || state.me[10] !== me[10]; state.me = me; if (changed) for (const k of ['char', 'eq', 'npc']) render(k); },
    openNpc(n) { const same = state.npc && state.npc.id === n.id; state.npc = n; if (!same) { state.npcTab = null; state.selEnh = null; } show('npc'); },
    setQuests(q) { state.quests = q; render('quest'); },
    setTrade(tr) { if (!tr.id) { state.trade = null; hide('trade'); return; } state.trade = tr; if (wins.trade.hidden) show('trade'); else render('trade'); },
    setBoard(rows, g) { state.board = rows; state.gboard = g || []; show('board'); },
    closeNpc() { if (!wins.npc.hidden) { wins.npc.hidden = true; state.npc = null; } },
    firstOf(id) { return state.inv.findIndex(x => x.id === id); },
  };
}
