<script lang="ts">
  // The Economy page: the state of one ruleset's auction houses at a glance. Headline numbers,
  // the three houses, the materials ledger, gold by category, movers, cross-house flips,
  // faction price gaps, top-dollar items and the most-listed items. Everything is worked out here from the
  // price files the other tools use, except the ledger's 24-hour changes (econ_<region>.json).
  import Freshness from "./Freshness.svelte";
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
  import MaterialsLedger from "./econ/MaterialsLedger.svelte";
  import Treemap from "./econ/Treemap.svelte";
  import CrossHouseFlips from "./econ/CrossHouseFlips.svelte";
  import FactionGaps from "./econ/FactionGaps.svelte";
  import TopDollar from "./econ/TopDollar.svelte";
  import MostListed from "./econ/MostListed.svelte";
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

  // The sections below the house cards, one tab each, so nothing is more than a click away.
  // The open tab is in the address (/economy#flips: links open it) and remembered for the next visit.
  const TABS = [
    ["materials", "Materials ledger", "crafting"],
    ["movers", "Price changes & deals", "economy"],
    ["flips", "Cross-house flips", "neutral"],
    ["gaps", "Faction price gaps", "pvp"],
    ["gold", "Gold by category", "prices"],
    ["priciest", "Top-dollar items", "items"],
    ["busiest", "Most-listed items", "flips"],
  ] as const;
  type TabId = (typeof TABS)[number][0];
  const TAB_KEY = "codex-econ-tab";
  // old tab names, so saved tabs and old links still open the right section
  const OLD_TABS: Record<string, TabId> = { board: "materials", jewels: "priciest", bazaar: "busiest" };
  const isTab = (t: string | null | undefined): t is TabId => !!t && TABS.some(([id]) => id === t);
  const tabFrom = (t: string | null | undefined): TabId | null => (t && OLD_TABS[t]) || (isTab(t) ? t : null);
  let tab = $state<TabId>("materials");
  let tabBar: HTMLElement | undefined = $state();

  function selectTab(t: TabId, focus = false) {
    tab = t;
    history.replaceState(history.state, "", "#" + t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* storage blocked: not remembered */ }
    if (focus) document.getElementById("ec-tab-" + t)?.focus();
    // when the bar is stuck under the header, bring the new section's top into view
    if (tabBar && tabBar.getBoundingClientRect().top <= parseFloat(getComputedStyle(tabBar).top) + 1) {
      tick().then(() => tabBar?.parentElement?.scrollIntoView({ block: "start" }));
    }
  }

  // arrow keys, Home and End move between tabs (the usual tab-list keys)
  function tabKeys(e: KeyboardEvent) {
    const i = TABS.findIndex(([id]) => id === tab);
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    selectTab(TABS[(to + TABS.length) % TABS.length][0], true);
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "horde";
    const fromHash = tabFrom(location.hash.slice(1));
    let saved: string | null = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch { /* storage blocked */ }
    const fromSaved = tabFrom(saved);
    if (fromHash) { tab = fromHash; if (fromHash !== location.hash.slice(1)) history.replaceState(history.state, "", "#" + fromHash); }
    else if (fromSaved) tab = fromSaved;
    loadRegion();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    // a link to another section of this page (/economy#flips) only changes the address: follow it
    const onHash = () => { const h = tabFrom(location.hash.slice(1)); if (h && h !== tab) selectTab(h); };
    window.addEventListener("hashchange", onHash);
    return () => { clearInterval(timer); window.removeEventListener("hashchange", onHash); };
  });

  $effect(() => { faction; treeScope; tab; if (groupData) tick().then(setupWowhead); });

  // on narrow screens the tab strip scrolls sideways: keep the open tab in sight (without moving the page)
  $effect(() => {
    const strip = tabBar?.querySelector<HTMLElement>(".ec-tabs");
    const btn = strip?.querySelector<HTMLElement>("#ec-tab-" + tab);
    if (!strip || !btn) return;
    const left = btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  });
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
    <p class="faint ec-scope">The numbers cover all three auction houses of the {ruleset || "chosen"} ruleset. The materials ledger, flips, gold map and most-listed items follow the auction house you pick. "Sold per day" is an estimate: we compare the auctions every hour and count the ones bought (a seller cancelling looks the same to us), averaged over the last 7 days.</p>
  </div>

  <Freshness {region} updated={groupData?.updated} />
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

    <div class="ec-tabs-area">
    <div class="ec-tabbar" bind:this={tabBar}>
      <div class="ec-tabs" role="tablist" aria-label="Market sections" tabindex="-1" onkeydown={tabKeys}>
        {#each TABS as [id, label, icon] (id)}
          <button type="button" role="tab" id="ec-tab-{id}" aria-selected={tab === id} aria-controls="ec-panel" tabindex={tab === id ? 0 : -1}
            class:active={tab === id} onclick={() => selectTab(id)}><Icon name={icon} size={20} />{label}</button>
        {/each}
      </div>
    </div>

    <div id="ec-panel" class="ec-panel" role="tabpanel" aria-labelledby="ec-tab-{tab}">
    {#if tab === "materials" && current}
      <MaterialsLedger houseItems={current.house.items} changes={series?.board?.[current.id]} {houseName} salesHours={current.house.salesHours} />
    {:else if tab === "gold" && current}
      <section class="panel" aria-labelledby="ec-gold-title">
        <div class="section-head">
          <h2 id="ec-gold-title">Gold by category</h2>
          <div class="seg-buttons" role="group" aria-label="Show">
            <button type="button" class:active={treeScope === "house"} aria-pressed={treeScope === "house"} onclick={() => (treeScope = "house")}>{houseName}</button>
            <button type="button" class:active={treeScope === "group"} aria-pressed={treeScope === "group"} onclick={() => (treeScope = "group")}>Whole ruleset</button>
          </div>
        </div>
        <p class="faint ec-lead">Gold listed per kind of item, at typical prices. Bigger box, more gold.</p>
        <Treemap values={treeValues} scopeLabel={treeScope === "house" ? houseName + " auction house" : "whole ruleset"} />
      </section>
    {:else if tab === "movers"}
      <Movers {region} {group} houseId={current?.id ?? null} house={current?.house} />
    {:else if tab === "flips"}
      <CrossHouseFlips group={groupData} {faction} />
    {:else if tab === "gaps"}
      <FactionGaps group={groupData} />
    {:else if tab === "priciest"}
      <TopDollar group={groupData} />
    {:else if tab === "busiest" && current}
      <MostListed house={current.house} {houseName} />
    {:else}
      <div class="panel"><p class="faint">Nothing to show for this auction house right now.</p></div>
    {/if}
    </div>
    </div>
  {/if}

  {@render children?.()}
</div>
