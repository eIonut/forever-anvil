// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { crateInfo, crateFavor, rankCrates, costForFavor } from "../src/lib/cratemath.js";
import { parseFills } from "./crates.js";

test("crate fill list: reads the bundles from the item's Use: text", () => {
  const text = "Use: Fill the crate with any bundle from the following list:\r\n- 8 Bolt of Runecloth\r\n- 2 Cured Thick Hide";
  assert.deepEqual(parseFills(text), [[8, "Bolt of Runecloth"], [2, "Cured Thick Hide"]]);
  assert.deepEqual(parseFills("Use: something else"), []);
  assert.deepEqual(parseFills(null), []);
});

test("crate names: tier and gathered/crafted kind", () => {
  assert.deepEqual(crateInfo("Waylaid Crate: Flowering Artisan Herbs"), { tier: 3, tierName: "Artisan", kind: "gathered", label: "Flowering Artisan Herbs" });
  assert.equal(crateInfo("Waylaid Crate: Journeyman Ingots").kind, "crafted");
  assert.equal(crateInfo("Waylaid Crate: Apprentice Ore").tier, 0);
  assert.equal(crateInfo("Waylaid Crate: Mystery"), null);
});

test("favor: crafted crates pay double, the Legacy perk adds a percentage", () => {
  assert.equal(crateFavor(crateInfo("Waylaid Crate: Expert Ore")), 15);
  assert.equal(crateFavor(crateInfo("Waylaid Crate: Expert Parts")), 30);
  assert.equal(crateFavor(crateInfo("Waylaid Crate: Apprentice Herbs"), 10), 5.5);
});

test("ranking: cheapest bundle on the cheaper house, per Favor", () => {
  const crates = [
    [1, "Waylaid Crate: Apprentice Herbs", 10, [[100, 20, "Peacebloom"], [101, 10, "Earthroot"]]],
    [2, "Waylaid Crate: Apprentice Ingots", 10, [[200, 10, "Bronze Bar"]]],
    [3, "Waylaid Crate: Expert Ore", 20, [[300, 10, "Gold Ore"]]]   // not on sale anywhere
  ];
  const houses = [
    { id: "113", faction: "horde", items: { 100: [4, 5, 100, 3], 101: [9, 10, 50, 2], 200: [20, 30, 40, 2], 1: [50, 60, 1, 1] } },
    { id: "116", faction: "neutral", items: { 100: [3, 4, 10, 1], 200: [15, 25, 5, 1] } } // only 5 Bronze Bars: can't fill a 10-bundle
  ];
  const rows = rankCrates(crates, houses);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
  const herbs = rows[0];
  // 20 Peacebloom: horde 20×5 = 100, Blackwater has only 10 listed → horde; Earthroot 10×10 = 100 (tie, kept after)
  assert.equal(herbs.best.name, "Peacebloom");
  assert.equal(herbs.best.cost, 100);
  assert.equal(herbs.best.faction, "horde");
  assert.equal(herbs.perFavor, 20);                        // 100 copper / 5 Favor
  assert.deepEqual(herbs.crate, { cost: 50, houseId: "113", faction: "horde" });
  assert.equal(herbs.buyAndFillPerFavor, 30);              // (100 + 50) / 5
  assert.equal(rows[1].best.houseId, "113");               // 10×30 = 300 on horde; Blackwater too few
  assert.equal(rows[1].perFavor, 30);                      // 300 / 10 Favor (Apprentice crafted)
  assert.equal(rows[2].best, null);
  assert.equal(rows[2].perFavor, null);
  assert.equal(rows[2].confirmed, true);
});

test("ranking by buy-and-fill puts crates you can't buy last", () => {
  const crates = [
    [1, "Waylaid Crate: Apprentice Herbs", 10, [[100, 1, "Peacebloom"]]],
    [2, "Waylaid Crate: Apprentice Ore", 10, [[101, 1, "Copper Ore"]]]
  ];
  const houses = [{ id: "1", faction: "alliance", items: { 100: [1, 1, 5, 1], 101: [50, 50, 5, 1], 2: [10, 10, 1, 1] } }];
  assert.deepEqual(rankCrates(crates, houses).map((r) => r.id), [1, 2]);
  assert.deepEqual(rankCrates(crates, houses, { rankBy: "buy" }).map((r) => r.id), [2, 1]);
});

test("favor goal: whole crates, rounded up", () => {
  assert.deepEqual(costForFavor(100, 30, 1000), { crates: 34, cost: 3400 });
});
