// Astro settings for Forever Anvil. See docs/astro-migration-plan.md.
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import devApi from "./integrations/dev-api.ts";
import { loadCatalog } from "./src/data/catalog.ts";
import { itemIdFromUrl } from "./src/lib/indexable.js";

// The sitemap leaves out the 404 page (it's noindex) and thin item pages (also noindex, see
// src/lib/indexable.js). The catalog is only read when the sitemap is written, at the end of a build.
const inSitemap = (page) => {
  if (/\/404\/?$/.test(page)) return false;
  const id = itemIdFromUrl(page);
  return !id || !loadCatalog().thinIds.has(id);
};

export default defineConfig({
  // Used for canonical links and the sitemap. Override with SITE_URL when testing another domain.
  site: process.env.SITE_URL || "https://foreveranvil.com",
  // Clean URLs: /prices is built as prices.html, which Cloudflare Pages serves at /prices
  // (and redirects old /prices.html links to it).
  build: { format: "file" },
  trailingSlash: "never",
  // Keep page scripts as shared files instead of copying small ones into all ~10,700 pages,
  // so browsers cache them once and pages stay small.
  vite: { build: { assetsInlineLimit: 0 } },
  // Load a page in the background when the pointer rests on a link to it (or a finger touches it),
  // so the click opens it almost at once. Only pages on this site; external links are left alone.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  // lastmod = build day: generated pages are rebuilt daily with fresh prices
  // devApi: /out/* and /api/character during `npm run dev` only
  integrations: [svelte(), sitemap({ lastmod: new Date(), filter: inSitemap }), devApi()],
});
