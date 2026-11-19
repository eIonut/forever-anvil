# Forever Tome — unofficial WoW: Forever tools

A static website with tools for WoW: Forever: auction prices, vendor flips, crafting profits and planner, a talent calculator and a character lookup.

**The site is moving to Astro** ([plan](docs/astro-migration-plan.md)). Steps 1–4 are done: every page and tool runs on Astro (`npm run dev`). The old site still works (`npm run legacy`) until step 5 removes it.

## Run it locally

Needs Node.js 22.23.4 or newer. Install once:

```bash
npm install
```

Then:

| Command | What it does |
|---|---|
| `npm run legacy` | The old site at http://localhost:8080 (kept for comparison until step 5) |
| `npm run dev` | The new Astro site at http://localhost:4321 with every page and tool. It also serves the price data from `out/` and answers `/api/character` using your `.env` keys |
| `npm run build` | Builds the Astro site into `dist/`, including one page per item and recipe from the data in `out/` (about 20 seconds) |
| `npm test` | Tests for the price and talent math |

## Live data (Blizzard API)

Needs a Battle.net API client. Copy `.env.example` to `.env` and fill it in; `.env` is never committed.

| Command | What it does |
|---|---|
| `node tools/probe.js` | Checks which WoW: Forever API data exists; writes a local report |
| `node tools/house-compare.js` | Prices of common items per auction-house group (to identify rulesets) |
| `npm run prices` | The price job (`pipeline/run.js`): downloads auctions, computes prices, saves to `out/` |
| `npm run pages` | Old site only: builds one SEO page per item and recipe (`item/…html`, `recipe/…html`), the A–Z indexes and `sitemap.xml` from the job's data |
| `node tools/optout.js eu "Firstname Lastname"` | Hide a character from the character lookup (stores a fingerprint, not the name) |

With `npm run dev` running and `.env` filled in, every tool works on localhost, including the character lookup; once the site is online, a Cloudflare Worker will provide the same endpoint.

`out/` holds Blizzard API data and is git-ignored. Blizzard's API terms allow keeping that data for at most **30 days**; the job prunes it automatically each time it runs. Delete `out/` if you stop running it. See [docs/phase2-plan.md](docs/phase2-plan.md) for the full plan.

## Where things live

| File | What it holds |
|---|---|
| `src/config.js` | **Your settings**: site name, donate link, AdSense id (used by both the old and new pages) |
| `src/lib/pricemath.js`, `src/lib/talentmath.js` | Price, crafting and talent math shared by the pages and the pipeline |
| `js/site.js` | Header/footer and the code behind each page (moving to Astro components) |
| `js/legacy.js` | Loads the settings, shared math and `site.js` on the old pages (temporary, until the move is done) |
| `css/style.css` | The WoW-style theme |
| `*.html` | One file per page (old site) |
| `src/pages/` | Pages of the new Astro site (one file per page) |
| `src/layouts/BaseLayout.astro` | The frame of every new page: `<head>`, header, footer |
| `src/components/` | Header, footer, settings panel, ad space, donate box and other shared pieces |
| `src/lib/nav.ts` | The header and footer menus |
| `src/data/catalog.ts` | Reads `out/` at build time for the item and recipe pages |
| `src/pages/item/`, `src/pages/recipe/` | The item and recipe page templates and their A–Z indexes |
| `src/tools/` | The six interactive tools (Svelte components) and the pieces they share: pickers, prices, item links, charts |
| `src/lib/` | Helpers shared by pages and tools: formatting, data loading, saved settings, crafting plan, Wowhead tooltips |
| `integrations/dev-api.ts` | `npm run dev` only: serves `out/` and `/api/character` |
| `public/` | Files served as-is: favicon, images, robots.txt |
| `pipeline/` | The price job, Blizzard API client and item-page builder |

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
4. Create an `ads.txt` file in the site root with the line AdSense gives you.
5. Visitors from the EU/UK need a cookie-consent banner for personalised ads. AdSense offers a built-in consent message: enable it in AdSense under *Privacy & messaging*.

## Publish for free

Any static host works:

- **Cloudflare Pages** or **Netlify**: drag-and-drop the folder, or connect a GitHub repo.
- **GitHub Pages**: push the folder to a repo and enable Pages.

Then buy a domain (about $10/year) and point it at the host.

## Credits

Game data is provided by Blizzard Entertainment through the Blizzard Developer API. Not affiliated with Blizzard Entertainment.
