// Shared world definition. Imported by the server (Node ESM) and the client (browser ESM).
// Everything here must be deterministic so both sides build the identical map.

export const MAP = 128;
export const TILE_W = 64, TILE_H = 32;
export const TOWN = { x0: 52, y0: 52, x1: 76, y1: 76 };          // wall ring, inclusive
export const SPAWN = { x: 64.5, y: 69.5 };                      // plaza, in front of the keep
export const VIEW_RADIUS = 26;                                   // tiles sent to each client
export const TICK_HZ = 20, SNAP_HZ = 10;

export const G = { GRASS: 0, DIRT: 1, ROAD: 2, COBBLE: 3, WATER: 4, SAND: 5, DARK: 6, ASH: 7, BRIDGE: 8 };

export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

export const inTownInterior = (x, y) => x > TOWN.x0 && x < TOWN.x1 && y > TOWN.y0 && y < TOWN.y1;

// Buildings: center (cx,cy) in tile units, footprint w×h tiles, door tile, shop/role id.
export const BUILDINGS = [
  { id: 'keep',      sprite: 'castle',     name: '레이븐무어 성',  cx: 64, cy: 58.5, w: 4, h: 4 },
  { id: 'smith',     sprite: 'blacksmith', name: '대장간',        cx: 57, cy: 57,  w: 3, h: 3, door: [57, 59] },
  { id: 'inn',       sprite: 'tavern',     name: '여관',          cx: 71, cy: 57,  w: 3, h: 3, door: [71, 59] },
  { id: 'chapel',    sprite: 'church',     name: '예배당',        cx: 57, cy: 64,  w: 2, h: 3, door: [57, 66] },
  { id: 'market',    sprite: 'market',     name: '시장',          cx: 71, cy: 64,  w: 3, h: 3, door: [71, 66] },
  { id: 'knights',   sprite: 'barracks',   name: '기사단',        cx: 57, cy: 71,  w: 3, h: 3, door: [59, 71] },
  { id: 'magetower', sprite: 'magetower',  name: '마법사 탑',     cx: 71, cy: 71,  w: 2, h: 2, door: [69, 71] },
  { id: 'well',      sprite: 'well',       name: '우물',          cx: 64, cy: 64.5, w: 1, h: 1 },
];

export const GATES = [ { x: 64, y: TOWN.y1, sprite: 'gate_x' }, { x: TOWN.x1, y: 64, sprite: 'gate_z' } ];

// Monster tiers by distance from the town centre.
export const MONSTERS = {
  skel_minion:  { name: '해골 졸개',   level: 2,  hp: 50,  atk: 8,  def: 2,  exp: 20,  gold: [3, 9],    speed: 2.6, aggro: 5, ring: [16, 30], count: 34 },
  skel_rogue:   { name: '해골 도적',   level: 5,  hp: 95,  atk: 13, def: 4,  exp: 42,  gold: [8, 16],   speed: 3.0, aggro: 6, ring: [26, 42], count: 26 },
  skel_warrior: { name: '해골 전사',   level: 9,  hp: 180, atk: 21, def: 9,  exp: 90,  gold: [15, 30],  speed: 2.5, aggro: 6, ring: [36, 54], count: 22 },
  skel_mage:    { name: '해골 마법사', level: 13, hp: 210, atk: 30, def: 8,  exp: 150, gold: [28, 50],  speed: 2.4, aggro: 7, ring: [44, 62], count: 14, ranged: 4.5 },
  // bosses: fixed lairs, long respawn, telegraphed skills (see server bossAI)
  boss_fang:    { name: '회색 송곳니',   level: 7,  hp: 650,  atk: 20, def: 6,  exp: 420,  gold: [80, 140],  speed: 3.6, aggro: 8, fixed: [84.5, 92.5], count: 1, boss: true, sprite: 'skel_rogue', scale: 1.45, respawn: 180000,
    skills: [{ k: 'howl', cd: 14000 }, { k: 'lunge', cd: 6000, mul: 1.8 }] },
  boss_paladin: { name: '타락한 성기사', level: 12, hp: 1400, atk: 36, def: 14, exp: 1100, gold: [160, 260], speed: 2.6, aggro: 8, fixed: [96.5, 38.5], count: 1, boss: true, sprite: 'skel_warrior', scale: 1.5, respawn: 240000,
    skills: [{ k: 'slam', cd: 9000, mul: 2.4, r: 2.0, wind: 1000 }] },
  boss_chief:   { name: '족장 크루쉬',   level: 18, hp: 2600, atk: 52, def: 18, exp: 2400, gold: [300, 520], speed: 3.0, aggro: 8, fixed: [31.5, 32.5], count: 1, boss: true, sprite: 'barbarian', scale: 1.6, respawn: 300000,
    skills: [{ k: 'charge', cd: 8000, mul: 2.0 }, { k: 'roar', cd: 14000, r: 3 }] },
  boss_lich:    { name: '리치 왕',       level: 25, hp: 4200, atk: 70, def: 22, exp: 5200, gold: [500, 900], speed: 2.3, aggro: 9, fixed: [20.5, 100.5], count: 1, boss: true, sprite: 'skel_mage', scale: 1.7, ranged: 5, respawn: 420000,
    skills: [{ k: 'slam', cd: 10000, mul: 2.8, r: 2.6, wind: 1100 }, { k: 'summon', cd: 20000 }, { k: 'regen', cd: 25000 }] },
};

export const LOOKS = { knight: '기사', barbarian: '야만전사', rogue: '도적', mage: '마법사' };

export function buildWorld() {
  const N = MAP * MAP;
  const ground = new Uint8Array(N), block = new Uint8Array(N), monsterBlock = new Uint8Array(N);
  const objects = [];   // {key,x,y} sprite placements (x,y = model origin in tile coords)
  const R = rng(20261026);
  const idx = (x, y) => y * MAP + x;
  const cx = (TOWN.x0 + TOWN.x1) / 2 + .5, cy = (TOWN.y0 + TOWN.y1) / 2 + .5;
  const riverY = []; for (let x = 0; x < MAP; x++) riverY.push(108 + Math.round((noise(x * .05, 3.7) - .5) * 10));

  // ground
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    let g = G.GRASS;
    const d = Math.max(Math.abs(x + .5 - cx), Math.abs(y + .5 - cy));
    const n = noise(x * .08, y * .08);
    if (x <= TOWN.x1 && x >= TOWN.x0 && y <= TOWN.y1 && y >= TOWN.y0) g = G.COBBLE;
    else {
      const dx = x - cx, dy = y - cy;
      if (dx < -6 && dy < -6 && d > 20) g = n > .45 ? G.ASH : G.DIRT;                    // north-west badlands
      else if (dx > 6 && dy < -2 && d > 18) g = n > .55 ? G.DARK : G.GRASS;              // eastern dark forest
      else if (n > .66) g = G.DIRT;
      if (Math.abs(y - riverY[x]) <= 1) g = G.WATER;
      else if (Math.abs(y - riverY[x]) === 2) g = G.SAND;
    }
    ground[idx(x, y)] = g;
  }
  // roads from the gates
  for (let y = TOWN.y1 + 1; y < MAP; y++) for (const x of [63, 64, 65]) ground[idx(x, y)] = ground[idx(x, y)] === G.WATER ? G.BRIDGE : (ground[idx(x, y)] === G.SAND ? G.BRIDGE : G.ROAD);
  for (let x = TOWN.x1 + 1; x < MAP; x++) for (const y of [63, 64, 65]) ground[idx(x, y)] = G.ROAD;
  for (let y = TOWN.y0 + 1; y < TOWN.y1; y++) for (let x = TOWN.x0 + 1; x < TOWN.x1; x++) if (Math.abs(x - 64) <= 1 || Math.abs(y - 64) <= 1) ground[idx(x, y)] = G.ROAD;

  // walls: segments are 2 tiles long; towers on the corners; gates in the south and east
  const wallTile = (x, y) => { block[idx(x, y)] = 1; };
  for (let x = TOWN.x0; x <= TOWN.x1; x++) { wallTile(x, TOWN.y0); wallTile(x, TOWN.y1); }
  for (let y = TOWN.y0; y <= TOWN.y1; y++) { wallTile(TOWN.x0, y); wallTile(TOWN.x1, y); }
  const gateTiles = [[63, TOWN.y1], [64, TOWN.y1], [65, TOWN.y1], [TOWN.x1, 63], [TOWN.x1, 64], [TOWN.x1, 65]];
  for (const [x, y] of gateTiles) block[idx(x, y)] = 0;
  for (let x = TOWN.x0 + 1; x < TOWN.x1; x += 2) {
    objects.push({ key: 'wall_x', x: x + 1, y: TOWN.y0 + .5 });
    if (Math.abs(x + 1 - 64.5) > 1.6) objects.push({ key: 'wall_x', x: x + 1, y: TOWN.y1 + .5 });
  }
  for (let y = TOWN.y0 + 1; y < TOWN.y1; y += 2) {
    objects.push({ key: 'wall_z', x: TOWN.x0 + .5, y: y + 1 });
    if (Math.abs(y + 1 - 64.5) > 1.6) objects.push({ key: 'wall_z', x: TOWN.x1 + .5, y: y + 1 });
  }
  objects.push({ key: 'gate_x', x: 64.5, y: TOWN.y1 + .5 });
  objects.push({ key: 'gate_z', x: TOWN.x1 + .5, y: 64.5 });
  for (const [x, y] of [[TOWN.x0, TOWN.y0], [TOWN.x1, TOWN.y0], [TOWN.x0, TOWN.y1], [TOWN.x1, TOWN.y1]]) objects.push({ key: 'tower', x: x + .5, y: y + .5 });
  for (const [x, y] of [[62, TOWN.y1], [67, TOWN.y1], [TOWN.x1, 62], [TOWN.x1, 67]]) objects.push({ key: 'flag', x: x + .5, y: y + .5 });

  // buildings
  for (const b of BUILDINGS) {
    objects.push({ key: b.sprite, x: b.cx, y: b.cy, building: b.id });
    for (let y = Math.floor(b.cy - b.h / 2); y < Math.ceil(b.cy + b.h / 2); y++) for (let x = Math.floor(b.cx - b.w / 2); x < Math.ceil(b.cx + b.w / 2); x++) block[idx(x, y)] = 1;
  }
  // town decoration
  const deco = [['barrel', 60.5, 59.5], ['barrel', 60.6, 60.4], ['crate', 59.6, 60.2], ['weaponrack', 60.5, 70], ['target', 61, 68.2], ['sack', 74, 62.4], ['crate', 74.2, 66.5], ['lumber', 54.6, 60.2], ['wheelbarrow', 68.2, 61.2], ['tree_a', 54.6, 67.5], ['tree_b', 74, 74], ['tree_a', 54.5, 74.2]];
  for (const [k, x, y] of deco) { objects.push({ key: k, x, y }); if (k.startsWith('tree')) block[idx(Math.floor(x), Math.floor(y))] = 1; }

  // wilderness: forests, rocks, mountains along the border
  const free = (x, y, r) => { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) return false; if (block[idx(xx, yy)]) return false; const g = ground[idx(xx, yy)]; if (g === G.ROAD || g === G.WATER || g === G.BRIDGE || g === G.COBBLE) return false; } return true; };
  for (let y = 2; y < MAP - 2; y++) for (let x = 2; x < MAP - 2; x++) {
    const d = Math.max(Math.abs(x + .5 - cx), Math.abs(y + .5 - cy)); if (d < 17) continue;
    const g = ground[idx(x, y)]; const r = R();
    let key = null, rad = 0;
    if (g === G.DARK || (g === G.GRASS && x > cx + 6 && y < cy - 2)) { if (r < .07) { key = R() < .5 ? 'trees_al' : 'trees_bl'; rad = 1; } else if (r < .13) { key = R() < .5 ? 'tree_a' : 'tree_b'; } }
    else if (g === G.ASH || g === G.DIRT) { if (r < .025) key = ['rock_a', 'rock_b', 'rock_c', 'rock_d'][Math.floor(R() * 4)]; else if (r < .032) key = 'tree_b'; }
    else if (g === G.GRASS) { if (r < .018) key = R() < .5 ? 'tree_a' : 'tree_b'; else if (r < .024) { key = 'trees_am'; rad = 1; } else if (r < .03) key = ['rock_a', 'rock_c'][Math.floor(R() * 2)]; }
    if (key && free(x, y, rad + 1)) { objects.push({ key, x: x + .5, y: y + .5 }); for (let yy = y - rad; yy <= y + rad; yy++) for (let xx = x - rad; xx <= x + rad; xx++) block[idx(xx, yy)] = 1; }
  }
  for (let i = 0; i < MAP; i += 5) for (const [x, y] of [[i + 2, 1.5], [i + 2, MAP - 2], [1.5, i + 2], [MAP - 2, i + 2]]) objects.push({ key: (i / 5) % 3 === 0 ? 'mountain' : 'hills', x, y });
  for (let i = 0; i < MAP; i++) { for (let k = 0; k < 3; k++) { block[idx(i, k)] = 1; block[idx(i, MAP - 1 - k)] = 1; block[idx(k, i)] = 1; block[idx(MAP - 1 - k, i)] = 1; } }
  // a camp in the badlands
  for (const [k, x, y] of [['tent', 30, 30], ['tent', 34, 28.5], ['tent', 29, 35], ['lumber', 32, 33], ['barrel', 33.5, 31], ['flag', 31, 31]]) { objects.push({ key: k, x, y }); if (k === 'tent') block[idx(Math.floor(x), Math.floor(y))] = 1; }

  for (let i = 0; i < N; i++) { if (ground[i] === G.WATER) block[i] = 1; monsterBlock[i] = block[i]; }
  for (let y = TOWN.y0; y <= TOWN.y1; y++) for (let x = TOWN.x0; x <= TOWN.x1; x++) monsterBlock[idx(x, y)] = 1;

  // sort objects back-to-front once (depth = x + y of the origin)
  objects.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  return { ground, block, monsterBlock, objects, riverY };
}

export const isSafe = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= TOWN.x0 && tx <= TOWN.x1 && ty >= TOWN.y0 && ty <= TOWN.y1; };

// 8-way A* with no corner cutting. blk: Uint8Array of blocked tiles.
export function findPath(blk, sx, sy, tx, ty, maxIter = 6000) {
  const B = (x, y) => x < 0 || y < 0 || x >= MAP || y >= MAP || blk[y * MAP + x];
  if (B(tx, ty)) { let best = null, bd = 1e9; for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (!B(tx + dx, ty + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [tx + dx, ty + dy]; } } } if (!best) return null;[tx, ty] = best; }
  if (sx === tx && sy === ty) return [];
  const g = new Map(), came = new Map(), closed = new Set(); const heap = [];
  const key = (x, y) => y * MAP + x; const hf = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const sk = key(sx, sy), tk = key(tx, ty); g.set(sk, 0); push(hf(sx, sy), sk);
  let it = 0;
  while (heap.length && it++ < maxIter) {
    const [, k] = pop(); if (closed.has(k)) continue;
    if (k === tk) { const out = []; let c = k; while (c !== sk) { out.push([c % MAP, (c / MAP) | 0]); c = came.get(c); } return out.reverse(); }
    closed.add(k); const x = k % MAP, y = (k / MAP) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (B(nx, ny)) continue; if (dx && dy && (B(x + dx, y) || B(x, y + dy))) continue;
      const nk = key(nx, ny); if (closed.has(nk)) continue; const ng = g.get(k) + (dx && dy ? 1.414 : 1);
      if (ng < (g.get(nk) ?? 1e9)) { g.set(nk, ng); came.set(nk, k); push(ng + hf(nx, ny), nk); }
    }
  }
  return null;
}

export const expNeed = l => Math.floor(40 * Math.pow(l, 1.5));
export function statsFor(level) { return { maxHp: 100 + (level - 1) * 22, maxMp: 40 + (level - 1) * 8, atk: 10 + (level - 1) * 3, def: 2 + (level - 1) * 1.2 }; }
// direction index (0..7) for a move/look vector in tile space; matches the yaw the sprites were baked at
export const dirOf = (dx, dy) => ((Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) % 8) + 8) % 8;
