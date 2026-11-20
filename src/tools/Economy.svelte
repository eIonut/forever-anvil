<script lang="ts">
  // The Economy page: the state of one ruleset's auction houses at a glance. Headline numbers,
  // the three houses, the trade board, where the gold is, movers, Blackwater flips,
  // Alliance vs Horde gaps, crown jewels and the bazaar. Everything is worked out here from the
  // price files the other tools use, except the trade board's 24-hour changes (econ_<region>.json).
  import type { Snippet } from "svelte";
  import Loading from "./Loading.svelte";
  import { onMount, tick } from "svelte";
  import { getCachedJSON, getJSON, groupLabel, localTime, noDataMessage, priceUrl } from "../lib/api";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { houseSummary, goldByClass } from "../lib/econmath.js";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type Econ, type GroupPrices, type Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Icon from "./Icon.svelte";
  import Movers from "./Movers.svelte";
  import TradeBoard from "./econ/TradeBoard.svelte";
  import Treemap from "./econ/Treemap.svelte";
  import BlackwaterFlips from "./econ/BlackwaterFlips.svelte";
  import FactionGaps from "./econ/FactionGaps.svelte";
  import CrownJewels from "./econ/CrownJewels.svelte";
  import Bazaar from "./econ/Bazaar.svelte";
  import { FACTION_NAME, compact, goldText } from "./econ/shared";
  import { salesBasis } from "./SoldPerDay.svelte";

  let { children }: { children?: Snippet } = $props();

  let region = $state("eu"), group = $state(""), faction = $state("horde");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let econ = $state.raw<Econ | null>(null);
  let loading = $state(true), loadFailed = $state(false), emptyMsg = $state("");
  let treeScope = $state<"house" | "group">("house");
  let now = $state(Date.now());

  const save = () => saveMarketPrefs({ region, group, faction });

  const current = $derived(houseOf(groupData, faction));
  const ruleset = $derived(groups.find((g) => g.value === group)?.label || "");
  const houseName = $derived(FACTION_NAME[faction] || faction);

  // per house, in a fixed order: Alliance, Horde, Blackwater
  const houses = $derived.by(() => {
    if (!groupData) return [];
    const order = ["alliance", "horde", "neutral"];
    return Object.entries(groupData.houses)
      .map(([id, h]) => ({ id, faction: h.faction, ...houseSummary(h) }))
      .sort((a, b) => order.indexOf(a.faction) - order.indexOf(b.faction));
  });
  const totals = $derived.by(() => {
    const t = { listings: 0, units: 0, gold: 0, items: 0 };
    if (!groupData) return t;
    const ids = new Set<string>();
    for (const h of houses) { t.listings += h.listings; t.units += h.units; t.gold += h.gold; }
    for (const h of Object.values(groupData.houses)) for (const id of Object.keys(h.items)) ids.add(id);
    t.items = ids.size;
    return t;
  });

  const series = $derived(econ?.groups?.[group] || null);
  const treeValues = $derived.by(() => {
    if (!groupData) return [];
    const hs = treeScope === "house" && current ? [current.house] : Object.values(groupData.houses);
    return goldByClass(hs, itemSource.items) as [string, number][];
  });

  const nextUpdate = $derived.by(() => {
    if (!groupData) return { big: "-", small: "" };
    const at = new Date(groupData.updated).getTime() + 3600_000;
    const mins = Math.round((at - now) / 60000);
    const big = mins > 1 ? "in " + mins + " min" : mins > -15 ? "Any minute" : "Overdue";
    return { big, small: "Prices from " + localTime(groupData.updated) + ", refreshed about every hour" };
  });

  async function loadRegion() {
    loading = true;
    const [meta, items, ec] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)),
      getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region)),
      getJSON<Econ>(priceUrl("econ", region)),
    ]);
    useItems(region, items);
    econ = ec;
    if (!meta?.groups?.length) {
      emptyMsg = noDataMessage("Live prices are temporarily unavailable. Please try again later.",
        "No price data on this computer yet. Run `npm run prices` in the project folder, then reload this page.");
      loading = false;
      return;
    }
    emptyMsg = "";
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta.rulesets, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
    await loadGroup();
  }

  async function loadGroup() {
    loading = true;
    const g = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    groupData = g;
    loadFailed = !g;
    loading = false;
    if (g?.ruleset) groups = groups.map((o) => (o.value === g.group ? { ...o, label: g.ruleset! } : o));
    await tick();
    setupWowhead();
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "horde";
    loadRegion();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  $effect(() => { faction; treeScope; if (groupData) tick().then(setupWowhead); });
</script>

<div class="wrap section" hidden={!emptyMsg}>
  <div class="panel"><h2>No prices yet</h2><p>{emptyMsg}</p></div>
</div>

<div class="wrap section ec" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="ec" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <p class="faint ec-scope">The numbers cover all three auction houses of the {ruleset || "chosen"} ruleset. The trade board, flips, gold map and bazaar follow the auction house you pick. "Sold per day" is an estimate: we compare the auctions every hour and count the ones bought (a seller cancelling looks the same to us), averaged over the last 7 days.</p>
  </div>

  {#if loading && !groupData}
    <Loading text="Loading the market…" block />
  {:else if loadFailed}
    <div class="panel"><p>Couldn't load this ruleset's prices. Please try again in a moment.</p></div>
  {:else if groupData}
    <div class="ec-tiles">
      <div class="stat stat-icon"><Icon name="prices" size={30} /><div><span>Auctions up</span><b>{totals.listings.toLocaleString()}</b><span>{totals.units.toLocaleString()} items, counting stacks</span></div></div>
      <div class="stat stat-icon"><Icon name="economy" size={30} /><div><span>Gold listed</span><b>{compact(totals.gold / 10000)}</b><span>at typical prices; joke listings left out</span></div></div>
      <div class="stat stat-icon"><Icon name="items" size={30} /><div><span>Different items</span><b>{totals.items.toLocaleString()}</b><span>for sale in this ruleset</span></div></div>
      <div class="stat stat-icon"><Icon name="clock" size={30} /><div><span>Next update</span><b>{nextUpdate.big}</b><span>{nextUpdate.small}</span></div></div>
    </div>

    <section class="ec-houses" aria-label="The three auction houses">
      {#each houses as h (h.id)}
        {@const share = totals.listings ? h.listings / totals.listings : 0}
        <button type="button" class="panel ec-house ec-house-{h.faction}" class:mine={h.faction === faction} aria-pressed={h.faction === faction}
          onclick={() => { faction = h.faction; save(); }}>
          <span class="ec-house-name"><Icon name={h.faction as "alliance" | "horde" | "neutral"} size={26} />{FACTION_NAME[h.faction] || h.faction}{#if h.faction === faction}<span class="ec-mine-tag">Your house</span>{/if}</span>
          <b>{h.listings.toLocaleString()}</b>
          <span class="ec-house-sub">auctions · {Math.round(share * 100)}% of the ruleset</span>
          <span class="ec-share" aria-hidden="true"><i style:width="{share * 100}%"></i></span>
          <span class="ec-house-sub">{goldText(h.gold)} · {h.items.toLocaleString()} items</span>
          <span class="ec-house-sub" title={h.salesHours ? "Estimated " + salesBasis(h.salesHours) : "Sales are still being counted"}>{#if h.salesHours}About {compact(h.sold)} sold a day · {goldText(h.soldGold)} traded{:else}Sales per day: still counting{/if}</span>
        </button>
      {/each}
    </section>

    {#if current}
      <TradeBoard houseItems={current.house.items} changes={series?.board?.[current.id]} {houseName} salesHours={current.house.salesHours} />

      <section class="panel" aria-labelledby="ec-gold-title">
        <div class="section-head">
          <h2 id="ec-gold-title">Where the gold is</h2>
          <div class="seg-buttons" role="group" aria-label="Show">
            <button type="button" class:active={treeScope === "house"} aria-pressed={treeScope === "house"} onclick={() => (treeScope = "house")}>{houseName}</button>
            <button type="button" class:active={treeScope === "group"} aria-pressed={treeScope === "group"} onclick={() => (treeScope = "group")}>Whole ruleset</button>
          </div>
        </div>
        <p class="faint ec-lead">Gold listed per kind of item, at typical prices. Bigger box, more gold.</p>
        <Treemap values={treeValues} scopeLabel={treeScope === "house" ? houseName + " auction house" : "whole ruleset"} />
      </section>
    {/if}

    <Movers {region} {group} houseId={current?.id ?? null} house={current?.house} />

    <BlackwaterFlips group={groupData} {faction} />
    <FactionGaps group={groupData} />
    <CrownJewels group={groupData} />
    {#if current}<Bazaar house={current.house} {houseName} />{/if}
  {/if}

  {@render children?.()}
</div>
