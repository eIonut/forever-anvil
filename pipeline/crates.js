// Waylaid Crates for the Merchant's Favor calculator (/waylaid-crates).
//
// Every crate is an item named "Waylaid Crate: <tier> <kind>". Its "Use:" text lists the bundles
// that fill it, e.g. "- 8 Bolt of Runecloth". We read that text from Blizzard's item data and turn
// each line into [itemId, quantity, name], so the site can price every bundle on every auction house.
//
// Saved (every 25 days, like recipes) as:
//   { day, crates: [[crateId, crateName, requiredLevel, [[itemId|null, qty, name], ...]], ...] }
// itemId is null when no item of that name could be found; the site shows the bundle unpriced.

// "Use: Fill the crate with any bundle from the following list:\r\n- 8 Bolt of Runecloth\r\n- 2 Cured Thick Hide"
// → [[8, "Bolt of Runecloth"], [2, "Cured Thick Hide"]]
function parseFills(description) {
  const out = [];
  for (const line of String(description || "").split(/\r?\n/)) {
    const m = /^\s*-\s*(\d+)\s*x?\s+(.+?)\s*$/.exec(line);
    if (m) out.push([Number(m[1]), m[2]]);
  }
  return out;
}

const CRATE_NAME = /^Waylaid Crate: /;

// api: Blizzard client. nameIndex: Map(lowercase name → [itemId, ...]) from items we already know.
// pick(ids): which of several same-named items to use (e.g. the one on sale).
async function fetchCrates(api, today, nameIndex, pick, log) {
  // 1. find the crates by name (the search also returns Season of Discovery "Waylaid Supplies", left out)
  const ids = new Set();
  for (let page = 1; page <= 5; page++) {
    const r = await api.get(`/data/wow/search/item?name.en_US=${encodeURIComponent("Waylaid Crate")}&_pageSize=100&_page=${page}&orderby=id`, api.ns.static, { retries: 2 });
    const results = (r.json && r.json.results) || [];
    for (const x of results) {
      const name = x.data && x.data.name && x.data.name.en_US;
      if (name && CRATE_NAME.test(name)) ids.add(x.data.id);
    }
    if (!r.json || page >= (r.json.pageCount || 1)) break;
  }

  // 2. each crate's fill list, from its "Use:" text
  const crates = [];
  const unresolved = new Map(); // lowercase name → rows waiting for an id
  for (const id of [...ids].sort((a, b) => a - b)) {
    const r = await api.get(`/data/wow/item/${id}`, api.ns.static, { retries: 2 });
    const j = r.json;
    if (r.status !== 200 || !j || !CRATE_NAME.test(j.name || "")) continue;
    // the "Use:" text sits in the tooltip part of the item (preview_item), not at the top level
    const text = ((j.preview_item && j.preview_item.spells) || j.spells || []).map((s) => s.description || "").join("\n");
    const fills = parseFills(text).map(([qty, name]) => {
      const row = [resolve(nameIndex, pick, name), qty, name];
      if (row[0] == null) {
        const key = name.toLowerCase();
        if (!unresolved.has(key)) unresolved.set(key, []);
        unresolved.get(key).push(row);
      }
      return row;
    });
    const level = (j.required_level ?? (j.requirements && j.requirements.level && j.requirements.level.value)) || 0;
    if (fills.length) crates.push([id, j.name, level, fills]);
  }

  // 3. names we don't know yet: ask the item search for an exact match
  for (const [key, rows] of unresolved) {
    const r = await api.get(`/data/wow/search/item?name.en_US=${encodeURIComponent(rows[0][2])}&_pageSize=50`, api.ns.static, { retries: 2 });
    const exact = ((r.json && r.json.results) || [])
      .filter((x) => x.data && x.data.name && (x.data.name.en_US || "").toLowerCase() === key)
      .map((x) => x.data.id);
    const id = exact.length ? pick(exact) : null;
    for (const row of rows) row[0] = id;
  }

  const bundles = crates.reduce((s, c) => s + c[3].length, 0);
  const missing = crates.reduce((s, c) => s + c[3].filter((f) => f[0] == null).length, 0);
  log(`Waylaid Crates: ${crates.length} crates, ${bundles} bundles${missing ? `, ${missing} without a known item` : ""}`);
  return { day: today, crates };
}

function resolve(nameIndex, pick, name) {
  const ids = nameIndex.get(name.toLowerCase());
  return ids && ids.length ? pick(ids) : null;
}

export { fetchCrates, parseFills };
