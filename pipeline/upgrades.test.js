// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { findUpgrades, fits } from "../src/lib/upgrades.js";

// items-file entries: [name, sell, day, buy, quality, class, icon, source, subclass, inventoryType, reqLevel, itemLevel]
const e = (name, cls, sub, inv, req, ilvl, quality = "uncommon") => [name, 0, 0, 0, quality, cls, 0, null, sub, inv, req, ilvl];
const items = {
  1: e("Worn Mail Helm", "Armor", "Mail", "HEAD", 10, 15, "common"),
  2: e("Good Mail Helm", "Armor", "Mail", "HEAD", 18, 25),
  3: e("Great Mail Helm", "Armor", "Mail", "HEAD", 30, 35),   // level too high
  4: e("Plate Helm", "Armor", "Plate", "HEAD", 15, 30),       // plate before 40
  5: e("Cloth Hood", "Armor", "Cloth", "HEAD", 15, 30),       // wrong armor type
  10: e("Old Greatsword", "Weapon", "Sword", "TWOHWEAPON", 10, 18),
  11: e("Big Axe", "Weapon", "Axe", "TWOHWEAPON", 20, 24),
  12: e("Short Sword", "Weapon", "Sword", "WEAPON", 20, 26),  // one-hander: not like for like
  13: e("Staff", "Weapon", "Staff", "TWOHWEAPON", 20, 28),
  20: e("Ring A", "Armor", "Miscellaneous", "FINGER", 15, 20),
  21: e("Ring B", "Armor", "Miscellaneous", "FINGER", 15, 12),
  22: e("Ring C", "Armor", "Miscellaneous", "FINGER", 15, 16),
  30: e("Shield", "Armor", "Shield", "SHIELD", 10, 40),
  40: e("Junk Helm", "Armor", "Mail", "HEAD", 1, 99, "poor"),
  41: e("Parachute Cloak", "Armor", "Cloth", "CLOAK", 1, 50),  // needs only level 1: a gadget
  42: e("Real Cloak", "Armor", "Cloth", "CLOAK", 20, 25),
};
const warrior = { level: 25, class: "Warrior" };
const gear = [
  { slotType: "HEAD", id: 1, level: 15 },
  { slotType: "MAIN_HAND", id: 10, level: 18 },
  { slotType: "FINGER_1", id: 20, level: 20 },
  { slotType: "FINGER_2", id: 21, level: 12 },
];
const houses = [
  { id: "113", faction: "horde", items: { 41: [100, 100, 1, 1], 42: [300, 300, 1, 1], 2: [5000, 6000, 3, 2], 3: [100, 100, 1, 1], 4: [10, 10, 1, 1], 5: [10, 10, 1, 1], 11: [20000, 21000, 1, 1], 12: [50, 50, 1, 1], 13: [900, 900, 1, 1], 22: [700, 700, 2, 1], 30: [1, 1, 1, 1], 40: [1, 1, 1, 1] } },
  { id: "116", faction: "neutral", items: { 2: [4000, 4500, 1, 1] } },
];

test("upgrades: right armor type, level and slot; cheapest house", () => {
  const up = findUpgrades(warrior, gear, items, houses);
  const head = up.find((s) => s.slot === "HEAD");
  assert.deepEqual(head.options.map((o) => o.id), [2]);
  assert.equal(head.options[0].gain, 10);
  assert.equal(head.options[0].house, "neutral");   // 40s on Blackwater beats 50s on the Horde AH
  assert.equal(head.options[0].price, 4000);
});

test("upgrades: two-hander for two-hander; no off hand behind a two-hander", () => {
  const up = findUpgrades(warrior, gear, items, houses);
  const main = up.find((s) => s.slot === "MAIN_HAND");
  assert.deepEqual(main.options.map((o) => o.id), [13, 11]); // staff (28) then axe (24); not the one-hander
  assert.equal(up.find((s) => s.slot === "OFF_HAND"), undefined);
});

test("upgrades: rings must beat the weaker ring", () => {
  const up = findUpgrades(warrior, gear, items, houses);
  const ring = up.find((s) => s.slot === "FINGER");
  assert.equal(ring.wearing.level, 12);
  assert.deepEqual(ring.options.map((o) => o.id), [22]);
});

test("upgrades: gadgets with no level requirement are left out", () => {
  const back = findUpgrades(warrior, gear, items, houses).find((s) => s.slot === "BACK");
  assert.deepEqual(back.options.map((o) => o.id), [42]);
});

test("upgrades: budget filter and unknown class", () => {
  const up = findUpgrades(warrior, gear, items, houses, { maxPrice: 1000 });
  assert.equal(up.find((s) => s.slot === "HEAD"), undefined);   // helm costs 40s
  assert.deepEqual(findUpgrades({ level: 25, class: "Monk" }, gear, items, houses), []);
});

test("class rules: plate from 40, casters can't use axes, druids get idols", () => {
  assert.equal(fits("HEAD", items[4], "warrior", 39, null), false);
  assert.equal(fits("HEAD", items[4], "warrior", 40, null), true);
  assert.equal(fits("MAIN_HAND", items[11], "mage", 30, null), false);
  assert.equal(fits("RANGED", e("Idol", "Armor", "Idol", "RELIC", 1, 30), "druid", 30, null), true);
  assert.equal(fits("OFF_HAND", items[30], "warrior", 30, "SHIELD"), true);
  assert.equal(fits("OFF_HAND", items[30], "mage", 30, null), false);
});
