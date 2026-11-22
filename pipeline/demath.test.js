// Tests for the disenchanting table and flips (src/lib/demath.js).
import test from "node:test";
import assert from "node:assert/strict";
import { MATS, canDisenchant, disenchantTable, disenchantOf, disenchantValue, disenchantFlips, computeDisenchantFlips } from "../src/lib/demath.js";
import { noDisenchantIds } from "../tools/no-disenchant.js";

const sum = (t) => Math.round(t.drops.reduce((s, d) => s + d.chance, 0) * 1e6) / 1e6;

test("green armor and weapons: dust and essence chances swap", () => {
  const armor = disenchantTable("uncommon", "Armor", 38);
  assert.deepEqual(armor.drops.map((d) => [d.id, d.chance]), [[MATS.visionDust, 0.75], [MATS.greaterMystic, 0.2], [MATS.largeGlowing, 0.05]]);
  assert.equal(armor.skill, 100);
  const weapon = disenchantTable("uncommon", "Weapon", 38);
  assert.deepEqual(weapon.drops.map((d) => [d.id, Math.round(d.chance * 100)]), [[MATS.visionDust, 20], [MATS.greaterMystic, 75], [MATS.largeGlowing, 5]]);
});

test("every bracket's chances add up to 1", () => {
  for (const q of ["uncommon", "rare", "epic"]) for (const c of ["Armor", "Weapon"]) for (let lvl = 5; lvl <= 99; lvl++) {
    const t = disenchantTable(q, c, lvl);
    if (t) assert.equal(sum(t), 1, `${q} ${c} ${lvl}`);
  }
});

test("the lowest and special brackets", () => {
  assert.deepEqual(disenchantTable("uncommon", "Armor", 10).drops.map((d) => d.chance), [0.8, 0.2]); // no shard
  assert.equal(disenchantTable("uncommon", "Armor", 23).drops[2].chance, 0.1); // 21–25: 10% shard
  assert.deepEqual(disenchantTable("rare", "Armor", 58).drops.map((d) => d.id), [MATS.largeBrilliant, MATS.nexus]);
  assert.deepEqual(disenchantTable("epic", "Weapon", 70).drops, [{ id: MATS.nexus, chance: 1, min: 1, max: 2 }]);
  assert.equal(disenchantTable("epic", "Armor", 30), null); // no epic bracket below 40
});

test("what can't be disenchanted", () => {
  assert.equal(disenchantTable("common", "Armor", 30), null);
  assert.equal(disenchantTable("uncommon", "Consumable", 30), null);
  assert.equal(disenchantTable("uncommon", "Armor", 3), null);
  assert.equal(disenchantOf(undefined), null);
  // item-cache entry: quality at [4], class at [5], item level at [11]
  assert.ok(disenchantOf(["Boots", 1, 0, null, "uncommon", "Armor", 0, null, "Cloth", "FEET", 30, 35]));
});

test("expected value: chance × average quantity × price", () => {
  const t = disenchantTable("uncommon", "Armor", 38); // 75% 1–2 Vision Dust, 20% 1–2 Greater Mystic, 5% Large Glowing
  const prices = { [MATS.visionDust]: 1000, [MATS.greaterMystic]: 3000, [MATS.largeGlowing]: 4000 };
  // 0.75×1.5×1000 + 0.2×1.5×3000 + 0.05×1×4000 = 1125 + 900 + 200
  assert.deepEqual(disenchantValue(t, (id) => prices[id] ?? null), { value: 2225, complete: true });
  assert.deepEqual(disenchantValue(t, (id) => (id === MATS.largeGlowing ? null : prices[id])), { value: 2025, complete: false });
});

const ITEMS = {
  1: ["Cheap Boots", 1, 0, null, "uncommon", "Armor", 0, null, "Cloth", "FEET", 30, 38],
  2: ["Dear Boots", 1, 0, null, "uncommon", "Armor", 0, null, "Cloth", "FEET", 30, 38],
  3: ["Grey Boots", 1, 0, null, "poor", "Armor", 0, null, "Cloth", "FEET", 30, 38],
};
// worth of a Boots: 2225 (see above) × 0.95 = 2114
const HOUSE = {
  1: [1500, 1600, 3, 2], 2: [5000, 5000, 1, 1], 3: [1, 1, 1, 1],
  [MATS.visionDust]: [1000, 1000, 50, 10], [MATS.greaterMystic]: [3000, 3000, 50, 10], [MATS.largeGlowing]: [4000, 4000, 50, 10],
};

test("price job: every listing below the materials' worth counts, with units and total", () => {
  const L = (id, quantity, unit) => ({ item: { id }, quantity, unit_price: unit });
  const listings = [L(1, 1, 1500), L(1, 2, 1900), L(1, 1, 2100), L(2, 1, 5000), L(3, 1, 1)];
  // 1500 and 1900 (×2) pay; 2100 doesn't (needs 5% of 2114 = 106c profit); Dear Boots costs more; grey can't be disenchanted
  // total: (2114 − 1500) + 2 × (2114 − 1900) = 614 + 428
  assert.deepEqual(computeDisenchantFlips(listings, HOUSE, ITEMS), [[1, 3, 1042, 1500, 2114]]);
  // a thin material market (under 3 listings) doesn't count as priced: no flip
  assert.deepEqual(computeDisenchantFlips(listings, { ...HOUSE, [MATS.largeGlowing]: [4000, 4000, 1, 1] }, ITEMS), []);
});

test("page: uses the price job's rows, or the cheapest listings when there are none", () => {
  const fromJob = disenchantFlips([[1, 3, 1042, 1500, 2114]], HOUSE, ITEMS);
  assert.deepEqual(fromJob.map((f) => [f.id, f.units, f.total, f.cost, f.value, f.profit, f.skill]), [[1, 3, 1042, 1500, 2114, 614, 100]]);
  assert.equal(fromJob[0].drops.length, 3);
  const fallback = disenchantFlips(null, HOUSE, ITEMS);
  assert.deepEqual(fallback.map((f) => [f.id, f.units, f.total, f.cost]), [[1, 1, 614, 1500]]);
});

// Items the game files mark "can't be disenchanted" (src/data/nodisenchant.js): Greater Magic Wand fits every
// rule (green weapon, item level 23) but the game refuses it ("not a valid item", checked in game 2026-11-22).
test("items the game won't disenchant: no table, no flip, dropped from the job's rows", () => {
  const wand = ["Greater Magic Wand", 200, 0, 10000, "uncommon", "Weapon", 0, null, "Wands", "RANGEDRIGHT", 13, 23];
  assert.equal(canDisenchant(11288), false);
  assert.equal(canDisenchant(1), true);
  assert.equal(disenchantOf(wand, 11288), null);
  assert.ok(disenchantOf(wand, 999999)); // the same item under another id would be fine
  const items = { ...ITEMS, 11288: ITEMS[1] };
  const L = (id, quantity, unit) => ({ item: { id }, quantity, unit_price: unit });
  assert.deepEqual(computeDisenchantFlips([L(11288, 1, 1500)], HOUSE, items), []);
  // rows from an older price job that still list it are dropped on the page
  assert.deepEqual(disenchantFlips([[11288, 1, 614, 1500, 2114]], HOUSE, items), []);
});

test("no-disenchant list: flag 0x8000 on green, blue and purple equippable items only", () => {
  const row = (ID, Flags_0, OverallQualityID, InventoryType) => ({ ID: String(ID), Flags_0: String(Flags_0), OverallQualityID: String(OverallQualityID), InventoryType: String(InventoryType) });
  const rows = [row(11288, 32768, 2, 26), row(2584, 0, 2, 16), row(5, 32768 | 4, 3, 5), row(6, 32768, 1, 5), row(7, 32768, 2, 0), row(8, 32768, 5, 5)];
  assert.deepEqual(noDisenchantIds(rows), [5, 11288]);
});
