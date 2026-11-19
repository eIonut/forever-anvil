<script lang="ts">
  // The trade board: crafting materials on one auction house, with lowest and typical price
  // and the change since about a day ago. Each group shows its biggest markets first.
  import { BASKETS } from "../../lib/econmath.js";
  import { itemName } from "../itemIcons.svelte";
  import type { ItemPrice } from "../types";
  import ItemLink from "../ItemLink.svelte";
  import Money from "../Money.svelte";
  import { pctText } from "./shared";

  let { houseItems, changes, houseName }: { houseItems: Record<string, ItemPrice>; changes: Record<string, number> | undefined; houseName: string } = $props();

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
            <caption class="sr-only">{b.title}: lowest price, typical price and change since about a day ago</caption>
            <thead class="sr-only"><tr><th scope="col">Item</th><th scope="col">Lowest</th><th scope="col">Typical</th><th scope="col">Change</th></tr></thead>
            <tbody>
              {#each open[b.k] ? b.rows : b.rows.slice(0, SHOW) as r (r.id)}
                <tr>
                  <th scope="row"><ItemLink id={r.id} name={itemName(r.id)} /></th>
                  <td class="ec-dim" title="Lowest price"><Money c={r.a[0]} /></td>
                  <td title="Typical price"><Money c={r.a[1]} /></td>
                  <td>{#if r.chg != null}<span class="pct {r.chg >= 0 ? 'up' : 'down'}">{r.chg >= 0 ? "▲" : "▼"} {pctText(r.chg)}</span>{:else}<span class="faint">—</span>{/if}</td>
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
    <p class="faint" style="margin-top:10px">Each row: lowest price, typical price (the cheapest 10% of units), and ▲▼ change in the typical price since about a day ago.</p>
  {/if}
</section>
