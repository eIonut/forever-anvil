# SEO report: Forever Anvil

20 November 2026. Covers the whole site as built from the current `out/` data: 10,907 pages.

## Summary

The site was already in good shape for search: it's static HTML (no content hidden behind JavaScript), every page had a title, description and canonical link, item and recipe pages had breadcrumb data, and there was a sitemap and robots.txt. The weak spots were:

- **Few ways in to the 10,000+ item and recipe pages.** They were reachable only from two giant A–Z lists (`/item` is 2.9 MB). Search engines value pages more when many related pages link to them.
- **No pages for the searches people actually type**, such as "wow forever tailoring recipes", "wow forever mage talents" or "wow forever trade goods prices".
- **No share picture.** Links posted on Discord, Reddit or X showed as plain text.
- **Duplicate titles.** 148 pairs of items and recipes share a name (an original and a newer version), so 297 pages had the same title as another page.
- **Short descriptions** on 616 item pages that aren't on the Auction House right now.
- **Wasted crawling.** Every item page links to `/prices?item=…`, which gives crawlers about 10,000 extra addresses that are all the same page.
- **No 404 page, no site-name data, no search-console hooks.**

All of these are fixed. The audit of the new build finds no missing or duplicate titles or descriptions, no broken internal links and no orphan pages (pages with no links to them).

## What changed

### New pages: 108 hub pages

| Pages | Address | Targets searches like |
|---|---|---|
| 9 professions (all with 10+ recipes) | `/profession/tailoring` | "wow forever tailoring recipes", "… leveling", "… profit" |
| 13 item categories, split into pages of 100 (77 pages) | `/items/trade-goods`, `/items/armor/2` | "wow forever trade goods prices", "… consumables" |
| 9 classes | `/talents/mage` | "wow forever mage talents", "… talent calculator" |
| 404 page | `/404` | (kept out of search) |

- **Profession pages:** every recipe in skill order with how it's learned, today's material cost and profit, the 10 most profitable crafts right now, and the materials the profession uses most.
- **Category pages:** every item of that kind, most valuable first, with market price, quantity listed and vendor price.
- **Class pages:** the talent calculator opened on that class, plus every talent of its three trees written out (tier, ranks, prerequisites, top-rank description). Before this, the talents existed only inside the interactive tool, which search engines read poorly.

All of these are generated from the same Blizzard data as the rest of the site, so they stay tools and data, not editorial content.

### Internal linking

- **Item pages:** breadcrumb now includes the category (Home › Item prices › Trade Goods › Copper Ore), plus a new **Similar items** box with 12 items of the same kind at about the same price.
- **Recipe pages:** breadcrumb now includes the profession, plus a new **More recipes at this skill** box with 10 recipes of the same profession.
- **Home page:** a new **Browse** section links every profession, item category and class.
- `/item`, `/recipe` and `/talents` link to their category, profession and class pages.

Result: every page now has links from other pages (half have 14 or more), and every item and recipe is at most three clicks from the home page.

### Tags in every page's `<head>` (`src/components/Seo.astro`)

- **Share pictures:** `og:image` and `twitter:card = summary_large_image`, with 10 branded 1200×630 pictures in `public/og/` (one per tool). Redraw them with `node tools/og-images.js`.
- `twitter:title`, `twitter:description`, `og:locale`, `theme-color`.
- `robots: max-image-preview:large, max-snippet:-1`: lets Google show large previews and full snippets.
- Descriptions longer than 160 characters are cut at a word boundary, so results don't end mid-word.
- Optional ownership tags for Google and Bing (`googleSiteVerification` and `bingSiteVerification` in `src/config.js`).
- A `<link rel="sitemap">` in every page.

### Structured data (JSON-LD)

- **Home:** `WebSite` and `Organization`, which help Google show "Forever Anvil" as the site name in results.
- **Class talent pages:** `WebApplication` (free).
- **Breadcrumbs** on item, recipe, category, profession and class pages now include the middle level (category or profession).

### Titles and descriptions

- Items and recipes that share a name now have the id in the title, e.g. "Crusader's Boots (ID 250507) Price, WoW: Forever". Duplicate titles went from 148 groups to 0.
- Items that aren't on the Auction House now get a full description (quality, kind, vendor price, crafting). Descriptions under 70 characters went from 616 to 0.
- Recipe titles are shorter: "Bolt of Linen Cloth: Tailoring Recipe, Cost & Profit | WoW: Forever".
- Page 2 onward of a category has the page number in its title; page 1 doesn't.

### Crawling

- `robots.txt` now has `Disallow: /*?`. Addresses with `?item=…` or `?q=…` are the same page as without them (the canonical link already says so), and this keeps crawlers on the real pages.
- New `404.astro`: tagged noindex, left out of the sitemap, and links back to the tools.

## Numbers

| | Before | After |
|---|---|---|
| Pages in the sitemap | 10,799 | 10,906 |
| Pages with a share picture | 0 | 10,907 |
| Duplicate title groups | 148 | 0 |
| Duplicate description groups | 46 | 0 |
| Descriptions under 70 characters | 616 | 0 |
| Pages without any links to them | not measured | 0 |
| Broken internal links | not measured | 0 |
| Average title / description length | 63 / 138 | 60 / 145 characters |

The "before" numbers for titles and descriptions come from the first audit run, after the hub pages were added but before the title and description fixes. Those fixes are what changed them.

## What you need to do after launch

The code side is done. These steps are off-site and only you can do them:

1. **Google Search Console and Bing Webmaster Tools.** Add `foreveranvil.com` (verify by DNS in Cloudflare) and submit `https://foreveranvil.com/sitemap-index.xml` in both. Bing also feeds DuckDuckGo and ChatGPT search.
2. **Keep the daily rebuild.** Item and recipe pages show prices and dates, and Google favours pages that change. The sitemap's `lastmod` updates with each build.
3. **Get links from the community.** This matters most for a new domain. Post useful finds (top crafts this week, vendor flips) on the WoW: Forever subreddits, Discord servers and forums, with links to the matching page. Ask addon and guide authors to link the talent calculator. The share pictures make those links look good.
4. **Cloudflare settings.** Turn on "Always Use HTTPS" and choose one hostname (redirect `www.` to the bare domain, or the reverse).
5. **Watch Search Console for 4–6 weeks.** Under *Pages*, "Crawled – currently not indexed" shows which pages Google judges too thin. Expect some low-value items (grey quality, quest items) there; that's normal.

## Optional next steps

Ranked by expected value:

1. **IndexNow.** A small step in the daily job that tells Bing and Yandex which pages changed, so they're picked up within hours. Cloudflare can do this automatically with *Crawler Hints* (one switch in the dashboard).
2. **A lighter `/item` page.** It's 2.9 MB because it lists 9,800 items with icons. Now that the category pages exist, it could become a hub (categories, letters, search) with A–Z pages per letter. This would help mobile speed. It also changes how the search box works, so it's your call.
3. **noindex for the lowest-value item pages.** For example, grey-quality items that aren't on the Auction House and aren't used in any recipe. This concentrates Google's attention on pages people search for. Wait for Search Console data before doing this.
4. **Profession leveling paths.** Pages that work out the cheapest way to level a profession from today's prices (e.g. `/profession/tailoring/leveling`). Those searches get a lot of traffic, and the page would be built from data you already have.
5. **An app icon (`apple-touch-icon.png` plus a web manifest)** for phones that save the site to the home screen. This has a small SEO effect.

## Files

New: `src/pages/items/[...path].astro`, `src/pages/profession/[slug].astro`, `src/pages/talents/[cls].astro`, `src/pages/404.astro`, `public/og/*.png`, `tools/og-images.js`.
Changed: `src/components/Seo.astro`, `src/layouts/BaseLayout.astro`, `src/data/catalog.ts` (category, profession, talent and similar-item helpers), `src/lib/urls.ts`, the item, recipe, index, talent and tool pages, `src/tools/Talents.svelte` (opens on a given class), `public/robots.txt`, `astro.config.mjs`, `src/config.js`, `README.md`.
