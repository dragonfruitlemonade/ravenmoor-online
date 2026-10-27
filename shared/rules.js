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
  // boss uniques
  fangCloak:   { name: '송곳니의 망토',   type: 'gloves', atk: 3, def: 2, price: 900,  icon: 'gloves' },
  paladinShield:{ name: '타락한 성기사의 방패', type: 'shield', def: 9, price: 1600, icon: 'shield_spikes' },
  chiefAxe:    { name: '족장의 대도끼',   type: 'weapon', atk: 36, spd: .85, price: 3200, icon: 'axe2' },
  lichCrown:   { name: '리치의 왕관',     type: 'helmet', def: 7, atk: 4, price: 5000, icon: 'helmet' },
  lichStaff:   { name: '리치의 지팡이',   type: 'weapon', atk: 42, spd: 1.0, price: 5200, icon: 'staff' },
  // catacomb gear: the lord's set drops only from 묘지기 모르바스, the helm from the abyssal knights
  wardenBlade: { name: '묘지기의 장검',   type: 'weapon', atk: 48, spd: 1.0, price: 6000, icon: 'sword2' },
  wardenPlate: { name: '묘지기의 판금',   type: 'armor',  def: 22, price: 6400, icon: 'armor' },
  wardenSeal:  { name: '묘지기의 인장',     type: 'ring',   atk: 5, def: 3, price: 4200, icon: 'ring' },
  abyssHelm:   { name: '심연의 투구',     type: 'helmet', def: 6, price: 2200, icon: 'helmet' },
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
  scroll:      { name: '귀향 두루마리',  type: 'scroll', price: 50, stack: true, icon: 'scroll' },
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
  bandit:       [['rustyIron', .25], ['hpPotion', .12], ['shortSword', .015]],
  deserter:     [['cursedCloth', .25], ['rustyIron', .3], ['ironHelm', .03], ['ironShield', .02]],
  cultist:      [['soulGem', .2], ['mpPotion', .2], ['cursedCloth', .3]],
  brute:        [['soulGem', .15], ['chainMail', .04], ['longSword', .04], ['battleAxe', .03], ['hpPotion', .4]],
  boss_fang:    [['bone', 1], ['bone', 1], ['fangCloak', .5], ['hpPotion', 1]],
  boss_paladin: [['rustyIron', 1], ['soulGem', .6], ['paladinShield', .5], ['hpPotion', 1]],
  boss_chief:   [['soulGem', 1], ['chiefAxe', .5], ['cursedCloth', 1], ['hpPotion', 1]],
  boss_lich:    [['soulGem', 1], ['soulGem', 1], ['lichCrown', .5], ['lichStaff', .35], ['mpPotion', 1]],
  crypt_ghoul:  [['bone', .6], ['cursedCloth', .3], ['hpPotion', .2]],
  crypt_guard:  [['rustyIron', .5], ['cursedCloth', .35], ['soulGem', .08], ['plateArmor', .015]],
  crypt_priest: [['soulGem', .22], ['mpPotion', .4], ['cursedCloth', .4]],
  crypt_knight: [['soulGem', .2], ['rustyIron', .5], ['hpPotion', .4], ['abyssHelm', .04], ['battleAxe', .03]],
  boss_crypt:   [['soulGem', 1], ['soulGem', 1], ['soulGem', .5], ['wardenBlade', .45], ['wardenPlate', .4], ['wardenSeal', .3], ['hpPotion', 1]],
};

// NPCs: where they stand, what they offer. Positions are tiles in front of their building doors.
export const NPCS = [
  { id: 'smith',   name: '대장장이 로릭',   sprite: 'barbarian', x: 74.5, y: 77.5, shop: ['dagger', 'shortSword', 'mace', 'longSword', 'staff', 'battleAxe', 'woodShield', 'ironShield'], craft: ['boneBlade', 'boneShield', 'soulStaff', 'cursedAxe'], enhance: true },
  { id: 'market',  name: '상인 베라',       sprite: 'rogue',     x: 99.5, y: 86.5, market: true, shop: ['leatherArmor', 'chainMail', 'plateArmor', 'ironHelm', 'leatherBoots', 'leatherGloves', 'silverRing', 'hpPotion', 'mpPotion', 'scroll'] },
  { id: 'inn',     name: '여관 주인 올가',  sprite: 'mage',      x: 102.5, y: 77.5, rest: 20, master: 'rogue' },
  { id: 'chapel',  name: '사제 안셀',       sprite: 'mage',      x: 102.5, y: 102.5, master: 'cleric', atone: true },
  { id: 'knights', name: '기사단장 가웨인', sprite: 'knight',    x: 76.5, y: 100.5, master: 'knight' },
  { id: 'magetower', name: '대마법사 이졸데', sprite: 'mage',    x: 100.5, y: 92.5, master: 'mage' },
  { id: 'bank',    name: '은행원 마르타',   sprite: 'rogue',     x: 80.5, y: 82.5, bank: true },
  { id: 'guard_s1', name: '성문 경비병',    sprite: 'knight',    x: 86.5, y: 111.5, guard: true },
  { id: 'guard_s2', name: '성문 경비병',    sprite: 'knight',    x: 90.5, y: 111.5, guard: true },
  { id: 'guard_e1', name: '성문 경비병',    sprite: 'knight',    x: 111.5, y: 86.5, guard: true },
  { id: 'guard_e2', name: '성문 경비병',    sprite: 'knight',    x: 111.5, y: 90.5, guard: true },
  { id: 'guard_n1', name: '성문 경비병',    sprite: 'knight',    x: 86.5, y: 65.5, guard: true },
  { id: 'guard_w1', name: '성문 경비병',    sprite: 'knight',    x: 65.5, y: 86.5, guard: true },
  // villagers: wander in an area and say a line when clicked
  { id: 'v_yan',   name: '농부 얀',   sprite: 'barbarian', x: 72.5, y: 70.5, villager: true, area: [66, 66, 10, 10], lines: ['올해 밀 수확이 괜찮아서 다행이에요.', '성 밖엔 해골이 늘었다던데…'] },
  { id: 'v_bess',  name: '목수 베스', sprite: 'rogue',     x: 104.5, y: 70.5, villager: true, area: [100, 66, 10, 10], lines: ['대장간 로릭이 또 밤새 망치질이군요.', '북쪽 문 밖 길은 황야로 이어져요. 조심하세요.'] },
  { id: 'v_tom',   name: '늙은 톰',   sprite: 'knight',    x: 72.5, y: 86.5, villager: true, area: [66, 82, 12, 8], lines: ['젊었을 땐 나도 기사단이었지.', '리치 왕은 남서쪽 늪에서 잠들어 있다네. 깨우지 말게.'] },
  { id: 'v_elsa',  name: '엘사',     sprite: 'mage',      x: 106.5, y: 96.5, villager: true, area: [100, 94, 10, 10], lines: ['시계탑 종소리가 나면 저녁이에요.', '예배당의 안셀 님은 죄를 씻어 주신대요.'] },
  { id: 'v_luka',  name: '짐꾼 루카', sprite: 'barbarian', x: 82.5, y: 106.5, villager: true, area: [76, 102, 14, 8], lines: ['은행에 맡기면 죽어도 안 잃어요. 꼭 맡기세요.', '동쪽 숲엔 타락한 성기사가 돌아다닌대요.'] },
  { id: 'v_mari',  name: '마리',     sprite: 'rogue',     x: 94.5, y: 106.5, villager: true, area: [90, 102, 14, 8], lines: ['풍차 뒤편은 조용해서 좋아요.', '붉은 이름을 한 사람은 피하세요. 무법자예요.'] },
  { id: 'v_olaf',  name: '나무꾼 올라프', sprite: 'barbarian', x: 88.5, y: 82.5, villager: true, area: [82, 80, 12, 6], lines: ['남쪽 강 너머엔 회색 송곳니가 살아요.', '파티를 맺으면 경험치를 나눠 가져요.'] },
];

export const CLASSES = {
  commoner: { name: '평민', hp: 22, mp: 8, atk: 3, def: 1.2 },
  knight: { name: '기사', master: '기사단장 가웨인', hp: 30, mp: 6, atk: 3, def: 1.8, bonus: { hp: 80, def: 5 }, threat: 1.6, role: '방어',
    desc: '성벽을 지키는 중갑 전사. 적의 눈길을 끌어 동료를 지키고, 맞을수록 투지가 차오릅니다.' },
  mage: { name: '마법사', master: '대마법사 이졸데', hp: 16, mp: 18, atk: 3.5, def: .8, bonus: { mp: 80, atk: 4 }, ranged: 4.5, dmg: 1.2, role: '공격',
    desc: '탑의 학자. 주문을 외워 멀리서 무리를 태우고, 적의 주문을 끊습니다.' },
  cleric: { name: '성직자', master: '사제 안셀', hp: 24, mp: 14, atk: 2.6, def: 1.4, bonus: { hp: 40, mp: 50, def: 2 }, role: '치유',
    desc: '빛의 종. 동료를 치유하고 보호막을 씌웁니다.' },
  rogue: { name: '도적', master: '여관 뒷방의 라스', hp: 20, mp: 8, atk: 4, def: 1, bonus: { atk: 6 }, aspd: 1.25, role: '공격',
    desc: '그림자 속의 칼날. 칼질로 칼자국을 쌓고 급소 찌르기로 한꺼번에 터뜨립니다.' },
};
export const CLASS_LEVEL = 10, ADV_LEVEL = 20;
export const ADV = {
  paladin: { name: '팔라딘', from: 'knight', master: '기사단장 가웨인', hall: 'knights', bonus: { hp: 120, def: 6, mp: 30 }, dmg: 1.1,
    desc: '빛의 맹세를 한 기사. 신성 일격으로 적을 치며 자신을 치유합니다.' },
  archmage: { name: '대마법사', from: 'mage', master: '대마법사 이졸데', hall: 'magetower', bonus: { mp: 120, atk: 8 }, dmg: 1.45, ranged: 5,
    desc: '탑의 주인. 번개 사슬이 가까운 적 넷을 꿰뚫습니다.' },
  bishop: { name: '주교', from: 'cleric', master: '사제 안셀', hall: 'chapel', bonus: { hp: 60, mp: 80, def: 4 },
    desc: '빛의 목자. 축복으로 자신을 강화하고 동료를 지킵니다.' },
  assassin: { name: '암살자', from: 'rogue', master: '여관 뒷방의 라스', hall: 'inn', bonus: { atk: 12, hp: 40 }, aspd: 1.4,
    desc: '그림자 그 자체. 눈 깜짝할 새 세 번 찌릅니다.' },
};
export const ADV_OF = Object.fromEntries(Object.entries(ADV).map(([k, v]) => [v.from, k]));

export function classInfo(cls) { if (ADV[cls]) { const a = ADV[cls], base = CLASSES[a.from]; return { ...base, ...a, isAdv: true }; } return CLASSES[cls] || CLASSES.commoner; }
export const baseClass = cls => ADV[cls] ? ADV[cls].from : (CLASSES[cls] ? cls : 'commoner');

// ── combat: class resources, skills and the global cooldown. Server and client read the same numbers.
// mana: the usual pool. grit (기사): starts empty, fills when you hit or get hit, drains out of combat.
// breath (도적): 100, refills fast; 칼질 adds 칼자국 (up to 5) which 급소 찌르기 spends all at once.
export const GCD = 1000;
export const RESOURCES = { mana: { name: '마나' }, grit: { name: '투지', max: 100 }, breath: { name: '호흡', max: 100 } };
export const resourceOf = cls => ({ knight: 'grit', rogue: 'breath' })[baseClass(cls)] || 'mana';
export const MAX_CUTS = 5;
// target: 'enemy' (default when range > 0), 'self', 'ally' (a friendly player you have selected, else yourself), none for range 0 area skills.
// range 'weapon' = your attack range. offGcd skills ignore and don't trigger the global cooldown.
export const SKILLS = {
  power:     { name: '힘껏 치기',   cost: 10, cd: 6000,  range: 'weapon', mul: 1.6, desc: '무기로 1.6배 피해' },
  first_aid: { name: '응급 치료',   cost: 15, cd: 10000, cast: 1500, target: 'self', heal: .3, desc: '1.5초 시전 · 체력 30% 회복' },
  // 기사
  bash:      { name: '방패 강타',   cost: 20, cd: 8000,  range: 1.6, mul: 1.6, stun: 1500, interrupt: true, threat: 2, desc: '1.6배 피해 · 1.5초 기절 · 시전 끊기' },
  cleave:    { name: '휩쓸기',      cost: 25, cd: 6000,  aoe: 1.9, mul: 1.1, threat: 2.5, desc: '주변 적 모두 1.1배 피해 · 위협 크게' },
  challenge: { name: '도전의 함성', cost: 0,  cd: 12000, aoe: 3.5, taunt: 4000, gain: 20, offGcd: true, desc: '주변 적이 4초간 나만 노림 · 투지 +20' },
  bulwark:   { name: '철벽 자세',   cost: 30, cd: 30000, buff: 'bulwark', dur: 6000, offGcd: true, desc: '6초간 받는 피해 40% 감소' },
  smite:     { name: '신성 일격',   adv: 'paladin', cost: 30, cd: 9000, range: 1.6, mul: 2.4, selfHeal: .12, desc: '2.4배 피해 · 체력 12% 회복' },
  // 마법사
  fireball:  { name: '화염구',      cost: 25, cd: 5000,  cast: 1500, range: 6, aoeAt: 2.2, mul: 1.9, proj: true, desc: '1.5초 시전 · 대상 주변 2칸 1.9배 피해' },
  frostring: { name: '서리 고리',   cost: 20, cd: 12000, aoe: 2.6, mul: .8, slow: 4000, desc: '주변 적 0.8배 피해 · 4초 둔화' },
  silence:   { name: '마력 차단',   cost: 10, cd: 15000, range: 6, mul: .3, interrupt: true, offGcd: true, desc: '시전 끊기 · 약한 피해' },
  barrier:   { name: '마나 보호막', cost: 30, cd: 20000, target: 'self', shield: .3, dur: 10000, desc: '10초간 최대 체력 30%만큼 피해 흡수' },
  chain:     { name: '번개 사슬',   adv: 'archmage', cost: 30, cd: 9000, range: 6, chain: 4, mul: 1.5, desc: '가까운 적 4명까지 1.5배 피해' },
  // 성직자
  mend:      { name: '치유의 손길', cost: 20, cd: 0,     cast: 1500, range: 6, target: 'ally', heal: .35, desc: '1.5초 시전 · 선택한 동료(없으면 자신) 체력 35% 회복' },
  ward:      { name: '보호의 기도', cost: 25, cd: 12000, range: 6, target: 'ally', shield: .25, dur: 10000, desc: '선택한 동료(없으면 자신)에게 체력 25% 보호막' },
  holy:      { name: '신성한 빛',   cost: 25, cd: 9000,  aoe: 3, mul: 1.3, selfHeal: .15, desc: '주변 적 1.3배 피해 · 체력 15% 회복' },
  rebuke:    { name: '꾸짖음',      cost: 10, cd: 15000, range: 5, mul: .6, interrupt: true, offGcd: true, desc: '시전 끊기 · 0.6배 피해' },
  bless:     { name: '축복',        adv: 'bishop', cost: 30, cd: 20000, target: 'self', buff: 'bless', dur: 15000, selfHeal: .2, desc: '15초간 공격·방어 +25% · 체력 20% 회복' },
  // 도적
  slash:     { name: '칼질',        cost: 30, cd: 0,     range: 1.6, mul: 1.25, cuts: 1, desc: '1.25배 피해 · 칼자국 +1' },
  backstab:  { name: '급소 찌르기', cost: 30, cd: 0,     range: 1.6, finisher: true, mul: .8, perCut: .45, bleed: 5000, desc: '칼자국을 모두 써서 0.8배 + 칼자국마다 0.45배 · 출혈' },
  throat:    { name: '목 치기',     cost: 20, cd: 12000, range: 1.6, mul: .5, interrupt: true, offGcd: true, desc: '시전 끊기 · 0.5배 피해' },
  smoke:     { name: '연막탄',      cost: 20, cd: 25000, vanish: 8, offGcd: true, desc: '주변 적이 나를 잊음(위협 초기화)' },
  flurry:    { name: '연속 찌르기', adv: 'assassin', cost: 40, cd: 9000, range: 1.6, hits: 3, mul: 1.0, cuts: 2, desc: '1.0배 3회 · 칼자국 +2' },
};
const SKILLBOOK = { commoner: ['power', 'first_aid'], knight: ['bash', 'cleave', 'challenge', 'bulwark', 'first_aid'], mage: ['fireball', 'frostring', 'silence', 'barrier', 'first_aid'], cleric: ['mend', 'ward', 'holy', 'rebuke'], rogue: ['slash', 'backstab', 'throat', 'smoke', 'first_aid'] };
// the skills on a class's bar (keys 1..6): base class book, the advanced class's own skill slotted before 응급 치료
export function skillsFor(cls) {
  const list = [...SKILLBOOK[baseClass(cls)]]; const extra = Object.keys(SKILLS).find(k => SKILLS[k].adv === cls);
  if (extra) list.splice(list.includes('first_aid') ? list.length - 1 : list.length, 0, extra); return list;
}
export const skillRange = (s, attackRange) => s.range === 'weapon' ? attackRange + .3 : (s.range || 0);
export const skillCostText = (s, cls) => s.cost ? `${RESOURCES[resourceOf(cls)].name} ${s.cost}` : '소모 없음';
export function statsFor(level, cls = 'commoner') {
  const c = CLASSES.commoner; const adv = ADV[cls]; const baseCls = adv ? adv.from : cls; const k = CLASSES[baseCls] || c;
  const lv1 = Math.min(level, CLASS_LEVEL) - 1, lv2 = baseCls === 'commoner' ? level - Math.min(level, CLASS_LEVEL) : level - CLASS_LEVEL;
  const g = baseCls === 'commoner' ? c : k; const b = k.bonus || {}; const b2 = adv ? adv.bonus : {};
  return {
    maxHp: Math.round(100 + c.hp * lv1 + g.hp * lv2 + (b.hp || 0) + (b2.hp || 0)),
    maxMp: Math.round(40 + c.mp * lv1 + g.mp * lv2 + (b.mp || 0) + (b2.mp || 0)),
    atk: Math.round(10 + c.atk * lv1 + g.atk * lv2 + (b.atk || 0) + (b2.atk || 0)),
    def: Math.round(2 + c.def * lv1 + g.def * lv2 + (b.def || 0) + (b2.def || 0)),
  };
}
export const BANK_SIZE = 48;

export const QUESTS = [
  { id: 'minions',  giver: 'guard_s1', title: '성문 밖의 해골들', desc: '남문 경비병이 성문 근처를 어슬렁대는 해골 졸개를 걱정합니다. 해골 졸개 8구를 처치하십시오.', type: 'kill', target: 'skel_minion', n: 8, lvl: 1, reward: { gold: 120, exp: 100, items: { hpPotion: 3 } } },
  { id: 'iron',     giver: 'smith',    title: '녹슨 철조각',     desc: '로릭은 해골 도적들이 들고 다니는 철조각을 녹여 쓰고 싶어 합니다. 녹슨 철조각 5개를 가져오십시오.', type: 'collect', target: 'rustyIron', n: 5, lvl: 3, reward: { gold: 150, exp: 220, items: { shortSword: 1 } } },
  { id: 'cloth',    giver: 'market',   title: '저주받은 천',     desc: '베라는 해골 전사의 누더기에서 저주를 걷어내면 좋은 옷감이 된다고 합니다. 저주받은 천 4장을 가져오십시오.', type: 'collect', target: 'cursedCloth', n: 4, lvl: 6, reward: { gold: 260, exp: 420, items: { leatherBoots: 1, leatherGloves: 1 } } },
  { id: 'warriors', giver: 'chapel',   title: '안식 없는 전사들', desc: '사제 안셀은 해골 전사들이 묻히지 못한 영혼이라 믿습니다. 해골 전사 10구를 잠재우십시오.', type: 'kill', target: 'skel_warrior', n: 10, lvl: 7, reward: { gold: 320, exp: 700 } },
  { id: 'fang',     giver: 'knights',  title: '회색 송곳니',     desc: '기사단장 가웨인은 남동쪽 강가를 지배하는 회색 송곳니를 처치하라 명합니다. 혼자서는 버거울 수 있습니다.', type: 'kill', target: 'boss_fang', n: 1, lvl: 6, reward: { gold: 500, exp: 900, items: { ironHelm: 1 } } },
  { id: 'gems',     giver: 'magetower', title: '영혼석',         desc: '이졸데는 해골 마법사가 품은 영혼석으로 연구를 하고 있습니다. 영혼석 3개를 가져오십시오.', type: 'collect', target: 'soulGem', n: 3, lvl: 11, reward: { gold: 600, exp: 1300, items: { mpPotion: 5 } } },
  { id: 'paladin',  giver: 'chapel',   title: '타락한 성기사',   desc: '북동쪽 검은 숲을 떠도는 타락한 성기사를 구원하십시오. 그의 방패는 아직 빛을 기억합니다.', type: 'kill', target: 'boss_paladin', n: 1, lvl: 11, reward: { gold: 900, exp: 2000, items: { silverRing: 1 } } },
  { id: 'chief',    giver: 'knights',  title: '족장 크루쉬',     desc: '북서쪽 황야 야영지를 이끄는 족장 크루쉬를 쓰러뜨려야 성벽이 안전해집니다.', type: 'kill', target: 'boss_chief', n: 1, lvl: 16, reward: { gold: 1600, exp: 4000 } },
  // daily bounties: reset every day (KST), repeatable
  { id: 'd_rogue',  giver: 'guard_s1', daily: true, title: '현상금: 해골 도적', desc: '경비대가 매일 거는 현상금입니다. 해골 도적 12구를 처치하십시오. (매일 초기화)', type: 'kill', target: 'skel_rogue', n: 12, lvl: 4, reward: { gold: 260, exp: 360 } },
  { id: 'd_elite',  giver: 'knights',  daily: true, title: '현상금: 정예 사냥', desc: '기사단이 정예 몬스터 3마리의 목에 현상금을 걸었습니다. 금색 이름의 정예를 찾아 처치하십시오. (매일 초기화)', type: 'kill', target: 'elite', n: 3, lvl: 8, reward: { gold: 700, exp: 900, items: { hpPotion: 5 } } },
  { id: 'd_mage',   giver: 'magetower', daily: true, title: '현상금: 해골 마법사', desc: '이졸데가 해골 마법사 6구의 처치를 매일 의뢰합니다. (매일 초기화)', type: 'kill', target: 'skel_mage', n: 6, lvl: 13, reward: { gold: 900, exp: 1500, items: { mpPotion: 4 } } },
  { id: 'crypt1',   giver: 'chapel',   title: '지하 묘지의 굶주린 자들', desc: '사제 안셀은 남서쪽 폐허 탑 아래 지하 묘지에서 구울이 올라온다고 합니다. 묘지 구울 10구를 처치하십시오.', type: 'kill', target: 'crypt_ghoul', n: 10, lvl: 14, reward: { gold: 1100, exp: 2800, items: { hpPotion: 5 } } },
  { id: 'crypt2',   giver: 'knights',  title: '심연의 기사들',   desc: '지하 묘지 3층에서 심연의 기사들이 모르바스를 지킵니다. 8구를 쓰러뜨려 길을 여십시오.', type: 'kill', target: 'crypt_knight', n: 8, lvl: 22, reward: { gold: 2600, exp: 7000 } },
  { id: 'cryptlord', giver: 'knights', title: '묘지기 모르바스',     desc: '지하 묘지 가장 깊은 방의 묘지기 모르바스를 쓰러뜨리십시오. 파티를 꾸려 가는 것이 좋습니다.', type: 'kill', target: 'boss_crypt', n: 1, lvl: 26, reward: { gold: 7000, exp: 16000, items: { soulGem: 4 } } },
  { id: 'lich',     giver: 'magetower', title: '리치 왕',        desc: '남서쪽 늪지에 잠든 리치 왕이 깨어났습니다. 레이븐무어의 운명이 걸려 있습니다.', type: 'kill', target: 'boss_lich', n: 1, lvl: 22, reward: { gold: 4000, exp: 9000, items: { soulGem: 3 } } },
];

// titles: unlocked by deeds, chosen in the character window, shown before the name
export const TITLES = [
  { id: 'none',     name: '',               desc: '칭호 없음', req: () => true },
  { id: 'novice',   name: '풋내기',         desc: '레이븐무어에 처음 발을 들였다.', req: () => true },
  { id: 'skilled',  name: '숙련된',         desc: '레벨 10 달성', req: (p) => p.level >= 10 },
  { id: 'veteran',  name: '노련한',         desc: '레벨 20 달성', req: (p) => p.level >= 20 },
  { id: 'legend',   name: '전설의',         desc: '레벨 30 달성', req: (p) => p.level >= 30 },
  { id: 'hunter',   name: '사냥꾼',         desc: '몬스터 200마리 처치', req: (p, s) => (s.mkills || 0) >= 200 },
  { id: 'slayer',   name: '학살자',         desc: '몬스터 1000마리 처치', req: (p, s) => (s.mkills || 0) >= 1000 },
  { id: 'bossh',    name: '보스 사냥꾼',    desc: '보스 처치 1회', req: (p, s) => (s.bossKills || 0) >= 1 },
  { id: 'kingh',    name: '왕을 벤',        desc: '보스 처치 10회', req: (p, s) => (s.bossKills || 0) >= 10 },
  { id: 'outlaw',   name: '무법자',         desc: '모험가 10명 처치 (PK)', req: (p, s) => (s.pks || 0) >= 10 },
  { id: 'guardian', name: '성벽의 수호자',  desc: '성문 습격 격퇴 3회', req: (p, s) => (s.raids || 0) >= 3 },
  { id: 'hero',     name: '레이븐무어의 영웅', desc: '모든 본편 의뢰 완료', req: (p, s) => QUESTS.filter(q => !q.daily).every(q => p.quests && p.quests[q.id] && p.quests[q.id].st === 'done') },
  { id: 'rich',     name: '부유한',         desc: '금화 50,000 보유 (창고 포함)', req: (p) => (p.gold + (p.bankGold || 0)) >= 50000 },
];
export const TITLE_BY = Object.fromEntries(TITLES.map(t => [t.id, t]));
export function titleName(id) { const t = TITLE_BY[id]; return t ? t.name : ''; }

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
