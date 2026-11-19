// Astro settings for Forever Tome. See docs/astro-migration-plan.md.
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import devApi from "./integrations/dev-api.ts";

export default defineConfig({
  // Used for canonical links and the sitemap. Override with SITE_URL when testing another domain.
  site: process.env.SITE_URL || "https://forevertome.com",
  // Clean URLs: /prices is built as prices.html, which Cloudflare Pages serves at /prices
  // (and redirects old /prices.html links to it).
  build: { format: "file" },
  trailingSlash: "never",
  // Keep page scripts as shared files instead of copying small ones into all ~10,700 pages,
  // so browsers cache them once and pages stay small.
  vite: { build: { assetsInlineLimit: 0 } },
  // lastmod = build day: generated pages are rebuilt daily with fresh prices
  // devApi: /out/* and /api/character during `npm run dev` only
  integrations: [svelte(), sitemap({ lastmod: new Date() }), devApi()],
});
