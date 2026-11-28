import { test } from "node:test";
import assert from "node:assert/strict";
import { isThinItem, itemIdFromUrl } from "../src/lib/indexable.js";

test("items with a recipe link are always indexed", () => {
  assert.equal(isThinItem({ quality: "poor", houses: 0, made: true, used: false }), false);
  assert.equal(isThinItem({ quality: "common", houses: 1, made: false, used: true }), false);
});

test("grey items with no recipe link are thin", () => {
  assert.equal(isThinItem({ quality: "poor", houses: 16, made: false, used: false }), true);
});

test("items on very few auction houses are thin", () => {
  assert.equal(isThinItem({ quality: "rare", houses: 2, made: false, used: false }), true);
  assert.equal(isThinItem({ quality: "rare", houses: 3, made: false, used: false }), false);
});

test("item id from a page address", () => {
  assert.equal(itemIdFromUrl("https://foreveranvil.com/item/2770-copper-ore"), "2770");
  assert.equal(itemIdFromUrl("https://foreveranvil.com/item/2770"), "2770");
  assert.equal(itemIdFromUrl("https://foreveranvil.com/item"), null);
  assert.equal(itemIdFromUrl("https://foreveranvil.com/recipe/2359-bolt-of-linen-cloth"), null);
});
