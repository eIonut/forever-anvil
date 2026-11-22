# Addon plan: Forever Anvil in game

Goal: bring the site's tools into the game as a free addon, with our main strength intact: Blizzard API prices for every auction house, refreshed hourly. No other addon has that.

Status (2026-11-22): A0–A2 done (version 1 released). A3, version 2, built on the `addon-v2` branch and waiting for in-game testing. The talents import string moves to A4 with the talent helper that uses it.

---

## 1. What an addon can and can't do

Addons are Lua code running inside a locked-down environment in the game client. Before designing anything, these are the walls:

| Limit | What it means for us |
|---|---|
| **No internet** | The addon can't call foreveranvil.com, `/api` or the Blizzard API. Data has to arrive as files that ship with the addon. |
| **No file access** | It can read only its own bundled `.lua` files, plus one SavedVariables file that the game loads at login. |
| **SavedVariables are written only on logout, `/reload` or disconnect** | Nothing moves in or out of the game live. A companion app (see 3c) can only swap files between sessions. |
| **No automation** | Buying, posting, cancelling and crafting each need a real click or key press per action ("hardware event"). There's no "buy every cheap listing" button and no auto-posting loop. |
| **Only the auction house you're standing at** | An in-game scan only sees your own house. Prices for the other houses or the whole region exist only if we ship them in. |
| **Blizzard add-on policy** | Free, code readable (not obfuscated), no in-game ads, no in-game donation prompts, nothing that hurts server performance. The site's ads and donation box stay on the site. |

What the addon **can** do that the site can't:

- Read your gear, bags, bank (once you open it), profession skill and known recipes directly. No API delay and no character lookup needed.
- Hook item tooltips, the profession window, the merchant window and the auction house window, and draw our numbers right there.
- Scan your own auction house. If the Forever client still has the classic full scan (one every ~15 minutes), the addon can price your house more recently than our hourly job.

---

## 2. The data we would ship

The pipeline already builds everything, so the addon needs only a small slice of it.

| Data | Source today | Need it in the addon? |
|---|---|---|
| Per-house prices `[min, market, qty, listings]` | `out/prices_{region}_{group}.json` | **Yes**, the core of the addon |
| Sold per day | `salesdays_*`, `sales.js` | Yes |
| 7-day change | `movers_*` | Maybe (small) |
| Item names, quality, vendor price | `items_*.json` | **No**: the game has them (`GetItemInfo`) |
| Recipes and reagents | `recipes_*.json` | Mostly no: the profession window gives reagents. Keep a small table for recipes you don't know yet. |
| Disenchant rules | `src/lib/demath.js` | Yes, ported to Lua (small) |
| Upgrade rules and proficiencies | `src/lib/upgrades.js` | Yes, ported to Lua |
| Leveling routes | `src/data/leveling.ts`, `levelmath.js` | Yes |
| Talent trees | `talents_*.json` | No: the game has the talent window. We only import a build. |
| 30-day history | `history_*` | No (too big, little use in game) |

**Size.** Houses are per ruleset and faction, not per realm: 4 live groups × 3 houses (Alliance, Horde, Blackwater) in each region. EU prices are about 1.4 MB of JSON in total and US about 1.35 MB. Packed into Lua tables (or one encoded string per house, decoded only for your own house plus the region average), the whole data file should land at about **1–3 MB per region**. That's well within what large addons ship. We ship EU and US as separate data modules so nobody loads both.

**Which house are you on?** The addon knows your realm name (`GetRealmName`) and faction (`UnitFactionGroup`), but not the ruleset. Ship a realm → group map built from the Blizzard realm index (the pipeline already knows the groups from `pipeline/houses.js`). Fall back to asking once in a settings dropdown. Blackwater (neutral) is detected when the auction window opens in a neutral town.

**Blizzard API terms still apply** to data we pass on: show "Data provided by Blizzard Entertainment" on the addon's About panel and listing page, and never ship data older than 30 days (we only ship current numbers anyway).

---

## 3. Getting fresh data into the game

### 3a. Data ships inside the addon (first version)

```
hourly job (exists) ──▶ out/*.json
                          │  new step: pipeline/addon-data.js
                          ▼
                    addon/ForeverAnvil_Data_EU/Data.lua   (and _US)
                          │  GitHub Action, 1–4× a day
                          ▼
                CurseForge + Wago release  ──▶  player's addon manager updates it
```

- Packaging and upload are handled by the BigWigs packager action (free, widely used).
- Prices are hours old, but the cost is $0 and players do nothing beyond keeping the addon updated. Raider.IO handles its data this way.
- The tooltip always shows how old the data is, as the site does with freshness.

### 3b. Import strings (small, personal data)

The site makes a short compressed string and the player pastes it into the addon:

- watchlist → in-game alerts
- crafting plan → shopping list
- talent build → highlighted next point

It works the other way too: the addon gives a string to paste on the site (for example a character's gear, for upgrades on alts). No servers, no accounts.

### 3c. Companion app (later, only if the addon takes off)

A small desktop app that downloads `/api` data every hour, writes it into the AddOns folder, and lets the player `/reload` for fresh prices. Opt-in, it could also upload the addon's own scans back to us, making our data fresher between hourly API snapshots.

Costs: a separate Windows/Mac program to build, sign and support, plus trust (people are wary of installing an .exe). It would also need a privacy policy update before any upload. **Not** in the first version.

---

## 4. Site tools in the game

| Site tool | Addon feature | Where it shows | Version |
|---|---|---|---|
| Prices | Tooltip: market, min, sold per day, region average, vendor price, data age | Every item tooltip | **1** |
| Disenchant flips | Tooltip: disenchant value and skill needed; flag listings worth disenchanting | Tooltip, auction list | **1** |
| Vendor flips | Highlight listings below vendor sell price | Auction list | **1** |
| Craft profits | Profit per recipe and per material, using your house's prices | Profession window | **1** |
| Upgrades | "Better by X" badge on tooltips and auction listings, from your real gear | Tooltip, auction list | 2 |
| Profession leveling | Next recipe to craft, color by skill-up chance, from your real skill | Profession window | 2 |
| Watchlist | Alert when a scan finds an item at or below your price | Auction window, chat | 2 |
| Crafting planner | Shopping list that ticks off from bags and bank | Small movable frame | 2 |
| Waylaid crates | Crate value on the tooltip | Tooltip | 2 |
| Talent calculator | Import a build; highlight where the next point goes | Talent window | 3 |
| Own-house scanning | Fresh local prices, used before shipped prices when newer | Auction window | 3 |
| Character lookup | Not needed: you're already in game | — | — |
| Economy overview | Not a good fit; stays on the site | — | — |

Every buy, post and craft stays one click each. The addon finds and highlights; the player acts.

---

## 5. How the code is laid out

All in this repo, so prices and rules come from one place:

```
addon/
  ForeverAnvil/              core: tooltips, windows, settings, Lua ports of the math
    ForeverAnvil.toc
    Core.lua  Tooltip.lua  Auction.lua  Profession.lua  Merchant.lua  Import.lua
    Math/  disenchant.lua  upgrades.lua  leveling.lua
    Libs/  (LibStub, LibDeflate for strings, AceDB if useful)
  ForeverAnvil_Data_EU/      generated, never edited by hand (load-on-demand)
  ForeverAnvil_Data_US/
pipeline/addon-data.js       writes the Data.lua files from out/*.json
.github/workflows/addon.yml  package and release
```

- **Keep the math in step:** `demath.js`, `upgrades.js` and `levelmath.js` get Lua twins. The existing JS tests produce a fixtures file of inputs and expected outputs, and a small Lua test (run with plain `lua` in CI) checks the Lua ports against it, so the site and the addon can't drift apart.
- **Performance:** decode only your own house at login, cache tooltip lookups, and never scan more often than the client allows.

---

## 6. Milestones

### A0: Check the client (≈30 minutes in game)
- **You:** run these in game and send me the output:
  - `/dump select(4, GetBuildInfo())` gives the interface number for the `.toc` file.
  - `/dump C_AuctionHouse ~= nil` tells us if the modern auction API exists.
  - `/dump QueryAuctionItems ~= nil` tells us if the classic auction API exists (and with it the full scan).
  - `/dump GetTradeSkillInfo ~= nil`, `/dump C_TradeSkillUI ~= nil` tell us which profession window API it uses.
- **You:** check that "Forever Anvil" isn't already taken on CurseForge and Wago, and create author accounts on both.
- These answers decide how sections 4 and 5 get built, so nothing else starts before them.

### A1: Version 1, read-only helper
- Data generator plus EU/US data modules, and realm → house detection.
- Tooltips (prices, disenchant value, vendor price, data age), auction list highlights (vendor and disenchant flips), profit in the profession window.
- About panel with Blizzard credit and a link to foreveranvil.com (text only: addons can't open a browser).
- **Done when:** you play an evening on EU PvP Horde and the tooltip prices match the site's `/prices` for the same items.

### A2: Release pipeline
- GitHub Action packages and uploads to CurseForge and Wago 1–4× a day, with version = data date.
- Add an "In-game addon" mention on the site (About page plus one line on `/prices`).

### A3: Version 2, personal tools
- Upgrades, leveling helper, watchlist alerts, crafting shopping list, crates.
- Import strings between the site and the addon (add a "Copy for addon" button on `/watchlist`, `/planner` and `/talents`).

### A4: Version 3, optional extras
- Talent build helper, own-house scanning.
- Decide on the companion app based on downloads and feedback.

---

## 7. Money

- The addon must be free, with no ads or donation prompts in game (Blizzard policy).
- CurseForge's author rewards programme pays by downloads.
- The addon listing page and the About panel point to foreveranvil.com, where the ads and donation box already live. The addon brings people to the site rather than replacing it.

## 8. Open questions

1. Which auction and profession APIs the Forever client exposes (A0 answers this).
2. Whether the classic full auction scan exists, and how often it's allowed.
3. Whether to show US prices in the addon while US rulesets are still only "likely" (the site hides them today; the addon should probably match).
4. How often players will put up with data-only releases (daily is normal for Raider.IO-style addons; hourly would be too noisy).
