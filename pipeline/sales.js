// Sales step of the price job: estimated units sold per day, per item and auction house.
//
// Blizzard's API lists what's for sale, not what sold, and refreshes that list about once an hour.
// So whenever the list has changed, we compare it with the previous one, per auction house:
//   - an auction still there with fewer units had part of its stack bought (always a sale)
//   - an auction that vanished while it still had 2+ hours left (LONG or VERY_LONG) can't have
//     expired, so it was bought or cancelled. Buyers take the cheapest first, so if an older,
//     cheaper auction of the same item is still up, the vanished one was cancelled (usually to
//     undercut) and doesn't count. Otherwise it counts as bought.
// Auctions that vanished with under 2 hours left aren't counted: they may simply have expired.
// That makes the numbers a cautious estimate.
//
// Time is measured with Blizzard's own "last modified" time of the auction data, not our run times:
// the changes between two snapshots happened in the time between them.
//
// Store keys (pipeline-only, never served):
//   salesstate:<region>:<houseId>  previous snapshot, compact, sorted by auction id:
//                                  { v: 2, t: dataTimeMs, d: idDeltas, i: itemIds, q: qtys, p: unitPrices (−1 = bid only), l: "0123…" time left }
//   salesdays:<region>:<houseId>   { d: { [day]: { h: hoursWatched, s: { [itemId]: unitsSold } } } }, last SALES_DAYS days
import { dayNumber, unitPrice } from "../src/lib/pricemath.js";

const SALES_DAYS = 7;       // average over the last week
const MAX_GAP_HOURS = 2.5;  // longer gap between snapshots: start over (a LONG auction could have expired)
const TL = { SHORT: 0, MEDIUM: 1, LONG: 2, VERY_LONG: 3 };

/** listings → compact snapshot, sorted by auction id */
function encodeSnapshot(listings, tMs) {
  const rows = [];
  for (const a of listings) {
    if (!a.id || !a.item || !a.item.id) continue;
    const u = unitPrice(a);
    rows.push([a.id, a.item.id, a.quantity || 1, u == null ? -1 : Math.round(u), TL[a.time_left] ?? 0]);
  }
  rows.sort((x, y) => x[0] - y[0]);
  const d = [], i = [], q = [], p = [];
  let l = "", last = 0;
  for (const r of rows) { d.push(r[0] - last); last = r[0]; i.push(r[1]); q.push(r[2]); p.push(r[3]); l += r[4]; }
  return { v: 2, t: tMs, d, i, q, p, l };
}

/** units sold per item between a snapshot and the current listings: { [itemId]: units } */
function countSales(prev, listings) {
  const now = new Map();
  for (const a of listings) if (a.id) now.set(a.id, a.quantity || 1);
  const n = prev.d.length, ids = new Array(n);
  // cheapest auction per item that was there before and is still there
  const survivorMin = new Map();
  for (let k = 0, id = 0; k < n; k++) {
    id += prev.d[k];
    ids[k] = id;
    const p = prev.p[k];
    if (p >= 0 && now.has(id)) { const m = survivorMin.get(prev.i[k]); if (m === undefined || p < m) survivorMin.set(prev.i[k], p); }
  }
  const sold = {};
  for (let k = 0; k < n; k++) {
    const item = prev.i[k], was = prev.q[k], left = now.get(ids[k]);
    let units = 0;
    if (left !== undefined) { if (left < was) units = was - left; }   // part of a stack bought
    else if (Number(prev.l[k]) >= TL.LONG && prev.p[k] >= 0) {         // gone, couldn't have expired
      const cheaper = survivorMin.get(item);
      if (cheaper === undefined || prev.p[k] <= cheaper) units = was;  // a cheaper one is still up → cancelled
    }
    if (units > 0) sold[item] = (sold[item] || 0) + units;
  }
  return sold;
}

/** adds one interval's sales to the daily buckets, drops old days; mutates and returns days */
function addToDays(days, today, hours, sold) {
  const b = days.d[today] || (days.d[today] = { h: 0, s: {} });
  b.h = Math.round((b.h + hours) * 1000) / 1000;
  for (const [id, n] of Object.entries(sold)) b.s[id] = (b.s[id] || 0) + n;
  for (const day of Object.keys(days.d)) if (Number(day) <= today - SALES_DAYS) delete days.d[day];
  return days;
}

/** { hours, perDay: { [itemId]: units per day, 1 decimal } } from the daily buckets */
function perDay(days) {
  let hours = 0;
  const total = {};
  for (const b of Object.values(days.d)) {
    hours += b.h;
    for (const [id, n] of Object.entries(b.s)) total[id] = (total[id] || 0) + n;
  }
  const out = {};
  if (hours > 0) for (const [id, n] of Object.entries(total)) out[id] = Math.round((n / hours) * 24 * 10) / 10;
  return { hours: Math.round(hours * 10) / 10, perDay: out };
}

/**
 * One auction house, one run. dataMs: when Blizzard last updated this house's auction data
 * (Last-Modified), or null if unknown (then this run is only used as the next comparison point).
 */
async function updateSales(store, region, houseId, listings, nowMs, dataMs) {
  const stateKey = `salesstate:${region}:${houseId}`, daysKey = `salesdays:${region}:${houseId}`;
  let prev = await store.getJSON(stateKey);
  if (prev && prev.v !== 2) prev = null; // older format without prices
  const days = (await store.getJSON(daysKey)) || { d: {} };
  const today = dayNumber(nowMs);
  if (prev && dataMs && dataMs === prev.t) {
    addToDays(days, today, 0, {}); // Blizzard hasn't refreshed since last run: nothing new
  } else {
    const gapHours = prev && dataMs && prev.t ? (dataMs - prev.t) / 3600000 : 0;
    if (gapHours > 0 && gapHours <= MAX_GAP_HOURS) addToDays(days, today, gapHours, countSales(prev, listings));
    else addToDays(days, today, 0, {});
    if (dataMs) await store.putJSON(stateKey, encodeSnapshot(listings, dataMs));
  }
  await store.putJSON(daysKey, days);
  return perDay(days);
}

export { updateSales, encodeSnapshot, countSales, addToDays, perDay, SALES_DAYS, MAX_GAP_HOURS };
