# Landfall addon

The third small addon beside Forever Anvil and Loot Comets: arriving somewhere shows a title card (name, territory, level range for you, first visits and discoveries) in place of the game's zone text. Researched 2026-11-23/24: no Forever addon shows anything on zone entry (Zone Info: Forever only adds level ranges to the map tooltip; Stylish Zone Text and LeavingZone only restyle the text).

Made for WoW: Forever (interface `16001`) and listed for Classic Era (`11509`), which shares the zone map IDs. Only Forever has been tried in game.

## How it works

| File | What it does |
|---|---|
| `Landfall/Logic.lua` | No game calls (tested in `pipeline/landfall.test.js`). Level ranges by uiMapID (`ZONES`, Forever's new zones included; `C_Map.GetMapLevels` is empty on Forever) and by instance ID (`INSTANCES`); `Fit` (danger / high / good / low) and `Danger` (5+ under the start: red pulse and drums); each zone's continent and side (`A`/`H`/`C`/`X`) for `Suggest` (better zones: your continent first, nearest the middle of the range, never the other faction's or `X`); `ZONE_INSTANCES` and `ZoneInstances` (dungeons first, raids after, capped); `RestedText` (5% of a level per 8 h at an inn, up to 1.5 levels); the sound lists (`SOUNDS`, `Cycle`, `ChoiceName`); territory words from the game's own strings (`SANCTUARY_TERRITORY`, `FACTION_CONTROLLED_TERRITORY`, …) without their brackets; `PvPWarning`; `Spaced` for the cinematic capitals; `ShouldShow` (a subzone seen in the last 45 s doesn't repeat, a zone clears that); `NewAreas` and `FirstVisit`; the card's `Timeline`. |
| `Landfall/Discovery.lua` | `C_MapExplorationInfo.GetExploredAreaIDsAtPosition` sampled on a 24×24 grid the first time a character is on a map gives everything explored there; it's saved per character (`LandfallCharDB.explored[mapID]`). Areas explored at your position that aren't in it are discoveries; a map with nothing explored but where you stand is a first visit. Caves and buildings with their own small map count as their zone (`ZoneMap` walks up to the Zone-type map). |
| `Landfall/Cards.lua` | One card frame (`LandfallCard`, FULLSCREEN_DIALOG, never takes the mouse unless you're moving it), laid out per style: Classic (Morpheus, `Divider.tga` opened from the middle by its texture coordinates), Bronze (the classic layout on `Plaque.tga` drawn as three slices so its ends keep their shape), Cinematic (thin black bars on their own BACKGROUND-strata frame, so they frame the world under the interface; spaced ivory FRIZQT capitals in the lower third, above the action bars, on a wide soft band), Minimal (one line). A badge ("First visit", "Discovered") stamps in big and settles. A subzone arriving just after its zone card becomes the card's subzone line. |
| `Landfall/Core.lua` | Settings (`LandfallDB`), `LandfallCharDB` (explored areas, instances seen), events, what each card says, the sounds and `/landfall`. The game's zone text is hidden by unregistering `ZoneTextFrame`'s events (as ElvUI does) and given back when Landfall is off. `ZONE_CHANGED_NEW_AREA` → zone or instance card (0.2 s later); `ZONE_CHANGED(_INDOORS)` → subzone card; 0.8 s after either, the discovery check. Inns: after every zone change and `PLAYER_UPDATE_RESTING`, `IsResting()` now vs before (0.3 s and 1.5 s later, since the flag can come late or without its event) → the inn line onto the card on screen, or a small card (once in 45 s per place). Login shows a card after 2.5 s; a /reload shows none. |
| `Landfall/Options.lua` | Settings page: switches; style, duration, size; test cards (zone, area, first visit, danger); move / reset; a sound per moment with < > and Play. Exports `ns.CHOICES` for the menu. |
| `Landfall/Minimap.lua` | Minimap button and quick menu, adapted from Loot Comets' (`LandfallMinimapButton`, `LandfallMenu`): a card for here, style / length / size / arrival sound in one click, switches, settings; the addon compartment where there is one. |
| Card lines | Built in `Core.lua`: territory with the faction crest (an inline `UI-PVP-Horde/Alliance` texture), level range, "Better for your level" (map names from `C_Map.GetMapInfo`), "Dungeons here" (names from `GetRealZoneText(instanceID)`, else English), the inn line (`IsResting`, `GetBindLocation`, `GetXPExhaustion` / `UnitXPMax`). The danger pulse is `Edge.tga` stretched over the screen, flashing red twice. |
| `Landfall/Media/` | `Glow.tga` (from Loot Comets), `Divider.tga` and `Plaque.tga` (`node tools/landfall-media.js`), `Edge.tga` (from Loot Comets), `Icon.tga` (from `brand/logo.svg`, `node tools/landfall-logo.js`), `Sounds/*.mp3`: swell, horn, bells, harp, chime, sparkle, drum (original, synthesized by `node tools/landfall-sounds.js`, encoded by `powershell -ExecutionPolicy Bypass -File tools/landfall-sounds.ps1` with Windows' own MP3 encoder). |

## Commands

- `/landfall`: settings
- `/landfall test`, `/landfall test sub`, `/landfall test first`, `/landfall test danger`: a card for where you are
- `/landfall menu`: the quick menu; `/landfall minimap` brings the button back
- `/landfall move`, `/landfall lock`, `/landfall reset`: place the card
- `/landfall on`, `/landfall off` (off gives the game's zone text back)
- `/landfall debug`: zone, subzone, map ID and its levels, territory and PvP flag, instance info, explored areas known, whether the game's text is hidden

## Releases

By hand only: Actions → "Landfall release" → Run workflow (`.github/workflows/landfall.yml`; it shows up there once it's on `main`). Version: `landfall/VERSION`; add notes to `landfall/CHANGELOG.md` for each release (CurseForge rejects a repeated version). Create the CurseForge and Wago projects and put their ids in `Landfall.toc` (`## X-Curse-Project-ID:`, `## X-Wago-ID:`); until then the run keeps the zip on its page. Store text: [LISTING.md](LISTING.md).
