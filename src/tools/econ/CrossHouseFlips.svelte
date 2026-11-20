<script lang="ts">
  // Cross-house flips: cheap on the neutral auction house, worth more on your own faction's house.
  import { crossHouseFlips } from "../../lib/econmath.js";
  import { itemName } from "../itemIcons.svelte";
  import type { GroupPrices } from "../types";
  import ItemLink from "../ItemLink.svelte";
  import Money from "../Money.svelte";
  import SoldPerDay from "../SoldPerDay.svelte";
  import { houseOf } from "../types";
  import { FACTION_NAME } from "./shared";

  let { group, faction }: { group: GroupPrices; faction: string } = $props();
  let shown = $state(10);
  const list = $derived(faction === "neutral" ? [] : crossHouseFlips(group, faction));
  const home = $derived(houseOf(group, faction)?.house);
</script>

<section class="panel" aria-labelledby="ec-xh-title">
  <div class="section-head"><h2 id="ec-xh-title">Cross-house flips</h2></div>
  {#if faction === "neutral"}
    <p class="faint">Pick your faction's auction house above to see what you can buy cheaply on Blackwater and resell at home.</p>
  {:else}
    <p class="faint ec-lead">Bought on the neutral Blackwater auction house, an item comes to your mailbox and you can list it on the {FACTION_NAME[faction]} auction house. These are worth at least 10% (and 50c) more there, after the 5% cut. Your house needs 5 or more listings of the item, so people really trade it.</p>
    {#if !list.length}<p class="faint">No flips worth doing right now.</p>
    {:else}
      <div class="table-wrap"><table class="prices">
        <caption class="sr-only">Items cheaper on Blackwater than on the {FACTION_NAME[faction]} auction house</caption>
        <thead><tr><th scope="col">Item</th><th scope="col">Buy on Blackwater</th><th scope="col">Sell at home (after cut)</th><th scope="col">Profit each</th><th scope="col">Sells per day at home</th><th scope="col" class="col-hide-sm">On Blackwater</th></tr></thead>
        <tbody>
          {#each list.slice(0, shown) as f (f.id)}
            <tr><th scope="row"><ItemLink id={f.id} name={itemName(f.id)} copy /></th><td><Money c={f.buy} /></td><td><Money c={f.sell} /></td>
              <td><Money c={f.profit} /> <span class="pct up">+{f.pct}%</span></td><td><SoldPerDay a={home?.items[f.id]} hours={home?.salesHours} /></td><td class="col-hide-sm">{f.neutralQty.toLocaleString()} {f.neutralQty === 1 ? "unit" : "units"}</td></tr>
          {/each}
        </tbody>
      </table></div>
      <p class="faint" style="margin-top:8px">The buy price is the cheapest Blackwater listing; there may be only one at that price. Deposits aren't counted, and a good price doesn't mean it sells. Check in game first.</p>
      {#if list.length > shown}<p style="text-align:center"><button type="button" class="btn btn-ghost btn-sm" onclick={() => (shown += 15)}>Show more</button></p>{/if}
    {/if}
  {/if}
</section>
