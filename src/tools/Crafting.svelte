<script lang="ts">
  // Craft profit calculator: every recipe of a profession with the skill it needs, where it's learned,
  // material cost (live AH prices, vendor prices as fallback), sale price, sales per day and profit
  // after the AH cut. Every column header sorts; click again to flip the order.
  // /crafting?q=Copper Bar (from an item page) searches it, in the profession that makes or uses it.
  import Freshness from "./Freshness.svelte";
  import type { Snippet } from "svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { onMount, tick } from "svelte";
  import { craftProfit } from "../lib/pricemath.js";
  import { getCachedJSON, getJSON, groupLabel, noDataMessage, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { notify } from "../lib/notify";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { addToPlan } from "../lib/plan";
  import { load, save as saveStore } from "../lib/store";
  import { levelingUrl, recipeUrl } from "../lib/urls";
  import { setupWowhead, tooltipAttrs } from "../lib/wowhead";
  import { skillLevels, skillSentence, skillSortKey, wowheadItem, wowheadSpell } from "../lib/recipeinfo";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta, type Recipes, type RecipeRow } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemIcon from "./ItemIcon.svelte";
  import SoldPerDay from "./SoldPerDay.svelte";
  import { VirtualRows } from "./virtual.svelte";
  import Icon from "./Icon.svelte";
  import { professionIcon } from "../lib/icons";

  let { children }: { children?: Snippet } = $props();

  type SortKey = "name" | "skill" | "cost" | "sell" | "sold" | "profit" | "margin";
  /** first click on a column: 1 = smallest first (A–Z, cheapest, lowest skill), -1 = biggest first */
  const FIRST_DIR: Record<SortKey, 1 | -1> = { name: 1, skill: 1, cost: 1, sell: -1, sold: -1, profit: -1, margin: -1 };
  const SORT_NAMES: Record<SortKey, string> = { name: "name", skill: "skill needed", cost: "materials cost", sell: "sale price", sold: "sold per day", profit: "profit", margin: "profit margin" };

  const CRAFT_KEY = "codex-crafting";
  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let prof = $state(""), sort = $state<SortKey>("profit"), dir = $state<1 | -1>(-1), term = $state("");
  let onlyProfit = $state(false), hideThin = $state(true);
  let open = $state<Record<number, boolean>>({});
  let added = $state<Record<number, number>>({}); // recipe id → plan size, while "✓ Added" shows
  let groups = $state<{ value: string; label: string }[]>([]);
  let recipes = $state.raw<Recipes | null>(null);
  let groupData = $state.raw<GroupPrices | null>(null);
  let ready = $state(false), emptyMsg = $state("");

  function save() {
    saveMarketPrefs({ region, group, faction });
    saveStore(CRAFT_KEY, { prof, sort, dir });
  }

  function sortBy(key: SortKey) {
    if (sort === key) dir = dir === 1 ? -1 : 1;
    else { sort = key; dir = FIRST_DIR[key]; }
    save();
    v.toTop();
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
      const made = current && r[3] ? current.house.items[r[3]] : null;
      return {
        id: r[0], name: r[1], cat: r[2], item: r[3], itemName: r[4], q: r[5], reagents: r[6], info: r[7] || null,
        skill: skillLevels(r[7]), res: craftProfit({ q: r[5], item: r[3], r: r[6] }, price),
        listed: made ? made[3] : 0, made, sold: made?.[4] ?? 0,
      };
    });
  });
  type Row = (typeof rows)[number];

  /** the value a column sorts by; null sorts last either way */
  function sortValue(r: Row, key: SortKey): number | string | null {
    switch (key) {
      case "name": return r.itemName || r.name;
      case "skill": return skillSortKey(r.info);
      case "cost": return r.res.costComplete ? r.res.cost : null;
      case "sell": return r.item ? r.res.sellAh : null;
      case "sold": return r.item && current?.house.salesHours ? r.sold : null;
      case "profit": return r.res.profit;
      case "margin": return r.res.margin;
    }
  }

  const list = $derived.by(() => {
    const t = term.toLowerCase().trim();
    const hits = rows.filter((r) => {
      if (onlyProfit && !(r.res.profit! > 0)) return false;
      if (hideThin && r.item && r.listed < 3) return false;
      return !t || r.name.toLowerCase().includes(t) || (r.itemName || "").toLowerCase().includes(t) || r.reagents.some((x) => (x[2] || "").toLowerCase().includes(t));
    });
    return hits.sort((a, b) => {
      const x = sortValue(a, sort), y = sortValue(b, sort);
      if (x == null || y == null) return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : -1;
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return c ? c * dir : a.name.localeCompare(b.name);
    });
  });
  // only the rows near the screen are in the page; the rest are spacer height (see virtual.svelte.ts)
  const v = new VirtualRows(() => list, (r) => r.id, 64);
  const status = $derived(ready ? "Showing " + v.shown + " of " + list.length + (list.length === 1 ? " recipe" : " recipes") : "Loading recipes and prices…");
  const salesHours = $derived(current?.house.salesHours);

  /** name of a recipe item (pattern, plans, formula…) */
  const itemNameOf = (id: number) => itemSource.items[id]?.[0] || null;

  async function loadRegion() {
    ready = false;
    const [meta, items, rec] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region)), getCachedJSON<Recipes>(priceUrl("recipes", region)),
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
    notify("Added to your crafting plan");
    setTimeout(() => delete added[id], 3000);
  }

  onMount(() => {
    const p = getMarketPrefs(), c = load<{ prof?: string; sort?: string; dir?: number }>(CRAFT_KEY) || {};
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    prof = c.prof || "";
    sort = c.sort && c.sort in FIRST_DIR ? (c.sort as SortKey) : "profit";
    dir = c.dir === 1 || c.dir === -1 ? c.dir : FIRST_DIR[sort];
    loadRegion();
  });

  let timer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const text = status;
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => announce(text), 600);
  });
  $effect(() => {
    v.slice; open; // rows scrolled into the page need their Wowhead tooltips too
    if (ready) tick().then(setupWowhead);
  });
</script>

{#snippet head(key: SortKey, label: string, cls = "")}
  <th scope="col" class={cls} aria-sort={sort === key ? (dir === 1 ? "ascending" : "descending") : "none"}>
    <button type="button" class="th-sort" class:active={sort === key} onclick={() => sortBy(key)}>{label}<span class="th-arrow" aria-hidden="true">{sort === key ? (dir === 1 ? "▲" : "▼") : "↕"}</span><span class="sr-only">, sort by {SORT_NAMES[key]}</span></button>
  </th>
{/snippet}

{#snippet whLink(href: string, text: string)}<a class="wh" {href} target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">{text}</a>{/snippet}

<div class="wrap section" hidden={!emptyMsg}><div class="panel"><h2>No data yet</h2><p>{emptyMsg}</p></div></div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="cr" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <fieldset class="chip-group cr-profs">
      <legend>Profession</legend>
      <div class="chips">
        {#each profs as p (p.id)}
          {@const pi = professionIcon(p.id)}
          <label class="chip" title="{p.recipes.length} recipes"><input type="radio" name="cr-prof" value={String(p.id)} checked={String(p.id) === String(prof)} onchange={() => { prof = String(p.id); open = {}; save(); v.toTop(); }} /><span>{#if pi}<Icon name={pi} size={22} />{/if}{p.name}<span class="sr-only"> ({p.recipes.length} recipes)</span></span></label>
        {/each}
      </div>
    </fieldset>
    {#if profession && ![182, 186, 356, 393].includes(Number(profession.id))}<p class="cross-link cr-level"><a href={levelingUrl(profession.name)}>Leveling {profession.name}? See the cheapest route to 300 at today's prices</a>, with one shopping list.</p>{/if}
    <div class="control-row cr-row">
    <div><label class="field-label" for="cr-sort">Sort by</label>
      <div class="cr-sort">
      <select class="input" id="cr-sort" onchange={(e) => { sort = e.currentTarget.value as SortKey; dir = FIRST_DIR[sort]; save(); v.toTop(); }}>
        <option value="profit" selected={sort === "profit"}>Profit</option><option value="margin" selected={sort === "margin"}>Profit margin</option><option value="cost" selected={sort === "cost"}>Cheapest to make</option>
        <option value="sold" selected={sort === "sold"}>Sold per day</option><option value="skill" selected={sort === "skill"}>Skill needed</option><option value="sell" selected={sort === "sell"}>Sale price</option><option value="name" selected={sort === "name"}>Name</option>
      </select>
      <button type="button" class="btn btn-ghost cr-dir" onclick={() => { dir = dir === 1 ? -1 : 1; save(); v.toTop(); }}><span aria-hidden="true" class="cr-dir-arrow">{dir === 1 ? "↑" : "↓"}</span>{dir === 1 ? (sort === "name" ? "A to Z" : "Lowest first") : (sort === "name" ? "Z to A" : "Highest first")}<span class="sr-only">, click to reverse the order</span></button>
      </div></div>
    <div class="cr-search"><label class="field-label" for="cr-search">Find a recipe or material</label>
      <input class="input" type="search" id="cr-search" placeholder="e.g. Bolt of Linen, Copper" autocomplete="off" bind:value={term} oninput={() => v.toTop()} /></div>
    </div>
    <fieldset class="chip-group cr-filters">
      <legend>Filters</legend>
      <div class="chips">
        <label class="chip"><input type="checkbox" id="cr-profitable" bind:checked={onlyProfit} /><span>Only profitable</span></label>
        <label class="chip" title="Hides items with fewer than 3 on the auction house, where the asking price is unreliable"><input type="checkbox" id="cr-hidethin" bind:checked={hideThin} /><span>Hide thin markets <span class="chip-note">(under 3 listed)</span></span></label>
      </div>
    </fieldset>
  </div>

  <Freshness {region} updated={groupData?.updated} />
  <div class="section-head">
    <p class="faint" style="margin:0">{#if ready && groupData}{profession?.name || ""}: {rows.length} recipes{/if}</p>
    <p class="faint" style="margin:0">{#if ready}{status}{:else if !emptyMsg}<Loading text="Loading recipes and prices…" />{/if}</p>
  </div>
  <p class="faint cr-legend"><span class="cr-legend-sort">Click a column heading to sort by it, again to flip the order.</span>{" "}Skill: <span class="sk sk-o">needed</span> <span class="sk sk-y">yellow</span> <span class="sk sk-g">green</span> <span class="sk sk-x">grey</span>: the skill to learn it, then where it gets less likely to give skill points. "≤" means the trainer sets the exact skill, at most that.</p>
  <div class="table-wrap">
    <table class="prices crafting">
      <caption class="sr-only">Recipes with skill needed, material cost, sale price, sales per day and profit. Column headings sort the table.</caption>
      <thead><tr>
        {@render head("name", "Recipe")}{@render head("skill", "Skill")}{@render head("cost", "Materials")}{@render head("sell", "Sells for")}{@render head("sold", "Sold/day")}{@render head("profit", "Profit")}{@render head("margin", "Margin")}
        <th scope="col"><span class="sr-only">Recipe details</span></th>
      </tr></thead>
      <tbody class="v-body" bind:this={v.body}>
        {#if !ready}{#if !emptyMsg}<SkeletonRows cols={8} />{/if}{:else}
          {#if v.padTop}<tr class="v-pad" aria-hidden="true"><td colspan="8" style:height="{v.padTop}px"></td></tr>{/if}
          {#each v.slice as r (r.id)}
            {@const res = r.res}
            {@const sk = r.skill}
            {@const teach = r.info && r.info[3] === "item" ? r.info[4] : 0}
            <tr {@attach v.measure(r.id)}>
              <th scope="row">
                {#if !r.item}<a class="item-link" href={recipeUrl(r.id, r.name)}><ItemIcon id={null} />{r.name}</a> <span class="tag">enchant</span>{:else}<a class="item-link" href={recipeUrl(r.id, r.name)} {...tooltipAttrs(r.item)}><ItemIcon id={r.item} />{r.itemName || itemSource.items[r.item]?.[0] || r.name}</a>{#if r.q > 1}{" "}<span class="faint">×{r.q}</span>{/if}{/if}
                <span class="cat">{r.cat}{#if r.info}{" · "}{#if r.info[3] === "auto"}learned with {profession?.name}{:else if teach}from {@render whLink(wowheadItem(teach), itemNameOf(teach) || "a recipe item")}{:else}{@render whLink(wowheadSpell(r.info[5]), "trainer")}{/if}{/if}</span>
              </th>
              <td class="cr-skill" data-label="Skill">{#if sk}<span title={skillSentence(sk, profession?.name || "")}><span class="sk sk-o">{sk.req != null ? sk.req : "≤" + sk.yellow}</span> <span class="sk sk-y">{sk.yellow}</span> <span class="sk sk-g">{sk.green}</span> <span class="sk sk-x">{sk.grey}</span></span>{:else}<span class="faint">-</span>{/if}</td>
              <td data-label="Materials">{#if res.costComplete}<Money c={res.cost} />{:else}<span class="faint" title="A material has no price">?</span>{/if}</td>
              <td data-label="Sells for">{#if r.item}<Money c={res.sellAh} />{#if res.sellAh != null}<span class="cat">{r.listed} listed{#if r.listed < 3}{" · "}<span class="thin" title="Very few on sale, so this asking price may not be what it really sells for">⚠ thin market</span>{/if}</span>{/if}{:else}<span class="faint">-</span>{/if}</td>
              <td class="cr-opt" data-label="Sold/day">{#if r.item}<SoldPerDay a={r.made} hours={salesHours} suffix="" />{:else}<span class="faint">-</span>{/if}</td>
              <td data-label="Profit">{#if res.profit == null}<span class="faint">-</span>{:else}<span class="pct {res.profit >= 0 ? 'up' : 'down'}">{res.profit < 0 ? "−" : "+"}</span> <Money c={Math.abs(res.profit)} />{/if}</td>
              <td class="cr-opt" data-label="Margin">{#if res.margin != null}{res.margin}%{:else}<span class="faint">-</span>{/if}</td>
              <td class="cr-actions"><button type="button" class="btn btn-ghost btn-sm cr-toggle" data-id={r.id} aria-expanded={!!open[r.id]} onclick={(e) => { open[r.id] = !open[r.id]; e.currentTarget.focus(); }}>Recipe<span class="sr-only">{" details for " + r.name}</span></button><button type="button" class="btn btn-sm plan-add" data-recipe={r.id} title="Add to my crafting plan" onclick={() => plan(r.id)}>{#if added[r.id]}✓ Added<span class="sr-only">{" (" + added[r.id] + " in your plan)"}</span>{:else}+ Plan<span class="sr-only">{" " + r.name}</span>{/if}</button></td>
            </tr>
            {#if open[r.id]}
              <tr class="cr-detail" {@attach v.measure(r.id)}><td colspan="8">
                <div class="cr-detail-grid">
                  <div>
                    <h3 class="mini-head">Materials{#if r.q > 1}{" "}<span class="faint">(makes {r.q})</span>{/if}</h3>
                    <ul class="mats">
                      {#each r.reagents as x, i}
                        {@const p = res.parts[i]}
                        <!-- our icon sits outside the Wowhead link, which is told not to add its own -->
                        <li><b>{x[1]}×</b> <ItemIcon id={x[0]} /><a class="wh item-link" href={wowheadItem(x[0])} target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">{x[2]}</a>: {#if p.unit != null}<Money c={p.unit} /> each = <Money c={p.unit * x[1]} />{:else}?{/if} <span class="faint">({p.source === "ah" ? "Auction House" : p.source === "vendor" ? "vendor price (estimate, check a vendor sells it)" : "no price found"})</span></li>
                      {/each}
                    </ul>
                  </div>
                  <div>
                    <h3 class="mini-head">How to learn it</h3>
                    {#if !r.info}<p class="faint">We don't have details for this recipe yet. {@render whLink(wowheadSpell(r.id), "Look it up on Wowhead")}.</p>
                    {:else if r.info[3] === "auto"}<p>Learned automatically when you pick up {profession?.name}.</p>
                    {:else if teach}
                      {@const onAh = current?.house.items[teach]}
                      <p>From <ItemIcon id={teach} />{@render whLink(wowheadItem(teach), itemNameOf(teach) || "a recipe item")}{#if sk?.req != null}, which needs {profession?.name} {sk.req}{/if}. Wowhead shows where it drops and who sells it.
                        {#if onAh}<br />On this auction house now from <Money c={onAh[0]} /> ({onAh[2]} for sale{#if salesHours}, <SoldPerDay a={onAh} hours={salesHours} suffix=" sold per day" />{/if}).{/if}</p>
                    {:else}<p>Taught by {profession?.name} trainers once your skill is high enough{#if sk}{" (at most " + sk.yellow + ")"}{/if}. {@render whLink(wowheadSpell(r.info[5]), "See which trainers on Wowhead")}.</p>{/if}
                    {#if sk}<p class="faint">{skillSentence(sk, profession?.name || "")}</p>{/if}
                    {#if r.info}<p>{@render whLink(wowheadSpell(r.info[5]), "This recipe on Wowhead")} · <a href={recipeUrl(r.id, r.name)}>Recipe page with every auction house</a></p>{/if}
                  </div>
                </div>
                <p class="faint">Sells on the AH for <Money c={res.sellAh} />{#if res.sellVendor}, to a vendor for <Money c={res.sellVendor} />{/if}. Profit = AH price minus the 5% AH cut minus materials. It ignores deposits, whether it sells, and your time.</p>
              </td></tr>
            {/if}
          {:else}
            <tr><td colspan="8" class="empty">No recipes match.</td></tr>
          {/each}
          {#if v.padBottom}<tr class="v-pad" aria-hidden="true"><td colspan="8" style:height="{v.padBottom}px"></td></tr>{/if}
        {/if}
      </tbody>
    </table>
  </div>
  <p class="v-more" hidden={!v.hasMore}><button type="button" class="btn btn-ghost" onclick={() => v.loadMore()}>Load 50 more recipes</button></p>

  {@render children?.()}
</div>
