// Profession leveling cost: the cheapest way from one skill to another at today's prices.
// Pure functions, shared by the leveling calculator (/leveling), its profession pages and the tests
// (pipeline/levelmath.test.js).
//
// Skill-up chance per craft (the classic rule): 100% while the recipe is orange (below its yellow
// skill), then (grey − skill) / (grey − yellow) through yellow and green, 0 once it's grey.
// Each skill point is a separate choice (which recipe is cheapest per expected point at that skill),
// so picking the cheapest recipe at every skill level gives the cheapest expected total.
//
// When a recipe becomes available: patterns and plans have a known required skill. Trainer recipes
// don't (the trainer sets it and that isn't in the game files), so we count them from their yellow
// skill. They may really be learnable a little earlier, so the true cost can only be a bit lower.

/** Chance (0–1) that one craft of this recipe gives a skill point at `skill`. info: [req|null, yellow, grey, source, ...] */
function skillUpChance(info, skill) {
  if (!info || !info[2]) return 0;
  const [req, yellow, grey] = info;
  const from = req != null ? req : yellow; // trainer recipes: from their yellow skill (see above)
  if (skill < from || skill >= grey) return 0;
  if (skill < yellow) return 1;
  return (grey - skill) / (grey - yellow);
}

// recipes: recipe rows [id, name, category, itemId|null, itemName, makes, [[reagentId, qty, name], ...], info]
// price(id) → { unit, source: "ah"|"vendor", house?: string|null, listed?: number } | null (no price)
// opts:
//   from, to         skill now and the skill you want (default 1 → 300)
//   sources          which recipes count: ["trainer", "auto"] by default; add "item" for patterns/plans
//   results          what you do with what you make: "keep" (default), "vendor" (sell price × makes)
//                    or "ah" (AH market price × makes, minus the 5% cut)
//   sellPrice(itemId) → vendor sell price;  ahPrice(itemId) → AH market price   (for `results`)
// Returns {
//   steps: [{ from, to, recipe, crafts, costEach, cost }]   consecutive skills done with the same recipe
//   total, shopping: [{ id, name, qty, unit, source, house, listed, cost }]  (most expensive first)
//   gaps: [skill, ...]   skills where no priced recipe gives points (the plan skips over them)
//   patterns: [teachItemId, ...] recipe items you'd need (when "item" recipes are used)
// }
function planLeveling(recipes, price, opts = {}) {
  const from = Math.max(1, opts.from || 1), to = opts.to || 300;
  const sources = new Set(opts.sources || ["trainer", "auto"]);
  const results = opts.results || "keep";

  // per craft: materials cost, minus what the result is worth if you sell it
  const usable = [];
  for (const r of recipes || []) {
    const info = r[7];
    if (!info || !sources.has(info[3]) || !r[6] || !r[6].length) continue;
    let cost = 0, ok = true;
    for (const [id, qty] of r[6]) {
      const p = price(id);
      if (!p || p.unit == null) { ok = false; break; }
      cost += p.unit * qty;
    }
    if (!ok) continue;
    const makes = r[5] || 1;
    let back = 0;
    if (r[3] && results === "vendor" && opts.sellPrice) back = (opts.sellPrice(r[3]) || 0) * makes;
    if (r[3] && results === "ah" && opts.ahPrice) back = Math.floor((opts.ahPrice(r[3]) || 0) * 0.95) * makes;
    usable.push({ r, info, materials: cost, costEach: cost - back });
  }

  // the cheapest recipe per expected skill point, at every skill
  const steps = [], gaps = [];
  for (let s = from; s < to; s++) {
    let best = null, bestPerPoint = Infinity, bestChance = 0;
    for (const u of usable) {
      const ch = skillUpChance(u.info, s);
      if (ch <= 0) continue;
      const perPoint = u.costEach / ch;
      // ties: the surer recipe (fewer crafts), then the cheaper one per craft
      if (perPoint < bestPerPoint - 1e-9 || (Math.abs(perPoint - bestPerPoint) < 1e-9 && ch > bestChance)) {
        best = u; bestPerPoint = perPoint; bestChance = ch;
      }
    }
    if (!best) { gaps.push(s); continue; }
    const last = steps[steps.length - 1];
    if (last && last.u === best && last.to === s) { last.to = s + 1; last.expected += 1 / bestChance; }
    else steps.push({ from: s, to: s + 1, u: best, expected: 1 / bestChance });
  }

  // whole crafts per step, the materials they need, and the total
  const need = new Map();
  let total = 0;
  const patterns = new Set();
  const outSteps = steps.map((st) => {
    const crafts = Math.ceil(st.expected - 1e-9);
    const cost = crafts * st.u.costEach;
    total += cost;
    for (const [id, qty, name] of st.u.r[6]) {
      const n = need.get(id) || { id, name, qty: 0 };
      n.qty += qty * crafts;
      need.set(id, n);
    }
    if (st.u.info[3] === "item" && st.u.info[4]) patterns.add(st.u.info[4]);
    return { from: st.from, to: st.to, recipe: st.u.r, crafts, costEach: st.u.costEach, materials: st.u.materials, cost };
  });
  const shopping = [...need.values()].map((n) => {
    const p = price(n.id);
    return { ...n, unit: p.unit, source: p.source, house: p.house || null, listed: p.listed ?? null, cost: p.unit * n.qty };
  }).sort((a, b) => b.cost - a.cost);

  return { steps: outSteps, total, shopping, gaps, patterns: [...patterns] };
}

/** Skill ranges as players say them: [[from, to], ...] → "52–60, 75" */
function rangesText(skills) {
  const out = [];
  for (const s of skills) {
    const last = out[out.length - 1];
    if (last && last[1] === s - 1) last[1] = s; else out.push([s, s]);
  }
  return out.map(([a, b]) => (a === b ? String(a) : a + "–" + b)).join(", ");
}

export { skillUpChance, planLeveling, rangesText };
