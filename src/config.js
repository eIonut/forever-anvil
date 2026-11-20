/* ------------------------------------------------------------------
   SITE SETTINGS: edit these, nothing else needs to change.
   Used by the new Astro pages and (until the move is done) the old ones.
   ------------------------------------------------------------------ */
const config = {
  siteName: "Forever Anvil",
  tagline: "Unofficial WoW: Forever tools",

  // Your donation page (Ko-fi, Buy Me a Coffee, Patreon, PayPal.me ...).
  // Leave empty "" to hide all donate buttons.
  donateUrl: "",
  donateLabel: "Support Forever Anvil",

  // Google AdSense publisher id, e.g. "ca-pub-1234567890123456".
  // Leave empty until your AdSense account is approved; ad slots stay hidden.
  adsenseClient: "",
  // Optional: per-slot ad unit ids from AdSense (data-ad-slot values).
  adSlots: { top: "", sidebar: "", bottom: "" },
  // Show dashed placeholders where ads will go (handy while designing).
  showAdPlaceholders: false,

  // Search-console ownership codes (the "content" value of the meta tag they give you).
  // Google: https://search.google.com/search-console  ·  Bing: https://www.bing.com/webmasters
  // Leave empty if you verify by DNS instead (recommended with Cloudflare).
  googleSiteVerification: "",
  bingSiteVerification: "",

  // Contact email shown on the About page (optional).
  contactEmail: "",

  // Where the price tools load data from. Empty = the local ./out folder written by
  // `npm run prices` (served by `npm run dev`). In production: the Cloudflare Worker URL, e.g. "/api".
  pricesApi: "",

  // Date of the last content update (shown in the footer).
  lastUpdated: "2026-11-19"
};

export default config;
