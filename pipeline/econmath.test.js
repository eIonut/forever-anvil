// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  INDEXES, BOARD_IDS, WILD, DAY, HOUR,
  members, chainStep, emptySeries, pushPoint, prunePoints, snapshotsFromHistory, seedFromHistory, updateRing,
  houseSummary, goldByClass, crownJewels, bazaar, factionGaps, blackwaterFlips, squarify, seriesFrom
} from "../src/lib/econmath.js";

// a group with one house; items: { id: [min, market, qty, listings] }
const grp = (items, faction = "horde", listings = 10) => ({ houses: { 1: { faction, listings, items } } });
const ids5 = (price, qty = 10) => Object.fromEntries([1, 2, 3, 4, 5].map((i) => [String(i), [price, price, qty, 3]]));
const ALL = { ids: ["1", "2", "3", "4", "5"], test: () => true };

test("chain step: all prices up 10% → factor 1.1", () => {
  const f = chainStep(grp(ids5(100)), grp(ids5(110)), ALL);
  assert.ok(Math.abs(f - 1.1) < 1e-9);
});

test("chain step: fewer than 5 comparable items → null (carry forward)", () => {
  const cur = ids5(110);
  cur["5"] = [110, 110, 2, 1]; // too few units
  assert.equal(chainStep(grp(ids5(100)), grp(cur), ALL), null);
});

test("chain step: one silly listing is clamped to 4×", () => {
  const cur = ids5(100);
  cur["1"] = [100000, 100000, 10, 3];
  const f = chainStep(grp(ids5(100)), grp(cur), ALL);
  // weights equal → geometric mean of [4,1,1,1,1]
  assert.ok(Math.abs(f - Math.pow(4, 1 / 5)) < 1e-9);
});

test("chain step: wild prices are ignored", () => {
  const prev = ids5(100), cur = ids5(100);
  prev["6"] = [WILD + 1, WILD + 1, 10, 3]; cur["6"] = [1, 1, 10, 3];
  const all6 = { ids: ["1", "2", "3", "4", "5", "6"], test: () => true };
  assert.equal(chainStep(grp(prev), grp(cur), all6), 1);
});

test("members: gear indexes only count green and better", () => {
  const items = { 1: ["Sword", 0, 0, 0, "uncommon", "Weapon"], 2: ["Stick", 0, 0, 0, "common", "Weapon"] };
  const m = members(INDEXES.find((d) => d.k === "WEAP"), items, null);
  assert.equal(m.test("1"), true);
  assert.equal(m.test("2"), false);
});

test("series: starts at 100, follows prices, carries forward, prunes after 30 days", () => {
  const s = emptySeries();
  pushPoint(s, null, grp(ids5(100)), {}, 1000, 10);
  assert.equal(s.idx.ORE[0], 100);
  assert.equal(s.idx.TOP100[0], 100);
  pushPoint(s, grp(ids5(100)), grp(ids5(120)), {}, 1000 + HOUR, 12);
  assert.equal(s.idx.TOP100[1], 120);  // the five items are the top 100 of the previous snapshot
  assert.equal(s.idx.ORE[1], 100);     // no ore listed: carried forward
  assert.deepEqual(s.auctions, [10, 12]);
  prunePoints(s, 1000 + 30 * DAY + 1);
  assert.equal(s.t.length, 1);
  assert.equal(s.idx.TOP100.length, 1);
});

test("seed from history: one daily point per past day, today skipped", () => {
  const hist = { 1: { 1: [[10, 100, 90, 10], [11, 110, 100, 10], [12, 121, 110, 10]], 2: [[10, 100, 90, 10], [11, 110, 100, 10], [12, 121, 110, 10]],
    3: [[10, 100, 90, 10], [11, 110, 100, 10]], 4: [[10, 100, 90, 10], [11, 110, 100, 10]], 5: [[10, 100, 90, 10], [11, 110, 100, 10]] } };
  const snaps = snapshotsFromHistory(hist, { 1: { faction: "horde" } });
  assert.equal(snaps.length, 3);
  const { series, last } = seedFromHistory(snaps, {}, 12);
  assert.equal(series.t.length, 2);
  assert.equal(series.t[0], 10 * DAY + DAY / 2);
  assert.equal(series.idx.TOP100[1], 110);
  assert.equal(series.auctions[0], null);
  assert.deepEqual(last.houses[1].items["1"], [100, 110, 10, 0]);
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
  assert.deepEqual(houseSummary(h), { listings: 7, units: 15, items: 3, gold: 1200 });
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

test("series from a time drops older points and gaps", () => {
  assert.deepEqual(seriesFrom([1, 2, 3, 4], [10, null, 30, 40], 2), [[3, 30], [4, 40]]);
});
