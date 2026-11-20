<script lang="ts">
  // Auction House prices: every item on one auction house, with search, sorting,
  // price changes & deals, and a details panel with the 30-day chart.
  // /prices?item=2770 (from an item page) searches for that item and opens its details.
  import type { Snippet } from "svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { onMount, tick } from "svelte";
  import { getCachedJSON, getJSON, groupLabel, localTime, noDataMessage, priceUrl, verdict } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type ItemPrice, type Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";
  import Movers from "./Movers.svelte";
  import SoldPerDay from "./SoldPerDay.svelte";
  import PriceHistory from "./PriceHistory.svelte";
  import { VirtualRows } from "./virtual.svelte";
  import { load as loadStore, save as saveStore } from "../lib/store";
  import { CATEGORIES, HANDS, MAX_LEVEL, NO_FILTER, QUALITIES, SLOT_ORDER, isFiltered, kindOf, matches, type ItemFilter, type ItemKind } from "../lib/itemfilters";

  let { children }: { children?: Snippet } = $props();

  interface Row { id: number; min: number; market: number; qty: number; n: number; name: string | null; vendor: number | null; sold: number; a: ItemPrice; kind: ItemKind }
  const FILTER_KEY = "codex-prices-filter";

  // sorting: a column heading or the Sort by menu picks the key; clicking the same heading again flips it
  type SortKey = "value" | "name" | "level" | "market" | "min" | "qty" | "sold" | "listings" | "vendor" | "ahgain";
  /** which way a key sorts when first picked: numbers biggest first, names and levels lowest first */
  const FIRST_DIR: Record<SortKey, 1 | -1> = { value: -1, name: 1, level: 1, market: -1, min: -1, qty: -1, sold: -1, listings: -1, vendor: -1, ahgain: -1 };
  const SORT_NAMES: Record<SortKey, string> = {
    value: "Biggest market", name: "Name", level: "Required level", market: "Market price", min: "Lowest price",
    qty: "Units listed", sold: "Sold per day", listings: "Listings", vendor: "Vendor price", ahgain: "Best vs. vendor",
  };
  const isSortKey = (k: unknown): k is SortKey => typeof k === "string" && k in FIRST_DIR;

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let sort = $state<SortKey>("value"), dir = $state<1 | -1>(-1);
  let term = $state("");
  let filter = $state<ItemFilter>({ ...NO_FILTER });
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), loadFailed = $state(false), emptyMsg = $state("");
  let detailId = $state<number | null>(null);
  let history = $state.raw<{ points: number[][] | null; loading: boolean }>({ points: null, loading: false });
  const histCache: Record<string, Record<string, Record<string, number[][]>> | null> = {};
  let deepItem = 0;

  const save = () => saveMarketPrefs({ region, group, faction, sort, dir });

  function sortBy(key: SortKey) {
    if (sort === key) dir = dir === 1 ? -1 : 1;
    else { sort = key; dir = FIRST_DIR[key]; }
    save();
    v.toTop();
  }

  /** the value a row sorts by; null (no level, no vendor price) always sorts last */
  function sortValue(r: Row, key: SortKey): number | string | null {
    switch (key) {
      case "name": return r.name;
      case "level": return r.kind.req == null ? null : Math.max(1, r.kind.req);
      case "market": return r.market;
      case "min": return r.min;
      case "qty": return r.qty;
      case "sold": return r.sold;
      case "listings": return r.n;
      case "vendor": return r.vendor;
      case "ahgain": return r.vendor ? (r.market * 0.95) / r.vendor : null;
      default: return r.market * r.qty; // "value": total gold worth listed
    }
  }

  const current = $derived(houseOf(groupData, faction));
  const rows = $derived.by<Row[]>(() => {
    if (!current) return [];
    const names = itemSource.items;
    return Object.entries(current.house.items).map(([id, a]) => {
      const n = names[id] || [];
      // vendor price 0 means vendors won't buy it: treat like "no vendor price"
      return { id: +id, min: a[0], market: a[1], qty: a[2], n: a[3], name: n[0] || null, vendor: n[1] ? n[1] : null, sold: a[4] || 0, a, kind: kindOf(n) };
    });
  });
  /** item data from before levels were saved has none: then the level boxes are off rather than hiding everything */
  const levelsKnown = $derived(rows.some((r) => r.kind.req != null));
  const active = $derived<ItemFilter>(levelsKnown ? filter : { ...filter, minLevel: null, maxLevel: null });
  const list = $derived.by(() => {
    const t = term.toLowerCase().trim();
    const hits = rows.filter((r) => matches(r.kind, active) && (!t || (r.name && r.name.toLowerCase().includes(t)) || String(r.id) === t));
    const byName = (a: Row, b: Row) => (a.name || "~").localeCompare(b.name || "~");
    return hits.sort((a, b) => {
      const x = sortValue(a, sort), y = sortValue(b, sort);
      if (x == null || y == null) return x == null && y == null ? byName(a, b) : x == null ? 1 : -1;
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return c ? c * dir : byName(a, b);
    });
  });
  // filter menus list only what's on this auction house, with counts. Each menu counts the items
  // that pass the other filters, so a choice never leads to an empty list.
  const count = (pick: (k: ItemKind) => string | null, f: ItemFilter) => {
    const out = new Map<string, number>();
    for (const r of rows) {
      if (!matches(r.kind, f)) continue;
      const k = pick(r.kind);
      if (k) out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
  };
  const catCounts = $derived(count((k) => k.cat, { ...active, cat: "", sub: "", slot: "", hands: "" }));
  const subCounts = $derived(filter.cat ? count((k) => k.sub, { ...active, sub: "" }) : new Map<string, number>());
  const slotCounts = $derived(filter.cat === "armor" ? count((k) => k.slot, { ...active, slot: "" }) : new Map<string, number>());
  const handCounts = $derived(filter.cat === "weapon" ? count((k) => k.hands, { ...active, hands: "" }) : new Map<string, number>());
  const subs = $derived([...subCounts].sort((a, b) => a[0].localeCompare(b[0])));
  const slots = $derived(SLOT_ORDER.filter((x) => slotCounts.has(x)));

  function setFilter(changes: Partial<ItemFilter>) {
    filter = { ...filter, ...changes };
    saveStore(FILTER_KEY, filter);
    v.toTop();
  }
  /** a level box's value: empty = no limit, otherwise kept within 1–60 */
  const levelOf = (s: string): number | null => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? Math.min(MAX_LEVEL, Math.max(1, n)) : null;
  };
  /** a new category starts with its own menus cleared */
  const setCategory = (cat: string) => setFilter({ cat, sub: "", slot: "", hands: "" });

  // only the rows near the screen are in the page; the rest are spacer height (see virtual.svelte.ts)
  const v = new VirtualRows(() => list, (r) => r.id, 49);
  const status = $derived(
    loading ? "Loading prices…"
    : loadFailed ? "Couldn't load this group's prices."
    : "Showing " + v.shown.toLocaleString() + " of " + list.length.toLocaleString() + (term.trim() || isFiltered(filter) ? (list.length === 1 ? " matching item" : " matching items") : " items"),
  );
  /** the visitor is looking for something: show the results above the price changes */
  const searching = $derived(!!term.trim() || isFiltered(filter));
  const detail = $derived(detailId != null ? rows.find((r) => r.id === detailId) || null : null);

  async function loadRegion() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
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
    // the row may be scrolled out of the page: bring it back first, then focus its button
    v.scrollToIndex(list.findIndex((r) => r.id === id));
    tick().then(() => document.querySelector<HTMLElement>(`.pr-open[data-id="${id}"]`)?.focus());
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance"; sort = isSortKey(p.sort) ? p.sort : "value";
    dir = p.dir === 1 || p.dir === -1 ? p.dir : FIRST_DIR[sort];
    deepItem = +(new URLSearchParams(location.search).get("item") || 0);
    // a link to one item shows it whatever the filters were
    if (!deepItem) filter = { ...NO_FILTER, ...(loadStore<Partial<ItemFilter>>(FILTER_KEY) || {}) };
    loadRegion();
  });

  // announce the result count a moment after the list changes; let Wowhead find new links
  let timer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const text = status;
    if (loading) return;
    clearTimeout(timer);
    timer = setTimeout(() => announce(text), 600);
  });
  $effect(() => {
    v.slice; detail; // rows scrolled into the page need their Wowhead tooltips too
    if (!loading) tick().then(setupWowhead);
  });
</script>

<div class="wrap section" hidden={!emptyMsg}>
  <div class="panel"><h2>No prices yet</h2><p>{emptyMsg}</p></div>
</div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="pr" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); detailId = null; loadRegion(); }}
      ongroup={(v) => { group = v; save(); detailId = null; loadGroup(); }}
      onfaction={(v) => { faction = v; save(); detailId = null; }} />
    <div class="control-row pr-row">
    <div class="pr-search"><label class="field-label" for="pr-search">Find an item</label>
      <input class="input" type="search" id="pr-search" placeholder="e.g. Copper Ore, Linen, Peacebloom" autocomplete="off" bind:value={term} oninput={() => v.toTop()} /></div>
    <div><label class="field-label" for="pr-sort">Sort by</label>
      <div class="cr-sort">
      <select class="input" id="pr-sort" onchange={(e) => { sort = e.currentTarget.value as SortKey; dir = FIRST_DIR[sort]; save(); v.toTop(); }}>
        {#each Object.entries(SORT_NAMES) as [k, label] (k)}<option value={k} title={k === "value" ? "Total gold value listed" : undefined} selected={sort === k}>{label}</option>{/each}
      </select>
      <button type="button" class="btn btn-ghost cr-dir" onclick={() => { dir = dir === 1 ? -1 : 1; save(); v.toTop(); }}><span aria-hidden="true" class="cr-dir-arrow">{dir === 1 ? "↑" : "↓"}</span>{dir === 1 ? (sort === "name" ? "A to Z" : "Lowest first") : (sort === "name" ? "Z to A" : "Highest first")}<span class="sr-only">, click to reverse the order</span></button>
      </div></div>
    </div>
    <div class="pr-filters">
      <fieldset class="chip-group">
        <legend>Category</legend>
        <div class="chips">
          <label class="chip"><input type="radio" name="pr-cat" value="" checked={!filter.cat} onchange={() => setCategory("")} /><span>All</span></label>
          {#each CATEGORIES as c (c.value)}
            {@const n = catCounts.get(c.value) || 0}
            {#if n || filter.cat === c.value}
              <label class="chip"><input type="radio" name="pr-cat" value={c.value} checked={filter.cat === c.value} onchange={() => setCategory(c.value)} /><span>{c.label} <span class="chip-note">{n.toLocaleString()}</span></span></label>
            {/if}
          {/each}
        </div>
      </fieldset>
      <div class="pr-subfilters">
        {#if filter.cat === "weapon"}
          <fieldset class="chip-group">
            <legend>Hands</legend>
            <div class="chips">
              <label class="chip"><input type="radio" name="pr-hands" value="" checked={!filter.hands} onchange={() => setFilter({ hands: "" })} /><span>Any</span></label>
              {#each HANDS as h (h.value)}
                {#if handCounts.get(h.value) || filter.hands === h.value}
                  <label class="chip"><input type="radio" name="pr-hands" value={h.value} checked={filter.hands === h.value} onchange={() => setFilter({ hands: h.value })} /><span>{h.label} <span class="chip-note">{(handCounts.get(h.value) || 0).toLocaleString()}</span></span></label>
                {/if}
              {/each}
            </div>
          </fieldset>
        {/if}
        {#if filter.cat && subs.length}
          <div><label class="field-label" for="pr-sub">Type</label>
            <select class="input" id="pr-sub" onchange={(e) => setFilter({ sub: e.currentTarget.value })}>
              <option value="" selected={!filter.sub}>Any type</option>
              {#each subs as [name, n] (name)}<option value={name} selected={filter.sub === name}>{name} ({n.toLocaleString()})</option>{/each}
            </select></div>
        {/if}
        {#if filter.cat === "armor" && slots.length}
          <div><label class="field-label" for="pr-slot">Slot</label>
            <select class="input" id="pr-slot" onchange={(e) => setFilter({ slot: e.currentTarget.value })}>
              <option value="" selected={!filter.slot}>Any slot</option>
              {#each slots as x (x)}<option value={x} selected={filter.slot === x}>{x} ({(slotCounts.get(x) || 0).toLocaleString()})</option>{/each}
            </select></div>
        {/if}
        <fieldset class="pr-level">
          <legend class="field-label">Required level</legend>
          <div class="pr-level-boxes">
            <label class="sr-only" for="pr-lvl-min">Required level from</label>
            <input class="input" type="number" id="pr-lvl-min" inputmode="numeric" min="1" max={MAX_LEVEL} placeholder="1" disabled={!levelsKnown} aria-describedby={levelsKnown ? undefined : "pr-lvl-note"} value={filter.minLevel ?? ""} oninput={(e) => setFilter({ minLevel: levelOf(e.currentTarget.value) })} />
            <span aria-hidden="true">to</span>
            <label class="sr-only" for="pr-lvl-max">Required level to</label>
            <input class="input" type="number" id="pr-lvl-max" inputmode="numeric" min="1" max={MAX_LEVEL} placeholder={String(MAX_LEVEL)} disabled={!levelsKnown} aria-describedby={levelsKnown ? undefined : "pr-lvl-note"} value={filter.maxLevel ?? ""} oninput={(e) => setFilter({ maxLevel: levelOf(e.currentTarget.value) })} />
          </div>
          {#if rows.length && !levelsKnown}<p class="faint pr-level-note" id="pr-lvl-note">Item levels arrive with the next price update.</p>{/if}
        </fieldset>
        <div><label class="field-label" for="pr-quality">Quality</label>
          <select class="input" id="pr-quality" onchange={(e) => setFilter({ minQuality: e.currentTarget.value })}>
            <option value="" selected={!filter.minQuality}>Any quality</option>
            {#each QUALITIES.slice(1) as q (q.value)}<option value={q.value} selected={filter.minQuality === q.value}>{q.label} and better</option>{/each}
          </select></div>
        {#if isFiltered(filter)}
          <div class="pr-clear"><button type="button" class="btn btn-ghost" onclick={() => setFilter({ ...NO_FILTER })}>Clear filters</button></div>
        {/if}
      </div>
    </div>
  </div>
  <p class="note">Blizzard's data doesn't name which ruleset each server group is, so we confirm them with in-game price checks. <b>All four Europe rulesets are labelled.</b></p>

  <!-- while searching or filtering, the results come first and the day's price changes move below them -->
  {#if searching}{@render results()}{/if}
  <div class="pr-movers-slot" class:after={searching}>
    <Movers {region} {group} houseId={groupData ? (current?.id ?? null) : null} house={current?.house} />
  </div>
  {#if !searching}{@render results()}{/if}

  {@render children?.()}
</div>

{#snippet head(key: SortKey, label: string, cls = "")}
  <th scope="col" class={cls} aria-sort={sort === key ? (dir === 1 ? "ascending" : "descending") : "none"}>
    <button type="button" class="th-sort" class:active={sort === key} onclick={() => sortBy(key)}>{label}<span class="th-arrow" aria-hidden="true">{sort === key ? (dir === 1 ? "▲" : "▼") : "↕"}</span><span class="sr-only">, sort by {SORT_NAMES[key].toLowerCase()}</span></button>
  </th>
{/snippet}

{#snippet results()}
  <section class="panel pr-detail" id="pr-detail" hidden={!detail} aria-labelledby="pr-detail-title">
    {#if detail}
      {@const dv = verdict(detail.market, detail.vendor)}
      <div class="section-head"><h2 id="pr-detail-title"><ItemLink id={detail.id} name={detail.name} copy /></h2><button type="button" class="icon-btn" id="pr-close" aria-label="Close details" onclick={closeDetail}>×</button></div>
      <div class="pr-stats">
        <div class="stat"><b><Money c={detail.market} /></b><span>Market price (cheapest 10% of units)</span></div>
        <div class="stat"><b><Money c={detail.min} /></b><span>Lowest price</span></div>
        <div class="stat"><b>{detail.qty.toLocaleString()}</b><span>Units listed ({detail.n.toLocaleString()} listings)</span></div>
        <div class="stat"><b><Money c={detail.vendor} /></b><span>Vendor buys for</span></div>
      </div>
      <p class="verdict-line"><span class="verdict {dv.cls}">{dv.label}</span> {dv.why}.</p>
      <h3 class="mini-head">Market price, last 30 days</h3>
      <div id="pr-chart" class="pr-chart"><PriceHistory points={history.points} loading={history.loading} /></div>
    {/if}
  </section>

  <div class="section-head" style="margin-top:18px">
    <p class="faint" style="margin:0">{#if current && !loading}Updated <time datetime={groupData!.updated}>{localTime(groupData!.updated)}</time> · {current.house.listings.toLocaleString()} listings · {rows.length.toLocaleString()} different items{/if}</p>
    <p class="faint" style="margin:0">{#if loading}<Loading text="Loading prices…" />{:else}{status}{/if}</p>
  </div>
  <div class="table-wrap">
    <table class="prices" aria-rowcount={list.length + 1}>
      <caption class="sr-only">Auction house prices per item. Column headings sort the table.</caption>
      <thead><tr aria-rowindex="1">
        {@render head("name", "Item")}{@render head("level", "Level", "col-hide-sm")}{@render head("market", "Market price")}{@render head("min", "Lowest")}{@render head("qty", "Listed")}{@render head("sold", "Sold per day")}
        {@render head("listings", "Listings", "col-hide-sm")}{@render head("vendor", "Vendor", "col-hide-sm")}{@render head("ahgain", "Sell where?")}<th scope="col"><span class="sr-only">Details</span></th>
      </tr></thead>
      <tbody class="v-body" bind:this={v.body}>
        {#if loading}<SkeletonRows cols={10} />{:else if !loadFailed}
          {#if v.padTop}<tr class="v-pad" aria-hidden="true"><td colspan="10" style:height="{v.padTop}px"></td></tr>{/if}
          {#each v.slice as r, i (r.id)}
            {@const vd = verdict(r.market, r.vendor)}
            <tr data-id={r.id} aria-rowindex={v.start + i + 2} {@attach v.measure(r.id)}><th scope="row"><ItemLink id={r.id} name={r.name} copy /></th><td class="col-hide-sm">{#if r.kind.req}{r.kind.req}{:else}<span class="faint">-</span>{/if}</td><td><Money c={r.market} /></td><td><Money c={r.min} /></td><td>{r.qty.toLocaleString()}</td><td><SoldPerDay a={r.a} hours={current?.house.salesHours} suffix="" /></td><td class="col-hide-sm">{r.n.toLocaleString()}</td><td class="col-hide-sm"><Money c={r.vendor} /></td><td><span class="verdict {vd.cls}" title={vd.why}>{vd.label}</span></td><td><button type="button" class="btn btn-ghost btn-sm pr-open" data-id={r.id} onclick={() => openDetail(r.id)}>Details<span class="sr-only">{" for " + (r.name || "item " + r.id)}</span></button></td></tr>
          {:else}
            <tr><td colspan="10" class="empty">No items match.</td></tr>
          {/each}
          {#if v.padBottom}<tr class="v-pad" aria-hidden="true"><td colspan="10" style:height="{v.padBottom}px"></td></tr>{/if}
        {/if}
      </tbody>
    </table>
  </div>
  <p class="v-more" hidden={!v.hasMore}><button type="button" class="btn btn-ghost" onclick={() => v.loadMore()}>Load 50 more items</button></p>
{/snippet}
