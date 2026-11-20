// Economy step of the price job: the materials ledger's 24-hour price changes.
//
// Writes (each run):
//   econ:<region>       served to the Economy page:
//                       { v: 2, region, updated, groups: { [group]: { board } } }
//                       board = { [houseId]: { [itemId]: pctChangeSinceAboutADayAgo } }
//   econstate:<region>  pipeline-only: about 36 hours of board-item prices, to work out those changes
// On the first run for a group (no saved prices yet) the ring is started from yesterday's daily
// history, so the board shows changes straight away.
import { SHARDS, dayNumber } from "../src/lib/pricemath.js";
import { snapshotsFromHistory, updateRing, DAY } from "../src/lib/econmath.js";

/** The newest past day of a group's daily history as a snapshot, or null when there is none. */
async function yesterday(store, region, g, houses, today) {
  const history = {};
  for (let shard = 0; shard < SHARDS; shard++) {
    const h = (await store.getJSON(`history:${region}:${g}:${shard}`)) || {};
    for (const [houseId, its] of Object.entries(h)) Object.assign(history[houseId] || (history[houseId] = {}), its);
  }
  const past = snapshotsFromHistory(history, houses).filter((s) => s.day < today);
  return past.length ? past[past.length - 1] : null;
}

/** store: the job's store; latestByGroup: this run's group files. */
async function updateEconomy(store, region, latestByGroup, nowMs, log) {
  const nowSec = Math.floor(nowMs / 1000), today = dayNumber(nowMs);
  const econ = { v: 2, region, groups: {} };
  const state = (await store.getJSON(`econstate:${region}`)) || { rings: {} };

  for (const [g, cur] of Object.entries(latestByGroup)) {
    if (!state.rings[g]) {
      const last = await yesterday(store, region, g, cur.houses, today);
      if (last) {
        state.rings[g] = updateRing(null, last.group, last.day * DAY + DAY / 2).ring;
        log(`Economy ${g}: started the 24-hour ring from day ${last.day} of the history`);
      }
    }
    const { ring, chg } = updateRing(state.rings[g], cur, nowSec);
    state.rings[g] = ring;
    econ.groups[g] = { board: chg };
  }

  econ.updated = new Date(nowMs).toISOString();
  const bytes = await store.putJSON(`econ:${region}`, econ);
  await store.putJSON(`econstate:${region}`, state);
  log(`Economy: ${Object.keys(latestByGroup).length} groups → ${(bytes / 1024).toFixed(0)} KB`);
}

export { updateEconomy };
