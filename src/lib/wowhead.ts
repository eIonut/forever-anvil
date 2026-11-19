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

/**
 * Load Wowhead's tooltip script, only on pages with item links (Wowhead links or data-wowhead tooltips).
 * Call it again after adding links to the page, and it asks the script to scan for them.
 * Our links carry their own icon and name, so tooltip data loads only on hover. Two Wowhead options:
 *  - renameLinks: on everywhere. Wowhead then fetches names up front only for links that ask for it
 *    (data-wh-rename-link="true": items Blizzard has no name for), and leaves our own links alone.
 *  - iconizeLinks: only where a Wowhead link has no icon of ours (character gear). With it on,
 *    Wowhead downloads data for every link on page load — thousands of requests on the item index.
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
  const needsIcons = !!document.querySelector("a.wh:not([data-wh-icon-added])");
  w.whTooltips = { colorLinks: false, iconizeLinks: needsIcons, renameLinks: true };
  const s = document.createElement("script");
  s.src = "https://wow.zamimg.com/js/tooltips.js";
  s.async = true;
  document.head.appendChild(s);
}
