// Auction house groups for WoW: Forever, found with tools/probe.js (EU, 2026-11-18).
// Each group = one ruleset's three auction houses: Alliance, Horde, Blackwater (neutral).
// The API does NOT say which ruleset a group belongs to. `ruleset` maps region → name and is
// filled in only after an in-game price check (tools/house-compare.js); unconfirmed regions
// show the group letter instead. Mappings may differ between regions, so confirm each one.
//
// Confirmed:
//   EU  A = PvP   (2026-11-19, Horde AH: Peacebloom, Silverleaf, Copper Ore, Light Leather
//                  all matched group A within a few copper; every other group was 2–4× off)
//   EU  B = Normal (2026-11-19, Horde AH: Rough Stone 8c and Peacebloom 40c matched B exactly,
//                  Copper Ore and Wool Cloth within ~20c; C and D were far off on Rough Stone)
//   EU  C = Roleplay (2026-11-19, Horde AH: Copper Ore 99c, Stonescale Oil 3s 99c and Vision Dust
//                  35s 9c matched C (D: 2s, 14s 99c, 12s 50c); Thick Leather 16s 59c and
//                  Stonescale Eel 1s were far closer to C than to D)
//   EU  D = RP-PvP (2026-11-19, by elimination, not price-checked: EU has four rulesets, and PvP,
//                  Normal and Roleplay are A, B and C; E is empty. Check in game if prices ever look off)

const GROUPS = [
  { id: "A", houses: { alliance: 110, horde: 113, neutral: 116 }, ruleset: { eu: "PvP" }, note: "large" },
  { id: "B", houses: { alliance: 111, horde: 114, neutral: 117 }, ruleset: { eu: "Normal" }, note: "large" },
  { id: "E", houses: { alliance: 112, horde: 115, neutral: 118 }, ruleset: {}, note: "empty — probably Hardcore (not launched)" },
  { id: "C", houses: { alliance: 119, horde: 120, neutral: 121 }, ruleset: { eu: "Roleplay" }, note: "small" },
  { id: "D", houses: { alliance: 123, horde: 124, neutral: 125 }, ruleset: { eu: "RP-PvP" }, note: "small" }
];

// Any ruleset ID works in the auction URL (it doesn't filter); 1 exists in every region.
const AUCTION_RULESET = 1;

function allHouses() {
  const list = [];
  for (const g of GROUPS) for (const [faction, id] of Object.entries(g.houses)) list.push({ id, faction, group: g.id });
  return list;
}

export { GROUPS, AUCTION_RULESET, allHouses };
