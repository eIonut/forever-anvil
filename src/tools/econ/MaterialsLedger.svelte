<script lang="ts">
  // The trade board: crafting materials on one auction house, with lowest and typical price
  // and the change since about a day ago. Each group shows its biggest markets first.
  import { BASKETS } from "../../lib/econmath.js";
  import { itemName } from "../itemIcons.svelte";
  import type { ItemPrice } from "../types";
  import ItemLink from "../ItemLink.svelte";
  import Money from "../Money.svelte";
  import SoldPerDay from "../SoldPerDay.svelte";
  import { pctText } from "./shared";

  let { houseItems, changes, houseName, salesHours }: { houseItems: Record<string, ItemPrice>; changes: Record<string, number> | undefined; houseName: string; salesHours: number | undefined } = $props();

  const SHOW = 8;
  const SECTIONS: [keyof typeof BASKETS, string][] = [["ORE", "Ore & bars"], ["CLOTH", "Cloth"], ["LEATHER", "Leather"], ["HERB", "Herbs"], ["ENCH", "Enchanting"], ["ELEM", "Elemental"], ["GEM", "Gems"]];
  let open = $state<Record<string, boolean>>({});

  const boards = $derived(SECTIONS.map(([k, title]) => ({
    k, title,
    // biggest market (gold listed) first
    rows: (BASKETS[k] as number[]).filter((id) => houseItems[id]).map((id) => ({ id, a: houseItems[id], chg: changes?.[id] ?? null }))
      .sort((x, y) => y.a[1] * y.a[2] - x.a[1] * x.a[2]),
  })).filter((b) => b.rows.length));
</script>

<section class="panel" aria-labelledby="ec-board-title">
  <div class="section-head"><h2 id="ec-board-title">Trade board</h2><p class="faint" style="margin:0">Materials on the {houseName} auction house, biggest markets first</p></div>
  {#if !boards.length}<p class="faint">No materials listed on this auction house right now.</p>
  {:else}
    <div class="ec-boards">
      {#each boards as b (b.k)}
        <div class="ec-board">
          <h3 class="mini-head">{b.title}</h3>
          <table class="ec-board-table" id="ec-board-{b.k}">
            <caption class="sr-only">{b.title}: lowest price, typical price, change since about a day ago and units sold per day</caption>
            <thead><tr><th scope="col">Item</th><th scope="col" title="The cheapest single listing">Lowest</th><th scope="col" title="Average of the cheapest 10% of units: what you would really pay">Typical</th><th scope="col" title="Change in the typical price since about a day ago"><span aria-hidden="true" class="ec-24h">24h</span><span class="sr-only">Change since about a day ago</span></th><th scope="col" title="Roughly how many sell per day">Sold</th></tr></thead>
            <tbody>
              {#each open[b.k] ? b.rows : b.rows.slice(0, SHOW) as r (r.id)}
                <tr>
                  <th scope="row"><ItemLink id={r.id} name={itemName(r.id)} /></th>
                  <td class="ec-dim" title="Lowest price"><Money c={r.a[0]} short /></td>
                  <td title="Typical price"><Money c={r.a[1]} short /></td>
                  <td>{#if r.chg != null}<span class="pct {r.chg >= 0 ? 'up' : 'down'}">{r.chg >= 0 ? "▲" : "▼"} {pctText(r.chg)}</span>{:else}<span class="faint">-</span>{/if}</td>
                  <td class="ec-dim ec-sold"><SoldPerDay a={r.a} hours={salesHours} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if b.rows.length > SHOW}
            <button type="button" class="ec-more" aria-expanded={!!open[b.k]} aria-controls="ec-board-{b.k}" onclick={() => (open = { ...open, [b.k]: !open[b.k] })}>
              {open[b.k] ? "Show fewer" : "Show all " + b.rows.length}<span class="sr-only"> {b.title.toLowerCase()}</span></button>
          {/if}
        </div>
      {/each}
    </div>
    <p class="faint" style="margin-top:10px"><b>Lowest</b> is the cheapest single listing. <b>Typical</b> is the average of the cheapest 10% of units, what you would really pay for a few. <b>24h</b> is the change in the typical price since about a day ago, and <b>Sold</b> roughly how many sell each day.</p>
  {/if}
</section>
