// Forever Tome — auction price job (Phase 2, M2).
//
// Every run (hourly in production):
//   1. download all auction houses (+ commodities) for the region
//   2. compute per item: min price, market price, quantity, listings  (aggregate.js)
//   3. save one "latest prices" file per auction-house group
// Once per UTC day (first run of the day):
//   4. add today's point to the 30-day history (32 shards) and delete anything older
//   5. look up names + vendor prices for new items, refresh names older than 25 days
//
// Run locally:  node pipeline/run.js            (reads .env, writes to ./out)
// Options:      --region=us   --max-new-items=3000
"use strict";
const fs = require("fs");
const path = require("path");
const { createClient, pool } = require("./blizzard");
const { aggregate, updateHistory, pruneHistory, dayNumber, SHARDS } = require("./aggregate");
const { GROUPS, AUCTION_RULESET } = require("./houses");
const { localStore } = require("./store");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));

function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ITEM_REFRESH_DAYS = 25; // refresh names before the 30-day retention limit
const ITEM_RETRY_404_DAYS = 7; // items Blizzard doesn't know: ask again weekly

async function main() {
  loadDotEnv();
  const t0 = Date.now();
  const region = (args.region || process.env.REGION || "eu").toLowerCase();
  const maxNewItems = Number(args["max-new-items"] || 3000);
  const api = createClient({ clientId: process.env.BNET_CLIENT_ID, clientSecret: process.env.BNET_CLIENT_SECRET, region });
  const store = localStore(path.join(ROOT, "out"));
  const now = Date.now(), today = dayNumber(now);
  const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

  // 1–3: latest prices per group
  const seenItems = new Set();
  const latestByGroup = {};
  for (const g of GROUPS) {
    const groupOut = { v: 1, region, group: g.id, ruleset: g.ruleset, updated: new Date(now).toISOString(), houses: {} };
    let groupListings = 0;
    for (const [faction, houseId] of Object.entries(g.houses)) {
      const listings = [];
      for (const suffix of ["", "/commodities"]) {
        const r = await api.get(`/data/wow/ruleset/${AUCTION_RULESET}/auctions/${houseId}${suffix}`, api.ns.dynamic);
        if (r.status !== 200) throw new Error(`House ${houseId}${suffix}: HTTP ${r.status}`);
        for (const a of (r.json && r.json.auctions) || []) listings.push(a);
      }
      const items = aggregate(listings);
      Object.keys(items).forEach((id) => seenItems.add(Number(id)));
      groupOut.houses[houseId] = { faction, listings: listings.length, items };
      groupListings += listings.length;
    }
    if (!groupListings) { log(`Group ${g.id}: empty, skipped`); continue; }
    const bytes = await store.putJSON(`prices:${region}:${g.id}`, groupOut);
    latestByGroup[g.id] = groupOut;
    log(`Group ${g.id}: ${groupListings} listings → ${(bytes / 1024).toFixed(0)} KB`);
  }

  // 4: history — once per UTC day
  const meta = (await store.getJSON(`meta:${region}`)) || {};
  if (meta.historyDay !== today || args["force-daily"] === "true") {
    for (let shard = 0; shard < SHARDS; shard++) {
      const key = `history:${region}:${shard}`;
      const hist = (await store.getJSON(key)) || {};
      for (const g of Object.values(latestByGroup))
        for (const [houseId, h] of Object.entries(g.houses)) updateHistory(hist, houseId, h.items, shard, now);
      pruneHistory(hist, now);
      await store.putJSON(key, hist);
    }
    meta.historyDay = today;
    log(`History: today's point saved (${SHARDS} shards, 30-day window)`);
  }

  // 5: item names + vendor prices — every run, in batches, until every item is known.
  //    { [id]: [name|null, sellPrice|null, dayFetched] }; saved only when something changed.
  const items = (await store.getJSON(`items:${region}`)) || {};
  let changed = false;
  for (const id of Object.keys(items)) if (today - items[id][2] >= 30) { delete items[id]; changed = true; } // never keep > 30 days
  const todo = [...seenItems].filter((id) => {
    const e = items[id];
    if (!e) return true;
    const age = today - e[2];
    return e[0] == null ? age >= ITEM_RETRY_404_DAYS : age >= ITEM_REFRESH_DAYS;
  }).slice(0, maxNewItems);
  if (todo.length) {
    let found = 0;
    await pool(todo, 10, async (id) => {
      const r = await api.get(`/data/wow/item/${id}`, api.ns.static, { retries: 2 });
      if (r.status === 200 && r.json) { items[id] = [r.json.name || null, r.json.sell_price ?? null, today]; found++; }
      else if (r.status === 404) items[id] = [null, null, today];
    });
    changed = true;
    log(`Item names: looked up ${todo.length}, found ${found}; ${Object.keys(items).length} cached`);
  }
  if (changed) await store.putJSON(`items:${region}`, items);
  meta.lastRun = new Date(now).toISOString();
  meta.groups = Object.keys(latestByGroup);
  await store.putJSON(`meta:${region}`, meta);

  log(`Done. API calls: ${api.callCount()}, store writes: ${store.writeCount()}, items seen: ${seenItems.size}`);
}

main().catch((e) => { console.error("Price job failed: " + e.message); process.exit(1); });
