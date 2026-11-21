// Tests for the home page summary (src/lib/homesummary.js).
import test from "node:test";
import assert from "node:assert/strict";
import { buildHome } from "../src/lib/homesummary.js";

// item cache entries: [name, vendorSells, day, vendorBuys, quality, class, icon]
const items = {
  1: ["Ore", 5, 0, null, "common", "Trade Goods", 11],
  2: ["Bar", 10, 0, null, "common", "Trade Goods", 12],
  3: ["Junk", 50, 0, null, "poor", "Miscellaneous", 13],
  4: ["Unused", 1, 0, null, "common", "Trade Goods", 14],
};
// one recipe: 2 Ore → 1 Bar
const recipes = { professions: [{ id: 9, name: "Mining", recipes: [[100, "Smelt Bar", "Smelting", 2, "Bar", 1, [[1, 2, "Ore"]]]] }] };
const group = {
  updated: "2026-11-21T10:00:00.000Z",
  houses: {
    110: {
      faction: "alliance", listings: 30, salesHours: 24,
      // [min, market, qty, listings, soldPerDay]
      items: { 1: [10, 10, 100, 10, 50], 2: [100, 100, 20, 5, 4], 3: [20, 20, 1, 1], 4: [1, 1, 1, 1] },
      flips: [[3, 1, 28, 20, 50]],
    },
  },
};

test("home summary: flips, fastest sellers, best crafts and only the items they show", () => {
  const h = buildHome({ region: "eu", updated: "u", groups: { A: group }, recipes, items, meta: { rulesets: { A: "PvP" } } });
  assert.deepEqual(h.groups, ["A"]);
  assert.equal(h.rulesets.A, "PvP");
  const a = h.markets.A.houses.alliance;
  assert.equal(a.houseId, "110");
  assert.equal(a.salesHours, 24);
  assert.deepEqual(a.flips, [[3, 1, 28, 20, 50]]);
  assert.equal(a.flipTotal, 28);
  // Ore: 50/day × 10c = 500c a day; Bar: 4/day × 100c = 400c
  assert.deepEqual(a.sellers, [[1, 50, 10, 500], [2, 4, 100, 400]]);
  // Bar sells for 100c, 95c after the AH cut, from 20c of Ore: 75c profit
  assert.deepEqual(a.crafts, [[100, "Smelt Bar", "Mining", 2, 75]]);
  assert.deepEqual(Object.keys(a.prices).sort(), ["1", "2"]);
  assert.deepEqual(Object.keys(h.items).sort(), ["1", "2", "3"]); // item 4 isn't shown anywhere
});

test("home summary without recipes still has flips and sellers", () => {
  const h = buildHome({ region: "eu", updated: "u", groups: { A: group }, recipes: null, items, meta: null });
  assert.deepEqual(h.markets.A.houses.alliance.crafts, []);
  assert.equal(h.markets.A.houses.alliance.sellers.length, 2);
  assert.deepEqual(h.likely, {});
});
