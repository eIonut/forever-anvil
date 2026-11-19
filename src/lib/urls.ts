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
