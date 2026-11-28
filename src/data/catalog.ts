// Everything the item and recipe pages need, read once from the price job's files in ./out
// (written by `npm run prices`). Runs at build time only.
//
// The pages contain Blizzard API data, so the built site must be rebuilt at least every
// 30 days (daily in production); items no longer seen simply drop out.
import fs from "node:fs";
import path from "node:path";
import { SHARDS } from "../lib/pricemath.js";
import { GROUPS } from "../../pipeline/houses.js";
import { REGION_NAMES } from "../lib/labels";
import { dateText } from "../lib/format";
import { itemUrl } from "../lib/urls";
import { isThinItem } from "../lib/indexable.js";
import type { RecipeInfo } from "../lib/recipeinfo";

/** items_<region>.json entry: [name, vendorSells, dayFetched, vendorBuys, quality, itemClass, iconFileId] */
export type ItemInfo = [string, number | null, number, number | null, string | null, string | null, number | null];

/** One item's price on one auction house */
export interface PriceRow {
  region: string;
  group: string;
  /** ruleset name once confirmed ("PvP"), otherwise "Group C" */
  label: string;
  confirmed: boolean;
  faction: string;
  houseId: string;
  min: number;
  market: number;
  qty: number;
  n: number;
}

export interface Recipe {
  prof: string;
  id: number;
  name: string;
  cat: string | null;
  /** crafted item id (null for enchants and other recipes with no item) */
  item: number | null;
  itemName: string | null;
  /** how many items one craft makes */
  q: number;
  /** materials: [itemId, quantity, itemName] */
  mats: [number, number, string][];
  /** skill + where it's learned, from the game files (src/lib/recipeinfo.ts); null if unknown */
  info: RecipeInfo | null;
}

export interface House {
  region: string;
  houseId: string;
  label: string;
  confirmed: boolean;
  faction: string;
}

/** Price lookup used by the craft math: market price on one house, plus vendor prices */
export type PriceFn = (id: number | string) => { ah: number | null; vendor: number | null; sell: number | null };

export interface Catalog {
  regions: string[];
  names: Record<string, ItemInfo>;
  prices: Record<string, PriceRow[]>;
  /** `${region}:${houseId}` → itemId → [[day, marketPrice], ...] */
  history: Record<string, Record<string, [number, number][]>>;
  /** recipes that make an item, by item id */
  made: Record<string, Recipe[]>;
  /** recipes that use an item, by item id */
  used: Record<string, Recipe[]>;
  /** every recipe with materials */
  recipes: Recipe[];
  /** items that get a page: named, and either on an auction house or part of a recipe */
  pageIds: string[];
  /** item pages too thin for search engines: noindex, not in the sitemap */
  thinIds: Set<string>;
  hasPage: Set<string>;
  /** the "main" market for summaries and material costs: first confirmed ruleset, Alliance */
  primaryHouse: { region: string; houseId: string; label: string } | null;
  /** every auction house with prices, confirmed rulesets first */
  houses: House[];
  /** "19 November 2026": when the newest prices were fetched */
  asOf: string;
}

const OUT = path.join(process.cwd(), "out");
const readJSON = <T>(name: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8")) as T; } catch { return null; }
};

interface Meta { groups?: string[]; rulesets?: Record<string, string>; likely?: Record<string, string> }
interface PricesFile { updated: string; houses: Record<string, { faction: string; items: Record<string, [number, number, number, number]> }> }
interface RecipesFile { professions: { name: string; recipes: [number, string, string | null, number | null, string | null, number, [number, number, string][], RecipeInfo?][] }[] }

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (cached) return cached;

  const regions = Object.keys(REGION_NAMES).filter((r) => readJSON(`meta_${r}.json`));
  if (!regions.length) console.warn("[catalog] No data in ./out: item and recipe pages are skipped. Run `npm run prices` first.");

  const names: Catalog["names"] = {};
  const prices: Catalog["prices"] = {};
  const history: Catalog["history"] = {};
  const made: Catalog["made"] = {};
  const used: Catalog["used"] = {};
  const recipes: Recipe[] = [];
  let recipesLoaded = false;
  let updated: string | null = null;

  for (const region of regions) {
    const meta = readJSON<Meta>(`meta_${region}.json`)!;
    // the first region's entry wins, unless it has no name and a later region's does
    for (const [id, e] of Object.entries(readJSON<Catalog["names"]>(`items_${region}.json`) || {})) if (!names[id]?.[0]) names[id] = e;
    for (const g of meta.groups || []) {
      const file = readJSON<PricesFile>(`prices_${region}_${g}.json`);
      if (!file) continue;
      if (!updated || file.updated > updated) updated = file.updated;
      // a ruleset only worked out from the data (meta.likely) shows its name, dimmed like an unconfirmed one
      const label = meta.rulesets?.[g] || meta.likely?.[g] || `Group ${g}`;
      const confirmed = !!meta.rulesets?.[g];
      for (const [houseId, h] of Object.entries(file.houses)) {
        for (const [id, a] of Object.entries(h.items)) {
          (prices[id] ||= []).push({ region, group: g, label, confirmed, faction: h.faction, houseId, min: a[0], market: a[1], qty: a[2], n: a[3] });
        }
      }
      for (let s = 0; s < SHARDS; s++) {
        const shard = readJSON<Record<string, Record<string, [number, number][]>>>(`history_${region}_${g}_${s}.json`) || {};
        for (const [houseId, items] of Object.entries(shard)) Object.assign((history[`${region}:${houseId}`] ||= {}), items);
      }
    }
    // recipes are the same in every region: use the first region that has them
    const rec = readJSON<RecipesFile>(`recipes_${region}.json`);
    if (rec && !recipesLoaded) {
      recipesLoaded = true;
      for (const p of rec.professions) for (const r of p.recipes) {
        const entry: Recipe = { prof: p.name, id: r[0], name: r[1], cat: r[2], item: r[3], itemName: r[4], q: r[5], mats: r[6], info: r[7] || null };
        if (r[6].length) recipes.push(entry);
        if (r[3]) (made[r[3]] ||= []).push(entry);
        for (const m of r[6]) (used[m[0]] ||= []).push(entry);
      }
    }
  }

  const pageIds = Object.keys(names).filter((id) => names[id]?.[0] && (prices[id] || made[id] || used[id]));
  // Pages built and linked, but marked noindex and left out of the sitemap (src/lib/indexable.js)
  const thinIds = new Set(pageIds.filter((id) => isThinItem({
    quality: names[id][4], houses: prices[id]?.length || 0, made: !!made[id], used: !!used[id],
  })));

  let primaryHouse: Catalog["primaryHouse"] = null;
  const houses: House[] = [];
  for (const region of regions) {
    const meta = readJSON<Meta>(`meta_${region}.json`)!;
    for (const g of GROUPS) {
      const ruleset = meta.rulesets?.[g.id];
      if (ruleset && !primaryHouse) primaryHouse = { region, houseId: String(g.houses.alliance), label: ruleset };
      if (!(meta.groups || []).includes(g.id)) continue;
      for (const [faction, hid] of Object.entries(g.houses)) {
        houses.push({ region, houseId: String(hid), label: ruleset || meta.likely?.[g.id] || `Group ${g.id}`, confirmed: !!ruleset, faction });
      }
    }
  }
  houses.sort((a, b) => Number(b.confirmed) - Number(a.confirmed));

  cached = {
    regions, names, prices, history, made, used, recipes, pageIds, thinIds,
    hasPage: new Set(pageIds), primaryHouse, houses,
    asOf: updated ? dateText(updated) : "",
  };
  return cached;
}

/**
 * Address of an item's own page. Always built from the item data's name, which the page itself uses:
 * recipe data sometimes spells an item differently ("Vestments" / "Vestaments").
 */
export function itemPageUrl(c: Catalog, id: number | string): string {
  return itemUrl(id, c.names[id][0]);
}

/** Prices on one auction house: market price there, with Blizzard's vendor prices as fallback */
export function priceOn(c: Catalog, region: string, houseId: string): PriceFn {
  return (id) => {
    const row = (c.prices[id] || []).find((x) => x.region === region && x.houseId === houseId);
    const n = c.names[id] || [];
    return { ah: row ? row.market : null, vendor: n[3] || null, sell: n[1] || null };
  };
}

/** Prices on the main market (see primaryHouse) */
export function primaryPrices(c: Catalog): PriceFn {
  const h = c.primaryHouse;
  return h ? priceOn(c, h.region, h.houseId) : priceOn(c, "", "");
}

/** The row to use for an item's summary: first confirmed ruleset, Alliance; else first group */
export function primaryRow(rows: PriceRow[] | undefined): PriceRow | null {
  if (!rows || !rows.length) return null;
  return rows.find((r) => r.confirmed && r.faction === "alliance") || rows.find((r) => r.confirmed) || rows.find((r) => r.faction === "alliance") || rows[0];
}

/** Item categories (Blizzard's item class: "Trade Goods", "Armor", …) with the ids of their item pages */
export function itemCategories(c: Catalog): { name: string; ids: string[] }[] {
  const by: Record<string, string[]> = {};
  for (const id of c.pageIds) {
    const cls = c.names[id][5];
    if (cls) (by[cls] ||= []).push(id);
  }
  return Object.entries(by).map(([name, ids]) => ({ name, ids })).sort((a, b) => b.ids.length - a.ids.length);
}

/** Recipes grouped by profession, professions A–Z */
export function professions(c: Catalog): { name: string; recipes: Recipe[] }[] {
  const by: Record<string, Recipe[]> = {};
  for (const r of c.recipes) (by[r.prof] ||= []).push(r);
  return Object.keys(by).sort().map((name) => ({ name, recipes: by[name] }));
}

/** Professions with too few recipes for a page of their own (gathering skills: a few camping recipes) */
export const MIN_PROFESSION_RECIPES = 10;

/** Skill-line ids, for the profession icons in public/img/wow/prof-<id>.jpg */
export const PROFESSION_IDS: Record<string, number> = {
  Alchemy: 171, Blacksmithing: 164, Cooking: 185, Enchanting: 333, Engineering: 202, "First Aid": 129,
  Fishing: 356, Herbalism: 182, Leatherworking: 165, Mining: 186, Skinning: 393, Tailoring: 197,
};

/** talents_<region>.json: [nodeId, row, col, name, icon, [rank descriptions], [required node ids]] per talent */
export type TalentNode = [number, number, number, string, string | null, string[], number[]];
export interface TalentClass { id: number; name: string; icon: string | null; specs: { id: number; name: string; icon: string | null; nodes: TalentNode[] }[] }

/** The talent trees for the class pages (/talents/warrior); empty without data in ./out */
export function loadTalents(): TalentClass[] {
  for (const region of Object.keys(REGION_NAMES)) {
    const t = readJSON<{ classes?: TalentClass[] }>(`talents_${region}.json`);
    if (t?.classes?.length) return t.classes;
  }
  return [];
}

// Per category: priced items cheapest first, and every item A–Z. Built once for all item pages.
let neighbourIndex: Map<string, { priced: string[]; value: Map<string, number>; az: string[] }> | null = null;

/**
 * Up to n other items of the same category: those closest in market price, or for an item that
 * isn't listed, its A–Z neighbours. Used for "Similar items" on the item pages (internal links).
 */
export function similarItems(c: Catalog, id: string, n = 12): string[] {
  if (!neighbourIndex) {
    neighbourIndex = new Map();
    for (const cat of itemCategories(c)) {
      const value = new Map<string, number>();
      for (const x of cat.ids) { const r = primaryRow(c.prices[x]); if (r) value.set(x, r.market); }
      const priced = [...value.keys()].sort((a, b) => value.get(a)! - value.get(b)!);
      const az = cat.ids.slice().sort((a, b) => c.names[a][0].localeCompare(c.names[b][0]));
      neighbourIndex.set(cat.name, { priced, value, az });
    }
  }
  const idx = neighbourIndex.get(c.names[id]?.[5] || "");
  if (!idx) return [];
  const list = idx.value.has(id) ? idx.priced : idx.az;
  const at = list.indexOf(id);
  const start = Math.max(0, Math.min(at - Math.floor(n / 2), list.length - n - 1));
  return list.slice(start, start + n + 1).filter((x) => x !== id).slice(0, n);
}

/** Items per page on the category pages (/items/armor, /items/armor/2 …) */
export const CATEGORY_PAGE_SIZE = 100;

let nameCount: Map<string, number> | null = null;
/** True when another item page has the same name ("Thug Pants" exists twice): titles then add the id */
export function nameIsShared(c: Catalog, id: string): boolean {
  if (!nameCount) {
    nameCount = new Map();
    for (const x of c.pageIds) nameCount.set(c.names[x][0], (nameCount.get(c.names[x][0]) || 0) + 1);
  }
  return (nameCount.get(c.names[id][0]) || 0) > 1;
}
