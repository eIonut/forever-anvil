// Loading live data in the browser, and small helpers the tools share.
import config from "../config.js";
import { notify } from "./notify";
import { showCopyBox } from "./dialog";

/**
 * Where a price-job file comes from: the Cloudflare Worker in production (config.pricesApi),
 * or the local ./out folder while developing (served by integrations/dev-api.ts).
 *   priceUrl("prices", "eu", "A") → "/api/prices/eu/A"  or  "/out/prices_eu_A.json"
 */
export function priceUrl(kind: string, region: string, part?: string | number): string {
  const base = config.pricesApi;
  if (base) return base.replace(/\/$/, "") + "/" + kind + "/" + region + (part != null ? "/" + part : "");
  return "/out/" + kind + "_" + region + (part != null ? "_" + part : "") + ".json";
}

/** Fetch JSON, or null on any error (the tools show a friendly message instead). */
export async function getJSON<T = any>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url); // the Worker says how long a copy stays fresh (Cache-Control)
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

// Item and recipe files are big (~1 MB and ~0.5 MB) and change rarely (new items, a recipe refresh
// every 25 days), unlike prices, which change hourly. So they're kept for a while in session storage:
// moving between Prices, Crafting, Flips, Economy and the Planner doesn't download them again.
// Session storage is per tab and cleared when the tab closes; a full or blocked storage just means
// no caching. Several tools asking at once share one download.
const CACHE_PREFIX = "codex-cache:";
const inFlight = new Map<string, Promise<unknown>>();

/** Like getJSON, but reuses a copy from the last maxAgeMs (default 30 minutes) in this tab. */
export function getCachedJSON<T = any>(url: string, maxAgeMs = 30 * 60 * 1000): Promise<T | null> {
  const key = CACHE_PREFIX + url;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) {
      const bar = hit.indexOf("|"), saved = Number(hit.slice(0, bar));
      if (Date.now() - saved < maxAgeMs) return Promise.resolve(JSON.parse(hit.slice(bar + 1)) as T);
    }
  } catch { /* storage blocked or corrupt copy: download instead */ }
  if (inFlight.has(url)) return inFlight.get(url) as Promise<T | null>;
  const job = (async () => {
    try {
      const r = await fetch(url); // the Worker says how long a copy stays fresh (Cache-Control)
      if (!r.ok) return null;
      const text = await r.text();
      try {
        sessionStorage.setItem(key, Date.now() + "|" + text);
      } catch {
        // storage full: drop older copies and try once more; if it still doesn't fit, just don't cache
        try {
          for (const k of Object.keys(sessionStorage)) if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
          sessionStorage.setItem(key, Date.now() + "|" + text);
        } catch { /* no caching this time */ }
      }
      return JSON.parse(text) as T;
    } catch {
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, job);
  return job;
}

/** Message when the data files can't be loaded: different on the live site and on your computer. */
export const noDataMessage = (live: string, local: string) => (import.meta.env.DEV ? local : live);

/** "PvP" once confirmed by an in-game check, otherwise "Group B, ruleset not confirmed yet" */
export function groupLabel(rulesets: Record<string, string> | undefined, g: string): string {
  return rulesets?.[g] || "Group " + g + " · ruleset not confirmed yet";
}

/** Is it better to sell on the auction house or to a vendor? (The AH keeps 5% of the sale price.) */
export function verdict(market: number, vendor: number | null): { label: string; cls: string; why: string } {
  if (vendor == null || vendor === 0) return { label: "AH only", cls: "v-ah", why: "Vendors won't buy it" };
  const net = market * 0.95;
  if (net > vendor * 1.15) return { label: "Sell on AH", cls: "v-ah", why: "After the 5% AH cut you get about " + Math.round(net / vendor * 10) / 10 + "× the vendor price" };
  if (net < vendor) return { label: "Vendor it", cls: "v-vendor", why: "Vendors pay more than the AH after its 5% cut" };
  return { label: "About even", cls: "v-even", why: "AH and vendor pay about the same" };
}

/** "Nov 19, 2026, 10:14 AM" in the visitor's own locale and time zone */
export const localTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "3 hours ago", "yesterday", "5 days ago" */
export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (isNaN(s)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " minutes ago";
  if (s < 86400) { const h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : d + " days ago";
}

/**
 * Copy text. Where the browser doesn't allow the clipboard, a popup shows the text selected, to copy by
 * hand (src/lib/dialog.ts); promptLabel is its title, e.g. "Copy this link:". Resolves true when copied.
 */
export async function copyText(text: string, promptLabel: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      showCopyBox(promptLabel.replace(/:\s*$/, ""), text);
    } catch {
      // no popups either (some embedded browsers): say so instead of failing silently
      notify("Couldn't copy: your browser blocked the clipboard.", "error");
    }
    return false;
  }
}
