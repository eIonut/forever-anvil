// Wowhead hover tooltips for item links.

/** Attributes that give one of our own links a Wowhead tooltip (keeping our icon and text). */
export function tooltipAttrs(id: number | string | null | undefined): Record<string, string> {
  if (!id) return {};
  return {
    "data-wowhead": `item=${Number(id)}&domain=forever`,
    "data-wh-icon-added": "true",
    "data-wh-rename-link": "false",
  };
}

let loaded = false;

const LINKS = "[data-wowhead], a.wh";

function hideTooltips(): void {
  for (const t of document.querySelectorAll<HTMLElement>(".wowhead-tooltip")) {
    if (t.style.visibility === "visible") t.style.visibility = "hidden";
  }
}

/**
 * Wowhead hides its tooltip only when the mouse leaves the link. When the link disappears under the
 * mouse instead (live prices redraw a table, a list re-sorts, the page changes), that never happens and
 * the tooltip stays on screen. So hide it ourselves whenever the mouse isn't over an item link, and on
 * scroll, page change and when the window loses focus. Wowhead shows it again on the next hover.
 * Registered once, when the tooltip script first loads.
 */
function hideStuckTooltips(): void {
  let queued = false;
  let x = 0, y = 0;
  const check = () => {
    queued = false;
    const el = document.elementFromPoint(x, y);
    if (!el?.closest(LINKS)) hideTooltips();
  };
  document.addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(check); }
  }, { passive: true });
  document.addEventListener("pointerleave", hideTooltips);
  window.addEventListener("scroll", hideTooltips, { passive: true });
  window.addEventListener("blur", hideTooltips);
  document.addEventListener("astro:before-swap", hideTooltips);
  // a link removed while the mouse rests on it: no pointer event follows, so look again shortly after
  new MutationObserver(() => { if (!queued) { queued = true; setTimeout(check, 50); } })
    .observe(document.body, { childList: true, subtree: true });
}

/**
 * Load Wowhead's tooltip script, only on pages with item links (Wowhead links or data-wowhead tooltips).
 * Call it again after adding links to the page, and it asks the script to scan for them.
 * Our links carry their own icon and name, so tooltip data loads only on hover. Two Wowhead options:
 *  - renameLinks: on everywhere. Wowhead then fetches names up front only for links that ask for it
 *    (data-wh-rename-link="true": items Blizzard has no name for), and leaves our own links alone.
 *  - iconizeLinks: only where a Wowhead link has no icon of ours (character gear). With it on,
 *    Wowhead downloads data for every link on page load: thousands of requests on the item index.
 */
export function setupWowhead(): void {
  if (!document.querySelector("a.wh:not(.wh-search), [data-wowhead]")) return;
  const w = window as unknown as {
    whTooltips?: object;
    $WowheadPower?: { refreshLinks?: () => void };
    WH?: { Tooltips?: { refreshLinks?: () => void } };
  };
  if (loaded) {
    try {
      if (w.$WowheadPower?.refreshLinks) w.$WowheadPower.refreshLinks();
      else w.WH?.Tooltips?.refreshLinks?.();
    } catch { /* tooltips are optional */ }
    return;
  }
  loaded = true;
  hideStuckTooltips();
  const needsIcons = !!document.querySelector("a.wh:not([data-wh-icon-added])");
  w.whTooltips = { colorLinks: false, iconizeLinks: needsIcons, renameLinks: true };
  const s = document.createElement("script");
  s.src = "https://wow.zamimg.com/js/tooltips.js";
  s.async = true;
  document.head.appendChild(s);
}
