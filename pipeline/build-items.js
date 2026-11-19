// Forever Tome — static item pages for search engines (feature 5).
//
// Builds one real HTML page per named item (item/<id>-<slug>.html), an A–Z index
// (item/index.html) and sitemap.xml, from the price job's data in ./out.
// Pages are plain HTML so Google can read them without running scripts.
//
// Run after the price job:  node pipeline/build-items.js
// Option: --site=https://forevertome.com   (used for canonical links and the sitemap)
//
// The pages contain Blizzard API data, so they are NOT committed to git (see .gitignore).
// In production they're rebuilt daily before deploying, which also keeps every page
// within Blizzard's 30-day data limit; items no longer seen simply disappear.
"use strict";
const fs = require("fs");
const path = require("path");
const PM = require("../js/pricemath.js");
const { GROUPS } = require("./houses");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "out");
const ITEM_DIR = path.join(ROOT, "item");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const SITE = (args.site || process.env.SITE_URL || "https://forevertome.com").replace(/\/$/, "");
const REGION_NAMES = { eu: "Europe", us: "Americas & Oceania", kr: "Korea", tw: "Taiwan" };
const FACTIONS = { alliance: "Alliance", horde: "Horde", neutral: "Blackwater" };

const readJSON = (name) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8")); } catch (e) { return null; } };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function money(c, plain) {
  if (c == null || isNaN(c)) return plain ? "—" : '<span class="faint">—</span>';
  c = Math.round(c);
  const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cu = c % 100, parts = [];
  if (plain) {
    if (g) parts.push(g.toLocaleString("en-US") + "g");
    if (g || s) parts.push(s + "s");
    parts.push(cu + "c");
    return parts.join(" ");
  }
  if (g) parts.push(`<span class="coin g">${g.toLocaleString("en-US")}g</span>`);
  if (g || s) parts.push(`<span class="coin s">${s}s</span>`);
  parts.push(`<span class="coin c">${cu}c</span>`);
  return `<span class="money">${parts.join(" ")}</span>`;
}
const dateText = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function shell({ title, desc, canonical, body, jsonld, dataPage }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="../">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;500;700&family=Cinzel:wght@500;700&family=Cinzel+Decorative:wght@700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ""}</head>
<body data-page="${dataPage || "items"}">
<div id="site-header"></div>
<main>
${body}
</main>
<div id="site-footer"></div>
<script src="js/config.js"></script>
<script src="js/pricemath.js"></script>
<script src="js/site.js"></script>
</body>
</html>
`;
}

// Static line chart of daily market price (same look as the live chart)
function chartSVG(pts, label) {
  if (!pts || pts.length < 2) {
    return `<p class="faint">The 30-day price chart appears once there are at least two days of data${pts && pts.length ? ` (today's market price: ${money(pts[0][1])})` : ""}.</p>`;
  }
  const W = 640, H = 180, P = 34;
  const days = pts.map((p) => p[0]), vals = pts.map((p) => p[1]);
  const x0 = Math.min(...days), x1 = Math.max(...days);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  if (y0 === y1) { y0 *= 0.9; y1 = y1 * 1.1 + 1; }
  const X = (d) => P + (d - x0) / Math.max(1, x1 - x0) * (W - P * 2);
  const Y = (v) => H - P + 6 - (v - y0) / (y1 - y0) * (H - P * 2);
  const day = (d) => new Date(d * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const change = Math.round((vals[vals.length - 1] - vals[0]) / vals[0] * 100);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
  return `<div class="pr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}: market price ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% from ${day(x0)} to ${day(x1)}">` +
    `<line x1="${P}" y1="${H - P + 6}" x2="${W - P}" y2="${H - P + 6}" class="axis"/><path d="${line}" class="pline"/>` +
    pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" class="pdot"/>`).join("") +
    `<text x="${P}" y="${H - 6}" class="plabel">${day(x0)}</text><text x="${W - P}" y="${H - 6}" class="plabel" text-anchor="end">${day(x1)}</text></svg>` +
    `<p class="faint">${esc(label)}: ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% over ${x1 - x0} days.</p></div>`;
}

function main() {
  const regions = Object.keys(REGION_NAMES).filter((r) => readJSON(`meta_${r}.json`));
  if (!regions.length) { console.error("No data in ./out — run `node pipeline/run.js` first."); process.exit(1); }

  // ---- gather data ----
  const names = {};              // id → [name, sell, day, buy, quality, class, iconFileId]
  const prices = {};             // id → [{ region, group, label, faction, houseId, min, market, qty, n }]
  const history = {};            // `${region}:${houseId}` → { itemId: points }
  const recipesBy = { made: {}, used: {} };
  let updated = null;

  for (const region of regions) {
    const meta = readJSON(`meta_${region}.json`);
    Object.assign(names, readJSON(`items_${region}.json`) || {});
    for (const g of meta.groups || []) {
      const file = readJSON(`prices_${region}_${g}.json`);
      if (!file) continue;
      if (!updated || file.updated > updated) updated = file.updated;
      const label = (meta.rulesets && meta.rulesets[g]) || `Group ${g}`;
      for (const [houseId, h] of Object.entries(file.houses)) {
        for (const [id, a] of Object.entries(h.items)) {
          (prices[id] || (prices[id] = [])).push({ region, group: g, label, confirmed: !!(meta.rulesets && meta.rulesets[g]), faction: h.faction, houseId, min: a[0], market: a[1], qty: a[2], n: a[3] });
        }
      }
      for (let s = 0; s < PM.SHARDS; s++) {
        const shard = readJSON(`history_${region}_${g}_${s}.json`) || {};
        for (const [houseId, items] of Object.entries(shard)) Object.assign(history[`${region}:${houseId}`] || (history[`${region}:${houseId}`] = {}), items);
      }
    }
    const rec = readJSON(`recipes_${region}.json`);
    if (rec && !recipesBy.loaded) {
      recipesBy.loaded = true;
      for (const p of rec.professions) for (const r of p.recipes) {
        const entry = { prof: p.name, id: r[0], name: r[1], cat: r[2], item: r[3], itemName: r[4], q: r[5], mats: r[6] };
        if (r[6].length) (recipesBy.all || (recipesBy.all = [])).push(entry);
        if (r[3]) (recipesBy.made[r[3]] || (recipesBy.made[r[3]] = [])).push(entry);
        for (const m of r[6]) (recipesBy.used[m[0]] || (recipesBy.used[m[0]] = [])).push(entry);
      }
    }
  }

  // Items that get a page: named, and either on an auction house or part of a recipe
  const pageIds = Object.keys(names).filter((id) => names[id] && names[id][0] && (prices[id] || recipesBy.made[id] || recipesBy.used[id]));
  const hasPage = new Set(pageIds);
  // item icon from Blizzard's image server (same file id in every region); a blank of the same size keeps lists aligned
  const icon = (id, size = 36, px = 20, cls = "item-icon") => {
    const n = names[id] || [], url = PM.iconUrl(n[6], regions[0], size);
    return url ? `<img class="${cls}${n[4] ? " qb-" + esc(n[4]) : ""}" src="${esc(url)}" alt="" width="${px}" height="${px}"${px < 40 ? ' loading="lazy" decoding="async"' : ""}>`
      : (px < 40 ? '<span class="item-icon" aria-hidden="true"></span>' : "");
  };
  // Wowhead hover tooltip on our own links (Wowhead keeps our icon and text)
  const tip = (id) => (id ? ` data-wowhead="item=${Number(id)}&amp;domain=forever" data-wh-icon-added="true" data-wh-rename-link="false"` : "");
  // tooltips only work on links, so items without a page of their own link to Wowhead
  const whHref = (id) => `https://www.wowhead.com/forever/item=${Number(id)}`;
  const link = (id, name) => (hasPage.has(String(id)) ? `<a href="${esc(PM.itemPath(id, name))}"${tip(id)}>${icon(id)}${esc(name)}</a>`
    : `<a href="${whHref(id)}" target="_blank" rel="noopener nofollow"${tip(id)}>${icon(id)}${esc(name)}<span class="sr-only"> (Wowhead, opens in a new tab)</span></a>`);
  // big title icon: hover for the tooltip, click for the full Wowhead page
  const bigIcon = (id) => `<a class="item-icon-link" href="${whHref(id)}" target="_blank" rel="noopener nofollow"${tip(id)}>${icon(id, 56, 56, "item-icon-lg")}<span class="sr-only">Item details on Wowhead (opens in a new tab)</span></a>`;
  const recipeLink = (r, text) => `<a href="${esc(PM.recipePath(r.id, r.name))}">${esc(text || r.name)}</a>`;

  // "Primary" market for summaries and material costs: first confirmed ruleset, Alliance; else first group
  function primaryRow(rows) {
    if (!rows || !rows.length) return null;
    return rows.find((r) => r.confirmed && r.faction === "alliance") || rows.find((r) => r.confirmed) || rows.find((r) => r.faction === "alliance") || rows[0];
  }
  const primaryHouse = (() => {
    for (const region of regions) {
      const meta = readJSON(`meta_${region}.json`);
      for (const g of GROUPS) if (meta.rulesets && meta.rulesets[g.id]) return { region, houseId: String(g.houses.alliance), label: meta.rulesets[g.id] };
    }
    return null;
  })();
  function priceAt(id) {
    const row = (prices[id] || []).find((r) => primaryHouse && r.region === primaryHouse.region && r.houseId === primaryHouse.houseId);
    const n = names[id] || [];
    return { ah: row ? row.market : null, vendor: n[3] || null, sell: n[1] || null };
  }

  // ---- write pages ----
  fs.rmSync(ITEM_DIR, { recursive: true, force: true });
  fs.mkdirSync(ITEM_DIR, { recursive: true });
  const asOf = updated ? dateText(updated) : "";

  for (const id of pageIds) {
    const [name, sell, , , quality, itemClass] = names[id];
    const rows = (prices[id] || []).slice().sort((a, b) =>
      a.region.localeCompare(b.region) || (b.confirmed - a.confirmed) || a.group.localeCompare(b.group) || a.faction.localeCompare(b.faction));
    const main = primaryRow(rows);
    const made = recipesBy.made[id] || [];
    const used = recipesBy.used[id] || [];
    const qualityName = quality ? quality.charAt(0).toUpperCase() + quality.slice(1) : null;

    let summary;
    if (main) {
      summary = `On the ${REGION_NAMES[main.region]} ${main.label} ${FACTIONS[main.faction]} Auction House, <b>${esc(name)}</b> sells for about <b>${money(main.market)}</b> each ` +
        `(lowest ${money(main.min)}, ${main.qty.toLocaleString("en-US")} listed) as of ${asOf}.`;
    } else {
      summary = `${esc(name)} isn't listed on the Auction House right now.`;
    }
    if (sell) summary += ` Vendors buy it for ${money(sell)}.`;
    const v = main && sell ? (main.market * 0.95 > sell * 1.15 ? "Selling on the Auction House pays more than a vendor, even after the 5% cut." : main.market * 0.95 < sell ? "A vendor pays more than the Auction House does after its 5% cut — vendor it." : "") : "";

    const plainDesc = main
      ? `${name} price in WoW: Forever: about ${money(main.market, true)} on the ${REGION_NAMES[main.region]} ${main.label} ${FACTIONS[main.faction]} AH (${asOf}). 30-day price history, vendor price${made.length ? ", how to craft it" : ""}${used.length ? " and recipes that use it" : ""}.`
      : `${name} in WoW: Forever: vendor price${made.length ? ", how to craft it" : ""}${used.length ? " and recipes that use it" : ""}.`;

    const priceTable = rows.length ? `<div class="table-wrap"><table class="prices">
<caption class="sr-only">${esc(name)} prices by auction house</caption>
<thead><tr><th scope="col">Region</th><th scope="col">Ruleset</th><th scope="col">Auction House</th><th scope="col">Market price</th><th scope="col">Lowest</th><th scope="col">Listed</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td>${esc(REGION_NAMES[r.region])}</td><td${r.confirmed ? "" : ' class="dim"'}>${esc(r.label)}</td><td>${FACTIONS[r.faction]}</td><td>${money(r.market)}</td><td>${money(r.min)}</td><td>${r.qty.toLocaleString("en-US")}</td></tr>`).join("")}</tbody>
</table></div>` : `<p class="faint">Not listed on any auction house in the latest snapshot.</p>`;

    const chartPts = main ? (history[`${main.region}:${main.houseId}`] || {})[id] : null;
    const chart = main ? chartSVG(chartPts, `${main.label} ${FACTIONS[main.faction]} (${REGION_NAMES[main.region]})`) : "";

    const madeHtml = made.length ? `<section class="panel"><h2>How to make it</h2><ul class="recipe-list">${made.slice(0, 10).map((r) => {
      const res = PM.craftProfit({ q: r.q, item: r.item, r: r.mats }, priceAt);
      return `<li><b>${esc(r.prof)}</b> — ${recipeLink(r)}${r.q > 1 ? ` (makes ${r.q})` : ""}<br><span class="mats-inline">${r.mats.map((m) => `${m[1]}× ${link(m[0], m[2])}`).join(", ")}</span>` +
        (res.costComplete && primaryHouse ? `<br><span class="faint">Materials cost about ${money(res.cost)} on ${esc(primaryHouse.label)} Alliance${res.profit != null ? ` · profit ${res.profit >= 0 ? "+" : "−"}${money(Math.abs(res.profit))} after the AH cut` : ""}.</span>` : "") + `</li>`;
    }).join("")}</ul></section>` : "";

    const usedHtml = used.length ? `<section class="panel"><h2>Used to craft</h2><ul class="recipe-list">${used.slice(0, 40).map((r) => {
      const qty = (r.mats.find((m) => String(m[0]) === String(id)) || [])[1];
      return `<li>${r.item ? link(r.item, r.itemName || r.name) : esc(r.name)} <span class="faint">(${esc(r.prof)}${qty ? `, needs ${qty}` : ""} · ${recipeLink(r, "recipe")})</span></li>`;
    }).join("")}</ul>${used.length > 40 ? `<p class="faint">…and ${used.length - 40} more recipes.</p>` : ""}</section>` : "";

    const canonical = `${SITE}/${PM.itemPath(id, name)}`;
    const body = `<section class="hero page-hero"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a> › <a href="item/index.html">Item prices</a> › ${esc(name)}</nav>
  <div class="item-title">${bigIcon(id)}<h1 class="${quality ? "q-" + esc(quality) : ""}">${esc(name)}</h1></div>
  <p class="item-sub">${[qualityName, itemClass, "WoW: Forever"].filter(Boolean).map(esc).join(" · ")}</p>
  <p class="item-summary">${summary}${v ? " " + v : ""}</p>
  <div class="item-actions">
    <a class="btn" href="prices.html?item=${id}">Live prices &amp; filters</a>
    ${made.length || used.length ? `<a class="btn btn-ghost" href="crafting.html?q=${encodeURIComponent(name)}">Crafting profits</a>` : ""}
    <a class="btn btn-ghost wh" href="https://www.wowhead.com/forever/item=${id}" target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">Full details on Wowhead<span class="sr-only"> (opens in a new tab)</span></a>
  </div>
</div></section>
<div class="wrap section grid">
  <section class="panel"><h2>Auction House prices</h2>${priceTable}
    <p class="faint" style="margin-top:8px">Market price = average of the cheapest 10% of units listed. Snapshot from ${esc(asOf)}; the <a href="prices.html?item=${id}">live prices page</a> updates hourly.</p></section>
  ${main ? `<section class="panel"><h2>Price history (30 days)</h2>${chart}</section>` : ""}
  ${madeHtml}
  ${usedHtml}
  <p class="faint">Data provided by Blizzard Entertainment. Forever Tome is not affiliated with or endorsed by Blizzard.</p>
</div>
<div class="wrap"><div class="ad-slot" data-slot="bottom"></div></div>`;

    const jsonld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Item prices", item: SITE + "/item/" },
      { "@type": "ListItem", position: 3, name, item: canonical }] };
    fs.writeFileSync(path.join(ROOT, PM.itemPath(id, name)),
      shell({ title: `${name} Price — WoW: Forever — Forever Tome`, desc: plainDesc, canonical, body, jsonld }));
  }

  // ---- recipe pages ----
  const RECIPE_DIR = path.join(ROOT, "recipe");
  fs.rmSync(RECIPE_DIR, { recursive: true, force: true });
  fs.mkdirSync(RECIPE_DIR, { recursive: true });
  const allRecipes = recipesBy.all || [];
  // price lookup for any auction house: market price there, vendor price as fallback
  const priceFor = (region, houseId) => (id) => {
    const row = (prices[id] || []).find((x) => x.region === region && x.houseId === houseId);
    const n = names[id] || [];
    return { ah: row ? row.market : null, vendor: n[3] || null, sell: n[1] || null };
  };
  const houses = []; // every auction house we have prices for, primary first
  for (const region of regions) {
    const meta = readJSON(`meta_${region}.json`);
    for (const g of GROUPS) {
      if (!(meta.groups || []).includes(g.id)) continue;
      const label = (meta.rulesets && meta.rulesets[g.id]) || `Group ${g.id}`;
      for (const [faction, hid] of Object.entries(g.houses)) houses.push({ region, houseId: String(hid), label, confirmed: !!(meta.rulesets && meta.rulesets[g.id]), faction });
    }
  }
  houses.sort((a, b) => (b.confirmed - a.confirmed));

  for (const r of allRecipes) {
    const recipe = { q: r.q, item: r.item, r: r.mats };
    const res = primaryHouse ? PM.craftProfit(recipe, priceAt) : null;
    const itemName = r.item ? (r.itemName || (names[r.item] || [])[0] || r.name) : null;
    let summary = `${esc(r.name)} is a ${esc(r.prof)} recipe${r.cat ? ` (${esc(r.cat)})` : ""}` +
      (r.item ? ` that makes ${r.q > 1 ? r.q + "× " : ""}${link(r.item, itemName)}.` : ".");
    if (res && res.costComplete) {
      summary += ` On ${esc(primaryHouse.label)} Alliance (${esc(REGION_NAMES[primaryHouse.region])}) the materials cost about <b>${money(res.cost)}</b>`;
      summary += res.profit != null
        ? ` and the result sells for ${money(res.sellAh)} — ${res.profit >= 0 ? "a <b>profit</b> of " : "a <b>loss</b> of "}<b>${money(Math.abs(res.profit))}</b> after the 5% AH cut.`
        : ".";
    }
    summary += ` Prices as of ${esc(asOf)}.`;

    const matRows = res ? res.parts.map((p, i) => {
      const m = r.mats[i];
      return `<tr><th scope="row">${link(m[0], m[2])}</th><td>${m[1]}</td><td>${p.unit != null ? money(p.unit) : '<span class="faint">no price</span>'}</td>` +
        `<td class="dim">${p.source === "ah" ? "Auction House" : p.source === "vendor" ? "Vendor (estimate)" : "—"}</td><td>${p.unit != null ? money(p.unit * m[1]) : "—"}</td></tr>`;
    }).join("") : r.mats.map((m) => `<tr><th scope="row">${link(m[0], m[2])}</th><td>${m[1]}</td><td colspan="3" class="dim">—</td></tr>`).join("");
    const matTable = `<div class="table-wrap"><table class="prices"><caption class="sr-only">Materials for ${esc(r.name)}</caption>
<thead><tr><th scope="col">Material</th><th scope="col">Qty</th><th scope="col">Price each</th><th scope="col">From</th><th scope="col">Cost</th></tr></thead>
<tbody>${matRows}</tbody>${res && res.costComplete ? `<tfoot><tr><th scope="row" colspan="4">Total materials</th><td><b>${money(res.cost)}</b></td></tr></tfoot>` : ""}</table></div>`;

    const houseRows = r.item ? houses.map((h) => {
      const x = PM.craftProfit(recipe, priceFor(h.region, h.houseId));
      if (!x.costComplete && x.sellAh == null) return "";
      return `<tr><td>${esc(REGION_NAMES[h.region])}</td><td${h.confirmed ? "" : ' class="dim"'}>${esc(h.label)}</td><td>${FACTIONS[h.faction]}</td>` +
        `<td>${x.costComplete ? money(x.cost) : "—"}</td><td>${money(x.sellAh)}</td>` +
        `<td>${x.profit != null ? `<span class="pct ${x.profit >= 0 ? "up" : "down"}">${x.profit >= 0 ? "+" : "−"}</span> ${money(Math.abs(x.profit))}` : "—"}</td></tr>`;
    }).join("") : "";
    const profitTable = houseRows ? `<section class="panel"><h2>Profit on every Auction House</h2><div class="table-wrap"><table class="prices">
<caption class="sr-only">Crafting profit for ${esc(r.name)} by auction house</caption>
<thead><tr><th scope="col">Region</th><th scope="col">Ruleset</th><th scope="col">Auction House</th><th scope="col">Materials</th><th scope="col">Sells for</th><th scope="col">Profit</th></tr></thead>
<tbody>${houseRows}</tbody></table></div><p class="faint" style="margin-top:8px">Profit = sale price minus the 5% AH cut minus materials. It ignores deposits and whether the item actually sells.</p></section>` : "";

    const canonical = `${SITE}/${PM.recipePath(r.id, r.name)}`;
    const desc = `${r.name} (${r.prof}) in WoW: Forever: materials${res && res.costComplete ? ` cost about ${money(res.cost, true)}` : ""}${res && res.profit != null ? `, ${res.profit >= 0 ? "profit" : "loss"} ${money(Math.abs(res.profit), true)} after the AH cut` : ""}. Live material prices and profit on every auction house.`;
    const body = `<section class="hero page-hero"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a> › <a href="recipe/index.html">Recipes</a> › ${esc(r.prof)} › ${esc(r.name)}</nav>
  <div class="item-title">${r.item ? bigIcon(r.item) : ""}<h1>${esc(r.name)}</h1></div>
  <p class="item-sub">${[r.prof, r.cat, "WoW: Forever recipe"].filter(Boolean).map(esc).join(" · ")}</p>
  <p class="item-summary">${summary}</p>
  <div class="item-actions">
    <button type="button" class="btn plan-add" data-recipe="${r.id}">+ Add to my crafting plan</button>
    <a class="btn btn-ghost" href="planner.html">View my plan <span class="plan-count" data-plan-count hidden></span></a>
    <a class="btn btn-ghost" href="crafting.html?q=${encodeURIComponent(itemName || r.name)}">Compare with other recipes</a>
    ${r.item && hasPage.has(String(r.item)) ? `<a class="btn btn-ghost" href="${esc(PM.itemPath(r.item, itemName))}">${esc(itemName)} prices</a>` : ""}
  </div>
</div></section>
<div class="wrap section grid">
  <section class="panel"><h2>Materials</h2>${matTable}
    <p class="faint" style="margin-top:8px">Prices from ${esc(primaryHouse ? primaryHouse.label + " Alliance, " + REGION_NAMES[primaryHouse.region] : "the Auction House")}. "Vendor (estimate)" means the material isn't on the AH, so we use Blizzard's vendor price — check a trade vendor sells it.</p></section>
  ${profitTable}
  <p class="faint">Data provided by Blizzard Entertainment. Forever Tome is not affiliated with or endorsed by Blizzard.</p>
</div>
<div class="wrap"><div class="ad-slot" data-slot="bottom"></div></div>`;
    const jsonld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Recipes", item: SITE + "/recipe/" },
      { "@type": "ListItem", position: 3, name: r.name, item: canonical }] };
    fs.writeFileSync(path.join(ROOT, PM.recipePath(r.id, r.name)),
      shell({ title: `${r.name} — ${r.prof} Recipe, Cost & Profit — WoW: Forever — Forever Tome`, desc, canonical, body, jsonld, dataPage: "recipe" }));
  }

  // recipe index, grouped by profession
  const byProf = {};
  for (const r of allRecipes) (byProf[r.prof] || (byProf[r.prof] = [])).push(r);
  const profs = Object.keys(byProf).sort();
  const recipeIndex = `<section class="hero page-hero"><div class="wrap">
  <div class="eyebrow">Recipes</div>
  <h1>WoW: Forever recipes</h1>
  <p class="lead">${allRecipes.length.toLocaleString("en-US")} recipes across ${profs.length} professions — each with today's material cost and profit on every Auction House.</p>
</div></section>
<div class="wrap section item-index">
  <label class="field-label" for="idx-search">Find a recipe</label>
  <input class="input" type="search" id="idx-search" placeholder="e.g. Bolt of Linen Cloth" autocomplete="off" style="width:100%;max-width:420px">
  <nav class="az" aria-label="Jump to profession">${profs.map((p) => `<a href="recipe/index.html#prof-${PM.recipePath(0, p).slice(9, -5)}">${esc(p)}</a>`).join("")}</nav>
  ${profs.map((p) => `<h2 id="prof-${PM.recipePath(0, p).slice(9, -5)}">${esc(p)} <span class="faint">(${byProf[p].length})</span></h2><ul>${byProf[p].slice().sort((a, b) => a.name.localeCompare(b.name)).map((r) => `<li><a href="${esc(PM.recipePath(r.id, r.name))}"${tip(r.item)}>${icon(r.item)}${esc(r.name)}</a></li>`).join("")}</ul>`).join("\n")}
  <p class="faint">Data provided by Blizzard Entertainment. Prices as of ${esc(asOf)}.</p>
</div>`;
  fs.writeFileSync(path.join(RECIPE_DIR, "index.html"), shell({
    title: "WoW: Forever Recipes — Costs & Profit for Every Profession — Forever Tome",
    desc: `All ${allRecipes.length.toLocaleString("en-US")} WoW: Forever crafting recipes with live material costs and profit on every auction house.`,
    canonical: SITE + "/recipe/", body: recipeIndex, dataPage: "recipes"
  }));

  // ---- A–Z index ----
  const sorted = pageIds.map((id) => [id, names[id][0]]).sort((a, b) => a[1].localeCompare(b[1], "en"));
  const groups = {};
  for (const [id, name] of sorted) { const k = /^[a-z]/i.test(name) ? name[0].toUpperCase() : "#"; (groups[k] || (groups[k] = [])).push([id, name]); }
  const keys = Object.keys(groups).sort();
  const indexBody = `<section class="hero page-hero"><div class="wrap">
  <div class="eyebrow">Item prices</div>
  <h1>WoW: Forever item prices</h1>
  <p class="lead">${sorted.length.toLocaleString("en-US")} items with Auction House prices, 30-day history, vendor prices and crafting info. Updated daily (live prices hourly).</p>
</div></section>
<div class="wrap section item-index">
  <label class="field-label" for="idx-search">Find an item</label>
  <input class="input" type="search" id="idx-search" placeholder="e.g. Copper Ore" autocomplete="off" style="width:100%;max-width:420px">
  <nav class="az" aria-label="Jump to letter">${keys.map((k) => `<a href="item/index.html#letter-${k === "#" ? "num" : k}">${k}</a>`).join("")}</nav>
  ${keys.map((k) => `<h2 id="letter-${k === "#" ? "num" : k}">${k}</h2><ul>${groups[k].map(([id, name]) => {
    const q = names[id][4];
    return `<li><a class="${q ? "q-" + esc(q) : ""}" href="${esc(PM.itemPath(id, name))}"${tip(id)}>${icon(id)}${esc(name)}</a></li>`;
  }).join("")}</ul>`).join("\n")}
  <p class="faint">Data provided by Blizzard Entertainment. Snapshot from ${esc(asOf)}.</p>
</div>`;
  fs.writeFileSync(path.join(ITEM_DIR, "index.html"), shell({
    title: "WoW: Forever Item Prices A–Z — Forever Tome",
    desc: `Auction House prices for ${sorted.length.toLocaleString("en-US")} WoW: Forever items: market price, 30-day history, vendor price and crafting.`,
    canonical: SITE + "/item/", body: indexBody
  }));

  // ---- sitemap.xml (static pages + item pages) ----
  const statics = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  const today = new Date().toISOString().slice(0, 10);
  const urls = statics.map((f) => `${SITE}/${f === "index.html" ? "" : f}`)
    .concat([SITE + "/item/", SITE + "/recipe/"], pageIds.map((id) => `${SITE}/${PM.itemPath(id, names[id][0])}`), allRecipes.map((r) => `${SITE}/${PM.recipePath(r.id, r.name)}`));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n") + "\n</urlset>\n");

  const size = fs.readdirSync(ITEM_DIR).reduce((s, f) => s + fs.statSync(path.join(ITEM_DIR, f)).size, 0);
  const rsize = fs.readdirSync(RECIPE_DIR).reduce((s, f) => s + fs.statSync(path.join(RECIPE_DIR, f)).size, 0);
  console.log(`Built ${pageIds.length} item pages (${(size / 1048576).toFixed(1)} MB), ${allRecipes.length} recipe pages (${(rsize / 1048576).toFixed(1)} MB) and sitemap.xml with ${urls.length} URLs.`);
}

main();
