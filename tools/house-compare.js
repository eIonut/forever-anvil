// Forever Anvil: compare a few item prices across the five auction-house groups,
// so we can work out which group belongs to which ruleset (the API doesn't say).
//
// Run:  node tools/house-compare.js            (uses REGION from .env)
// Prints a table only; nothing is saved. Secret/token are never printed.

import fs from "node:fs";
import path from "node:path";

const env = {};
for (const line of fs.readFileSync(path.join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const REGION = (env.REGION || "eu").toLowerCase();
const API = `https://${REGION}.api.blizzard.com`;
const NS = `dynamic-forever-${REGION}`;

// Groups seen in the probe: [Alliance, Horde, Blackwater]
const GROUPS = { A: [110, 113, 116], B: [111, 114, 117], C: [119, 120, 121], D: [123, 124, 125] };
// Common trade goods (classic item IDs; names are confirmed against the API below)
const ITEMS = [2589, 2592, 2770, 2771, 2447, 765, 2318, 2835];

async function main() {
  const tok = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.BNET_CLIENT_ID}:${env.BNET_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  }).then((r) => { if (!r.ok) throw new Error("token HTTP " + r.status); return r.json(); });
  const H = { Authorization: `Bearer ${tok.access_token}` };
  const get = (p, ns) => fetch(`${API}${p}${p.includes("?") ? "&" : "?"}namespace=${ns}&locale=en_US`, { headers: H })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // item names
  const names = {};
  for (const id of ITEMS) {
    const it = await get(`/data/wow/item/${id}`, `static-forever-${REGION}`);
    names[id] = it ? it.name : `Item #${id}`;
  }

  // lowest price per unit (copper) for our items in one house: regular + commodity listings
  async function lowest(house) {
    const best = {};
    for (const suffix of ["", "/commodities"]) {
      const data = await get(`/data/wow/ruleset/1/auctions/${house}${suffix}`, NS);
      for (const a of (data && data.auctions) || []) {
        const id = a.item && a.item.id;
        if (!ITEMS.includes(id)) continue;
        const unit = a.unit_price != null ? a.unit_price : (a.buyout != null && a.quantity ? a.buyout / a.quantity : null);
        if (unit == null) continue;
        if (best[id] == null || unit < best[id]) best[id] = unit;
      }
    }
    return best;
  }
  const money = (c) => {
    if (c == null) return "-";
    c = Math.round(c);
    const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cu = c % 100;
    return (g ? g + "g " : "") + (g || s ? s + "s " : "") + cu + "c";
  };

  for (const [fi, faction] of [[0, "Alliance"], [1, "Horde"]]) {
    const res = {};
    for (const [g, houses] of Object.entries(GROUPS)) res[g] = await lowest(houses[fi]);
    console.log(`\n${faction}: lowest price per unit (${REGION.toUpperCase()})`);
    console.log(["Item", ...Object.keys(GROUPS).map((g) => `Group ${g} (${GROUPS[g][fi]})`)].join(" | "));
    for (const id of ITEMS) console.log([names[id], ...Object.keys(GROUPS).map((g) => money(res[g][id]))].join(" | "));
  }
  console.log(`\nChecked at ${new Date().toISOString()}`);
}
main().catch((e) => { console.error("Failed: " + e.message); process.exit(1); });
