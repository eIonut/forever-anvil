<script lang="ts">
  // "Where the gold is": gold listed per item class as a treemap (area = gold), with a list for screen readers.
  import { squarify } from "../../lib/econmath.js";
  import { goldText } from "./shared";

  let { values, scopeLabel }: { values: [string, number][]; scopeLabel: string } = $props();

  const W = 1000, H = 420;
  let cw = $state(1000), ch = $state(420); // the box's real size, so labels only show where they fit
  const total = $derived(values.reduce((s, v) => s + v[1], 0));
  const cells = $derived(squarify(values.map(([key, value]) => ({ key, value })), W, H).map((c: any) => ({
    ...c, share: total ? c.value / total : 0,
  })));
  const maxShare = $derived(Math.max(0.0001, ...cells.map((c: any) => c.share)));
  const pct = (s: number) => (s >= 0.095 ? Math.round(s * 100) : Math.round(s * 1000) / 10) + "%";
</script>

<div class="ec-tree" bind:clientWidth={cw} bind:clientHeight={ch} role="img" aria-label={"Gold listed by item class, " + scopeLabel + ": " + values.slice(0, 6).map(([k, v]) => k + " " + pct(total ? v / total : 0)).join(", ")}>
  {#each cells as c (c.key)}
    {@const pw = (c.w / W) * cw}
    {@const ph = (c.h / H) * ch}
    {@const big = pw > 110 && ph > 70}
    <div class="ec-cell" class:big title="{c.key}: {pct(c.share)} · {goldText(c.value)}"
      style:left="{(c.x / W) * 100}%" style:top="{(c.y / H) * 100}%" style:width="{(c.w / W) * 100}%" style:height="{(c.h / H) * 100}%"
      style:--a={(0.08 + 0.26 * (c.share / maxShare)).toFixed(3)}>
      {#if pw > 62 && ph > 44}<span class="ec-cell-name">{c.key}</span><b>{pct(c.share)}</b>{#if big}<span class="ec-cell-gold">{goldText(c.value)}</span>{/if}{/if}
    </div>
  {/each}
</div>
<details class="ec-table">
  <summary>Show the numbers</summary>
  <div class="table-wrap"><table class="prices">
    <caption class="sr-only">Gold listed by item class, {scopeLabel}</caption>
    <thead><tr><th scope="col">Class</th><th scope="col">Share</th><th scope="col">Gold listed</th></tr></thead>
    <tbody>{#each values as [k, v] (k)}<tr><th scope="row">{k}</th><td>{pct(total ? v / total : 0)}</td><td>{goldText(v)}</td></tr>{/each}</tbody>
  </table></div>
</details>
