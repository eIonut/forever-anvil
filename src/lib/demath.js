import { unitPrice } from "./pricemath.js";
import { NO_DISENCHANT } from "../data/nodisenchant.js";

// Disenchanting: what an item turns into, what that's worth, and AH listings worth buying to disenchant.
// Shared by the item pages (built on the server) and the Disenchant flips tool (src/tools/Disenchant.svelte), and the price job (pipeline/run.js).
//
// Which table an item uses (armor or weapon, green/blue/purple, item-level range) comes from WoW: Forever's
// own game files (the ItemDisenchantLoot table on wago.tools, build 1.60.1, checked 2026-11-21): its ranges
// are exactly Classic Era's. What drops, and how often, isn't in the game files (Blizzard's servers decide),
// so the chances below are Classic Era's published disenchanting table. The site calls the result an
// estimate. If in-game results ever look different, this table is the one place to change.

// Enchanting materials (item ids, checked against Blizzard's item names)
export const MATS = {
  strangeDust: 10940, soulDust: 11083, visionDust: 11137, dreamDust: 11176, illusionDust: 16204,
  lesserMagic: 10938, greaterMagic: 10939, lesserAstral: 10998, greaterAstral: 11082,
  lesserMystic: 11134, greaterMystic: 11135, lesserNether: 11174, greaterNether: 11175,
  lesserEternal: 16202, greaterEternal: 16203,
  smallGlimmering: 10978, largeGlimmering: 11084, smallGlowing: 11138, largeGlowing: 11139,
  smallRadiant: 11177, largeRadiant: 11178, smallBrilliant: 14343, largeBrilliant: 14344, nexus: 20725
};
const M = MATS;

/** @typedef {{ id: number, chance: number, min: number, max: number }} DisenchantDrop */
/** @typedef {{ skill: number | null, drops: DisenchantDrop[] }} DisenchantTable */

// Green (uncommon) brackets: [maxItemLevel, dust, dustQty, essence, essenceQty, shard|null, shardChance, skill]
// Armor: 80/20 at the lowest levels, then 75% dust, 20% essence (15% at 21–25), the rest a shard.
// Weapons swap the dust and essence chances.
const GREEN = [
  [15, M.strangeDust, [1, 2], M.lesserMagic, [1, 2], null, 0, 1],
  [20, M.strangeDust, [2, 3], M.greaterMagic, [1, 2], M.smallGlimmering, 0.05, 1],
  [25, M.strangeDust, [4, 6], M.lesserAstral, [1, 2], M.smallGlimmering, 0.10, 25],
  [30, M.soulDust, [1, 2], M.greaterAstral, [1, 2], M.largeGlimmering, 0.05, 50],
  [35, M.soulDust, [2, 5], M.lesserMystic, [1, 2], M.smallGlowing, 0.05, 75],
  [40, M.visionDust, [1, 2], M.greaterMystic, [1, 2], M.largeGlowing, 0.05, 100],
  [45, M.visionDust, [2, 5], M.lesserNether, [1, 2], M.smallRadiant, 0.05, 125],
  [50, M.dreamDust, [1, 2], M.greaterNether, [1, 2], M.largeRadiant, 0.05, 150],
  [55, M.dreamDust, [2, 5], M.lesserEternal, [1, 2], M.smallBrilliant, 0.05, 175],
  [60, M.illusionDust, [1, 2], M.greaterEternal, [1, 2], M.largeBrilliant, 0.05, 200],
  [99, M.illusionDust, [2, 5], M.greaterEternal, [2, 3], M.largeBrilliant, 0.05, 225],
];
// Blue (rare): one shard; the top brackets very rarely give a Nexus Crystal instead
const BLUE = [
  [25, M.smallGlimmering, 25], [30, M.largeGlimmering, 50], [35, M.smallGlowing, 75], [40, M.largeGlowing, 100],
  [45, M.smallRadiant, 125], [50, M.largeRadiant, 150], [55, M.smallBrilliant, 175], [99, M.largeBrilliant, 200],
];
// Purple (epic): [minItemLevel, maxItemLevel, mat, qty]
const EPIC = [
  [40, 45, M.smallRadiant, [2, 4]], [46, 50, M.largeRadiant, [2, 4]], [51, 55, M.smallBrilliant, [2, 4]],
  [56, 60, M.nexus, [1, 1]], [61, 99, M.nexus, [1, 2]],
];

/**
 * What an item disenchants into. quality: "uncommon" | "rare" | "epic"; itemClass: "Armor" | "Weapon".
 * Returns { skill, drops: [{ id, chance, min, max }] } (chances add up to 1), or null when it can't be
 * disenchanted (white/grey, not armor or a weapon, or outside every range). skill: the Enchanting skill
 * needed, by Classic Era's rule (null when unknown, for epics).
 * @param {string | null | undefined} quality
 * @param {string | null | undefined} itemClass
 * @param {number | null | undefined} itemLevel
 * @returns {DisenchantTable | null}
 */
export function disenchantTable(quality, itemClass, itemLevel) {
  if ((itemClass !== "Armor" && itemClass !== "Weapon") || !(itemLevel >= 5)) return null;
  if (quality === "uncommon") {
    const b = GREEN.find((x) => itemLevel <= x[0]);
    if (!b) return null;
    const [, dust, dq, ess, eq, shard, sc, skill] = b;
    // 5–15: 80/20 and no shard; 21–25: essence 15% (the shard takes 10%)
    const low = b[0] === 15;
    const main = low ? 0.8 : 0.75, other = Math.round((1 - main - sc) * 1000) / 1000;
    const [dustChance, essChance] = itemClass === "Weapon" ? [other, main] : [main, other];
    const drops = [{ id: dust, chance: dustChance, min: dq[0], max: dq[1] }, { id: ess, chance: essChance, min: eq[0], max: eq[1] }];
    if (shard && sc) drops.push({ id: shard, chance: sc, min: 1, max: 1 });
    return { skill, drops };
  }
  if (quality === "rare") {
    const b = BLUE.find((x) => itemLevel <= x[0]);
    if (!b) return null;
    if (b[1] === M.largeBrilliant && itemLevel >= 56) {
      return { skill: b[2], drops: [{ id: M.largeBrilliant, chance: 0.995, min: 1, max: 1 }, { id: M.nexus, chance: 0.005, min: 1, max: 1 }] };
    }
    return { skill: b[2], drops: [{ id: b[1], chance: 1, min: 1, max: 1 }] };
  }
  if (quality === "epic") {
    const b = EPIC.find((x) => itemLevel >= x[0] && itemLevel <= x[1]);
    return b ? { skill: null, drops: [{ id: b[2], chance: 1, min: b[3][0], max: b[3][1] }] } : null;
  }
  return null;
}

/**
 * Can the game disenchant this item at all? Some items that fit the rules are marked "can't be disenchanted"
 * in the game files (e.g. the enchanter-made wands; src/data/nodisenchant.js, from tools/no-disenchant.js).
 * @param {number | string | null | undefined} id
 */
export const canDisenchant = (id) => !NO_DISENCHANT.has(Number(id));

/**
 * The table for an item-cache entry ([name, …, quality(4), itemClass(5), …, itemLevel(11)]), or null.
 * Pass the item id too, so items the game won't disenchant get null.
 * @param {any[] | null | undefined} entry
 * @param {number | string} [id]
 * @returns {DisenchantTable | null}
 */
export const disenchantOf = (entry, id) =>
  (entry && (id == null || canDisenchant(id)) ? disenchantTable(entry[4], entry[5], entry[11]) : null);

/**
 * Expected value of disenchanting one item: each drop's chance × average quantity × the material's price.
 * priceOf(id) → copper or null. Returns { value, complete } (complete: every material had a price;
 * missing ones count as 0), or null when there's no table.
 * @param {DisenchantTable | null} table
 * @param {(id: number) => number | null | undefined} priceOf
 * @returns {{ value: number, complete: boolean } | null}
 */
export function disenchantValue(table, priceOf) {
  if (!table) return null;
  let value = 0, complete = true;
  for (const d of table.drops) {
    const p = priceOf(d.id);
    if (p == null) { complete = false; continue; }
    value += d.chance * ((d.min + d.max) / 2) * p;
  }
  return { value: Math.round(value), complete };
}

// A flip must earn at least this much per item (the same rule as vendor flips, pricemath.js computeFlips)
const FLIP_RULE = { minListings: 3, minProfit: 10, minPct: 0.05 };

/**
 * Each item's disenchant worth on one auction house, after the AH's 5% cut on the materials.
 * Materials use this house's market price; thin material markets (fewer than minListings listings)
 * don't count as priced, so one odd listing can't create a flip. Items with an unpriced material are left out.
 * Returns a function id → { net, table } or null (memoised).
 * @param {Record<string, (number | undefined)[]>} houseItems
 * @param {Record<string, any[]>} items
 */
function worthOn(houseItems, items, minListings = FLIP_RULE.minListings) {
  const priceOf = (id) => { const a = houseItems[id]; return a && (a[3] || 0) >= minListings ? (a[1] ?? null) : null; };
  const memo = new Map();
  return (id) => {
    if (memo.has(id)) return memo.get(id);
    const table = disenchantOf(items[id], id);
    const v = disenchantValue(table, priceOf);
    const r = table && v && v.complete ? { net: Math.round(v.value * 0.95), table } : null;
    memo.set(id, r);
    return r;
  };
}

/** Is buying at unit worth it for something worth net? */
const pays = (unit, net) => unit <= net - Math.max(FLIP_RULE.minProfit, net * FLIP_RULE.minPct);

/**
 * The price job's disenchant flips for one auction house, from every listing (like vendor flips):
 * rows [itemId, unitsWorthBuying, totalProfit, cheapestUnit, worthEach] best total first.
 * listings: raw auctions; houseItems: that house's aggregated prices; items: the item cache.
 * @param {{ item?: { id: number }, quantity?: number, unit_price?: number, buyout?: number }[]} listings
 * @param {Record<string, (number | undefined)[]>} houseItems
 * @param {Record<string, any[]>} items
 * @returns {[number, number, number, number, number][]}
 */
export function computeDisenchantFlips(listings, houseItems, items, top = 200) {
  const worth = worthOn(houseItems, items);
  /** @type {Map<number, [number, number, number, number, number]>} */
  const byItem = new Map();
  for (const l of listings) {
    const id = l.item && l.item.id;
    const unit = id ? unitPrice(l) : null;
    if (!id || unit == null) continue;
    const w = worth(id);
    if (!w || !pays(unit, w.net)) continue;
    const q = l.quantity || 1;
    let e = byItem.get(id);
    if (!e) byItem.set(id, (e = [id, 0, 0, unit, w.net]));
    e[1] += q;
    e[2] += (w.net - unit) * q;
    if (unit < e[3]) e[3] = unit;
  }
  return [...byItem.values()].map((e) => /** @type {[number, number, number, number, number]} */ ([e[0], e[1], Math.round(e[2]), Math.round(e[3]), e[4]]))
    .sort((a, b) => b[2] - a[2]).slice(0, top);
}

/**
 * Disenchant flips for the page. rows: the price job's rows for this house (computeDisenchantFlips), or
 * null when the prices file doesn't have them yet; then they're worked out from each item's cheapest
 * listing only (one unit each). Returns [{ id, units, total, cost, value, profit, skill, drops }] best total first.
 * @param {[number, number, number, number, number][] | null | undefined} rows
 * @param {Record<string, (number | undefined)[]>} houseItems
 * @param {Record<string, any[]>} items
 * @returns {{ id: number, units: number, total: number, cost: number, value: number, profit: number, skill: number | null, drops: DisenchantDrop[] }[]}
 */
export function disenchantFlips(rows, houseItems, items) {
  if (!rows) {
    const worth = worthOn(houseItems, items);
    rows = [];
    for (const [id, a] of Object.entries(houseItems || {})) {
      const w = worth(id), min = a[0];
      if (w && min != null && pays(min, w.net)) rows.push([Number(id), 1, w.net - min, min, w.net]);
    }
    rows.sort((a, b) => b[2] - a[2]);
  }
  const out = [];
  for (const [id, units, total, cost, value] of rows) {
    const t = disenchantOf(items[id], id);
    if (!t) continue; // not in this visitor's item list
    out.push({ id, units, total, cost, value, profit: value - cost, skill: t.skill, drops: t.drops });
  }
  return out;
}
