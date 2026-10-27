// Shared world definition. Imported by the server (Node ESM) and the client (browser ESM).
// Everything here must be deterministic so both sides build the identical map.

export const OVER = 176;                                          // overworld is 0..OVER-1 on both axes
export const MAP = 320;                                           // full grid: overworld, the catacomb strip to the east, instance slots to the south
export const TILE_W = 64, TILE_H = 32;
export const TOWN = { x0: 64, y0: 64, x1: 112, y1: 112 };        // wall ring, inclusive (48×48)
export const CX = 88, CY = 88;                                   // town centre (plaza fountain)
export const SPAWN = { x: 88.5, y: 93.5 };                      // plaza, south of the fountain
export const GATES = [ { x: 88, y: TOWN.y1, sprite: 'gate_x', dir: 'S' }, { x: TOWN.x1, y: 88, sprite: 'gate_z', dir: 'E' }, { x: 88, y: TOWN.y0, sprite: 'gate_x', dir: 'N' }, { x: TOWN.x0, y: 88, sprite: 'gate_z', dir: 'W' } ];
export const VIEW_RADIUS = 26;                                   // tiles sent to each client
export const TICK_HZ = 20, SNAP_HZ = 10;

export const G = { GRASS: 0, DIRT: 1, ROAD: 2, COBBLE: 3, WATER: 4, SAND: 5, DARK: 6, ASH: 7, BRIDGE: 8, CRYPT: 9, VOID: 10, ABBEY: 11 };

// ── the catacombs: a chain of rooms carved into the strip east of the overworld. It sits more than VIEW_RADIUS
// tiles from any overworld tile, so snapshots and broadcasts never mix the two. Deeper (further south) = stronger.
export const DUNGEON = { x0: 200, y0: 4, x1: 251, y1: 171, name: '잊힌 지하 묘지' };
export const inDungeon = (x, y) => x >= DUNGEON.x0 - 4 && x <= DUNGEON.x1 + 4 && y >= DUNGEON.y0 - 4 && y <= DUNGEON.y1 + 4;
// rooms [cx, cy, w, h] in walking order; the last one is the lord's chamber
export const CRYPT_ROOMS = [[214, 12, 10, 8], [234, 22, 12, 10], [212, 36, 12, 10], [236, 50, 12, 10], [214, 66, 12, 10], [238, 80, 12, 10], [214, 94, 12, 10], [238, 108, 12, 10], [214, 124, 12, 10], [236, 138, 12, 10], [225, 158, 20, 14]];
export const CRYPT_ENTRANCE = { x: 52, y: 136 };                 // overworld, south-west of town
// stepping on a portal tile moves you to (tx, ty); arrival spots are never portal tiles
export const PORTALS = [
  { x: 52, y: 136, tx: 214.5, ty: 12.5, msg: '어둡고 축축한 계단을 따라 지하 묘지로 내려갑니다…' },
  { x: 210, y: 9, tx: 52.5, ty: 138.5, msg: '지상으로 올라왔습니다.' },
  { x: 225, y: 163, tx: 52.5, ty: 138.5, msg: '안식처 뒤편 통로를 따라 지상으로 올라왔습니다.' },
];
// ── instanced dungeon 잿빛 수도원: ten identical copies ("slots") in two rows along the south edge, each more than
// VIEW_RADIUS from everything else. A party (or a solo player) gets a slot of its own; the server hands them out.
export const ABBEY = { name: '잿빛 수도원', w: 40, h: 44, minLevel: { normal: 20, hard: 26 }, entry: [20.5, 4.5], exit: [16, 2] };
export const ABBEY_SLOTS = [204, 275].flatMap(y0 => [4, 72, 140, 208, 276].map(x0 => ({ x0, y0 })));
export const ABBEY_ROOMS = [[20, 4, 10, 6], [20, 13, 14, 8], [8, 22, 12, 10], [30, 22, 10, 8], [30, 32, 12, 10], [14, 37, 22, 12]];   // [cx, cy, w, h] in slot coordinates
export const ABBEY_ENTRANCE = { x: 97, y: 36 };                  // overworld, east of the north road
// who lives in each copy, in slot coordinates (bosses: chapel, bell tower, abbot's hall)
export const ABBEY_SPAWNS = [['abbey_acolyte', 17, 12], ['abbey_brute', 23, 12], ['abbey_brute', 20, 15], ['boss_monk', 8, 22],
  ['abbey_brute', 28, 21], ['abbey_acolyte', 32, 23], ['abbey_brute', 31, 20], ['boss_bell', 30, 33], ['abbey_acolyte', 21, 33], ['abbey_brute', 18, 31], ['boss_abbot', 11, 38]];
export const instanceAt = (x, y) => { for (let i = 0; i < ABBEY_SLOTS.length; i++) { const s = ABBEY_SLOTS[i]; if (x >= s.x0 - 3 && x <= s.x0 + ABBEY.w + 3 && y >= s.y0 - 3 && y <= s.y0 + ABBEY.h + 3) return i; } return -1; };
PORTALS.push({ x: ABBEY_ENTRANCE.x - 1, y: ABBEY_ENTRANCE.y, inst: 'normal' }, { x: ABBEY_ENTRANCE.x + 1, y: ABBEY_ENTRANCE.y, inst: 'hard' },
  ...ABBEY_SLOTS.map(s => ({ x: s.x0 + ABBEY.exit[0], y: s.y0 + ABBEY.exit[1], tx: ABBEY_ENTRANCE.x + .5, ty: ABBEY_ENTRANCE.y + 3.5, msg: '수도원 밖으로 나왔습니다.' })));
export const portalAt = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return PORTALS.find(p => p.x === tx && p.y === ty) || null; };
export const cryptFloor = y => y < 60 ? 1 : y < 116 ? 2 : y < 150 ? 3 : 4;
export const CRYPT_FLOOR_NAME = ['', '1층 · 납골 회랑', '2층 · 망자의 예배실', '3층 · 심연의 통로', '모르바스의 안식처'];

export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

export const inTownInterior = (x, y) => x > TOWN.x0 && x < TOWN.x1 && y > TOWN.y0 && y < TOWN.y1;

// Buildings: center (cx,cy) in tile units, footprint w×h tiles. Districts: keep (N), craft (NW), market (NE), guild (SW), chapel (SE), homes along the ring road.
export const BUILDINGS = [
  { id: 'keep',      sprite: 'castle',     name: '레이븐무어 성',  cx: 88, cy: 72.5, w: 5, h: 5 },
  { id: 'smith',     sprite: 'blacksmith', name: '대장간',        cx: 74, cy: 75, w: 3, h: 3 },
  { id: 'bank',      sprite: 'home_b',     name: '은행',          cx: 80, cy: 80, w: 2, h: 2 },
  { id: 'inn',       sprite: 'tavern',     name: '여관',          cx: 102, cy: 75, w: 3, h: 3 },
  { id: 'market',    sprite: 'market',     name: '시장',          cx: 102, cy: 84, w: 3, h: 3 },
  { id: 'knights',   sprite: 'barracks',   name: '기사단',        cx: 74, cy: 100, w: 3, h: 3 },
  { id: 'archery',   sprite: 'archery',    name: '사냥꾼 길드',    cx: 74, cy: 92, w: 3, h: 3 },
  { id: 'chapel',    sprite: 'church',     name: '예배당',        cx: 102, cy: 100, w: 2, h: 3 },
  { id: 'magetower', sprite: 'magetower',  name: '마법사 탑',     cx: 102, cy: 92, w: 2, h: 2 },
  { id: 'well',      sprite: 'well',       name: '우물',          cx: 88, cy: 88.5, w: 1, h: 1 },
  { id: 'windmill',  sprite: 'windmill',   name: '풍차',          cx: 68, cy: 108, w: 2, h: 2 },
  ...[[68, 68], [108, 68], [68, 84], [108, 96], [80, 108], [96, 108], [108, 108], [68, 76]].map(([x, y], i) => ({ id: 'home' + i, sprite: i % 2 ? 'home_a' : 'home_b', name: ['농부 얀의 집', '목수 베스의 집', '늙은 톰의 집', '엘사의 집', '짐꾼 루카의 집', '마리의 집', '올라프의 집', '빈 집'][i], cx: x, cy: y, w: i % 2 ? 1 : 2, h: i % 2 ? 1 : 2 })),
];

// Monster tiers by distance from the town centre.
export const MONSTERS = {
  skel_minion:  { name: '해골 졸개',   level: 2,  hp: 60,  atk: 13, def: 2,  exp: 20,  gold: [3, 9],    speed: 2.6, aggro: 5, ring: [28, 44], count: 40 },
  skel_rogue:   { name: '해골 도적',   level: 5,  hp: 120, atk: 24, def: 5,  exp: 42,  gold: [8, 16],   speed: 3.0, aggro: 6, ring: [38, 56], count: 30 },
  skel_warrior: { name: '해골 전사',   level: 9,  hp: 240, atk: 40, def: 11,  exp: 90,  gold: [15, 30],  speed: 2.5, aggro: 6, ring: [48, 68], count: 26 },
  skel_mage:    { name: '해골 마법사', level: 13, hp: 300, atk: 62, def: 10,  exp: 150, gold: [28, 50],  speed: 2.4, aggro: 7, ring: [56, 78], count: 16, ranged: 4.5, skills: [{ k: 'bolt', name: '어둠의 화살', cd: 8000, wind: 1800, mul: 2.0 }] },
  // human outlaws: tinted variants of the adventurer sprites (see client VARIANTS); they fill the gaps between skeleton tiers and above
  bandit:       { name: '산적',        level: 4,  hp: 100, atk: 20, def: 4,  exp: 36,  gold: [10, 20],  speed: 3.2, aggro: 6, ring: [30, 48], count: 18, sprite: 'bandit' },
  deserter:     { name: '탈영 기사',   level: 11, hp: 320, atk: 46, def: 16, exp: 125, gold: [25, 45],  speed: 2.7, aggro: 6, ring: [50, 70], count: 14, sprite: 'deserter' },
  cultist:      { name: '이단 사제',   level: 15, hp: 340, atk: 70, def: 12, exp: 190, gold: [35, 60],  speed: 2.5, aggro: 7, ring: [60, 84], count: 10, sprite: 'cultist', ranged: 4.5, skills: [{ k: 'bolt', name: '어둠의 화살', cd: 8000, wind: 1800, mul: 2.0 }] },
  brute:        { name: '황야 광전사', level: 20, hp: 650, atk: 78, def: 20, exp: 320, gold: [50, 90],  speed: 3.0, aggro: 7, ring: [68, 86], count: 8,  sprite: 'brute' },
  // bosses: fixed lairs, long respawn, telegraphed skills (see server bossAI)
  boss_fang:    { name: '회색 송곳니',   level: 7,  hp: 650,  atk: 20, def: 6,  exp: 420,  gold: [80, 140],  speed: 3.6, aggro: 8, fixed: [120.5, 136.5], count: 1, boss: true, sprite: 'skel_rogue', scale: 1.45, respawn: 180000,
    skills: [{ k: 'howl', cd: 14000 }, { k: 'lunge', cd: 6000, mul: 1.8 }] },
  boss_paladin: { name: '타락한 성기사', level: 12, hp: 1400, atk: 36, def: 14, exp: 1100, gold: [160, 260], speed: 2.6, aggro: 8, fixed: [140.5, 40.5], count: 1, boss: true, sprite: 'skel_warrior', scale: 1.5, respawn: 240000,
    skills: [{ k: 'slam', cd: 9000, mul: 2.4, r: 2.0, wind: 1000 }] },
  boss_chief:   { name: '족장 크루쉬',   level: 18, hp: 2600, atk: 52, def: 18, exp: 2400, gold: [300, 520], speed: 3.0, aggro: 8, fixed: [39.5, 40.5], count: 1, boss: true, sprite: 'barbarian', scale: 1.6, respawn: 300000,
    skills: [{ k: 'charge', cd: 8000, mul: 2.0 }, { k: 'roar', cd: 14000, r: 3 }] },
  boss_lich:    { name: '리치 왕',       level: 25, hp: 4200, atk: 70, def: 22, exp: 5200, gold: [500, 900], speed: 2.3, aggro: 9, fixed: [24.5, 150.5], count: 1, boss: true, sprite: 'skel_mage', scale: 1.7, ranged: 5, respawn: 420000,
    skills: [{ k: 'slam', cd: 10000, mul: 2.8, r: 2.6, wind: 1100 }, { k: 'bolt', name: '망자의 저주', cd: 14000, wind: 2500, mul: 3.2 }, { k: 'summon', cd: 20000 }, { k: 'regen', cd: 25000 }] },
  // catacomb dwellers: placed by depth band (crypt: [y from, y to]) instead of a ring around town; tinted skeleton sheets (client VARIANTS)
  crypt_ghoul:  { name: '묘지 구울',     level: 14, hp: 380, atk: 60, def: 12, exp: 170, gold: [30, 55],  speed: 2.9, aggro: 6, crypt: [16, 58],   count: 16, sprite: 'crypt_ghoul' },
  crypt_guard:  { name: '납골당 파수병', level: 18, hp: 560, atk: 72, def: 18, exp: 260, gold: [40, 70],  speed: 2.5, aggro: 6, crypt: [60, 114],  count: 14, sprite: 'crypt_guard' },
  crypt_priest: { name: '망자의 사제',   level: 21, hp: 520, atk: 84, def: 14, exp: 320, gold: [50, 85],  speed: 2.4, aggro: 7, crypt: [70, 146],  count: 10, sprite: 'crypt_priest', ranged: 4.5, skills: [{ k: 'bolt', name: '망자의 화살', cd: 7000, wind: 1800, mul: 2.1 }] },
  crypt_knight: { name: '심연의 기사',   level: 24, hp: 900, atk: 92, def: 24, exp: 450, gold: [70, 120], speed: 2.6, aggro: 7, crypt: [116, 146], count: 12, sprite: 'crypt_knight' },
  boss_crypt:   { name: '묘지기 모르바스', level: 30, hp: 7000, atk: 105, def: 28, exp: 9000, gold: [900, 1500], speed: 2.6, aggro: 9, fixed: [225.5, 156.5], count: 1, boss: true, sprite: 'crypt_lord', scale: 1.9, respawn: 600000,
    skills: [{ k: 'slam', cd: 9000, mul: 2.6, r: 2.4, wind: 1000 }, { k: 'bolt', name: '영혼 수확', cd: 15000, wind: 2500, mul: 3.5 }, { k: 'summon', cd: 22000, mob: 'crypt_ghoul' }, { k: 'charge', cd: 11000, mul: 2.0 }, { k: 'regen', cd: 30000 }] },
  // 잿빛 수도원 (instance only: count 0, the server spawns them per copy and never respawns them; 어려움 scales them up)
  abbey_acolyte: { name: '타락한 수련사', level: 22, hp: 520, atk: 70, def: 14, exp: 300, gold: [40, 70], speed: 2.5, aggro: 7, count: 0, inst: true, sprite: 'abbey_acolyte', ranged: 4.5, skills: [{ k: 'bolt', name: '타락의 화살', cd: 8000, wind: 1800, mul: 2.0 }] },
  abbey_brute:   { name: '수도원 파수꾼', level: 23, hp: 800, atk: 82, def: 20, exp: 360, gold: [45, 80], speed: 2.7, aggro: 6, count: 0, inst: true, sprite: 'abbey_brute' },
  abbey_guard:   { name: '결계 수호자',   level: 24, hp: 650, atk: 64, def: 16, exp: 150, gold: [10, 20], speed: 2.7, aggro: 14, count: 0, inst: true, sprite: 'abbey_guard' },
  // boss 1: heals itself unless you interrupt 어둠의 기도
  boss_monk:  { name: '타락한 수도사 엘로드', level: 26, hp: 9000, atk: 95, def: 22, exp: 6000, gold: [500, 800], speed: 2.6, aggro: 9, count: 0, inst: true, boss: true, sprite: 'abbey_monk', scale: 1.6, ranged: 4.5,
    skills: [{ k: 'darkmend', name: '어둠의 기도', cd: 14000, wind: 3000, heal: .2 }, { k: 'bolt', name: '저주의 화살', cd: 7000, wind: 1600, mul: 2.2 }] },
  // boss 2: burning puddles under players (spread out), telegraphed slam
  boss_bell:  { name: '종지기 고르막', level: 27, hp: 12000, atk: 110, def: 26, exp: 8000, gold: [600, 900], speed: 2.4, aggro: 9, count: 0, inst: true, boss: true, sprite: 'abbey_bell', scale: 1.8,
    skills: [{ k: 'puddle', name: '불타는 종유', cd: 10000, n: 2, r: 1.8, warn: 1500, life: 8000, pct: .07 }, { k: 'slam', name: '종 내려치기', cd: 12000, mul: 2.4, r: 2.2, wind: 1200 }] },
  // boss 3: wards himself behind guardians at 70% and 35%, interruptible 심판의 빛, enrages after 3 minutes
  boss_abbot: { name: '수도원장 바르테스', level: 28, hp: 18000, atk: 120, def: 28, exp: 14000, gold: [900, 1400], speed: 2.5, aggro: 10, count: 0, inst: true, boss: true, sprite: 'abbey_abbot', scale: 1.9,
    skills: [{ k: 'adds', at: [.7, .35], n: 3, mob: 'abbey_guard' }, { k: 'enrage', after: 180000 }, { k: 'slam', name: '정화의 일격', cd: 11000, mul: 2.5, r: 2.3, wind: 1100 }, { k: 'bolt', name: '심판의 빛', cd: 13000, wind: 2200, mul: 3.0 }] },
};

export const LOOKS = { knight: '기사', barbarian: '야만전사', rogue: '도적', mage: '마법사' };

export function buildWorld() {
  const N = MAP * MAP;
  const ground = new Uint8Array(N), block = new Uint8Array(N), monsterBlock = new Uint8Array(N);
  const objects = [];
  const R = rng(20261026);
  const idx = (x, y) => y * MAP + x;
  const cx = CX + .5, cy = CY + .5;
  const riverY = []; for (let x = 0; x < MAP; x++) riverY.push(150 + Math.round((noise(x * .05, 3.7) - .5) * 10));

  // ground (outside the overworld square everything starts as solid void; the crypt is carved out of it below)
  for (let i = 0; i < N; i++) { ground[i] = G.VOID; block[i] = 1; }
  for (let y = 0; y < OVER; y++) for (let x = 0; x < OVER; x++) {
    block[idx(x, y)] = 0; let g = G.GRASS;
    const d = Math.max(Math.abs(x + .5 - cx), Math.abs(y + .5 - cy));
    const n = noise(x * .08, y * .08);
    if (x <= TOWN.x1 && x >= TOWN.x0 && y <= TOWN.y1 && y >= TOWN.y0) { g = G.COBBLE; if (noise(x * .13 + 7, y * .13 + 3) > .6 && d < 22 && d > 6) g = G.DIRT; }
    else {
      const dx = x - cx, dy = y - cy;
      if (dx < -8 && dy < -8 && d > 30) g = n > .45 ? G.ASH : G.DIRT;                    // north-west badlands
      else if (dx > 8 && dy < -4 && d > 28) g = n > .55 ? G.DARK : G.GRASS;              // eastern dark forest
      else if (n > .66) g = G.DIRT;
      if (Math.abs(y - riverY[x]) <= 1) g = G.WATER; else if (Math.abs(y - riverY[x]) === 2) g = G.SAND;
    }
    ground[idx(x, y)] = g;
  }
  // roads from the four gates and the ring road inside
  for (let y = TOWN.y1 + 1; y < OVER; y++) for (const x of [CX - 1, CX, CX + 1]) ground[idx(x, y)] = (ground[idx(x, y)] === G.WATER || ground[idx(x, y)] === G.SAND) ? G.BRIDGE : G.ROAD;
  for (let y = 0; y < TOWN.y0; y++) for (const x of [CX - 1, CX, CX + 1]) ground[idx(x, y)] = G.ROAD;
  for (let x = TOWN.x1 + 1; x < OVER; x++) for (const y of [CY - 1, CY, CY + 1]) ground[idx(x, y)] = G.ROAD;
  for (let x = 0; x < TOWN.x0; x++) for (const y of [CY - 1, CY, CY + 1]) ground[idx(x, y)] = G.ROAD;
  for (let y = TOWN.y0 + 1; y < TOWN.y1; y++) for (let x = TOWN.x0 + 1; x < TOWN.x1; x++) {
    const ax = Math.abs(x - CX), ay = Math.abs(y - CY);
    if (ax <= 1 || ay <= 1) ground[idx(x, y)] = G.ROAD;                              // main cross
    if ((ax === 16 || ax === 17) && ay <= 17 || (ay === 16 || ay === 17) && ax <= 17) ground[idx(x, y)] = G.ROAD;   // ring road
    if (ax <= 5 && ay <= 5) ground[idx(x, y)] = G.COBBLE;                            // plaza
  }

  // walls with towers every 8 tiles and four gates
  const wallTile = (x, y) => { block[idx(x, y)] = 1; };
  for (let x = TOWN.x0; x <= TOWN.x1; x++) { wallTile(x, TOWN.y0); wallTile(x, TOWN.y1); }
  for (let y = TOWN.y0; y <= TOWN.y1; y++) { wallTile(TOWN.x0, y); wallTile(TOWN.x1, y); }
  for (const g of GATES) for (let k = -1; k <= 1; k++) block[idx(g.dir === 'S' || g.dir === 'N' ? g.x + k : g.x, g.dir === 'S' || g.dir === 'N' ? g.y : g.y + k)] = 0;
  const towerAt = (x, y) => (x - TOWN.x0) % 8 === 0 && (y - TOWN.y0) % 8 === 0 || (x === TOWN.x0 || x === TOWN.x1) && (y - TOWN.y0) % 8 === 0 || (y === TOWN.y0 || y === TOWN.y1) && (x - TOWN.x0) % 8 === 0;
  for (let x = TOWN.x0 + 1; x < TOWN.x1; x += 2) {
    if (Math.abs(x + 1 - (CX + .5)) > 1.6) { objects.push({ key: 'wall_x', x: x + 1, y: TOWN.y0 + .5 }); objects.push({ key: 'wall_x', x: x + 1, y: TOWN.y1 + .5 }); }
  }
  for (let y = TOWN.y0 + 1; y < TOWN.y1; y += 2) {
    if (Math.abs(y + 1 - (CY + .5)) > 1.6) { objects.push({ key: 'wall_z', x: TOWN.x0 + .5, y: y + 1 }); objects.push({ key: 'wall_z', x: TOWN.x1 + .5, y: y + 1 }); }
  }
  for (const g of GATES) objects.push({ key: g.sprite, x: g.x + .5, y: g.y + .5 });
  for (let x = TOWN.x0; x <= TOWN.x1; x += 8) { objects.push({ key: 'tower', x: x + .5, y: TOWN.y0 + .5 }); objects.push({ key: 'tower', x: x + .5, y: TOWN.y1 + .5 }); }
  for (let y = TOWN.y0 + 8; y < TOWN.y1; y += 8) { objects.push({ key: 'tower', x: TOWN.x0 + .5, y: y + .5 }); objects.push({ key: 'tower', x: TOWN.x1 + .5, y: y + .5 }); }
  for (const g of GATES) { const h = g.dir === 'S' || g.dir === 'N'; objects.push({ key: 'flag', x: (h ? g.x - 2 : g.x) + .5, y: (h ? g.y : g.y - 2) + .5 }); objects.push({ key: 'flag', x: (h ? g.x + 2 : g.x) + .5, y: (h ? g.y : g.y + 2) + .5 }); }

  // buildings
  for (const b of BUILDINGS) {
    objects.push({ key: b.sprite, x: b.cx, y: b.cy, building: b.id });
    for (let y = Math.floor(b.cy - b.h / 2); y < Math.ceil(b.cy + b.h / 2); y++) for (let x = Math.floor(b.cx - b.w / 2); x < Math.ceil(b.cx + b.w / 2); x++) block[idx(x, y)] = 1;
  }
  // town decoration: lamps along the main streets, market stalls, props, trees
  const deco = [];
  for (let k = -14; k <= 14; k += 7) { if (Math.abs(k) < 3) continue; deco.push(['flag', CX + k + .5, CY - 2.5], ['flag', CX + k + .5, CY + 3.5], ['flag', CX - 2.5, CY + k + .5], ['flag', CX + 3.5, CY + k + .5]); }
  deco.push(['barrel', 76.5, 77.5], ['barrel', 76.6, 78.4], ['crate', 75.6, 78.2], ['lumber', 71.5, 78.5], ['weaponrack', 76.5, 101], ['target', 77, 98.2], ['target', 77, 94], ['sack', 104, 86.4], ['crate', 104.2, 82.5], ['crate', 99.5, 86.5], ['wheelbarrow', 99.2, 77.2], ['tent', 70, 90], ['tent', 70, 95]);
  for (const [x, y] of [[70, 70], [106, 70], [70, 106], [106, 106], [80, 86], [96, 86], [80, 90], [96, 90], [84, 70], [92, 70], [110, 84], [110, 92], [66, 84], [66, 92], [84, 110], [92, 110]]) deco.push([R() < .5 ? 'tree_a' : 'tree_b', x + .5, y + .5]);
  for (const [k, x, y] of deco) { objects.push({ key: k, x, y }); if (k.startsWith('tree') || k === 'tent') block[idx(Math.floor(x), Math.floor(y))] = 1; }

  // crypt entrance: a ruined watchtower over a stair hole, with a clear yard so the wilderness pass leaves it open
  { const e = CRYPT_ENTRANCE; for (let y = e.y - 4; y <= e.y + 4; y++) for (let x = e.x - 4; x <= e.x + 4; x++) { ground[idx(x, y)] = Math.max(Math.abs(x - e.x), Math.abs(y - e.y)) <= 2 ? G.CRYPT : G.DIRT; block[idx(x, y)] = 0; }
    objects.push({ key: 'tower', x: e.x - 1.5, y: e.y - 2 }, { key: 'rock_b', x: e.x + 2.5, y: e.y - 1.5 }, { key: 'rock_d', x: e.x - 2.5, y: e.y + 1.5 }, { key: 'flag', x: e.x + 1.5, y: e.y + 2.5 });
    for (const [x, y] of [[e.x - 2, e.y - 2], [e.x - 1, e.y - 2], [e.x - 2, e.y - 3], [e.x - 1, e.y - 3], [e.x + 2, e.y - 2], [e.x - 3, e.y + 1]]) block[idx(x, y)] = 1; }
  // abbey entrance: a paved yard before a ruined chapel, two stairs down (left 보통, right 어려움)
  { const e = ABBEY_ENTRANCE; for (let y = e.y - 4; y <= e.y + 4; y++) for (let x = e.x - 4; x <= e.x + 4; x++) { ground[idx(x, y)] = Math.abs(x - e.x) <= 3 && Math.abs(y - e.y) <= 2 ? G.ABBEY : G.DIRT; block[idx(x, y)] = 0; }
    objects.push({ key: 'church', x: e.x + .5, y: e.y - 3 }, { key: 'flag', x: e.x - 2.5, y: e.y + 1.5 }, { key: 'flag', x: e.x + 3.5, y: e.y + 1.5 });
    for (let y = e.y - 4; y <= e.y - 2; y++) for (let x = e.x - 1; x <= e.x + 1; x++) block[idx(x, y)] = 1; }

  // wilderness
  const free = (x, y, r) => { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { if (xx < 0 || yy < 0 || xx >= OVER || yy >= OVER) return false; if (Math.abs(xx - CRYPT_ENTRANCE.x) <= 5 && Math.abs(yy - CRYPT_ENTRANCE.y) <= 5) return false; if (Math.abs(xx - ABBEY_ENTRANCE.x) <= 6 && Math.abs(yy - ABBEY_ENTRANCE.y) <= 6) return false; if (block[idx(xx, yy)]) return false; const g = ground[idx(xx, yy)]; if (g === G.ROAD || g === G.WATER || g === G.BRIDGE || g === G.COBBLE) return false; } return true; };
  for (let y = 2; y < OVER - 2; y++) for (let x = 2; x < OVER - 2; x++) {
    const d = Math.max(Math.abs(x + .5 - cx), Math.abs(y + .5 - cy)); if (d < 27) continue;
    const g = ground[idx(x, y)]; const r = R();
    let key = null, rad = 0;
    if (g === G.DARK || (g === G.GRASS && x > cx + 8 && y < cy - 4)) { if (r < .07) { key = R() < .5 ? 'trees_al' : 'trees_bl'; rad = 1; } else if (r < .13) { key = R() < .5 ? 'tree_a' : 'tree_b'; } }
    else if (g === G.ASH || g === G.DIRT) { if (r < .025) key = ['rock_a', 'rock_b', 'rock_c', 'rock_d'][Math.floor(R() * 4)]; else if (r < .032) key = 'tree_b'; }
    else if (g === G.GRASS) { if (r < .018) key = R() < .5 ? 'tree_a' : 'tree_b'; else if (r < .024) { key = 'trees_am'; rad = 1; } else if (r < .03) key = ['rock_a', 'rock_c'][Math.floor(R() * 2)]; }
    if (key && free(x, y, rad + 1)) { objects.push({ key, x: x + .5, y: y + .5 }); for (let yy = y - rad; yy <= y + rad; yy++) for (let xx = x - rad; xx <= x + rad; xx++) block[idx(xx, yy)] = 1; }
  }
  for (let i = 0; i < OVER; i += 5) for (const [x, y] of [[i + 2, 1.5], [i + 2, OVER - 2], [1.5, i + 2], [OVER - 2, i + 2]]) objects.push({ key: (i / 5) % 3 === 0 ? 'mountain' : 'hills', x, y });
  for (let i = 0; i < OVER; i++) { for (let k = 0; k < 3; k++) { block[idx(i, k)] = 1; block[idx(i, OVER - 1 - k)] = 1; block[idx(k, i)] = 1; block[idx(OVER - 1 - k, i)] = 1; } }
  // orc-style camp in the badlands (boss_chief lair)
  for (const [k, x, y] of [['tent', 38, 38], ['tent', 42, 36.5], ['tent', 37, 43], ['lumber', 40, 41], ['barrel', 41.5, 39], ['flag', 39, 39]]) { objects.push({ key: k, x, y }); if (k === 'tent') block[idx(Math.floor(x), Math.floor(y))] = 1; }

  // the catacombs: rooms joined by 3-wide L-shaped corridors, pillars in the bigger halls, bones and barrels for cover.
  // Solid tiles that touch a floor tile become wall blocks (drawn by the client as raised stone).
  const floor = (x, y) => { ground[idx(x, y)] = G.CRYPT; block[idx(x, y)] = 0; };
  const rooms = CRYPT_ROOMS.map(([rx, ry, w, h]) => ({ x0: rx - (w >> 1), y0: ry - (h >> 1), x1: rx - (w >> 1) + w - 1, y1: ry - (h >> 1) + h - 1, cx: rx, cy: ry }));
  for (const r of rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) floor(x, y);
  for (let i = 1; i < rooms.length; i++) { const a = rooms[i - 1], b = rooms[i];
    for (let x = Math.min(a.cx, b.cx) - 1; x <= Math.max(a.cx, b.cx) + 1; x++) for (let k = -1; k <= 1; k++) floor(x, a.cy + k);
    for (let y = Math.min(a.cy, b.cy) - 1; y <= Math.max(a.cy, b.cy) + 1; y++) for (let k = -1; k <= 1; k++) floor(b.cx + k, y); }
  const cr = rng(4401);
  for (const [i, r] of rooms.entries()) { if (i === 0) continue; const big = i === rooms.length - 1;
    // pillars: four in each hall, a ring of six in the lord's chamber; never on the corridor mouths (centre lines)
    const pts = big ? [[-6, -4], [6, -4], [-6, 4], [6, 4], [-8, 0], [8, 0]] : [[-3, -2], [3, -2], [-3, 2], [3, 2]];
    for (const [dx, dy] of pts) { const x = r.cx + dx, y = r.cy + dy; block[idx(x, y)] = 1; objects.push({ key: 'cpillar', x: x + .5, y: y + .5 }); }
    for (let k = 0; k < (big ? 0 : 3); k++) { const x = r.x0 + 1 + Math.floor(cr() * (r.x1 - r.x0 - 1)), y = r.y0 + 1 + Math.floor(cr() * (r.y1 - r.y0 - 1)); if (Math.abs(x - r.cx) <= 1 || Math.abs(y - r.cy) <= 1 || block[idx(x, y)]) continue;
      const key = ['barrel', 'crate', 'rock_c', 'sack'][Math.floor(cr() * 4)]; objects.push({ key, x: x + .5, y: y + .5 }); block[idx(x, y)] = 1; }
    for (let k = 0; k < 4; k++) objects.push({ key: 'cbones', x: r.x0 + 1 + cr() * (r.x1 - r.x0 - 1), y: r.y0 + 1 + cr() * (r.y1 - r.y0 - 1) }); }
  for (let y = DUNGEON.y0 - 1; y <= DUNGEON.y1 + 1; y++) for (let x = DUNGEON.x0 - 1; x <= DUNGEON.x1 + 1; x++) {
    if (ground[idx(x, y)] === G.CRYPT) continue; let touch = false;
    for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (ground[idx(x + dx, y + dy)] === G.CRYPT) { touch = true; break; }
    if (touch) objects.push({ key: 'cwall', x: x + .5, y: y + .5 }); }
  // wall torches on the back (north) wall of every room — the client lights them at all times
  for (const r of rooms) for (const x of [r.x0 + 1, r.x1 - 1]) objects.push({ key: 'ctorch', x: x + .5, y: r.y0 - .5 });

  // 잿빛 수도원: the same rooms-and-corridors carving, once per instance slot, in warm abbey stone
  for (const s of ABBEY_SLOTS) {
    const ab = ABBEY_ROOMS.map(([rx, ry, w, h]) => ({ x0: s.x0 + rx - (w >> 1), y0: s.y0 + ry - (h >> 1), x1: s.x0 + rx - (w >> 1) + w - 1, y1: s.y0 + ry - (h >> 1) + h - 1, cx: s.x0 + rx, cy: s.y0 + ry }));
    const af = (x, y) => { ground[idx(x, y)] = G.ABBEY; block[idx(x, y)] = 0; };
    for (const r of ab) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) af(x, y);
    for (let i = 1; i < ab.length; i++) { const a = ab[i - 1], b = ab[i];
      for (let x = Math.min(a.cx, b.cx) - 1; x <= Math.max(a.cx, b.cx) + 1; x++) for (let k = -1; k <= 1; k++) af(x, a.cy + k);
      for (let y = Math.min(a.cy, b.cy) - 1; y <= Math.max(a.cy, b.cy) + 1; y++) for (let k = -1; k <= 1; k++) af(b.cx + k, y); }
    // pillars line the long hall and the abbot's hall; a few crates in the side room
    for (const [dx, dy] of [[14, 10], [26, 10], [14, 16], [26, 16], [4, 33], [24, 33], [4, 41], [24, 41]]) { block[idx(s.x0 + dx, s.y0 + dy)] = 1; objects.push({ key: 'cpillar', x: s.x0 + dx + .5, y: s.y0 + dy + .5 }); }
    for (const [k, dx, dy] of [['crate', 26, 19], ['barrel', 34, 24], ['sack', 26, 24]]) { block[idx(s.x0 + dx, s.y0 + dy)] = 1; objects.push({ key: k, x: s.x0 + dx + .5, y: s.y0 + dy + .5 }); }
    for (let y = s.y0 - 1; y <= s.y0 + ABBEY.h; y++) for (let x = s.x0 - 1; x <= s.x0 + ABBEY.w; x++) {
      if (ground[idx(x, y)] === G.ABBEY) continue; let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (ground[idx(x + dx, y + dy)] === G.ABBEY) { touch = true; break; }
      if (touch) objects.push({ key: 'cwall', x: x + .5, y: y + .5 }); }
    for (const r of ab) for (const x of [r.x0 + 1, r.x1 - 1]) objects.push({ key: 'ctorch', x: x + .5, y: r.y0 - .5 });
  }

  for (let i = 0; i < N; i++) { if (ground[i] === G.WATER) block[i] = 1; monsterBlock[i] = block[i]; }
  for (const p of PORTALS) monsterBlock[idx(p.x, p.y)] = 1;      // monsters never step onto (or follow you through) a portal
  for (let y = TOWN.y0; y <= TOWN.y1; y++) for (let x = TOWN.x0; x <= TOWN.x1; x++) monsterBlock[idx(x, y)] = 1;

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
