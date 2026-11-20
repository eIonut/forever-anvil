# Astro migration plan

Goal: move Forever Anvil from hand-written HTML and one large script to an Astro project. The new code should be split into small, clearly named parts, so a change touches one file instead of hunting through `js/site.js`. Every page and tool should keep working exactly as today, and the SEO should be at least as good as now.

Hosting stays as planned in [phase2-plan.md](phase2-plan.md): Cloudflare Pages (free) for the site, a Cloudflare Worker for `/api`, GitHub Actions for the price job. Astro builds plain static files, so no server or paid plan is needed.

---

## 1. Why, in one table

| Today | After the move |
|---|---|
| `js/site.js` (1,179 lines) holds the header, footer, settings, ads and all seven tools, picked by `data-page` | One component per piece. A tool is one file, plus the shared helpers it uses |
| Header, footer and menu are drawn by JavaScript, so search engines that don't run scripts see no menu links | Header and footer are plain HTML on every page. Internal links are visible to every crawler |
| The `<head>` (title, fonts, icons, scripts) is copied into 9 HTML files plus `build-items.js` | One `BaseLayout` writes the `<head>` for every page. Each page only passes its title and description |
| `build-items.js` builds ~10,700 item and recipe pages by gluing HTML strings, with its own copy of `money()` and other helpers | Item and recipe pages are normal Astro templates that use the same components as the rest of the site |
| No build step, no type checking | `astro build` catches broken imports and template errors before deploy. Editor autocomplete works |

What stays the same: the look (same CSS), the pipeline and its data files, the price and talent math, the URLs' content, the accessibility features, and the Blizzard data rules (generated pages are still git-ignored and rebuilt daily).

## 2. Decisions (defaults; say if you want different)

| Topic | Choice | Why |
|---|---|---|
| Astro version | Current Astro (7.x when written). Pin the exact version when we start | Needs Node 22 LTS or newer. This computer has Node 24, which is fine |
| Interactive tools | **Svelte** components, loaded only on the page that needs them | Each component keeps markup, logic and styles together and reads close to HTML. Small download. Pages without a tool ship no framework code |
| Language | TypeScript in new site code. Shared math stays plain JavaScript (ES modules) with JSDoc type comments | The price job keeps running on plain Node with no extra tools |
| URLs | Clean URLs: `/prices`, `/item/2770-copper-ore`. Cloudflare Pages redirects old `.html` links automatically | The site isn't public yet, so changing them now costs nothing |
| Settings file | `src/config.js`, plain JavaScript | Old and new pages both read it during the move, so there's one copy |
| Styles | Keep `css/style.css` as the global theme. Move tool-specific rules into their component over time | Same look on day one. No big CSS rewrite |
| Fonts | Self-host the Google Fonts (Cinzel, Alegreya Sans) | Faster first paint and no request to Google, which also helps the privacy page |
| Local storage keys | Keep `codex-plan` and the display-settings keys unchanged | Visitors keep their crafting plan and settings |

## 3. New folder layout

```
astro.config.mjs          site URL, sitemap, Svelte
package.json              scripts: dev, build, preview, test, pipeline
public/                   copied as-is: favicon.svg, robots.txt, ads.txt (later)
src/
  config.js               site settings (was js/config.js)
  layouts/
    BaseLayout.astro      <head> + SEO tags, skip link, header, footer, ad slots
  components/
    Seo.astro             title, description, canonical, Open Graph, JSON-LD
    Header.astro          menu (static HTML), plan badge, settings button
    Footer.astro
    SettingsPanel.astro   text size, contrast, underlines, reduced motion (+ small script)
    AdSlot.astro  DonateBox.astro  Wowhead.astro  BackToTop.astro
    Money.astro  ItemLink.astro  ItemIcon.astro      (shared by item, recipe and index pages)
  tools/                  Svelte "islands", one per tool
    Prices.svelte  Movers.svelte  Flips.svelte  Crafting.svelte
    Planner.svelte  PlanButton.svelte  Talents.svelte  Character.svelte
  lib/
    pricemath.js  talentmath.js   shared with the pipeline (were js/*.js)
    format.ts                     money text, "3 hours ago", escaping
    api.ts                        where price files come from (local out/ or the Worker)
    plan.ts  prefs.ts  store.ts   crafting plan, display settings, safe localStorage
  data/
    items.ts  recipes.ts          read ./out at build time for the item and recipe pages
  pages/
    index.astro  prices.astro  flips.astro  crafting.astro  planner.astro
    talents.astro  character.astro  about.astro  privacy.astro
    item/index.astro    item/[slug].astro
    recipe/index.astro  recipe/[slug].astro
  styles/global.css       (was css/style.css)
integrations/dev-api.ts   local-only /api/character and /out/* (replaces serve.js)
pipeline/                 the price job, unchanged apart from imports
tools/                    probe, house-compare, optout (unchanged)
```

Removed at the end: `js/site.js`, `js/legacy*.js`, the nine root `*.html` files, `serve.js`, and most of `pipeline/build-items.js`.

## 4. Steps

Each step ends with the site working, so we can stop or pause at any point. Work happens on a branch and is merged when step 6 passes.

### Step 1: Scaffold (done 2026-11-19, branch `astro-migration`)

What was done:
- Astro 7.4.13, `@astrojs/svelte` 9.1.6 (Svelte 5.58.0) and `@astrojs/sitemap` 3.7.6 are installed, with versions pinned. Node 22.23.4 or newer is required.
- `astro.config.mjs` sets clean URLs and the site URL (`SITE_URL` overrides it). `src/pages/index.astro` is a `noindex` placeholder until step 2.
- The math moved to `src/lib/` as ES modules. The pipeline, tools, tests and `serve.js` now use `import`. `pipeline/aggregate.js` is gone; code imports `src/lib/pricemath.js` directly.
- The old pages still work through a temporary bridge, removed in step 5. `js/legacy.js` loads the shared math into the globals `site.js` expects, then `site.js` itself. The old pages and `build-items.js` load it as one module script.

Checks:
- All 22 tests pass.
- Before the script-tag change, `build-items.js` produced all 10,727 files byte-for-byte identical to the old version. After it, the only difference is the one script line.
- The live price job ran cleanly. `/api/character` still answers.
- In the browser, the old prices, crafting, flips, planner, talents, item index, item and recipe pages all work with no console errors.
- `astro build` and `astro check` pass with 0 errors.

Original plan:
- Create the Astro project in this repo with Svelte and the sitemap plugin. Add `npm run dev | build | preview | test`.
- Convert the pipeline from `require` to `import`, and move `js/pricemath.js` and `js/talentmath.js` to `src/lib/` as ES modules. The browser globals `window.PriceMath` and `window.TalentMath` go away.
- **Done when:** `npm test` passes all existing tests (price math, talent math), and `node pipeline/run.js` still writes the same `out/` files.

### Step 2: Layout and the plain pages (done 2026-11-19)

What was done:
- `src/layouts/BaseLayout.astro` with `Seo`, `Header`, `Footer`, `SettingsPanel`, `DonateButton`, `DonateBox`, `AdSlot` and `BackToTop` in `src/components/`.
- Menus are in `src/lib/nav.ts`. Small helpers: `store.ts` (safe localStorage), `prefs.ts` (display settings), `announce.ts` (screen-reader messages).
- Home, About and Privacy are in `src/pages/` and link to clean URLs. Links to tools 404 on the Astro site until steps 3–4.
- Every page now gets a canonical link and Open Graph tags. Saved display settings apply in `<head>`, so pages no longer flash before the settings load.
- Fonts are self-hosted with Fontsource (`@fontsource/cinzel`, `cinzel-decorative`, `alegreya-sans`). The new Privacy page no longer lists Google Fonts, and its date is November 19, 2026.
- Shared with the old site so there's one copy of each:
  - Settings moved to `src/config.js`. The old pages get it through `js/legacy-globals.js`, and the `js/config.js` script tag is gone.
  - Favicon, `img/` and `robots.txt` moved to `public/`. `serve.js` falls back to `public/`, and the CSS uses `/img/…`.
  - The Astro layout imports `css/style.css` directly. It moves in step 5.

Checks:
- At 1024px and 375px, every header, heading and card has the same position and size as the old pages.
- The one layout difference: the home footer sits 48px higher, because the empty donate wrapper (shown when no donate link is set) is no longer output.
- Page text is the same as the old pages, apart from the two Privacy edits above.
- Settings panel: opening, text size, contrast, Escape to close with focus returned, saving across a reload, and reset all work. The settings storage key is unchanged.
- Mobile menu: opening, focus on the first link, and closing on an outside click work. Back-to-top works. No horizontal scroll at 375px.
- No console errors. Tests, `astro check` and `astro build` pass. The old site still works, including item pages.

Original plan:
- `BaseLayout`, `Seo`, `Header`, `Footer`, `SettingsPanel`, `AdSlot`, `DonateBox`, `BackToTop`, built from today's header/footer/settings code in `site.js`.
- Move Home, About and Privacy into `src/pages/`.
- Keep the accessibility features: skip link, visible focus, the screen-reader announcer, `aria-current` on the menu, reduced-motion support, and the fit-the-header logic for narrow screens.
- **Done when:** these three pages look the same as today side by side (screenshots at desktop and phone width), and the settings panel and mobile menu work.

### Step 3: Item and recipe pages (done 2026-11-19)

What was done:
- `src/data/catalog.ts` reads `out/` once per build: prices, 30-day history, item info and recipes. It gives the same results as `build-items.js`. With no data, item and recipe pages are skipped with a message, and the rest of the site still builds.
- Page templates: `src/pages/item/[slug].astro`, `src/pages/recipe/[slug].astro`, and the A–Z indexes `item/index.astro` and `recipe/index.astro`. Addresses are `/item/2770-copper-ore`, `/recipe/2359-bolt-of-linen-cloth`, `/item` and `/recipe`.
- New shared components: `Money`, `ItemIcon`, `ItemLink`, `ItemTitleIcon`, `PriceChart`, `Wowhead` (tooltips), `IndexSearch` and `PlanButton`.
- New helpers in `src/lib/`:
  - `format.ts`: money, numbers, dates
  - `urls.ts`: page addresses
  - `labels.ts`: region and faction names
  - `wowhead.ts`: tooltip attributes and loader
  - `plan.ts`: the crafting plan, with the same `codex-plan` storage
- `pricemath.js` now also exports `slugify`.
- The sitemap comes from `@astrojs/sitemap` (`sitemap-index.xml`), dated with the build day. `robots.txt` points to it.
- Small page scripts are shared files rather than copied into each page (`assetsInlineLimit: 0`).

Checks (EU data from 2026-11-19):
- 8,234 item pages, 2,493 recipe pages, 2 indexes, plus Home, About and Privacy: 10,732 pages in about 20 seconds.
- 10,803 files in total, under Cloudflare's 20,000-file limit.
- A comparison script checked all 10,729 generated pages against `build-items.js`. Everything matched: title, description, visible text, link targets (mapped to clean URLs), images and breadcrumb JSON-LD. Every page's canonical link is its clean URL.
- The comparison ignores whitespace between buttons in the flex button rows, which has no visual effect.
- At 1024px, the item page layout is identical to the old page.
- Recipe pages: "Add to plan" saves in the old format, and the plan badge and screen-reader message work.
- Item index: search filters as you type and announces the count.
- Tooltips load on item pages. No horizontal scroll at 375px, and no console errors.
- Page size: 13.7 KB, up from 8.8 KB, because the header, footer and settings panel are now HTML in every page. That's the price of crawlable menus, and compression on the host shrinks most of it. In total, `dist/` is 160 MB, up from about 86 MB.
- `build-items.js` still writes the old pages for `npm run legacy` until step 5.

Original plan:
- `src/data/items.ts` and `recipes.ts` read `out/` exactly as `build-items.js` does today.
- `item/[slug].astro` and `recipe/[slug].astro` build one page per item and recipe with the same content: prices per region, ruleset and faction, the 30-day chart, vendor price, how it's made and what it's used for, breadcrumb JSON-LD and the canonical link.
- The A–Z indexes and their type-to-filter search. The sitemap comes from the Astro plugin.
- `<base href="../">` and its focus workaround go away.
- **Done when:** the new build has the same number of item and recipe pages as `build-items.js`. A script compares every page's title, description and canonical link with the old output. The build stays under Cloudflare's 20,000-file limit (today ~10,700 pages).

### Step 4: The tools, one at a time (done 2026-11-19)

What was done:
- Six Svelte components in `src/tools/`: `Flips`, `Prices` (with `Movers` and `PriceHistory`), `Crafting`, `Planner`, `Talents` and `Character`. Each page in `src/pages/` adds its tool with `client:load`, so the tool's markup is still in the HTML for search engines.
- The static help text stays in the Astro page, passed into the tool. The planner's sidebar ad space is passed in the same way.
- Shared tool pieces:
  - `MarketSelects` (region / server group / auction house)
  - `Money`, `ItemIcon` and `ItemLink`
  - `itemIcons.svelte.ts` (the item cache for icons)
  - `types.ts` (shapes of the data files)
- New helpers:
  - `src/lib/api.ts`: data URLs, fetching, labels, the AH-or-vendor verdict, times, copy to clipboard
  - `src/lib/marketPrefs.ts`: the shared `codex-prices` choice
- All storage keys are unchanged: `codex-prices`, `codex-crafting`, `codex-plan`, `codex-talents`, `codex-char`.
- Moved forward from step 5: `integrations/dev-api.ts` serves `/out/*` and `/api/character` during `npm run dev`. The character endpoint logic (checks, rate limit, opt-out, 15-minute cache) now lives in `pipeline/character-api.js`, which both `serve.js` and the dev server use.
- Large data (prices, the item cache, recipes) is kept out of Svelte's deep reactivity (`$state.raw`), so the tables stay fast.

Checks: each tool was run side by side with the old page on the same data, and the results compared.

| Tool | Checks | Result |
|---|---|---|
| Vendor flips | 12 (4 groups × 3 auction houses) | all the same |
| Prices | 47 (every group and auction house, 6 sorts, 4 searches, rising / falling / deals), plus the details panel, `?item=` link, "Show 100 more" and focus | all the same |
| Craft profits | 28 (12 professions, 4 sorts, both filters, factions, groups, search, materials row), plus the `?q=` link | all the same |
| Crafting planner | 21 (all groups and auction houses, quantity and "have" edits including out-of-range values, search and add, remove, clear) | all the same |
| Talent calculator | 27 (9 classes, learn and unlearn by click, Shift-click, right-click and Delete, locked talents, details panel, level, reset, shared and hand-edited links) | all the same |
| Character lookup | 12 (a made-up profile and six error replies, since there's no real test character) | the same apart from a trailing `;` in inline styles |

Also checked:
- At desktop width, every heading, panel, control, table row and talent button has the same position and size on all six tools. Talent tooltips are placed at exactly the same spot.
- No horizontal scroll at 375px, and the page height is the same as the old pages.
- No console errors. `astro check` passes, and the dev server shows no Svelte warnings.
- Not run: `svelte-check`, because its download was blocked here. Worth adding as a dev dependency in step 5.

Small differences from the old pages, on purpose:
- Empty-data messages say `npm run prices` instead of `node pipeline/run.js`.
- After "✓ Added", the craft-profit "+ Plan" button goes back to its normal label. The old page restored it as plain text, which made the hidden recipe name visible.

Original plan:
Port each tool from `site.js` into its own Svelte component. The logic is copied as-is first; cleanup comes after it works. Order, smallest first:

| Tool | From `site.js` | Notes |
|---|---|---|
| Vendor flips | ~50 lines | Good first one to settle the pattern |
| Prices + price changes | ~250 lines | Region/group/faction pickers, sort, search, "show 100 more", item detail, `?item=` links from item pages |
| Craft profits | ~160 lines | Thin-market filter, `?q=` links from item pages |
| Crafting planner + "Add to plan" buttons | ~130 lines | Plan badge in the header updates live. Same `codex-plan` storage |
| Talent calculator | ~190 lines | Shared build links must keep decoding (`talentmath` checks them) |
| Character lookup | ~80 lines | `?r=eu&n=Name-Surname` links. Uses `/api/character` |

Shared pieces (money formatting, item icons, Wowhead tooltips, the price file URLs) go into `src/lib/` and `src/components/` the first time a tool needs them. No copies.

- **Done when:** each tool matches the old page on the same data: same numbers, same sorting, same empty and error messages, keyboard use and screen-reader labels.

### Step 5: Local API and cleanup (done 2026-11-19)

What was done:
- Deleted the old site:
  - `serve.js`
  - `js/site.js`, `js/legacy.js` and `js/legacy-globals.js`
  - the nine root `*.html` pages
  - `pipeline/build-items.js`, along with its local output (`item/`, `recipe/`, `sitemap.xml`; git-ignored, about 85 MB) and its `.gitignore` rules
- `css/style.css` moved to `src/styles/global.css`.
- `itemPath` and `recipePath` were removed from `pricemath.js`; only the old builder used them. The page-address tests now check `src/lib/urls.ts`, which the site uses. Node runs the `.ts` file directly.
- npm scripts are now `dev`, `build`, `preview`, `check`, `test` and `prices`:
  - `check` runs `astro check` and `svelte-check`; `svelte-check` 4.7.8 is pinned. It found one type error in `Talents.svelte`, now fixed.
  - `legacy` and `pages` are gone.
- The README is rewritten for the new layout, with a "How to change things" section. `phase2-plan.md` has a note mapping old file names to new ones.

Checks:
- **Fresh copy:** I copied only the files git tracks into an empty folder, then ran `npm ci`, `npm test`, `npm run check` and `npm run build`.
  - Tests: 22 pass. Both type checkers report 0 errors and 0 warnings.
  - The build makes 11 pages. There's no data in a fresh copy, so item and recipe pages are skipped with a message.
  - With `npm run dev`, all 11 pages answer. The Prices tool shows "No prices yet" with the `npm run prices` hint. `/api/character` answers `not-configured` without `.env`.
- **With real data:** the build makes 10,738 pages. The stylesheet's content hash is the same as before the move, so styles are unchanged.
- Nothing in the code references the deleted files. The only mentions are in the docs' history notes.

Plan for this step, as written before the work:
- Delete `serve.js`, `js/`, the nine root `*.html` files and the old-page part of `build-items.js`.
- Move `css/style.css` to `src/styles/`.
- Drop the `legacy` and `pages` npm scripts.
- Add `svelte-check`.

Original plan:
- `integrations/dev-api.ts` adds `/api/character` (with the 15-minute cache, rate limit and opt-out check, reusing `pipeline/character.js`) and serves `out/*` during `npm run dev` only. This replaces `serve.js`. The production Worker is still the M2/M0 task from the phase 2 plan.
- Delete the old files listed in section 3. Update `.gitignore` (`dist/`, `.astro/`).
- Rewrite the README's "Run it locally" and "Where things live" sections for the new layout.
- **Done when:** a fresh clone runs with `npm install` and `npm run dev`, every page works, and nothing references the old files.

### Step 6: Final check (checks done 2026-11-19; merge waiting for approval)

- **Links:** all 372,046 internal links on 10,738 built pages resolve, and so do all in-page anchors.
  - Fixed along the way: 3 items whose recipe data spells the name differently from the item data (e.g. "Vestments" / "Vestaments"). Links to them led to pages that don't exist; the old site had the same bug. Links to item pages are now built with `itemPageUrl()`, from the page's own name.
- **Click-through on the built site** (`npm run preview`, with real data): all 14 page types tested at 1024px and 375px. No horizontal scroll, broken images or console errors, and every tool loads. Item and recipe pages load no framework code.
- **Display settings:** with large text, high contrast, underlined links and reduced motion all on, Prices, Talents and an item page have identical computed styles and layout to the old site.
- **Lighthouse 13.6.0** (phone mode, run with Edge; old site served from `main`):

| Page | Performance (old → new) | Accessibility | Best practices | SEO | Script loaded (old → new) |
|---|---|---|---|---|---|
| Home | 83 → 92 | 100 → 100 | 100 → 100 | 100 → 100 | 79 KB → 4 KB |
| Prices | 65 → 83 | 99 → 99 | 100 → 100 | 100 → 100 | 154 KB → 101 KB |
| Item page | 72 → 84 | 99 → 99 | 96 → 96 | 100 → 100 | 154 KB → 70 KB (mostly Wowhead tooltips) |
| Talents | 62 → 70 | 99 → 99 | 100 → 100 | 100 → 100 | 84 KB → 31 KB |

- **Remaining Lighthouse warnings** are the same on both sites, so they came from the old pages:
  - "heading order" on four pages
  - "label doesn't match visible text" on talent buttons
  - layout shift on Talents while the trees load

  These are follow-ups, not regressions.

Original plan:
- `npm run build` with real `out/` data, then `npm run preview`. Click through every page at desktop and phone width, light and high-contrast settings.
- Lighthouse on Home, Prices, one item page and the talent calculator. SEO and accessibility scores should be at least today's, and item pages should load no framework JavaScript.
- **Done when:** all of the above pass. Then merge the branch.

## 5. SEO improvements that come with it

Done during the steps above:
- Menu and footer links in plain HTML on every page (step 2).
- One `Seo` component, so every page gets a title, description, canonical link and Open Graph tags. Today only item and recipe pages have canonical and Open Graph tags (steps 2–3).
- Clean URLs and an automatic sitemap (steps 1, 3).
- Self-hosted fonts and no framework code on item pages, so they load faster (steps 2–3).

Worth doing right after, as small follow-ups:
- Build the first rows of the Prices, Flips and Craft profit tables into the HTML at deploy time (default region and group), then refresh them in the browser. Search engines would see real content instead of "Loading…". Prices in the HTML would be up to a day old, so the page must show the time they're from.
- A 404 page with links to the tools.
- Note: don't use Google's "Product" structured data for in-game items. They aren't real products, and Google may treat that as misleading. Breadcrumbs (already there) are the safe choice.

## 6. Deploying (fits into M0/M2 of the phase 2 plan)

The GitHub Actions workflow becomes:
1. Run the price job (writes to Workers KV, and to `out/` for the build).
2. Once a day: `npm run build`, which builds the item and recipe pages from `out/`.
3. Upload `dist/` to Cloudflare Pages.

That's still ~30 deploys a month of the 500 allowed. Generated pages stay out of git, as Blizzard's 30-day data rule requires.

## 7. Risks

| Risk | Plan |
|---|---|
| A tool behaves slightly differently after the port | Copy logic first, change later. Keep the math in the tested shared files. Compare old and new pages on the same data before deleting anything |
| Accessibility features get lost | Checklist in step 2, re-checked in step 6 (keyboard, screen reader labels, focus, reduced motion) |
| Build time with ~10,700 pages | Expected to be a minute or two. Measure in step 3. If slow, read `out/` once and share it across pages |
| Item count grows past Cloudflare's 20,000-file limit | Today's ~10,700 leaves room. If it gets close, drop pages for items with no listings in 30 days, or move item pages to one Worker route |
| Wowhead tooltips miss content added after page load | The current re-scan logic moves into `Wowhead.astro`, and tools call it after they redraw |
| New tooling to learn (npm, Astro, Svelte) | Day-to-day is just `npm run dev`. The README gets a short "how to change X" section: a page, a tool, the menu, the settings |

## 8. What I need from you

1. OK on the defaults in section 2. The main one is Svelte for the tools. The alternatives are Preact (React-style) or plain scripts.
2. Nothing to set up for test data. The `out/` folder on this computer already has price data. Before step 3 I'll run `node pipeline/run.js` to refresh it, so old and new pages are compared on the same, current data.
3. Nothing else. No accounts or keys change.
