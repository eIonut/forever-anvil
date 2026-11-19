// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import * as TM from "../src/lib/talentmath.js";

// A tiny tree: row 1 has two 5-rank talents, row 2 a 3-rank talent that needs A maxed, row 3 a 1-rank talent.
const A = [1, 1, 1, "A", null, ["a", "a", "a", "a", "a"], []];
const B = [2, 1, 2, "B", null, ["b", "b", "b", "b", "b"], []];
const C = [3, 2, 1, "C", null, ["c", "c", "c"], [1]];
const D = [4, 3, 2, "D", null, ["d"], []];
const specs = [{ nodes: [A, B, C, D] }, { nodes: [[9, 1, 1, "X", null, ["x", "x"], []]] }];

test("points: 1 per level from 10, 51 at 60", () => {
  assert.equal(TM.pointsForLevel(9), 0);
  assert.equal(TM.pointsForLevel(10), 1);
  assert.equal(TM.pointsForLevel(60), 51);
  assert.equal(TM.pointsForLevel(70), 51);
});

test("row 2 needs 5 points in the tree; prerequisite must be maxed", () => {
  const b = {};
  for (let i = 0; i < 4; i++) TM.add(specs, b, 0, B, 51);
  assert.equal(TM.whyLocked(specs, b, 0, C, 51), "row:5");
  TM.add(specs, b, 0, B, 51); // 5 in B
  assert.equal(TM.whyLocked(specs, b, 0, C, 51), "req:1"); // A not maxed
  for (let i = 0; i < 5; i++) TM.add(specs, b, 0, A, 51);
  assert.equal(TM.whyLocked(specs, b, 0, C, 51), null);
  assert.equal(TM.add(specs, b, 0, C, 51), true);
});

test("can't spend more points than the level allows, or above max rank", () => {
  const b = {};
  for (let i = 0; i < 3; i++) TM.add(specs, b, 0, A, 3);
  assert.equal(TM.whyLocked(specs, b, 0, A, 3), "no-points");
  const b2 = {};
  for (let i = 0; i < 9; i++) TM.add(specs, b2, 0, A, 51);
  assert.equal(TM.rankOf(b2, 0, A), 5);
});

test("removing a point that a higher row or a dependent talent needs is refused", () => {
  const b = {};
  for (let i = 0; i < 5; i++) TM.add(specs, b, 0, A, 51);
  TM.add(specs, b, 0, C, 51);
  assert.equal(TM.remove(specs, b, 0, A), false);     // C needs A maxed (and row 2 needs 5 points)
  assert.equal(TM.rankOf(b, 0, A), 5);
  assert.equal(TM.remove(specs, b, 0, C), true);
  assert.equal(TM.remove(specs, b, 0, A), true);
});

test("sanitize: a hand-edited link can't skip rules or the level limit", () => {
  // wants C (row 2) without the 5 points above it, and D (row 3) too
  const wanted = { 0: { 3: 3, 4: 1, 2: 2 } };
  assert.deepEqual(TM.sanitize(specs, wanted, 51), { 0: { 2: 2 } }); // only B's 2 points are legal
  // valid build survives untouched
  const ok = { 0: { 1: 5, 3: 1 } };
  assert.deepEqual(TM.sanitize(specs, ok, 51), ok);
  // level limit: only 3 points available
  assert.deepEqual(TM.sanitize(specs, { 0: { 1: 5 } }, 3), { 0: { 1: 3 } });
});

test("share code round-trips", () => {
  const b = {};
  for (let i = 0; i < 5; i++) TM.add(specs, b, 0, A, 51);
  TM.add(specs, b, 0, C, 51);
  TM.add(specs, b, 1, specs[1].nodes[0], 51);
  const code = TM.encode(specs, b);
  assert.equal(code, "501-1");
  assert.deepEqual(TM.decode(specs, code), b);
  assert.equal(TM.encode(specs, {}), "-");
});
