## 2.0

Personal tools.

- Upgrades: tooltips and auction rows flag gear with a higher item level than what you wear in that slot, that your class can use at your level (`Upgrade +X`).
- Leveling helper: the profession window marks the recipe you know that gives skill points for the least gold (`skill-up`); the selected recipe shows its chance and cost per point.
- Waylaid crates: the tooltip shows the Merchant's Favor a crate pays and the cheapest bundle to fill it, on your house or Blackwater.
- Watchlist: import it from the site (`/fa import`) or add items with `/fa watch <item> [price]`. Tooltips show your target, the auction house tags items at or below it, and opening the auction house names the ones the prices already have at target.
- Shopping list: import your crafting plan from the site. A small window beside the auction house ticks off what's in your bags and bank (click a line to search for it), and the auction house tags what you still need.
- Minimap button with the addon's crest: click for a menu (your auction house and price age, shopping list, watchlist, import, quick on/off switches, settings), right-click for the settings, drag to move it. Also in the addons button by the minimap on clients that have one. `/fa minimap` shows or hides it, `/fa menu` opens the menu.
- Both lists work without the site: their windows (`/fa watch`, `/fa list` or the menu) have an editor to add items (shift-click one into the Item box), change a target or amount, remove items or clear the list. Alt-click any item to watch it, and "Add to shopping list" in the profession window adds a recipe's reagents for as many crafts as you type.
- Prices window (`/fa prices [search]`, or "Auction prices" in the menu): every item on your auction house, as on the site's prices page. Search by name, pick a category, sort by any column, or switch to the other faction's or the neutral house. Click an item for its details (market, lowest, listings, sold per day, region median, vendor and disenchant value), and watch it, add it to your shopping list or search the auction house for it. Item names, quality and icons now ship with the prices, so every item shows even before the game has loaded it.
- List windows: each line has the item's icon, its quality colour, and edit and remove buttons; long lists scroll with the mouse wheel. Click a line (or its pencil) to edit it, its X (or a right-click) removes it, and Cancel leaves the editor without saving.
- New settings for each of these in `/fa options`.

## 1.0

First release.

- Item tooltips: market and lowest price on your auction house, sold per day, region median, disenchant value and how old the prices are.
- Auction house: disenchant and vendor flips tagged in the Browse list, and optionally every item's disenchant value.
- Profession window: profit per craft on every recipe.
- Items the game won't disenchant (like the enchanter-made magic wands) never show a disenchant value.
- `/fa` shows your auction house, `/fa options` opens the settings, `/fa debug` helps with bug reports.
