// Line icons for the menu, page banners, buttons and stat tiles: Lucide (https://lucide.dev),
// copied from lucide-static v1.70.0 and inlined so there is no runtime dependency.
// Lucide is ISC-licensed: Copyright (c) Lucide Contributors; parts (c) Cole Bemis (Feather, MIT).
//
// Every icon is drawn on a 24×24 grid as plain strokes; the <svg> wrapper (src/components/Icon.astro,
// src/tools/Icon.svelte) sets fill="none", stroke="currentColor" and the stroke width, so icons take
// the colour of the text around them. Use them with <Icon name="prices" /> and always next to a text label.

export const ICONS = {
  // lucide: house
  home: `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  // lucide: coins
  prices: `<path d="M13.744 17.736a6 6 0 1 1-7.48-7.48"/><path d="M15 6h1v4"/><path d="m6.134 14.768.866-.5 2 3.464"/><circle cx="16" cy="8" r="6"/>`,
  // lucide: chart-line
  economy: `<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>`,
  // lucide: arrow-left-right
  flips: `<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>`,
  // lucide: package
  items: `<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>`,
  // lucide: archive
  crates: `<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>`,
  // lucide: trending-up
  leveling: `<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>`,
  // lucide: circle-arrow-up
  upgrades: `<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>`,
  // lucide: chevron-down (dropdown menus)
  chevron: `<path d="m6 9 6 6 6-6"/>`,
  // lucide: hammer
  crafting: `<path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>`,
  // lucide: clipboard-list
  planner: `<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`,
  // lucide: book-open-text
  recipes: `<path d="M12 5v16"/><path d="M16 13h2"/><path d="M16 9h2"/><path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"/><path d="M6 13h2"/><path d="M6 9h2"/>`,
  // lucide: network
  talents: `<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>`,
  // lucide: user-round
  character: `<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>`,
  // lucide: book-open
  guides: `<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`,
  // lucide: info
  about: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
  // lucide: shield-check
  privacy: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  // lucide: clock
  clock: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  // lucide: globe
  globe: `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`,
  // lucide: lock
  lock: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  // lucide: link
  link: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
  // lucide: database
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>`,
  // lucide: arrow-right
  arrow: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  // lucide: sliders-horizontal (display settings button)
  settings: `<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>`,
  // lucide: menu
  menu: `<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>`,
  // lucide: copy (copy an item's name for the in-game Auction House search)
  copy: `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
  // lucide: check
  check: `<path d="M20 6 9 17l-5-5"/>`,
  // lucide: download (the addon's download buttons)
  download: `<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>`,
  // lucide: star (filled in CSS when an item is on the watchlist)
  star: `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
  // lucide: x
  close: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  // lucide: sparkles (disenchanting)
  disenchant: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
} as const;

export type IconName = keyof typeof ICONS;

// WoW-style icons: Blizzard's own game icons, saved from Blizzard's icon CDN
// (render.worldofwarcraft.com/eu/icons/56/<icon name>.jpg) into public/img/wow/<key>.jpg.
// Icon.astro / Icon.svelte show one of these instead of the line icon whenever the name is listed here,
// so the menu, page banners, home cards and stat tiles look like the game's own buttons.
// The comment after each entry is the in-game icon name, for swapping it later.
export const WOW_ICONS = {
  prices: "/img/wow/prices.jpg",       // inv_misc_coin_01: pile of gold coins
  // My watchlist (menu, page banner, home card). The star buttons next to item names pass `line`,
  // so they keep the line star.
  star: "/img/wow/watchlist.jpg",      // inv_misc_spyglass_02: brass spyglass (keeping an eye on prices)
  economy: "/img/wow/economy.jpg",     // inv_misc_bag_10: coin sack
  flips: "/img/wow/flips.jpg",         // inv_misc_coin_17: a single gold coin (flip it)
  items: "/img/wow/items.jpg",         // inv_misc_bag_07: leather bag
  crates: "/img/wow/crates.jpg",       // icon file 236994: open wooden crate (the Waylaid Crates' own icon)
  crafting: "/img/wow/crafting.jpg",
  leveling: "/img/wow/leveling.jpg",
  upgrades: "/img/wow/upgrades.jpg",   // inv_chest_plate16: golden breastplate (gear upgrades)   // inv_misc_book_11: blue skill book (profession leveling)   // trade_blacksmithing: anvil
  planner: "/img/wow/planner.jpg",     // inv_misc_note_01: sealed note (shopping list)
  recipes: "/img/wow/recipes.jpg",     // inv_scroll_03: recipe scroll
  talents: "/img/wow/talents.jpg",     // ability_marksmanship: arrow in the bullseye
  character: "/img/wow/character.jpg", // inv_helmet_01: helm
  pvp: "/img/wow/pvp.jpg",             // ability_dualwield: two crossed swords
  normal: "/img/wow/normal.jpg",       // spell_holy_devotionaura: shield (Normal = PvE)
  roleplay: "/img/wow/roleplay.jpg",   // ability_rogue_disguise: mask (Roleplay)
  alliance: "/img/wow/alliance.jpg",   // pvpcurrency-honor-alliance: Alliance lion crest
  horde: "/img/wow/horde.jpg",         // pvpcurrency-honor-horde: Horde crest
  neutral: "/img/wow/neutral.jpg",     // achievement_goblinhead: goblin (Blackwater neutral AH)
  disenchant: "/img/wow/prof-333.jpg", // trade_engraving: Enchanting (Disenchant flips)
  // professions, keyed by Blizzard's profession (skill line) id, for the Crafting picker
  "prof-171": "/img/wow/prof-171.jpg", // trade_alchemy: Alchemy
  "prof-164": "/img/wow/prof-164.jpg", // trade_blacksmithing: Blacksmithing
  "prof-185": "/img/wow/prof-185.jpg", // inv_misc_food_15: Cooking
  "prof-333": "/img/wow/prof-333.jpg", // trade_engraving: Enchanting
  "prof-202": "/img/wow/prof-202.jpg", // trade_engineering: Engineering
  "prof-129": "/img/wow/prof-129.jpg", // spell_holy_sealofsacrifice: First Aid
  "prof-356": "/img/wow/prof-356.jpg", // trade_fishing: Fishing
  "prof-182": "/img/wow/prof-182.jpg", // trade_herbalism: Herbalism
  "prof-165": "/img/wow/prof-165.jpg", // inv_misc_armorkit_17: Leatherworking
  "prof-186": "/img/wow/prof-186.jpg", // trade_mining: Mining
  "prof-393": "/img/wow/prof-393.jpg", // inv_misc_pelt_wolf_01: Skinning
  "prof-197": "/img/wow/prof-197.jpg", // trade_tailoring: Tailoring
} as const;

export type WowIconName = keyof typeof WOW_ICONS;
/** any name Icon accepts */
export type AnyIconName = IconName | WowIconName;
/** the WoW icon image for a name, if it has one */
export const wowIcon = (name: string): string | undefined => (WOW_ICONS as Record<string, string>)[name];

/** The ruleset icon for a server-group label: PvP and RP-PvP get the swords, Normal the shield, Roleplay the mask; null while unconfirmed. */
export function rulesetIcon(label: string): WowIconName | null {
  if (/pvp/i.test(label)) return "pvp";
  if (/normal|pve/i.test(label)) return "normal";
  if (/roleplay|^rp$/i.test(label)) return "roleplay";
  return null;
}

/** The icon for a profession id (e.g. 171 = Alchemy), or null when there isn't one. */
export function professionIcon(id: number | string): WowIconName | null {
  const key = "prof-" + id;
  return key in WOW_ICONS ? (key as WowIconName) : null;
}
