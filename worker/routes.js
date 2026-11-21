// Which /api addresses serve which price-job file. Shared by the Worker (worker/index.js),
// `npm run dev` (integrations/dev-api.ts) and the KV upload script (tools/kv-sync.js),
// so the three always agree.
//
//   /api/prices/eu/A      → prices_eu_A      (the file out/prices_eu_A.json, the KV key prices_eu_A)
//   /api/history/eu/A_5   → history_eu_A_5
//   /api/items/eu         → items_eu
//
// Only these kinds are public. The job's private working files (salesstate, salesdays,
// econstate) are never uploaded or served.

// kind → how long browsers and Cloudflare's cache may reuse a copy, in seconds.
// The price job runs hourly; history and price changes only change once a day.
export const KINDS = {
  prices: 300,
  meta: 300,
  econ: 300,
  home: 300,
  items: 3600,
  recipes: 3600,
  crates: 3600,
  talents: 3600,
  movers: 3600,
  history: 3600
};

export const REGIONS = ["eu", "us", "kr", "tw"];

const PART = /^[A-E](_\d{1,2})?$/; // server group, optionally with a history shard: "A", "A_5"

/** "/api/prices/eu/A" → { key: "prices_eu_A", ttl: 300 }, or null when it isn't a data address */
export function dataRoute(pathname) {
  const m = /^\/api\/([a-z]+)\/([a-z]{2})(?:\/([A-Za-z0-9_]+))?$/.exec(pathname);
  if (!m) return null;
  const [, kind, region, part] = m;
  if (!(kind in KINDS) || !REGIONS.includes(region)) return null;
  if (part != null && !PART.test(part)) return null;
  return { key: kind + "_" + region + (part != null ? "_" + part : ""), ttl: KINDS[kind] };
}

/** Is this file name (without .json) one of the public data files? */
export function isPublicKey(key) {
  const m = /^([a-z]+)_([a-z]{2})(?:_(.+))?$/.exec(key);
  return !!m && m[1] in KINDS && REGIONS.includes(m[2]) && (m[3] == null || PART.test(m[3]));
}
