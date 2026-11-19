# Phase 2 plan: live auction prices and character lookup

> Written before the site moved to Astro (November 2026). Some file names below are from the old layout:
> - `serve.js`: now `npm run dev`, with `integrations/dev-api.ts` and `pipeline/character-api.js`
> - `js/site.js`: now `src/tools/` and `src/components/`
> - `js/pricemath.js`, `js/talentmath.js`: now in `src/lib/`
> - `pipeline/build-items.js`: now `src/pages/item/` and `src/pages/recipe/`, built by `npm run build`
> - `*.html` pages: now `/prices`, `/flips`, and so on
>
> See [astro-migration-plan.md](astro-migration-plan.md).

Goal: add the two tools no independent Forever site offers well. Both use Blizzard's official API and follow its terms.

1. **Auction House price tracker:** current prices, 30-day trends, "vendor or sell?", deals.
2. **Character lookup:** gear, professions, reputations and guild, behind a shareable link.

Running cost: **$0/month** on free tiers, plus a domain (about $10/year).

---

## 1. How it fits together

```
           every hour                        on visit
 GitHub Actions  ──▶  Blizzard API     Visitor ──▶ Cloudflare Pages (the website)
 (fetch + crunch)                             │
        │ writes small summary files          ▼
        ▼                               Cloudflare Worker (/api/...)
 Cloudflare Workers KV  ◀───────────────  reads prices from KV
                                          proxies character lookups to Blizzard
                                          (API key stays secret here)
```

| Part | Job | Free-tier limit | Our use |
|---|---|---|---|
| GitHub Actions (public repo) | Hourly job: download auctions, compute prices | Unlimited on public repos | ~2–4 min/hour |
| Workers KV | Store price summaries | 1,000 writes/day, 1 GB | ~110 writes/day |
| Cloudflare Worker | Serve prices, proxy character lookups | 100,000 requests/day, 10 ms CPU each | Passes stored text straight through (no heavy work) |
| Cloudflare Pages | Host the website | 500 deploys/month | Deploy only when content changes |
| Blizzard API | Source data | 36,000 calls/hour | ~100 calls/hour plus lookups |

Why this split: the heavy work (9 MB auction files) runs in GitHub Actions, where it's free. The Worker only hands out prepared files, so it stays under the 10 ms CPU limit. The API key never reaches visitors' browsers.

## 2. Blizzard terms built into the design

| Rule | How we comply |
|---|---|
| Keep data max 30 days (2(s)) | History is a rolling 30 days; older days are deleted every run |
| Credit Blizzard, no implied endorsement (2(m)) | "Data provided by Blizzard Entertainment" on every API page |
| No Blizzard trademarks in site title or URL (2(m)) | Domain like forevertome.com; never "wow" or "warcraft" |
| No paywall, no ad-gated or donation-gated features (2(b)) | Everything free; donate button never blocks anything |
| Data never in ads or sent to ad networks (2(h)) | Ads are plain page ads; no API data passed to them |
| Privacy policy; delete on request (2(p), 11(3)) | Add a privacy page; character opt-out list; no profiles stored |
| Deleted characters must not be shown (2(s)) | Lookups are live (cached at most 15 minutes), so deleted characters disappear |
| Key kept secret (2(l)) | Stored only in GitHub Secrets and the Worker's settings |

## 3. Milestones

### M0: Go live (needed anyway)
- **You:** pick and buy a domain; create free GitHub and Cloudflare accounts.
- **Me:** set up the repository, auto-deploy to Cloudflare Pages, connect the domain, add a privacy page.
- **Done when:** the current site is live on your domain.

### M1: API probe (one session, before building anything)
- **You:** create a Battle.net developer client (needs a Battle.net account with an authenticator). Put the Client ID and Secret in a local `.env` file. I never see them in chat, and the file is never committed.
- **Me:** write a small Node script that reports:
  - which auction houses exist per region and which faction each one is (unknown today)
  - file sizes and item counts
  - how many items have names in the item endpoint (a developer reported 43% missing)
  - whether recipe/profession data is available (decides the craft calculator)
  - how character lookups behave (level-10 minimum, lag after logout)
- **Done when:** we have a written probe report, and the M2 details below are confirmed or adjusted.

### M2: Price pipeline
- An hourly GitHub Action does the following for each region (US, EU):
  1. Get a token.
  2. Download every auction house.
  3. Per item, compute: lowest buyout, median of the cheapest 10%, quantity listed, number of sellers.
  4. Write a **latest snapshot** per region (1 KV write per region per hour).
  5. Once a day, write **daily history**, split into 32 shards by item ID, keeping 30 days (64 writes a day).
- Item names come from the Blizzard item endpoint, refreshed within 30 days. Missing names fall back to Wowhead's tooltip script, which fills in the name and icon in the visitor's browser.
- **Done when:** the job runs for 48 hours without failing, and KV writes stay well under 1,000 a day.

### M3: Prices page (`prices.html`)
- Region and auction-house picker, plus item search.
- Item view:
  - current price, quantity and sellers
  - 30-day chart (simple built-in chart, no external library)
  - vendor price
  - a "sell on AH or vendor?" verdict
- Lists: biggest price moves (24h/7d), deals (well below the 30-day median), most listed.
- "Updated X minutes ago" and Blizzard attribution on every view.
- **Done when:** prices match in-game spot checks on 10 items.

### M4: Character lookup (`character.html`)
- Form: region and Name-Surname. The shareable link looks like `character.html?r=eu&n=Name-Surname`.
- Shows: level, race, class, ruleset, guild, equipped gear (with Wowhead tooltips), professions and reputations.
- Friendly messages for "not found" (characters under level 10, recently logged in, or deleted).
- The Worker caches each lookup for up to 15 minutes, and an opt-out list blocks characters on request.
- **Done when:** it works for several real characters, the privacy page explains it, and opt-out is tested.

### M5 (optional): Craft profit calculator
- Only if M1 finds recipe data in the Forever API.
- Shows a recipe's reagent cost (from live prices), its sale price, and the profit or loss.

## 4. Risks

| Risk | Plan |
|---|---|
| Forever API is undocumented and may change | Probe first (M1); the job fails safely and the site keeps showing the last good data with its timestamp |
| Blizzard can revoke access at any time | Price and character pages show a "temporarily unavailable" notice; the rest of the site is unaffected |
| Item names missing | Wowhead fallback, otherwise "Item #ID" |
| Auction houses can't be mapped to factions | Show them by ID with a note until mapped |
| GitHub cron runs late (5–15 min) | Fine for hourly data; show the real timestamp |

## 5. What I need from you, in order
1. A domain name without "WoW" or "Warcraft" in it (e.g. forevertome.com), so I can prepare M0.
2. Free GitHub and Cloudflare accounts. You create these; I'll guide each click.
3. A Battle.net developer client (for M1). You create it and keep the secret local.
4. Optional: send the legal@blizzard.com email asking about ads beside API data.

---

## 6. M1 probe results (EU, 2026-11-18)

Run with `node tools/probe.js`. This section records only the API's structure; game data from the run is not stored in the repo.

**Works**
- Token: `POST https://oauth.battle.net/token` (client credentials).
- Namespaces: `static-forever-eu`, `dynamic-forever-eu`, `profile-forever-eu`.
- Rulesets: `/data/wow/ruleset/index` (dynamic). EU has 1 PvP, 2 Normal, 3 Roleplay, 15 Roleplay PvP. All are up.
- Auction index: `/data/wow/ruleset/{id}/auctions/` (trailing slash required) lists 15 houses, each with a name:
  - Alliance Auction House: 110, 111, 112, 119, 123
  - Horde Auction House: 113, 114, 115, 120, 124
  - Blackwater Auction House (neutral): 116, 117, 118, 121, 125
- Houses form five sets of three (Alliance/Horde/neutral). Two sets are large, two small and one empty (112/115/118):
  - `110/113/116` large (~170k listings per faction house)
  - `111/114/117` large
  - `112/115/118` empty (probably Hardcore, not launched yet)
  - `119/120/121` small
  - `123/124/125` small
- **The ruleset ID in the URL does not filter.** House 110 returns the same data under any ruleset. So we must work out which house set belongs to which ruleset.
- Listing fields: `id`, `item.id`, `buyout` (copper), `quantity`, `time_left`.
- Per-house commodities: `/auctions/{houseId}/commodities` works and is a separate, large list (stackable goods).
- Size: the big houses are ~15–17 MB each, plus commodities. Roughly 100–150 MB per region per hour, which is fine for GitHub Actions.
- Items: `/data/wow/item/{id}` (static) returns 404 for **~45%** of auctioned item IDs. Found items include `name` and `sell_price` (vendor price).
- Icons: `/data/wow/media/item/{id}` returns an icon URL on `render.worldofwarcraft.com/forever-eu/…`.
- Item search: `/data/wow/search/item?name.en_US=…` works.
- **Professions and recipes work**, including reagents and the crafted item: `/data/wow/profession/index` → `/profession/{id}` → `/skill-tier/{id}` → `/recipe/{id}`. **M5 (craft profit calculator) is feasible.**

**Still to test**
- Character profiles: needs `CHARACTER=` in `.env`.
- The US region.

**Plan changes**
1. **Map house sets to rulesets** before showing prices. Compare a few item prices in-game on a known ruleset with each house set, then hard-code the map and re-check it weekly.
2. **Item names:** use the Blizzard item endpoint where it works. Otherwise use Wowhead tooltip links (`wowhead.com/forever/item=ID`), which fill in the name and icon in the browser.
3. **M2 aggregates per house set:** lowest buyout, median of the cheapest 10%, total quantity and number of listings, for regular and commodity listings combined.
4. **M5 moves up** from "maybe" to "planned", since recipe data exists.

---

## 7. M2 status: the price job runs locally (2026-11-18)

Code is in `pipeline/`:
- `aggregate.js`: the price math, with 6 tests in `aggregate.test.js`.
- `blizzard.js`: the API client, with retries.
- `houses.js`: the auction-house groups.
- `store.js`: saves results (local files for now).
- `run.js`: the job itself.

Measured on EU:

| | Result |
|---|---|
| Download + price math, all houses | ~7 s, 1.6 million listings |
| Latest prices per group (A, B, C, D) | 200–440 KB each; group E (empty) skipped |
| History per shard, 1 day | ~50 KB → ~1.5 MB at 30 days (see note) |
| Item names | 3,000 per run; ~53% known to Blizzard, the rest fall back to Wowhead |
| API calls | ~35 per run, plus up to 3,000 item lookups while names fill in |
| Store writes | Hourly 5–6; first run of the day +32 history shards. ~170/day per region, under the 1,000/day free limit for one region. **For EU + US together, make the item-name cache weekly or split history by group.** |

Spot check: Copper Ore, Peacebloom and Light Leather in Alliance group A matched the separate comparison script exactly.

**Still to do for M2:**
- `store.kv` (Cloudflare Workers KV) and the GitHub Actions workflow. Both need the Cloudflare account.
- ~~Shrink the history shards~~ Done 2026-11-19: history is now split per group (`history:{region}:{group}:{shard}`).
- Map the house groups to rulesets. **EU group A = PvP, confirmed 2026-11-19:** Horde AH prices for Peacebloom, Silverleaf, Copper Ore and Light Leather all matched group A within a few copper, and every other group was 2–4× off. Still open:
  - EU group B (probably Normal)
  - EU groups C and D (Roleplay / RP-PvP)
  - all US groups

  Record each result in `pipeline/houses.js`.

---

## 8. M3–M5 built locally (2026-11-19)

All three work on localhost and are under **Tools** in the menu.

- **M3, Prices page:** a "Price changes & deals" panel (Rising, Falling, Deals) per auction house, computed daily by the job (`movers:{region}:{group}`). It shows a "1 day of history so far" message until there's enough data. The display was checked with temporary test data, then the real data was restored.
- **M4, Character lookup** (`character.html`):
  - `pipeline/character.js` returns only the shown fields.
  - The local server's `/api/character` route keeps the key on the server, caches for 15 minutes, rate-limits 30 lookups per minute, and checks an opt-out list of hashes (`data/optout.json`, filled with `tools/optout.js`).
  - Bad names, bad regions and unknown characters are all handled.
  - **Not yet tested with a real character:** field shapes for gear, professions and reputations are coded defensively from the forum report.
- **M5, Craft profit calculator** (`crafting.html`):
  - Covers 2,493 recipes across 12 professions, refreshed every 25 days.
  - Materials use the AH market price, falling back to Blizzard's vendor price; profit allows for the 5% AH cut.
  - It shows how many are listed and hides "thin markets" (fewer than 3 listed) by default, because a single listing can show an unrealistic profit.
- **Shared math:** the price math moved to `js/pricemath.js`, used by both the job and the browser. 10 tests, all passing.
- **Security fix:** `serve.js` no longer serves dotfiles (`.env`, `.git`).

**Write budget per region per day** (KV free limit 1,000):

| Writes | Count |
|---|---|
| Hourly: 4 group files + meta (+ items when changed) | ~120–150 |
| Daily: 128 history shards + 4 movers files | 132 |
| Every 25 days: recipes | 1 |
| **Total per region** | **~260–290** |

EU + US together come to about 520–580, which is OK.

---

## 9. Item pages (SEO) and vendor flips (2026-11-19)

- **Vendor flips:** the hourly job finds listings priced below what a vendor pays (`computeFlips`, tested). It stores them inside each group file, so there are no extra KV writes. Shown on `flips.html`. A flip must earn at least 10c **and** 5% per item.
- **Item pages:** `node pipeline/build-items.js` writes ~5,100 static pages (`item/<id>-<slug>.html`, ~32 MB) plus an A–Z index and `sitemap.xml`. Each page has:
  - price per region, ruleset and faction
  - a 30-day chart
  - vendor price
  - how to make it, and what it's used to craft
  - a canonical link and breadcrumb JSON-LD
- **These pages contain API data, so they are git-ignored and must be rebuilt daily** in the deploy workflow before uploading to Cloudflare Pages. That uses ~30 deploys a month of the 500 allowed. Rebuilding also drops items not seen within 30 days.
- **Cloudflare Pages free plan:** 20,000 files per site, and ~5,200 item files fit. The canonical/sitemap base URL comes from `--site=` or `SITE_URL`.

---

## 10. Recipe pages, crafting planner, talent calculator (2026-11-19)

- **Recipe pages:** `build-items.js` also writes ~2,500 `recipe/<id>-<slug>.html` pages and an index (git-ignored, rebuilt daily). Each page has:
  - materials with today's prices
  - profit on every auction house
  - "+ Add to my crafting plan"
- **Crafting planner** (`planner.html`):
  - Add recipes, set how many to craft, and get one combined shopping list with live AH and vendor prices.
  - A "Have" column subtracts what you own; there are totals and a copy-to-clipboard list.
  - The plan is saved in the browser. The math is `planShoppingList` (tested).
- **Talent calculator** (`talents.html`), built from the official API:
  - `pipeline/talents.js` saves `talents:{region}` every 25 days: 9 classes, 27 trees, 467 talents with rank descriptions, prerequisites and icons.
  - Blizzard numbers columns per class (1–4, 7–10, 14–17), so they are converted to 1–4 per tree. Three stray duplicate entries in Blizzard's data are skipped.
  - Rules are in `js/talentmath.js` (6 tests): 51 points at 60, 5 points per row, maxed prerequisites, safe unlearning, and shared links re-checked against the rules.
- **Not available from the API:** recipe skill levels, recipe sources and cast times. Those exist only in the game client files, which we don't use.
