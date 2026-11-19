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
}

export const getMarketPrefs = (): MarketPrefs => load<MarketPrefs>(MARKET_KEY) || {};

/** Update some fields and keep the rest. */
export function saveMarketPrefs(changes: MarketPrefs): void {
  save(MARKET_KEY, { ...getMarketPrefs(), ...changes });
}
