// The home page's "Your market right now" cards, worked out for every auction house of a region:
// the top vendor flips, what sells fastest and the best crafts that sell.
//
// The price job saves this as home_<region>.json (a few KB), so the home page doesn't download the
// item list, a server group's prices and the recipes (about 450 KB compressed) to show 15 lines.
// The home page also uses it directly, from those full files, when home_<region>.json isn't there yet
// (the hour between a deploy and the next price job). One function, so both always agree.
import { bestCrafts, topSellers } from "./watchmath.js";

export const HOME_TOP = 5;

/**
 * groups:   { [groupId]: prices file of that group: { updated, houses: { [houseId]: { faction, items, flips, salesHours } } } }
 * recipes:  the recipes file ({ professions }), or null
 * items:    the item cache (items_<region>.json): names, icons, vendor prices
 * meta:     { rulesets, likely } from the meta file (server group names)
 *
 * Returns {
 *   v: 1, region, updated, groups: [groupId…], rulesets, likely,
 *   markets: { [groupId]: { updated, houses: { [faction]: {
 *     houseId, salesHours,
 *     flips:    first HOME_TOP vendor flips, as in the prices file: [itemId, units, profit, cheapestUnit, vendorPays]
 *     flipTotal: profit of all the house's vendor flips together
 *     sellers:  [[itemId, soldPerDay, market, goldPerDay]…] most gold changing hands first
 *     crafts:   [[recipeId, recipeName, profession, craftedItemId, profit]…] best first
 *     prices:   { [itemId]: the item's price row } for the sellers and crafted items (sold-per-day labels)
 *   } } } },
 *   items: { [itemId]: item-cache entry } for every item above (names, icons, quality)
 * }
 */
export function buildHome({ region, updated, groups, recipes, items, meta }) {
  const out = { v: 1, region, updated, groups: Object.keys(groups), rulesets: (meta && meta.rulesets) || {}, likely: (meta && meta.likely) || {}, markets: {}, items: {} };
  const keep = (id) => { if (items && items[id]) out.items[id] = items[id]; };
  for (const [g, file] of Object.entries(groups)) {
    const market = { updated: file.updated, houses: {} };
    for (const [houseId, h] of Object.entries(file.houses || {})) {
      const all = h.flips || [];
      const flips = all.slice(0, HOME_TOP);
      const sellers = topSellers(h.items, HOME_TOP).map((x) => [x.id, x.sold, x.market, x.perDay]);
      const crafts = recipes
        ? bestCrafts(recipes.professions, h.items, items || {}, { top: HOME_TOP, salesHours: h.salesHours || 0 })
          .map((c) => [c.recipe[0], c.recipe[1], c.profession, c.recipe[3], c.profit])
        : [];
      const prices = {};
      for (const id of [...sellers.map((s) => s[0]), ...crafts.map((c) => c[3])]) if (h.items[id]) prices[id] = h.items[id];
      for (const f of flips) keep(f[0]);
      for (const id of Object.keys(prices)) keep(id);
      market.houses[h.faction] = {
        houseId, salesHours: h.salesHours || 0, flips, flipTotal: all.reduce((s, f) => s + f[2], 0), sellers, crafts, prices
      };
    }
    out.markets[g] = market;
  }
  return out;
}
