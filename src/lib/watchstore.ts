// The visitor's watchlist: items they starred, each with an optional target price ("tell me when it's
// below…"). Saved in the browser like the crafting plan; no account. Shown on /watchlist and the home page.
//
// Star buttons (WatchStar.astro / WatchStar.svelte) carry data-watch-id and data-watch-name; one click
// listener for all of them is in src/lib/watchlist.ts. After each change, every star on the page is
// updated and a "watchlist-change" event tells the Svelte tools (src/tools/watch.svelte.ts).
// Nothing here runs on import, so the Svelte tools can use it while their HTML is built on the server.
import { load, save } from "./store";
import { notify } from "./notify";

export const WATCH_KEY = "anvil-watch";
export const WATCH_MAX = 200;
export const WATCH_EVENT = "watchlist-change";

export interface WatchItem {
  id: number;
  /** the name when it was starred, so the list reads well before the item cache loads */
  name: string;
  /** target price in copper: the item is flagged while its lowest price is at or below it */
  below?: number | null;
}

export function getWatch(): WatchItem[] {
  const w = load<{ v?: number; items?: WatchItem[] }>(WATCH_KEY);
  if (!w || !Array.isArray(w.items)) return [];
  return w.items.filter((x) => x && Number.isInteger(x.id) && x.id > 0).map((x) => ({ id: x.id, name: String(x.name || ""), below: x.below && x.below > 0 ? x.below : null }));
}

export function setWatch(items: WatchItem[]): void {
  save(WATCH_KEY, { v: 1, items: items.slice(0, WATCH_MAX) });
  syncWatchButtons();
  document.dispatchEvent(new CustomEvent(WATCH_EVENT));
}

/** Add or remove one item. Returns true when it's now on the list. */
export function toggleWatch(id: number, name: string): boolean {
  const list = getWatch();
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) { list.splice(i, 1); setWatch(list); return false; }
  if (list.length >= WATCH_MAX) { notify(`Your watchlist is full (${WATCH_MAX} items). Remove some first.`, "error"); return false; }
  list.push({ id, name });
  setWatch(list);
  return true;
}

/** Add several items (from a share link), keeping the ones already there. Returns how many were new. */
export function addToWatch(items: { id: number; name: string }[]): number {
  const list = getWatch();
  const have = new Set(list.map((x) => x.id));
  let added = 0;
  for (const it of items) {
    if (have.has(it.id) || list.length >= WATCH_MAX) continue;
    list.push({ id: it.id, name: it.name });
    have.add(it.id);
    added++;
  }
  if (added) setWatch(list);
  return added;
}

/** Set or clear (null) an item's target price */
export function setTarget(id: number, below: number | null): void {
  const list = getWatch();
  const it = list.find((x) => x.id === id);
  if (!it) return;
  it.below = below && below > 0 ? below : null;
  setWatch(list);
}

/** Show the saved state on every star on the page (static pages render them all as "not watched") */
export function syncWatchButtons(): void {
  const ids = new Set(getWatch().map((x) => x.id));
  document.querySelectorAll<HTMLButtonElement>("button[data-watch-id]").forEach((b) => {
    const on = ids.has(Number(b.dataset.watchId));
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? "On your watchlist (click to remove)" : "Add to your watchlist";
  });
}

