<script lang="ts">
  // Most-listed items: what's listed most on one auction house, by number of auctions or by units.
  import { mostListed } from "../../lib/econmath.js";
  import { itemUrl } from "../../lib/urls";
  import { iconUrl } from "../../lib/pricemath.js";
  import { tooltipAttrs } from "../../lib/wowhead";
  import { itemSource, itemName } from "../itemIcons.svelte";
  import type { House } from "../types";
  import Money from "../Money.svelte";
  import SoldPerDay from "../SoldPerDay.svelte";
  import { compact } from "./shared";

  let { house, houseName }: { house: House; houseName: string } = $props();
  let mode = $state<"listings" | "units">("listings");
  const list = $derived(mostListed(house, mode, 24));
</script>

<section class="panel" aria-labelledby="ec-ml-title">
  <div class="section-head">
    <h2 id="ec-ml-title">Most-listed items</h2>
    <div class="seg-buttons" role="group" aria-label="Rank by">
      <button type="button" class:active={mode === "listings"} aria-pressed={mode === "listings"} onclick={() => (mode = "listings")}>Most auctions</button>
      <button type="button" class:active={mode === "units"} aria-pressed={mode === "units"} onclick={() => (mode = "units")}>Biggest piles</button>
    </div>
  </div>
  <p class="faint ec-lead">{mode === "listings" ? "Items with the most separate auctions" : "Items with the most units for sale, counting stacks"} on the {houseName} auction house.</p>
  <ol class="ec-mostlisted">
    {#each list as b (b.id)}
      {@const info = itemSource.items[b.id] || []}
      {@const name = itemName(b.id)}
      {@const icon = iconUrl(info[6], itemSource.region, 56)}
      <li>
        <a href={name ? itemUrl(b.id, name) : "https://www.wowhead.com/forever/item=" + b.id} {...(name ? tooltipAttrs(b.id) : {})}>
          <span class="ec-ml-icon qb-{info[4] || 'common'}">{#if icon}<img src={icon} alt="" width="44" height="44" loading="lazy" />{/if}<b>{compact(b.count)}<span class="sr-only"> {mode === "listings" ? "auctions" : "units"}</span></b></span>
          <span class="ec-ml-name">{name || "Item #" + b.id}</span>
        </a>
        <span class="ec-ml-price"><Money c={b.market} /> <span class="ec-ml-sold"><SoldPerDay a={house.items[b.id]} hours={house.salesHours} suffix=" sold/day" /></span></span>
      </li>
    {/each}
  </ol>
</section>
