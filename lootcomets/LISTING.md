# Loot Comets: CurseForge and Wago listing

Pasted by hand on each site (the release workflow uploads only the changelog). Update this file when features change, then paste again.

## Name

```
Loot Comets - Loot Effects & Animations
```

The in-game AddOns list keeps the short name "Loot Comets" (`## Title` in the toc). Keep the folder and the slug `loot-comets`.

## Summary (one line, under 150 characters)

```
Loot effects: items you loot fly into your bags as glowing comets, with trails, sparkles and rainbow colours. Works with Bagnon, ElvUI and Baganator.
```

## Categories and game versions

- Main category: **Bags & Inventory**. Extra: **Miscellaneous** (or an art/cosmetic category if the site has one).
- Game versions are set per file, not on the project: the release workflow tags each upload from the toc's `## Interface:` list (Forever, Retail, Classic Era, Burning Crusade, Wrath, Cataclysm, MoP). For a file uploaded by hand, tick them under "Supported Version".
- License: **MIT** (the `LICENSE` file in the addon). Class: **Addons**.
- A new project is reviewed by CurseForge's moderators only once it has a file: create it, put its project ID in the toc (`## X-Curse-Project-ID:`), then run the release workflow.
- Project image (avatar): `lootcomets/brand/logo.png` (512×512, from `brand/logo.svg` via `node tools/lootcomets-logo.js`).
- Screenshots: a comet mid-flight (a rainbow or dust trail shows best), an epic landing with the screen glow, and the settings page.

## Description

```markdown
# Loot Comets

**Loot effects for World of Warcraft.** Every item you loot flies out of the corpse and into the exact bag slot it lands in, as a glowing comet in its quality colour. The slot flashes as it arrives, rare items burst into sparkles, and epics light up the edges of your screen.

No data, no setup: install it and loot something.

## What you see

- **Comets into the right slot:** open bags (the game's, **Bagnon**, **ElvUI** or **Baganator**) show exactly where each item went. With your bags closed, it flies into that bag's button.
- **Quality colours:** grey, white, green, blue and purple items each fly in their own colour.
- **Landings:** a flash and a ring on the slot; sparkles for green, blue and purple; a sound and a screen glow for epics.
- **Stacks:** more of something you already carry gets a small, quick comet and a "+3" over the slot.
- **Coins:** gold, silver and copper you loot or earn fly into the money shown in your bags, with how much you got.
- **Not just loot:** items from vendors, quests, mail, trades and crafting fly out of the window they came from.
- **Quiet when it should be:** moving items around your bags, swapping gear and using the bank never launch comets.

## Make it yours

Esc → Options → AddOns → Loot Comets, or type `/comets`. Every change launches test comets so you see it straight away.

- **Comet:** round icon, square icon with a coloured border, or a glowing orb
- **Trail:** dots, a smooth streak, sparkle dust, or none
- **Colour:** the item's quality, a colour you pick, or rainbow
- **Arc:** flat, normal or a high loop
- **Landing:** subtle, normal or big; sparkles and the epic screen glow can be turned off
- **Speed and size** sliders, grey items on or off, stack comets, counts, coin comets and sound

## Commands

- Minimap button: click for a quick menu (test comets, change the look in one click, switches), right-click for all settings, drag to move
- `/comets`: settings
- `/comets menu`: the quick menu; `/comets minimap` brings the button back
- `/comets test`: one comet of each quality
- `/comets on` / `/comets off`
- `/comets debug`: where the last comet started and landed (for bug reports)

## Works with

WoW Forever, Retail and the Classic versions. The game's own bags, Bagnon, ElvUI and Baganator. With other bag addons, comets fly to your bag bar.

Lightweight: nothing runs until an item arrives, and it never touches the game's own frames.

Made by the team behind [Forever Anvil](https://foreveranvil.com), auction prices and crafting tools for WoW Forever.
```
