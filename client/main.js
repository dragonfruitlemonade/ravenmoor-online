// Ravenmoor Online client: renders the shared map and baked 3D sprites, sends intentions to the server.
import { MAP, TILE_W as TW, TILE_H as TH, G, TOWN, CX, CY, GATES, BUILDINGS, LOOKS, buildWorld, isSafe, noise } from '/shared/world.js';
import { ITEMS, CLASSES, classInfo } from '/shared/rules.js';
import { createUI, iconSrc } from '/client/ui.js';
import { initAudio, toggleMute, isMuted, sfx, sfxAt, setAmbience } from '/client/audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let DPR = 1, VW = 1, VH = 1, zoom = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); VW = innerWidth; VH = innerHeight; canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR); chunks.clear(); }
addEventListener('resize', resize);

const W = buildWorld();
const toS = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];
const toW = (sx, sy) => [(sx / (TW / 2) + sy / (TH / 2)) / 2, (sy / (TH / 2) - sx / (TW / 2)) / 2];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ───────────────────────── assets
const MF = await (await fetch('/assets/sprites/manifest.json')).json();
const SC = MF.scale || .5;
const imgs = new Map();
function img(file) { let im = imgs.get(file); if (!im) { im = new Image(); im.src = '/assets/sprites/' + file; imgs.set(file, im); } return im.complete && im.naturalWidth ? im : null; }
for (const k of Object.keys(MF.statics)) img(MF.statics[k].file);
for (const k of ['knight', 'barbarian', 'rogue', 'mage']) { img(MF.characters[k].anims.idle.file); img(MF.characters[k].anims.walk.file); }

// ───────────────────────── ground textures
const GCOL = { [G.GRASS]: [[96, 112, 52], [126, 138, 66]], [G.DIRT]: [[132, 106, 70], [158, 134, 92]], [G.ROAD]: [[146, 124, 86], [170, 148, 104]], [G.COBBLE]: [[120, 116, 108], [150, 144, 132]],
  [G.WATER]: [[40, 84, 120], [58, 106, 144]], [G.SAND]: [[176, 158, 116], [196, 178, 134]], [G.DARK]: [[62, 80, 44], [86, 100, 54]], [G.ASH]: [[118, 84, 60], [146, 108, 74]], [G.BRIDGE]: [[110, 82, 52], [140, 106, 70]] };
const ORDER = [G.DARK, G.DIRT, G.ASH, G.SAND, G.ROAD, G.WATER, G.COBBLE, G.BRIDGE];
// periodic value noise so textures tile seamlessly
function ph(x, y, P) { x = ((x % P) + P) % P; y = ((y % P) + P) % P; let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function pnoise(x, y, P) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = ph(xi, yi, P), b = ph(xi + 1, yi, P), c = ph(xi, yi + 1, P), d = ph(xi + 1, yi + 1, P); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function makeTexture(type) {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); const id = g.createImageData(S, S); const d = id.data;
  const [a, b] = GCOL[type];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // tileable noise: sample on a torus
    const n1 = pnoise(x / S * 6, y / S * 6, 6) * .65 + pnoise(x / S * 12 + 3, y / S * 12 + 7, 12) * .35;
    const n2 = pnoise(x / S * 24 + 5, y / S * 24 + 1, 24) * .6 + pnoise(x / S * 48, y / S * 48, 48) * .4;
    let t = n1 * .55 + n2 * .45;
    if (type === G.COBBLE || type === G.BRIDGE) {
      const cs = type === G.COBBLE ? 18 : 12; const sx = x / cs, sy = y / cs * (type === G.COBBLE ? 1 : 3);
      const ix = Math.floor(sx + (Math.floor(sy) % 2) * .5), iy = Math.floor(sy); const fx = sx + (Math.floor(sy) % 2) * .5 - ix, fy = sy - iy;
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy); t = edge < .09 ? .05 : .35 + ((ix * 7 + iy * 13) % 9) / 14 + n2 * .2;
    } else if (type === G.WATER) t = .3 + n1 * .5 + Math.sin((x + y * 2) / 9) * .08;
    else if (type === G.GRASS || type === G.DARK) { const blade = pnoise(x / S * 64, y / S * 128, 64); if (blade > .72) t += .25; else if (blade < .2) t -= .18; }
    else { const peb = pnoise(x / S * 40 + 9, y / S * 40 + 4, 40); if (peb > .78) t += .3; }
    t = clamp(t, 0, 1.2); const o = (y * S + x) * 4;
    d[o] = a[0] + (b[0] - a[0]) * t; d[o + 1] = a[1] + (b[1] - a[1]) * t; d[o + 2] = a[2] + (b[2] - a[2]) * t; d[o + 3] = 255;
  }
  g.putImageData(id, 0, 0); return c;
}
const TEX = {}; for (const k of Object.keys(GCOL)) TEX[k] = makeTexture(+k);
// feathered diamond masks so neighbouring ground types blend instead of forming a grid
function makeMask(hard, seed) {
  const w = Math.ceil(TW * 1.6), h = Math.ceil(TH * 1.6), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const id = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (TW / 2), dy = (y - h / 2) / (TH / 2); let d = Math.abs(dx) + Math.abs(dy);
    d += (noise(x * .18 + seed * 9, y * .18 + seed * 5) - .5) * (hard ? .12 : .5);
    const a = hard ? clamp((1.08 - d) / .12, 0, 1) : clamp((1.3 - d) / .55, 0, 1);
    id.data[(y * w + x) * 4 + 3] = a * 255;
  }
  g.putImageData(id, 0, 0); return c;
}
const MASK_SOFT = [0, 1, 2, 3].map(s => makeMask(false, s)), MASK_HARD = [0, 1].map(s => makeMask(true, s));

// ───────────────────────── ground chunks (16×16 tiles, rendered once at device resolution)
const CH = 16, chunks = new Map(); let chunkBudget = 0;
function buildChunk(cx, cy) {
  const x0 = cx * CH, y0 = cy * CH;
  const left = toS(x0, y0 + CH)[0] - TW, right = toS(x0 + CH, y0)[0] + TW, top = toS(x0, y0)[1] - TH, bottom = toS(x0 + CH, y0 + CH)[1] + TH;
  const w = right - left, h = bottom - top; const c = document.createElement('canvas'); c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
  const g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(-left, -top);
  // clip to this chunk's diamond so neighbouring chunks don't double-draw
  g.save(); g.beginPath(); const o = .04; const [ax, ay] = toS(x0 - o, y0 - o), [bx, by] = toS(x0 + CH + o, y0 - o), [ex, ey] = toS(x0 + CH + o, y0 + CH + o), [dx, dy] = toS(x0 - o, y0 + CH + o); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(ex, ey); g.lineTo(dx, dy); g.closePath(); g.clip();
  g.fillStyle = g.createPattern(TEX[G.GRASS], 'repeat'); g.fillRect(left, top, w, h);
  const layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height; const lg = layer.getContext('2d');
  for (const type of ORDER) {
    let any = false; lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, layer.width, layer.height); lg.setTransform(DPR, 0, 0, DPR, -left * DPR, -top * DPR);
    const hard = type === G.COBBLE || type === G.BRIDGE || type === G.WATER;
    for (let y = y0 - 1; y <= y0 + CH; y++) for (let x = x0 - 1; x <= x0 + CH; x++) {
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue; if (W.ground[y * MAP + x] !== type) continue; any = true;
      const m = hard ? MASK_HARD[(x + y) & 1] : MASK_SOFT[(x * 3 + y * 7) & 3]; const [sx, sy] = toS(x + .5, y + .5); lg.drawImage(m, sx - m.width / 2, sy - m.height / 2);
    }
    if (!any) continue;
    lg.globalCompositeOperation = 'source-in'; lg.fillStyle = lg.createPattern(TEX[type], 'repeat'); lg.fillRect(left, top, w, h); lg.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(layer, 0, 0); g.setTransform(DPR, 0, 0, DPR, -left * DPR, -top * DPR);
  }
  g.restore();
  return { c, left, top, w, h };
}
function getChunk(cx, cy) { const k = cy * 64 + cx; let c = chunks.get(k); if (c) return c; if (chunkBudget <= 0) return null; chunkBudget--; c = buildChunk(cx, cy); chunks.set(k, c); return c; }

// ───────────────────────── static objects
const BMAP = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const statics = W.objects.map(o => {
  const m = MF.statics[o.key]; let depth = o.x + o.y;
  if (o.building) { const b = BMAP[o.building]; depth = (b.cx + b.w / 2 - .5) + (b.cy + b.h / 2 - .5); }
  else if (o.key.startsWith('wall') || o.key.startsWith('gate')) depth += 1;
  else if (o.key === 'mountain' || o.key === 'hills') depth -= 2;
  return { ...o, m, depth, name: o.building ? BMAP[o.building].name : null };
}).filter(o => o.m);
function drawStatic(o) { const im = img(o.m.file); if (!im) return; const [sx, sy] = toS(o.x, o.y); ctx.drawImage(im, sx - o.m.ax * SC, sy - o.m.ay * SC, o.m.w * SC, o.m.h * SC); }

// ───────────────────────── entities
const ents = new Map();   // id -> {id,kind,name,sprite,level,flag,maxHp,x,y,rx,ry,dir,st,hp,atkT,hitT,deadT,say,sayT}
let myId = 0, me = null, meStats = null, online = 0;
const inParty = id => !!(party && party.id && party.members.some(mm => mm.id === id));
// tinted variants of the baked adventurer sheets, used for human outlaws (no extra baking needed)
const VARIANTS = { bandit: ['rogue', 'rgba(150,30,30,.5)'], deserter: ['knight', 'rgba(25,25,45,.55)'], cultist: ['mage', 'rgba(95,20,120,.55)'], brute: ['barbarian', 'rgba(40,80,30,.5)'] };
const tinted = new Map();
function charDef(sprite) { return MF.characters[sprite] || (VARIANTS[sprite] && MF.characters[VARIANTS[sprite][0]]) || null; }
function sheet(sprite, file) { const v = VARIANTS[sprite]; const base = img(file); if (!v || !base) return base; const key = sprite + ':' + file; let cv = tinted.get(key); if (cv) return cv; cv = document.createElement('canvas'); cv.width = base.naturalWidth; cv.height = base.naturalHeight; const g = cv.getContext('2d'); g.drawImage(base, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = v[1]; g.fillRect(0, 0, cv.width, cv.height); tinted.set(key, cv); return cv; }
function entColor(e) { if (e.id === myId) return e.flag === 2 ? '#ff6a5a' : '#ffd86b'; if (e.kind === 1) return inParty(e.id) ? '#8fe3a0' : e.flag === 2 ? '#ff6a5a' : e.flag === 1 ? '#c99cff' : '#cfe2ff'; if (e.kind === 4) return '#a8e0a0'; return '#e8dcc0'; }
function charFrame(e, t) {
  const C = charDef(e.sprite); if (!C) return null;
  let anim = 'idle', at = (t / 1000) % 100;
  if (e.st === 4) { anim = 'death'; at = (t - e.deadT) / 1000; }
  else if (t - e.atkT < 620) { anim = 'attack'; at = (t - e.atkT) / 1000 * 1.6; }
  else if (e.st === 1) { anim = 'walk'; at = t / 1000 * 1.55; }
  else if (t - e.hitT < 380) { anim = 'hit'; at = (t - e.hitT) / 1000 * 1.6; }
  const A = C.anims[anim]; if (!A) return null; const im = sheet(e.sprite, A.file); if (!im) return null;
  let f = Math.floor(at / A.dur * A.frames); f = A.loop ? ((f % A.frames) + A.frames) % A.frames : clamp(f, 0, A.frames - 1);
  return { im, C, f };
}
const dropImgs = {};
function dropImg(key) { let im = dropImgs[key]; if (!im) { im = new Image(); im.src = iconSrc(MF, key); dropImgs[key] = im; } return im.complete && im.naturalWidth ? im : null; }
function drawDrop(e, t) {
  const [sx, sy] = toS(e.rx, e.ry); const bob = Math.sin(t / 400 + e.id) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 10, 4.5, 0, 0, 7); ctx.fill();
  const im = dropImg(e.sprite); if (im) ctx.drawImage(im, sx - 13, sy - 24 + bob, 26, 26);
  if (e.id === hoverId) { ctx.strokeStyle = 'rgba(255,230,160,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 7, 0, 0, 7); ctx.stroke(); }
}
function drawEntity(e, t) {
  if (e.kind === 3) return drawDrop(e, t);
  const [sx, sy] = toS(e.rx, e.ry); const fr = charFrame(e, t);
  if (fr) { const { im, C, f } = fr; const k = SC * (e.scale || 1); ctx.drawImage(im, f * C.w, e.dir * C.h, C.w, C.h, sx - C.ax * k, sy - C.ay * k, C.w * k, C.h * k);
    if (e.boss) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .18 + Math.sin(t / 300) * .08; ctx.drawImage(im, f * C.w, e.dir * C.h, C.w, C.h, sx - C.ax * k, sy - C.ay * k, C.w * k, C.h * k); ctx.restore(); }
    if (t - e.hitT < 120) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35; ctx.drawImage(im, f * C.w, e.dir * C.h, C.w, C.h, sx - C.ax * k, sy - C.ay * k, C.w * k, C.h * k); ctx.restore(); } }
  else { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#888'; ctx.fillRect(sx - 6, sy - 40, 12, 40); }
  if (e.id === targetId && e.st !== 4) { ctx.strokeStyle = 'rgba(255,90,70,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 18, 9, 0, 0, 7); ctx.stroke(); }
  if (e.sf & 1) { for (let i = 0; i < 3; i++) { const a = t / 200 + i * 2.1; ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 10, sy - headY(e) - 2 + Math.sin(a) * 3, 2, 0, 7); ctx.fill(); } }
  if (e.sf & 2 && (t / 150 | 0) % 3 === 0) { ctx.fillStyle = 'rgba(200,30,30,.8)'; ctx.fillRect(sx - 2 + Math.sin(t / 90) * 6, sy - 20 - (t / 10 % 20), 2, 4); }
}
function headY(e) { const C = charDef(e.sprite); return C ? C.ay * SC * .62 * (e.scale || 1) : 50; }

// ───────────────────────── effects
const SETTINGS = { names: true, dmg: true, mmBig: false, hideOthersNames: false }; try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('rm-settings') || '{}')); } catch {}
function saveSettings() { try { localStorage.setItem('rm-settings', JSON.stringify(SETTINGS)); } catch {} applySettings(); }
function applySettings() { $('minimap').classList.toggle('big', !!SETTINGS.mmBig); }
function openSettings() { const w = $('settings'); w.hidden = !w.hidden; if (w.hidden) return; w.innerHTML = `<div class="wh"><span class="wt">설정</span><button class="wx" id="setx">✕</button></div><div class="wb"><label><input type="checkbox" data-s="sound" ${isMuted() ? '' : 'checked'}> 효과음·환경음</label><label><input type="checkbox" data-s="names" ${SETTINGS.names ? 'checked' : ''}> 이름표 표시</label><label><input type="checkbox" data-s="hideOthersNames" ${SETTINGS.hideOthersNames ? 'checked' : ''}> 다른 모험가 이름 숨기기</label><label><input type="checkbox" data-s="dmg" ${SETTINGS.dmg ? 'checked' : ''}> 피해 숫자 표시</label><label><input type="checkbox" data-s="mmBig" ${SETTINGS.mmBig ? 'checked' : ''}> 큰 미니맵</label><div class="row"><button class="btn" id="zoomReset">확대 초기화</button><button class="btn" id="setLogout">로그아웃</button></div><p class="ds">단축키: A 공격 · H 치유 · S/D 기술 · 1·2·3 물약·귀환 · Z 줍기 · I 가방 · E 장비 · C 캐릭터 · Q 의뢰 · L 순위 · M 소리 · O 설정 · R 귓속말 답장 · Esc 멈춤</p></div>`;
  $('setx').onclick = () => { w.hidden = true; }; $('zoomReset').onclick = () => { zoom = 1; }; $('setLogout').onclick = () => $('logout').click();
  for (const c of w.querySelectorAll('input[data-s]')) c.onchange = () => { if (c.dataset.s === 'sound') { const mu = toggleMute(); $('muteBtn').querySelector('small').textContent = mu ? '음소거' : '소리'; return; } SETTINGS[c.dataset.s] = c.checked; saveSettings(); }; }
const rainDrops = []; const floats = [], bolts = [], clicks = [], rings = [], tele = [], chainsFx = []; let raidState = null, weather = 0, weatherAmt = 0, hoverId = 0, dayPhase = 0, questMarks = {}, party = null, isAdminUser = false, lastWhisper = null;
function renderParty() {
  const el = $('party'); if (!party || !party.id) { el.hidden = true; return; } el.hidden = false;
  el.innerHTML = `<div class="ph">파티 <span class="ds">${party.members.length}/5</span> <button class="link" id="pleave">나가기</button></div>` + party.members.map(mm => `<div class="pm${mm.id === myId ? ' me' : ''}${mm.id === party.leader ? ' lead' : ''}"><span class="nm">${mm.id === party.leader ? '★ ' : ''}${esc(mm.name)} <small>Lv${mm.level}</small></span><div class="bar hp"><i style="width:${100 * mm.hp / mm.maxHp}%"></i></div></div>`).join('');
  $('pleave').onclick = () => send({ t: 'pleave' });
}
function showInvite(m) {
  const box = $('invites'); const d = document.createElement('div'); d.className = 'panel invite';
  d.innerHTML = `<span>${esc(m.from)}님의 ${m.kind === 'party' ? '파티' : m.kind === 'guild' ? `길드 「${esc(m.guild)}」 가입` : '거래'} 요청</span><button class="btn" data-a="ok">수락</button><button class="btn" data-a="no">거절</button>`;
  d.querySelector('[data-a=ok]').onclick = () => { send({ t: m.kind === 'party' ? 'paccept' : m.kind === 'guild' ? 'gaccept' : 'taccept' }); d.remove(); }; d.querySelector('[data-a=no]').onclick = () => d.remove();
  box.appendChild(d); setTimeout(() => d.remove(), m.kind === 'party' ? 60000 : 30000); sfx.quest();
}
// one-time tips for newcomers (remembered per browser)
const TIPS = { move: '바닥을 클릭하면 이동, 몬스터를 클릭하거나 A 키를 누르면 공격합니다. 상인·스승은 클릭해서 말을 겁니다.', outside: '성 밖입니다. 6레벨부터는 다른 모험가가 공격해 올 수 있습니다. 귀환 주문서(3)로 언제든 마을로 돌아갑니다.', lowhp: '체력이 낮습니다! 1번 키로 물약을 마시거나 H로 치유하세요. 싸움을 멈추면 서서히 회복되고, 마을 안에서는 두 배로 빠릅니다.', drop: '바닥의 전리품은 클릭하거나 Z 키로 줍습니다. 10초 동안은 처치한 사람에게 우선권이 있습니다.', bag: '가방(I)에서 물건을 두 번 누르면 사용하거나 장착합니다. 장비(E)와 캐릭터(C) 창도 확인해 보세요.', party: '다른 모험가를 우클릭하면 파티 초대·거래·귓속말을 할 수 있습니다. 파티는 경험치를 나누고 서로 공격할 수 없습니다.', boss: '보스는 혼자서는 버겁습니다. 바닥에 붉은 원이 보이면 범위 공격 예고이니 피하세요. 파티를 모아 도전하세요.' };
let tipsSeen = {}; try { tipsSeen = JSON.parse(localStorage.getItem('rm-tips') || '{}'); } catch {}
function tip(key) { if (tipsSeen[key] || !TIPS[key]) return; tipsSeen[key] = 1; try { localStorage.setItem('rm-tips', JSON.stringify(tipsSeen)); } catch {} const n = $('tip'); n.innerHTML = `<b>도움말</b> ${esc(TIPS[key])}`; n.hidden = false; clearTimeout(tip.t); tip.t = setTimeout(() => n.hidden = true, 12000); addLog('💡 ' + TIPS[key], 'sys'); }
function showNotice(text) { const n = $('notice'); n.textContent = text; n.hidden = false; clearTimeout(showNotice.t); showNotice.t = setTimeout(() => n.hidden = true, 8000); }
let ctxMenu = null;
function playerMenu(e, px, py) {
  closeMenu(); const d = document.createElement('div'); d.className = 'panel ctxmenu'; d.style.left = px + 'px'; d.style.top = py + 'px';
  const items = [['귓속말', () => { $('chatin').value = `/귓 ${e.name} `; $('chatin').focus(); }], ['파티 초대', () => send({ t: 'pinvite', name: e.name })], ['길드 초대', () => send({ t: 'ginvite', name: e.name })], ['거래', () => send({ t: 'trade', name: e.name })], ['공격', () => { targetId = e.id; send({ t: 'attack', id: e.id }); }]];
  d.innerHTML = `<div class="ct">${esc(e.name)}</div>` + items.map(([l]) => `<button class="mi">${l}</button>`).join('');
  [...d.querySelectorAll('.mi')].forEach((b, i) => b.onclick = () => { items[i][1](); closeMenu(); });
  document.body.appendChild(d); ctxMenu = d;
}
function closeMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
addEventListener('pointerdown', ev => { if (ctxMenu && !ctxMenu.contains(ev.target)) closeMenu(); });

// ───────────────────────── networking
let ws = null, connected = false, pingTimer = 0, latency = 0;
const reconnect = { tries: 0, giveUp: false, timer: 0 };
function scheduleReconnect(token) { if (reconnect.tries >= 8) { reconnect.giveUp = true; addLog('다시 연결하지 못했습니다. 새로고침해 주세요.', 'sys'); $('reconn').hidden = false; return; } const wait = Math.min(15000, 1000 * Math.pow(1.7, reconnect.tries++)); $('reconn').hidden = false; $('reconn').textContent = `연결 끊김 — ${Math.round(wait / 1000)}초 뒤 다시 연결…`; clearTimeout(reconnect.timer); reconnect.timer = setTimeout(() => { ents.clear(); targetId = 0; connect(token); }, wait); }
function connect(token) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { connected = true; ws.send(JSON.stringify({ t: 'join', token })); };
  ws.onclose = () => { connected = false; if (reconnect.giveUp) return; if (!myId) { $('jbtn').disabled = false; $('jerr').textContent = '서버에 연결할 수 없습니다.'; return; } addLog('서버와 연결이 끊어졌습니다. 다시 연결합니다…', 'sys'); scheduleReconnect(token); };
  ws.onerror = () => {};
  clearInterval(pingTimer); pingTimer = setInterval(() => { if (connected) send({ t: 'ping', c: performance.now() }); }, 5000);
  ws.onmessage = ev => onMsg(JSON.parse(ev.data));
}
const send = o => { if (connected) ws.send(JSON.stringify(o)); };
function onMsg(m) {
  const t = performance.now();
  if (m.t === 'err') { reconnect.giveUp = true; $('reconn').hidden = true; $('jerr').textContent = m.msg; $('jbtn').disabled = false; $('join').hidden = false; $('hud').hidden = true; myId = 0; if (m.relogin) { try { localStorage.removeItem('rm-token'); } catch {} } return; }
  if (m.t === 'inv') { ui.setInv(m); return; }
  if (m.t === 'npc') { ui.openNpc(m); return; }
  if (m.t === 'npcclose') { ui.closeNpc(); return; }
  if (m.t === 'quests') { ui.setQuests(m.q); return; }
  if (m.t === 'party') { party = m; renderParty(); return; }
  if (m.t === 'titles') { ui.state.titles = m; ui.render('char'); return; }
  if (m.t === 'guild') { ui.state.guild = m.id ? m : null; if (m.show) ui.show('guild'); else ui.render('guild'); return; }
  if (m.t === 'trade') { ui.setTrade(m); return; }
  if (m.t === 'leaderboard') { ui.setBoard(m.rows); return; }
  if (m.t === 'invite') { showInvite(m); return; }
  if (m.t === 'pong') { latency = Math.round(performance.now() - m.c); return; }
  if (m.t === 'welcome') { reconnect.tries = 0; $('reconn').hidden = true; if (myId) { addLog('다시 연결되었습니다.', 'sys'); } myId = m.id; isAdminUser = !!m.admin; if (isAdminUser) $('adminLink').hidden = false; $('join').hidden = true; $('hud').hidden = false; $('pname').textContent = m.name; setTimeout(() => tip('move'), 1500); setTimeout(() => tip('bag'), 40000); addLog(`${m.name}님, 레이븐무어에 오신 것을 환영합니다. 성문은 동서남북 네 곳에 있습니다. 상인·스승·마을 사람은 이름을 눌러 말을 걸 수 있습니다.`, 'sys'); return; }
  if (m.t === 'snap') {
    for (const [id, kind, name, sprite, level, flag, maxHp, extra, scale, boss, guild, title] of m.m) { if (kind === 3) tip('drop'); const e = ents.get(id) || { id, atkT: -1e9, hitT: -1e9, deadT: 0, rx: null }; Object.assign(e, { kind, name, sprite, level, flag, maxHp, extra, scale: scale || 1, boss: boss === 1, elite: boss === 2, guild: guild || '', title: title || '' }); ents.set(id, e); }
    dayPhase = m.day || 0; weather = m.w || 0; questMarks = m.qm || {}; raidState = m.raid || null;
    for (const [id, x, y, dir, st, hp, sf] of m.e) { const e = ents.get(id); if (!e) continue; if (e.rx === null || Math.hypot(e.rx - x, e.ry - y) > 4) { e.rx = x; e.ry = y; } if (st === 4 && e.st !== 4) e.deadT = t; Object.assign(e, { x, y, dir, st, hp, sf }); }
    for (const id of m.g) ents.delete(id);
    me = ents.get(myId); meStats = m.me; ui.setMe(m.me); online = m.e.filter(e => ents.get(e[0])?.kind === 1).length; return;
  }
  if (m.t === 'ev') {
    const dist = e => (e && me && me.rx !== null) ? Math.hypot(e.rx - me.rx, e.ry - me.ry) : 0;
    if (m.k === 'atk') { const a = ents.get(m.a), b = ents.get(m.b); if (a) { a.atkT = t; sfxAt(m.r ? 'bolt' : 'swing', dist(a)); } if (m.r && a && b) bolts.push({ a, b, t0: t, dur: 120 + Math.hypot(a.x - b.x, a.y - b.y) * 60 }); }
    else if (m.k === 'dmg') { const b = ents.get(m.b); if (b) { b.hitT = t; if (m.b === myId) sfx.hurt(); else sfxAt(m.c ? 'crit' : 'hit', dist(b)); if (SETTINGS.dmg || m.b === myId) floats.push({ x: b.rx, y: b.ry, h: headY(b), txt: String(m.v), col: m.b === myId ? '#ff7b6b' : m.c ? '#ffd86b' : '#ffffff', big: !!m.c, t0: t }); } }
    else if (m.k === 'die') { const e = ents.get(m.id); if (e) sfxAt('die', dist(e)); }
    else if (m.k === 'lvl') { const e = ents.get(m.id); if (e) { if (m.id === myId) sfx.level(); floats.push({ x: e.rx, y: e.ry, h: headY(e) + 10, txt: m.txt || 'LEVEL UP!', col: '#ffd86b', big: true, t0: t, life: 1800 }); rings.push({ x: e.rx, y: e.ry, col: '255,216,107', t0: t, life: 900, r: 40 }); } }
    else if (m.k === 'fx') {
      const e = ents.get(m.id);
      if (m.fx === 'heal' || m.fx === 'mana') { if (e) { if (m.id === myId) sfx.heal(); floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: '+' + m.v, col: m.fx === 'heal' ? '#8fd79a' : '#7fb4ff', t0: t }); rings.push({ x: e.rx, y: e.ry, col: m.fx === 'heal' ? '143,215,154' : '127,180,255', t0: t, life: 600, r: 22 }); } }
      else if (m.fx === 'fire') { sfx.fire(); rings.push({ x: m.x, y: m.y, col: '255,140,40', t0: t, life: 700, r: 70, fill: true }); }
      else if (m.fx === 'holy') { sfx.heal(); rings.push({ x: m.x, y: m.y, col: '255,243,176', t0: t, life: 800, r: 95, fill: true }); }
      else if (m.fx === 'tele' && e) { sfx.tele(); rings.push({ x: e.rx, y: e.ry, col: '184,160,255', t0: t, life: 700, r: 30, fill: true }); }
      else if ((m.fx === 'craft' || m.fx === 'enh_ok') && e) { sfx.quest(); rings.push({ x: e.rx, y: e.ry, col: '255,216,107', t0: t, life: 800, r: 34 }); }
      else if (m.fx === 'enh_fail' && e) { sfx.deny(); rings.push({ x: e.rx, y: e.ry, col: '200,60,50', t0: t, life: 700, r: 30 }); }
      else if (m.fx === 'stun' && e) { sfxAt('stun', dist(e)); floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: '기절', col: '#c9d9ff', t0: t }); }
      else if (m.fx === 'bleed' && e) floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: '출혈', col: '#ff6a5a', t0: t });
      else if (m.fx === 'tele_slam') { tele.push({ k: 'slam', x: m.x, y: m.y, r: m.r, t0: t, life: m.ms }); if (e) floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: '내려찍기!', col: '#ff9a6a', t0: t, life: m.ms }); }
      else if (m.fx === 'tele_charge') { tele.push({ k: 'charge', from: e, x: m.x, y: m.y, t0: t, life: m.ms + 800 }); if (e) floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: '돌진!', col: '#ff9a6a', t0: t }); }
      else if (m.fx === 'slam') { sfx.slam(); rings.push({ x: m.x, y: m.y, col: '200,170,130', t0: t, life: 500, r: m.r * 32, fill: true }); }
      else if (m.fx === 'roar' || m.fx === 'summon') { sfx.roar(); rings.push({ x: m.x, y: m.y, col: m.fx === 'roar' ? '255,180,80' : '160,120,255', t0: t, life: 900, r: 100, fill: true }); if (e) floats.push({ x: e.rx, y: e.ry, h: headY(e), txt: m.fx === 'roar' ? '포효!' : '소환!', col: '#ffd86b', big: true, t0: t }); }
      else if (m.fx === 'chain' && e) { sfx.chain(); const f = ents.get(m.from); if (f) chainsFx.push({ a: f, b: e, t0: t }); rings.push({ x: e.rx, y: e.ry, col: '160,210,255', t0: t, life: 400, r: 20 }); }
    }
    return;
  }
  if (m.t === 'chat') { if (m.notice) { addLog('📣 ' + esc(m.msg), 'notice'); sfx.bell(); showNotice(m.msg); return; } if (m.whisper) { addLog(`<b class="wn">${m.to ? '→ ' + esc(m.to) : esc(m.n)}</b> ${esc(m.msg)}`, 'whisper'); if (!m.to) { lastWhisper = m.n; sfx.pickup(); } return; } if (m.party) { addLog(`<b class="pn">[파티] ${esc(m.n)}</b> ${esc(m.msg)}`, 'party'); return; } if (m.guild) { addLog(`<b class="gn">[길드] ${esc(m.n)}</b> ${esc(m.msg)}`, 'guild'); return; } if (m.all) { addLog(`<b class="an">[전체] ${esc(m.n)}</b> ${esc(m.msg)}`, 'all near'); return; }
    if (m.sys) { addLog(m.msg, 'sys'); if (/의뢰 (수락|완료)|주웠습니다/.test(m.msg)) sfx[/주웠/.test(m.msg) ? (/금화/.test(m.msg) ? 'coin' : 'pickup') : 'quest'](); else if (/가득|부족|없습니다|없어|않습니다|없는/.test(m.msg)) sfx.deny(); } else { addLog(`<b>${esc(m.n)}</b> ${esc(m.msg)}`, m.id === myId ? 'me near' : 'near'); const e = ents.get(m.id); if (e) { e.say = m.msg; e.sayT = t; } } }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function addLog(html, cls) { const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = html; const L = $('log'); L.appendChild(d); while (L.children.length > 40) L.firstChild.remove(); }

// ───────────────────────── input
const cam = { x: 0, y: 0 }; let targetId = 0;
function screenToTile(px, py) { return toW((px - VW / 2) / zoom + cam.x, (py - VH / 2) / zoom + cam.y); }
function pickEntity(px, py) {
  let best = null, bd = 1e9;
  for (const e of ents.values()) { if (e.id === myId || e.st === 4 || e.rx === null) continue; const [sx, sy] = toS(e.rx, e.ry); const x = (sx - cam.x) * zoom + VW / 2, y = (sy - cam.y) * zoom + VH / 2; const drop = e.kind === 3; const scl = e.scale || 1; const dx = px - x, dy = py - (y - (drop ? 10 : 26 * scl) * zoom); if (Math.abs(dx) < (drop ? 15 : 20 * scl) * zoom && Math.abs(dy) < (drop ? 14 : 32 * scl) * zoom) { const d = dx * dx + dy * dy - (drop ? 200 : 0); if (d < bd) { bd = d; best = e; } } }
  return best;
}
canvas.addEventListener('contextmenu', ev => { ev.preventDefault(); if (!myId) return; const e = pickEntity(ev.clientX, ev.clientY); if (e && e.kind === 1) playerMenu(e, ev.clientX, ev.clientY); });
canvas.addEventListener('pointerdown', ev => {
  if (!myId || ev.button === 2) return; $('chatin').blur();
  const e = pickEntity(ev.clientX, ev.clientY);
  if (e) { if (e.kind === 3) { send({ t: 'pick', id: e.id }); return; } if (e.kind === 4) { send({ t: 'talk', npc: e.extra }); return; } targetId = e.id; send({ t: 'attack', id: e.id }); return; }
  const [x, y] = screenToTile(ev.clientX, ev.clientY); targetId = 0; send({ t: 'move', x, y }); clicks.push({ x, y, t0: performance.now() }); dest = { x, y, t0: performance.now() };
});
let pinch = null, pressTimer = 0;
canvas.addEventListener('touchstart', ev => { if (ev.touches.length === 2) { pinch = { d: Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY), z: zoom }; } else if (ev.touches.length === 1) { const t0 = ev.touches[0]; clearTimeout(pressTimer); pressTimer = setTimeout(() => { const e = pickEntity(t0.clientX, t0.clientY); if (e && e.kind === 1) playerMenu(e, t0.clientX, t0.clientY); }, 550); } }, { passive: true });
canvas.addEventListener('touchmove', ev => { clearTimeout(pressTimer); if (pinch && ev.touches.length === 2) { const d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY); zoom = clamp(pinch.z * d / pinch.d, .6, 1.8); ev.preventDefault(); } }, { passive: false });
canvas.addEventListener('touchend', () => { clearTimeout(pressTimer); pinch = null; }, { passive: true });
canvas.addEventListener('wheel', ev => { zoom = clamp(zoom * (ev.deltaY > 0 ? .9 : 1.1), .6, 1.8); ev.preventDefault(); }, { passive: false });
$('minimap').addEventListener('pointerdown', ev => { if (!myId) return; const r = ev.currentTarget.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * MAP, y = (ev.clientY - r.top) / r.height * MAP; send({ t: 'move', x, y }); dest = { x, y, t0: performance.now() }; });
addEventListener('keydown', ev => {
  if (!myId) return; const inChat = document.activeElement === $('chatin');
  if (ev.key === 'Enter' && !inChat) { $('chatin').focus(); ev.preventDefault(); return; }
  if (inChat) { if (ev.key === 'Escape') $('chatin').blur(); return; }
  const k = ev.key.toLowerCase();
  if (k === 'escape') { if (ui.anyOpen()) ui.closeAll(); else { send({ t: 'stop' }); targetId = 0; } }
  else if (k === 'h') send({ t: 'heal' });
  else if (k === 's') send({ t: 'skill', id: targetId || undefined });
  else if (k === 'd') send({ t: 'skill2' });
  else if (k === 'm') { const mu = toggleMute(); addLog(mu ? '소리를 껐습니다.' : '소리를 켰습니다.', 'sys'); $('muteBtn').querySelector('small').textContent = mu ? '음소거' : '소리'; }
  else if (k === 'q') { ui.toggle('quest'); send({ t: 'quests' }); }
  else if (k === 'o') openSettings();
  else if (k === 'g') { if (ui.isOpen('guild')) ui.hide('guild'); else send({ t: 'guild', args: ['정보'] }); }
  else if (k === 'l') send({ t: 'leaderboard' });
  else if (k === 'r' && lastWhisper) { $('chatin').value = `/귓 ${lastWhisper} `; $('chatin').focus(); ev.preventDefault(); }
  else if (k === '1' || k === '2' || k === '3') { const id = { 1: 'hpPotion', 2: 'mpPotion', 3: 'scroll' }[k]; const i = ui.firstOf(id); if (i >= 0) send({ t: 'use', i, id }); else addLog(`${ITEMS[id].name}이(가) 없습니다.`, 'sys'); }
  else if (k === 'i') ui.toggle('inv'); else if (k === 'e') ui.toggle('eq'); else if (k === 'c') ui.toggle('char');
  else if (k === 'z' && me) { let best = null, bd = 6; for (const d of ents.values()) { if (d.kind !== 3) continue; const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < bd) { bd = dd; best = d; } } if (best) send({ t: 'pick', id: best.id }); else addLog('근처에 주울 것이 없습니다.', 'sys'); }
  else if (k === 'a' && me) { let best = null, bd = 9; for (const e of ents.values()) { if (e.kind !== 2 || e.st === 4) continue; const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; } } if (best) { targetId = best.id; send({ t: 'attack', id: best.id }); } else addLog('근처에 공격할 몬스터가 없습니다.', 'sys'); }
});
const CHANNELS = [['', '일반'], ['party', '파티'], ['guild', '길드'], ['all', '전체']]; let chan = 0;
function setChan(i) { chan = (i + CHANNELS.length) % CHANNELS.length; const b = $('chatch'); b.textContent = CHANNELS[chan][1]; b.className = CHANNELS[chan][0]; $('chatin').placeholder = chan ? `${CHANNELS[chan][1]} 채팅` : 'Enter 키로 대화'; }
$('chatch').onclick = () => { setChan(chan + 1); $('chatin').focus(); };
$('chatin').addEventListener('keydown', ev => { if (ev.key === 'Tab') { ev.preventDefault(); setChan(chan + 1); } });
$('chatform').addEventListener('submit', ev => { ev.preventDefault(); let v = $('chatin').value.trim(); if (v && v[0] !== '/' && chan) v = { party: '/파티 ', guild: '/길 ', all: '/전체 ' }[CHANNELS[chan][0]] + v; if (v) send({ t: 'chat', msg: v }); $('chatin').value = ''; $('chatin').blur(); });
for (const b of document.querySelectorAll('#chattabs button')) b.onclick = () => { for (const x of b.parentNode.children) x.classList.toggle('on', x === b); $('log').className = b.dataset.f ? 'f-' + b.dataset.f : ''; $('log').scrollTop = 1e9; };

// ───────────────────────── join screen (login / register)
let pickedLook = 'knight', mode = 'login';
const ui = createUI({ MF, send: o => send(o), log: addLog });
{
  const box = $('looks');
  for (const [k, label] of Object.entries(LOOKS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'look' + (k === pickedLook ? ' on' : ''); b.dataset.look = k;
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 192; b.appendChild(cv); b.append(label); box.appendChild(b);
    b.onclick = () => { pickedLook = k; for (const x of box.children) x.classList.toggle('on', x === b); };
  }
  const t0 = performance.now();
  const preview = () => {
    if (!$('join').hidden) {
      for (const b of box.children) { const C = MF.characters[b.dataset.look]; const A = C.anims.idle; const im = img(A.file); const g = b.firstChild.getContext('2d'); g.clearRect(0, 0, 192, 192); if (!im) continue; const f = Math.floor(((performance.now() - t0) / 1000 % A.dur) / A.dur * A.frames); const s = 192 / Math.max(C.w, C.h) * 1.15; g.drawImage(im, f * C.w, 1 * C.h, C.w, C.h, 96 - C.ax * s, 176 - C.ay * s, C.w * s, C.h * s); }
    }
    requestAnimationFrame(preview);
  };
  preview();
  const setMode = m => { mode = m; $('tabLogin').classList.toggle('on', m === 'login'); $('tabReg').classList.toggle('on', m === 'register'); $('lookRow').hidden = m !== 'register'; $('jbtn').textContent = m === 'login' ? '입장' : '캐릭터 만들기'; $('jpass').autocomplete = m === 'login' ? 'current-password' : 'new-password'; $('jerr').textContent = ''; };
  $('tabLogin').onclick = () => setMode('login'); $('tabReg').onclick = () => setMode('register');
  let saved = null; try { saved = localStorage.getItem('rm-token'); $('jname').value = localStorage.getItem('rm-name') || ''; } catch {}
  if (!$('jname').value) setMode('register'); else setMode('login');
  if (saved) { $('jerr').textContent = '저장된 로그인으로 접속 중…'; $('jbtn').disabled = true; connect(saved); }
  addEventListener('pointerdown', initAudio, { once: true });
  $('joinform').addEventListener('submit', async ev => {
    ev.preventDefault(); $('jerr').textContent = ''; $('jbtn').disabled = true;
    const name = $('jname').value.trim(), password = $('jpass').value;
    try {
      const r = await fetch('/api/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password, look: pickedLook }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || '실패했습니다.');
      try { localStorage.setItem('rm-token', j.token); localStorage.setItem('rm-name', name); } catch {}
      initAudio(); connect(j.token);
    } catch (err) { $('jerr').textContent = err.message; $('jbtn').disabled = false; }
  });
  applySettings(); $('setBtn').onclick = openSettings;
  $('adminLink').onclick = () => { let tk = ''; try { tk = localStorage.getItem('rm-token') || ''; } catch {} window.open('/admin?token=' + encodeURIComponent(tk), '_blank'); };
  $('logout').onclick = async () => { let tk = null; try { tk = localStorage.getItem('rm-token'); localStorage.removeItem('rm-token'); } catch {} if (tk) await fetch('/api/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tk }) }); location.reload(); };
  for (const b of document.querySelectorAll('#hotbar [data-key]')) b.addEventListener('click', () => dispatchEvent(new KeyboardEvent('keydown', { key: b.dataset.key })));
}

// ───────────────────────── minimap
const mmBase = document.createElement('canvas'); mmBase.width = MAP; mmBase.height = MAP;
{ const g = mmBase.getContext('2d'); for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) { const c = GCOL[W.ground[y * MAP + x]][0]; g.fillStyle = `rgb(${c})`; if (W.block[y * MAP + x] && W.ground[y * MAP + x] !== G.WATER) g.fillStyle = W.ground[y * MAP + x] === G.COBBLE ? '#d8d0c0' : '#3a4a2a'; g.fillRect(x, y, 1, 1); } }
const mm = $('minimap').getContext('2d'); let dest = null;
function drawMinimap() {
  mm.imageSmoothingEnabled = false; mm.drawImage(mmBase, 0, 0, 160, 160); const k = 160 / MAP;
  // view window + destination
  if (me && me.rx !== null) { mm.strokeStyle = 'rgba(255,255,255,.25)'; mm.lineWidth = 1; mm.strokeRect((me.rx - 13) * k, (me.ry - 13) * k, 26 * k, 26 * k); }
  if (dest && performance.now() - dest.t0 < 20000 && me && Math.hypot(me.rx - dest.x, me.ry - dest.y) > 1.5) { mm.strokeStyle = '#ffd86b'; mm.lineWidth = 1; mm.beginPath(); mm.moveTo(dest.x * k - 3, dest.y * k - 3); mm.lineTo(dest.x * k + 3, dest.y * k + 3); mm.moveTo(dest.x * k + 3, dest.y * k - 3); mm.lineTo(dest.x * k - 3, dest.y * k + 3); mm.stroke(); }
  // gates
  mm.fillStyle = '#e8dcc0'; mm.font = 'bold 8px sans-serif'; mm.textAlign = 'center'; for (const g of GATES) mm.fillText(g.dir, g.x * k, g.y * k + 3);
  // party members (even out of view)
  if (party && party.id) for (const pm of party.members) { if (pm.id === myId || ents.has(pm.id)) continue; mm.fillStyle = '#8fe3a0'; mm.beginPath(); mm.arc(pm.x * k, pm.y * k, 2, 0, 7); mm.fill(); }
  for (const e of ents.values()) { if (e.st === 4 || e.rx === null || e.kind === 3) continue; if (e.kind === 4) { mm.fillStyle = '#a8e0a0'; mm.fillRect(e.rx * k - 1, e.ry * k - 1, 2, 2); continue; }
    if (e.boss) { mm.fillStyle = '#ff9a4a'; star(mm, e.rx * k, e.ry * k, 4); continue; }
    mm.fillStyle = e.id === myId ? '#ffd86b' : e.kind === 1 ? (inParty(e.id) ? '#8fe3a0' : e.flag === 2 ? '#ff5a4a' : '#7ab4ff') : e.elite ? '#f2d16a' : '#d03a2a'; const r = e.id === myId ? 3 : e.elite ? 2.2 : 1.6; mm.beginPath(); mm.arc(e.rx * k, e.ry * k, r, 0, 7); mm.fill(); }
}
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

// ───────────────────────── HUD
let lastZone = '';
const nightLabel = p => { const n = Math.sin((p - .25) * Math.PI * 2); return n < .2 ? '낮' : n < .6 ? (p < .5 ? '황혼' : '새벽') : '밤'; };
function hud() {
  if (!meStats) return; const [hp, mhp, mp, mmp, lv, xp, need, gold, atk, def, align] = meStats;
  $('hpb').style.width = (100 * hp / mhp) + '%'; $('hpt').textContent = `${hp} / ${mhp}`; $('mpb').style.width = (100 * mp / mmp) + '%'; $('mpt').textContent = `${mp} / ${mmp}`;
  $('pcls').classList.toggle('bless', !!meStats[20]);
  $('xpb').style.width = (100 * xp / need) + '%'; $('xpt').textContent = `${(100 * xp / need).toFixed(1)}%`; $('plv').textContent = lv; $('gold').textContent = gold;
  $('align').textContent = align < 0 ? `카오틱 ${align}` : `성향 ${align}`; $('align').style.color = align < 0 ? '#ff6a5a' : '';
  if (me) { const safe = isSafe(me.x, me.y); const z = safe ? '성내 · 안전 지대' : '성 밖 · PK 허용'; if (z !== lastZone) { lastZone = z; $('zonet').textContent = z; $('zone').classList.toggle('danger', !safe); if (!safe) tip('outside'); } }
  if (hp < mhp * .4 && hp > 0) tip('lowhp'); if (meStats[21]) tip('party');
  $('online').textContent = `주변 ${online}명 · ${latency}ms`; $('pcls').textContent = classInfo(meStats[11]).name; const sk = classInfo(meStats[11]).skill; $('skName').textContent = sk ? sk.name : '기술'; $('cdH').style.height = (100 * Math.min(1, meStats[12] / 5000)) + '%'; $('cdS').style.height = (sk ? 100 * Math.min(1, meStats[13] / meStats[14]) : 100) + '%';
  const sk2 = classInfo(meStats[11]).skill2; $('sk2Name').textContent = sk2 ? sk2.name : '기술2'; $('cdD').style.height = (sk2 ? 100 * Math.min(1, meStats[18] / meStats[19]) : 100) + '%';
  const bb = $('bossbar'); const tgb = ents.get(targetId); if (tgb && tgb.boss && tgb.st !== 4) { bb.hidden = false; tip('boss'); $('bossname').textContent = `${tgb.name} · Lv ${tgb.level}`; $('bosshp').style.width = (100 * tgb.hp / tgb.maxHp) + '%'; $('bosshpt').textContent = `${tgb.hp} / ${tgb.maxHp}`; } else bb.hidden = true;
  const hr = Math.floor((dayPhase * 24 + 6) % 24); if (me) setAmbience({ rain: weather === 1 ? 1 : 0, fountain: Math.max(0, 1 - Math.hypot(me.x - CX, me.y - CY - .5) / 10), night: Math.max(0, Math.sin((dayPhase - .25) * Math.PI * 2)), hour: hr, inTown: isSafe(me.x, me.y) }); $('clock').textContent = `${String(hr).padStart(2, '0')}시 ${nightLabel(dayPhase)}`;
  const cnt = id => ui.state.inv.filter(x => x.id === id).reduce((a, x) => a + x.n, 0); $('n1').textContent = cnt('hpPotion'); $('n2').textContent = cnt('mpPotion'); $('n3').textContent = cnt('scroll');
  const tg = ents.get(targetId); if (tg && tg.st !== 4) { $('target').hidden = false; $('tname').textContent = tg.name; $('tlv').textContent = `Lv ${tg.level}`; $('thpb').style.width = (100 * tg.hp / tg.maxHp) + '%'; } else $('target').hidden = true;
  $('dead').hidden = !(me && me.st === 4);
  const rb = $('raidbar'); if (raidState) { rb.hidden = false; const DIRN = { S: '남', E: '동', N: '북', W: '서' }; rb.textContent = `⚔ ${DIRN[raidState[0]]}문 습격 · 남은 ${raidState[1]}마리 · ${Math.floor(raidState[2] / 60)}:${String(raidState[2] % 60).padStart(2, '0')}`; } else rb.hidden = true;
}

// ───────────────────────── render loop
let last = performance.now(), frameN = 0;
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t; frameN++;
  for (const e of ents.values()) { if (e.rx === null) continue; const k = Math.min(1, dt * 14); e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k; }
  if (me && me.rx !== null) { const [sx, sy] = toS(me.rx, me.ry); cam.x += (sx - cam.x) * Math.min(1, dt * 10); cam.y += (sy - 24 - cam.y) * Math.min(1, dt * 10); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#14130f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (myId) {
    const s = DPR * zoom; ctx.setTransform(s, 0, 0, s, (VW / 2 - cam.x * zoom) * DPR, (VH / 2 - cam.y * zoom) * DPR);
    const hw = VW / 2 / zoom + TW * 2, hh = VH / 2 / zoom + TH * 2;
    // ground chunks overlapping the view
    chunkBudget = 2; const corners = [toW(cam.x - hw, cam.y - hh), toW(cam.x + hw, cam.y - hh), toW(cam.x - hw, cam.y + hh), toW(cam.x + hw, cam.y + hh)];
    const cx0 = clamp(Math.floor(Math.min(...corners.map(c => c[0])) / CH), 0, MAP / CH - 1), cx1 = clamp(Math.floor(Math.max(...corners.map(c => c[0])) / CH), 0, MAP / CH - 1);
    const cy0 = clamp(Math.floor(Math.min(...corners.map(c => c[1])) / CH), 0, MAP / CH - 1), cy1 = clamp(Math.floor(Math.max(...corners.map(c => c[1])) / CH), 0, MAP / CH - 1);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = getChunk(cx, cy); if (c) ctx.drawImage(c.c, c.left, c.top, c.w, c.h); }
    // water shimmer
    ctx.strokeStyle = 'rgba(210,235,255,.22)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let x = Math.max(0, Math.floor(Math.min(...corners.map(c => c[0])))); x < Math.min(MAP, Math.ceil(Math.max(...corners.map(c => c[0])))); x++) { const y = W.riverY[x]; for (const yy of [y - 1, y, y + 1]) { const [sx, sy] = toS(x + .5, yy + .5); if (Math.abs(sx - cam.x) > hw || Math.abs(sy - cam.y) > hh) continue; const ph = t / 900 + x * .7 + yy; ctx.moveTo(sx - 10 + Math.sin(ph) * 6, sy + Math.cos(ph * .8) * 3); ctx.quadraticCurveTo(sx + Math.sin(ph) * 6, sy - 3 + Math.cos(ph * .8) * 3, sx + 10 + Math.sin(ph) * 6, sy + Math.cos(ph * .8) * 3); } }
    ctx.stroke();
    // click markers
    for (let i = clicks.length - 1; i >= 0; i--) { const c = clicks[i]; const a = 1 - (t - c.t0) / 600; if (a <= 0) { clicks.splice(i, 1); continue; } const [sx, sy] = toS(c.x, c.y); ctx.strokeStyle = `rgba(255,225,150,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 10 + (1 - a) * 14, 5 + (1 - a) * 7, 0, 0, 7); ctx.stroke(); }
    for (let i = tele.length - 1; i >= 0; i--) { const q = tele[i]; const p = (t - q.t0) / q.life; if (p >= 1) { tele.splice(i, 1); continue; }
      if (q.k === 'slam') { const [sx, sy] = toS(q.x, q.y); ctx.strokeStyle = `rgba(255,70,50,${.5 + .4 * Math.sin(t / 60)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, q.r * TW / 2, q.r * TH / 2, 0, 0, 7); ctx.stroke(); ctx.fillStyle = `rgba(255,70,50,${.1 + p * .25})`; ctx.beginPath(); ctx.ellipse(sx, sy, q.r * TW / 2 * p, q.r * TH / 2 * p, 0, 0, 7); ctx.fill(); }
      else if (q.k === 'charge' && q.from && q.from.rx !== null) { const [ax, ay] = toS(q.from.rx, q.from.ry), [bx, by] = toS(q.x, q.y); ctx.strokeStyle = 'rgba(255,90,50,.75)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]); } }
    // depth-sorted statics + entities
    const list = [];
    for (const o of statics) { const [sx, sy] = toS(o.x, o.y); if (sx + o.m.w * SC < cam.x - hw || sx - o.m.w * SC > cam.x + hw || sy - o.m.h * SC > cam.y + hh || sy + o.m.h * SC < cam.y - hh) continue; list.push([o.depth, 0, o]); }
    for (const e of ents.values()) { if (e.rx === null) continue; if (e.st === 4 && t - e.deadT > 4000) continue; list.push([e.rx + e.ry + (e.st === 4 || e.kind === 3 ? -.3 : 0), 1, e]); }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, k, o] of list) k ? drawEntity(o, t) : drawStatic(o);
    for (let i = chainsFx.length - 1; i >= 0; i--) { const c = chainsFx[i]; const p = (t - c.t0) / 260; if (p >= 1) { chainsFx.splice(i, 1); continue; } const [ax, ay] = toS(c.a.rx, c.a.ry), [bx, by] = toS(c.b.rx, c.b.ry); ctx.strokeStyle = `rgba(170,215,255,${1 - p})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, ay - 28); for (let k2 = 1; k2 < 5; k2++) { const u = k2 / 5; ctx.lineTo(ax + (bx - ax) * u + (Math.random() - .5) * 12, ay - 28 + (by - ay) * u + (Math.random() - .5) * 12); } ctx.lineTo(bx, by - 28); ctx.stroke(); }
    // projectiles
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; const p = (t - b.t0) / b.dur; if (p >= 1) { bolts.splice(i, 1); continue; } const [ax, ay] = toS(b.a.rx, b.a.ry), [bx, by] = toS(b.b.rx, b.b.ry); const x = ax + (bx - ax) * p, y = ay + (by - ay) * p - 30 - Math.sin(p * Math.PI) * 14; const gr = ctx.createRadialGradient(x, y, 0, x, y, 10); gr.addColorStop(0, 'rgba(230,240,255,1)'); gr.addColorStop(.35, 'rgba(120,180,255,.8)'); gr.addColorStop(1, 'rgba(80,120,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; const p = (t - r.t0) / r.life; if (p >= 1) { rings.splice(i, 1); continue; } const [sx, sy] = toS(r.x, r.y); const rr = r.r * (.3 + p * .7); if (r.fill) { const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr); gr.addColorStop(0, `rgba(${r.col},${.55 * (1 - p)})`); gr.addColorStop(1, `rgba(${r.col},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * .5, 0, 0, 7); ctx.fill(); } ctx.strokeStyle = `rgba(${r.col},${1 - p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy - 2, rr, rr * .5, 0, 0, 7); ctx.stroke(); }
    // labels, hp bars, chat bubbles, floating numbers (screen-aligned)
    ctx.textAlign = 'center';
    for (const o of statics) if (o.name && o.building !== 'well' && !o.building.startsWith('home')) { const [sx, sy] = toS(o.x, o.y); if (Math.abs(sx - cam.x) > hw || Math.abs(sy - cam.y) > hh) continue; ctx.font = "500 11px 'Noto Sans KR'"; const tw = ctx.measureText(o.name).width + 14; ctx.fillStyle = 'rgba(16,14,12,.78)'; ctx.fillRect(sx - tw / 2, sy + 8, tw, 18); ctx.fillStyle = '#e8d3a4'; ctx.fillText(o.name, sx, sy + 21); }
    for (const e of ents.values()) {
      if (e.rx === null || e.st === 4) continue; const [sx, sy] = toS(e.rx, e.ry);
      if (e.kind === 3) { if (e.id !== hoverId && Math.hypot(e.x - (me ? me.x : 0), e.y - (me ? me.y : 0)) > 5) continue; ctx.font = "500 10.5px 'Noto Sans KR'"; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(e.name, sx, sy - 26); ctx.fillStyle = e.sprite === 'gold' ? '#ffd86b' : '#e8e0cf'; ctx.fillText(e.name, sx, sy - 26); continue; }
      const y = sy - headY(e) - 8;
      ctx.font = (e.id === myId || e.boss ? "700 12px" : "500 11px") + " 'Noto Sans KR'"; const label = e.kind === 2 ? `${e.name} Lv${e.level}` : e.title ? `${e.title} ${e.name}` : e.name;
      if (!SETTINGS.names && e.id !== myId && e.id !== targetId && !e.boss) continue; if (SETTINGS.hideOthersNames && e.kind === 1 && e.id !== myId && e.id !== targetId && !inParty(e.id)) continue;
      if (e.kind === 4 && questMarks[e.extra]) { ctx.font = "700 16px 'Noto Sans KR'"; const qm = questMarks[e.extra] === 2 ? '?' : '!'; const qy = y - 16 - Math.abs(Math.sin(t / 400)) * 4; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(qm, sx, qy); ctx.fillStyle = '#ffd86b'; ctx.fillText(qm, sx, qy); ctx.font = "500 11px 'Noto Sans KR'"; }
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(label, sx, y); ctx.fillStyle = e.boss ? '#ff9a4a' : e.elite ? '#f2d16a' : entColor(e); ctx.fillText(label, sx, y);
      if (e.guild) { ctx.font = "500 9.5px 'Noto Sans KR'"; ctx.strokeText(`〔${e.guild}〕`, sx, y - 12); ctx.fillStyle = '#d8c27a'; ctx.fillText(`〔${e.guild}〕`, sx, y - 12); }
      if (e.kind !== 4 && e.id !== myId && (e.hp < e.maxHp || e.id === targetId)) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(sx - 18, y + 4, 36, 5); ctx.fillStyle = e.id === targetId ? '#ff5a4a' : '#c0392b'; ctx.fillRect(sx - 18, y + 4, 36 * clamp(e.hp / e.maxHp, 0, 1), 5); }
      if (e.say && t - e.sayT < 5000) { ctx.font = "500 12px 'Noto Sans KR'"; const txt = e.say.length > 28 ? e.say.slice(0, 27) + '…' : e.say; const w = ctx.measureText(txt).width + 16; ctx.fillStyle = 'rgba(250,246,236,.94)'; ctx.fillRect(sx - w / 2, y - 34, w, 22); ctx.beginPath(); ctx.moveTo(sx - 5, y - 12); ctx.lineTo(sx + 5, y - 12); ctx.lineTo(sx, y - 6); ctx.fill(); ctx.fillStyle = '#1a1612'; ctx.fillText(txt, sx, y - 19); }
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; const life = f.life || 900; const p = (t - f.t0) / life; if (p >= 1) { floats.splice(i, 1); continue; } const [sx, sy] = toS(f.x, f.y); ctx.font = `700 ${f.big ? 17 : 14}px 'Noto Sans KR'`; ctx.globalAlpha = 1 - p * p; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; const y = sy - f.h - 12 - p * 34; ctx.strokeText(f.txt, sx, y); ctx.fillStyle = f.col; ctx.fillText(f.txt, sx, y); ctx.globalAlpha = 1; }
    // weather (server-synchronised): rain streaks + cool tint, or fog with a clear circle around the player
    weatherAmt += ((weather ? 1 : 0) - weatherAmt) * Math.min(1, dt * .5);
    if (weatherAmt > .02) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (weather === 1 || (weather === 0 && rainDrops.length)) { ctx.fillStyle = `rgba(40,50,70,${.22 * weatherAmt})`; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over';
        while (rainDrops.length < 160 * weatherAmt) rainDrops.push({ x: Math.random() * (VW + 200) - 100, y: Math.random() * VH, v: 600 + Math.random() * 300, l: 10 + Math.random() * 10 });
        if (weather !== 1 && rainDrops.length) rainDrops.length = Math.max(0, rainDrops.length - 3);
        ctx.strokeStyle = `rgba(200,215,240,${.35 * weatherAmt})`; ctx.lineWidth = 1; ctx.beginPath(); for (const d of rainDrops) { d.y += d.v * dt; d.x += d.v * .25 * dt; if (d.y > VH) { d.y = -20; d.x = Math.random() * (VW + 200) - 100; } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * .25, d.y - d.l); } ctx.stroke(); }
      if (weather === 2) { const [gx, gy] = me && me.rx !== null ? toS(me.rx, me.ry) : [cam.x, cam.y]; const x = (gx - cam.x) * zoom + VW / 2, y = (gy - 20 - cam.y) * zoom + VH / 2; const gr = ctx.createRadialGradient(x, y, 90 * zoom, x, y, 520 * zoom); gr.addColorStop(0, `rgba(205,210,220,${.05 * weatherAmt})`); gr.addColorStop(1, `rgba(205,210,220,${.82 * weatherAmt})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH); } }
    // day/night tint (server-synchronised)
    const night = Math.max(0, Math.sin((dayPhase - .25) * Math.PI * 2)); const nightAmt = night * night * .78;
    if (nightAmt > .02) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(18,22,52,${nightAmt})`; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter'; const glow = (wx, wy, r, a) => { const [gx, gy] = toS(wx, wy); const x = (gx - cam.x) * zoom + VW / 2, y = (gy - 20 - cam.y) * zoom + VH / 2; const gr = ctx.createRadialGradient(x, y, 0, x, y, r * zoom); gr.addColorStop(0, `rgba(255,190,110,${a * nightAmt})`); gr.addColorStop(1, 'rgba(255,190,110,0)'); ctx.fillStyle = gr; ctx.fillRect(x - r * zoom, y - r * zoom, r * zoom * 2, r * zoom * 2); };
      if (me && me.rx !== null) glow(me.rx, me.ry, 170, .55); for (const e of ents.values()) if (e.kind === 4 && e.rx !== null) glow(e.rx, e.ry, 110, .4); for (const g of GATES) glow(g.x + .5, g.y + .5, 140, .5); glow(CX, CY + .5, 120, .35);
      ctx.globalCompositeOperation = 'source-over'; }
    // vignette
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .45, VW / 2, VH / 2, Math.max(VW, VH) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (frameN % 4 === 0) { hud(); drawMinimap(); }
    const pe = pickEntity(lastMouse[0], lastMouse[1]); hoverId = pe ? pe.id : 0; canvas.style.cursor = pe ? 'pointer' : 'crosshair';
  }
  requestAnimationFrame(frame);
}
// debug/test hook: screen position of an NPC by id
window.__send = o => send(o);
window.__npcPos = id => { for (const e of ents.values()) if (e.kind === 4 && e.extra === id && e.rx !== null) { const [sx, sy] = toS(e.rx, e.ry); return [(sx - cam.x) * zoom + VW / 2, (sy - cam.y) * zoom + VH / 2 - 26 * zoom]; } return null; };
const lastMouse = [0, 0]; canvas.addEventListener('pointermove', e => { lastMouse[0] = e.clientX; lastMouse[1] = e.clientY; });
resize(); requestAnimationFrame(frame);
