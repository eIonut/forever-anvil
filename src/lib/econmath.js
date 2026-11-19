// Forever Tome economy math, shared by the price job (Node) and the Economy page (browser).
// Pure functions only (no network, no files). Tests: pipeline/econmath.test.js
//
// Prices come from the group files the price job writes:
//   group = { houses: { [houseId]: { faction, listings, items: { [itemId]: [min, market, qty, listings] } } } }
// Item info comes from the item cache: items[id] = [name, vendorSells, day, vendorBuys, quality, itemClass, icon, source]

const HOUR = 3600;
const DAY = 86400;
const KEEP_SECONDS = 30 * DAY;  // Blizzard API terms: keep API data no longer than 30 days
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

const GEAR_QUALITY = new Set(["uncommon", "rare", "epic", "legendary"]);

// The market indexes. Each one follows the typical price of a set of items, starting at 100.
//   classes: item classes (from the item cache) that belong to it; ids: a fixed list of items
//   gear: only uncommon (green) and better; minQty: units needed on both sides of a comparison
const INDEXES = [
  { k: "TOP100", name: "Top 100", group: "Market", desc: "The 100 items with the most gold listed: the market as a whole." },
  { k: "TRADE", name: "Trade goods", group: "Sectors", classes: ["Trade Goods", "Reagent"], desc: "Every crafting material." },
  { k: "CONS", name: "Consumables", group: "Sectors", classes: ["Consumable"], desc: "Potions, elixirs, food, bandages and scrolls." },
  { k: "ARMOR", name: "Armor", group: "Sectors", classes: ["Armor"], gear: true, minQty: 2, desc: "Green and better armor." },
  { k: "WEAP", name: "Weapons", group: "Sectors", classes: ["Weapon"], gear: true, minQty: 2, desc: "Green and better weapons." },
  { k: "RECIPE", name: "Recipes", group: "Sectors", classes: ["Recipe"], minQty: 2, desc: "Patterns, plans, formulas and recipes." },
  { k: "BAGS", name: "Bags", group: "Sectors", classes: ["Container", "Quiver"], minQty: 2, desc: "Bags, quivers and ammo pouches." },
  { k: "ORE", name: "Ore & bars", group: "Materials", ids: BASKETS.ORE, desc: "Ore, bars and stone." },
  { k: "CLOTH", name: "Cloth", group: "Materials", ids: BASKETS.CLOTH, desc: "Linen to Felcloth, and bolts." },
  { k: "LEATHER", name: "Leather", group: "Materials", ids: BASKETS.LEATHER, desc: "Leather and hides." },
  { k: "HERB", name: "Herbs", group: "Materials", ids: BASKETS.HERB, desc: "Every herb." },
  { k: "ENCH", name: "Enchanting", group: "Materials", ids: BASKETS.ENCH, desc: "Dusts, essences and shards." },
  { k: "ELEM", name: "Elemental", group: "Materials", ids: BASKETS.ELEM, desc: "Elementals, hearts, globes and essences." },
  { k: "GEM", name: "Gems", group: "Materials", ids: BASKETS.GEM, desc: "Gems and Arcane Crystal." }
];

/* ---------- small helpers ---------- */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const sig5 = (x) => (x == null ? null : Number(x.toPrecision(5))); // index values: 5 significant digits, so small levels stay precise
const fair = (market) => market > 0 && market <= WILD; // a believable unit price

/** Gold value of one item's listings, or 0 for wild prices */
const itemValue = (a) => (fair(a[1]) ? a[1] * a[2] : 0);

/** Set of item IDs with the most gold listed across a group's houses (fair prices only). */
function topByValue(group, n) {
  const total = new Map();
  for (const h of Object.values(group.houses)) for (const [id, a] of Object.entries(h.items)) total.set(id, (total.get(id) || 0) + itemValue(a));
  return new Set([...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]));
}

/**
 * Which items belong to an index. Returns { ids: string[] | null, test(id) }.
 * prevGroup is used for the Top 100, whose members are the biggest items an hour ago.
 */
function members(def, items, prevGroup) {
  if (def.ids) { const s = new Set(def.ids.map(String)); return { ids: [...s], test: (id) => s.has(id) }; }
  if (def.k === "TOP100") { const s = prevGroup ? topByValue(prevGroup, 100) : new Set(); return { ids: [...s], test: (id) => s.has(id) }; }
  const classes = new Set(def.classes || []);
  return {
    ids: null,
    test: (id) => {
      const e = items[id];
      if (!e || !classes.has(e[5])) return false;
      return !def.gear || GEAR_QUALITY.has(e[4]);
    }
  };
}

/**
 * One step of a chain-linked index: how much the index moves from snapshot `prev` to `cur`.
 * Value-weighted geometric mean of each (house, item) price ratio, so one item can't dominate:
 *   weight = sqrt(price × units) at the earlier snapshot; ratios clamped to [0.25, 4].
 * Only pairs with enough units and a price of at least 10c in both snapshots count.
 * Returns the factor (e.g. 1.02 = up 2%), or null when fewer than minN pairs (carry the index forward).
 */
function chainStep(prev, cur, member, opts) {
  opts = Object.assign({ minQty: 5, minPrice: 10, minN: 5 }, opts || {});
  let sw = 0, swl = 0, n = 0;
  for (const [houseId, h] of Object.entries(cur.houses)) {
    const ph = prev.houses[houseId];
    if (!ph) continue;
    const ids = member.ids || Object.keys(h.items);
    for (const id of ids) {
      if (!member.ids && !member.test(id)) continue;
      const a = ph.items[id], b = h.items[id];
      if (!a || !b) continue;
      if (a[2] < opts.minQty || b[2] < opts.minQty) continue;
      if (a[1] < opts.minPrice || b[1] < opts.minPrice || !fair(a[1]) || !fair(b[1])) continue;
      const r = clamp(b[1] / a[1], 0.25, 4);
      const w = Math.sqrt(a[1] * a[2]);
      sw += w; swl += w * Math.log(r); n++;
    }
  }
  return n >= opts.minN && sw > 0 ? Math.exp(swl / sw) : null;
}

/** Totals for one group snapshot: listings, units and fair gold value. */
function groupTotals(group) {
  let listings = 0, gold = 0;
  for (const h of Object.values(group.houses)) {
    listings += h.listings || 0;
    for (const a of Object.values(h.items)) gold += itemValue(a);
  }
  return { listings, gold };
}

/** An empty series for one group. */
function emptySeries() {
  const idx = {};
  for (const d of INDEXES) idx[d.k] = [];
  return { t: [], idx, auctions: [], gold: [] };
}

/**
 * Add one point to a group's series. prev = the previous snapshot, or null when there is none
 * (the very first point starts every index at 100; later, indexes carry forward).
 * listings may be null (history snapshots don't have it).
 */
function pushPoint(series, prev, cur, items, tSec, listings) {
  const last = series.t.length - 1;
  for (const d of INDEXES) {
    const arr = series.idx[d.k] || (series.idx[d.k] = new Array(series.t.length).fill(null));
    const before = last >= 0 ? arr[last] : null;
    let value;
    if (!prev) value = last >= 0 ? before : 100;  // nothing to compare with: start at 100, or carry forward
    else {
      const f = chainStep(prev, cur, members(d, items, prev), { minQty: d.minQty });
      if (before == null) value = f != null ? 100 : null; // start a late index once there's something to compare
      else value = f == null ? before : before * f;       // too few items this hour: carry it forward
    }
    arr.push(sig5(value));
  }
  const tot = groupTotals(cur);
  series.t.push(tSec);
  series.auctions.push(listings == null ? null : listings);
  series.gold.push(Math.round(tot.gold / 10000)); // whole gold
  return series;
}

/** Drop points older than 30 days. */
function prunePoints(series, nowSec) {
  const oldest = nowSec - KEEP_SECONDS;
  let cut = 0;
  while (cut < series.t.length && series.t[cut] < oldest) cut++;
  if (!cut) return series;
  series.t = series.t.slice(cut);
  series.auctions = series.auctions.slice(cut);
  series.gold = series.gold.slice(cut);
  for (const k of Object.keys(series.idx)) series.idx[k] = series.idx[k].slice(cut);
  return series;
}

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

/**
 * Start a group's series from daily history (days before today), so charts aren't empty on the first run.
 * Returns { series, last } where last is the newest snapshot used (the next hourly point chains from it).
 */
function seedFromHistory(snapshots, items, today) {
  const series = emptySeries();
  let prev = null;
  for (const s of snapshots) {
    if (s.day >= today) continue;
    pushPoint(series, prev, s.group, items, s.day * DAY + DAY / 2, null);
    prev = s.group;
  }
  return { series, last: prev };
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
  let units = 0, gold = 0, items = 0;
  for (const a of Object.values(house.items)) { units += a[2]; gold += itemValue(a); items++; }
  return { listings: house.listings || 0, units, items, gold };
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

/** Index values in [fromSec, ∞), as [[sec, value], ...] (nulls dropped). */
function seriesFrom(t, values, fromSec) {
  const out = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= fromSec && values[i] != null) out.push([t[i], values[i]]);
  return out;
}

export {
  BASKETS, BOARD_IDS, INDEXES, WILD, HOUR, DAY, KEEP_SECONDS,
  members, chainStep, groupTotals, emptySeries, pushPoint, prunePoints, snapshotsFromHistory, seedFromHistory, updateRing,
  houseSummary, goldByClass, crownJewels, bazaar, categoryOf, factionGaps, blackwaterFlips, squarify, seriesFrom, topByValue
};
