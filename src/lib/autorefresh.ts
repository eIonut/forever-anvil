// Keep a page's live prices fresh while it stays open: run `refresh` every `everyMs` while the tab is
// visible, and again when the visitor comes back to the tab (if the last run was more than `backMs` ago).
// Nothing runs while the tab is hidden. Returns a function that stops it (call it from onMount's cleanup).
// The price job publishes new prices once an hour, so a 10-minute check finds them within ~10 minutes.

export function autoRefresh(refresh: () => unknown, everyMs = 10 * 60_000, backMs = 2 * 60_000): () => void {
  let last = Date.now();
  let busy = false;
  const run = async () => {
    if (busy || document.visibilityState !== "visible") return;
    busy = true;
    last = Date.now();
    try { await refresh(); } finally { busy = false; }
  };
  const timer = setInterval(run, everyMs);
  const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - last > backMs) run(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
