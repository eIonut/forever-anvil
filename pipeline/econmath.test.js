// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_IDS, WILD, DAY, HOUR,
  snapshotsFromHistory, updateRing,
  houseSummary, goldByClass, crownJewels, bazaar, factionGaps, blackwaterFlips, squarify
} from "../src/lib/econmath.js";

// a group with one house; items: { id: [min, market, qty, listings] }
const grp = (items, faction = "horde", listings = 10) => ({ houses: { 1: { faction, listings, items } } });

test("history snapshots: one per day, oldest first", () => {
  const hist = { 1: { 1: [[10, 100, 90, 10], [11, 110, 100, 10]], 2: [[11, 50, 40, 3]] } };
  const snaps = snapshotsFromHistory(hist, { 1: { faction: "horde" } });
  assert.deepEqual(snaps.map((x) => x.day), [10, 11]);
  assert.equal(snaps[1].group.houses[1].faction, "horde");
  assert.deepEqual(snaps[1].group.houses[1].items["1"], [100, 110, 10, 0]);
  assert.deepEqual(snaps[1].group.houses[1].items["2"], [40, 50, 3, 0]);
});

test("24h change ring: compares with the newest point at least 20 hours old", () => {
  const id = String(BOARD_IDS[0]);
  let r = updateRing(null, grp({ [id]: [100, 100, 5, 1] }), 0, [id]);
  assert.deepEqual(r.chg[1], {});
  r = updateRing(r.ring, grp({ [id]: [150, 150, 5, 1] }), 10 * HOUR, [id]);
  assert.deepEqual(r.chg[1], {});        // nothing old enough yet
  r = updateRing(r.ring, grp({ [id]: [120, 120, 5, 1] }), 24 * HOUR, [id]);
  assert.equal(r.chg[1][id], 20);        // vs the point at hour 0
  r = updateRing(r.ring, grp({ [id]: [120, 120, 5, 1] }), 34 * HOUR, [id]);
  assert.equal(r.chg[1][id], -20);       // hour 10 (150) is closer to 24h ago than hour 0
  r = updateRing(r.ring, grp({ [id]: [120, 120, 5, 1] }), 44 * HOUR, [id]);
  assert.equal(r.ring.t[0], 10 * HOUR); // hour 0 dropped (older than 36h), hour 10 kept
  assert.equal(r.chg[1][id], 0);        // vs hour 24 (120), the closest to a day ago
});

test("house summary and gold by class leave wild prices out", () => {
  const h = { faction: "horde", listings: 7, items: { 1: [100, 100, 10, 2], 2: [WILD * 2, WILD * 2, 1, 1], 3: [50, 50, 4, 4] } };
  assert.deepEqual(houseSummary(h), { listings: 7, units: 15, items: 3, gold: 1200, sold: 0, soldGold: 0, salesHours: 0 });
  // estimated sales per day (5th number); a wild price counts as units but not as gold
  const s = { ...h, salesHours: 5, items: { 1: [100, 100, 10, 2, 3], 2: [WILD * 2, WILD * 2, 1, 1, 1], 3: [50, 50, 4, 4] } };
  assert.deepEqual(houseSummary(s), { listings: 7, units: 15, items: 3, gold: 1200, sold: 4, soldGold: 300, salesHours: 5 });
  const items = { 1: ["Ore", 0, 0, 0, "common", "Trade Goods"], 3: ["Pot", 0, 0, 0, "common", "Consumable"] };
  assert.deepEqual(goldByClass([h], items), [["Trade goods", 1000], ["Consumables", 200]]);
});

test("crown jewels: one row per item, the dearest house, wild prices left out", () => {
  const g = { houses: { 1: { faction: "alliance", items: { 9: [500, 500, 1, 1], 8: [WILD * 3, WILD * 3, 1, 1] } }, 2: { faction: "horde", items: { 9: [700, 700, 1, 1], 7: [600, 600, 1, 1] } } } };
  const j = crownJewels(g, 5);
  assert.deepEqual(j.map((x) => [x.id, x.price, x.faction]), [[9, 700, "horde"], [7, 600, "horde"]]);
});

test("bazaar: most listings or most units", () => {
  const h = { items: { 1: [1, 1, 100, 2], 2: [1, 1, 5, 9] } };
  assert.equal(bazaar(h, "listings")[0].id, 2);
  assert.equal(bazaar(h, "units")[0].id, 1);
});

test("faction gaps: thin listings don't count", () => {
  const g = { houses: {
    1: { faction: "alliance", items: { 1: [100, 100, 10, 5], 2: [100, 100, 1, 1], 3: [1000, 1000, 10, 5] } },
    2: { faction: "horde", items: { 1: [400, 400, 10, 5], 2: [10000, 10000, 1, 1], 3: [1010, 1010, 10, 5] } } } };
  const gaps = factionGaps(g, { 1: ["Ore", 0, 0, 0, "common", "Trade Goods"] });
  assert.equal(gaps.length, 1); // item 2 too thin, item 3 under 5% apart
  assert.deepEqual([gaps[0].id, gaps[0].ratio, gaps[0].cat], [1, 4, "trade"]);
});

test("blackwater flips: cheap on neutral, sells on your house after the 5% cut", () => {
  const g = { houses: {
    1: { faction: "horde", items: { 1: [900, 1000, 20, 6], 2: [100, 100, 20, 6], 3: [900, 1000, 20, 2] } },
    3: { faction: "neutral", items: { 1: [500, 600, 3, 2], 2: [90, 90, 3, 1], 3: [100, 100, 1, 1] } } } };
  const f = blackwaterFlips(g, "horde");
  assert.equal(f.length, 1); // item 2: profit too small; item 3: too few listings on your house
  assert.deepEqual([f[0].id, f[0].buy, f[0].sell, f[0].profit], [1, 500, 950, 450]);
  assert.deepEqual(blackwaterFlips(g, "neutral"), []);
});

test("treemap: areas match the values and fill the box", () => {
  const vals = [{ key: "a", value: 6 }, { key: "b", value: 6 }, { key: "c", value: 4 }, { key: "d", value: 3 }, { key: "e", value: 2 }, { key: "f", value: 2 }, { key: "g", value: 1 }];
  const rects = squarify(vals, 600, 400);
  assert.equal(rects.length, 7);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 600 * 400) < 1e-6);
  const a = rects.find((r) => r.key === "a");
  assert.ok(Math.abs(a.w * a.h - 600 * 400 * 6 / 24) < 1e-6);
  for (const r of rects) assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6);
});

