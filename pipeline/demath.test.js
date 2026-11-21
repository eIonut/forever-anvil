// Tests for the disenchanting table and flips (src/lib/demath.js).
import test from "node:test";
import assert from "node:assert/strict";
import { MATS, disenchantTable, disenchantOf, disenchantValue, disenchantFlips } from "../src/lib/demath.js";

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

test("disenchant flips: cheapest listing below the materials' worth after the AH cut", () => {
  const items = {
    1: ["Cheap Boots", 1, 0, null, "uncommon", "Armor", 0, null, "Cloth", "FEET", 30, 38],
    2: ["Dear Boots", 1, 0, null, "uncommon", "Armor", 0, null, "Cloth", "FEET", 30, 38],
    3: ["Grey Boots", 1, 0, null, "poor", "Armor", 0, null, "Cloth", "FEET", 30, 38],
  };
  const house = {
    1: [1500, 1600, 1, 1], 2: [5000, 5000, 1, 1], 3: [1, 1, 1, 1],
    [MATS.visionDust]: [1000, 1000, 50, 10], [MATS.greaterMystic]: [3000, 3000, 50, 10], [MATS.largeGlowing]: [4000, 4000, 50, 10],
  };
  const flips = disenchantFlips(house, items);
  assert.deepEqual(flips.map((f) => [f.id, f.cost, f.value, f.profit]), [[1, 1500, 2114, 614]]); // 2225 × 0.95 = 2114
  // a thin material market (under 3 listings) doesn't count as priced: no flip
  assert.deepEqual(disenchantFlips({ ...house, [MATS.largeGlowing]: [4000, 4000, 1, 1] }, items), []);
});
