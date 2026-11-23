# Loot Comets addon

A small cosmetic addon, separate from Forever Anvil: items you loot fly into the bag slot they land in. No data, no site: it only watches your bags.

Made for WoW: Forever (interface `16001`), and listed for the other clients too: Retail `120105`, MoP Classic `50504`, Cataclysm Classic `40402`, Wrath Classic `30404`, Burning Crusade Classic `20506`, Classic Era `11509` (the same list as Bagnon's, one `## Interface:` line). The code uses the modern APIs first, with fallbacks for older clients (named bag buttons, the old settings page and colour picker). Only Forever has been tried in game; when a client's patch changes its number, update the list.

## How it works

| File | What it does |
|---|---|
| `LootComets/Logic.lua` | No game calls (tested in `pipeline/lootcomets.test.js`). `Gains` compares two looks at your bags: only items whose **total** went up count, so moving, splitting and swapping stacks is never loot. It also has the arc (a curve bent upwards), its easing and the comet's size over the flight. |
| `LootComets/Targets.lua` | Where a comet starts and lands. **Start:** the loot window's row, else the cursor at `LOOT_OPENED` (it's on the corpse you clicked), else the vendor, quest, mail, trade or profession window, else the middle of the screen. **Landing:** the item's slot in an open bag window (the combined bag or the separate ones), else that bag's button on the bag bar, else the backpack button, else the bottom right corner. |
| `LootComets/Comets.lua` | Drawing: one full-screen layer above the game's windows (never takes the mouse), one `OnUpdate` while something moves, pooled textures. A comet is the item icon (round, masked to a circle, or square with a coloured border) or a glowing orb, in a glow with a spinning twinkle. Trails: dots and streak are glow dots placed at earlier points on the same curve (so they look the same at any frame rate); dust sheds specks that drift down. Colour: the quality's, `customColor`, or a rainbow hue that turns as it flies. Landing (subtle, normal, big): a flash on the slot, rings, sparkles for green and better, and for epics a sound and a glow around the screen's edges (`Edge.tga` stretched over the screen). |
| `LootComets/Minimap.lua` | The minimap button and its menu (same pattern as Forever Anvil's): click for the menu, right-click for the settings, drag to move (`minimapAngle`). The menu launches test comets, cycles the look one click per row (comet, trail, colour, landing, from the settings page's `ns.CHOICES`), and has quick switches. Also registered in the addon compartment where the client has one. |
| `LootComets/Core.lua` | Settings (`LootCometsDB`), events and `/comets`. Bags are read on `BAG_UPDATE_DELAYED`, a frame later so a gear swap's `PLAYER_EQUIPMENT_CHANGED` is seen first. Quiet for a moment after gear swaps, bag swaps and closing the bank, and while the bank is open. |
| `LootComets/Options.lua` | The settings page: switches and speed and size sliders on the left (plain sliders, no template), rows of choices on the right (comet, trail, colour with the game's colour picker, arc, landing). Every change but a switch launches test comets. |
| `LootComets/Media/*.tga` | White glow, ring, star and screen-edge glow, tinted in game, drawn by `node tools/lootcomets-media.js`; and `Icon.tga`, the logo at 64×64 for the addon list and settings page, drawn from `brand/logo.svg` by `node tools/lootcomets-logo.js` (which also writes `brand/logo.png` for CurseForge). |

Only reads where the game's frames are; it never changes them, so it can't taint the game's UI.

Bag addons: **Bagnon** is supported (its inventory window, from the global `Bagnon.Frames`; its item buttons keep the bag in `.bag` and the slot as their ID). Others (Baganator, ElvUI bags, AdiBags) aren't looked for yet: with one of those, comets fly to the bag bar, or the bottom right corner when the bar is hidden too. The bank counts as open from `BANKFRAME_OPENED` to `BANKFRAME_CLOSED`, since bag addons hide the game's bank window.

The CurseForge and Wago page text (name with keywords, summary, categories, description) is in [LISTING.md](LISTING.md).

## Commands

- `/comets`: settings
- `/comets menu`: the minimap menu; `/comets minimap` brings the button back after hiding it
- `/comets test`: one comet of each quality, from the middle of the screen into items in your bags
- `/comets on`, `/comets off`
- `/comets debug`: version, how many are flying, where the last comet started and landed

## Releases

By hand only: Actions → "Loot Comets release" → Run workflow (`.github/workflows/lootcomets.yml`; it shows up there once it's on `main`).

- **Version:** `lootcomets/VERSION` (e.g. `1.0`). Raise it and add notes to `lootcomets/CHANGELOG.md` for every release: CurseForge rejects a second file with the same version.
- **How:** `tools/lootcomets-release.sh` stages `lootcomets/LootComets` in `build/lootcomets-src` as a throwaway git repo tagged with the version, then the BigWigs packager zips and uploads it.
- **Projects:** create a Loot Comets project on CurseForge (and Wago), then put the ids in `LootComets.toc` as `## X-Curse-Project-ID:` and `## X-Wago-ID:`. Until then, the run skips the upload and keeps the zip on its page for 7 days. Same secrets as Forever Anvil (`CF_API_KEY`, `WAGO_API_TOKEN`).

## Try it in game

Copy `lootcomets/LootComets` into the game's `Interface/AddOns` folder (`D:\World of Warcraft\_forever_\Interface\AddOns\LootComets`), replace `@project-version@` in the copied toc with e.g. `1.0-test`, and restart the game (a new addon needs a full restart, not `/reload`). Then `/comets test`, and loot something.
