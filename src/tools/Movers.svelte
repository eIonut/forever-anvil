<script lang="ts">
  // Rising / falling / deals for one auction house (computed once a day by the price job).
  import { tick } from "svelte";
  import { getJSON, priceUrl } from "../lib/api";
  import { setupWowhead } from "../lib/wowhead";
  import { itemName } from "./itemIcons.svelte";
  import ItemLink from "./ItemLink.svelte";
  import Money from "./Money.svelte";

  let { region, group, houseId }: { region: string; group: string; houseId: string | null } = $props();

  type Tab = "rising" | "falling" | "deals";
  interface HouseMovers { days: number; rising?: number[][]; falling?: number[][]; deals?: number[][] }
  const TABS: [Tab, string][] = [["rising", "Rising"], ["falling", "Falling"], ["deals", "Deals"]];

  let tab = $state<Tab>("rising");
  let data = $state.raw<{ houses?: Record<string, HouseMovers> } | null | undefined>(undefined);
  const cache: Record<string, { houses?: Record<string, HouseMovers> } | null> = {};

  // load the group's file once, then reuse it when switching auction house or tab
  $effect(() => {
    const key = region + ":" + group;
    if (!group) return;
    if (key in cache) { data = cache[key]; return; }
    getJSON(priceUrl("movers", region, group)).then((mv) => { cache[key] = mv; data = mv; });
  });

  const house = $derived(data && houseId ? data.houses?.[houseId] : undefined);
  const list = $derived((house?.[tab] || []).slice(0, 15));

  $effect(() => { if (list.length) tick().then(setupWowhead); });
</script>

<section class="panel pr-movers" aria-labelledby="mv-title">
  <div class="section-head">
    <h2 id="mv-title">Price changes &amp; deals</h2>
    <div class="seg-buttons" role="group" aria-label="Show">
      {#each TABS as [t, name]}<button type="button" class:active={tab === t} aria-pressed={tab === t} onclick={() => (tab = t)}>{name}</button>{/each}
    </div>
  </div>
  <div>
    {#if data === undefined || !houseId}<p class="faint">Loading…</p>
    {:else if !house}<p class="faint">Price changes will appear after the first daily update.</p>
    {:else if house.days < 2}<p class="faint">We have {house.days} day of price history so far. Rising and falling prices appear from the second day, and deals once there are a few days to compare against.</p>
    {:else if !list.length}<p class="faint">Nothing notable here right now.</p>
    {:else}
      <div class="table-wrap"><table class="prices"><caption class="sr-only">{tab} items</caption>
        <thead>
          {#if tab === "deals"}<tr><th scope="col">Item</th><th scope="col">Cheapest now</th><th scope="col">Usual price</th><th scope="col">Saving</th><th scope="col">Listed</th></tr>
          {:else}<tr><th scope="col">Item</th><th scope="col">Change</th><th scope="col">Market now</th><th scope="col">Before</th></tr>{/if}
        </thead>
        <tbody>
          {#each list as x (x[0])}
            {#if tab === "deals"}
              <tr><th scope="row"><ItemLink id={x[0]} name={itemName(x[0])} /></th><td><Money c={x[1]} /></td><td><Money c={x[2]} /></td><td><span class="pct up">{Math.round((1 - x[1] / x[2]) * 100)}% off</span></td><td>{x[3].toLocaleString()}</td></tr>
            {:else}
              <tr><th scope="row"><ItemLink id={x[0]} name={itemName(x[0])} /></th><td><span class="pct {x[1] > 0 ? 'up' : 'down'}">{x[1] > 0 ? "▲ +" : "▼ "}{x[1]}%</span></td><td><Money c={x[2]} /></td><td><Money c={x[3]} /></td></tr>
            {/if}
          {/each}
        </tbody>
      </table></div>
      <p class="faint" style="margin-top:8px">{tab === "deals" ? "Cheapest listing at 60% or less of the item's usual price over recent days. Deals sell fast — check in-game." : "Market price now compared with about 7 days ago (or the oldest day we have). Items with very few units are left out."} Updated once a day.</p>
    {/if}
  </div>
</section>
