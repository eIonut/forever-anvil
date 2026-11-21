// The visitor's chosen market (region, server group, auction house), shared by every price tool
// so switching pages keeps the same choice. Storage key kept from the old site.
import { load, save } from "./store";

export const MARKET_KEY = "codex-prices";

export interface MarketPrefs {
  region?: string;
  group?: string;
  faction?: string;
  /** sort order on the Prices page */
  sort?: string;
  /** sort direction on the Prices page: 1 = lowest first, -1 = highest first */
  dir?: number;
}

/** Regions the price tools offer (the same as MarketSelects.svelte). */
const REGIONS = ["eu", "us"];

export function getMarketPrefs(): MarketPrefs {
  const p = load<MarketPrefs>(MARKET_KEY) || {};
  // a region saved before it was removed falls back to the default, along with its server group
  if (p.region && !REGIONS.includes(p.region)) return { faction: p.faction, sort: p.sort, dir: p.dir };
  return p;
}

/** Fired on window after the choice changes, e.g. so the freshness line (LiveFreshness.astro) follows the region */
export const MARKET_EVENT = "market-change";

/** Update some fields and keep the rest. */
export function saveMarketPrefs(changes: MarketPrefs): void {
  const before = getMarketPrefs().region;
  save(MARKET_KEY, { ...getMarketPrefs(), ...changes });
  if (typeof window !== "undefined" && changes.region && changes.region !== before) window.dispatchEvent(new Event(MARKET_EVENT));
}
