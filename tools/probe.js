// Forever Tome: Blizzard API probe for WoW: Forever (Phase 2, milestone M1)
//
// What it does: asks Blizzard's API which WoW: Forever data exists and writes a
// readable report to tools/probe-report.md. It changes nothing anywhere.
//
// Run:   node tools/probe.js
// Needs: a .env file in the project folder (copy .env.example) with your client ID/secret.
//
// Safety: your secret and access token are never printed or written to the report.
// The report contains game data only and is git-ignored (API terms: keep data ≤ 30 days).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const REPORT = path.join(import.meta.dirname, "probe-report.md");

/* ---------- config ---------- */
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) {
    console.error("No .env file found. Copy .env.example to .env and fill in your Battle.net client ID and secret.");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  if (!env.BNET_CLIENT_ID || !env.BNET_CLIENT_SECRET) {
    console.error("BNET_CLIENT_ID and BNET_CLIENT_SECRET must both be set in .env.");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const REGION = (env.REGION || "eu").toLowerCase();
if (!["us", "eu", "kr", "tw"].includes(REGION)) { console.error("REGION must be us, eu, kr or tw."); process.exit(1); }
const API = `https://${REGION}.api.blizzard.com`;
const NS = { static: `static-forever-${REGION}`, dynamic: `dynamic-forever-${REGION}`, profile: `profile-forever-${REGION}` };

/* ---------- report helpers ---------- */
const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
let calls = 0;

/* ---------- http ---------- */
let token = null;
async function getToken() {
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.BNET_CLIENT_ID}:${env.BNET_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  calls++;
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}. Check the client ID and secret in .env.`);
  token = (await res.json()).access_token;
}

// GET a path; returns { status, ms, bytes, json }
async function get(pathAndQuery, namespace) {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${API}${pathAndQuery}${sep}namespace=${namespace}&locale=en_US`;
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, bytes: 0, json: null, error: e.message };
  }
  calls++;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, ms: Date.now() - t0, bytes: Buffer.byteLength(text), json };
}

const kb = (b) => (b / 1024).toFixed(0) + " KB";
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
const show = (obj, max = 600) => {
  const s = JSON.stringify(obj, (k, v) => (k === "_links" ? undefined : v));
  return s && s.length > max ? s.slice(0, max) + "…" : s;
};

// run promises with limited concurrency
async function pool(items, size, fn) {
  const results = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx]); }
  }));
  return results;
}

/* ---------- probes ---------- */
async function main() {
  log(`# WoW: Forever API probe, region ${REGION.toUpperCase()}`);
  log(`Run at ${new Date().toISOString()}. Namespaces: ${NS.static}, ${NS.dynamic}, ${NS.profile}.`);
  log();

  await getToken();
  log("✔ Got an access token.");
  log();

  /* 1. Rulesets */
  log("## 1. Rulesets (Forever's replacement for realms)");
  let rs = await get("/data/wow/ruleset/index", NS.dynamic);
  let rsNs = NS.dynamic;
  if (rs.status !== 200) { rs = await get("/data/wow/ruleset/index", NS.static); rsNs = NS.static; }
  log(`GET /data/wow/ruleset/index (${rsNs}) → HTTP ${rs.status}, ${kb(rs.bytes)}`);
  const rulesets = (rs.json && (rs.json.rulesets || rs.json.results)) || [];
  if (!rulesets.length) { log("Raw: " + show(rs.json)); }
  for (const r of rulesets) {
    const id = r.id || (r.key && r.key.href && (r.key.href.match(/ruleset\/(\d+)/) || [])[1]);
    const d = await get(`/data/wow/ruleset/${id}`, rsNs);
    log(`- Ruleset ${id}: HTTP ${d.status} → ${show(d.json, 300)}`);
  }
  log();
  const rulesetIds = rulesets.map((r) => r.id || ((r.key && r.key.href || "").match(/ruleset\/(\d+)/) || [])[1]).filter(Boolean);
  if (!rulesetIds.length) { log("No rulesets found, stopping auction checks."); return finish(); }

  /* 2. Auction houses */
  log("## 2. Auction houses");
  const rid = rulesetIds[0];
  const idx = await get(`/data/wow/ruleset/${rid}/auctions/`, NS.dynamic);
  log(`GET /data/wow/ruleset/${rid}/auctions/ → HTTP ${idx.status}, ${kb(idx.bytes)}`);
  const houses = (idx.json && (idx.json.auctions || idx.json.auction_houses || idx.json.houses)) || [];
  log("Index (raw, trimmed): " + show(idx.json, 1500));
  log();
  const houseIds = houses.map((h) => h.id || ((h.key && h.key.href || "").match(/auctions\/(\d+)/) || [])[1]).filter(Boolean);
  log(`Found ${houseIds.length} auction houses: ${houseIds.join(", ")}`);
  log();
  log("| House | Name in index | Auctions HTTP | Size | Listings | Distinct items | Commodities HTTP | Commodity listings |");
  log("|---|---|---|---|---|---|---|---|");
  let biggest = { id: null, items: new Set() };
  let sampleAuction = null;
  for (const hid of houseIds) {
    const meta = houses.find((h) => String(h.id) === String(hid)) || {};
    const a = await get(`/data/wow/ruleset/${rid}/auctions/${hid}`, NS.dynamic);
    const list = (a.json && a.json.auctions) || [];
    const items = new Set(list.map((x) => x.item && x.item.id).filter(Boolean));
    if (!sampleAuction && list.length) sampleAuction = list[0];
    if (items.size > biggest.items.size) biggest = { id: hid, items };
    const c = await get(`/data/wow/ruleset/${rid}/auctions/${hid}/commodities`, NS.dynamic);
    const cl = (c.json && c.json.auctions) || [];
    log(`| ${hid} | ${meta.name || "-"} | ${a.status} | ${mb(a.bytes)} | ${list.length} | ${items.size} | ${c.status} | ${cl.length} |`);
  }
  log();
  log("Fields on one auction listing (to plan the price math): " + show(sampleAuction, 500));
  log();

  // Check the reported quirk: do other rulesets return the same data for the same house?
  if (rulesetIds.length > 1 && houseIds.length) {
    const a1 = await get(`/data/wow/ruleset/${rulesetIds[0]}/auctions/${houseIds[0]}`, NS.dynamic);
    const a2 = await get(`/data/wow/ruleset/${rulesetIds[1]}/auctions/${houseIds[0]}`, NS.dynamic);
    const n1 = ((a1.json && a1.json.auctions) || []).length, n2 = ((a2.json && a2.json.auctions) || []).length;
    log(`Same house ${houseIds[0]} under ruleset ${rulesetIds[0]} vs ${rulesetIds[1]}: ${n1} vs ${n2} listings (${a1.bytes === a2.bytes ? "identical size" : "different size"}).`);
    log();
  }

  /* 3. Item names coverage */
  log("## 3. Item names (static-forever item endpoint)");
  const sample = [...biggest.items].slice(0, 120);
  const res = await pool(sample, 6, async (id) => {
    const r = await get(`/data/wow/item/${id}`, NS.static);
    return { id, status: r.status, name: r.json && r.json.name, sell: r.json && r.json.sell_price };
  });
  const ok = res.filter((r) => r.status === 200);
  log(`Sampled ${sample.length} item IDs from house ${biggest.id}: ${ok.length} found, ${sample.length - ok.length} missing (${sample.length ? Math.round((sample.length - ok.length) / sample.length * 100) : 0}% missing).`);
  log("Examples found: " + ok.slice(0, 8).map((r) => `${r.id} ${r.name} (vendor ${r.sell})`).join("; "));
  log("Examples missing: " + res.filter((r) => r.status !== 200).slice(0, 8).map((r) => `${r.id} → ${r.status}`).join("; "));
  if (ok[0]) {
    const m = await get(`/data/wow/media/item/${ok[0].id}`, NS.static);
    log(`Item icon endpoint for ${ok[0].id}: HTTP ${m.status} → ${show(m.json, 200)}`);
  }
  const s1 = await get("/data/wow/search/item?name.en_US=Linen&orderby=id&_page=1", NS.static);
  log(`Item search (name "Linen"): HTTP ${s1.status}, ${s1.json && s1.json.results ? s1.json.results.length + " results" : show(s1.json, 200)}`);
  log();

  /* 4. Professions & recipes */
  log("## 4. Professions and recipes (decides the craft calculator)");
  const p = await get("/data/wow/profession/index", NS.static);
  log(`GET /data/wow/profession/index → HTTP ${p.status}`);
  const profs = (p.json && p.json.professions) || [];
  log("Professions: " + (profs.map((x) => `${x.id} ${x.name}`).join(", ") || show(p.json, 200)));
  if (profs.length) {
    const pd = await get(`/data/wow/profession/${profs[0].id}`, NS.static);
    log(`Profession ${profs[0].id} detail: HTTP ${pd.status} → ${show(pd.json, 400)}`);
    const tier = pd.json && pd.json.skill_tiers && pd.json.skill_tiers[0];
    if (tier) {
      const st = await get(`/data/wow/profession/${profs[0].id}/skill-tier/${tier.id}`, NS.static);
      const cats = (st.json && st.json.categories) || [];
      const recipe = cats[0] && cats[0].recipes && cats[0].recipes[0];
      log(`Skill tier ${tier.id}: HTTP ${st.status}, ${cats.length} categories.`);
      if (recipe) {
        const rr = await get(`/data/wow/recipe/${recipe.id}`, NS.static);
        log(`Recipe ${recipe.id}: HTTP ${rr.status} → ${show(rr.json, 500)}`);
      }
    }
  }
  log();

  /* 5. Character lookup */
  log("## 5. Character lookup");
  if (!env.CHARACTER) {
    log("Skipped. Set CHARACTER=Firstname-Lastname in .env to test this.");
  } else {
    const slug = encodeURIComponent(env.CHARACTER.trim().toLowerCase());
    const c = await get(`/profile/wow/character/${slug}`, NS.profile);
    log(`GET /profile/wow/character/{name} → HTTP ${c.status}`);
    if (c.json) log("Top-level fields: " + Object.keys(c.json).filter((k) => k !== "_links").join(", "));
    for (const sub of ["equipment", "professions", "reputations", "character-media", "specializations"]) {
      const s = await get(`/profile/wow/character/${slug}/${sub}`, NS.profile);
      log(`- /${sub}: HTTP ${s.status}, ${kb(s.bytes)}`);
    }
    log("(Character details are not written to this report on purpose.)");
  }
  log();
  return finish();
}

function finish() {
  log("## Summary");
  log(`Total API calls: ${calls} (limit is 36,000/hour).`);
  fs.writeFileSync(REPORT, out.join("\n") + "\n");
  console.log(`\nReport written to ${path.relative(ROOT, REPORT)}`);
}

main().catch((e) => {
  // never print the token or secret
  console.error("Probe failed: " + e.message);
  if (out.length) { log(); log("Probe stopped early: " + e.message); fs.writeFileSync(REPORT, out.join("\n") + "\n"); }
  process.exit(1);
});
