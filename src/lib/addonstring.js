// Import strings for the in-game addon (addon/ForeverAnvil, pasted with /fa import). Plain text so they
// survive any clipboard and stay readable; the addon decodes them in Math.lua (M.DecodeImport), and
// pipeline/addon.test.js checks the two agree.
//   watchlist:     "FA1W:id,id:below,…"   below: target price in copper, left out when there's none
//   shopping list: "FA1S:id:qty,…"        every material the crafting plan needs (the addon counts your bags)

const ok = (n) => Number.isInteger(n) && n > 0;

/** items: [{ id, below? }] → "FA1W:…" (bad ids dropped, each id once) */
function watchString(items) {
  const seen = new Set(), parts = [];
  for (const w of items || []) {
    const id = Number(w.id);
    if (!ok(id) || seen.has(id)) continue;
    seen.add(id);
    const below = Math.round(Number(w.below) || 0);
    parts.push(below > 0 ? `${id}:${below}` : String(id));
  }
  return "FA1W:" + parts.join(",");
}

/** mats: [{ id, need }] → "FA1S:…" (materials with nothing needed are left out; repeated ids are added up) */
function shoppingString(mats) {
  const need = new Map();
  for (const m of mats || []) {
    const id = Number(m.id), n = Math.ceil(Number(m.need) || 0);
    if (ok(id) && n > 0) need.set(id, (need.get(id) || 0) + n);
  }
  return "FA1S:" + [...need].map(([id, n]) => `${id}:${n}`).join(",");
}

export { watchString, shoppingString };
