// Economy step of the price job: market indexes over time and the trade board's 24-hour changes.
//
// Writes (each run):
//   econ:<region>       served to the Economy page:
//                       { v, region, updated, groups: { [group]: { t, idx, auctions, gold, board } } }
//                       t = unix seconds; idx = { [indexKey]: [value…] } starting at 100; gold in whole gold;
//                       board = { [houseId]: { [itemId]: pctChangeSinceAboutADayAgo } }
//   econstate:<region>  pipeline-only: about 26 hours of board-item prices, to work out those changes
// On the first run (no econ file yet) each group's series is seeded with one point per day from the
// 30-day history, so the charts aren't empty. All points older than 30 days are dropped.
import { SHARDS, dayNumber } from "../src/lib/pricemath.js";
import { emptySeries, pushPoint, prunePoints, snapshotsFromHistory, seedFromHistory, updateRing, INDEXES } from "../src/lib/econmath.js";

/**
 * store: the job's store; prevByGroup: last run's group files (read before they were overwritten);
 * latestByGroup: this run's group files; items: the item cache.
 */
async function updateEconomy(store, region, prevByGroup, latestByGroup, items, nowMs, log) {
  const nowSec = Math.floor(nowMs / 1000), today = dayNumber(nowMs);
  const econ = (await store.getJSON(`econ:${region}`)) || { v: 1, region, groups: {} };
  const state = (await store.getJSON(`econstate:${region}`)) || { rings: {} };

  for (const [g, cur] of Object.entries(latestByGroup)) {
    let series = econ.groups[g];
    let prev = prevByGroup[g] || null;

    if (!series || !Array.isArray(series.t)) {
      // first run for this group: start from the daily history
      const history = {};
      for (let shard = 0; shard < SHARDS; shard++) {
        const h = (await store.getJSON(`history:${region}:${g}:${shard}`)) || {};
        for (const [houseId, its] of Object.entries(h)) Object.assign(history[houseId] || (history[houseId] = {}), its);
      }
      const seeded = seedFromHistory(snapshotsFromHistory(history, cur.houses), items, today);
      series = seeded.series;
      if (seeded.last) prev = seeded.last;          // chain this hour from the newest past day
      log(`Economy ${g}: seeded ${series.t.length} daily points from history`);
      // the ring starts with that day too, so the board shows a change from the first run
      if (seeded.last) state.rings[g] = updateRing(null, seeded.last, series.t[series.t.length - 1]).ring;
    }
    // indexes added in a later version start empty, aligned with the rest
    for (const d of INDEXES) if (!series.idx[d.k]) series.idx[d.k] = new Array(series.t.length).fill(null);

    // one point per run, chained from last run's prices (no previous prices: indexes carry forward)
    let listings = 0;
    for (const h of Object.values(cur.houses)) listings += h.listings || 0;
    pushPoint(series, prev, cur, items, nowSec, listings);
    prunePoints(series, nowSec);

    const { ring, chg } = updateRing(state.rings[g], cur, nowSec);
    state.rings[g] = ring;
    series.board = chg;
    econ.groups[g] = series;
  }

  econ.updated = new Date(nowMs).toISOString();
  const bytes = await store.putJSON(`econ:${region}`, econ);
  await store.putJSON(`econstate:${region}`, state);
  log(`Economy: ${Object.keys(latestByGroup).length} groups, ${INDEXES.length} indexes → ${(bytes / 1024).toFixed(0)} KB`);
}

export { updateEconomy };
