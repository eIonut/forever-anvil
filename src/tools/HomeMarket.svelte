<script lang="ts">
  // Home page: "your market right now". For the visitor's chosen auction house (the same choice every
  // price tool remembers): their watchlist, this hour's vendor flips, what's selling fastest, and the
  // best crafts that actually sell. Each card links to the full tool.
  // The recipes file is only fetched after the rest has shown, so the first cards appear quickly.
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
  import { bestCrafts, hitMessages, targetHits, topSellers } from "../lib/watchmath.js";
  import { autoRefresh } from "../lib/autorefresh";
  import { moneyText } from "../lib/format";
  import { notify } from "../lib/notify";
  import { useItems, itemName, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta, type Recipes } from "./types";
  import { watch } from "./watch.svelte";

  const SHOW = 5;

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let groupData = $state.raw<GroupPrices | null>(null);
  let recipes = $state.raw<Recipes | null | undefined>(undefined);
  let loading = $state(true), failed = $state(false), started = $state(false);

  const save = () => saveMarketPrefs({ region, group, faction });
  const current = $derived(houseOf(groupData, faction));
  const marketName = $derived((groups.find((g) => g.value === group)?.label.split(" · ")[0] || "") + " " + (FACTIONS[faction] || ""));

  const watched = $derived.by(() => {
    const items = current?.house.items || {};
    return watch.items.map((w) => {
      const a = items[w.id] || null;
      return { ...w, name: itemName(w.id) || w.name || null, a, hit: !!(w.below && a && a[0] <= w.below) };
    }).sort((x, y) => Number(y.hit) - Number(x.hit)); // targets reached first
  });
  const hits = $derived(watched.filter((w) => w.hit).length);
  const flips = $derived((current?.house.flips || []).slice(0, SHOW));
  const flipTotal = $derived((current?.house.flips || []).reduce((s, f) => s + f[2], 0));
  const sellers = $derived(current ? topSellers(current.house.items, SHOW) : []);
  const crafts = $derived(current && recipes ? bestCrafts(recipes.professions, current.house.items, itemSource.items, { top: SHOW, salesHours: current.house.salesHours || 0 }) : []);

  async function loadRegion() {
    loading = true;
    const [meta, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
    if (!meta?.groups?.length) { failed = true; loading = false; return; }
    failed = false;
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta.rulesets, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
    await loadGroup();
    if (recipes === undefined) recipes = await getCachedJSON<Recipes>(priceUrl("recipes", region));
  }

  async function loadGroup() {
    loading = true;
    const g = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    groupData = g;
    failed = !g;
    loading = false;
    if (g?.ruleset) groups = groups.map((o) => (o.value === g.group ? { ...o, label: g.ruleset! } : o));
  }

  /**
   * While the page stays open (src/lib/autorefresh.ts): fetch this hour's prices again; when they're new,
   * every card updates and the visitor hears which watched items have just reached their target.
   */
  async function refreshPrices() {
    if (!groupData || failed) return;
    const r = region, gName = group;
    const g = await getJSON<GroupPrices>(priceUrl("prices", r, gName));
    if (!g || r !== region || gName !== group || g.updated === groupData?.updated) return;
    const before = new Set(targetHits(watch.items, current?.house.items));
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
        {#if !started || (loading && watch.items.length)}<Loading text="Loading…" block />
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
        {:else if !current?.house.salesHours}<p class="faint">Sales on {marketName} are still being counted. Check back in an hour or two.</p>
        {:else if !sellers.length}<p class="faint">No steady sellers on {marketName} yet.</p>
        {:else}
          <ul class="hm-list">
            {#each sellers as x (x.id)}
              <li><span class="hm-name"><ItemLink id={x.id} name={itemName(x.id)} watch /> <span class="faint hm-sub"><SoldPerDay a={current.house.items[x.id]} hours={current.house.salesHours} /> at <Money c={x.market} short /></span></span><span class="hm-val"><Money c={x.perDay} short /><span class="faint hm-sub">a day</span></span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/prices">Every item's price and sales<Icon name="arrow" size={16} /></a>
        {/if}
      </article>

      <article class="panel hm-card">
        <div class="hm-card-head"><h3><Icon name="crafting" size={20} line /><a href="/crafting">Best crafts that sell</a></h3></div>
        {#if loading || recipes === undefined}<Loading text="Working out profits…" block />
        {:else if !crafts.length}<p class="faint">No profitable crafts with steady sales on {marketName} right now.</p>
        {:else}
          <ul class="hm-list">
            {#each crafts as c (c.recipe[0])}
              <li><span class="hm-name"><a href={recipeUrl(c.recipe[0], c.recipe[1])}>{c.recipe[1]}</a> <span class="faint hm-sub">{c.profession} · <SoldPerDay a={current?.house.items[c.recipe[3]!]} hours={current?.house.salesHours} /></span></span><span class="hm-val pct up">+<Money c={c.profit} short /></span></li>
            {/each}
          </ul>
          <a class="hm-more" href="/crafting">Every recipe's profit<Icon name="arrow" size={16} /></a>
        {/if}
      </article>
    </div>
  {/if}
</section>
