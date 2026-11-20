// The watchlist as reactive state for the Svelte tools. The list itself lives in src/lib/watchstore.ts;
// this copy follows its "watchlist-change" event. It starts empty and fills on the first init(), which
// components call from onMount, so the server-rendered HTML and the first browser render agree.
import { getWatch, WATCH_EVENT, type WatchItem } from "../lib/watchstore";

class WatchState {
  items = $state.raw<WatchItem[]>([]);
  ids = $derived(new Set(this.items.map((x) => x.id)));
  #started = false;

  init() {
    if (this.#started) return;
    this.#started = true;
    this.items = getWatch();
    document.addEventListener(WATCH_EVENT, () => (this.items = getWatch()));
  }
}

export const watch = new WatchState();
