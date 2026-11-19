# Forever Tome — unofficial WoW: Forever tools

A static website (plain HTML/CSS/JS, no build step) with tools for WoW: Forever: auction prices, vendor flips, crafting profits and planner, a talent calculator and a character lookup.

## Run it locally

```bash
node serve.js
```

Then open http://localhost:8080.

## Live data (Blizzard API)

Needs a Battle.net API client. Copy `.env.example` to `.env` and fill it in; `.env` is never committed.

| Command | What it does |
|---|---|
| `node tools/probe.js` | Checks which WoW: Forever API data exists; writes a local report |
| `node tools/house-compare.js` | Prices of common items per auction-house group (to identify rulesets) |
| `node pipeline/run.js` | The price job: downloads auctions, computes prices, saves to `out/` |
| `node --test pipeline/aggregate.test.js` | Tests for the price math |
| `node pipeline/build-items.js` | Builds one SEO page per item (`item/…html`), the A–Z index and `sitemap.xml` from the job's data |
| `node tools/optout.js eu "Firstname Lastname"` | Hide a character from the character lookup (stores a fingerprint, not the name) |

With `node serve.js` running and `.env` filled in, every tool works on localhost. The local server also answers `/api/character`; once the site is online, a Cloudflare Worker will provide the same endpoint.

`out/` holds Blizzard API data and is git-ignored. Blizzard's API terms allow keeping that data for at most **30 days**; the job prunes it automatically each time it runs. Delete `out/` if you stop running it. See [docs/phase2-plan.md](docs/phase2-plan.md) for the full plan.

## Where things live

| File | What it holds |
|---|---|
| `js/config.js` | **Your settings**: site name, donate link, AdSense id |
| `js/pricemath.js`, `js/talentmath.js` | Price, crafting and talent math shared by the pages and the pipeline |
| `js/site.js` | Header/footer and the code behind each page (rarely needs changes) |
| `css/style.css` | The WoW-style theme |
| `*.html` | One file per page |

## Accessibility built in

- Display settings (sliders icon in the header): text size, high contrast, underlined links, reduced motion. Each visitor's choice is saved in their browser.
- Skip-to-content link, visible keyboard focus, screen-reader labels and announcements, proper table headers, and respect for the system "reduce motion" setting.
- When you change a page, keep link text descriptive (not "click here") and don't use colour alone to show meaning.

## Turn on donations

Create a free Ko-fi / Buy Me a Coffee / Patreon page, then set `donateUrl` in `js/config.js`. Donate buttons appear automatically.

## Turn on ads (Google AdSense)

1. Publish the site on its own domain first. AdSense won't approve a site without real traffic and content.
2. Apply at https://adsense.google.com and add the verification snippet they give you.
3. Put your `ca-pub-…` id in `adsenseClient` in `js/config.js`. The ad slots on every page switch on.
4. Create an `ads.txt` file in the site root with the line AdSense gives you.
5. Visitors from the EU/UK need a cookie-consent banner for personalised ads. AdSense offers a built-in consent message: enable it in AdSense under *Privacy & messaging*.

## Publish for free

Any static host works:

- **Cloudflare Pages** or **Netlify**: drag-and-drop the folder, or connect a GitHub repo.
- **GitHub Pages**: push the folder to a repo and enable Pages.

Then buy a domain (about $10/year) and point it at the host.

## Credits

Game data is provided by Blizzard Entertainment through the Blizzard Developer API. Not affiliated with Blizzard Entertainment.
