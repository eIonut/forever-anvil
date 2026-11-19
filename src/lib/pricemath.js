// Forever Tome price math, shared by the price job (Node) and the website (browser) as an ES module.
// Pure functions only (no network, no files). Tests: pipeline/aggregate.test.js

const DAY_MS = 86400000;
const HISTORY_DAYS = 30; // Blizzard API terms: keep API data no longer than 30 days
const SHARDS = 32;       // daily history is split into 32 files by item ID

// Price per single item in copper, or null if the listing has no buyout (bid-only).
function unitPrice(listing) {
  if (listing.unit_price != null) return listing.unit_price;
  if (listing.buyout != null && listing.quantity > 0) return listing.buyout / listing.quantity;
  return null;
}

// listings: raw auction objects ({ item: {id}, buyout|unit_price, quantity }).
// Returns { [itemId]: [min, market, qty, listings] } with whole-copper prices, where
//   min    = cheapest price per unit
//   market = quantity-weighted average of the cheapest 10% of units on sale (at least 1 unit);
//            more stable than the minimum, which one cheap listing can distort
//   qty    = total units listed
//   listings = number of listings
function aggregate(listings) {
  const byItem = new Map();
  for (const l of listings) {
    const id = l.item && l.item.id;
    const unit = unitPrice(l);
    const q = l.quantity || 1;
    if (!id || unit == null || !(unit >= 0)) continue;
    let arr = byItem.get(id);
    if (!arr) byItem.set(id, (arr = []));
    arr.push([unit, q]);
  }
  const out = {};
  for (const [id, arr] of byItem) {
    arr.sort((a, b) => a[0] - b[0]);
    const qty = arr.reduce((s, x) => s + x[1], 0);
    const want = Math.max(1, Math.ceil(qty * 0.1));
    let taken = 0, sum = 0;
    for (const [unit, q] of arr) {
      const use = Math.min(q, want - taken);
      sum += unit * use;
      taken += use;
      if (taken >= want) break;
    }
    out[id] = [Math.round(arr[0][0]), Math.round(sum / taken), qty, arr.length];
  }
  return out;
}

const dayNumber = (ms) => Math.floor(ms / DAY_MS);

// history: { [houseId]: { [itemId]: [[day, market, min, qty], ...] } } for ONE shard.
// Adds/replaces today's point for every item in this shard and drops points older than 30 days.
// Mutates and returns history.
function updateHistory(history, houseId, items, shard, nowMs) {
  const today = dayNumber(nowMs);
  const house = history[houseId] || (history[houseId] = {});
  for (const id of Object.keys(items)) {
    if (Number(id) % SHARDS !== shard) continue;
    const [min, market, qty] = items[id];
    const pts = house[id] || (house[id] = []);
    const last = pts[pts.length - 1];
    if (last && last[0] === today) pts[pts.length - 1] = [today, market, min, qty];
    else pts.push([today, market, min, qty]);
  }
  return pruneHistory(history, nowMs);
}

// Remove points older than 30 days and items/houses left empty.
function pruneHistory(history, nowMs) {
  const oldest = dayNumber(nowMs) - (HISTORY_DAYS - 1);
  for (const h of Object.keys(history)) {
    for (const id of Object.keys(history[h])) {
      history[h][id] = history[h][id].filter((p) => p[0] >= oldest);
      if (!history[h][id].length) delete history[h][id];
    }
    if (!Object.keys(history[h]).length) delete history[h];
  }
  return history;
}

// Biggest price changes and deals for ONE auction house.
// houseHistory: { [itemId]: [[day, market, min, qty], ...] } (all shards merged)
// latestItems:  { [itemId]: [min, market, qty, listings] } from this hour's snapshot
// Returns { days, rising, falling, deals } where
//   rising/falling: [[itemId, pctChange, marketNow, marketBefore], ...]  (vs ~7 days ago, or the oldest point)
//   deals:          [[itemId, minNow, typicalMarket, qtyNow], ...]       (cheapest listing ≤ 60% of the usual price)
// Filters out thin/cheap items so one listing can't create a fake "trend".
function computeMovers(houseHistory, latestItems, today, opts) {
  opts = Object.assign({ minQty: 10, minPrice: 50, top: 25, dealRatio: 0.6 }, opts || {});
  let days = 0;
  const changes = [], deals = [];
  for (const id of Object.keys(houseHistory)) {
    const pts = houseHistory[id];
    if (!pts.length) continue;
    days = Math.max(days, pts[pts.length - 1][0] - pts[0][0] + 1);
    const now = latestItems[id];
    if (!now) continue;
    const [minNow, marketNow, qtyNow] = now;
    const past = pts.filter((p) => p[0] < today);
    if (!past.length) continue;
    // compare with the point closest to 7 days ago (or the oldest we have)
    let ref = past[0];
    for (const p of past) if (p[0] <= today - 7) ref = p;
    if (qtyNow >= opts.minQty && ref[3] >= opts.minQty && marketNow >= opts.minPrice && ref[1] >= opts.minPrice) {
      const pct = Math.round((marketNow - ref[1]) / ref[1] * 100);
      if (pct !== 0) changes.push([Number(id), pct, marketNow, ref[1]]);
    }
    // deal: today's cheapest listing far below the usual market price (median of past points)
    if (past.length >= 2) {
      const sorted = past.map((p) => p[1]).sort((a, b) => a - b);
      const typical = sorted[Math.floor(sorted.length / 2)];
      if (typical >= opts.minPrice * 2 && minNow <= typical * opts.dealRatio) deals.push([Number(id), minNow, typical, qtyNow]);
    }
  }
  changes.sort((a, b) => b[1] - a[1]);
  return {
    days,
    rising: changes.filter((c) => c[1] > 0).slice(0, opts.top),
    falling: changes.filter((c) => c[1] < 0).reverse().slice(0, opts.top),
    deals: deals.sort((a, b) => a[1] / a[2] - b[1] / b[2]).slice(0, opts.top)
  };
}

// Materials cost and profit for one recipe.
// recipe: { q: craftedQty, item: craftedItemId, r: [[reagentId, qty], ...] }
// price(id) → { ah: marketCopper|null, vendor: vendorBuyCopper|null, sell: vendorSellCopper|null }
// Returns { cost, costComplete, sellAh, sellVendor, profit, margin, parts }
function craftProfit(recipe, price) {
  let cost = 0, complete = true;
  const parts = recipe.r.map(([id, qty]) => {
    const p = price(id);
    const unit = p.ah != null ? p.ah : p.vendor;
    const source = p.ah != null ? "ah" : p.vendor != null ? "vendor" : null;
    if (unit == null) complete = false; else cost += unit * qty;
    return { id, qty, unit, source };
  });
  const out = price(recipe.item);
  const q = recipe.q || 1;
  const sellAh = out.ah != null ? out.ah * q : null;
  const sellVendor = out.sell != null ? out.sell * q : null;
  const profit = sellAh != null && complete ? Math.round(sellAh * 0.95 - cost) : null; // AH keeps 5%
  const margin = profit != null && cost > 0 ? Math.round(profit / cost * 100) : null;
  return { cost: Math.round(cost), costComplete: complete, sellAh, sellVendor, profit, margin, parts };
}

// Vendor flips: listings you can buy on the AH for less than a vendor pays for them.
// listings: raw auctions for ONE house; vendorPrice(id) → copper a vendor pays per unit (or null)
// Only counts listings with a buyout. Returns the best `top` items, most total profit first:
//   [[itemId, unitsBelowVendor, totalProfit, cheapestUnit, vendorPays], ...]
// A flip must earn at least minProfit copper AND minPct of the vendor price per unit,
// so "pay 25s 99c to earn 10c" (0.4%) doesn't count: too risky for too little.
function computeFlips(listings, vendorPrice, opts) {
  opts = Object.assign({ minProfit: 10, minPct: 0.05, top: 100 }, opts || {});
  const byItem = new Map();
  for (const l of listings) {
    const id = l.item && l.item.id;
    const unit = unitPrice(l);
    if (!id || unit == null) continue;
    const vendor = vendorPrice(id);
    if (!vendor || unit > vendor - Math.max(opts.minProfit, vendor * opts.minPct)) continue;
    const q = l.quantity || 1;
    let e = byItem.get(id);
    if (!e) byItem.set(id, (e = [id, 0, 0, unit, vendor]));
    e[1] += q;
    e[2] += (vendor - unit) * q;
    if (unit < e[3]) e[3] = unit;
  }
  return [...byItem.values()]
    .map((e) => [e[0], e[1], Math.round(e[2]), Math.round(e[3]), e[4]])
    .sort((a, b) => b[2] - a[2])
    .slice(0, opts.top);
}

// Readable part of a page address: "Zoë's Crêpe" → "zoes-crepe" (see src/lib/urls.ts)
function slugify(name) {
  return String(name || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // é → e
    .toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Item icon on Blizzard's image server, from the icon file id in the item cache (entry [6]).
// The same id works in every region; sizes 18, 36 and 56 exist.
function iconUrl(fileId, region, size) {
  return fileId ? "https://render.worldofwarcraft.com/forever-" + (region || "eu") + "/icons/" + (size || 36) + "/" + fileId + ".jpg" : null;
}

// Combined shopping list for a crafting plan.
// plan: [{ recipe: { id, q, item, r: [[reagentId, qty], ...] }, crafts }]
// have: { itemId: unitsAlreadyOwned }; price(id) → { ah, vendor, sell }
// Returns { mats: [{ id, need, have, buy, unit, source, cost }], cost, complete, sales, profit }
function planShoppingList(plan, have, price) {
  const need = new Map();
  let sales = 0, salesComplete = true;
  for (const p of plan) {
    const crafts = Math.max(0, Math.floor(p.crafts || 0));
    for (const [id, qty] of p.recipe.r) need.set(id, (need.get(id) || 0) + qty * crafts);
    if (p.recipe.item) {
      const out = price(p.recipe.item);
      if (out.ah != null) sales += out.ah * (p.recipe.q || 1) * crafts; else salesComplete = false;
    }
  }
  let cost = 0, complete = true;
  const mats = [...need.entries()].map(([id, n]) => {
    const own = Math.max(0, Math.floor((have && have[id]) || 0));
    const buy = Math.max(0, n - own);
    const pr = price(id);
    const unit = pr.ah != null ? pr.ah : pr.vendor;
    const source = pr.ah != null ? "ah" : pr.vendor != null ? "vendor" : null;
    const c = unit != null ? unit * buy : null;
    if (buy > 0 && unit == null) complete = false;
    if (c != null) cost += c;
    return { id, need: n, have: Math.min(own, n), buy, unit, source, cost: c };
  });
  const net = Math.round(sales * 0.95); // AH keeps 5%
  return { mats, cost: Math.round(cost), complete, sales: net, salesComplete, profit: complete && salesComplete ? net - Math.round(cost) : null };
}

export { unitPrice, aggregate, updateHistory, pruneHistory, computeMovers, craftProfit, computeFlips, planShoppingList, slugify, iconUrl, dayNumber, HISTORY_DAYS, SHARDS, DAY_MS };
