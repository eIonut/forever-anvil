// Recipe details Blizzard's API leaves out: the skill a recipe needs and how you learn it.
// They come from WoW: Forever's own game files, which wago.tools publishes as tables per build:
//   SkillLineAbility  one row per recipe; its ID is Blizzard's recipe id. Gives the recipe's spell,
//                     how it's learned (AcquireMethod 1 = with the profession) and the skill at
//                     which it turns yellow (TrivialSkillLineRankLow) and grey (…High)
//   ItemEffect + ItemXItemEffect   items whose use teaches a spell (patterns, plans, formulas…)
//   ItemSparse        the skill such an item needs (RequiredSkillRank)
// Trainer recipes: the skill to learn one is set on the trainer, which isn't in the game files,
// so for those we only know when it turns yellow / green / grey.
//
// Result, per recipe id: [required|null, yellow, grey, source, teachItemId|0, spellId]
//   source: "auto" (learned with the profession), "item" (from a pattern/plan…), "trainer"
const WAGO = "https://wago.tools";
const UA = { "User-Agent": "ForeverTome-price-job" };

async function latestBuild() {
  const r = await fetch(WAGO + "/api/builds", { headers: UA });
  if (!r.ok) throw new Error("wago builds: HTTP " + r.status);
  const j = await r.json();
  const b = (j.wowf || [])[0];
  if (!b) throw new Error("wago builds: no WoW: Forever build listed");
  return b.version;
}

async function table(name, build) {
  const r = await fetch(`${WAGO}/db2/${name}/csv?build=${build}`, { headers: UA });
  if (!r.ok) throw new Error(`wago ${name}: HTTP ${r.status}`);
  return parseCsv(await r.text());
}

/** CSV with a header row → array of objects (handles quoted fields with commas and "" escapes) */
function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/** Pure part, so it can be tested: tables → { [recipeId]: info } for the given recipe ids */
function buildRecipeInfo(recipeIds, sla, itemEffect, itemXEffect, itemSparse) {
  const teachSpellOf = new Map(); // ItemEffect id → spell it teaches
  for (const e of itemEffect) if (e.TriggerType === "6") teachSpellOf.set(e.ID, Number(e.SpellID));
  const teachers = new Map();     // spell → items that teach it
  for (const x of itemXEffect) {
    const sp = teachSpellOf.get(x.ItemEffectID);
    if (!sp) continue;
    if (!teachers.has(sp)) teachers.set(sp, []);
    teachers.get(sp).push(Number(x.ItemID));
  }
  const need = new Map();         // item → [RequiredSkill, RequiredSkillRank]
  for (const it of itemSparse) need.set(Number(it.ID), [Number(it.RequiredSkill), Number(it.RequiredSkillRank)]);

  const byId = new Map();
  for (const r of sla) byId.set(Number(r.ID), r);
  const out = {};
  for (const id of recipeIds) {
    const r = byId.get(id);
    if (!r) continue;
    const spell = Number(r.Spell), line = Number(r.SkillLine);
    const yellow = Number(r.TrivialSkillLineRankLow) || 0, grey = Number(r.TrivialSkillLineRankHigh) || 0;
    // a teaching item for this profession; the one needing the least skill if there are several
    const items = (teachers.get(spell) || []).filter((i) => need.has(i))
      .sort((a, b) => need.get(a)[1] - need.get(b)[1]);
    const own = items.filter((i) => need.get(i)[0] === line || need.get(i)[0] === 0);
    const item = own[0] || items[0] || 0;
    let source, required = null;
    if (r.AcquireMethod === "1") { source = "auto"; required = 1; }
    else if (item) { source = "item"; required = need.get(item)[1] || 1; }
    else source = "trainer";
    out[id] = [required, yellow, grey, source, item, spell];
  }
  return out;
}

/** Downloads the tables and returns { build, info } for the recipes in a recipes file */
async function fetchRecipeInfo(recipes, log) {
  const build = await latestBuild();
  const [sla, eff, x, sparse] = await Promise.all(
    ["SkillLineAbility", "ItemEffect", "ItemXItemEffect", "ItemSparse"].map((t) => table(t, build)));
  const ids = [];
  for (const p of recipes.professions) for (const r of p.recipes) ids.push(r[0]);
  const info = buildRecipeInfo(ids, sla, eff, x, sparse);
  const n = Object.keys(info).length;
  log(`Recipe details (game build ${build}): ${n} of ${ids.length} recipes`);
  return { build, info };
}

export { fetchRecipeInfo, buildRecipeInfo, parseCsv };
