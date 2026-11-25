## 2.8

- **Crafting cost on tooltips**: every item a profession makes shows what its reagents cost on your auction house (at the vendor's price for reagents a vendor sells), by its cheapest recipe, and the profit if you sell it there after the 5% cut. You don't need to know the recipe or open the profession window. Items made in stacks show the cost of one. A ~ in front means a reagent has no price, so the real cost is higher. Turn it off under Tooltips in the settings.
- **Stack price on tooltips**: hover a stack in your bags (say 20 cloth) and the tooltip also shows what the whole stack is worth at the market price. Turn it off under Tooltips in the settings (Stack price).
- The auction house Scan button's status (how old your scan is, or that it is waiting for the auctions) sits on a dark box, so it is easy to read over the game world.

## 2.7

- **Gold earned today**: the minimap menu and the minimap button show how much gold this character got today (loot, quests, sales, the mailbox). Hover it for what you spent and the net, or type `/fa gold`. It starts again at midnight. Turn it off under Minimap and chat in the settings.
- The minimap menu shows money with the game's gold, silver and copper coins, like the other windows.
- The settings page scrolls, so its last lines are no longer cut off at the bottom of the settings window.

## 2.6

- **Sell marks in your bags**: turn on "Mark in bags" in the bag value window (or Sell marks in your bags in the settings, under Bags) and the items worth selling on the auction house get the auction house symbol (the one from the minimap) on their bag slot: unbound items worth more there after its cut than to a vendor or disenchanted. Works with the game's bags and bag addons like Bagnon. Off unless you turn it on.
- **Tick boxes in the bag value window**: every item has a tick. Untick what you are keeping to leave it out of the worth (and take its sell mark off); it stays in the list, greyed out, so you can tick it again any time. Right-clicking a row still does the same.
- **The reagent bag counts** in your bag value now; it was left out before.
- Money in the bag value, upgrades, prices, shopping list and watchlist windows shows the game's gold, silver and copper coins instead of g / s / c.
- The settings have a link to the Forever Anvil Addons Discord, and the Scan button shows that it is waiting for the auction house's list instead of sitting at 0%.

## 2.5

- **Scan the auction house** (the Scan button under the auction house window, or `/fa scan` while it is open): reads every auction on the house you are at and uses those prices right away, so your prices stay current between addon updates. The next addon update with newer prices takes over again. Sold per day still comes from the site. The game allows one scan every 15 minutes, and the button shows how old your scan is.
- **Leave items out of your bag value**: right-click an item in the bag value window to stop counting it, like materials or gear you are keeping. "Show ignored" lists those items greyed out under the rest, and right-clicking one counts it again. Your choices are kept for all your characters.
- The minimap menu has a **Scan prices** line showing when you last scanned the auction house you use (click it at the auction house to scan), and the settings have an **Auction house scan** section with a Scan now button. The first time you open the auction house, a note in chat points to the Scan button.
- **New versions with fresh prices now come out once a day** instead of 4 times, since you can scan for current prices any time. The note about old prices now waits until they are over two days old, and it suggests scanning.
- **No more empty windows**: the first time you opened a window in a session (bag value, upgrades, prices, your lists, the menu), it could stay empty until something changed. It now fills in right away. Also, right after login the game may not have your items or the gear on sale loaded yet. The upgrades and bag value windows now say they are loading and fill in as items arrive, instead of looking empty (or saying there are no upgrades or nothing has a price). The minimap menu shows "loading…" for them meanwhile. Items the game never sends are left out after a few seconds instead of keeping the window loading.

## 2.4

- **The Americas**: prices for the American realms too, with the same four rulesets as Europe. The addon picks your region by itself.
- **Pick your ruleset in one click**: the first time you log in on a realm, a small window asks which ruleset you play on (PvP, Normal, Roleplay or RP-PvP), the one you chose on the login screen. Until you pick one, clicking the minimap button opens it too. Later, click the status line at the top of the minimap menu to change it, or type `/fa ruleset`. "Later" puts it off until your next login.

## 2.3

- **Old price notes**: new prices come with addon updates, so the addon now tells you when yours are old. At login, a note in chat when your prices are over a day old. Copies of the addon in your guild and group also tell each other how new their prices are (one tiny hidden message), so you get a note when someone has newer ones. You see nothing while your prices are current. Turn the notes off under Minimap and chat in the settings.
- Tip: turn on auto-update in your CurseForge or Wago app to get fresh prices 4 times a day without thinking about it.

## 2.2

- **Upgrades for you** (`/fa upgrades`, or the minimap menu): gear on your auction house and the neutral one that's better for your spec than what you wear, slot by slot. The spec comes from your talents (the tree with the most points), or pick another. Items are ranked by their stats with that spec's weights, and gear made for other specs (intellect for a rogue, strength for a mage) is hidden unless you ask for it. Each line shows the stats that count for you (+7 Agi +4 Sta), the level it needs and the cheapest price; "of the …" items roll their stats when they drop and are marked random. Pick a budget (1g, 5g, 20g, 100g or any price). Click to search the auction house, Ctrl-click to try it on. The menu shows how many slots have an upgrade.

## 2.1

- **Bag value** (`/fa bags`, or "Bag value" in the minimap menu): what everything in your bags is worth, and the best way to turn each item into gold: the auction house (after its 5% cut), disenchanting, or a vendor. Soulbound items count only for a vendor or disenchanting, and thin markets (under 3 listings) are marked with ~. The menu shows the total.
- **German, French and Spanish**: the addon's text follows your game client's language. On those clients the prices window shows and searches the game's own item names (it loads them when you open it), and English names still match.
- **Settings page** in sections (tooltips, profession window, auction house, your gear and lists, minimap), with an explanation when you hover a switch, and buttons to open the prices, lists, bag value and import windows.
- Profession window: the shopping list button is a small bag icon beside Create All, and the recipe's profit and skill-up sit under its name (below "Requires: …" when the recipe needs a tool or place).
- Prices window: the details line fits on one line.

## 2.0

Personal tools, all usable in game without the site.

- **Prices window** (`/fa prices [search]`, or "Auction prices" in the minimap menu): every item on your auction house, like the site's prices page. Search by name, pick a category, sort by any column, or switch to the other faction's or the neutral house. Click an item for its details (market, lowest, listings, sold per day, region median, vendor and disenchant value), then watch it, add it to your shopping list or search the auction house for it.
- **Upgrades**: tooltips and auction rows flag gear with a higher item level than what you wear in that slot, that your class can use at your level (`Upgrade +X`).
- **Leveling helper**: the profession window marks the recipe you know that gives skill points for the least gold (`skill-up`), and the selected recipe shows its chance and cost per point.
- **Waylaid crates**: a crate's tooltip shows the Merchant's Favor it pays and the cheapest bundle to fill it, on your house or Blackwater.
- **Watchlist** (`/fa watch`): Alt-click any item to watch it and set a target price. Tooltips show your target, the auction house tags items at or below it (`Target`), and opening the auction house names the ones already at target.
- **Shopping list** (`/fa list`): in the profession window, the bag button right of Create All adds a recipe's reagents for the number of crafts in the quantity box. A small window beside the auction house ticks off what's in your bags and bank (click a line to search for it), and the auction house tags what you still need (`Need X`).
- Both list windows show each item's icon and quality colour, with buttons to edit or remove it, an editor to add items (shift-click one in, or type its name), and mouse-wheel scrolling.
- **Import from the site**: press "Copy for the addon" on your watchlist or crafting planner at foreveranvil.com, then `/fa import` in game.
- **Minimap button**: click for a menu (your auction house and price age, prices, your lists, quick on/off switches, settings), right-click for the settings, drag to move it. `/fa minimap` shows or hides it, `/fa menu` opens the menu.
- New settings for each of these in `/fa options`.

## 1.0

First release.

- Item tooltips: market and lowest price on your auction house, sold per day, region median, disenchant value and how old the prices are.
- Auction house: disenchant and vendor flips tagged in the Browse list, and optionally every item's disenchant value.
- Profession window: profit per craft on every recipe.
- Items the game won't disenchant (like the enchanter-made magic wands) never show a disenchant value.
- `/fa` shows your auction house, `/fa options` opens the settings, `/fa debug` helps with bug reports.
