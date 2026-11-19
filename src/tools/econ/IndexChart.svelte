<script lang="ts">
  // Market indexes: a list of every index (trend, level, change) and a chart comparing up to five
  // indexes or items. Lines are rebased to 100 at the start of the chosen range, so they share one axis.
  import { tick } from "svelte";
  import { INDEXES, DAY, seriesFrom } from "../../lib/econmath.js";
  import { getJSON, priceUrl } from "../../lib/api";
  import { announce } from "../../lib/announce";
  import { itemName } from "../itemIcons.svelte";
  import type { EconGroup, ItemPrice } from "../types";
  import ItemIcon from "../ItemIcon.svelte";
  import Sparkline from "./Sparkline.svelte";
  import { SERIES_COLORS, pctText } from "./shared";

  interface Props { series: EconGroup | null; region: string; group: string; houseId: string | null; houseItems: Record<string, ItemPrice> }
  let { series, region, group, houseId, houseItems }: Props = $props();

  type Range = "1d" | "1w" | "all";
  const RANGES: [Range, string, string, number][] = [["1d", "1D", "the last day", DAY], ["1w", "1W", "the last week", 7 * DAY], ["all", "All", "all of the history", Infinity]];
  const MAX_LINES = 5;
  const GROUPS = [...new Set(INDEXES.map((d) => d.group))];

  let range = $state<Range>("all");
  /** chosen lines; a line keeps its colour slot while it's shown (colour follows the line, not its position) */
  let chosen = $state<{ key: string; slot: number }[]>([{ key: "TOP100", slot: 0 }]);
  /** "item:<id>" → its daily points, or null while loading */
  let itemPts = $state<Record<string, [number, number][] | null>>({});
  let term = $state("");
  let hoverT = $state<number | null>(null);

  const lastT = $derived(series && series.t.length ? series.t[series.t.length - 1] : 0);
  const fromSec = $derived(range === "all" ? 0 : lastT - RANGES.find((r) => r[0] === range)![3]);
  const rangeWords = $derived(RANGES.find((r) => r[0] === range)![2]);

  const indexPoints = (k: string, from: number): [number, number][] => (series ? (seriesFrom(series.t, series.idx[k] || [], from) as [number, number][]) : []);
  const nameOf = (key: string) => (key.startsWith("item:") ? itemName(key.slice(5)) || "Item #" + key.slice(5) : INDEXES.find((d) => d.k === key)?.name || key);

  // the list: every index with its level now and its change over the range
  const rows = $derived(INDEXES.map((d) => {
    const all = indexPoints(d.k, 0), pts = indexPoints(d.k, fromSec);
    const level = all.length ? all[all.length - 1][1] : null;
    const change = pts.length >= 2 ? (pts[pts.length - 1][1] / pts[0][1] - 1) * 100 : null;
    return { ...d, pts, level, change };
  }));

  // the chart's lines, rebased to 100 at their first point in range
  const lines = $derived(chosen.map((c) => {
    const raw = c.key.startsWith("item:") ? (itemPts[c.key] || []).filter((p) => p[0] >= fromSec) : indexPoints(c.key, fromSec);
    const base = raw.length ? raw[0][1] : 1;
    return { key: c.key, name: nameOf(c.key), color: SERIES_COLORS[c.slot], loading: c.key.startsWith("item:") && itemPts[c.key] === null, pts: raw.map((p) => [p[0], (p[1] / base) * 100] as [number, number]), raw };
  }));

  const W = 760, H = 300, PL = 46, PR = 14, PT = 14, PB = 30;
  function niceTicks(lo: number, hi: number, n = 5) {
    const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0 || 1)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
    return out;
  }
  const chart = $derived.by(() => {
    const drawn = lines.filter((l) => l.pts.length >= 2);
    if (!drawn.length) return null;
    const ts = drawn.flatMap((l) => l.pts.map((p) => p[0])), vs = drawn.flatMap((l) => l.pts.map((p) => p[1]));
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    let v0 = Math.min(...vs, 100), v1 = Math.max(...vs, 100);
    const pad = (v1 - v0) * 0.08 || 5; v0 -= pad; v1 += pad;
    const X = (t: number) => PL + ((t - t0) / (t1 - t0 || 1)) * (W - PL - PR);
    const Y = (v: number) => PT + (1 - (v - v0) / (v1 - v0)) * (H - PT - PB);
    const span = t1 - t0;
    const opts: Intl.DateTimeFormatOptions = span <= 18 * 3600 ? { hour: "numeric", minute: "2-digit" } : span <= 4 * DAY ? { month: "short", day: "numeric", hour: "numeric" } : { month: "short", day: "numeric" };
    const fmt = (t: number) => new Date(t * 1000).toLocaleString(undefined, opts);
    const xt = [t0, t0 + span / 2, t1].map((t) => ({ x: X(t), label: fmt(t) }));
    const times = [...new Set(ts)].sort((a, b) => a - b);
    return {
      X, Y, t0, t1, xt, times,
      yt: niceTicks(v0, v1).map((v) => ({ y: Y(v), v })),
      base: Y(100),
      paths: drawn.map((l) => ({ ...l, d: l.pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ") })),
    };
  });

  // hover: snap to the nearest time any line has, show each line's value there
  function onMove(e: PointerEvent) {
    if (!chart) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = chart.t0 + ((x - PL) / (W - PL - PR)) * (chart.t1 - chart.t0);
    let best = chart.times[0];
    for (const tt of chart.times) if (Math.abs(tt - t) < Math.abs(best - t)) best = tt;
    hoverT = best;
  }
  // a line's value at time t, read off the drawn line (straight between points); null outside the line
  const at = (pts: [number, number][], t: number): [number, number] | null => {
    if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return null;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] === t) return pts[i];
      if (pts[i][0] > t) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return [t, v0 + (v1 - v0) * (t - t0) / (t1 - t0)]; }
    }
    return null;
  };
  const hover = $derived.by(() => {
    if (!chart || hoverT == null) return null;
    const t = hoverT;
    return {
      x: chart.X(t), left: (chart.X(t) / W) * 100,
      label: new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      rows: chart.paths.map((l) => { const p = at(l.pts, t); return { key: l.key, name: l.name, color: l.color, v: p ? p[1] : null, y: p ? chart.Y(p[1]) : null }; }),
    };
  });

  function toggle(key: string) {
    const i = chosen.findIndex((c) => c.key === key);
    if (i >= 0) { chosen = chosen.filter((c) => c.key !== key); announce(nameOf(key) + " removed from the chart"); return; }
    if (chosen.length >= MAX_LINES) { announce("The chart shows up to " + MAX_LINES + " lines. Remove one first."); return; }
    const used = new Set(chosen.map((c) => c.slot));
    chosen = [...chosen, { key, slot: [0, 1, 2, 3, 4].find((s) => !used.has(s))! }];
    announce(nameOf(key) + " added to the chart");
  }

  // item search: items listed on this auction house
  const matches = $derived.by(() => {
    const t = term.toLowerCase().trim();
    if (t.length < 2) return [];
    const out: number[] = [];
    for (const id of Object.keys(houseItems)) {
      const n = itemName(id);
      if (n && n.toLowerCase().includes(t)) out.push(+id);
      if (out.length >= 8) break;
    }
    return out;
  });
  async function addItem(id: number) {
    const key = "item:" + id;
    term = "";
    if (chosen.some((c) => c.key === key)) return;
    if (chosen.length >= MAX_LINES) { announce("The chart shows up to " + MAX_LINES + " lines. Remove one first."); return; }
    itemPts = { ...itemPts, [key]: null };
    toggle(key);
    const h = await getJSON<Record<string, Record<string, number[][]>>>(priceUrl("history", region, group + "_" + (id % 32)));
    const pts = (houseId && h?.[houseId]?.[id]) || [];
    itemPts = { ...itemPts, [key]: pts.map((p) => [p[0] * DAY + DAY / 2, p[1]] as [number, number]) };
    await tick();
  }

  // a different market makes item lines meaningless: drop them (indexes stay)
  let lastMarket = "";
  $effect(() => {
    const m = region + ":" + group + ":" + houseId;
    if (lastMarket && m !== lastMarket) { chosen = chosen.filter((c) => !c.key.startsWith("item:")); itemPts = {}; }
    lastMarket = m;
  });

  const summary = $derived(lines.filter((l) => l.pts.length >= 2).map((l) => l.name + " " + pctText(l.pts[l.pts.length - 1][1] - 100)).join(", "));
</script>

<section class="panel ec-index" aria-labelledby="ec-idx-title">
  <div class="section-head">
    <h2 id="ec-idx-title">Market indexes</h2>
    <div class="seg-buttons" role="group" aria-label="Time range">
      {#each RANGES as [r, label, words]}<button type="button" class:active={range === r} aria-pressed={range === r} aria-label={"Show " + words} onclick={() => (range = r)}>{label}</button>{/each}
    </div>
  </div>
  <p class="faint ec-lead">Each index follows the typical price of a group of items and started at 100 when tracking began: 120 means about 20% dearer than then. Pick up to five indexes or items to compare.</p>

  {#if !series || !series.t.length}
    <p class="faint">Index history starts with the next price update.</p>
  {:else}
    <div class="ec-idx-grid">
      <div class="ec-idx-list">
        <div class="ec-idx-head" aria-hidden="true"><span>Index</span><span>Trend</span><span>Now</span><span>Change</span></div>
        {#each GROUPS as g}
          <h3 class="mini-head">{g}</h3>
          <ul>
            {#each rows.filter((r) => r.group === g) as r (r.k)}
              {@const c = chosen.find((x) => x.key === r.k)}
              <li>
                <button type="button" class="ec-idx-row" class:on={!!c} aria-pressed={!!c} title={r.desc} onclick={() => toggle(r.k)}>
                  <span class="ec-idx-name"><span class="ec-swatch" style:background={c ? SERIES_COLORS[c.slot] : "transparent"} aria-hidden="true"></span>{r.name}</span>
                  <Sparkline points={r.pts} color={c ? SERIES_COLORS[c.slot] : "var(--ink-faint)"} />
                  <span class="ec-num">{r.level == null ? "—" : r.level.toFixed(1)}</span>
                  <span class="pct {r.change == null ? '' : r.change >= 0 ? 'up' : 'down'}">{#if r.change != null}{r.change >= 0 ? "▲" : "▼"}{/if} {pctText(r.change)}<span class="sr-only"> over {rangeWords}</span></span>
                </button>
              </li>
            {/each}
          </ul>
        {/each}
      </div>

      <div class="ec-idx-chart">
        <div class="ec-add">
          <label class="field-label" for="ec-item-search">Add an item to compare</label>
          <input class="input" id="ec-item-search" type="search" placeholder="e.g. Copper Ore, Runecloth" autocomplete="off" bind:value={term} disabled={chosen.length >= MAX_LINES} />
          {#if matches.length}
            <ul class="ec-matches">{#each matches as id (id)}<li><button type="button" onclick={() => addItem(id)}><ItemIcon {id} />{itemName(id)}</button></li>{/each}</ul>
          {/if}
        </div>

        <ul class="ec-legend" aria-label="Lines on the chart">
          {#each lines as l (l.key)}
            <li><span class="ec-swatch" style:background={l.color} aria-hidden="true"></span>{l.name}{#if l.loading} (loading…){/if}
              <button type="button" class="ec-x" aria-label={"Remove " + l.name} onclick={() => toggle(l.key)}>×</button></li>
          {:else}<li class="faint">Pick an index on the left.</li>{/each}
        </ul>

        {#if chart}
          <div class="ec-plot">
            <svg viewBox="0 0 {W} {H}" role="img" aria-label={"Chart over " + rangeWords + ", 100 = start of the range. " + summary} onpointermove={onMove} onpointerleave={() => (hoverT = null)}>
              {#each chart.yt as t}<line class="ec-grid" x1={PL} x2={W - PR} y1={t.y} y2={t.y} /><text class="ec-tick" x={PL - 6} y={t.y + 4} text-anchor="end">{t.v}</text>{/each}
              <line class="ec-base" x1={PL} x2={W - PR} y1={chart.base} y2={chart.base} />
              {#each chart.xt as t, i}<text class="ec-tick" x={t.x} y={H - 8} text-anchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{t.label}</text>{/each}
              {#each chart.paths as l (l.key)}
                <path class="ec-line" d={l.d} stroke={l.color} />
                {#if l.pts.length}{@const p = l.pts[l.pts.length - 1]}<circle class="ec-end" cx={chart.X(p[0])} cy={chart.Y(p[1])} r="4" fill={l.color} />{/if}
              {/each}
              {#if hover}
                <line class="ec-cross" x1={hover.x} x2={hover.x} y1={PT} y2={H - PB} />
                {#each hover.rows as r (r.key)}{#if r.y != null}<circle class="ec-end" cx={hover.x} cy={r.y} r="4.5" fill={r.color} />{/if}{/each}
              {/if}
              <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="transparent" />
            </svg>
            {#if hover}
              <div class="ec-tip" style:left="{Math.min(Math.max(hover.left, 18), 82)}%" aria-hidden="true">
                <b>{hover.label}</b>
                {#each hover.rows as r (r.key)}<div><span class="ec-swatch" style:background={r.color}></span>{r.name}<span class="ec-num">{r.v == null ? "—" : r.v.toFixed(1)}</span></div>{/each}
              </div>
            {/if}
          </div>
          <p class="faint ec-axis-note">100 = start of the range. Indexes update hourly; items use their daily price.</p>
        {:else if lines.length}
          <p class="faint ec-empty">Not enough history in this range yet{range !== "all" ? " — try All" : ""}. A new point is added with every price update.</p>
        {/if}

        {#if lines.length}
          <details class="ec-table">
            <summary>Show the numbers</summary>
            <div class="table-wrap"><table class="prices">
              <caption class="sr-only">Lines on the chart over {rangeWords}</caption>
              <thead><tr><th scope="col">Line</th><th scope="col">Start of range</th><th scope="col">Latest</th><th scope="col">Change</th></tr></thead>
              <tbody>{#each lines as l (l.key)}<tr><th scope="row">{l.name}</th>
                <td>{l.raw.length ? (l.key.startsWith("item:") ? (l.raw[0][1] / 10000).toFixed(2) + "g" : l.raw[0][1].toFixed(1)) : "—"}</td>
                <td>{l.raw.length ? (l.key.startsWith("item:") ? (l.raw[l.raw.length - 1][1] / 10000).toFixed(2) + "g" : l.raw[l.raw.length - 1][1].toFixed(1)) : "—"}</td>
                <td>{l.pts.length >= 2 ? pctText(l.pts[l.pts.length - 1][1] - 100) : "—"}</td></tr>{/each}</tbody>
            </table></div>
          </details>
        {/if}
      </div>
    </div>
  {/if}
</section>
