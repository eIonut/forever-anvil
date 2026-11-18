# Phase 2 plan: live auction prices and character lookup

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
