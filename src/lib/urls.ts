// Addresses of the generated pages. Same slugs as the old item/…html and recipe/…html files,
// without ".html": /item/2770-copper-ore, /recipe/2359-bolt-of-linen-cloth
import { slugify } from "./pricemath.js";

const slugOf = (id: number | string, name: string) => {
  const s = slugify(name);
  return String(id) + (s ? "-" + s : "");
};

/** "2770-copper-ore": the [slug] part of an item page address */
export const itemSlug = slugOf;
/** "2359-bolt-of-linen-cloth": the [slug] part of a recipe page address */
export const recipeSlug = slugOf;

export const itemUrl = (id: number | string, name: string) => "/item/" + slugOf(id, name);
export const recipeUrl = (id: number | string, name: string) => "/recipe/" + slugOf(id, name);

/** Anchor id for a profession on the recipe index, e.g. "prof-first-aid" */
export const professionAnchor = (profession: string) => "prof-" + slugify(profession);

/** Wowhead page for an item (used where we have no page of our own) */
export const wowheadItemUrl = (id: number | string) => `https://www.wowhead.com/forever/item=${Number(id)}`;

// Hub pages that group the item, recipe and talent pages, so every page is a few links from the
// home page and each group can rank for its own searches ("wow forever tailoring recipes").
/** Item category page, e.g. "Trade Goods" → /items/trade-goods (page 2: /items/trade-goods/2) */
export const categoryUrl = (itemClass: string, page = 1) => "/items/" + slugify(itemClass) + (page > 1 ? "/" + page : "");
/** Profession page, e.g. "First Aid" → /profession/first-aid */
export const professionUrl = (profession: string) => "/profession/" + slugify(profession);
/** One class's talent trees, e.g. "Warrior" → /talents/warrior */
export const talentClassUrl = (className: string) => "/talents/" + slugify(className);
