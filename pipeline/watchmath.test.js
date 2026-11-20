// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { moneyFromParts, changeSince, encodeIds, decodeIds, cheapestHouse, bestCrafts, topSellers, targetHits, hitMessages } from "../src/lib/watchmath.js";

test("moneyFromParts adds up the gold, silver and copper boxes", () => {
  assert.equal(moneyFromParts("1", "20", "5"), 12005);
  assert.equal(moneyFromParts("1", "50", ""), 15000, "an empty box is 0");
  assert.equal(moneyFromParts("", "35", ""), 3500);
  assert.equal(moneyFromParts("", "", "80"), 80);
  assert.equal(moneyFromParts("", "150", ""), 15000, "150 silver carries over to 1g 50s");
  assert.equal(moneyFromParts("1,250", "", ""), 12500000, "non-digits are ignored");
  assert.equal(moneyFromParts(2, 5, null), 20500);
  assert.equal(moneyFromParts("", "", ""), null, "all empty: no target");
  assert.equal(moneyFromParts("0", "0", "0"), null);
  assert.equal(moneyFromParts("2000000", "", ""), null, "above the joke-listing ceiling");
});

test("changeSince compares now with the oldest day inside the window", () => {
  const today = 20000;
  const pts = [[19990, 50], [19993, 100], [19996, 120], [20000, 130]];
  assert.deepEqual(changeSince(pts, 150, 7, today), { pct: 50, days: 7 });
  assert.deepEqual(changeSince(pts, 60, 4, today), { pct: -50, days: 4 });
  assert.equal(changeSince(pts, 60, 3, today), null, "no point inside a 3-day window");
  assert.equal(changeSince([[20000, 130]], 150, 7, today), null, "only today: nothing to compare");
  assert.equal(changeSince(pts, 0, 7, today), null);
  assert.equal(changeSince(null, 10, 7, today), null);
});

test("share links keep valid, distinct ids", () => {
  assert.equal(encodeIds([2770, "2589", 2770, -1, 1.5, 0]), "2770,2589");
  assert.deepEqual(decodeIds("2770,2589,abc,,2770, 4306"), [2770, 2589, 4306]);
  assert.deepEqual(decodeIds(""), []);
  assert.deepEqual(decodeIds("1,2,3,4", 2), [1, 2]);
  assert.deepEqual(decodeIds("99999999"), [], "too long to be an item id");
});

test("cheapestHouse picks the lowest market price in the group", () => {
  const houses = {
    1: { faction: "alliance", items: { 5: [90, 100, 3, 1] } },
    2: { faction: "horde", items: { 5: [70, 80, 3, 1] } },
    3: { faction: "neutral", items: {} },
  };
  assert.deepEqual(cheapestHouse(houses, 5), { houseId: "2", faction: "horde", market: 80 });
  assert.equal(cheapestHouse(houses, 6), null);
});

test("bestCrafts keeps profitable crafts that sell, one per item, best first", () => {
  // recipe rows: [id, name, category, itemId, itemName, makes, reagents]
  const professions = [
    { name: "Tailoring", recipes: [
      [1, "Bolt", "", 100, "Bolt", 1, [[10, 2, "Cloth"]]],      // cost 2×50, sells 200×0.95=190 → +90
      [2, "Bolt (alt)", "", 100, "Bolt", 1, [[10, 3, "Cloth"]]], // same item, less profit: dropped
      [3, "Shirt", "", 101, "Shirt", 1, [[10, 1, "Cloth"], [11, 1, "Thread"]]], // 50 + vendor 10 → sells 300 → +225
      [4, "Thin", "", 102, "Thin", 1, [[10, 1, "Cloth"]]],       // only 1 listing: thin market
      [5, "Slow", "", 103, "Slow", 1, [[10, 1, "Cloth"]]],       // sells 0.2/day
      [6, "Loss", "", 104, "Loss", 1, [[10, 4, "Cloth"]]],       // loses gold
      [7, "Missing", "", 105, "Missing", 1, [[12, 1, "Unknown"]]], // material without a price
    ] },
  ];
  const house = { 10: [40, 50, 100, 10], 100: [190, 200, 20, 5, 4], 101: [290, 300, 9, 4, 2], 102: [500, 500, 1, 1, 3], 103: [400, 400, 9, 4, 0.2], 104: [100, 100, 9, 4, 5], 105: [900, 900, 9, 4, 5] };
  const items = { 11: ["Thread", 1, 0, 10] };
  const got = bestCrafts(professions, house, items, { salesHours: 24 });
  assert.deepEqual(got.map((x) => [x.recipe[0], x.profit]), [[3, 225], [1, 90]]);
  // before sales are counted, slow sellers aren't left out
  assert.ok(bestCrafts(professions, house, items, { salesHours: 0 }).some((x) => x.recipe[0] === 5));
});

test("topSellers ranks by gold traded per day and skips thin or unsold items", () => {
  const live = {
    1: [90, 100, 50, 10, 20],    // 2,000 a day
    2: [9000, 10000, 5, 4, 1],   // 10,000 a day: few sales, high price
    3: [5, 5, 900, 40, 300],     // 1,500 a day
    4: [1, 99999, 1, 1, 5],      // one listing: thin market
    5: [10, 10, 100, 9],         // no sales counted
    6: [10, 10, 100, 9, 0.5],    // under one a day
  };
  assert.deepEqual(topSellers(live).map((x) => [x.id, x.perDay]), [[2, 10000], [1, 2000], [3, 1500]]);
  assert.equal(topSellers(live, 1).length, 1);
});

test("targetHits finds items at or below their target", () => {
  const watched = [{ id: 1, below: 100 }, { id: 2, below: 50 }, { id: 3, below: null }, { id: 4, below: 10 }];
  const live = { 1: [100, 120, 5, 2], 2: [51, 60, 5, 2], 3: [1, 1, 5, 2] }; // 4 isn't listed
  assert.deepEqual(targetHits(watched, live), [1]);
  assert.deepEqual(targetHits(watched, null), []);
});

test("hitMessages: one message per item, or one for many", () => {
  const money = (c) => c + "c";
  assert.deepEqual(hitMessages([], money), []);
  assert.deepEqual(hitMessages([{ name: "Silk Cloth", min: 100 }], money), ["Silk Cloth is at your target (100c)"]);
  assert.equal(hitMessages([{ name: "A", min: 1 }, { name: "B", min: 2 }], money).length, 2);
  assert.deepEqual(hitMessages([{ name: "A", min: 1 }, { name: "B", min: 2 }, { name: "C", min: 3 }], money), ["3 items reached your target: A, B and C"]);
});
