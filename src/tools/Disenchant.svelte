<script lang="ts">
  // Disenchant flips: gear listed on the AH for less than its enchanting materials sell for
  // (src/lib/demath.js). Worked out here from the hourly prices and the item list.
  import Freshness from "./Freshness.svelte";
  import type { Snippet } from "svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { onMount } from "svelte";
  import { getCachedJSON, getJSON, groupLabel, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { disenchantFlips } from "../lib/demath.js";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";

  let { children }: { children?: Snippet } = $props();

  const SHOW = 150;
  const SKILLS = [{ v: 0, l: "Any skill" }, { v: 75, l: "Up to 75" }, { v: 150, l: "Up to 150" }, { v: 225, l: "Up to 225" }];

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), empty = $state(false);
  let maxSkill = $state(0);

  const all = $derived(groupData ? disenchantFlips(houseOf(groupData, faction)?.house.items || {}, itemSource.items) : []);
  // epics have no known skill (null): they stay in the list unless a skill limit is picked
  const flips = $derived(maxSkill ? all.filter((f) => f.skill != null && f.skill <= maxSkill) : all);
  const total = $derived(flips.reduce((s, f) => s + f.profit, 0));
  const save = () => saveMarketPrefs({ region, group, faction });
  const pct = (c: number) => Math.round(c * 1000) / 10 + "%";
  const qty = (d: { min: number; max: number }) => (d.min === d.max ? String(d.min) : d.min + "–" + d.max);
  const name = (id: number) => itemSource.items[id]?.[0] || "Item " + id;

  async function load() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
    if (!meta?.groups?.length) { empty = true; return; }
    empty = false;
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta, g) }));
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

  $effect(() => {
    if (loading) return;
    announce(flips.length + " disenchant flips");
    setupWowhead();
  });
</script>

<div class="wrap section" hidden={!empty}><div class="panel"><h2>No data yet</h2><p>Run <code>npm run prices</code>, then reload this page.</p></div></div>

<div class="wrap section" hidden={empty}>
  <div class="panel controls">
    <MarketSelects prefix="de" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); load(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <div class="control-row de-row">
      <div><label class="field-label" for="de-skill">Your Enchanting skill</label>
        <select class="input" id="de-skill" bind:value={maxSkill}>
          {#each SKILLS as s (s.v)}<option value={s.v}>{s.l}</option>{/each}
        </select></div>
    </div>
  </div>
  <Freshness {region} updated={groupData?.updated} />
  <p class="fl-summary" aria-live="polite">
    {#if loading}<Loading text="Working out disenchant values…" />{:else if flips.length}<b>{flips.length}</b> item{flips.length > 1 ? "s" : ""} cost less than their materials sell for, about <Money c={total} /> expected profit if you bought one of each.{:else}No disenchant flips on this auction house right now. Check back after the next hourly update.{/if}
  </p>
  <div class="table-wrap">
    <table class="prices pr-table de-table">
      <caption class="sr-only">Gear listed below its expected disenchant value</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Disenchants into</th><th scope="col" class="num">Cheapest on AH</th><th scope="col" class="num">Materials worth</th><th scope="col" class="num">Expected profit</th></tr></thead>
      <tbody>
        {#if loading}<SkeletonRows rows={6} cols={5} />{:else}
          {#each flips.slice(0, SHOW) as f (f.id)}
            <tr>
              <th scope="row"><ItemLink id={f.id} name={name(f.id)} copy watch /><span class="faint de-meta">item level {itemSource.items[f.id]?.[11] ?? "?"}{#if f.skill}{" · skill " + f.skill}{/if}</span></th>
              <td class="de-drops" data-label="Disenchants into">{#each f.drops as d (d.id)}<span class="de-drop">{pct(d.chance)} · {qty(d)}× <ItemLink id={d.id} name={name(d.id)} /></span>{/each}</td>
              <td class="num" data-label="Cheapest"><Money c={f.cost} /></td>
              <td class="num" data-label="Materials worth"><Money c={f.value} /></td>
              <td class="num" data-label="Profit"><b class="pct up">+<Money c={f.profit} /></b></td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty">Nothing to disenchant for profit here right now.</td></tr>
          {/each}
          {#if flips.length > SHOW}<tr><td colspan="5" class="empty">And {flips.length - SHOW} more with smaller profits.</td></tr>{/if}
        {/if}
      </tbody>
    </table>
  </div>
  {@render children?.()}
</div>

<style>
  .de-row { margin-top: 12px; }
  /* the site's tables don't wrap; this one does (long material lists), so it fits without sideways scrolling */
  .de-table th, .de-table td { white-space: normal; padding-left: 10px; padding-right: 10px; }
  .de-table thead th { vertical-align: bottom; }
  /* phones: each item is a card (the Prices table's .pr-table layout); the material list takes a full line */
  @media (max-width: 980px) { .de-table td.de-drops { grid-column: 1 / -1; } }
  .de-drops { line-height: 1.5; }
  .de-drop { display: block; font-size: 0.92em; }
  .de-meta { display: block; font-size: 0.85em; }
</style>
