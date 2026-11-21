// Tests for the sales estimate (pipeline/sales.js) and the recipe details (pipeline/recipeinfo.js).
import test from "node:test";
import assert from "node:assert/strict";
import { encodeSnapshot, countSales, addToDays, perDay } from "./sales.js";
import { buildRecipeInfo, parseCsv } from "./recipeinfo.js";

// an auction: unit price 100c unless given
const A = (id, item, quantity, time_left, unit_price = 100) => ({ id, item: { id: item }, quantity, time_left, unit_price });

test("vanished long auctions and partial buys count as sold; short ones don't", () => {
  const before = [A(10, 1, 5, "LONG"), A(11, 1, 2, "VERY_LONG"), A(12, 2, 1, "SHORT"), A(13, 2, 1, "MEDIUM"), A(14, 3, 20, "LONG")];
  const snap = encodeSnapshot(before, 0);
  const after = [A(14, 3, 12, "LONG"), A(15, 1, 3, "VERY_LONG")]; // 10, 11 gone; 12, 13 gone (may have expired); 14 sold 8
  assert.deepEqual(countSales(snap, after), { 1: 7, 3: 8 });
});

test("a vanished auction dearer than one still up was cancelled, not bought", () => {
  const before = [A(1, 7, 10, "LONG", 50), A(2, 7, 10, "LONG", 80), A(3, 7, 10, "LONG", 120), A(4, 7, 10, "LONG", 90)];
  // 1 and 3 gone; 4 (90c) is still up, so 3 (120c) was cancelled; 1 (50c) was the cheapest: bought
  const after = [A(2, 7, 10, "LONG", 80), A(4, 7, 10, "LONG", 90), A(5, 7, 10, "VERY_LONG", 110)];
  assert.deepEqual(countSales(encodeSnapshot(before, 0), after), { 7: 10 });
  // bid-only auctions (no buyout) never count
  const bid = [{ id: 9, item: { id: 8 }, quantity: 1, time_left: "LONG", bid: 500 }];
  assert.deepEqual(countSales(encodeSnapshot(bid, 0), []), {});
});

test("a cancel-and-relist undercut isn't a sale", () => {
  // the cheapest shield is cancelled and listed again 1g cheaper (a new auction id): nothing sold
  const before = [A(1, 9, 1, "LONG", 4659997), A(2, 9, 1, "VERY_LONG", 4659999)];
  const after = [A(2, 9, 1, "VERY_LONG", 4659999), A(3, 9, 1, "VERY_LONG", 4559997)];
  assert.deepEqual(countSales(encodeSnapshot(before, 0), after), {});
  // relisted at the same price: also not a sale
  assert.deepEqual(countSales(encodeSnapshot([A(1, 9, 1, "LONG", 500)], 0), [A(4, 9, 1, "VERY_LONG", 500)]), {});
});

test("new auctions that don't look like a relist leave sales counted", () => {
  // listed dearer, or a different stack size: the vanished auction still counts as bought
  assert.deepEqual(countSales(encodeSnapshot([A(1, 9, 1, "LONG", 500)], 0), [A(4, 9, 1, "VERY_LONG", 600)]), { 9: 1 });
  assert.deepEqual(countSales(encodeSnapshot([A(1, 5, 20, "LONG", 50)], 0), [A(4, 5, 5, "VERY_LONG", 40)]), { 5: 20 });
  // one new auction explains only one vanished auction: two gone, one relist → one sold
  const before = [A(1, 9, 1, "LONG", 500), A(2, 9, 1, "LONG", 500)];
  assert.deepEqual(countSales(encodeSnapshot(before, 0), [A(4, 9, 1, "VERY_LONG", 490)]), { 9: 1 });
});

test("snapshot keeps ids as deltas, in id order, with unit prices", () => {
  const snap = encodeSnapshot([A(300, 1, 1, "LONG", 7), { id: 100, item: { id: 2 }, quantity: 4, time_left: "SHORT", buyout: 400 }], 5);
  assert.deepEqual(snap, { v: 2, t: 5, d: [100, 200], i: [2, 1], q: [4, 1], p: [100, 7], l: "02" });
});

test("per-day average scales by hours watched and forgets old days", () => {
  const days = { d: {} };
  addToDays(days, 100, 1, { 7: 3 });
  addToDays(days, 100, 1, { 7: 1, 8: 2 });
  assert.deepEqual(perDay(days), { hours: 2, perDay: { 7: 48, 8: 24 } });
  addToDays(days, 107, 0, {}); // a week later, day 100 drops out
  assert.deepEqual(perDay(days), { hours: 0, perDay: {} });
});

test("recipe details: auto, pattern and trainer recipes", () => {
  const sla = parseCsv([
    "ID,SkillLine,Spell,AcquireMethod,TrivialSkillLineRankHigh,TrivialSkillLineRankLow",
    "1,197,500,1,50,25",
    "2,197,501,0,85,50",
    "3,197,502,0,120,110",
  ].join("\n"));
  const eff = parseCsv("ID,TriggerType,SpellID\n90,6,501\n91,0,483");
  const x = parseCsv("ID,ItemEffectID,ItemID\n1,90,2598\n2,91,2598");
  const sparse = parseCsv('ID,Display_lang,RequiredSkill,RequiredSkillRank\n2598,"Pattern: Red, Linen Robe",197,25');
  assert.deepEqual(buildRecipeInfo([1, 2, 3, 4], sla, eff, x, sparse), {
    1: [1, 25, 50, "auto", 0, 500],
    2: [25, 50, 85, "item", 2598, 501],
    3: [null, 110, 120, "trainer", 0, 502],
  });
});
