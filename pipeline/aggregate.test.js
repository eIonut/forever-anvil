// Run: node --test pipeline/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { unitPrice, aggregate, updateHistory, pruneHistory, DAY_MS, SHARDS } = require("./aggregate");

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
