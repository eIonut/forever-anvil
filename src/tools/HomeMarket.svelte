<script lang="ts">
  // Home page: "your market right now". For the visitor's chosen auction house (the same choice every
  // price tool remembers): their watchlist, this hour's vendor flips, what's selling fastest, and the
  // best crafts that actually sell. Each card links to the full tool.
  //
  // The cards come from one small file per region (home_<region>.json, src/lib/homesummary.js), so a
  // first visit doesn't download the item list, a server group's prices and the recipes. Only visitors
  // with a watchlist also load their group's prices (for the starred items) and the item list (icons).
  // If the small file isn't there yet (just after a deploy), the cards are worked out here from the full
  // files, with the same code the price job uses.
  import { onMount, tick } from "svelte";
  import Loading from "./Loading.svelte";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";
  import SoldPerDay from "./SoldPerDay.svelte";
  import Icon from "./Icon.svelte";
  import { getCachedJSON, getJSON, groupLabel, priceUrl } from "../lib/api";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { setupWowhead } from "../lib/wowhead";
  import { FACTIONS } from "../lib/labels";
  import { recipeUrl } from "../lib/urls";
  import { hitMessages, targetHits } from "../lib/watchmath.js";
  import { buildHome } from "../lib/homesummary.js";
  import { autoRefresh } from "../lib/autorefresh";
  import { moneyText } from "../lib/format";
  import { notify } from "../lib/notify";
  import { useItems, itemName, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type HomeSummary, type Meta, type Recipes } from "./types";
  import { watch } from "./watch.svelte";

  const SHOW = 5;

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let home = $state.raw<HomeSummary | null>(null);
  /** the group's full prices: only loaded for the watchlist card */
  let groupData = $state.raw<GroupPrices | null>(null);
  let loading = $state(true), failed = $state(false), started = $state(false), watchLoading = $state(false);
  /** the full item list is loaded (watchlist or worked-out cards): keep it instead of the summary's few items */
  let fullItems = false;

  const save = () => saveMarketPrefs({ region, group, faction });
  const hm = $derived(home?.markets[group]?.houses[faction] || null);
  const marketName = $derived((groups.find((g) => g.value === group)?.label.split(" · ")[0] || "") + " " + (FACTIONS[faction] || ""));

  const watchedPrices = $derived(houseOf(groupData, faction)?.house.items || {});
  const watched = $derived.by(() => {
    return watch.items.map((w) => {
      const a = watchedPrices[w.id] || null;
      return { ...w, name: itemName(w.id) || w.name || null, a, hit: !!(w.below && a && a[0] <= w.below) };
    }).sort((x, y) => Number(y.hit) - Number(x.hit)); // targets reached first
  });
  const hits = $derived(watched.filter((w) => w.hit).length);
  const flips = $derived((hm?.flips || []).slice(0, SHOW));
  const flipTotal = $derived(hm?.flipTotal || 0);
  const sellers = $derived((hm?.sellers || []).slice(0, SHOW).map(([id, sold, market, perDay]) => ({ id, sold, market, perDay })));
  const crafts = $derived((hm?.crafts || []).slice(0, SHOW).map(([id, name, profession, item, profit]) => ({ id, name, profession, item, profit })));

  /** A region's cards: the small file, or (not uploaded yet) worked out from the full files of one group. */
  async function fetchHome(r: string, g: string): Promise<HomeSummary | null> {
    const small = await getJSON<HomeSummary>(priceUrl("home", r));
    if (small?.markets) return small;
    const meta = await getJSON<Meta>(priceUrl("meta", r));
    if (!meta?.groups?.length) return null;
    const pick = meta.groups.includes(g) ? g : meta.groups[0];
    const [prices, items, recipes] = await Promise.all([
      getJSON<GroupPrices>(priceUrl("prices", r, pick)),
      getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", r)),
      getCachedJSON<Recipes>(priceUrl("recipes", r)),
    ]);
    if (!prices) return null;
    useItems(r, items);
    fullItems = true;
    const built = buildHome({ region: r, updated: prices.updated, groups: { [pick]: prices }, recipes, items, meta }) as HomeSummary;
    built.groups = meta.groups; // every group stays pickable; picking another one works its cards out too
    return built;
  }

  function show(h: HomeSummary) {
    home = h;
    if (!fullItems) useItems(h.region, h.items);
    groups = h.groups.map((g) => ({ value: g, label: groupLabel(h, g) }));
  }

  async function loadRegion() {
    loading = true;
    fullItems = false;
    groupData = null;
    const r = region;
    const h = await fetchHome(r, group);
    if (r !== region) return;
    if (!h) { failed = true; loading = false; return; }
    failed = false;
    if (!h.groups.includes(group)) group = h.groups[0];
    show(h);
    loading = false;
    loadWatched();
  }

  async function loadGroup() {
    if (home && !home.markets[group]) { // worked-out cards cover one group: work out this one
      loading = true;
      const h = await fetchHome(region, group);
      if (h) show(h);
      failed = !h;
      loading = false;
    }
    loadWatched();
  }

  /** The watchlist card needs the group's full prices, and the item list for the starred items' icons. */
  async function loadWatched() {
    groupData = null;
    if (!watch.items.length) return;
    watchLoading = true;
    const r = region, g = group;
    const [prices, items] = await Promise.all([getJSON<GroupPrices>(priceUrl("prices", r, g)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", r))]);
    if (r !== region || g !== group) return;
    if (items) { useItems(r, items); fullItems = true; }
    groupData = prices;
    watchLoading = false;
  }

  /**
   * While the page stays open (src/lib/autorefresh.ts): fetch this hour's cards again; when they're new,
   * every card updates and the visitor hears which watched items have just reached their target.
   */
  async function refreshPrices() {
    if (!home || failed) return;
    const r = region, gName = group;
    const h = await fetchHome(r, gName);
    if (h && r === region && h.updated !== home.updated) show(h);
    if (!watch.items.length || !groupData) return;
    const g = await getJSON<GroupPrices>(priceUrl("prices", r, gName));
    if (!g || r !== region || gName !== group || g.updated === groupData.updated) return;
    const before = new Set(targetHits(watch.items, watchedPrices));
    groupData = g;
    const now = houseOf(g, faction)?.house.items || {};
    const fresh = targetHits(watch.items, now).filter((id) => !before.has(id));
    const named = fresh.map((id) => ({ name: itemName(id) || watch.items.find((w) => w.id === id)?.name || "Item " + id, min: now[id][0] }));
    for (const m of hitMessages(named, moneyText)) notify(m, "success", 9000);
  }

  onMount(() => {
    watch.init();
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    started = true;
    loadRegion();
    return autoRefresh(refreshPrices);
  });

  // an item starred on this page while the watchlist was empty: load the prices it needs
  $effect(() => { if (started && !loading && watch.items.length && !groupData && !watchLoading) loadWatched(); });
  $effect(() => { if (!loading) { watched; flips; sellers; crafts; tick().then(setupWowhead); } });
</script>

<section class="wrap section hm" aria-labelledby="hm-title">
  <div class="panel controls hm-controls">
    <div class="hm-head">
      <h2 id="hm-title">Your market right now</h2>
      <p class="faint">Pick your auction house once: these cards and every price tool remember it.</p>
    </div>
    <MarketSelects prefix="hm" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
  </div>

  {#if failed}
    <p class="note">Live prices are temporarily unavailable. Please try again in a few minutes.</p>
  {:else}
    <div class="hm-grid">
      <article class="panel hm-card">
        <div class="hm-card-head"><h3><Icon name="star" size={20} line /><a href="/watchlist">Your watchlist</a></h3>{#if hits}<span class="wl-flag">{hits} at target</span>{/if}</div>
        {#if !started || ((loading || watchLoading) && watch.items.length)}<Loading text="Loading…" block />
        {:else if !watch.items.length}
          <p>Star the items you buy and sell to see their prices here every time you visit.</p>
          <p class="faint">Look for the <span class="wl-star-demo" aria-hidden="true"><Icon name="star" size={14} line /></span><span class="sr-only">star</span> next to item names on <a href="/prices">Auction prices</a> and item pages.</p>
        {:else}
          <ul class="hm-list">
            {#each watched.slice(0, SHOW + 1) as w (w.id)}
              <li class:wl-hit={w.hit}><span class="hm-name"><ItemLink id={w.id} name={w.name} /></span><span class="hm-val">{#if w.a}<Money c={w.a[0]} short />{:else}<span class="faint">Not listed</span>{/if}</span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/watchlist">{watch.items.length > SHOW + 1 ? `All ${watch.items.length} watched items` : "Open your watchlist"}<Icon name="arrow" size={16} /></a>
        {/if}
      </article>

      <article class="panel hm-card">
        <div class="hm-card-head"><h3><Icon name="flips" size={20} line /><a href="/flips">Vendor flips</a></h3></div>
        {#if loading}<Loading text="Loading…" block />
        {:else if !flips.length}<p class="faint">No listings below vendor price on {marketName} right now. New ones turn up every hour.</p>
        {:else}
          <ul class="hm-list">
            {#each flips as f (f[0])}
              <li><span class="hm-name"><ItemLink id={f[0]} name={itemName(f[0])} watch /></span><span class="hm-val pct up">+<Money c={f[2]} short /></span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/flips">About <Money c={flipTotal} short /> profit in all<Icon name="arrow" size={16} /></a>
        {/if}
      </article>

      <article class="panel hm-card">
        <div class="hm-card-head"><h3><Icon name="prices" size={20} line /><a href="/prices">Selling fastest</a></h3></div>
        {#if loading}<Loading text="Loading…" block />
        {:else if !hm?.salesHours}<p class="faint">Sales on {marketName} are still being counted. Check back in an hour or two.</p>
        {:else if !sellers.length}<p class="faint">No steady sellers on {marketName} yet.</p>
        {:else}
          <ul class="hm-list">
            {#each sellers as x (x.id)}
              <li><span class="hm-name"><ItemLink id={x.id} name={itemName(x.id)} watch /> <span class="faint hm-sub"><SoldPerDay a={hm.prices[x.id]} hours={hm.salesHours} /> at <Money c={x.market} short /></span></span><span class="hm-val"><Money c={x.perDay} short /><span class="faint hm-sub">a day</span></span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/prices">Every item's price and sales<Icon name="arrow" size={16} /></a>
        {/if}
      </article>

      <article class="panel hm-card">
        <div class="hm-card-head"><h3><Icon name="crafting" size={20} line /><a href="/crafting">Best crafts that sell</a></h3></div>
        {#if loading}<Loading text="Working out profits…" block />
        {:else if !crafts.length}<p class="faint">No profitable crafts with steady sales on {marketName} right now.</p>
        {:else}
          <ul class="hm-list">
            {#each crafts as c (c.id)}
              <li><span class="hm-name"><a href={recipeUrl(c.id, c.name)}>{c.name}</a> <span class="faint hm-sub">{c.profession} · <SoldPerDay a={hm?.prices[c.item]} hours={hm?.salesHours} /></span></span><span class="hm-val pct up">+<Money c={c.profit} short /></span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/crafting">Every recipe's profit<Icon name="arrow" size={16} /></a>
        {/if}
      </article>
    </div>
  {/if}
</section>
