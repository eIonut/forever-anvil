// Shapes of the price job's files, as the tools read them.

export interface Meta {
  groups?: string[];
  rulesets?: Record<string, string>;
}

/** Per item on one auction house: [lowest, market, units listed, listings, estimated units sold per day (absent = none seen)] */
export type ItemPrice = [number, number, number, number, number?];

/** [itemId, unitsBelowVendor, totalProfit, cheapestUnit, vendorPays] */
export type Flip = [number, number, number, number, number];

export interface House {
  faction: string;
  listings: number;
  items: Record<string, ItemPrice>;
  flips?: Flip[];
  /** hours of auction changes behind the sold-per-day estimates (last 7 days); absent/0 = still collecting */
  salesHours?: number;
}

export interface GroupPrices {
  group: string;
  ruleset?: string;
  updated: string;
  houses: Record<string, House>;
}

import type { RecipeInfo } from "../lib/recipeinfo";
export type { RecipeInfo };

/** [recipeId, name, category, itemId, itemName, makes, [[reagentId, qty, name], ...], details from the game files] */
export type RecipeRow = [number, string, string, number | null, string | null, number, [number, number, string][], RecipeInfo?];

export interface Recipes {
  professions: { id: number; name: string; recipes: RecipeRow[] }[];
}

/** The auction house of one faction in a group, with its id */
export function houseOf(g: GroupPrices | null, faction: string): { id: string; house: House } | null {
  if (!g) return null;
  let found: { id: string; house: House } | null = null;
  for (const [id, house] of Object.entries(g.houses)) if (house.faction === faction) found = { id, house };
  return found;
}

/** One server group's economy file entry (econ_<region>.json, written by pipeline/economy.js) */
export interface EconGroup {
  /** houseId → itemId → % change in typical price since about a day ago (materials ledger items only) */
  board?: Record<string, Record<string, number>>;
}

export interface Econ {
  updated?: string;
  groups: Record<string, EconGroup>;
}
