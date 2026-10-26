// Shared game rules: items, shops, recipes, classes. The server enforces these; the client only displays them.

export const ITEMS = {
  // weapons
  dagger:      { name: '단검',         type: 'weapon', atk: 4,  spd: 1.2,  price: 60,   icon: 'dagger' },
  shortSword:  { name: '숏소드',       type: 'weapon', atk: 8,  spd: 1.0,  price: 180,  icon: 'sword' },
  mace:        { name: '철퇴',         type: 'weapon', atk: 11, spd: .95,  price: 320,  icon: 'axe1' },
  longSword:   { name: '롱소드',       type: 'weapon', atk: 14, spd: 1.0,  price: 520,  icon: 'sword2' },
  staff:       { name: '참나무 지팡이', type: 'weapon', atk: 9,  spd: 1.0,  price: 260,  icon: 'staff' },
  battleAxe:   { name: '배틀액스',     type: 'weapon', atk: 23, spd: .8,   price: 1300, icon: 'axe2' },
  boneBlade:   { name: '뼈칼날 검',    type: 'weapon', atk: 17, spd: 1.1,  price: 0, craft: { bone: 6, rustyIron: 3, gold: 300 }, icon: 'sword' },
  soulStaff:   { name: '영혼석 지팡이', type: 'weapon', atk: 24, spd: 1.0,  price: 0, craft: { soulGem: 2, cursedCloth: 4, gold: 1000 }, icon: 'staff' },
  cursedAxe:   { name: '저주받은 도끼', type: 'weapon', atk: 30, spd: .85,  price: 0, craft: { soulGem: 1, cursedCloth: 4, rustyIron: 8, gold: 1400 }, icon: 'axe2' },
  // armour
  leatherArmor:{ name: '가죽 갑옷',    type: 'armor',  def: 4,  price: 150,  icon: 'armor' },
  chainMail:   { name: '사슬 갑옷',    type: 'armor',  def: 9,  price: 480,  icon: 'armor' },
  plateArmor:  { name: '판금 갑옷',    type: 'armor',  def: 16, price: 1400, icon: 'armor' },
  ironHelm:    { name: '철 투구',      type: 'helmet', def: 3,  price: 260,  icon: 'helmet' },
  woodShield:  { name: '목제 방패',    type: 'shield', def: 2,  price: 90,   icon: 'shield_round' },
  ironShield:  { name: '철 방패',      type: 'shield', def: 5,  price: 420,  icon: 'shield_badge' },
  boneShield:  { name: '해골 방패',    type: 'shield', def: 8,  price: 0, craft: { bone: 10, rustyIron: 6, gold: 600 }, icon: 'shield_spikes' },
  leatherBoots:{ name: '가죽 장화',    type: 'boots',  def: 1,  price: 70,   icon: 'boots' },
  leatherGloves:{name: '가죽 장갑',    type: 'gloves', atk: 1,  price: 80,   icon: 'gloves' },
  silverRing:  { name: '은반지',       type: 'ring',   atk: 2,  price: 600,  icon: 'ring' },
  // consumables
  hpPotion:    { name: '체력 물약',    type: 'potion', heal: 80, price: 30,  stack: true, icon: 'potion_red' },
  mpPotion:    { name: '마나 물약',    type: 'potion', mana: 40, price: 40,  stack: true, icon: 'potion_blue' },
  scroll:      { name: '귀환 주문서',  type: 'scroll', price: 50, stack: true, icon: 'scroll' },
  // materials
  bone:        { name: '낡은 뼈',      type: 'mat', price: 8,   stack: true, icon: 'bone' },
  rustyIron:   { name: '녹슨 철조각',  type: 'mat', price: 14,  stack: true, icon: 'iron' },
  cursedCloth: { name: '저주받은 천',  type: 'mat', price: 22,  stack: true, icon: 'cloth' },
  soulGem:     { name: '영혼석',       type: 'mat', price: 120, stack: true, icon: 'gem' },
};
export const SLOTS = ['weapon', 'helmet', 'armor', 'shield', 'gloves', 'boots', 'ring'];
export const SLOT_NAME = { weapon: '무기', helmet: '투구', armor: '갑옷', shield: '방패', gloves: '장갑', boots: '장화', ring: '반지' };
export const INV_SIZE = 36;

export const DROPS = {
  skel_minion:  [['bone', .5], ['hpPotion', .12]],
  skel_rogue:   [['rustyIron', .4], ['bone', .35], ['cursedCloth', .1], ['dagger', .02]],
  skel_warrior: [['rustyIron', .5], ['cursedCloth', .3], ['hpPotion', .3], ['ironHelm', .03], ['chainMail', .02]],
  skel_mage:    [['cursedCloth', .5], ['soulGem', .12], ['mpPotion', .4], ['staff', .03]],
};

// NPCs: where they stand, what they offer. Positions are tiles in front of their building doors.
export const NPCS = [
  { id: 'smith',   name: '대장장이 로릭',   sprite: 'barbarian', x: 58.5, y: 59.5, shop: ['dagger', 'shortSword', 'mace', 'longSword', 'staff', 'battleAxe', 'woodShield', 'ironShield'], craft: ['boneBlade', 'boneShield', 'soulStaff', 'cursedAxe'], enhance: true },
  { id: 'market',  name: '상인 베라',       sprite: 'rogue',     x: 70.5, y: 66.5, shop: ['leatherArmor', 'chainMail', 'plateArmor', 'ironHelm', 'leatherBoots', 'leatherGloves', 'silverRing', 'hpPotion', 'mpPotion', 'scroll'] },
  { id: 'inn',     name: '여관 주인 올가',  sprite: 'mage',      x: 70.5, y: 59.5, rest: 20, master: 'rogue' },
  { id: 'chapel',  name: '사제 안셀',       sprite: 'mage',      x: 57.5, y: 66.5, master: 'cleric', atone: true },
  { id: 'knights', name: '기사단장 가웨인', sprite: 'knight',    x: 59.5, y: 71.5, master: 'knight' },
  { id: 'magetower', name: '대마법사 이졸데', sprite: 'mage',    x: 68.5, y: 71.5, master: 'mage' },
  { id: 'guard_s1', name: '성문 경비병',    sprite: 'knight',    x: 62.5, y: 75.5, guard: true },
  { id: 'guard_s2', name: '성문 경비병',    sprite: 'knight',    x: 66.5, y: 75.5, guard: true },
  { id: 'guard_e1', name: '성문 경비병',    sprite: 'knight',    x: 75.5, y: 62.5, guard: true },
  { id: 'guard_e2', name: '성문 경비병',    sprite: 'knight',    x: 75.5, y: 66.5, guard: true },
];

export const CLASSES = {
  commoner: { name: '평민', hp: 22, mp: 8, atk: 3, def: 1.2 },
  knight: { name: '기사', master: '기사단장 가웨인', hp: 30, mp: 6, atk: 3, def: 1.8, bonus: { hp: 80, def: 5 },
    desc: '성벽을 지키는 중갑 전사. 체력과 방어가 가장 높습니다.', skill: { id: 'bash', name: '방패 강타', mp: 12, cd: 6000, range: 1.6, desc: '2.2배 피해 + 1.5초 기절' } },
  mage: { name: '마법사', master: '대마법사 이졸데', hp: 16, mp: 18, atk: 3.5, def: .8, bonus: { mp: 80, atk: 4 }, ranged: 4.5, dmg: 1.2,
    desc: '탑의 학자. 원거리에서 마력탄을 쏘고 화염구로 무리를 태웁니다.', skill: { id: 'fireball', name: '화염구', mp: 25, cd: 8000, range: 5.5, desc: '대상 주변 2칸의 적 모두에게 1.8배 피해' } },
  cleric: { name: '성직자', master: '사제 안셀', hp: 24, mp: 14, atk: 2.6, def: 1.4, bonus: { hp: 40, mp: 50, def: 2 },
    desc: '빛의 종. 치유가 강해지고 신성한 빛으로 주변을 정화합니다.', skill: { id: 'holy', name: '신성한 빛', mp: 20, cd: 9000, range: 0, desc: '주변 3칸 적에게 1.4배 피해, 자신 HP 25% 회복' } },
  rogue: { name: '도적', master: '여관 뒷방의 라스', hp: 20, mp: 8, atk: 4, def: 1, bonus: { atk: 6 }, aspd: 1.25,
    desc: '그림자 속의 칼날. 공격이 빠르고 급소 찌르기로 출혈을 일으킵니다.', skill: { id: 'backstab', name: '급소 찌르기', mp: 12, cd: 6000, range: 1.6, desc: '2.6배 피해 + 5초 출혈' } },
};
export const CLASS_LEVEL = 10;

export function statsFor(level, cls = 'commoner') {
  const c = CLASSES.commoner, k = CLASSES[cls] || c;
  const lv1 = Math.min(level, CLASS_LEVEL) - 1, lv2 = cls === 'commoner' ? level - Math.min(level, CLASS_LEVEL) : level - CLASS_LEVEL;
  const g = cls === 'commoner' ? c : k; const b = k.bonus || {};
  return {
    maxHp: Math.round(100 + c.hp * lv1 + g.hp * lv2 + (b.hp || 0)),
    maxMp: Math.round(40 + c.mp * lv1 + g.mp * lv2 + (b.mp || 0)),
    atk: Math.round(10 + c.atk * lv1 + g.atk * lv2 + (b.atk || 0)),
    def: Math.round(2 + c.def * lv1 + g.def * lv2 + (b.def || 0)),
  };
}

export const ENH_RATE = [100, 95, 85, 70, 55, 40, 30, 20, 15];
export function itemStats(it) { const base = ITEMS[it.id]; const e = it.enh || 0; if (!base) return {}; const out = { atk: base.atk || 0, def: base.def || 0, spd: base.spd || 0 }; if (base.type === 'weapon') out.atk += e * 2; else if (base.type === 'ring' || base.type === 'gloves') out.atk += e; else out.def += e; return out; }
export function enhCost(it) { const base = ITEMS[it.id]; return Math.round((base.price || (base.craft && base.craft.gold) || 300) * .12 * ((it.enh || 0) + 1) + 40); }
export function sellPrice(it) { const base = ITEMS[it.id]; return Math.max(1, Math.floor((base.price || (base.craft && base.craft.gold) || 50) * .4 * (1 + (it.enh || 0) * .25))); }
export function itemName(it) { const b = ITEMS[it.id]; return b ? b.name + (it.enh ? ` +${it.enh}` : '') : '?'; }
export function itemDesc(it) {
  const b = ITEMS[it.id]; if (!b) return ''; const s = itemStats(it); const p = [];
  if (SLOT_NAME[b.type]) p.push(SLOT_NAME[b.type]); if (s.atk) p.push(`공격 +${s.atk}`); if (s.def) p.push(`방어 +${s.def}`); if (b.spd && b.spd !== 1) p.push(`속도 ×${b.spd}`);
  if (b.heal) p.push(`HP ${b.heal} 회복`); if (b.mana) p.push(`MP ${b.mana} 회복`); if (b.type === 'scroll') p.push('마을 광장으로 순간이동'); if (b.type === 'mat') p.push('제작 재료');
  return p.join(' · ');
}
