// /page-slugs.json: the current address of every item and recipe page, by id.
// The Worker (worker/oldpages.js) reads it when an /item/… or /recipe/… address has no page, to send
// links with an old or misspelled name on to the page as it is named now.
import type { APIRoute } from "astro";
import { loadCatalog } from "../data/catalog";
import { itemSlug, recipeSlug } from "../lib/urls";

export const GET: APIRoute = () => {
  const c = loadCatalog();
  const item: Record<string, string> = {};
  const recipe: Record<string, string> = {};
  for (const id of c.pageIds) item[id] = itemSlug(id, c.names[id][0]);
  for (const r of c.recipes) recipe[r.id] = recipeSlug(r.id, r.name);
  return new Response(JSON.stringify({ item, recipe }), { headers: { "Content-Type": "application/json" } });
};
