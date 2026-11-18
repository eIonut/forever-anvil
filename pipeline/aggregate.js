// Price math for the auction pipeline. Pure functions only (no network, no files),
// so they're easy to test: see aggregate.test.js.
"use strict";

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

module.exports = { unitPrice, aggregate, updateHistory, pruneHistory, dayNumber, HISTORY_DAYS, SHARDS, DAY_MS };
