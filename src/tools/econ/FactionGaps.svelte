<script lang="ts">
  // Alliance vs Horde: the biggest typical-price gaps between the two faction auction houses,
  // drawn on a log price scale (one marker per faction, joined by a line).
  import { factionGaps } from "../../lib/econmath.js";
  import { moneyText } from "../../lib/format";
  import { itemSource, itemName } from "../itemIcons.svelte";
  import type { GroupPrices } from "../types";
  import ItemLink from "../ItemLink.svelte";
  import Money from "../Money.svelte";
  import { ALLIANCE, HORDE } from "./shared";

  let { group }: { group: GroupPrices } = $props();

  const TABS: [string, string][] = [["all", "Everything"], ["trade", "Trade goods"], ["cons", "Consumables"], ["gear", "Gear"], ["recipe", "Recipes"], ["other", "Other"]];
  let tab = $state("all");

  const all = $derived(factionGaps(group, itemSource.items));
  const list = $derived(all.filter((g: any) => tab === "all" || g.cat === tab).slice(0, 12));

  // log scale over the shown prices, with gridlines at 1c, 10c, 1s, 10s, 1g, 10g, 100g…
  const scale = $derived.by(() => {
    if (!list.length) return null;
    const vals = list.flatMap((g: any) => [g.alliance, g.horde]);
    const lo = Math.floor(Math.log10(Math.min(...vals))), hi = Math.ceil(Math.log10(Math.max(...vals)));
    const span = Math.max(1, hi - lo);
    const pos = (v: number) => ((Math.log10(v) - lo) / span) * 100;
    const LABEL: Record<number, string> = { 0: "1c", 1: "10c", 2: "1s", 3: "10s", 4: "1g", 5: "10g", 6: "100g", 7: "1,000g", 8: "10,000g" };
    const ticks = [];
    for (let e = lo; e <= hi; e++) ticks.push({ left: pos(Math.pow(10, e)), label: LABEL[e] || "" });
    return { pos, ticks };
  });
</script>

<section class="panel" aria-labelledby="ec-gap-title">
  <div class="section-head">
    <h2 id="ec-gap-title">Alliance vs Horde</h2>
    <div class="seg-buttons ec-wrap-tabs" role="group" aria-label="Item type">
      {#each TABS as [t, name]}<button type="button" class:active={tab === t} aria-pressed={tab === t} onclick={() => (tab = t)}>{name}</button>{/each}
    </div>
  </div>
  <p class="faint ec-lead">The same item, very different prices on the two faction auction houses. Only items with at least 3 listings and 5 units on both sides, worth 1s or more, so a single odd listing doesn't count.</p>
  {#if !list.length}
    <p class="faint">No big gaps of this type right now.</p>
  {:else if scale}
    <div class="ec-gaps">
      <div class="ec-gap-axis" aria-hidden="true"><span></span><div class="ec-gap-scale">{#each scale.ticks as t}<span style:left="{t.left}%">{t.label}</span>{/each}</div><span></span></div>
      <ul>
        {#each list as g (g.id)}
          {@const a = scale.pos(g.alliance)}
          {@const h = scale.pos(g.horde)}
          {@const dearer = g.alliance > g.horde ? "Alliance" : "Horde"}
          <li class="ec-gap-row">
            <span class="ec-gap-item"><ItemLink id={g.id} name={itemName(g.id)} /></span>
            <span class="ec-gap-track" aria-hidden="true">
              {#each scale.ticks as t}<i class="ec-gap-grid" style:left="{t.left}%"></i>{/each}
              <i class="ec-gap-bar" style:left="{Math.min(a, h)}%" style:width="{Math.abs(a - h)}%"></i>
              <i class="ec-dot" style:left="{a}%" style:background={ALLIANCE} title="Alliance {moneyText(g.alliance)}">A</i>
              <i class="ec-dot" style:left="{h}%" style:background={HORDE} title="Horde {moneyText(g.horde)}">H</i>
            </span>
            <span class="ec-gap-val"><b>{g.ratio >= 10 ? Math.round(g.ratio) : g.ratio.toFixed(1)}×</b> <span class="faint">{dearer} pays more</span>
              <span class="sr-only">: Alliance {moneyText(g.alliance)}, Horde {moneyText(g.horde)}</span></span>
            <span class="ec-gap-prices"><span><i class="ec-key" style:background={ALLIANCE}>A</i><Money c={g.alliance} /></span><span><i class="ec-key" style:background={HORDE}>H</i><Money c={g.horde} /></span></span>
          </li>
        {/each}
      </ul>
      <p class="faint ec-legend-line"><i class="ec-key" style:background={ALLIANCE}>A</i> Alliance typical price · <i class="ec-key" style:background={HORDE}>H</i> Horde typical price · log scale</p>
    </div>
  {/if}
</section>
