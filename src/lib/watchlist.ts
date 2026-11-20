// Star buttons on every page: the click listener, cross-tab updates and showing saved state after each
// page change. The list itself is kept by src/lib/watchstore.ts (which the Svelte tools import; this file
// touches the document as soon as it loads, so it's only imported by the header's browser script).
import { getWatch, syncWatchButtons, toggleWatch, WATCH_EVENT, WATCH_KEY } from "./watchstore";
import { notify } from "./notify";
import { onPage } from "./page";

document.addEventListener("click", (e) => {
  const btn = (e.target as Element | null)?.closest<HTMLButtonElement>("button[data-watch-id]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = Number(btn.dataset.watchId);
  const name = btn.dataset.watchName || "Item " + id;
  if (!Number.isInteger(id) || id <= 0) return;
  const before = getWatch().length;
  const on = toggleWatch(id, name);
  if (on) notify(`Watching "${name}". Find it on your watchlist and the home page.`);
  else if (getWatch().length < before) notify(`Removed "${name}" from your watchlist`, "info");
});

// another tab changed the list: catch up
window.addEventListener("storage", (e) => {
  if (e.key !== WATCH_KEY) return;
  syncWatchButtons();
  document.dispatchEvent(new CustomEvent(WATCH_EVENT));
});

onPage(() => syncWatchButtons());
