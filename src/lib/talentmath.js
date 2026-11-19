// Forever Tome talent rules, shared by the talent calculator (browser) and its tests (Node) as an ES module.
// Classic-style rules: 1 point per level from 10 (51 at level 60); each row needs 5 more
// points spent in that tree; a talent with a prerequisite needs that talent maxed first.
//
// A "build" is { [treeIndex]: { [nodeId]: rank } }. Trees come from the talents data:
//   spec.nodes = [[nodeId, row, col, name, icon, [rankDescriptions], [requiredNodeIds]], ...]

const pointsForLevel = (level) => Math.max(0, Math.min(60, Math.floor(level || 0)) - 9);
const maxRank = (node) => node[5].length || 1;
const rankOf = (build, t, node) => ((build[t] || {})[node[0]] || 0);
const treeTotal = (build, t) => Object.values(build[t] || {}).reduce((s, r) => s + r, 0);
const total = (build) => Object.keys(build).reduce((s, t) => s + treeTotal(build, t), 0);

// points spent in rows above `row` in tree t
function spentAbove(spec, build, t, row) {
  let s = 0;
  for (const n of spec.nodes) if (n[1] < row) s += rankOf(build, t, n);
  return s;
}

// Why a talent can't take another point (or null if it can).
function whyLocked(specs, build, t, node, available) {
  const spec = specs[t];
  if (rankOf(build, t, node) >= maxRank(node)) return "max";
  if (total(build) >= available) return "no-points";
  const need = (node[1] - 1) * 5;
  if (spentAbove(spec, build, t, node[1]) < need) return "row:" + need;
  for (const req of node[6]) {
    const r = spec.nodes.find((n) => n[0] === req);
    if (r && rankOf(build, t, r) < maxRank(r)) return "req:" + req;
  }
  return null;
}

// Is the build valid (row thresholds + prerequisites) for one tree?
function treeValid(spec, build, t) {
  for (const n of spec.nodes) {
    const r = rankOf(build, t, n);
    if (!r) continue;
    if (spentAbove(spec, build, t, n[1]) < (n[1] - 1) * 5) return false;
    for (const req of n[6]) {
      const p = spec.nodes.find((x) => x[0] === req);
      if (p && rankOf(build, t, p) < maxRank(p)) return false;
    }
  }
  return true;
}

function add(specs, build, t, node, available) {
  if (whyLocked(specs, build, t, node, available)) return false;
  (build[t] || (build[t] = {}))[node[0]] = rankOf(build, t, node) + 1;
  return true;
}

// Remove one rank, but only if nothing that depends on it would become invalid.
function remove(specs, build, t, node) {
  const r = rankOf(build, t, node);
  if (!r) return false;
  build[t][node[0]] = r - 1;
  if (!build[t][node[0]]) delete build[t][node[0]];
  if (!treeValid(specs[t], build, t)) { build[t][node[0]] = r; return false; }
  return true;
}

// Short share code: one digit (rank) per talent in each tree, trees joined by "-".
// Trailing zeros are trimmed: "2305" + "-" + "" + "-" + "05".
function encode(specs, build) {
  return specs.map((spec, t) => spec.nodes.map((n) => Math.min(9, rankOf(build, t, n))).join("").replace(/0+$/, "")).join("-");
}
function decode(specs, code) {
  const build = {};
  String(code || "").split("-").forEach((part, t) => {
    if (!specs[t]) return;
    specs[t].nodes.forEach((n, i) => {
      const r = Math.min(maxRank(n), parseInt(part.charAt(i), 10) || 0);
      if (r) (build[t] || (build[t] = {}))[n[0]] = r;
    });
  });
  return build;
}

// Rebuild a (possibly hand-edited) build so it follows the rules: points are re-added row by
// row, and anything a real player couldn't take is dropped. Repeats until nothing changes,
// so same-row prerequisites work too.
function sanitize(specs, wanted, available) {
  const build = {};
  let changed = true;
  while (changed) {
    changed = false;
    specs.forEach((spec, t) => {
      const order = spec.nodes.slice().sort((a, b) => a[1] - b[1] || a[2] - b[2]);
      for (const n of order) {
        const want = Math.min(maxRank(n), (wanted[t] || {})[n[0]] || 0);
        while (rankOf(build, t, n) < want && add(specs, build, t, n, available)) changed = true;
      }
    });
  }
  return build;
}

export { pointsForLevel, maxRank, rankOf, treeTotal, total, whyLocked, treeValid, add, remove, encode, decode, sanitize };
