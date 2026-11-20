// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { unitPrice, aggregate, updateHistory, pruneHistory, computeMovers, craftProfit, computeFlips, planShoppingList, DAY_MS, SHARDS, PLACEHOLDER_PRICE } from "../src/lib/pricemath.js";
import { itemUrl, recipeUrl, itemSlug } from "../src/lib/urls.ts";

test("recipe page address", () => {
  assert.equal(recipeUrl(2359, "Bolt of Linen Cloth"), "/recipe/2359-bolt-of-linen-cloth");
});

test("shopping list: combines materials, subtracts what you have, totals cost and sales", () => {
  const prices = {
    1: { ah: 10, vendor: null, sell: 2 },   // cloth on AH
    2: { ah: null, vendor: 5, sell: 1 },    // thread from vendor
    10: { ah: 100, vendor: null, sell: 20 },// bolt (crafted)
    11: { ah: 300, vendor: null, sell: 50 } // shirt (crafted)
  };
  const price = (id) => prices[id] || { ah: null, vendor: null, sell: null };
  const plan = [
    { recipe: { id: 100, q: 1, item: 10, r: [[1, 2]] }, crafts: 5 },          // 10 cloth
    { recipe: { id: 101, q: 1, item: 11, r: [[1, 3], [2, 1]] }, crafts: 2 }    // 6 cloth + 2 thread
  ];
  const res = planShoppingList(plan, { 1: 4 }, price);
  const cloth = res.mats.find((m) => m.id === 1), thread = res.mats.find((m) => m.id === 2);
  assert.deepEqual([cloth.need, cloth.have, cloth.buy, cloth.cost], [16, 4, 12, 120]);
  assert.deepEqual([thread.buy, thread.source, thread.cost], [2, "vendor", 10]);
  assert.equal(res.cost, 130);
  assert.equal(res.sales, Math.round((5 * 100 + 2 * 300) * 0.95)); // 1045
  assert.equal(res.profit, 1045 - 130);
});

test("shopping list: unknown material price → no profit", () => {
  const res = planShoppingList([{ recipe: { id: 1, q: 1, item: 5, r: [[9, 1]] }, crafts: 1 }], {}, (id) => (id === 5 ? { ah: 50 } : { ah: null, vendor: null }));
  assert.equal(res.complete, false);
  assert.equal(res.profit, null);
});

test("item page address: id + readable slug", () => {
  assert.equal(itemUrl(2770, "Copper Ore"), "/item/2770-copper-ore");
  assert.equal(itemSlug(1, "Hillman's Leather Gloves"), "1-hillmans-leather-gloves");
  assert.equal(itemSlug(5, "Green Hills of Stranglethorn - Page 1"), "5-green-hills-of-stranglethorn-page-1");
  assert.equal(itemSlug(9, "Zoë's Crêpe"), "9-zoes-crepe");
  assert.equal(itemUrl(7, null), "/item/7");
});

test("flips: only listings below vendor price (minus a small margin) count", () => {
  const vendor = { 1: 100, 2: 50 };
  const listings = [
    { item: { id: 1 }, buyout: 120, quantity: 2 },  // 60 each → profit 40 × 2
    { item: { id: 1 }, buyout: 90, quantity: 1 },   // 90 → profit 10
    { item: { id: 1 }, buyout: 98, quantity: 1 },   // 98 → profit 2 < minProfit 5 → skipped
    { item: { id: 1 }, buyout: 300, quantity: 1 },  // above vendor → skipped
    { item: { id: 2 }, unit_price: 10, quantity: 5 },// profit 40 × 5 = 200
    { item: { id: 3 }, buyout: 1, quantity: 1 },    // no vendor price → skipped
    { item: { id: 1 }, bid: 1, quantity: 1 }        // bid only → skipped
  ];
  const flips = computeFlips(listings, (id) => vendor[id] || null);
  assert.deepEqual(flips, [[2, 5, 200, 10, 50], [1, 3, 90, 60, 100]]);
});

test("flips: tiny margins on expensive items are ignored (needs 5% and 10c)", () => {
  const listings = [{ item: { id: 9 }, buyout: 2599, quantity: 1 }]; // vendor pays 2609 → +10c but only 0.4%
  assert.deepEqual(computeFlips(listings, () => 2609), []);
  const ok = [{ item: { id: 9 }, buyout: 2400, quantity: 1 }];       // +209c = 8%
  assert.deepEqual(computeFlips(ok, () => 2609), [[9, 1, 209, 2400, 2609]]);
});

test("movers: rising, falling vs ~7 days ago; thin items ignored", () => {
  const T = 1000;
  const hist = {
    1: [[T - 7, 100, 90, 50], [T - 3, 120, 110, 50], [T, 150, 140, 50]],  // +50% vs 7 days ago
    2: [[T - 7, 200, 190, 50], [T, 100, 95, 50]],                        // -50%
    3: [[T - 7, 100, 90, 2], [T, 900, 900, 2]],                          // too few units → ignored
    4: [[T, 100, 100, 50]]                                               // no past → ignored
  };
  const latest = { 1: [140, 150, 50, 5], 2: [95, 100, 50, 5], 3: [900, 900, 2, 1], 4: [100, 100, 50, 5] };
  const m = computeMovers(hist, latest, T);
  assert.equal(m.days, 8);
  assert.deepEqual(m.rising, [[1, 50, 150, 100]]);
  assert.deepEqual(m.falling, [[2, -50, 100, 200]]);
});

test("movers: deal when the cheapest listing is ≤ 60% of the usual price", () => {
  const T = 500;
  const hist = { 7: [[T - 3, 1000, 950, 30], [T - 2, 1100, 1000, 30], [T - 1, 900, 880, 30]] };
  const m = computeMovers(hist, { 7: [500, 980, 30, 4] }, T);
  assert.deepEqual(m.deals, [[7, 500, 1000, 30]]); // usual = median 1000, cheapest now 500
  const none = computeMovers(hist, { 7: [700, 980, 30, 4] }, T);
  assert.equal(none.deals.length, 0);
});

test("craft profit: AH price first, vendor price as fallback, 5% AH cut", () => {
  const prices = {
    10: { ah: 100, vendor: 400, sell: 20 },   // reagent on AH → 100
    11: { ah: null, vendor: 10, sell: 2 },    // vendor-only reagent → 10
    20: { ah: 1000, vendor: null, sell: 150 } // crafted item
  };
  const r = craftProfit({ q: 1, item: 20, r: [[10, 3], [11, 2]] }, (id) => prices[id] || { ah: null, vendor: null, sell: null });
  assert.equal(r.cost, 320);
  assert.equal(r.profit, 1000 * 0.95 - 320);
  assert.equal(r.margin, Math.round((950 - 320) / 320 * 100));
  assert.equal(r.parts[1].source, "vendor");
});

test("craft profit: unknown reagent price → no profit shown", () => {
  const r = craftProfit({ q: 2, item: 20, r: [[99, 1]] }, (id) => (id === 20 ? { ah: 500, vendor: null, sell: 40 } : { ah: null, vendor: null, sell: null }));
  assert.equal(r.costComplete, false);
  assert.equal(r.profit, null);
  assert.equal(r.sellAh, 1000); // crafts 2
});

test("unit price from buyout and quantity, or unit_price for commodities", () => {
  assert.equal(unitPrice({ buyout: 100, quantity: 4 }), 25);
  assert.equal(unitPrice({ unit_price: 7, quantity: 20 }), 7);
  assert.equal(unitPrice({ bid: 50, quantity: 1 }), null); // bid-only: ignored
});

test("aggregate: min, market (cheapest 10% of units), qty, listings", () => {
  const listings = [
    { item: { id: 1 }, buyout: 100, quantity: 1 },   // 100 each
    { item: { id: 1 }, buyout: 2000, quantity: 10 }, // 200 each
    { item: { id: 1 }, unit_price: 300, quantity: 9 },
    { item: { id: 2 }, buyout: 50, quantity: 1 },
    { item: { id: 3 }, bid: 10, quantity: 1 }       // no buyout → skipped
  ];
  const out = aggregate(listings);
  // item 1: 20 units, 10% = 2 units → 1×100 + 1×200 → market 150
  assert.deepEqual(out[1], [100, 150, 20, 3]);
  assert.deepEqual(out[2], [50, 50, 1, 1]);
  assert.equal(out[3], undefined);
});

test("placeholder listings (1,000,000g+ each) are left out", () => {
  const max = 99999999999; // the game's maximum buyout: 9,999,999g 99s 99c
  const out = aggregate([
    { item: { id: 5 }, buyout: max, quantity: 1 },             // only a placeholder: item left out
    { item: { id: 6 }, buyout: 500, quantity: 2 },
    { item: { id: 6 }, unit_price: PLACEHOLDER_PRICE, quantity: 1 }, // exactly the cutoff: left out
    { item: { id: 7 }, unit_price: PLACEHOLDER_PRICE - 1, quantity: 1 } // just under: a real price
  ]);
  assert.equal(out[5], undefined);
  assert.deepEqual(out[6], [250, 250, 2, 1]);
  assert.deepEqual(out[7], [PLACEHOLDER_PRICE - 1, PLACEHOLDER_PRICE - 1, 1, 1]);
});

test("one cheap outlier moves min but barely moves market", () => {
  const listings = [{ item: { id: 9 }, buyout: 1, quantity: 1 }];
  for (let i = 0; i < 99; i++) listings.push({ item: { id: 9 }, buyout: 1000, quantity: 1 });
  const [min, market] = aggregate(listings)[9];
  assert.equal(min, 1);
  assert.equal(market, Math.round((1 + 9 * 1000) / 10));
});

test("history: one point per day, replaced within the same day", () => {
  const day0 = 20000 * DAY_MS;
  const id = SHARDS * 3; // lands in shard 0
  let h = {};
  h = updateHistory(h, "110", { [id]: [10, 12, 5, 1] }, 0, day0 + 1000);
  h = updateHistory(h, "110", { [id]: [11, 13, 6, 1] }, 0, day0 + 5000); // same day → replaced
  assert.deepEqual(h["110"][id], [[20000, 13, 11, 6]]);
  h = updateHistory(h, "110", { [id]: [9, 9, 7, 1] }, 0, day0 + DAY_MS);
  assert.equal(h["110"][id].length, 2);
});

test("history: items outside the shard are not written", () => {
  const h = updateHistory({}, "110", { 1: [1, 1, 1, 1] }, 0, 20000 * DAY_MS);
  assert.deepEqual(h, {}); // item 1 belongs to shard 1
});

test("history: points older than 30 days are deleted (API terms)", () => {
  const today = 20000;
  const h = { "110": { 32: [[today - 40, 1, 1, 1], [today - 29, 2, 2, 2], [today, 3, 3, 3]] }, "111": { 64: [[today - 31, 1, 1, 1]] } };
  pruneHistory(h, today * DAY_MS);
  assert.deepEqual(h["110"][32], [[today - 29, 2, 2, 2], [today, 3, 3, 3]]);
  assert.equal(h["111"], undefined);
});
