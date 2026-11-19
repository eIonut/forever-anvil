// Item filters for the Auction House prices page: category (Blizzard's item class), type (subclass),
// equip slot, weapon hands and quality. The item cache (items_<region>.json) holds what they need:
// [5] item class, [4] quality, [8] subclass, [9] inventory type (see pipeline/run.js).

/** Category chips, in menu order. Classes not listed here (Quest, Key, Reagent…) and unknown items go under "Other". */
export const CATEGORIES: { value: string; label: string; classes: string[] }[] = [
  { value: "weapon", label: "Weapons", classes: ["Weapon"] },
  { value: "armor", label: "Armor", classes: ["Armor"] },
  { value: "consumable", label: "Consumables", classes: ["Consumable"] },
  { value: "trade", label: "Trade goods", classes: ["Trade Goods"] },
  { value: "recipe", label: "Recipes", classes: ["Recipe"] },
  { value: "container", label: "Bags & quivers", classes: ["Container", "Quiver"] },
  { value: "projectile", label: "Ammo", classes: ["Projectile"] },
  { value: "other", label: "Other", classes: [] },
];

const BY_CLASS = new Map(CATEGORIES.flatMap((c) => c.classes.map((k) => [k, c.value] as const)));

/** the category value for an item class name */
export const categoryOf = (itemClass: string | null | undefined): string => (itemClass && BY_CLASS.get(itemClass)) || "other";

/** Equip slots, keyed by Blizzard's inventory type code. Robes count as chest. */
export const SLOTS: Record<string, string> = {
  HEAD: "Head", NECK: "Neck", SHOULDER: "Shoulder", CLOAK: "Back", CHEST: "Chest", ROBE: "Chest",
  BODY: "Shirt", TABARD: "Tabard", WRIST: "Wrist", HAND: "Hands", WAIST: "Waist", LEGS: "Legs", FEET: "Feet",
  FINGER: "Finger", TRINKET: "Trinket", SHIELD: "Shield", HOLDABLE: "Held in off-hand", RELIC: "Relic",
  WEAPON: "One-hand", WEAPONMAINHAND: "Main hand", WEAPONOFFHAND: "Off hand", TWOHWEAPON: "Two-hand",
  RANGED: "Ranged", RANGEDRIGHT: "Ranged", THROWN: "Thrown",
};
/** slot menu order */
export const SLOT_ORDER = ["Head", "Neck", "Shoulder", "Back", "Chest", "Shirt", "Tabard", "Wrist", "Hands", "Waist", "Legs", "Feet", "Finger", "Trinket", "Shield", "Held in off-hand", "Relic"];

/** How a weapon is held, from its inventory type. */
export const HANDS: { value: string; label: string; types: string[] }[] = [
  { value: "1h", label: "One-handed", types: ["WEAPON", "WEAPONMAINHAND", "WEAPONOFFHAND"] },
  { value: "2h", label: "Two-handed", types: ["TWOHWEAPON"] },
  { value: "ranged", label: "Ranged", types: ["RANGED", "RANGEDRIGHT", "THROWN"] },
];
export const handsOf = (invType: string | null | undefined): string | null =>
  (invType && HANDS.find((h) => h.types.includes(invType))?.value) || null;

/** Item qualities, lowest first, as the item cache spells them. */
export const QUALITIES: { value: string; label: string }[] = [
  { value: "poor", label: "Poor" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

export interface ItemFilter {
  /** category value, "" = all */
  cat: string;
  /** subclass name, "" = any */
  sub: string;
  /** slot label (armor), "" = any */
  slot: string;
  /** hands value (weapons), "" = any */
  hands: string;
  /** lowest quality, "" = any */
  minQuality: string;
  /** required level range, inclusive; null = no limit */
  minLevel: number | null;
  maxLevel: number | null;
}

export const NO_FILTER: ItemFilter = { cat: "", sub: "", slot: "", hands: "", minQuality: "", minLevel: null, maxLevel: null };

/** highest character level in WoW: Forever */
export const MAX_LEVEL = 60;

/** what an item is, for filtering. req: the level needed to use it (0 = any level; null = not known yet) */
export interface ItemKind { cat: string; sub: string | null; slot: string | null; hands: string | null; quality: number; req: number | null }

export function kindOf(info: readonly unknown[] | undefined): ItemKind {
  const cls = info?.[5] as string | null | undefined, inv = info?.[9] as string | null | undefined;
  return {
    cat: categoryOf(cls),
    sub: (info?.[8] as string | null | undefined) || null,
    slot: (inv && SLOTS[inv]) || null,
    hands: handsOf(inv),
    quality: QUALITIES.findIndex((q) => q.value === info?.[4]),
    req: typeof info?.[10] === "number" ? (info[10] as number) : null,
  };
}

/** a level range is set (either end) */
export const hasLevel = (f: ItemFilter) => f.minLevel != null || f.maxLevel != null;

export function matches(k: ItemKind, f: ItemFilter): boolean {
  if (f.cat && k.cat !== f.cat) return false;
  if (f.sub && k.sub !== f.sub) return false;
  if (f.slot && k.slot !== f.slot) return false;
  if (f.hands && k.hands !== f.hands) return false;
  if (f.minQuality && k.quality < QUALITIES.findIndex((q) => q.value === f.minQuality)) return false;
  if (hasLevel(f)) {
    // items with no level requirement (most trade goods) count as level 1;
    // items whose level isn't known yet are left out while a range is set
    if (k.req == null) return false;
    const lvl = Math.max(1, k.req);
    if (f.minLevel != null && lvl < f.minLevel) return false;
    if (f.maxLevel != null && lvl > f.maxLevel) return false;
  }
  return true;
}

export const isFiltered = (f: ItemFilter) => !!(f.cat || f.sub || f.slot || f.hands || f.minQuality || hasLevel(f));
