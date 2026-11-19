<script lang="ts">
  // Vendor flips: items listed on the AH for less than a vendor pays (computed hourly by the price job).
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { getJSON, groupLabel, localTime, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";

  let { children }: { children?: Snippet } = $props();

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), empty = $state(false);

  const flips = $derived(houseOf(groupData, faction)?.house.flips || []);
  const total = $derived(flips.reduce((s, f) => s + f[2], 0));
  const save = () => saveMarketPrefs({ region, group, faction });

  async function load() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
    if (!meta?.groups?.length) { empty = true; return; }
    empty = false;
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta.rulesets, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
    await loadGroup();
  }
  async function loadGroup() {
    groupData = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    loading = false;
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    load();
  });

  // after each redraw: tell screen readers, and let Wowhead find the new links
  $effect(() => {
    if (loading) return;
    announce(flips.length + " vendor flips");
    setupWowhead();
  });
</script>

<div class="wrap section" hidden={!empty}><div class="panel"><h2>No data yet</h2><p>Run <code>npm run prices</code>, then reload this page.</p></div></div>

<div class="wrap section" hidden={empty}>
  <div class="panel pr-controls fl-controls">
    <MarketSelects prefix="fl" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); load(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
  </div>
  <p class="fl-summary" aria-live="polite">
    {#if loading}Loading…{:else if flips.length}<b>{flips.length}</b> item{flips.length > 1 ? "s" : ""} listed below vendor price right now — about <Money c={total} /> profit if you bought them all. <span class="faint">Snapshot from {localTime(groupData!.updated)}.</span>{:else}No vendor flips on this auction house right now. Check back after the next hourly update.{/if}
  </p>
  <div class="table-wrap">
    <table class="prices">
      <caption class="sr-only">Items listed below vendor price</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Cheapest on AH</th><th scope="col">Vendor pays</th><th scope="col">Profit each</th><th scope="col">Units below vendor price</th><th scope="col">Total profit</th></tr></thead>
      <tbody>
        {#if !loading}
          {#each flips as f (f[0])}
            <tr><th scope="row"><ItemLink id={f[0]} name={itemSource.items[f[0]]?.[0]} /></th><td><Money c={f[3]} /></td><td><Money c={f[4]} /></td><td><span class="pct up">+<Money c={f[4] - f[3]} /></span></td><td>{f[1].toLocaleString()}</td><td><b><Money c={f[2]} /></b></td></tr>
          {:else}
            <tr><td colspan="6" class="empty">Nothing to flip here right now.</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  {@render children?.()}
</div>
