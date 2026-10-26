// Player market: list an item for gold at the merchant, anyone can buy it; proceeds (minus a 5% fee) go to the seller
// immediately if online, otherwise straight into their saved character.
import { db } from './db.js';
import { ITEMS, INV_SIZE, itemName } from '../shared/rules.js';

db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_account INTEGER NOT NULL,
  seller_name TEXT NOT NULL,
  item TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_created ON listings(created_at);
`);
const q = {
  all: db.prepare('SELECT * FROM listings ORDER BY created_at DESC LIMIT 80'),
  mine: db.prepare('SELECT COUNT(*) AS n FROM listings WHERE seller_account = ?'),
  get: db.prepare('SELECT * FROM listings WHERE id = ?'),
  ins: db.prepare('INSERT INTO listings (seller_account, seller_name, item, price, created_at) VALUES (?, ?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM listings WHERE id = ?'),
  payOffline: db.prepare('UPDATE characters SET gold = gold + ? WHERE account_id = ?'),
};
export const MARKET_FEE = .05, MARKET_MAX = 8, MARKET_MIN = 10, MARKET_MAXPRICE = 9_999_999;

export function createMarket({ online, sys, addItem, invChanged, now, logEvent }) {
  function view(p) { return q.all.all().map(r => ({ id: r.id, seller: r.seller_name, item: JSON.parse(r.item), price: r.price, mine: r.seller_account === p.accountId, at: r.created_at })); }
  function list(p, idx, price) {
    const it = p.inv[idx | 0]; if (!it) return sys(p, '등록할 물건을 고르세요.');
    price = Math.floor(+price || 0); if (price < MARKET_MIN || price > MARKET_MAXPRICE) return sys(p, `가격은 ${MARKET_MIN} ~ ${MARKET_MAXPRICE} 금화 사이여야 합니다.`);
    if (q.mine.get(p.accountId).n >= MARKET_MAX) return sys(p, `장터에는 한 번에 ${MARKET_MAX}개까지만 올릴 수 있습니다.`);
    p.inv.splice(idx | 0, 1);
    q.ins.run(p.accountId, p.name, JSON.stringify(it), price, now());
    sys(p, `${itemName(it)}${it.n > 1 ? ' ×' + it.n : ''}을(를) 금화 ${price}에 장터에 올렸습니다. (판매 시 수수료 ${Math.round(MARKET_FEE * 100)}%)`); invChanged(p); logEvent?.('market', p.name, null, `등록 ${itemName(it)} ${price}`);
  }
  function buy(p, id) {
    const r = q.get.get(id | 0); if (!r) return sys(p, '이미 팔렸거나 내려간 물건입니다.');
    if (r.seller_account === p.accountId) return sys(p, '자기 물건은 살 수 없습니다. 취소를 누르세요.');
    if (p.gold < r.price) return sys(p, '금화가 부족합니다.');
    if (p.inv.length >= INV_SIZE) return sys(p, '가방이 가득 찼습니다.');
    const it = JSON.parse(r.item); if (!ITEMS[it.id]) { q.del.run(r.id); return; }
    q.del.run(r.id); p.gold -= r.price; addItem(p, it); invChanged(p);
    const net = Math.floor(r.price * (1 - MARKET_FEE)); const seller = online.get(r.seller_account);
    if (seller) { seller.gold += net; seller.saveDirty = true; invChanged(seller); sys(seller, `장터에서 ${itemName(it)}이(가) 팔렸습니다. 금화 ${net} 입금.`); }
    else q.payOffline.run(net, r.seller_account);
    sys(p, `${itemName(it)}을(를) 금화 ${r.price}에 샀습니다.`); logEvent?.('market', p.name, r.seller_name, `구매 ${itemName(it)} ${r.price}`);
  }
  function cancel(p, id) {
    const r = q.get.get(id | 0); if (!r || r.seller_account !== p.accountId) return sys(p, '내 물건이 아닙니다.');
    if (p.inv.length >= INV_SIZE) return sys(p, '가방이 가득 찼습니다.');
    q.del.run(r.id); addItem(p, JSON.parse(r.item)); invChanged(p); sys(p, '장터에서 물건을 내렸습니다.');
  }
  return { view, list, buy, cancel };
}
