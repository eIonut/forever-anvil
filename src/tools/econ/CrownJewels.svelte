<script lang="ts">
  // The most expensive items listed in the ruleset: a podium for the top three and a list of the next eight.
  import { crownJewels } from "../../lib/econmath.js";
  import { itemUrl } from "../../lib/urls";
  import { itemSource, itemName } from "../itemIcons.svelte";
  import { iconUrl } from "../../lib/pricemath.js";
  import type { GroupPrices } from "../types";
  import ItemLink from "../ItemLink.svelte";
  import Money from "../Money.svelte";
  import { FACTION_NAME } from "./shared";

  let { group }: { group: GroupPrices } = $props();
  const list = $derived(crownJewels(group, 11));
  const podium = $derived([list[1], list[0], list[2]].filter(Boolean)); // 2nd, 1st, 3rd
  const quality = (id: number) => itemSource.items[id]?.[4] || "common";
  const big = (id: number) => iconUrl(itemSource.items[id]?.[6], itemSource.region, 56);
</script>

<section class="panel" aria-labelledby="ec-jewel-title">
  <div class="section-head"><h2 id="ec-jewel-title">Crown jewels</h2><p class="faint" style="margin:0">The most expensive items for sale in this ruleset</p></div>
  {#if !list.length}<p class="faint">Nothing listed yet.</p>
  {:else}
    <ol class="ec-podium">
      {#each podium as j (j.id)}
        {@const rank = list.indexOf(j) + 1}
        {@const name = itemName(j.id)}
        <li class="ec-step ec-step-{rank}">
          <span class="ec-rank" aria-label="Number {rank}">{rank}</span>
          {#if big(j.id)}<img class="ec-jewel-icon qb-{quality(j.id)}" src={big(j.id)} alt="" width="48" height="48" loading="lazy" />{/if}
          <a class="ec-jewel-name q-{quality(j.id)}" href={name ? itemUrl(j.id, name) : "https://www.wowhead.com/forever/item=" + j.id}>{name || "Item #" + j.id}</a>
          <b class="ec-jewel-price"><Money c={j.price} /></b>
          <span class="faint">{j.qty} on sale · {FACTION_NAME[j.faction] || j.faction}</span>
        </li>
      {/each}
    </ol>
    {#if list.length > 3}
      <ol class="ec-jewels" start="4">
        {#each list.slice(3) as j (j.id)}
          <li><ItemLink id={j.id} name={itemName(j.id)} class={"q-" + quality(j.id)} /> <Money c={j.price} /> <span class="faint">· {FACTION_NAME[j.faction] || j.faction}</span></li>
        {/each}
      </ol>
    {/if}
    <p class="faint" style="margin-top:8px">Listing prices, not sales. Anything listed above 10,000g each is left out as a joke listing.</p>
  {/if}
</section>
