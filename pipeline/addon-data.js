// Builds the in-game addon's data modules (addon/ForeverAnvil_Data_<REGION>/) from the price job's files in ./out.
//
//   node pipeline/addon-data.js                 EU (the site's shown regions)
//   node pipeline/addon-data.js --region=eu,us  both
//   node pipeline/addon-data.js --live              from foreveranvil.com instead of ./out (has sold per day)
//   node pipeline/addon-data.js --in=out --out=addon
//
// What ships (see docs/addon-plan.md, section 2): per auction house the current
// [min, market, units listed, listings, sold per day] of each item, one median market per item across the
// region's houses, and the vendor buy price of crafting reagents (used when a reagent isn't on the AH).
// Since version 2 also: each recipe's skill levels (leveling helper), the Waylaid crates (crate tooltips), and
// the names, quality, category and icon of the items on sale (the in-game prices window searches by name,
// and the game only knows the names of items it has loaded).
//
// Each house is one string ("id,min,market,qty,listings,sold;…", sold empty when unknown) that the addon
// decodes only for the house you're on, so the other houses cost a little memory and no time.
// Generated files are not committed (.gitignore); they're rebuilt for every addon release.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS } from "./houses.js";
import { NO_DISENCHANT } from "../src/data/nodisenchant.js";
import { crateInfo, crateFavor, CONFIRMED_TIERS } from "../src/lib/cratemath.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTERFACE = "16001"; // WoW: Forever client 1.60.1 (docs/addon-plan.md A0: confirm with /dump select(4, GetBuildInfo()))
const MIN_REGION_LISTINGS = 3; // a house's market counts toward the region median only with this many listings

/** One house's items as the addon's compact string, sorted by item id. */
export function encodeHouse(items) {
  const ids = Object.keys(items).map(Number).sort((a, b) => a - b);
  let s = "";
  for (const id of ids) {
    const a = items[id];
    const n = (x) => (x == null ? "" : String(Math.round(x)));
    s += `${id},${n(a[0])},${n(a[1])},${n(a[2] || 0)},${n(a[3] || 0)},${n(a[4])};`;
  }
  return s;
}

/** Median market per item across houses ({ id: [market, houses] }), from houses with enough listings. */
export function regionMedians(houseItemsList) {
  const by = new Map();
  for (const items of houseItemsList) {
    for (const [id, a] of Object.entries(items)) {
      if ((a[3] || 0) < MIN_REGION_LISTINGS || a[1] == null) continue;
      (by.get(id) || by.set(id, []).get(id)).push(a[1]);
    }
  }
  const out = {};
  for (const [id, list] of by) {
    list.sort((x, y) => x - y);
    const m = list.length % 2 ? list[(list.length - 1) / 2] : (list[list.length / 2 - 1] + list[list.length / 2]) / 2;
    out[id] = [Math.round(m), list.length];
  }
  return out;
}

/**
 * Recipe skill levels as "spell,required,yellow,grey;…" (required empty for trainer recipes), by spell id:
 * the modern profession window's recipe id is the recipe's spell. From recipes_<region>.json rows, whose
 * info is [required|null, yellow, grey, source, teachItemId, spellId] (pipeline/recipeinfo.js).
 */
export function encodeSkill(recipes) {
  const by = new Map();
  for (const p of (recipes && recipes.professions) || []) for (const r of p.recipes || []) {
    const info = r[7];
    if (!info || !info[5] || !info[2] || !info[1]) continue;
    by.set(info[5], `${info[5]},${info[0] ?? ""},${info[1]},${info[2]};`);
  }
  return [...by.keys()].sort((a, b) => a - b).map((k) => by.get(k)).join("");
}

/**
 * Waylaid crates as "crate,favor,confirmed|item:qty,item:qty;…": the Merchant's Favor one crate pays
 * (src/lib/cratemath.js; confirmed 0 while players haven't confirmed that tier's Favor in game) and the
 * bundles that fill it. From crates_<region>.json: [[crateId, name, level, [[itemId|null, qty, name], …]], …]
 */
export function encodeCrates(file) {
  let s = "";
  for (const [id, name, , bundles] of (file && file.crates) || []) {
    const info = crateInfo(name);
    if (!info) continue;
    const list = (bundles || []).filter(([item, qty]) => item && qty > 0).map(([item, qty]) => `${item}:${qty}`).join(",");
    s += `${id},${crateFavor(info)},${info.tier < CONFIRMED_TIERS ? 1 : 0}|${list};`;
  }
  return s;
}

const QUALITY = ["poor", "common", "uncommon", "rare", "epic", "legendary"];
// item class → the prices page's category (src/lib/itemfilters.ts CATEGORIES), one letter each
const CATEGORY = { Weapon: "w", Armor: "a", Consumable: "c", "Trade Goods": "t", Recipe: "r", Container: "b", Quiver: "b", Projectile: "p" };

/**
 * Names and kinds of the items on the region's auction houses, for the in-game prices window (its search
 * needs names the game hasn't loaded yet): "id,quality,category,requiredLevel,icon,name" lines, sorted by id.
 * Category is one letter (CATEGORY; "o" for other). From the item cache entry
 * [name, vendorSells, day, vendorBuys, quality, class, icon, _, subclass, invType, requiredLevel, itemLevel].
 */
export function encodeItems(cache, ids) {
  let s = "";
  for (const id of [...ids].sort((a, b) => a - b)) {
    const e = cache[id];
    if (!e || !e[0]) continue;
    const q = QUALITY.indexOf(e[4]);
    const req = typeof e[10] === "number" ? e[10] : "";
    s += `${id},${q < 0 ? "" : q},${CATEGORY[e[5]] || "o"},${req},${e[6] || ""},${String(e[0]).replace(/[\r\n]/g, " ")}\n`;
  }
  return s;
}

/**
 * Gear details of the weapons and armor on sale, for the in-game upgrade finder (src/lib/upgrades.js):
 * "id,subclass,inventoryType,itemLevel;" sorted by id. Quality, category and required level are in items.
 */
export function encodeGear(cache, ids) {
  let s = "";
  for (const id of [...ids].sort((a, b) => a - b)) {
    const e = cache[id];
    if (!e || !e[0] || (e[5] !== "Weapon" && e[5] !== "Armor") || !e[9] || e[11] == null) continue;
    s += `${id},${e[8] || ""},${e[9]},${e[11]};`;
  }
  return s;
}

// JSON quoting is valid Lua for these strings: digits, punctuation and names (quotes and backslashes escaped,
// newlines written as \n). JSON writes \u escapes, which Lua 5.1 lacks, only for control characters: names have none.
const luaStr = (s) => JSON.stringify(s);

const readJSON = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};

/** Builds one region's Data.lua text, or null when the price job hasn't produced that region yet. */
export function buildRegion(region, inDir) {
  const meta = readJSON(path.join(inDir, `meta_${region}.json`));
  if (!meta) return null;
  const rulesets = [];
  const houses = [];
  let updated = 0;
  for (const group of meta.groups || []) {
    const def = GROUPS.find((g) => g.id === group);
    // confirmed names: houses.js (this build's), else the price job's meta; then the guessed ones
    const sure = (def && def.ruleset && def.ruleset[region]) || (meta.rulesets || {})[group];
    const name = sure || (meta.likely || {})[group];
    const file = readJSON(path.join(inDir, `prices_${region}_${group}.json`));
    if (!name || !def || !file) continue;
    const likely = !sure;
    rulesets.push({ name, group, likely, houses: def.houses });
    updated = Math.max(updated, Date.parse(file.updated) || 0);
    for (const [id, h] of Object.entries(file.houses || {})) houses.push({ id: Number(id), group, faction: h.faction, items: h.items || {} });
  }
  if (!houses.length) return null;

  const region_ = regionMedians(houses.map((h) => h.items));
  let regionStr = "";
  for (const id of Object.keys(region_).map(Number).sort((a, b) => a - b)) regionStr += `${id},${region_[id][0]},${region_[id][1]};`;

  // vendor buy prices of reagents (item cache entry [name, vendorSells, day, vendorBuys, …])
  const items = (readJSON(path.join(inDir, `items_${region}.json`)) || {});
  const cache = items.items || items;
  const recipes = readJSON(path.join(inDir, `recipes_${region}.json`));
  const reagents = new Set();
  for (const p of (recipes && recipes.professions) || []) for (const r of p.recipes || []) for (const [id] of r[6] || []) reagents.add(id);
  let vendorStr = "";
  for (const id of [...reagents].sort((a, b) => a - b)) {
    const e = cache[id];
    if (e && e[3] > 0) vendorStr += `${id},${e[3]};`;
  }

  const crates = readJSON(path.join(inDir, `crates_${region}.json`));
  const onSale = new Set();
  for (const h of houses) for (const id of Object.keys(h.items)) onSale.add(Number(id));

  const R = region.toUpperCase();
  const lines = [
    "-- Generated by pipeline/addon-data.js from Blizzard API data. Do not edit: it's rebuilt for every release.",
    "-- Data provided by Blizzard Entertainment.",
    "ForeverAnvilData = ForeverAnvilData or {}",
    `ForeverAnvilData.${R} = {`,
    `  region = ${luaStr(region)},`,
    `  updated = ${Math.floor(updated / 1000)},`,
    "  rulesets = {",
    ...rulesets.map((r) => `    { name = ${luaStr(r.name)}, group = ${luaStr(r.group)}, likely = ${r.likely}, alliance = ${r.houses.alliance}, horde = ${r.houses.horde}, neutral = ${r.houses.neutral} },`),
    "  },",
    "  houses = {",
    ...houses.sort((a, b) => a.id - b.id).map((h) => `    [${h.id}] = { group = ${luaStr(h.group)}, faction = ${luaStr(h.faction)}, data = ${luaStr(encodeHouse(h.items))} },`),
    "  },",
    `  regionMedian = ${luaStr(regionStr)},`,
    `  vendorBuy = ${luaStr(vendorStr)},`,
    // items the game won't disenchant though they fit the rules (src/data/nodisenchant.js)
    `  noDisenchant = ${luaStr([...NO_DISENCHANT].sort((a, b) => a - b).join(";") + ";")},`,
    // skill levels of every recipe, by its spell (the game's recipe id), for the leveling helper
    `  skill = ${luaStr(encodeSkill(recipes))},`,
    `  crates = ${luaStr(encodeCrates(crates))},`,
    // names, quality, category, level and icon of every item on sale, for the prices window (version 2)
    `  items = ${luaStr(encodeItems(cache, onSale))},`,
    // subclass, slot and item level of the gear on sale, for the upgrade finder (version 2.2)
    `  gear = ${luaStr(encodeGear(cache, onSale))},`,
    "}",
    ""
  ];
  return { R, text: lines.join("\n"), houses: houses.length, rulesets: rulesets.length, updated };
}

function toc(R) {
  return [
    `## Interface: ${INTERFACE}`,
    `## Title: Forever Anvil Data (${R})`,
    `## Notes: Auction prices for the ${R} region, used by Forever Anvil. Data provided by Blizzard Entertainment.`,
    "## Author: Forever Anvil",
    "## Version: @project-version@",
    "## Dependencies: ForeverAnvil",
    "## LoadOnDemand: 1",
    "## X-Website: https://foreveranvil.com",
    "",
    "Data.lua",
    ""
  ].join("\n");
}

/**
 * Downloads a region's public files from the live site into dir (as meta_eu.json, prices_eu_A.json, …).
 * The hourly job's files are the complete ones: a local `npm run prices` has no sales history, so
 * "sold per day" would be empty.
 */
async function downloadRegion(site, region, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const get = async (kind, part) => {
    const url = `${site}/api/${kind}/${region}${part ? "/" + part : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": "forever-anvil-addon-build" } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    fs.writeFileSync(path.join(dir, `${kind}_${region}${part ? "_" + part : ""}.json`), await res.text());
  };
  await get("meta");
  const meta = readJSON(path.join(dir, `meta_${region}.json`));
  await Promise.all([...(meta.groups || []).map((g) => get("prices", g)), get("items"), get("recipes"), get("crates")]);
}

async function main() {
  const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
  const regions = arg("region", "eu").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const live = process.argv.includes("--live");
  const inDir = live ? path.join(ROOT, "out", "addon-live") : path.resolve(ROOT, arg("in", "out"));
  const outDir = path.resolve(ROOT, arg("out", "addon"));
  let built = 0;
  for (const region of regions) {
    if (live) await downloadRegion(arg("site", "https://foreveranvil.com"), region, inDir);
    const r = buildRegion(region, inDir);
    if (!r) { console.log(`${region.toUpperCase()}: no price files in ${inDir}, skipped`); continue; }
    const dir = path.join(outDir, `ForeverAnvil_Data_${r.R}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `ForeverAnvil_Data_${r.R}.toc`), toc(r.R));
    fs.writeFileSync(path.join(dir, "Data.lua"), r.text);
    console.log(`${r.R}: ${r.rulesets} rulesets, ${r.houses} houses, ${(r.text.length / 1024 / 1024).toFixed(2)} MB, prices from ${new Date(r.updated).toISOString()}`);
    built++;
  }
  if (!built) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
