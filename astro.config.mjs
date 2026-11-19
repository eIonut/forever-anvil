// Astro settings for Forever Tome. See docs/astro-migration-plan.md.
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // Used for canonical links and the sitemap. Override with SITE_URL when testing another domain.
  site: process.env.SITE_URL || "https://forevertome.com",
  // Clean URLs: /prices is built as prices.html, which Cloudflare Pages serves at /prices
  // (and redirects old /prices.html links to it).
  build: { format: "file" },
  trailingSlash: "never",
  integrations: [svelte(), sitemap()],
});
