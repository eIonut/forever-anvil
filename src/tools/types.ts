// Shapes of the price job's files, as the tools read them.

export interface Meta {
  groups?: string[];
  rulesets?: Record<string, string>;
}

/** Per item on one auction house: [lowest, market, units listed, listings] */
export type ItemPrice = [number, number, number, number];

/** [itemId, unitsBelowVendor, totalProfit, cheapestUnit, vendorPays] */
export type Flip = [number, number, number, number, number];

export interface House {
  faction: string;
  listings: number;
  items: Record<string, ItemPrice>;
  flips?: Flip[];
}

export interface GroupPrices {
  group: string;
  ruleset?: string;
  updated: string;
  houses: Record<string, House>;
}

/** [recipeId, name, category, itemId, itemName, makes, [[reagentId, qty, name], ...]] */
export type RecipeRow = [number, string, string, number | null, string | null, number, [number, number, string][]];

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

/** One server group's market history (econ_<region>.json, written by pipeline/economy.js) */
export interface EconGroup {
  /** unix seconds of each point (daily points from history first, then one per price update) */
  t: number[];
  /** index key → value at each point (100 = when tracking began; null before an index started) */
  idx: Record<string, (number | null)[]>;
  /** listings in the group at each point (null for points from daily history) */
  auctions: (number | null)[];
  /** gold listed in the group at each point, whole gold */
  gold: number[];
  /** houseId → itemId → % change in typical price since about a day ago (trade board items only) */
  board?: Record<string, Record<string, number>>;
}

export interface Econ {
  updated?: string;
  groups: Record<string, EconGroup>;
}
