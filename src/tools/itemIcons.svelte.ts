// Item info for icons in the tools. A tool that loads the item cache (items_<region>.json)
// puts it here, and every <ItemIcon> / <ItemLink> on the page can show the right icon.

/** [name, vendorSells, dayFetched, vendorBuys, quality, itemClass, iconFileId, source, itemSubclass, inventoryType, requiredLevel, itemLevel] (see pipeline/run.js) */
export type ItemInfo = [string, number | null, number, number | null, string | null, string | null, number | null, (string | null)?, (string | null)?, (string | null)?, (number | null)?, (number | null)?];

class ItemSource {
  region = $state("eu");
  /** replaced as a whole, never edited, so it isn't made deeply reactive (it holds ~9,000 items) */
  items = $state.raw<Record<string, ItemInfo>>({});
}

export const itemSource = new ItemSource();

export function useItems(region: string, items: Record<string, ItemInfo> | null) {
  itemSource.region = region;
  itemSource.items = items || {};
}

/** Item name from the cache, or null when Blizzard has none */
export const itemName = (id: number | string): string | null => itemSource.items[id]?.[0] || null;
