// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { skillUpChance, planLeveling, rangesText } from "../src/lib/levelmath.js";

test("skill-up chance: orange, then falling through yellow and green, then grey", () => {
  const info = [10, 20, 40, "item", 0, 1]; // learn at 10, yellow at 20, grey at 40
  assert.equal(skillUpChance(info, 9), 0);    // can't learn it yet
  assert.equal(skillUpChance(info, 10), 1);   // orange
  assert.equal(skillUpChance(info, 20), 1);   // first yellow point: (40−20)/(40−20)
  assert.equal(skillUpChance(info, 30), 0.5);
  assert.equal(skillUpChance(info, 40), 0);   // grey
  assert.equal(skillUpChance(null, 5), 0);
});

test("skill-up chance: trainer recipes count from their yellow skill", () => {
  const info = [null, 50, 70, "trainer", 0, 1];
  assert.equal(skillUpChance(info, 45), 0);
  assert.equal(skillUpChance(info, 50), 1);
  assert.equal(skillUpChance(info, 60), 0.5);
});

// two trainer recipes: A is cheap and goes grey at 12; B costs more but lasts to 20
const recipes = [
  [1, "Cheap", "", 101, "Cheap thing", 1, [[900, 2, "Ore"]], [1, 10, 12, "auto", 0, 11]],
  [2, "Dear", "", 102, "Dear thing", 1, [[901, 1, "Bar"]], [null, 5, 20, "trainer", 0, 12]],
  [3, "Pattern", "", 103, "Patterned", 1, [[900, 1, "Ore"]], [1, 30, 40, "item", 555, 13]],
  [4, "Unpriced", "", 104, "Mystery", 1, [[999, 1, "Unknown"]], [1, 30, 40, "trainer", 0, 14]],
];
const prices = { 900: { unit: 10, source: "ah", house: "113", listed: 500 }, 901: { unit: 50, source: "vendor" } };
const price = (id) => prices[id] || null;

test("leveling plan: cheapest recipe per point, merged into steps", () => {
  const plan = planLeveling(recipes, price, { from: 1, to: 15 });
  // skills 1–9: Cheap is orange (20c a point) and beats Dear (50c+). 10, 11: Cheap is yellow,
  // chance (12−s)/(12−10) = 1 then 0.5 → 20c and 40c a point, still under Dear. 12–14: Cheap is grey → Dear.
  assert.equal(plan.steps.length, 2);
  assert.deepEqual([plan.steps[0].from, plan.steps[0].to, plan.steps[0].recipe[0]], [1, 12, 1]);
  assert.equal(plan.steps[0].crafts, 12);            // 9 sure crafts + 1 (at 10) + 2 expected (at 11)
  assert.deepEqual([plan.steps[1].from, plan.steps[1].to, plan.steps[1].recipe[0]], [12, 15, 2]);
  assert.deepEqual(plan.gaps, []);
  assert.equal(plan.total, plan.steps.reduce((s, x) => s + x.cost, 0));
  const ore = plan.shopping.find((x) => x.id === 900);
  assert.equal(ore.qty, plan.steps[0].crafts * 2);
  assert.equal(ore.house, "113");
});

test("leveling plan: skills with no priced recipe are reported as gaps", () => {
  const plan = planLeveling(recipes, price, { from: 18, to: 32 });
  // Dear goes grey at 20; Pattern isn't counted by default and Unpriced has no price
  assert.equal(rangesText(plan.gaps), "20–31");
  const withPatterns = planLeveling(recipes, price, { from: 18, to: 32, sources: ["trainer", "auto", "item"] });
  assert.equal(rangesText(withPatterns.gaps), "");   // the pattern is learnable from 1 and orange until 30
  assert.deepEqual(withPatterns.patterns, [555]);
});

test("leveling plan: selling what you make lowers the cost", () => {
  const keep = planLeveling(recipes, price, { from: 1, to: 10 });
  const vendor = planLeveling(recipes, price, { from: 1, to: 10, results: "vendor", sellPrice: () => 5 });
  assert.equal(keep.total, 9 * 20);
  assert.equal(vendor.total, 9 * 15);
});

test("skill ranges text", () => {
  assert.equal(rangesText([5, 6, 7, 10, 12, 13]), "5–7, 10, 12–13");
  assert.equal(rangesText([]), "");
});
