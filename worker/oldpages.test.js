import { test } from "node:test";
import assert from "node:assert/strict";
import { currentAddress, parsePageAddress } from "./oldpages.js";

const slugs = { item: { 6440: "6440-brainlash" }, recipe: { 6020: "6020-transmute-iron-to-gold" } };

test("parses item and recipe addresses", () => {
  assert.deepEqual(parsePageAddress("/item/18677-zephyr-cloak"), { kind: "item", id: "18677" });
  assert.deepEqual(parsePageAddress("/recipe/6020"), { kind: "recipe", id: "6020" });
  assert.deepEqual(parsePageAddress("/item/6440-brainlash/"), { kind: "item", id: "6440" });
  assert.equal(parsePageAddress("/items/armor"), null);
  assert.equal(parsePageAddress("/item/abc"), null);
  assert.equal(parsePageAddress("/item/1/extra"), null);
});

test("sends a renamed recipe to its current address", () => {
  assert.equal(currentAddress("/recipe/6020-gold-bar", slugs), "/recipe/6020-transmute-iron-to-gold");
});

test("sends a bare id or a typo to the named page", () => {
  assert.equal(currentAddress("/item/6440", slugs), "/item/6440-brainlash");
  assert.equal(currentAddress("/item/6440-brainlsh", slugs), "/item/6440-brainlash");
});

test("no redirect when the id has no page or the address is already right", () => {
  assert.equal(currentAddress("/item/18677-zephyr-cloak", slugs), null);
  assert.equal(currentAddress("/item/6440-brainlash", slugs), null);
  assert.equal(currentAddress("/item/6440-brainlash/", slugs), null);
  assert.equal(currentAddress("/item/6440-x", null), null);
});
