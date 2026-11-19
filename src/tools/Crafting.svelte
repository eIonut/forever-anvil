<script lang="ts">
  // Craft profit calculator: every recipe of a profession with material cost (live AH prices,
  // vendor prices as fallback), sale price and profit after the AH cut.
  // /crafting?q=Copper Bar (from an item page) searches it, in the profession that makes or uses it.
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import { craftProfit } from "../lib/pricemath.js";
  import { getJSON, groupLabel, localTime, noDataMessage, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { addToPlan } from "../lib/plan";
  import { load, save as saveStore } from "../lib/store";
  import { recipeUrl } from "../lib/urls";
  import { setupWowhead, tooltipAttrs } from "../lib/wowhead";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta, type Recipes, type RecipeRow } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemIcon from "./ItemIcon.svelte";

  let { children }: { children?: Snippet } = $props();

  const CRAFT_KEY = "codex-crafting";
  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let prof = $state(""), sort = $state("profit"), shown = $state(100), term = $state("");
  let onlyProfit = $state(false), hideThin = $state(true);
  let open = $state<Record<number, boolean>>({});
  let added = $state<Record<number, number>>({}); // recipe id → plan size, while "✓ Added" shows
  let groups = $state<{ value: string; label: string }[]>([]);
  let recipes = $state.raw<Recipes | null>(null);
  let groupData = $state.raw<GroupPrices | null>(null);
  let ready = $state(false), emptyMsg = $state("");

  function save() {
    saveMarketPrefs({ region, group, faction });
    saveStore(CRAFT_KEY, { prof, sort });
  }

  const profs = $derived((recipes?.professions || []).filter((p) => p.recipes.some((r) => r[6].length)));
  const current = $derived(houseOf(groupData, faction));
  const profession = $derived(profs.find((p) => String(p.id) === String(prof)));
  const rows = $derived.by(() => {
    const houseItems = current?.house.items || {};
    const items = itemSource.items;
    const price = (id: number | string) => {
      const a = houseItems[id], it = items[id] || [];
      return { ah: a ? a[1] : null, vendor: it[3] ? it[3] : null, sell: it[1] ? it[1] : null };
    };
    return (profession?.recipes || []).filter((r) => r[6].length).map((r: RecipeRow) => {
      const sold = current && r[3] ? current.house.items[r[3]] : null;
      return { id: r[0], name: r[1], cat: r[2], item: r[3], itemName: r[4], q: r[5], reagents: r[6], res: craftProfit({ q: r[5], item: r[3], r: r[6] }, price), listed: sold ? sold[3] : 0 };
    });
  });
  const list = $derived.by(() => {
    const t = term.toLowerCase().trim();
    const hits = rows.filter((r) => {
      if (onlyProfit && !(r.res.profit! > 0)) return false;
      if (hideThin && r.item && r.listed < 3) return false;
      return !t || r.name.toLowerCase().includes(t) || (r.itemName || "").toLowerCase().includes(t) || r.reagents.some((x) => (x[2] || "").toLowerCase().includes(t));
    });
    return hits.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "margin") return (b.res.margin == null ? -1e9 : b.res.margin) - (a.res.margin == null ? -1e9 : a.res.margin);
      if (sort === "cost") return (a.res.costComplete ? a.res.cost : 1e12) - (b.res.costComplete ? b.res.cost : 1e12);
      return (b.res.profit == null ? -1e12 : b.res.profit) - (a.res.profit == null ? -1e12 : a.res.profit);
    });
  });
  const page = $derived(list.slice(0, shown));
  const status = $derived(ready ? "Showing " + Math.min(shown, list.length) + " of " + list.length + " recipes" : "Loading recipes and prices…");

  async function loadRegion() {
    ready = false;
    const [meta, items, rec] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)), getJSON<Record<string, ItemInfo>>(priceUrl("items", region)), getJSON<Recipes>(priceUrl("recipes", region)),
    ]);
    useItems(region, items);
    if (!meta?.groups?.length || !rec) {
      emptyMsg = noDataMessage("The craft calculator is temporarily unavailable.", "No recipe/price data on this computer yet. Run `npm run prices`, then reload.");
      return;
    }
    emptyMsg = "";
    recipes = rec;
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta.rulesets, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
    if (!profs.some((p) => String(p.id) === String(prof))) prof = String(profs[0].id);
    const deepQ = new URLSearchParams(location.search).get("q");
    if (deepQ && !term) {
      term = deepQ;
      const lower = deepQ.toLowerCase();
      const hit = profs.find((p) => p.recipes.some((r) => (r[4] || r[1] || "").toLowerCase() === lower))
        || profs.find((p) => p.recipes.some((r) => r[6].some((m) => (m[2] || "").toLowerCase() === lower)));
      if (hit) prof = String(hit.id);
      hideThin = false; // show every match when arriving from an item page
    }
    await loadGroup();
  }

  async function loadGroup() {
    const g = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    groupData = g;
    if (g?.ruleset) groups = groups.map((o) => (o.value === g.group ? { ...o, label: g.ruleset! } : o));
    ready = true;
  }

  function plan(id: number) {
    added[id] = addToPlan(id, 1);
    announce("Added to your crafting plan");
    setTimeout(() => delete added[id], 3000);
  }

  onMount(() => {
    const p = getMarketPrefs(), c = load<{ prof?: string; sort?: string }>(CRAFT_KEY) || {};
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    prof = c.prof || ""; sort = c.sort || "profit";
    loadRegion();
  });

  let timer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const text = status;
    page; open;
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => announce(text), 600);
    tick().then(setupWowhead);
  });
</script>

<div class="wrap section" hidden={!emptyMsg}><div class="panel"><h2>No data yet</h2><p>{emptyMsg}</p></div></div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="cr" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <div class="control-row cr-row">
    <div><label class="field-label" for="cr-prof">Profession</label>
      <select class="input" id="cr-prof" onchange={(e) => { prof = e.currentTarget.value; shown = 100; open = {}; save(); }}>
        {#each profs as p (p.id)}<option value={String(p.id)} selected={String(p.id) === String(prof)}>{p.name} ({p.recipes.length} recipes)</option>{/each}
      </select></div>
    <div><label class="field-label" for="cr-sort">Sort by</label>
      <select class="input" id="cr-sort" onchange={(e) => { sort = e.currentTarget.value; save(); }}>
        <option value="profit" selected={sort === "profit"}>Profit</option><option value="margin" selected={sort === "margin"}>Profit margin</option><option value="cost" selected={sort === "cost"}>Cheapest to make</option><option value="name" selected={sort === "name"}>Name</option>
      </select></div>
    <div class="pr-search"><label class="field-label" for="cr-search">Find a recipe or material</label>
      <input class="input" type="search" id="cr-search" placeholder="e.g. Bolt of Linen, Copper" autocomplete="off" bind:value={term} oninput={() => (shown = 100)} /></div>
    </div>
    <div class="control-checks">
      <label class="cr-check"><input type="checkbox" id="cr-profitable" bind:checked={onlyProfit} /> Only profitable recipes</label>
      <label class="cr-check"><input type="checkbox" id="cr-hidethin" bind:checked={hideThin} /> Hide thin markets (fewer than 3 listed)</label>
    </div>
  </div>

  <div class="section-head" style="margin-top:18px">
    <p class="faint" style="margin:0">{#if ready && groupData}Prices from {localTime(groupData.updated)} · {profession?.name || ""}: {rows.length} recipes{/if}</p>
    <p class="faint" style="margin:0">{status}</p>
  </div>
  <div class="table-wrap">
    <table class="prices crafting">
      <caption class="sr-only">Recipes with material cost, sale price and profit</caption>
      <thead><tr><th scope="col">Recipe</th><th scope="col">Materials cost</th><th scope="col">Sells for (AH)</th><th scope="col">Profit</th><th scope="col" class="col-hide-sm">Margin</th><th scope="col"><span class="sr-only">Materials</span></th></tr></thead>
      <tbody>
        {#if ready}
          {#each page as r (r.id)}
            {@const res = r.res}
            <tr>
              <th scope="row">
                {#if !r.item}<a class="item-link" href={recipeUrl(r.id, r.name)}><ItemIcon id={null} />{r.name}</a> <span class="tag">enchant</span>{:else}<a class="item-link" href={recipeUrl(r.id, r.name)} {...tooltipAttrs(r.item)}><ItemIcon id={r.item} />{r.itemName || itemSource.items[r.item]?.[0] || r.name}</a>{#if r.q > 1}{" "}<span class="faint">×{r.q}</span>{/if}{/if}<span class="cat">{r.cat}</span>
              </th>
              <td>{#if res.costComplete}<Money c={res.cost} />{:else}<span class="faint" title="A material has no price">?</span>{/if}</td>
              <td>{#if r.item}<Money c={res.sellAh} />{#if res.sellAh != null}<span class="cat">{r.listed} listed{#if r.listed < 3}{" · "}<span class="thin" title="Very few on sale, so this asking price may not be what it really sells for">⚠ thin market</span>{/if}</span>{/if}{:else}<span class="faint">—</span>{/if}</td>
              <td>{#if res.profit == null}<span class="faint">—</span>{:else}<span class="pct {res.profit >= 0 ? 'up' : 'down'}">{res.profit < 0 ? "−" : "+"}</span> <Money c={Math.abs(res.profit)} />{/if}</td>
              <td class="col-hide-sm">{#if res.margin != null}{res.margin}%{:else}<span class="faint">—</span>{/if}</td>
              <td class="cr-actions"><button type="button" class="btn btn-ghost btn-sm cr-toggle" data-id={r.id} aria-expanded={!!open[r.id]} onclick={(e) => { open[r.id] = !open[r.id]; e.currentTarget.focus(); }}>Materials<span class="sr-only">{" for " + r.name}</span></button><button type="button" class="btn btn-sm plan-add" data-recipe={r.id} title="Add to my crafting plan" onclick={() => plan(r.id)}>{#if added[r.id]}✓ Added ({added[r.id]} in plan){:else}+ Plan<span class="sr-only">{" " + r.name}</span>{/if}</button></td>
            </tr>
            {#if open[r.id]}
              <tr class="cr-detail"><td colspan="6">
                <ul class="mats">
                  {#each r.reagents as x, i}
                    {@const p = res.parts[i]}
                    <!-- our icon sits outside the Wowhead link, which is told not to add its own -->
                    <li><b>{x[1]}×</b> <ItemIcon id={x[0]} /><a class="wh item-link" href="https://www.wowhead.com/forever/item={x[0]}" target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">{x[2]}</a> — {#if p.unit != null}<Money c={p.unit} /> each = <Money c={p.unit * x[1]} />{:else}?{/if} <span class="faint">({p.source === "ah" ? "Auction House" : p.source === "vendor" ? "vendor price (estimate — check a vendor sells it)" : "no price found"})</span></li>
                  {/each}
                </ul>
                <p class="faint">Sells on the AH for <Money c={res.sellAh} />{#if res.sellVendor}, to a vendor for <Money c={res.sellVendor} />{/if}. Profit = AH price minus the 5% AH cut minus materials. It ignores deposits, whether it sells, and your time.</p>
              </td></tr>
            {/if}
          {:else}
            <tr><td colspan="6" class="empty">No recipes match.</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <p style="text-align:center;margin-top:14px"><button type="button" class="btn btn-ghost" hidden={list.length <= shown} onclick={() => (shown += 100)}>Show 100 more</button></p>

  {@render children?.()}
</div>
