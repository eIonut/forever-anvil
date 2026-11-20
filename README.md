# Forever Anvil: unofficial WoW: Forever tools

A static website with tools for WoW: Forever: auction prices, a watchlist with target-price flags (starred items, saved in the browser; the home page shows them with this hour's flips, fastest sellers and best crafts for the visitor's auction house), an economy overview (materials ledger, gold by category, cross-house flips), vendor flips, the cheapest Merchant's Favor from Waylaid Crates, crafting profits and planner, a talent calculator and a character lookup. Built with [Astro](https://astro.build); the interactive tools are [Svelte](https://svelte.dev) components. See [docs/astro-migration-plan.md](docs/astro-migration-plan.md) for how the site moved to Astro.

## Run it locally

Needs Node.js 22.23.4 or newer. Install once:

```bash
npm install
```

Then:

| Command | What it does |
|---|---|
| `npm run dev` | The site at http://localhost:4321, updating as you edit. It also serves the price data from `out/` and answers `/api/character` using your `.env` keys |
| `npm run build` | Builds the site into `dist/`, including one page per item and recipe from the data in `out/` (about 20 seconds) |
| `npm run preview` | Serves the built `dist/` folder, to check a build before publishing |
| `npm run check` | Type checks (`astro check` and `svelte-check`) |
| `npm test` | Tests for the price, crafting and talent math and the page addresses |

Without data in `out/`, the site still builds and runs: the tools say there's no data yet, and item and recipe pages are skipped.

## Live data (Blizzard API)

Needs a Battle.net API client. Copy `.env.example` to `.env` and fill it in; `.env` is never committed.

| Command | What it does |
|---|---|
| `npm run prices` | The price job (`pipeline/run.js`): downloads auctions, computes prices, saves to `out/` |
| `node tools/probe.js` | Checks which WoW: Forever API data exists; writes a local report |
| `node tools/house-compare.js` | Prices of common items per auction-house group (to identify rulesets) |
| `node tools/optout.js eu "Firstname Lastname"` | Hide a character from the character lookup (stores a fingerprint, not the name) |

With `npm run dev` running and `.env` filled in, every tool works on localhost, including the character lookup.

## The live site (Cloudflare)

One Cloudflare Worker (`worker/index.js`, settings in `wrangler.jsonc`) serves the built site, the price data at `/api/...` from Workers KV, and `/api/character`. A GitHub workflow (`.github/workflows/site.yml`) runs the price job every hour, uploads changed files to KV (`node tools/kv-sync.js push`), and rebuilds and deploys the site daily and on every push to `main`. Setup steps and day-to-day notes: [docs/launch-checklist.md](docs/launch-checklist.md).

To try the Worker locally: `npm run build`, then `npx wrangler dev` (it reads the Blizzard keys from `.env`; load price data into its local KV with `npx wrangler kv bulk put <file> --binding DATA --local`).

`out/` holds Blizzard API data and is git-ignored. Blizzard's API terms allow keeping that data for at most **30 days**; the job prunes it automatically each time it runs. Delete `out/` if you stop running it. The built item and recipe pages contain that data too, so the live site must be rebuilt at least every 30 days (the plan is daily). See [docs/phase2-plan.md](docs/phase2-plan.md) for the data plan.

## Where things live

| File | What it holds |
|---|---|
| `src/config.js` | **Your settings**: site name, donate link, AdSense id, where live prices come from |
| `src/pages/` | One file per page. `item/[slug].astro` and `recipe/[slug].astro` build a page for every item and recipe; `items/[...path].astro` (item categories), `profession/[slug].astro` and `talents/[cls].astro` (one per class) build the hub pages that link them together |
| `public/og/` | Share pictures for links posted on Discord, Reddit, X… Redraw with `node tools/og-images.js` |
| `src/layouts/BaseLayout.astro` | The frame of every page: `<head>`, header, footer |
| `src/components/` | Header, footer, settings panel, the framed page banner (`PageHero.astro`), icons (`Icon.astro`, drawn in `src/lib/icons.ts`), SEO tags, ad space, donate box, and pieces of the item and recipe pages |
| `src/tools/` | The interactive tools (Svelte) and the pieces they share: pickers, prices, item links, charts |
| `src/lib/` | Code shared by pages and tools: the price and talent math (also used by the price job), formatting, page addresses, menus, saved settings, the crafting plan, Wowhead tooltips |
| `src/data/catalog.ts` | Reads `out/` at build time for the item and recipe pages |
| `src/styles/global.css` | The WoW-style theme |
| `public/` | Files served as-is: favicon, images, robots.txt |
| `integrations/dev-api.ts` | `npm run dev` only: answers `/api/...` from `out/`, and `/api/character` |
| `worker/` | The live site's Cloudflare Worker (`index.js`) and which `/api` addresses serve which files (`routes.js`) |
| `.github/workflows/site.yml` | Hourly price job, KV upload, daily deploy |
| `pipeline/` | The price job, the Blizzard API client and the character lookup. `pipeline/economy.js` adds the materials ledger's 24-hour price changes (`out/econ_<region>.json`) |
| `tools/` | Scripts: KV upload/download (`kv-sync.js`), API probe, ruleset check, character opt-out |

## How to change things

- **Text on a page:** edit its file in `src/pages/` (e.g. `src/pages/about.astro`).
- **The menu or footer links:** `src/lib/nav.ts`.
- **A tool:** its file in `src/tools/` (e.g. `src/tools/Flips.svelte`). The math it uses is in `src/lib/pricemath.js`; run `npm test` after changing it.
- **A new page:** add a `.astro` file in `src/pages/` that uses `BaseLayout` with a title and description; it gets the header, footer, SEO tags and a sitemap entry automatically.
- **Colours and styles:** `src/styles/global.css`.

Run `npm run check` and `npm run build` before publishing.

## Accessibility built in

- Display settings ("Display settings" in the footer): text size, high contrast, underlined links, reduced motion. Each visitor's choice is saved in their browser.
- Skip-to-content link, visible keyboard focus, screen-reader labels and announcements, proper table headers, and respect for the system "reduce motion" setting.
- When you change a page, keep link text descriptive (not "click here") and don't use colour alone to show meaning.

## Search engines

Every page gets a title, description, canonical link, share picture and breadcrumb data automatically, and the sitemap lists every page. After the site is live:

1. Add the domain in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) (verify by DNS in Cloudflare, or put the meta-tag code in `googleSiteVerification` / `bingSiteVerification` in `src/config.js`).
2. Submit `https://foreveranvil.com/sitemap-index.xml` in both.
3. See [docs/seo-report.md](docs/seo-report.md) for what's in place and what to do next.

## Turn on donations

Create a free Ko-fi / Buy Me a Coffee / Patreon page, then set `donateUrl` in `src/config.js`. Donate buttons appear automatically.

## Turn on ads (Google AdSense)

1. Publish the site on its own domain first. AdSense won't approve a site without real traffic and content.
2. Apply at https://adsense.google.com and add the verification snippet they give you.
3. Put your `ca-pub-…` id in `adsenseClient` in `src/config.js`. The ad slots on every page switch on.
4. Create `public/ads.txt` with the line AdSense gives you.
5. Visitors from the EU/UK need a cookie-consent banner for personalised ads. AdSense offers a built-in consent message: enable it in AdSense under *Privacy & messaging*.

## Publish

Run `npm run prices`, then `npm run build`, and upload the `dist/` folder to a static host. The plan is Cloudflare Pages (free), with a GitHub Actions job that runs both commands daily and deploys; see [docs/phase2-plan.md](docs/phase2-plan.md). Then buy a domain (about $10/year) and point it at the host.

## Credits

Game data is provided by Blizzard Entertainment through the Blizzard Developer API. Not affiliated with Blizzard Entertainment.
