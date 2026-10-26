// Ravenmoor Online client: renders the shared map and baked 3D sprites, sends intentions to the server.
import { MAP, TILE_W as TW, TILE_H as TH, G, TOWN, BUILDINGS, LOOKS, buildWorld, isSafe, noise } from '/shared/world.js';

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
function entColor(e) { if (e.id === myId) return e.flag === 2 ? '#ff6a5a' : '#ffd86b'; if (e.kind === 1) return e.flag === 2 ? '#ff6a5a' : e.flag === 1 ? '#c99cff' : '#cfe2ff'; return '#e8dcc0'; }
function charFrame(e, t) {
  const C = MF.characters[e.sprite]; if (!C) return null;
  let anim = 'idle', at = (t / 1000) % 100;
  if (e.st === 4) { anim = 'death'; at = (t - e.deadT) / 1000; }
  else if (t - e.atkT < 620) { anim = 'attack'; at = (t - e.atkT) / 1000 * 1.6; }
  else if (e.st === 1) { anim = 'walk'; at = t / 1000 * 1.55; }
  else if (t - e.hitT < 380) { anim = 'hit'; at = (t - e.hitT) / 1000 * 1.6; }
  const A = C.anims[anim]; if (!A) return null; const im = img(A.file); if (!im) return null;
  let f = Math.floor(at / A.dur * A.frames); f = A.loop ? ((f % A.frames) + A.frames) % A.frames : clamp(f, 0, A.frames - 1);
  return { im, C, f };
}
function drawEntity(e, t) {
  const [sx, sy] = toS(e.rx, e.ry); const fr = charFrame(e, t);
  if (fr) { const { im, C, f } = fr; ctx.drawImage(im, f * C.w, e.dir * C.h, C.w, C.h, sx - C.ax * SC, sy - C.ay * SC, C.w * SC, C.h * SC);
    if (t - e.hitT < 120) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35; ctx.drawImage(im, f * C.w, e.dir * C.h, C.w, C.h, sx - C.ax * SC, sy - C.ay * SC, C.w * SC, C.h * SC); ctx.restore(); } }
  else { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#888'; ctx.fillRect(sx - 6, sy - 40, 12, 40); }
  if (e.id === targetId && e.st !== 4) { ctx.strokeStyle = 'rgba(255,90,70,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 18, 9, 0, 0, 7); ctx.stroke(); }
}
function headY(e) { const C = MF.characters[e.sprite]; return C ? C.ay * SC * .62 : 50; }

// ───────────────────────── effects
const floats = [], bolts = [], clicks = [];

// ───────────────────────── networking
let ws = null, connected = false;
function connect(name, look) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { connected = true; ws.send(JSON.stringify({ t: 'join', name, look })); };
  ws.onclose = () => { connected = false; addLog('서버와 연결이 끊어졌습니다. 새로고침해서 다시 접속하세요.', 'sys'); $('jbtn').disabled = false; };
  ws.onmessage = ev => onMsg(JSON.parse(ev.data));
}
const send = o => { if (connected) ws.send(JSON.stringify(o)); };
function onMsg(m) {
  const t = performance.now();
  if (m.t === 'err') { $('jerr').textContent = m.msg; $('jbtn').disabled = false; return; }
  if (m.t === 'welcome') { myId = m.id; $('join').hidden = true; $('hud').hidden = false; $('pname').textContent = m.name; addLog(m.returning ? `${m.name}님, 다시 오신 것을 환영합니다.` : `${m.name}님, 레이븐무어에 오신 것을 환영합니다. 성문은 남쪽과 동쪽에 있습니다.`, 'sys'); try { localStorage.setItem('rm-name', m.name); } catch {} return; }
  if (m.t === 'snap') {
    for (const [id, kind, name, sprite, level, flag, maxHp] of m.m) { const e = ents.get(id) || { id, atkT: -1e9, hitT: -1e9, deadT: 0, rx: null }; Object.assign(e, { kind, name, sprite, level, flag, maxHp }); ents.set(id, e); }
    for (const [id, x, y, dir, st, hp] of m.e) { const e = ents.get(id); if (!e) continue; if (e.rx === null || Math.hypot(e.rx - x, e.ry - y) > 4) { e.rx = x; e.ry = y; } if (st === 4 && e.st !== 4) e.deadT = t; Object.assign(e, { x, y, dir, st, hp }); }
    for (const id of m.g) ents.delete(id);
    me = ents.get(myId); meStats = m.me; online = m.e.filter(e => ents.get(e[0])?.kind === 1).length; return;
  }
  if (m.t === 'ev') {
    if (m.k === 'atk') { const a = ents.get(m.a), b = ents.get(m.b); if (a) a.atkT = t; if (m.r && a && b) bolts.push({ a, b, t0: t, dur: 120 + Math.hypot(a.x - b.x, a.y - b.y) * 60 }); }
    else if (m.k === 'dmg') { const b = ents.get(m.b); if (b) { b.hitT = t; floats.push({ x: b.rx, y: b.ry, h: headY(b), txt: String(m.v), col: m.b === myId ? '#ff7b6b' : m.c ? '#ffd86b' : '#ffffff', big: !!m.c, t0: t }); } }
    else if (m.k === 'lvl') { const e = ents.get(m.id); if (e) floats.push({ x: e.rx, y: e.ry, h: headY(e) + 10, txt: 'LEVEL UP!', col: '#ffd86b', big: true, t0: t, life: 1800 }); }
    return;
  }
  if (m.t === 'chat') { if (m.sys) addLog(m.msg, 'sys'); else { addLog(`<b>${esc(m.n)}</b> ${esc(m.msg)}`, m.id === myId ? 'me' : ''); const e = ents.get(m.id); if (e) { e.say = m.msg; e.sayT = t; } } }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function addLog(html, cls) { const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = html; const L = $('log'); L.appendChild(d); while (L.children.length > 40) L.firstChild.remove(); }

// ───────────────────────── input
const cam = { x: 0, y: 0 }; let targetId = 0;
function screenToTile(px, py) { return toW((px - VW / 2) / zoom + cam.x, (py - VH / 2) / zoom + cam.y); }
function pickEntity(px, py) {
  let best = null, bd = 1e9;
  for (const e of ents.values()) { if (e.id === myId || e.st === 4 || e.rx === null) continue; const [sx, sy] = toS(e.rx, e.ry); const x = (sx - cam.x) * zoom + VW / 2, y = (sy - cam.y) * zoom + VH / 2; const dx = px - x, dy = py - (y - 26 * zoom); if (Math.abs(dx) < 20 * zoom && Math.abs(dy) < 32 * zoom) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } } }
  return best;
}
canvas.addEventListener('pointerdown', ev => {
  if (!myId) return; $('chatin').blur();
  const e = pickEntity(ev.clientX, ev.clientY);
  if (e) { targetId = e.id; send({ t: 'attack', id: e.id }); return; }
  const [x, y] = screenToTile(ev.clientX, ev.clientY); targetId = 0; send({ t: 'move', x, y }); clicks.push({ x, y, t0: performance.now() });
});
canvas.addEventListener('wheel', ev => { zoom = clamp(zoom * (ev.deltaY > 0 ? .9 : 1.1), .6, 1.8); ev.preventDefault(); }, { passive: false });
$('minimap').addEventListener('pointerdown', ev => { if (!myId) return; const r = ev.currentTarget.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * MAP, y = (ev.clientY - r.top) / r.height * MAP; send({ t: 'move', x, y }); });
addEventListener('keydown', ev => {
  if (!myId) return; const inChat = document.activeElement === $('chatin');
  if (ev.key === 'Enter' && !inChat) { $('chatin').focus(); ev.preventDefault(); return; }
  if (inChat) { if (ev.key === 'Escape') $('chatin').blur(); return; }
  const k = ev.key.toLowerCase();
  if (k === 'escape') { send({ t: 'stop' }); targetId = 0; }
  else if (k === 'a' && me) { let best = null, bd = 9; for (const e of ents.values()) { if (e.kind !== 2 || e.st === 4) continue; const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; } } if (best) { targetId = best.id; send({ t: 'attack', id: best.id }); } else addLog('근처에 공격할 몬스터가 없습니다.', 'sys'); }
});
$('chatform').addEventListener('submit', ev => { ev.preventDefault(); const v = $('chatin').value.trim(); if (v) send({ t: 'chat', msg: v }); $('chatin').value = ''; $('chatin').blur(); });

// ───────────────────────── join screen
let pickedLook = 'knight';
{
  const box = $('looks');
  for (const [k, label] of Object.entries(LOOKS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'look' + (k === pickedLook ? ' on' : ''); b.dataset.look = k;
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 192; b.appendChild(cv); b.append(label); box.appendChild(b);
    b.onclick = () => { pickedLook = k; for (const x of box.children) x.classList.toggle('on', x === b); };
  }
  let t0 = performance.now();
  const preview = () => {
    if (!$('join').hidden) {
      for (const b of box.children) { const C = MF.characters[b.dataset.look]; const A = C.anims.idle; const im = img(A.file); const g = b.firstChild.getContext('2d'); g.clearRect(0, 0, 192, 192); if (!im) continue; const f = Math.floor(((performance.now() - t0) / 1000 % A.dur) / A.dur * A.frames); const s = 192 / Math.max(C.w, C.h) * 1.15; g.drawImage(im, f * C.w, 1 * C.h, C.w, C.h, 96 - C.ax * s, 176 - C.ay * s, C.w * s, C.h * s); }
      requestAnimationFrame(preview);
    }
  };
  preview();
  try { const n = localStorage.getItem('rm-name'); if (n) $('jname').value = n; } catch {}
  $('joinform').addEventListener('submit', ev => { ev.preventDefault(); $('jerr').textContent = ''; $('jbtn').disabled = true; connect($('jname').value.trim(), pickedLook); });
}

// ───────────────────────── minimap
const mmBase = document.createElement('canvas'); mmBase.width = MAP; mmBase.height = MAP;
{ const g = mmBase.getContext('2d'); for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) { const c = GCOL[W.ground[y * MAP + x]][0]; g.fillStyle = `rgb(${c})`; if (W.block[y * MAP + x] && W.ground[y * MAP + x] !== G.WATER) g.fillStyle = W.ground[y * MAP + x] === G.COBBLE ? '#d8d0c0' : '#3a4a2a'; g.fillRect(x, y, 1, 1); } }
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  mm.imageSmoothingEnabled = false; mm.drawImage(mmBase, 0, 0, 160, 160); const k = 160 / MAP;
  for (const e of ents.values()) { if (e.st === 4 || e.rx === null) continue; mm.fillStyle = e.id === myId ? '#ffd86b' : e.kind === 1 ? (e.flag === 2 ? '#ff5a4a' : '#7ab4ff') : '#d03a2a'; const r = e.id === myId ? 3 : 1.6; mm.beginPath(); mm.arc(e.rx * k, e.ry * k, r, 0, 7); mm.fill(); }
}

// ───────────────────────── HUD
let lastZone = '';
function hud() {
  if (!meStats) return; const [hp, mhp, mp, mmp, lv, xp, need, gold, atk, def, align] = meStats;
  $('hpb').style.width = (100 * hp / mhp) + '%'; $('hpt').textContent = `${hp} / ${mhp}`; $('mpb').style.width = (100 * mp / mmp) + '%'; $('mpt').textContent = `${mp} / ${mmp}`;
  $('xpb').style.width = (100 * xp / need) + '%'; $('xpt').textContent = `${(100 * xp / need).toFixed(1)}%`; $('plv').textContent = lv; $('gold').textContent = gold;
  $('align').textContent = align < 0 ? `카오틱 ${align}` : `성향 ${align}`; $('align').style.color = align < 0 ? '#ff6a5a' : '';
  if (me) { const safe = isSafe(me.x, me.y); const z = safe ? '성내 · 안전 지대' : '성 밖 · PK 허용'; if (z !== lastZone) { lastZone = z; $('zonet').textContent = z; $('zone').classList.toggle('danger', !safe); } }
  $('online').textContent = `주변 ${online}명`;
  const tg = ents.get(targetId); if (tg && tg.st !== 4) { $('target').hidden = false; $('tname').textContent = tg.name; $('tlv').textContent = `Lv ${tg.level}`; $('thpb').style.width = (100 * tg.hp / tg.maxHp) + '%'; } else $('target').hidden = true;
  $('dead').hidden = !(me && me.st === 4);
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
    // depth-sorted statics + entities
    const list = [];
    for (const o of statics) { const [sx, sy] = toS(o.x, o.y); if (sx + o.m.w * SC < cam.x - hw || sx - o.m.w * SC > cam.x + hw || sy - o.m.h * SC > cam.y + hh || sy + o.m.h * SC < cam.y - hh) continue; list.push([o.depth, 0, o]); }
    for (const e of ents.values()) { if (e.rx === null) continue; if (e.st === 4 && t - e.deadT > 4000) continue; list.push([e.rx + e.ry + (e.st === 4 ? -.3 : 0), 1, e]); }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, k, o] of list) k ? drawEntity(o, t) : drawStatic(o);
    // projectiles
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; const p = (t - b.t0) / b.dur; if (p >= 1) { bolts.splice(i, 1); continue; } const [ax, ay] = toS(b.a.rx, b.a.ry), [bx, by] = toS(b.b.rx, b.b.ry); const x = ax + (bx - ax) * p, y = ay + (by - ay) * p - 30 - Math.sin(p * Math.PI) * 14; const gr = ctx.createRadialGradient(x, y, 0, x, y, 10); gr.addColorStop(0, 'rgba(230,240,255,1)'); gr.addColorStop(.35, 'rgba(120,180,255,.8)'); gr.addColorStop(1, 'rgba(80,120,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); }
    // labels, hp bars, chat bubbles, floating numbers (screen-aligned)
    ctx.textAlign = 'center';
    for (const o of statics) if (o.name && o.building !== 'well') { const [sx, sy] = toS(o.x, o.y); if (Math.abs(sx - cam.x) > hw || Math.abs(sy - cam.y) > hh) continue; ctx.font = "500 11px 'Noto Sans KR'"; const tw = ctx.measureText(o.name).width + 14; ctx.fillStyle = 'rgba(16,14,12,.78)'; ctx.fillRect(sx - tw / 2, sy + 8, tw, 18); ctx.fillStyle = '#e8d3a4'; ctx.fillText(o.name, sx, sy + 21); }
    for (const e of ents.values()) {
      if (e.rx === null || e.st === 4) continue; const [sx, sy] = toS(e.rx, e.ry); const y = sy - headY(e) - 8;
      ctx.font = (e.id === myId ? "700 12px" : "500 11px") + " 'Noto Sans KR'"; const label = e.kind === 2 ? `${e.name} Lv${e.level}` : e.name;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(label, sx, y); ctx.fillStyle = entColor(e); ctx.fillText(label, sx, y);
      if (e.id !== myId && (e.hp < e.maxHp || e.id === targetId)) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(sx - 18, y + 4, 36, 5); ctx.fillStyle = e.id === targetId ? '#ff5a4a' : '#c0392b'; ctx.fillRect(sx - 18, y + 4, 36 * clamp(e.hp / e.maxHp, 0, 1), 5); }
      if (e.say && t - e.sayT < 5000) { ctx.font = "500 12px 'Noto Sans KR'"; const txt = e.say.length > 28 ? e.say.slice(0, 27) + '…' : e.say; const w = ctx.measureText(txt).width + 16; ctx.fillStyle = 'rgba(250,246,236,.94)'; ctx.fillRect(sx - w / 2, y - 34, w, 22); ctx.beginPath(); ctx.moveTo(sx - 5, y - 12); ctx.lineTo(sx + 5, y - 12); ctx.lineTo(sx, y - 6); ctx.fill(); ctx.fillStyle = '#1a1612'; ctx.fillText(txt, sx, y - 19); }
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; const life = f.life || 900; const p = (t - f.t0) / life; if (p >= 1) { floats.splice(i, 1); continue; } const [sx, sy] = toS(f.x, f.y); ctx.font = `700 ${f.big ? 17 : 14}px 'Noto Sans KR'`; ctx.globalAlpha = 1 - p * p; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; const y = sy - f.h - 12 - p * 34; ctx.strokeText(f.txt, sx, y); ctx.fillStyle = f.col; ctx.fillText(f.txt, sx, y); ctx.globalAlpha = 1; }
    // vignette
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .45, VW / 2, VH / 2, Math.max(VW, VH) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (frameN % 4 === 0) { hud(); drawMinimap(); }
    const pe = pickEntity(lastMouse[0], lastMouse[1]); canvas.style.cursor = pe ? 'pointer' : 'crosshair';
  }
  requestAnimationFrame(frame);
}
const lastMouse = [0, 0]; canvas.addEventListener('pointermove', e => { lastMouse[0] = e.clientX; lastMouse[1] = e.clientY; });
resize(); requestAnimationFrame(frame);
