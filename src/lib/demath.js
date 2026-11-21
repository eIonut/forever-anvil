// Disenchanting: what an item turns into, what that's worth, and AH listings worth buying to disenchant.
// Shared by the item pages (built on the server) and the Disenchant flips tool (src/tools/Flips.svelte).
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
 * The table for an item-cache entry ([name, …, quality(4), itemClass(5), …, itemLevel(11)]), or null
 * @param {any[] | null | undefined} entry
 * @returns {DisenchantTable | null}
 */
export const disenchantOf = (entry) => (entry ? disenchantTable(entry[4], entry[5], entry[11]) : null);

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

/**
 * Listings on one auction house worth buying to disenchant: the cheapest listing costs less than the
 * materials sell for after the AH's 5% cut. Materials use this house's market price. Thin material
 * markets (fewer than minListings listings) don't count as priced, so one odd listing can't create a flip.
 * houseItems: { [itemId]: [min, market, qty, listings, sold?] }; items: the item cache.
 * Returns [{ id, cost, value, profit, skill, drops }] best profit first.
 * @param {Record<string, (number | undefined)[]>} houseItems
 * @param {Record<string, any[]>} items
 * @param {{ minListings?: number, minProfit?: number }} [opts]
 * @returns {{ id: number, cost: number, value: number, profit: number, skill: number | null, drops: DisenchantDrop[] }[]}
 */
export function disenchantFlips(houseItems, items, { minListings = 3, minProfit = 1 } = {}) {
  const priceOf = (id) => { const a = houseItems[id]; return a && a[3] >= minListings ? a[1] : null; };
  const out = [];
  for (const [id, a] of Object.entries(houseItems || {})) {
    const t = disenchantOf(items[id]);
    if (!t) continue;
    const v = disenchantValue(t, priceOf);
    if (!v || !v.complete) continue;
    const net = Math.round(v.value * 0.95);
    const profit = net - a[0];
    if (profit < minProfit) continue;
    out.push({ id: Number(id), cost: a[0], value: net, profit, skill: t.skill, drops: t.drops });
  }
  return out.sort((x, y) => y.profit - x.profit);
}
