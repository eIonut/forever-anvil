<script lang="ts">
  // My watchlist: the items the visitor starred, with this hour's prices on their chosen auction house,
  // the change over the last 7 days, the cheapest house in the ruleset, and an optional target price
  // ("flag it when the lowest listing is at or below…"). The list is saved in the browser (src/lib/watchlist.ts).
  // /watchlist?ids=2770,2589 shows someone's shared list, with a button to add it to your own.
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import Freshness from "./Freshness.svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";
  import SoldPerDay from "./SoldPerDay.svelte";
  import Icon from "./Icon.svelte";
  import { copyText, getCachedJSON, getJSON, groupLabel, noDataMessage, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { notify } from "../lib/notify";
  import { askConfirm } from "../lib/dialog";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { moneyText } from "../lib/format";
  import { FACTIONS } from "../lib/labels";
  import { addToWatch, setTarget, setWatch } from "../lib/watchstore";
  import { changeSince, cheapestHouse, decodeIds, encodeIds, hitMessages, targetHits } from "../lib/watchmath.js";
  import { autoRefresh } from "../lib/autorefresh";
  import MoneyInput from "./MoneyInput.svelte";
  import { SHARDS } from "../lib/pricemath.js";
  import { useItems, itemName, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta } from "./types";
  import { watch } from "./watch.svelte";

  let { children }: { children?: Snippet } = $props();

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), emptyMsg = $state("");
  let started = $state(false);
  /** item ids from a share link; null = the visitor's own list */
  let shared = $state<number[] | null>(null);

  // daily history files, one per server group and shard ("A_5"), loaded for the watched items only
  const histFiles: Record<string, Record<string, Record<string, number[][]>> | null> = {};
  const histPending = new Set<string>();
  let histVersion = $state(0);

  const save = () => saveMarketPrefs({ region, group, faction });
  const current = $derived(houseOf(groupData, faction));

  const source = $derived(shared
    ? shared.map((id) => ({ id, name: itemName(id) || "", below: null as number | null }))
    : watch.items);

  const rows = $derived.by(() => {
    histVersion; // new history arrived: recompute the changes
    const house = current?.house, houseId = current?.id;
    return source.map((w) => {
      const a = house?.items[w.id] || null;
      const name = itemName(w.id) || w.name || null;
      const file = histFiles[region + ":" + group + "_" + (w.id % SHARDS)];
      const points = houseId && file ? file[houseId]?.[w.id] : undefined;
      const change = a ? changeSince(points, a[1], 7) : null;
      const best = groupData ? cheapestHouse(groupData.houses, w.id) : null;
      // only worth pointing out when another house is clearly cheaper (5% or more)
      const elsewhere = best && best.houseId !== houseId && (!a || best.market < a[1] * 0.95) ? best : null;
      const hit = !!(w.below && a && a[0] <= w.below);
      return { ...w, name, a, change, histKnown: !!file, elsewhere, hit };
    });
  });
  const hits = $derived(rows.filter((r) => r.hit).length);

  async function loadRegion() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
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
    loading = false;
    if (g?.ruleset) groups = groups.map((o) => (o.value === g.group ? { ...o, label: g.ruleset! } : o));
    loadHistory();
  }

  /** download the history shards the listed items need (at most one file per shard, shared by the list) */
  async function loadHistory() {
    const r = region;
    const parts = [...new Set(source.map((w) => group + "_" + (w.id % SHARDS)))].filter((p) => !(r + ":" + p in histFiles) && !histPending.has(r + ":" + p));
    if (!parts.length) return;
    parts.forEach((p) => histPending.add(r + ":" + p));
    await Promise.all(parts.map(async (p) => { histFiles[r + ":" + p] = await getJSON(priceUrl("history", r, p)); histPending.delete(r + ":" + p); }));
    histVersion++;
  }

  /**
   * While the page stays open (src/lib/autorefresh.ts): fetch this hour's prices again, and when they're
   * new, say which items have just reached their target. Items already at their target stay quiet.
   */
  async function refreshPrices() {
    if (!groupData || emptyMsg) return;
    const r = region, gName = group;
    const g = await getJSON<GroupPrices>(priceUrl("prices", r, gName));
    // nothing new yet, or the visitor switched market meanwhile
    if (!g || r !== region || gName !== group || g.updated === groupData?.updated) return;
    const before = new Set(targetHits(watch.items, current?.house.items));
    groupData = g;
    const now = houseOf(g, faction)?.house.items || {};
    const fresh = shared ? [] : targetHits(watch.items, now).filter((id) => !before.has(id));
    const named = fresh.map((id) => ({ name: itemName(id) || watch.items.find((w) => w.id === id)?.name || "Item " + id, min: now[id][0] }));
    for (const m of hitMessages(named, moneyText)) notify(m, "success", 9000);
  }

  // a star added on another page, or an item added from a share link: fetch its history too
  $effect(() => { source.length; if (started && groupData) loadHistory(); });

  function onTarget(id: number, c: number | null) {
    setTarget(id, c);
    notify(c ? `Target set: ${moneyText(c)}` : "Target removed", c ? "success" : "info");
  }

  async function shareLink() {
    const url = location.origin + "/watchlist?ids=" + encodeIds(watch.items.map((w) => w.id));
    if (await copyText(url, "Copy this link to your watchlist:")) notify("Link copied: anyone who opens it sees these items");
  }

  async function clearAll() {
    const n = watch.items.length;
    if (!n) return;
    const ok = await askConfirm({
      title: "Clear your watchlist?",
      message: `This removes all ${n} item${n === 1 ? "" : "s"} and their target prices from this browser. It can't be undone.`,
      confirmLabel: "Clear watchlist", danger: true,
    });
    if (!ok) return;
    setWatch([]);
    notify("Watchlist cleared", "info");
  }

  function keepShared() {
    if (!shared) return;
    const n = addToWatch(shared.map((id) => ({ id, name: itemName(id) || "Item " + id })));
    notify(n ? `Added ${n} item${n === 1 ? "" : "s"} to your watchlist` : "You're already watching all of these", n ? "success" : "info");
    showOwn();
  }

  function showOwn() {
    shared = null;
    history.replaceState(history.state, "", "/watchlist");
  }

  onMount(() => {
    watch.init();
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    const ids = decodeIds(new URLSearchParams(location.search).get("ids"));
    if (ids.length) shared = ids;
    started = true;
    loadRegion();
    return autoRefresh(refreshPrices);
  });

  $effect(() => {
    if (loading || !started) return;
    announce(rows.length + (rows.length === 1 ? " item" : " items") + (hits ? ", " + hits + " at or below your target price" : ""));
    tick().then(setupWowhead);
  });
</script>

<div class="wrap section" hidden={!emptyMsg}>
  <div class="panel"><h2>No prices yet</h2><p>{emptyMsg}</p></div>
</div>

<div class="wrap section" hidden={!!emptyMsg}>
  {#if shared}
    <div class="panel wl-shared">
      <p><b>A shared watchlist</b> with {shared.length} item{shared.length === 1 ? "" : "s"}. Add them to your own list to keep them, or set target prices.</p>
      <div class="wl-actions">
        <button type="button" class="btn" onclick={keepShared}><Icon name="star" size={18} line />Add to my watchlist</button>
        <button type="button" class="btn btn-ghost" onclick={showOwn}>Show my own watchlist</button>
      </div>
    </div>
  {/if}

  <div class="panel controls">
    <MarketSelects prefix="wl" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
  </div>

  <Freshness {region} updated={groupData?.updated} />

  {#if started && !shared && !watch.items.length}
    <div class="panel wl-empty">
      <h2>Your watchlist is empty</h2>
      <p>Click the <span class="wl-star-demo" aria-hidden="true"><Icon name="star" size={16} line /></span><span class="sr-only">star</span> next to any item on <a href="/prices">Auction prices</a>, <a href="/flips">Vendor flips</a> or an <a href="/item">item page</a> to watch it. Your items then show here and on the <a href="/">home page</a> with this hour's prices.</p>
      <p class="faint">Good things to watch: the materials you buy for your profession, what you farm to sell, and gear you're saving up for.</p>
    </div>
  {:else}
    <div class="section-head wl-head">
      <p class="wl-summary" aria-live="polite">
        {#if loading}<Loading text="Loading prices…" />
        {:else}<b>{rows.length}</b> item{rows.length === 1 ? "" : "s"}{#if current}{" on the " + (FACTIONS[faction] || faction) + " auction house"}{/if}{#if hits}{" · "}<span class="wl-hit-count"><b>{hits}</b> at or below your target price</span>{/if}{/if}
      </p>
      {#if !shared && watch.items.length}
        <div class="wl-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick={shareLink}><Icon name="link" size={16} line />Copy share link</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={clearAll}>Clear all</button>
        </div>
      {/if}
    </div>
    <div class="table-wrap">
      <table class="prices pr-table wl-table">
        <caption class="sr-only">Watched items with this hour's prices</caption>
        <thead><tr>
          <th scope="col">Item</th><th scope="col">Lowest</th><th scope="col">Market</th><th scope="col">7 days</th><th scope="col" class="col-hide-md">Listed</th><th scope="col">Sold/day</th><th scope="col">Cheaper elsewhere</th>{#if !shared}<th scope="col">Flag at or below</th>{/if}
        </tr></thead>
        <tbody>
          {#if loading && !groupData}<SkeletonRows rows={Math.min(Math.max(source.length, 3), 8)} cols={shared ? 7 : 8} />{:else}
            {#each rows as r (r.id)}
              <tr class:wl-hit={r.hit}>
                <th scope="row"><ItemLink id={r.id} name={r.name} copy watch />{#if r.hit}<span class="wl-flag">At your target</span>{/if}</th>
                <td data-label="Lowest">{#if r.a}<Money c={r.a[0]} />{:else}<span class="faint">Not listed</span>{/if}</td>
                <td data-label="Market"><Money c={r.a?.[1]} /></td>
                <td data-label="7 days">{#if r.change}<span class="pct {r.change.pct > 0 ? 'up' : r.change.pct < 0 ? 'down' : ''}" title="Market price now compared with {r.change.days} day{r.change.days === 1 ? '' : 's'} ago">{r.change.pct > 0 ? "▲ +" : r.change.pct < 0 ? "▼ " : ""}{r.change.pct}%</span>{:else if r.a && !r.histKnown}<span class="faint">…</span>{:else}<span class="faint">-</span>{/if}</td>
                <td class="col-hide-md" data-label="Listed">{r.a ? r.a[2].toLocaleString() : "0"}</td>
                <td data-label="Sold/day"><SoldPerDay a={r.a} hours={current?.house.salesHours} suffix="" /></td>
                <td data-label="Cheaper elsewhere" class:wl-none={!r.elsewhere}>{#if r.elsewhere}<Money c={r.elsewhere.market} /> <span class="faint wl-where">on {FACTIONS[r.elsewhere.faction] || r.elsewhere.faction}</span>{:else}<span class="faint">-</span>{/if}</td>
                {#if !shared}
                  <td data-label="Flag at or below" class="wl-target-cell">
                    <MoneyInput id="wl-t-{r.id}" value={r.below} label="Flag {r.name || 'item ' + r.id} when its lowest price is at or below" onchange={(c) => onTarget(r.id, c)} />
                  </td>
                {/if}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
  {@render children?.()}
</div>
