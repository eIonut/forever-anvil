// Forever Tome — auction price job (Phase 2, M2).
//
// Every run (hourly in production):
//   1. download all auction houses (+ commodities) for the region
//   2. compute per item: min price, market price, quantity, listings  (js/pricemath.js)
//   3. save one "latest prices" file per auction-house group
//   4. look up names + vendor prices for new items (in batches until all are known)
// Once per UTC day (first run of the day):
//   5. add today's point to the 30-day history (per group, 32 shards) and delete older points
//   6. work out price changes (rising/falling) and deals per auction house
// Every 25 days (inside Blizzard's 30-day limit):
//   7. refresh all profession recipes (materials + crafted item) for the craft calculator
//
// Run locally:  node pipeline/run.js            (reads .env, writes to ./out)
// Options:      --region=us   --max-new-items=3000   --force-daily=true   --force-recipes=true
"use strict";
const fs = require("fs");
const path = require("path");
const { createClient, pool } = require("./blizzard");
const { aggregate, updateHistory, pruneHistory, computeMovers, computeFlips, dayNumber, SHARDS } = require("./aggregate");
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

const REFRESH_DAYS = 25;        // refresh API data before the 30-day retention limit
const ITEM_RETRY_404_DAYS = 7;  // items Blizzard doesn't know: ask again weekly

async function main() {
  loadDotEnv();
  const t0 = Date.now();
  const region = (args.region || process.env.REGION || "eu").toLowerCase();
  const maxNewItems = Number(args["max-new-items"] || 3000);
  const api = createClient({ clientId: process.env.BNET_CLIENT_ID, clientSecret: process.env.BNET_CLIENT_SECRET, region });
  const store = localStore(path.join(ROOT, "out"));
  const now = Date.now(), today = dayNumber(now);
  const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

  // item cache (names, vendor prices) is needed during aggregation for vendor flips
  // entry: [name|null, sellPrice|null, dayFetched, buyPrice|null, quality|null, itemClass|null]
  const items = (await store.getJSON(`items:${region}`)) || {};
  const vendorPays = (id) => (items[id] && items[id][1]) || null;

  /* 1–3: latest prices per group (+ vendor flips per house) */
  const seenItems = new Set();
  const latestByGroup = {};
  for (const g of GROUPS) {
    const groupOut = { v: 1, region, group: g.id, ruleset: (g.ruleset && g.ruleset[region]) || null, updated: new Date(now).toISOString(), houses: {} };
    let groupListings = 0;
    for (const [faction, houseId] of Object.entries(g.houses)) {
      const listings = [];
      for (const suffix of ["", "/commodities"]) {
        const r = await api.get(`/data/wow/ruleset/${AUCTION_RULESET}/auctions/${houseId}${suffix}`, api.ns.dynamic);
        if (r.status !== 200) throw new Error(`House ${houseId}${suffix}: HTTP ${r.status}`);
        for (const a of (r.json && r.json.auctions) || []) listings.push(a);
      }
      const houseItems = aggregate(listings);
      Object.keys(houseItems).forEach((id) => seenItems.add(Number(id)));
      groupOut.houses[houseId] = { faction, listings: listings.length, items: houseItems, flips: computeFlips(listings, vendorPays) };
      groupListings += listings.length;
    }
    if (!groupListings) { log(`Group ${g.id}: empty, skipped`); continue; }
    const bytes = await store.putJSON(`prices:${region}:${g.id}`, groupOut);
    latestByGroup[g.id] = groupOut;
    log(`Group ${g.id}: ${groupListings} listings → ${(bytes / 1024).toFixed(0)} KB`);
  }

  /* 7 (first, so its reagents get vendor prices below): recipes every 25 days */
  let recipes = await store.getJSON(`recipes:${region}`);
  if (!recipes || today - recipes.day >= REFRESH_DAYS || args["force-recipes"] === "true") {
    recipes = await fetchRecipes(api, today, log);
    await store.putJSON(`recipes:${region}`, recipes);
  }
  const reagentIds = new Set();
  for (const p of recipes.professions) for (const r of p.recipes) { for (const x of r[6]) reagentIds.add(x[0]); if (r[3]) reagentIds.add(r[3]); }

  /* 4: item names, vendor prices, quality and type (for item pages) */
  let changed = false;
  for (const id of Object.keys(items)) if (today - items[id][2] >= 30) { delete items[id]; changed = true; } // never keep > 30 days
  const wanted = new Set([...seenItems, ...reagentIds]);
  const todo = [...wanted].filter((id) => {
    const e = items[id];
    if (!e || (e[0] != null && e.length < 6)) return true; // older entries lack quality/type
    const age = today - e[2];
    return e[0] == null ? age >= ITEM_RETRY_404_DAYS : age >= REFRESH_DAYS;
  }).slice(0, maxNewItems);
  if (todo.length) {
    let found = 0;
    await pool(todo, 10, async (id) => {
      const r = await api.get(`/data/wow/item/${id}`, api.ns.static, { retries: 2 });
      if (r.status === 200 && r.json) {
        const j = r.json;
        items[id] = [j.name || null, j.sell_price ?? null, today, j.purchase_price ?? null,
          j.quality && j.quality.type ? j.quality.type.toLowerCase() : null, j.item_class && j.item_class.name ? j.item_class.name : null];
        found++;
      } else if (r.status === 404) items[id] = [null, null, today, null, null, null];
    });
    changed = true;
    log(`Item names: looked up ${todo.length}, found ${found}; ${Object.keys(items).length} cached`);
  }
  if (changed) await store.putJSON(`items:${region}`, items);

  /* 5–6: history + movers, once per day */
  const meta = (await store.getJSON(`meta:${region}`)) || {};
  if (meta.historyDay !== today || args["force-daily"] === "true") {
    for (const g of Object.values(latestByGroup)) {
      const merged = {}; // houseId → itemId → points (all shards), for movers
      for (let shard = 0; shard < SHARDS; shard++) {
        const key = `history:${region}:${g.group}:${shard}`;
        const hist = (await store.getJSON(key)) || {};
        for (const [houseId, h] of Object.entries(g.houses)) updateHistory(hist, houseId, h.items, shard, now);
        pruneHistory(hist, now);
        await store.putJSON(key, hist);
        for (const houseId of Object.keys(hist)) Object.assign(merged[houseId] || (merged[houseId] = {}), hist[houseId]);
      }
      const movers = { v: 1, region, group: g.group, updated: new Date(now).toISOString(), houses: {} };
      for (const [houseId, h] of Object.entries(g.houses)) movers.houses[houseId] = computeMovers(merged[houseId] || {}, h.items, today);
      await store.putJSON(`movers:${region}:${g.group}`, movers);
    }
    meta.historyDay = today;
    log(`History + price changes updated for ${Object.keys(latestByGroup).length} groups (30-day window)`);
  }

  // drop the old single-file history layout from earlier versions
  if (store.remove) for (let s = 0; s < SHARDS; s++) await store.remove(`history:${region}:${s}`);

  meta.lastRun = new Date(now).toISOString();
  meta.groups = Object.keys(latestByGroup);
  // confirmed ruleset names per group, so the site can label its group picker up front
  meta.rulesets = {};
  for (const g of GROUPS) if (latestByGroup[g.id] && g.ruleset && g.ruleset[region]) meta.rulesets[g.id] = g.ruleset[region];
  meta.recipesDay = recipes.day;
  await store.putJSON(`meta:${region}`, meta);

  log(`Done. API calls: ${api.callCount()}, store writes: ${store.writeCount()}, items seen: ${seenItems.size}`);
}

// Every profession → skill tiers → categories → recipe details.
// Saved as { day, professions: [{ id, name, recipes: [[id, name, category, craftedItemId|null, craftedName, craftedQty, [[reagentId, qty, reagentName], ...]]] }] }
async function fetchRecipes(api, today, log) {
  const idx = await api.get("/data/wow/profession/index", api.ns.static);
  if (idx.status !== 200) throw new Error("Profession index: HTTP " + idx.status);
  const professions = [];
  const jobs = [];
  for (const p of idx.json.professions || []) {
    if (/\[DNT\]|test/i.test(p.name)) continue;
    const det = await api.get(`/data/wow/profession/${p.id}`, api.ns.static);
    const prof = { id: p.id, name: p.name, recipes: [] };
    professions.push(prof);
    for (const tier of (det.json && det.json.skill_tiers) || []) {
      const st = await api.get(`/data/wow/profession/${p.id}/skill-tier/${tier.id}`, api.ns.static);
      for (const c of (st.json && st.json.categories) || []) for (const r of c.recipes || []) jobs.push({ prof, id: r.id, category: c.name });
    }
  }
  await pool(jobs, 10, async (j) => {
    const r = await api.get(`/data/wow/recipe/${j.id}`, api.ns.static, { retries: 2 });
    if (r.status !== 200 || !r.json) return;
    const d = r.json, cq = d.crafted_quantity || {};
    const qty = cq.value != null ? cq.value : (cq.minimum != null && cq.maximum != null ? (cq.minimum + cq.maximum) / 2 : 1);
    j.prof.recipes.push([d.id, d.name, j.category, d.crafted_item ? d.crafted_item.id : null, d.crafted_item ? d.crafted_item.name : null, qty,
      (d.reagents || []).map((x) => [x.reagent.id, x.quantity, x.reagent.name])]);
  });
  for (const p of professions) p.recipes.sort((a, b) => a[1].localeCompare(b[1]));
  const total = professions.reduce((s, p) => s + p.recipes.length, 0);
  log(`Recipes: ${total} across ${professions.filter((p) => p.recipes.length).length} professions`);
  return { day: today, professions };
}

main().catch((e) => { console.error("Price job failed: " + e.message); process.exit(1); });
