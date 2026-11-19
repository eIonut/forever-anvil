// Forever Tome economy math, shared by the price job (Node) and the Economy page (browser).
// Pure functions only (no network, no files). Tests: pipeline/econmath.test.js
//
// Prices come from the group files the price job writes:
//   group = { houses: { [houseId]: { faction, listings, items: { [itemId]: [min, market, qty, listings] } } } }
// Item info comes from the item cache: items[id] = [name, vendorSells, day, vendorBuys, quality, itemClass, icon, source]

const HOUR = 3600;
const DAY = 86400;
const WILD = 10000 * 10000;     // 10,000g in copper: a single item priced above this is a joke listing, not a price

// Materials on the trade board, by item ID (WoW: Forever uses the classic item IDs).
const BASKETS = {
  ORE: [2770, 2771, 2775, 2772, 2776, 3858, 7911, 10620, 2840, 3576, 2841, 2842, 3575, 3577, 3859, 3860, 6037, 12359, 2835, 2836, 2838, 7912, 12365],
  CLOTH: [2589, 2592, 4306, 4338, 14047, 14256, 2996, 2997, 4305, 4339, 14048],
  LEATHER: [2934, 2318, 2319, 4234, 4304, 8170, 783, 4232, 4235, 8169, 8171],
  HERB: [2447, 765, 2449, 785, 2450, 2452, 3820, 2453, 3355, 3369, 3356, 3357, 3818, 3821, 3358, 3819, 4625, 8831, 8836, 8838, 8839, 8845, 8846, 13464, 13463, 13465, 13466, 13467, 13468],
  ENCH: [10940, 11083, 11137, 11176, 16204, 10938, 10939, 10998, 11082, 11134, 11135, 11174, 11175, 16202, 16203, 10978, 11084, 11138, 11139, 11177, 11178, 14343, 14344],
  ELEM: [7068, 7067, 7070, 7069, 7077, 7078, 7075, 7076, 7079, 7080, 7081, 7082, 7972, 12808, 12803, 10286],
  GEM: [774, 818, 1210, 1206, 1705, 1529, 3864, 7909, 7910, 12799, 12361, 12364, 12800, 12363]
};
const BOARD_IDS = [...new Set(Object.values(BASKETS).flat())];

/* ---------- small helpers ---------- */

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const fair = (market) => market > 0 && market <= WILD; // a believable unit price

/** Gold value of one item's listings, or 0 for wild prices */
const itemValue = (a) => (fair(a[1]) ? a[1] * a[2] : 0);

/**
 * Turn one group's daily history (all shards merged) into daily snapshots, oldest first.
 * history: { [houseId]: { [itemId]: [[day, market, min, qty], ...] } }
 * houses: the group's current houses (for the faction names)
 * Returns [{ day, group: { houses: { [houseId]: { faction, listings: null, items } } } }, ...]
 */
function snapshotsFromHistory(history, houses) {
  const byDay = new Map();
  for (const [houseId, items] of Object.entries(history)) {
    for (const [id, pts] of Object.entries(items)) {
      for (const [day, market, min, qty] of pts) {
        let snap = byDay.get(day);
        if (!snap) byDay.set(day, (snap = { houses: {} }));
        const h = snap.houses[houseId] || (snap.houses[houseId] = { faction: houses[houseId] ? houses[houseId].faction : null, listings: null, items: {} });
        h.items[id] = [min, market, qty, 0];
      }
    }
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, group]) => ({ day, group }));
}

/* ---------- 24-hour change for the trade board ---------- */

/**
 * Keep a ring of market prices for the board items (36 hours), and work out each item's
 * change since about a day ago. ring = { t: [sec...], p: { [houseId]: { [itemId]: [market|null...] } } }
 * Returns { ring, chg: { [houseId]: { [itemId]: pct } } }.
 */
function updateRing(ring, group, nowSec, ids) {
  ring = ring && Array.isArray(ring.t) ? ring : { t: [], p: {} };
  ids = ids || BOARD_IDS;
  // drop points older than 36 hours
  let cut = 0;
  while (cut < ring.t.length && ring.t[cut] < nowSec - 36 * HOUR) cut++;
  if (cut) { ring.t = ring.t.slice(cut); for (const h of Object.values(ring.p)) for (const id of Object.keys(h)) h[id] = h[id].slice(cut); }
  const n = ring.t.length;
  // the reference point: of those at least 20 hours old, the one closest to 24 hours ago
  let ref = -1;
  for (let i = 0; i < n; i++) {
    if (ring.t[i] > nowSec - 20 * HOUR) continue;
    if (ref < 0 || Math.abs(ring.t[i] - (nowSec - 24 * HOUR)) < Math.abs(ring.t[ref] - (nowSec - 24 * HOUR))) ref = i;
  }
  const chg = {};
  for (const [houseId, h] of Object.entries(group.houses)) {
    const rp = ring.p[houseId] || (ring.p[houseId] = {});
    const out = (chg[houseId] = {});
    for (const id of ids) {
      const key = String(id);
      const a = h.items[key];
      const arr = rp[key] || (rp[key] = new Array(n).fill(null));
      while (arr.length < n) arr.unshift(null);
      const before = ref >= 0 ? arr[ref] : null;
      if (a && before && fair(a[1])) out[key] = round1((a[1] - before) / before * 100);
      arr.push(a ? a[1] : null);
    }
  }
  ring.t.push(nowSec);
  return { ring, chg };
}

/* ---------- views for the Economy page ---------- */

/** One house: listings, units, different items and fair gold value (copper). */
function houseSummary(house) {
  let units = 0, gold = 0, items = 0, sold = 0, soldGold = 0;
  for (const a of Object.values(house.items)) {
    units += a[2]; gold += itemValue(a); items++;
    if (a[4] > 0) { sold += a[4]; if (fair(a[1])) soldGold += a[4] * a[1]; } // estimated units sold per day
  }
  return { listings: house.listings || 0, units, items, gold, sold, soldGold, salesHours: house.salesHours || 0 };
}

const CLASS_LABEL = { "Trade Goods": "Trade goods", Reagent: "Trade goods", Container: "Bags", Quiver: "Bags", Projectile: "Ammo", Quest: "Quest items", Key: "Keys", Miscellaneous: "Miscellaneous", Consumable: "Consumables", Armor: "Armor", Weapon: "Weapons", Recipe: "Recipes" };

/** Gold listed per item class over some houses: [[label, copper], ...], biggest first. */
function goldByClass(houses, items) {
  const by = new Map();
  for (const h of houses) for (const [id, a] of Object.entries(h.items)) {
    const v = itemValue(a);
    if (!v) continue;
    const cls = items[id] && items[id][5];
    const label = (cls && CLASS_LABEL[cls]) || cls || "Other";
    by.set(label, (by.get(label) || 0) + v);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}

/** Most expensive items listed in a group: [{ id, price, houseId, faction, qty }], one row per item. */
function crownJewels(group, n) {
  const best = new Map();
  for (const [houseId, h] of Object.entries(group.houses)) for (const [id, a] of Object.entries(h.items)) {
    if (!fair(a[1])) continue;
    const cur = best.get(id);
    if (!cur || a[1] > cur.price) best.set(id, { id: Number(id), price: a[1], houseId, faction: h.faction, qty: a[2] });
  }
  return [...best.values()].sort((a, b) => b.price - a.price).slice(0, n || 11);
}

/** Items with the most listings ("listings") or the most units ("units") on one house. */
function bazaar(house, mode, n) {
  const col = mode === "units" ? 2 : 3;
  return Object.entries(house.items)
    .map(([id, a]) => ({ id: Number(id), count: a[col], market: a[1] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n || 24);
}

/** Which tab of "Alliance vs Horde" an item class falls under */
function categoryOf(cls) {
  if (cls === "Trade Goods" || cls === "Reagent") return "trade";
  if (cls === "Consumable") return "cons";
  if (cls === "Armor" || cls === "Weapon") return "gear";
  if (cls === "Recipe") return "recipe";
  return "other";
}

/**
 * Items that cost very different amounts on the Alliance and Horde auction houses.
 * Both sides need enough listings and units, and a price of at least 1s, so single listings
 * don't create silly gaps. Returns [{ id, alliance, horde, ratio, cat }], biggest gap first.
 */
function factionGaps(group, items, opts) {
  opts = Object.assign({ minListings: 3, minQty: 5, minPrice: 100 }, opts || {});
  let A = null, H = null;
  for (const h of Object.values(group.houses)) { if (h.faction === "alliance") A = h; if (h.faction === "horde") H = h; }
  if (!A || !H) return [];
  const ok = (x) => x && x[3] >= opts.minListings && x[2] >= opts.minQty && x[1] >= opts.minPrice && fair(x[1]);
  const out = [];
  for (const [id, a] of Object.entries(A.items)) {
    const h = H.items[id];
    if (!ok(a) || !ok(h)) continue;
    const ratio = Math.max(a[1], h[1]) / Math.min(a[1], h[1]);
    if (ratio < 1.05) continue;
    out.push({ id: Number(id), alliance: a[1], horde: h[1], ratio: Math.round(ratio * 100) / 100, cat: categoryOf(items[id] && items[id][5]) });
  }
  return out.sort((x, y) => y.ratio - x.ratio);
}

/**
 * Blackwater flips: buy the cheapest listing on the neutral auction house and resell it on your
 * own faction's house at its market price, after your house's 5% cut. Your house needs at least
 * minListings listings of the item (so there's real trade), and the profit must be at least
 * minProfit copper and minPct of the buy price. Ignores deposits and whether it actually sells.
 * Returns [{ id, buy, sell, profit, pct, neutralQty, ownListings }], most profit per unit first.
 */
function blackwaterFlips(group, faction, opts) {
  opts = Object.assign({ minListings: 5, minProfit: 50, minPct: 0.1, top: 25 }, opts || {});
  let own = null, neutral = null;
  for (const h of Object.values(group.houses)) { if (h.faction === faction) own = h; if (h.faction === "neutral") neutral = h; }
  if (!own || !neutral || own === neutral) return [];
  const out = [];
  for (const [id, n] of Object.entries(neutral.items)) {
    const o = own.items[id];
    if (!o || o[3] < opts.minListings || !fair(o[1]) || !fair(n[0])) continue;
    const sell = Math.floor(o[1] * 0.95);
    const profit = sell - n[0];
    if (profit < opts.minProfit || profit < n[0] * opts.minPct) continue;
    out.push({ id: Number(id), buy: n[0], sell, profit, pct: Math.round(profit / n[0] * 100), neutralQty: n[2], ownListings: o[3] });
  }
  return out.sort((a, b) => b.profit - a.profit).slice(0, opts.top);
}

/**
 * Squarified treemap: lay out values in a w × h box with rectangles close to square.
 * values: [{ key, value }] (any order). Returns [{ key, value, x, y, w, h }].
 */
function squarify(values, w, h) {
  const items = values.filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((s, v) => s + v.value, 0);
  const out = [];
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let x = 0, y = 0, W = w, H = h, row = [], i = 0;
  const worst = (r, side) => {
    const s = r.reduce((a, v) => a + v.value * scale, 0);
    let mx = 0, mn = Infinity;
    for (const v of r) { const a = v.value * scale; mx = Math.max(mx, a); mn = Math.min(mn, a); }
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const place = (r) => {
    const s = r.reduce((a, v) => a + v.value * scale, 0);
    if (W >= H) { // column on the left
      const cw = s / H; let cy = y;
      for (const v of r) { const ch = (v.value * scale) / cw; out.push({ key: v.key, value: v.value, x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; W -= cw;
    } else {      // row on top
      const rh = s / W; let cx = x;
      for (const v of r) { const cw = (v.value * scale) / rh; out.push({ key: v.key, value: v.value, x: cx, y, w: cw, h: rh }); cx += cw; }
      y += rh; H -= rh;
    }
  };
  while (i < items.length) {
    const side = Math.min(W, H);
    const next = [...row, items[i]];
    if (!row.length || worst(next, side) <= worst(row, side)) { row = next; i++; }
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

export {
  BASKETS, BOARD_IDS, WILD, HOUR, DAY,
  snapshotsFromHistory, updateRing,
  houseSummary, goldByClass, crownJewels, bazaar, categoryOf, factionGaps, blackwaterFlips, squarify
};
