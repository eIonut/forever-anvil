<script lang="ts">
  // Crafting planner: pick recipes and how many times to craft them, get one combined shopping list
  // with live AH and vendor prices. The plan is saved in the browser (src/lib/plan.ts).
  import Freshness from "./Freshness.svelte";
  import type { Snippet } from "svelte";
  import Loading from "./Loading.svelte";
  import { onMount, tick } from "svelte";
  import { planShoppingList } from "../lib/pricemath.js";
  import { shoppingString } from "../lib/addonstring.js";
  import { copyText, getCachedJSON, getJSON, groupLabel, priceUrl } from "../lib/api";
  import { notify } from "../lib/notify";
  import { askConfirm } from "../lib/dialog";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { addToPlan, getPlan, setPlan, type Plan } from "../lib/plan";
  import { recipeUrl } from "../lib/urls";
  import { setupWowhead, tooltipAttrs } from "../lib/wowhead";
  import { useItems, itemName, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import { houseOf, type GroupPrices, type Meta, type Recipes } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemIcon from "./ItemIcon.svelte";
  import ItemLink from "./ItemLink.svelte";

  let { sidebar }: { sidebar?: Snippet } = $props();

  interface PlanRecipe { id: number; name: string; prof: string; item: number | null; itemName: string | null; q: number; r: [number, number, string][] }

  let region = $state("eu"), group = $state(""), faction = $state("alliance");
  let groups = $state<{ value: string; label: string }[]>([]);
  let byId = $state.raw<Record<string, PlanRecipe>>({});
  let groupData = $state.raw<GroupPrices | null>(null);
  let plan = $state.raw<Plan>({ list: [], have: {} });
  let empty = $state(false), ready = $state(false);
  let search = $state(""), copyLabel = $state("Copy shopping list");
  let addBox: HTMLInputElement;

  const save = () => saveMarketPrefs({ region, group, faction });
  const update = (p: Plan) => { setPlan(p); plan = getPlan(); };

  const price = $derived.by(() => {
    const hi = houseOf(groupData, faction)?.house.items || {};
    const items = itemSource.items;
    return (id: number | string) => { const a = hi[id], it = items[id] || []; return { ah: a ? a[1] : null, vendor: it[3] || null, sell: it[1] || null }; };
  });
  const rows = $derived(plan.list.filter((x) => byId[x.r]).map((x) => ({ recipe: byId[x.r], crafts: x.n })));
  const res = $derived(planShoppingList(rows.map((x) => ({ recipe: x.recipe, crafts: x.crafts })), plan.have, price));
  const mats = $derived(res.mats.slice().sort((a, b) => (b.cost || 0) - (a.cost || 0)));
  const toBuy = $derived(mats.filter((m) => m.buy > 0));
  const hits = $derived.by(() => {
    const t = search.toLowerCase().trim();
    if (t.length < 2) return null;
    return Object.values(byId).filter((r) => r.name.toLowerCase().includes(t) || (r.itemName || "").toLowerCase().includes(t)).slice(0, 8);
  });

  async function load() {
    const [meta, items, recipes] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region)), getCachedJSON<Recipes>(priceUrl("recipes", region)),
    ]);
    useItems(region, items);
    if (!meta || !recipes) { empty = true; return; }
    const map: Record<string, PlanRecipe> = {};
    for (const p of recipes.professions) for (const x of p.recipes) {
      if (x[6].length) map[x[0]] = { id: x[0], name: x[1], prof: p.name, item: x[3], itemName: x[4], q: x[5], r: x[6] };
    }
    byId = map;
    groups = (meta.groups || []).map((g) => ({ value: g, label: groupLabel(meta, g) }));
    if (!(meta.groups || []).includes(group)) group = meta.groups![0];
    await loadGroup();
  }
  async function loadGroup() {
    groupData = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    ready = true;
  }

  function pick(id: number) {
    addToPlan(id, 1);
    plan = getPlan();
    search = "";
    addBox.focus();
    notify("Recipe added");
  }
  // number boxes: keep the value in range, and show the corrected number
  function setCrafts(id: number, input: HTMLInputElement) {
    const p = getPlan(), n = Math.max(1, Math.min(999, parseInt(input.value, 10) || 1));
    for (const x of p.list) if (x.r === id) x.n = n;
    update(p);
    input.value = String(n);
  }
  function remove(id: number) {
    const p = getPlan();
    p.list = p.list.filter((x) => x.r !== id);
    update(p);
    notify("Recipe removed", "info");
    addBox.focus();
  }
  function setHave(id: number, input: HTMLInputElement) {
    const p = getPlan(), v = Math.max(0, parseInt(input.value, 10) || 0);
    if (v) p.have[id] = v; else delete p.have[id];
    update(p);
    input.value = String(res.mats.find((m) => m.id === id)?.have ?? v); // capped at what's needed
  }
  async function clear() {
    const ok = await askConfirm({
      title: "Clear your crafting plan?",
      message: "This removes every recipe and the materials you said you have. It can't be undone.",
      confirmLabel: "Clear plan", danger: true,
    });
    if (!ok) return;
    update({ list: [], have: {} });
    notify("Plan cleared", "info");
  }
  async function copy() {
    const lines = toBuy.map((m) => m.buy + "x " + (itemName(m.id) || "Item #" + m.id) + (m.source === "vendor" ? " (vendor)" : ""));
    if (await copyText("Shopping list (Forever Anvil):\n" + lines.join("\n"), "Copy this list:")) {
      notify("Shopping list copied");
      copyLabel = "Copied!";
      setTimeout(() => (copyLabel = "Copy shopping list"), 2500);
    }
  }

  // every material the plan needs (not just what's left to buy): the addon counts what's in your bags and bank
  async function copyForAddon() {
    if (await copyText(shoppingString(mats), "Copy this, then type /fa import in game and paste it:")) {
      notify("Copied: in game, type /fa import and paste it");
    }
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "alliance";
    plan = getPlan();
    load();
  });

  $effect(() => { rows; mats; if (ready) tick().then(setupWowhead); });
</script>

<div class="wrap section" hidden={!empty}><div class="panel"><h2>No data yet</h2><p>Run <code>npm run prices</code>, then reload this page.</p></div></div>

<div class="wrap section" hidden={empty}>
  <div class="panel controls">
    <MarketSelects prefix="pl" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); load(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
  </div>

  <div class="layout-side" style="margin-top:18px">
    <div class="grid">
      <section class="panel" aria-labelledby="pl-rec-title">
        <div class="section-head"><h2 id="pl-rec-title">What you'll craft</h2><button type="button" class="btn btn-ghost btn-sm" onclick={clear}>Clear plan</button></div>
        <div class="pl-search">
          <label class="field-label" for="pl-add">Add a recipe</label>
          <input class="input" id="pl-add" type="search" placeholder="Type a recipe or item, e.g. Linen" autocomplete="off" aria-controls="pl-suggest" bind:value={search} bind:this={addBox} />
          <ul class="pl-suggest" id="pl-suggest" aria-live="polite">
            {#if hits}
              {#each hits as r (r.id)}<li><button type="button" class="pl-pick" onclick={() => pick(r.id)}><ItemIcon id={r.item} />{r.name} <span class="faint">{r.prof}</span></button></li>
              {:else}<li class="faint" style="padding:8px">No recipe matches.</li>{/each}
            {/if}
          </ul>
        </div>
        <ul class="pl-list">
          {#if !ready}{#if !empty}<li class="empty"><Loading text="Loading your plan…" /></li>{/if}{:else}
            {#each rows as x (x.recipe.id)}
              {@const r = x.recipe}
              <li><div class="pl-rec"><a href={recipeUrl(r.id, r.name)} {...tooltipAttrs(r.item)}><ItemIcon id={r.item} />{r.name}</a> <span class="faint">{r.prof}</span></div>
                <label class="pl-qty"><span class="sr-only">Times to craft {r.name}</span><input class="input" type="number" min="1" max="999" value={x.crafts} onchange={(e) => setCrafts(r.id, e.currentTarget)} /></label>
                <button type="button" class="icon-btn pl-remove" onclick={() => remove(r.id)}><span aria-hidden="true">×</span><span class="sr-only">Remove {r.name}</span></button></li>
            {:else}
              <li class="empty">Your plan is empty. Add recipes with the search box above, or with "+ Add to my crafting plan" on any recipe page.</li>
            {/each}
          {/if}
        </ul>
      </section>

      <section class="panel" aria-labelledby="pl-mat-title">
        <div class="section-head"><h2 id="pl-mat-title">Shopping list</h2><div class="pl-copy"><button type="button" class="btn btn-ghost btn-sm" hidden={!mats.length} onclick={copyForAddon} title="For the Forever Anvil addon: type /fa import in game and paste it">Copy for the addon</button><button type="button" class="btn btn-sm" hidden={!toBuy.length} onclick={copy}>{copyLabel}</button></div></div>
        <div class="table-wrap">
          <table class="prices">
            <caption class="sr-only">Materials needed for your plan</caption>
            <thead><tr><th scope="col">Material</th><th scope="col" class="num">Need</th><th scope="col" class="num">Have</th><th scope="col" class="num">Buy</th><th scope="col" class="num">Price each</th><th scope="col" class="num">Cost</th></tr></thead>
            <tbody>
              {#if ready}
                {#each mats as m (m.id)}
                  <tr><th scope="row"><ItemLink id={m.id} name={itemName(m.id)} copy /></th><td class="num">{m.need}</td>
                    <td class="num"><label><span class="sr-only">Already have {itemName(m.id) || "Item #" + m.id}</span><input class="input pl-have" type="number" min="0" value={m.have} onchange={(e) => setHave(m.id, e.currentTarget)} /></label></td>
                    <td class="num"><b>{m.buy}</b></td><td class="num">{#if m.unit != null}<Money c={m.unit} />{:else}<span class="faint">no price</span>{/if} <span class="faint">{m.source === "ah" ? "AH" : m.source === "vendor" ? "vendor" : ""}</span></td><td class="num">{#if m.cost != null}<Money c={m.cost} />{:else}-{/if}</td></tr>
                {:else}
                  <tr><td colspan="6" class="empty">Materials appear here once you add recipes.</td></tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
        <p class="faint" style="margin-top:8px">Type how many you already have in the <b>Have</b> column and the list updates. "vendor" prices are Blizzard's vendor price for items not on the AH. Check a trade vendor sells them.</p>
      </section>
    </div>

    <aside class="grid">
      <section class="panel pl-totals" aria-labelledby="pl-sum-title">
        <h2 id="pl-sum-title">Totals</h2>
        <dl>
          <div><dt>Materials to buy</dt><dd>{#if ready}<Money c={res.cost} />{#if !res.complete}{" "}<span class="faint">+ items with no price</span>{/if}{/if}</dd></div>
          <div><dt>Results sell for <span class="faint">(after 5% AH cut)</span></dt><dd>{#if ready}{#if res.sales}<Money c={res.sales} />{#if !res.salesComplete}{" "}<span class="faint">(some results not on AH)</span>{/if}{:else}<span class="faint">-</span>{/if}{/if}</dd></div>
          <div><dt>Profit</dt><dd>{#if ready}{#if res.profit != null}<span class="pct {res.profit >= 0 ? 'up' : 'down'}">{res.profit >= 0 ? "+" : "−"}</span> <Money c={Math.abs(res.profit)} />{:else}<span class="faint">-</span>{/if}{/if}</dd></div>
        </dl>
        <Freshness {region} updated={groupData?.updated} />
        <p class="faint">Your plan is saved in this browser, no account needed.</p>
      </section>
      {@render sidebar?.()}
    </aside>
  </div>
  <p class="faint" style="margin-top:16px">Data provided by Blizzard Entertainment. Forever Anvil is not affiliated with or endorsed by Blizzard.</p>
</div>
