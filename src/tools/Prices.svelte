<script lang="ts">
  // Auction House prices: every item on one auction house, with search, sorting,
  // price changes & deals, and a details panel with the 30-day chart.
  // /prices?item=2770 (from an item page) searches for that item and opens its details.
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import { getJSON, groupLabel, localTime, noDataMessage, priceUrl, verdict } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";
  import Movers from "./Movers.svelte";
  import PriceHistory from "./PriceHistory.svelte";

  let { children }: { children?: Snippet } = $props();

  interface Row { id: number; min: number; market: number; qty: number; n: number; name: string | null; vendor: number | null }

  let region = $state("eu"), group = $state(""), faction = $state("alliance"), sort = $state("value");
  let shown = $state(100), term = $state("");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), loadFailed = $state(false), emptyMsg = $state("");
  let detailId = $state<number | null>(null);
  let history = $state.raw<{ points: number[][] | null; loading: boolean }>({ points: null, loading: false });
  const histCache: Record<string, Record<string, Record<string, number[][]>> | null> = {};
  let deepItem = 0;

  const save = () => saveMarketPrefs({ region, group, faction, sort });

  const current = $derived(houseOf(groupData, faction));
  const rows = $derived.by<Row[]>(() => {
    if (!current) return [];
    const names = itemSource.items;
    return Object.entries(current.house.items).map(([id, a]) => {
      const n = names[id] || [];
      // vendor price 0 means vendors won't buy it: treat like "no vendor price"
      return { id: +id, min: a[0], market: a[1], qty: a[2], n: a[3], name: n[0] || null, vendor: n[1] ? n[1] : null };
    });
  });
  const list = $derived.by(() => {
    const t = term.toLowerCase().trim();
    const hits = rows.filter((r) => !t || (r.name && r.name.toLowerCase().includes(t)) || String(r.id) === t);
    return hits.sort((a, b) => {
      if (sort === "name") return (a.name || "~").localeCompare(b.name || "~");
      if (sort === "market") return b.market - a.market;
      if (sort === "listings") return b.n - a.n;
      if (sort === "ahgain") return (b.vendor ? b.market * 0.95 / b.vendor : 0) - (a.vendor ? a.market * 0.95 / a.vendor : 0);
      if (sort === "qty") return b.qty - a.qty;
      return b.market * b.qty - a.market * a.qty; // "value": total gold worth listed
    });
  });
  const page = $derived(list.slice(0, shown));
  const status = $derived(
    loading ? "Loading prices…"
    : loadFailed ? "Couldn't load this group's prices."
    : term.trim()
      ? list.length.toLocaleString() + (list.length === 1 ? " matching item" : " matching items") + (list.length > shown ? " (showing " + shown + ")" : "")
      : "Showing " + Math.min(shown, list.length) + " of " + list.length.toLocaleString() + " items",
  );
  const detail = $derived(detailId != null ? rows.find((r) => r.id === detailId) || null : null);

  async function loadRegion() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
    if (!meta?.groups?.length) {
      emptyMsg = noDataMessage("Live prices are temporarily unavailable. Please try again later.",
        "No price data on this computer yet. Run `npm run prices` in the project folder, then reload this page.");
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
    // label the group with its confirmed ruleset name when the file has it
    if (g?.ruleset) groups = groups.map((o) => (o.value === g.group ? { ...o, label: g.ruleset! } : o));
    if (deepItem) {
      const r = rows.find((x) => x.id === deepItem);
      deepItem = 0;
      if (r) { term = r.name || String(r.id); openDetail(r.id); }
    }
  }

  async function openDetail(id: number) {
    detailId = id;
    const part = group + "_" + (id % 32), key = region + ":" + part; // history is split per server group
    history = { points: null, loading: true };
    await tick();
    document.getElementById("pr-detail")?.scrollIntoView({ block: "nearest" });
    document.getElementById("pr-close")?.focus();
    const h = key in histCache ? histCache[key] : (histCache[key] = await getJSON(priceUrl("history", region, part)));
    const houseId = current?.id;
    if (detailId === id) history = { points: (houseId && h?.[houseId]?.[id]) || null, loading: false };
  }

  function closeDetail() {
    const id = detailId;
    detailId = null;
    tick().then(() => document.querySelector<HTMLElement>(`.pr-open[data-id="${id}"]`)?.focus());
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance"; sort = p.sort || "value";
    deepItem = +(new URLSearchParams(location.search).get("item") || 0);
    loadRegion();
  });

  // announce the result count a moment after the list changes; let Wowhead find new links
  let timer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const text = status;
    page; detail;
    if (loading) return;
    clearTimeout(timer);
    timer = setTimeout(() => announce(text), 600);
    tick().then(setupWowhead);
  });
</script>

<div class="wrap section" hidden={!emptyMsg}>
  <div class="panel"><h2>No prices yet</h2><p>{emptyMsg}</p></div>
</div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel pr-controls">
    <MarketSelects prefix="pr" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; shown = 100; save(); detailId = null; loadRegion(); }}
      ongroup={(v) => { group = v; shown = 100; save(); detailId = null; loadGroup(); }}
      onfaction={(v) => { faction = v; shown = 100; save(); detailId = null; }} />
    <div><label class="field-label" for="pr-sort">Sort by</label>
      <select class="input" id="pr-sort" onchange={(e) => { sort = e.currentTarget.value; save(); }}>
        <option value="value" title="Total gold value listed" selected={sort === "value"}>Biggest market</option><option value="qty" selected={sort === "qty"}>Most units</option><option value="market" selected={sort === "market"}>Most expensive</option>
        <option value="listings" selected={sort === "listings"}>Most listings</option><option value="ahgain" selected={sort === "ahgain"}>Best vs. vendor</option><option value="name" selected={sort === "name"}>Name (A–Z)</option>
      </select></div>
    <div class="pr-search"><label class="field-label" for="pr-search">Find an item</label>
      <input class="input" type="search" id="pr-search" placeholder="e.g. Copper Ore, Linen, Peacebloom" autocomplete="off" bind:value={term} oninput={() => (shown = 100)} /></div>
  </div>
  <p class="note">Blizzard's data doesn't name which ruleset each server group is, so we confirm them with in-game price checks. <b>PvP and Normal (Europe) are confirmed.</b> The other groups show a letter until they're checked — play on Roleplay or RP-PvP? Tell us a few prices and we'll label yours.</p>

  <Movers {region} {group} houseId={groupData ? (current?.id ?? null) : null} />

  <section class="panel pr-detail" id="pr-detail" hidden={!detail} aria-labelledby="pr-detail-title">
    {#if detail}
      {@const v = verdict(detail.market, detail.vendor)}
      <div class="section-head"><h2 id="pr-detail-title"><ItemLink id={detail.id} name={detail.name} /></h2><button type="button" class="icon-btn" id="pr-close" aria-label="Close details" onclick={closeDetail}>×</button></div>
      <div class="pr-stats">
        <div class="stat"><b><Money c={detail.market} /></b><span>Market price (cheapest 10% of units)</span></div>
        <div class="stat"><b><Money c={detail.min} /></b><span>Lowest price</span></div>
        <div class="stat"><b>{detail.qty.toLocaleString()}</b><span>Units listed ({detail.n.toLocaleString()} listings)</span></div>
        <div class="stat"><b><Money c={detail.vendor} /></b><span>Vendor buys for</span></div>
      </div>
      <p class="verdict-line"><span class="verdict {v.cls}">{v.label}</span> {v.why}.</p>
      <h3 class="mini-head">Market price, last 30 days</h3>
      <div id="pr-chart" class="pr-chart"><PriceHistory points={history.points} loading={history.loading} /></div>
    {/if}
  </section>

  <div class="section-head" style="margin-top:18px">
    <p class="faint" style="margin:0">{#if current && !loading}Updated <time datetime={groupData!.updated}>{localTime(groupData!.updated)}</time> · {current.house.listings.toLocaleString()} listings · {rows.length.toLocaleString()} different items{/if}</p>
    <p class="faint" style="margin:0">{status}</p>
  </div>
  <div class="table-wrap">
    <table class="prices">
      <caption class="sr-only">Auction house prices per item</caption>
      <thead><tr>
        <th scope="col">Item</th><th scope="col">Market price</th><th scope="col">Lowest</th><th scope="col">Listed</th>
        <th scope="col" class="col-hide-sm">Listings</th><th scope="col" class="col-hide-sm">Vendor</th><th scope="col">Sell where?</th><th scope="col"><span class="sr-only">Details</span></th>
      </tr></thead>
      <tbody>
        {#if !loading && !loadFailed}
          {#each page as r (r.id)}
            {@const v = verdict(r.market, r.vendor)}
            <tr data-id={r.id}><th scope="row"><ItemLink id={r.id} name={r.name} /></th><td><Money c={r.market} /></td><td><Money c={r.min} /></td><td>{r.qty.toLocaleString()}</td><td class="col-hide-sm">{r.n.toLocaleString()}</td><td class="col-hide-sm"><Money c={r.vendor} /></td><td><span class="verdict {v.cls}" title={v.why}>{v.label}</span></td><td><button type="button" class="btn btn-ghost btn-sm pr-open" data-id={r.id} onclick={() => openDetail(r.id)}>Details<span class="sr-only">{" for " + (r.name || "item " + r.id)}</span></button></td></tr>
          {:else}
            <tr><td colspan="8" class="empty">No items match.</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <p style="text-align:center;margin-top:14px"><button type="button" class="btn btn-ghost" hidden={list.length <= shown} onclick={() => (shown += 100)}>Show 100 more</button></p>

  {@render children?.()}
</div>
