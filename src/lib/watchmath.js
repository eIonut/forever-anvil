// Math for the watchlist (/watchlist) and the home page's "your market right now" summary.
// Pure functions only (no network, no storage), so the tests can run them. Tests: pipeline/watchmath.test.js
import { craftProfit, dayNumber } from "./pricemath.js";

const MAX_GOLD = 1000000; // the same ceiling as the price job's joke-listing cut (PLACEHOLDER_PRICE)

/**
 * The gold, silver and copper boxes of a price input (src/tools/MoneyInput.svelte) → copper.
 * Each box may be empty (= 0); anything but digits is ignored. Silver or copper over 99 carries over,
 * like 150 silver = 1g 50s. Returns null when all boxes are empty, the total is 0, or it's above the
 * joke-listing ceiling.
 *   ("1", "50", "")  → 15000     ("", "150", "") → 15000     ("", "", "") → null
 */
function moneyFromParts(gold, silver, copper) {
  const part = (v) => String(v == null ? "" : v).replace(/\D/g, "");
  const g = part(gold), s = part(silver), c = part(copper);
  if (!g && !s && !c) return null;
  const total = Number(g || 0) * 10000 + Number(s || 0) * 100 + Number(c || 0);
  return total > 0 && total < MAX_GOLD * 10000 ? total : null;
}

/**
 * How much the market price has moved since about `days` days ago.
 * points: one item's daily history, [[dayNumber, market, min, qty], ...], oldest first
 * now:    the market price right now (from the hourly prices file)
 * Uses the oldest point inside the window, so a new item compares with its first day.
 * Returns { pct, days } or null when there's no earlier day to compare with.
 */
function changeSince(points, now, days = 7, today = dayNumber(Date.now())) {
  if (!Array.isArray(points) || !(now > 0)) return null;
  const from = points.find((p) => p[0] >= today - days && p[0] < today && p[1] > 0);
  if (!from) return null;
  return { pct: Math.round((now - from[1]) / from[1] * 100), days: today - from[0] };
}

/** A list of item ids for a share link: "2770,2589,4306", at most `max`, no repeats */
function encodeIds(ids, max = 200) {
  return [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max).join(",");
}

/** The ids= part of a share link → item ids (anything that isn't an id is dropped) */
function decodeIds(text, max = 200) {
  if (!text) return [];
  const out = [];
  for (const part of String(text).split(/[,\s]+/)) {
    if (!/^\d{1,7}$/.test(part)) continue;
    const n = Number(part);
    if (n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The auction house in a server group where an item is cheapest right now.
 * houses: { [houseId]: { faction, items: { [itemId]: [min, market, qty, listings, sold?] } } }
 * Returns { houseId, faction, market } or null when no house lists it.
 */
function cheapestHouse(houses, itemId) {
  let best = null;
  for (const [houseId, h] of Object.entries(houses || {})) {
    const a = h.items && h.items[itemId];
    if (a && a[1] > 0 && (!best || a[1] < best.market)) best = { houseId, faction: h.faction, market: a[1] };
  }
  return best;
}

/**
 * Today's best crafts on one auction house, for the home page: profit after materials and the AH cut,
 * leaving out thin markets (fewer than minListings listings of the crafted item) and, once sales are
 * counted, items that sell less than minSold a day, so the list holds things that actually sell.
 * professions: the recipes file's professions; houseItems: one house's items; items: the item cache
 * (vendor prices); salesHours: the house's salesHours (0/absent = sales not counted yet).
 * Returns [{ recipe, profession, profit, margin, sold }] best first.
 */
function bestCrafts(professions, houseItems, items, opts = {}) {
  const { top = 5, minListings = 3, minSold = 1, salesHours = 0 } = opts;
  const price = (id) => {
    const a = houseItems[id], it = items[id] || [];
    return { ah: a ? a[1] : null, vendor: it[3] ? it[3] : null, sell: it[1] ? it[1] : null };
  };
  const out = [];
  for (const p of professions || []) {
    for (const r of p.recipes || []) {
      const [, , , itemId, , makes, reagents] = r;
      if (!itemId || !reagents || !reagents.length) continue;
      const made = houseItems[itemId];
      if (!made || made[3] < minListings) continue;
      const sold = made[4] || 0;
      if (salesHours && sold < minSold) continue;
      const res = craftProfit({ q: makes, item: itemId, r: reagents }, price);
      if (res.profit == null || res.profit <= 0 || !res.costComplete) continue;
      out.push({ recipe: r, profession: p.name, profit: res.profit, margin: res.margin, sold });
    }
  }
  out.sort((a, b) => b.profit - a.profit);
  // one row per crafted item: several recipes making the same item would just repeat it
  const seen = new Set(), list = [];
  for (const x of out) {
    if (seen.has(x.recipe[3])) continue;
    seen.add(x.recipe[3]);
    list.push(x);
    if (list.length >= top) break;
  }
  return list;
}

/**
 * What sells fastest on one auction house, by gold changing hands per day (units sold per day × market
 * price), so a few pricey sales and lots of cheap ones compare fairly. Thin markets (fewer than
 * minListings listings) are left out: one listing's price says little about what the item sells for.
 * houseItems: { [itemId]: [min, market, qty, listings, soldPerDay?] }
 * Returns [{ id, sold, market, perDay }] most gold first.
 */
function topSellers(houseItems, top = 5, minListings = 3) {
  const out = [];
  for (const [id, a] of Object.entries(houseItems || {})) {
    const sold = a[4] || 0;
    if (sold < 1 || a[3] < minListings || !(a[1] > 0)) continue;
    out.push({ id: Number(id), sold, market: a[1], perDay: Math.round(sold * a[1]) });
  }
  return out.sort((a, b) => b.perDay - a.perDay).slice(0, top);
}

/**
 * Watched items whose lowest listing is at or below their target price right now.
 * watched: [{ id, below }]; houseItems: one house's live items. Returns their ids.
 */
function targetHits(watched, houseItems) {
  const out = [];
  for (const w of watched || []) {
    const a = houseItems && houseItems[w.id];
    if (w.below > 0 && a && a[0] <= w.below) out.push(w.id);
  }
  return out;
}

/**
 * The message when fresh prices bring items to their targets. hits: [{ name, min }] (min in copper);
 * money: formats copper ("1s 0c"). One or two items get a message each; more share one message,
 * so a big update doesn't bury the screen in toasts. Returns the messages to show.
 */
function hitMessages(hits, money) {
  if (!hits.length) return [];
  if (hits.length <= 2) return hits.map((h) => `${h.name} is at your target (${money(h.min)})`);
  const names = hits.map((h) => h.name);
  return [`${hits.length} items reached your target: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`];
}

export { moneyFromParts, changeSince, encodeIds, decodeIds, cheapestHouse, bestCrafts, topSellers, targetHits, hitMessages };
