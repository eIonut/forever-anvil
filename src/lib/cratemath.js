// Waylaid Crate math: which crate turns the least gold into Merchant's Favor.
// Pure functions, shared by the site (/waylaid-crates) and the tests (pipeline/cratemath.test.js).

const TIERS = ["Apprentice", "Journeyman", "Expert", "Artisan"];
// Crates filled with crafted goods; the rest (Herbs, Ore, Textiles, Curiosities) take gathered goods.
const CRAFTED = ["Fabrics", "Ingots", "Parts"];

// Merchant's Favor per crate turned in, by tier (Apprentice → Artisan). Blizzard's data doesn't say,
// so these come from players: gathered crates pay 5/10/15, crafted ones pay double (10/20/30).
// Artisan (20 and 40) follows the pattern but nobody had confirmed it in game as of 2026-11-20.
// When it's confirmed (or different), change the numbers here and the CONFIRMED_TIERS count.
const FAVOR = { gathered: [5, 10, 15, 20], crafted: [10, 20, 30, 40] };
const CONFIRMED_TIERS = 3; // Apprentice, Journeyman and Expert

// "Waylaid Crate: Flowering Artisan Herbs" → { tier: 3, tierName: "Artisan", kind: "crafted"|"gathered", label: "Flowering Artisan Herbs" }
// or null when the name doesn't follow the pattern.
function crateInfo(name) {
  const label = String(name || "").replace(/^Waylaid Crate:\s*/, "");
  const words = label.split(/\s+/);
  const tier = TIERS.findIndex((t) => words.includes(t));
  if (tier < 0) return null;
  const kind = CRAFTED.includes(words[words.length - 1]) ? "crafted" : "gathered";
  return { tier, tierName: TIERS[tier], kind, label };
}

/** Favor for one crate. bonusPct: the Legacy perk that adds Favor (0–15). */
function crateFavor(info, bonusPct = 0) {
  return FAVOR[info.kind][info.tier] * (1 + (bonusPct || 0) / 100);
}

// Rank every crate by the gold each point of Favor costs.
//   crates: [[crateId, name, level, [[itemId|null, qty, name], ...]], ...]   (crates_<region>.json)
//   houses: [{ id, faction, items: { itemId: [min, market, qty, listings, ...] } }, ...]
//           the auction houses the player can buy from (their faction's and Blackwater)
//   opts.bonusPct: extra Favor from the Legacy perk
// A bundle is priced at the market price (average of the cheapest 10% on sale) on whichever house is
// cheaper. A house with fewer units listed than the bundle needs can't fill it alone, so it's skipped.
// Returns rows sorted by fill cost per Favor (unpriced crates last):
//   { id, name, level, tier, tierName, kind, label, favor, confirmed,
//     fills: [{ itemId, qty, name, cost, unit, houseId, faction, listed }]  (cheapest first; cost null = not on sale),
//     best, perFavor, crate: { cost, houseId, faction } | null, buyAndFillPerFavor }
function rankCrates(crates, houses, opts = {}) {
  const rows = [];
  for (const [id, name, level, bundles] of crates || []) {
    const info = crateInfo(name);
    if (!info) continue;
    const favor = crateFavor(info, opts.bonusPct);
    const fills = bundles.map(([itemId, qty, bname]) => {
      let best = null;
      for (const h of houses) {
        const p = itemId != null && h.items[itemId];
        if (!p || p[2] < qty) continue;
        const cost = p[1] * qty;
        if (!best || cost < best.cost) best = { cost, unit: p[1], houseId: h.id, faction: h.faction, listed: p[2] };
      }
      return { itemId, qty, name: bname, cost: best ? best.cost : null, unit: best ? best.unit : null, houseId: best ? best.houseId : null, faction: best ? best.faction : null, listed: best ? best.listed : 0 };
    }).sort((a, b) => (a.cost == null) - (b.cost == null) || (a.cost ?? 0) - (b.cost ?? 0));
    const best = fills[0] && fills[0].cost != null ? fills[0] : null;
    let crate = null;
    for (const h of houses) {
      const p = h.items[id];
      if (p && (!crate || p[0] < crate.cost)) crate = { cost: p[0], houseId: h.id, faction: h.faction };
    }
    rows.push({
      id, name, level, ...info, favor, confirmed: info.tier < CONFIRMED_TIERS, fills, best,
      perFavor: best ? best.cost / favor : null,
      crate,
      buyAndFillPerFavor: best && crate ? (best.cost + crate.cost) / favor : null
    });
  }
  const key = opts.rankBy === "buy" ? "buyAndFillPerFavor" : "perFavor";
  rows.sort((a, b) => (a[key] == null) - (b[key] == null) || (a[key] ?? 0) - (b[key] ?? 0) || a.tier - b.tier);
  return rows;
}

/** Gold needed for `goal` Favor using one crate kind, rounded up to whole crates. */
function costForFavor(perCrateCost, favorPerCrate, goal) {
  const crates = Math.ceil(goal / favorPerCrate);
  return { crates, cost: crates * perCrateCost };
}

export { crateInfo, crateFavor, rankCrates, costForFavor, FAVOR, CONFIRMED_TIERS, TIERS };
