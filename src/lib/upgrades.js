// AH upgrade finder: for a looked-up character, gear on the Auction House right now that has a higher
// item level than what they wear in that slot, that their class can use and that they're high enough
// level for. Pure functions, used by src/tools/Upgrades.svelte and the tests (pipeline/upgrades.test.js).
//
// "Better" means a higher item level. That's what we can know for every item: stats need the item's full
// tooltip, which Blizzard only has for about half of the items on sale. So it's a shortlist to check,
// not a verdict: a strength sword is no upgrade for a healer.

// What each class can wear and wield (classic proficiencies, all trainable).
// weapons: subclass → hands it may be (1 = one-handed, 2 = two-handed)
const ALL_RANGED = ["Bow", "Crossbow", "Gun", "Thrown"];
const CLASSES = {
  warrior: { armor: (lvl) => (lvl >= 40 ? "Plate" : "Mail"), weapons: { Axe: [1, 2], Mace: [1, 2], Sword: [1, 2], Dagger: [1], "Fist Weapon": [1], Polearm: [2], Staff: [2] }, ranged: ALL_RANGED, shield: true, dual: true },
  paladin: { armor: (lvl) => (lvl >= 40 ? "Plate" : "Mail"), weapons: { Axe: [1, 2], Mace: [1, 2], Sword: [1, 2], Polearm: [2] }, ranged: [], relic: "Libram", shield: true, holdable: true },
  hunter: { armor: (lvl) => (lvl >= 40 ? "Mail" : "Leather"), weapons: { Axe: [1, 2], Sword: [1, 2], Dagger: [1], "Fist Weapon": [1], Polearm: [2], Staff: [2] }, ranged: ALL_RANGED, dual: true },
  rogue: { armor: () => "Leather", weapons: { Dagger: [1], "Fist Weapon": [1], Mace: [1], Sword: [1] }, ranged: ALL_RANGED, dual: true },
  priest: { armor: () => "Cloth", weapons: { Dagger: [1], Mace: [1], Staff: [2] }, ranged: ["Wand"], holdable: true },
  shaman: { armor: (lvl) => (lvl >= 40 ? "Mail" : "Leather"), weapons: { Axe: [1, 2], Mace: [1, 2], Dagger: [1], "Fist Weapon": [1], Staff: [2] }, ranged: [], relic: "Totem", shield: true, holdable: true },
  mage: { armor: () => "Cloth", weapons: { Dagger: [1], Sword: [1], Staff: [2] }, ranged: ["Wand"], holdable: true },
  warlock: { armor: () => "Cloth", weapons: { Dagger: [1], Sword: [1], Staff: [2] }, ranged: ["Wand"], holdable: true },
  druid: { armor: () => "Leather", weapons: { Dagger: [1], "Fist Weapon": [1], Mace: [1, 2], Staff: [2] }, ranged: [], relic: "Idol", holdable: true },
};

const ARMOR_SLOTS = { HEAD: ["HEAD"], SHOULDER: ["SHOULDER"], CHEST: ["CHEST", "ROBE"], WAIST: ["WAIST"], LEGS: ["LEGS"], FEET: ["FEET"], WRIST: ["WRIST"], HANDS: ["HAND"] };
const JEWELRY = { NECK: ["NECK"], FINGER: ["FINGER"], TRINKET: ["TRINKET"] };
const ONE_HAND = ["WEAPON", "WEAPONMAINHAND", "WEAPONOFFHAND"];

/** Can this class (at this level) use the item in this slot? info: items-file entry (see pipeline/run.js) */
function fits(slot, info, cls, level, equippedInv) {
  const sub = info[8], inv = info[9], itemClass = info[5];
  const rules = CLASSES[cls];
  if (!rules || !inv) return false;
  if (ARMOR_SLOTS[slot]) return itemClass === "Armor" && ARMOR_SLOTS[slot].includes(inv) && sub === rules.armor(level);
  if (JEWELRY[slot]) return JEWELRY[slot].includes(inv);
  if (slot === "BACK") return inv === "CLOAK";
  const weapon = () => {
    if (itemClass !== "Weapon" || !rules.weapons[sub]) return 0;
    const hands = inv === "TWOHWEAPON" ? 2 : ONE_HAND.includes(inv) ? 1 : 0;
    return hands && rules.weapons[sub].includes(hands) ? hands : 0;
  };
  if (slot === "MAIN_HAND") {
    const h = weapon();
    if (!h || inv === "WEAPONOFFHAND") return false;
    // like for like: a two-hander for a two-hander, a one-hander for a one-hander; either for an empty hand
    if (equippedInv === "TWOHWEAPON") return h === 2;
    if (equippedInv) return h === 1;
    return true;
  }
  if (slot === "OFF_HAND") {
    if (equippedInv === "SHIELD" || (!equippedInv && rules.shield)) { if (inv === "SHIELD") return !!rules.shield; }
    if (equippedInv === "HOLDABLE" || (!equippedInv && rules.holdable)) { if (inv === "HOLDABLE") return !!rules.holdable; }
    if (rules.dual && (!equippedInv || ONE_HAND.includes(equippedInv))) return weapon() === 1 && inv !== "WEAPONMAINHAND";
    return false;
  }
  if (slot === "RANGED") {
    if (inv === "RELIC") return !!rules.relic && sub === rules.relic;
    return ["RANGED", "RANGEDRIGHT", "THROWN"].includes(inv) && rules.ranged.includes(sub);
  }
  return false;
}

// The slots we look at, with the character-sheet slots they cover (rings and trinkets come in pairs:
// an upgrade must beat the weaker of the two)
/** @type {[string, string[]][]} */
const SLOTS = [
  ["HEAD", ["HEAD"]], ["NECK", ["NECK"]], ["SHOULDER", ["SHOULDER"]], ["BACK", ["BACK"]], ["CHEST", ["CHEST"]],
  ["WRIST", ["WRIST"]], ["HANDS", ["HANDS"]], ["WAIST", ["WAIST"]], ["LEGS", ["LEGS"]], ["FEET", ["FEET"]],
  ["FINGER", ["FINGER_1", "FINGER_2"]], ["TRINKET", ["TRINKET_1", "TRINKET_2"]],
  ["MAIN_HAND", ["MAIN_HAND"]], ["OFF_HAND", ["OFF_HAND"]], ["RANGED", ["RANGED"]],
];

// character: { level, class }   gear: [{ slotType, id, level }]   items: items file (id → entry)
// houses: [{ id, faction, items: { itemId: [min, market, qty, ...] } }]  (their faction's AH and Blackwater)
// opts.maxPrice: copper (null = any), opts.perSlot: how many to show per slot (default 3)
// Returns [{ slot, wearing: { id, level } | null, options: [{ id, level, gain, reqLevel, price, house, quality }] }]
// for every slot that has at least one upgrade; options biggest item-level gain first, then cheapest.
function findUpgrades(character, gear, items, houses, opts = {}) {
  const cls = String(character.class || "").toLowerCase();
  if (!CLASSES[cls]) return [];
  const level = character.level || 1, perSlot = opts.perSlot || 3, maxPrice = opts.maxPrice ?? null;
  const bySlot = {};
  for (const g of gear || []) if (g.slotType) bySlot[g.slotType] = g;
  // a two-hander in the main hand leaves no off hand to fill
  const mainInv = bySlot.MAIN_HAND ? items[bySlot.MAIN_HAND.id]?.[9] || null : null;

  // cheapest listing of each item across the houses you can buy from
  const cheapest = new Map();
  for (const h of houses) for (const [id, p] of Object.entries(h.items)) {
    const c = cheapest.get(id);
    if (!c || p[0] < c.price) cheapest.set(id, { price: p[0], house: h.faction });
  }

  const out = [];
  for (const [slot, sheetSlots] of SLOTS) {
    if (slot === "OFF_HAND" && mainInv === "TWOHWEAPON") continue;
    const worn = sheetSlots.map((s) => bySlot[s]).filter(Boolean);
    // the weaker of a pair; an empty ring or trinket slot counts as nothing worn
    const wearing = worn.length < sheetSlots.length ? null : worn.reduce((a, b) => ((a.level || 0) <= (b.level || 0) ? a : b));
    const baseline = wearing ? wearing.level || 0 : 0;
    const equippedInv = wearing ? items[wearing.id]?.[9] || null : null;
    const wornIds = new Set(worn.map((g) => String(g.id)));
    const options = [];
    for (const [id, c] of cheapest) {
      const info = items[id];
      if (!info || !info[0] || wornIds.has(id)) continue;
      const ilvl = info[11], req = info[10] || 0, quality = info[4];
      if (ilvl == null || ilvl <= baseline || req > level || quality === "poor") continue;
      // real gear past the starting zones has a level requirement; a high item level without one is a
      // gadget or profession item (parachute cloaks, goggles that need Engineering), not an upgrade
      if (req <= 1 && ilvl > 15) continue;
      if (maxPrice != null && c.price > maxPrice) continue;
      if (!fits(slot, info, cls, level, equippedInv)) continue;
      options.push({ id: Number(id), level: ilvl, gain: ilvl - baseline, reqLevel: req, price: c.price, house: c.house, quality });
    }
    if (!options.length) continue;
    options.sort((a, b) => b.level - a.level || a.price - b.price);
    out.push({ slot, wearing: wearing ? { id: wearing.id, level: wearing.level || null } : null, options: options.slice(0, perSlot) });
  }
  return out;
}

export { findUpgrades, fits, CLASSES };
