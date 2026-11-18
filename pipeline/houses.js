// Auction house groups for WoW: Forever, found with tools/probe.js (EU, 2026-11-18).
// Each group = one ruleset's three auction houses: Alliance, Horde, Blackwater (neutral).
// The API does NOT say which ruleset a group belongs to; `ruleset` stays null until we confirm
// it with an in-game price check (tools/house-compare.js). Only groups with a confirmed
// ruleset will be shown publicly with a ruleset name.
"use strict";

const GROUPS = [
  { id: "A", houses: { alliance: 110, horde: 113, neutral: 116 }, ruleset: null, note: "large" },
  { id: "B", houses: { alliance: 111, horde: 114, neutral: 117 }, ruleset: null, note: "large" },
  { id: "E", houses: { alliance: 112, horde: 115, neutral: 118 }, ruleset: null, note: "empty — probably Hardcore (not launched)" },
  { id: "C", houses: { alliance: 119, horde: 120, neutral: 121 }, ruleset: null, note: "small" },
  { id: "D", houses: { alliance: 123, horde: 124, neutral: 125 }, ruleset: null, note: "small" }
];

// Any ruleset ID works in the auction URL (it doesn't filter); 1 exists in every region.
const AUCTION_RULESET = 1;

function allHouses() {
  const list = [];
  for (const g of GROUPS) for (const [faction, id] of Object.entries(g.houses)) list.push({ id, faction, group: g.id });
  return list;
}

module.exports = { GROUPS, AUCTION_RULESET, allHouses };
