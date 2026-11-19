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

interface Meta { groups?: string[]; rulesets?: Record<string, string> }
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
    Object.assign(names, readJSON(`items_${region}.json`) || {});
    for (const g of meta.groups || []) {
      const file = readJSON<PricesFile>(`prices_${region}_${g}.json`);
      if (!file) continue;
      if (!updated || file.updated > updated) updated = file.updated;
      const label = meta.rulesets?.[g] || `Group ${g}`;
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

  let primaryHouse: Catalog["primaryHouse"] = null;
  const houses: House[] = [];
  for (const region of regions) {
    const meta = readJSON<Meta>(`meta_${region}.json`)!;
    for (const g of GROUPS) {
      const ruleset = meta.rulesets?.[g.id];
      if (ruleset && !primaryHouse) primaryHouse = { region, houseId: String(g.houses.alliance), label: ruleset };
      if (!(meta.groups || []).includes(g.id)) continue;
      for (const [faction, hid] of Object.entries(g.houses)) {
        houses.push({ region, houseId: String(hid), label: ruleset || `Group ${g.id}`, confirmed: !!ruleset, faction });
      }
    }
  }
  houses.sort((a, b) => Number(b.confirmed) - Number(a.confirmed));

  cached = {
    regions, names, prices, history, made, used, recipes, pageIds,
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
