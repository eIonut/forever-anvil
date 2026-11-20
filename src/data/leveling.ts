// Build-time leveling routes for the /leveling/<profession> pages: the same math as the live
// calculator (src/lib/levelmath.js), on the site's main market, so each page has a real route
// written out for search engines and for people skimming.
import { planLeveling } from "../lib/levelmath.js";
import type { Catalog, Recipe } from "./catalog";

/** Gathering skills level by gathering, so they get no leveling page */
export const GATHERING = new Set(["Herbalism", "Mining", "Skinning", "Fishing"]);

export interface BuiltRoute {
  market: string;
  total: number;
  /** true when patterns and plans make the route cheaper than trainer recipes alone (then `trainerOnly` is that total) */
  withPatterns: boolean;
  trainerOnly: number;
  steps: { from: number; to: number; name: string; recipeId: number; crafts: number; cost: number }[];
  gaps: number[];
}

/** The cheapest route 1→300 on the main market's faction house and Blackwater: trainer recipes only, or with
 *  patterns and plans when that's cheaper and leaves no skill without a recipe. */
export function builtRoute(c: Catalog, recipes: Recipe[]): BuiltRoute | null {
  const main = c.primaryHouse;
  if (!main) return null;
  const mainRow = c.houses.find((h) => h.region === main.region && h.houseId === main.houseId);
  if (!mainRow) return null;
  const usable = c.houses.filter((h) => h.region === main.region && h.label === mainRow.label && (h.houseId === main.houseId || h.faction === "neutral"));
  const price = (id: number | string) => {
    let best: { unit: number; source: "ah" | "vendor"; house: string; listed: number } | null = null;
    for (const row of c.prices[id] || []) {
      if (!usable.some((h) => h.houseId === row.houseId && h.region === row.region)) continue;
      if (!best || row.market < best.unit) best = { unit: row.market, source: "ah", house: row.faction, listed: row.qty };
    }
    if (best) return best;
    const v = c.names[id]?.[3];
    return v ? { unit: v, source: "vendor" as const, house: "", listed: 0 } : null;
  };
  const rows = recipes.map((r) => [r.id, r.name, r.cat, r.item, r.itemName, r.q, r.mats, r.info]);
  const trainer = planLeveling(rows, price, { from: 1, to: 300 });
  const all = planLeveling(rows, price, { from: 1, to: 300, sources: ["trainer", "auto", "item"] });
  const withPatterns = all.gaps.length <= trainer.gaps.length && all.total < trainer.total * 0.9;
  const plan = withPatterns ? all : trainer;
  const regionName = main.region.toUpperCase();
  return {
    market: `${regionName} ${mainRow.label} ${mainRow.faction === "alliance" ? "Alliance" : mainRow.faction === "horde" ? "Horde" : "Blackwater"}`,
    total: plan.total,
    withPatterns,
    trainerOnly: trainer.total,
    steps: plan.steps.map((s) => ({ from: s.from, to: s.to, name: (s.recipe[4] as string) || (s.recipe[1] as string), recipeId: s.recipe[0] as number, crafts: s.crafts, cost: s.cost })),
    gaps: plan.gaps,
  };
}
