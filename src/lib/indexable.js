// Which item pages search engines should index. Thin pages (grey junk, items almost nobody sells)
// still get built and linked, so visitors can reach them, but they carry "noindex" and are left out
// of the sitemap. That keeps Google and AdSense reviewers on the pages people actually search for.

/** An item listed on this many auction houses or fewer (of the 16) counts as rarely traded */
export const RARE_HOUSES = 2;

/**
 * Is this item's page too thin to index?
 * @param {{ quality: string | null, houses: number, made: boolean, used: boolean }} item
 *   houses: how many auction houses list it; made / used: whether a recipe makes or uses it
 */
export function isThinItem({ quality, houses, made, used }) {
  // A recipe link gives the page real content (how to craft it, what it's for): always keep it
  if (made || used) return false;
  // Grey vendor junk: nobody searches for its price
  if (quality === "poor") return true;
  // On the Auction House almost nowhere, so the page has next to no price data
  return houses <= RARE_HOUSES;
}

/** Item id from an item page address ("https://…/item/2770-copper-ore" → "2770"), or null */
export function itemIdFromUrl(url) {
  const m = /\/item\/(\d+)(?:-[^/]*)?\/?$/.exec(url);
  return m ? m[1] : null;
}
