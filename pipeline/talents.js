// Talent trees for the talent calculator, from Blizzard's official API.
// Saved as talents:{region}:
// { day, classes: [{ id, name, icon, specs: [{ id, name, icon,
//     nodes: [[nodeId, row, col, name, icon, [rank descriptions...], [requiredNodeIds...]]] }] }] }
// Static game data: refreshed every 25 days by run.js (Blizzard's 30-day limit).
import { pool } from "./blizzard.js";

const pathOf = (href) => href.replace(/^https:\/\/[^/]+/, "").replace(/\?.*/, "");

async function fetchTalents(api, today, log) {
  const cls = await api.get("/data/wow/playable-class/index", api.ns.static);
  if (cls.status !== 200) throw new Error("Class index: HTTP " + cls.status);
  const idx = await api.get("/data/wow/talent-tree/index", api.ns.static);
  if (idx.status !== 200) throw new Error("Talent tree index: HTTP " + idx.status);

  const iconCache = {};
  async function icon(kind, id) {
    const key = kind + ":" + id;
    if (iconCache[key] !== undefined) return iconCache[key];
    const m = await api.get(`/data/wow/media/${kind}/${id}`, api.ns.static, { retries: 2 });
    const a = m.json && m.json.assets && m.json.assets[0];
    return (iconCache[key] = a && /^https:\/\/render\.worldofwarcraft\.com\//.test(a.value) ? a.value : null);
  }

  const classes = {};
  for (const c of cls.json.classes) classes[c.id] = { id: c.id, name: c.name, icon: await icon("playable-class", c.id), specs: [] };

  for (const t of idx.json.spec_talent_trees || []) {
    if (!t.key || !t.key.href) continue;
    const tree = await api.get(pathOf(t.key.href), api.ns.static);
    if (tree.status !== 200 || !tree.json) continue;
    const j = tree.json, classId = j.playable_class && j.playable_class.id, spec = j.playable_specialization || {};
    if (!classes[classId]) continue;
    const raw = j.spec_talent_nodes || [];
    const nodes = await pool(raw, 10, async (n) => {
      const ranks = n.ranks || [];
      const first = ranks[0] && ranks[0].tooltip ? ranks[0].tooltip : {};
      const spellId = first.spell_tooltip && first.spell_tooltip.spell ? first.spell_tooltip.spell.id : null;
      const name = (first.talent && first.talent.name) || (first.spell_tooltip && first.spell_tooltip.spell && first.spell_tooltip.spell.name) || "Talent";
      return [n.id, n.display_row, n.display_col, name, spellId ? await icon("spell", spellId) : null,
        ranks.map((r) => (r.tooltip && r.tooltip.spell_tooltip && r.tooltip.spell_tooltip.description) || ""),
        n.locked_by || []];
    });
    // Blizzard numbers columns across the whole class (tree 1: 1–4, tree 2: 7–10, tree 3: 14–17).
    // Convert to 1–4 per tree, and drop stray entries outside the 7×4 grid (a few duplicates
    // in Blizzard's data sit at row 63, row 33 or column 170).
    const kept = [];
    for (const n of nodes) {
      const col = n[2] >= 13 ? n[2] - 13 : n[2] >= 6 ? n[2] - 6 : n[2];
      if (n[1] < 1 || n[1] > 7 || col < 1 || col > 4) { log(`Talents: skipped stray "${n[3]}" (row ${n[1]}, col ${n[2]}) in ${spec.name}`); continue; }
      n[2] = col;
      kept.push(n);
    }
    const ids = new Set(kept.map((n) => n[0]));
    for (const n of kept) n[6] = n[6].filter((id) => ids.has(id));
    kept.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    nodes.length = 0; nodes.push(...kept);
    classes[classId].specs.push({ id: spec.id, name: spec.name || j.name, icon: spec.id ? await icon("playable-specialization", spec.id) : null, nodes });
  }

  // keep each class's trees in Blizzard's order (as listed on the class)
  const out = [];
  for (const c of cls.json.classes) {
    const cd = await api.get(`/data/wow/playable-class/${c.id}`, api.ns.static);
    const order = ((cd.json && cd.json.specializations) || []).map((s) => s.id);
    const k = classes[c.id];
    k.specs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (k.specs.length) out.push(k);
  }
  const total = out.reduce((s, c) => s + c.specs.reduce((x, sp) => x + sp.nodes.length, 0), 0);
  log(`Talents: ${out.length} classes, ${total} talents`);
  return { day: today, classes: out };
}

export { fetchTalents };
