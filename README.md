# Forever Tome — unofficial WoW: Forever tools

A static website with tools for WoW: Forever: auction prices, vendor flips, crafting profits and planner, a talent calculator and a character lookup. Built with [Astro](https://astro.build); the interactive tools are [Svelte](https://svelte.dev) components. See [docs/astro-migration-plan.md](docs/astro-migration-plan.md) for how the site moved to Astro.

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

With `npm run dev` running and `.env` filled in, every tool works on localhost, including the character lookup. Once the site is online, a Cloudflare Worker will provide the price data and `/api/character` (set `pricesApi` in `src/config.js`).

`out/` holds Blizzard API data and is git-ignored. Blizzard's API terms allow keeping that data for at most **30 days**; the job prunes it automatically each time it runs. Delete `out/` if you stop running it. The built item and recipe pages contain that data too, so the live site must be rebuilt at least every 30 days (the plan is daily). See [docs/phase2-plan.md](docs/phase2-plan.md) for the data plan.

## Where things live

| File | What it holds |
|---|---|
| `src/config.js` | **Your settings**: site name, donate link, AdSense id, where live prices come from |
| `src/pages/` | One file per page. `item/[slug].astro` and `recipe/[slug].astro` build a page for every item and recipe |
| `src/layouts/BaseLayout.astro` | The frame of every page: `<head>`, header, footer |
| `src/components/` | Header, footer, settings panel, SEO tags, ad space, donate box, and pieces of the item and recipe pages |
| `src/tools/` | The six interactive tools (Svelte) and the pieces they share: pickers, prices, item links, charts |
| `src/lib/` | Code shared by pages and tools: the price and talent math (also used by the price job), formatting, page addresses, menus, saved settings, the crafting plan, Wowhead tooltips |
| `src/data/catalog.ts` | Reads `out/` at build time for the item and recipe pages |
| `src/styles/global.css` | The WoW-style theme |
| `public/` | Files served as-is: favicon, images, robots.txt |
| `integrations/dev-api.ts` | `npm run dev` only: serves `out/` and `/api/character` |
| `pipeline/` | The price job, the Blizzard API client and the character lookup |
| `tools/` | One-off scripts: API probe, ruleset check, character opt-out |

## How to change things

- **Text on a page:** edit its file in `src/pages/` (e.g. `src/pages/about.astro`).
- **The menu or footer links:** `src/lib/nav.ts`.
- **A tool:** its file in `src/tools/` (e.g. `src/tools/Flips.svelte`). The math it uses is in `src/lib/pricemath.js`; run `npm test` after changing it.
- **A new page:** add a `.astro` file in `src/pages/` that uses `BaseLayout` with a title and description; it gets the header, footer, SEO tags and a sitemap entry automatically.
- **Colours and styles:** `src/styles/global.css`.

Run `npm run check` and `npm run build` before publishing.

## Accessibility built in

- Display settings (sliders icon in the header): text size, high contrast, underlined links, reduced motion. Each visitor's choice is saved in their browser.
- Skip-to-content link, visible keyboard focus, screen-reader labels and announcements, proper table headers, and respect for the system "reduce motion" setting.
- When you change a page, keep link text descriptive (not "click here") and don't use colour alone to show meaning.

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
