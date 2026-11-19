<script lang="ts">
  // Line chart of an item's daily market price, drawn in the browser.
  // points: [[dayNumber, market, ...], ...]; null while loading.
  import Money from "./Money.svelte";

  let { points, loading }: { points: number[][] | null | undefined; loading: boolean } = $props();

  const W = 640, H = 180, P = 34;
  const label = (d: number) => new Date(d * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const chart = $derived.by(() => {
    if (!points || points.length < 2) return null;
    const days = points.map((p) => p[0]), vals = points.map((p) => p[1]);
    const x0 = Math.min(...days), x1 = Math.max(...days);
    let y0 = Math.min(...vals), y1 = Math.max(...vals);
    if (y0 === y1) { y0 = y0 * 0.9; y1 = y1 * 1.1 + 1; }
    const X = (d: number) => P + (d - x0) / Math.max(1, x1 - x0) * (W - P * 2);
    const Y = (v: number) => H - P + 6 - (v - y0) / (y1 - y0) * (H - P * 2);
    const change = Math.round((vals[vals.length - 1] - vals[0]) / vals[0] * 100);
    return {
      x0, x1, change,
      line: points.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" "),
      dots: points.map((p) => [X(p[0]).toFixed(1), Y(p[1]).toFixed(1)]),
    };
  });
</script>

{#if loading}Loading history…{:else if !points || !points.length}<p class="faint">No history yet.</p>{:else if !chart}<p class="faint">History starts building today. The chart appears after the second day of data (<Money c={points[0][1]} /> today).</p>{:else}<svg viewBox="0 0 {W} {H}" role="img" aria-label="Market price from {label(chart.x0)} to {label(chart.x1)}: {chart.change >= 0 ? 'up ' : 'down '}{Math.abs(chart.change)}%"><line x1={P} y1={H - P + 6} x2={W - P} y2={H - P + 6} class="axis" /><path d={chart.line} class="pline" />{#each chart.dots as [cx, cy]}<circle {cx} {cy} r="3" class="pdot" />{/each}<text x={P} y={H - 6} class="plabel">{label(chart.x0)}</text><text x={W - P} y={H - 6} class="plabel" text-anchor="end">{label(chart.x1)}</text></svg><p class="faint">{chart.change >= 0 ? "Up " : "Down "}{Math.abs(chart.change)}% over {chart.x1 - chart.x0} days.</p>{/if}
