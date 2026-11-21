<script lang="ts">
  // Profession leveling cost calculator: the cheapest recipes from one skill to another at today's
  // prices, with a shopping list that says which auction house sells each material cheapest.
  // Math: src/lib/levelmath.js. Recipes and skill levels: recipes_<region>.json (pipeline/run.js).
  // initialProf: the profession a /leveling/<profession> page opens on.
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import Freshness from "./Freshness.svelte";
  import { getCachedJSON, getJSON, groupLabel, noDataMessage, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { notify } from "../lib/notify";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { load as loadStore, save as saveStore } from "../lib/store";
  import { addToPlan } from "../lib/plan";
  import { recipeUrl, levelingUrl } from "../lib/urls";
  import { setupWowhead, tooltipAttrs } from "../lib/wowhead";
  import { planLeveling, rangesText } from "../lib/levelmath.js";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import type { GroupPrices, Meta, Recipes, RecipeRow } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";
  import ItemIcon from "./ItemIcon.svelte";
  import Icon from "./Icon.svelte";
  import { professionIcon } from "../lib/icons";

  let { initialProf = null, children }: { initialProf?: number | null; children?: Snippet } = $props();

  // gathering skills level by gathering, not crafting
  const GATHERING = new Set([182, 186, 356, 393]);
  const HOUSE_NAMES: Record<string, string> = { alliance: "Alliance AH", horde: "Horde AH", neutral: "Blackwater" };
  const FACTION_NAMES: Record<string, string> = { alliance: "Alliance", horde: "Horde", neutral: "Blackwater" };
  const REGION_NAMES: Record<string, string> = { eu: "EU", us: "US" };
  const PREFS_KEY = "anvil-leveling";

  let region = $state("eu"), group = $state(""), faction = $state("horde");
  let prof = $state<number | null>(null), from = $state(1), to = $state(300);
  let patterns = $state(false), results = $state<"keep" | "vendor" | "ah">("keep");
  let groups = $state<{ value: string; label: string }[]>([]);
  let rulesets = $state<Record<string, string>>({});
  let recipes = $state.raw<Recipes | null>(null);
  let groupData = $state.raw<GroupPrices | null>(null);
  let ready = $state(false), emptyMsg = $state("");
  let added = $state(false);

  const profs = $derived((recipes?.professions || []).filter((p) => !GATHERING.has(p.id) && p.recipes.some((r) => r[6].length && r[7])));
  const profession = $derived(profs.find((p) => p.id === prof) || null);
  const houses = $derived.by(() => {
    if (!groupData) return [];
    return Object.entries(groupData.houses).filter(([, h]) => h.faction === faction || h.faction === "neutral").map(([id, h]) => ({ id, ...h }));
  });

  /** cheapest market price on the houses you can use; Blizzard's vendor price only when it isn't on the AH */
  function priceOf(id: number) {
    let best: { unit: number; source: "ah" | "vendor"; house: string | null; listed: number } | null = null;
    for (const h of houses) {
      const p = h.items[id];
      if (p && (!best || p[1] < best.unit)) best = { unit: p[1], source: "ah", house: h.faction, listed: p[2] };
    }
    if (best) return best;
    const v = itemSource.items[id]?.[3];
    return v ? { unit: v, source: "vendor" as const, house: null, listed: 0 } : null;
  }
  const ahPrice = (id: number) => { const p = priceOf(id); return p && p.source === "ah" ? p.unit : 0; };
  const sellPrice = (id: number) => itemSource.items[id]?.[1] || 0;

  const lo = $derived(Math.max(1, Math.min(299, Math.floor(from) || 1)));
  const hi = $derived(Math.max(lo + 1, Math.min(300, Math.floor(to) || 300)));
  const plan = $derived.by(() => {
    if (!ready || !profession) return null;
    void houses; void itemSource.items; // re-run when prices or names arrive
    return planLeveling(profession.recipes as RecipeRow[], priceOf, {
      from: lo, to: hi, sources: patterns ? ["trainer", "auto", "item"] : ["trainer", "auto"], results, sellPrice, ahPrice,
    });
  });
  const marketName = $derived(`${REGION_NAMES[region] || region.toUpperCase()} ${rulesets[group] || "Group " + group} ${FACTION_NAMES[faction] || ""}`.trim());
  const thin = $derived((plan?.shopping || []).filter((s) => s.source === "ah" && s.listed != null && s.qty > s.listed));

  function save() {
    saveMarketPrefs({ region, group, faction });
    saveStore(PREFS_KEY, { prof, from, to, patterns, results });
  }

  function pickProf(id: number) {
    prof = id;
    added = false;
    save();
    // on /leveling/<profession> pages, follow along in the address bar (shareable, and what search engines index)
    const p = profs.find((x) => x.id === id);
    if (p && location.pathname.startsWith("/leveling")) history.replaceState(null, "", levelingUrl(p.name));
  }

  function addAll() {
    if (!plan) return;
    let n = 0;
    for (const s of plan.steps) n = addToPlan(s.recipe[0], s.crafts);
    added = true;
    notify(`Added ${plan.steps.length} recipes to your crafting plan (${n} in it now).`);
  }

  async function loadRegion() {
    ready = false;
    const [meta, items, rec] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region)), getCachedJSON<Recipes>(priceUrl("recipes", region)),
    ]);
    useItems(region, items);
    if (!meta?.groups?.length || !rec) {
      emptyMsg = noDataMessage("The leveling calculator is temporarily unavailable.", "No recipe/price data on this computer yet. Run `npm run prices`, then reload.");
      return;
    }
    emptyMsg = "";
    recipes = rec;
    rulesets = { ...meta.likely, ...meta.rulesets };
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
    if (!profs.some((p) => p.id === prof)) prof = profs.find((p) => p.name === "Blacksmithing")?.id ?? profs[0]?.id ?? null;
    await loadGroup();
  }
  async function loadGroup() {
    ready = false;
    groupData = await getJSON<GroupPrices>(priceUrl("prices", region, group));
    ready = !!groupData;
  }

  onMount(() => {
    const p = getMarketPrefs();
    region = p.region || "eu"; group = p.group || ""; faction = p.faction || "horde";
    const s = loadStore<{ prof?: number; from?: number; to?: number; patterns?: boolean; results?: "keep" | "vendor" | "ah" }>(PREFS_KEY);
    if (s) {
      if (s.prof) prof = s.prof;
      if (s.from) from = s.from;
      if (s.to) to = s.to;
      patterns = !!s.patterns;
      if (s.results === "keep" || s.results === "vendor" || s.results === "ah") results = s.results;
    }
    if (initialProf) prof = initialProf; // the page's profession wins over the saved one
    loadRegion();
  });

  $effect(() => {
    if (!plan) return;
    announce(`${profession?.name} ${lo} to ${hi}: ${plan.steps.length} steps`);
    setupWowhead();
  });

  const sourceTag = (r: RecipeRow) => (r[7]?.[3] === "item" ? "pattern" : r[7]?.[3] === "auto" ? "known" : "trainer");
</script>

<div class="wrap section" hidden={!emptyMsg}><div class="panel"><h2>No data yet</h2><p>{emptyMsg}</p></div></div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="lv" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <fieldset class="chip-group lv-profs">
      <legend>Profession</legend>
      <div class="chips">
        {#each profs as p (p.id)}
          {@const pi = professionIcon(p.id)}
          <label class="chip"><input type="radio" name="lv-prof" value={String(p.id)} checked={p.id === prof} onchange={() => pickProf(p.id)} /><span>{#if pi}<Icon name={pi} size={22} />{/if}{p.name}</span></label>
        {/each}
      </div>
    </fieldset>
    <div class="control-row lv-row">
      <div><label class="field-label" for="lv-from">Skill now</label>
        <input class="input lv-num" id="lv-from" type="number" min="1" max="299" inputmode="numeric" bind:value={from} onchange={() => { added = false; save(); }} /></div>
      <div><label class="field-label" for="lv-to">Skill you want</label>
        <input class="input lv-num" id="lv-to" type="number" min="2" max="300" inputmode="numeric" bind:value={to} onchange={() => { added = false; save(); }} /></div>
      <div><label class="field-label" for="lv-results">What you make</label>
        <select class="input" id="lv-results" onchange={(e) => { results = e.currentTarget.value as typeof results; save(); }}>
          <option value="keep" selected={results === "keep"}>Keep it (count materials only)</option>
          <option value="vendor" selected={results === "vendor"}>Sell it to a vendor</option>
          <option value="ah" selected={results === "ah"}>Sell it on the AH</option>
        </select></div>
    </div>
    <fieldset class="chip-group lv-opts">
      <legend>Recipes</legend>
      <div class="chips">
        <label class="chip" title="Recipes taught by a pattern, plan or formula you buy or find"><input type="checkbox" bind:checked={patterns} onchange={() => { added = false; save(); }} /><span>Include patterns and plans</span></label>
      </div>
      <p class="faint lv-note">Recipes taught by a pattern, plan or formula you buy or find. Their prices are listed under the shopping list.</p>
    </fieldset>
  </div>

  <Freshness {region} updated={groupData?.updated} />

  <div class="panel lv-top" aria-live="polite">
    {#if !ready}<Loading text="Working out the cheapest route…" />
    {:else if plan && profession}
      <p class="lv-headline">Leveling <b>{profession.name} {lo}→{hi}</b> costs about <b class="lv-total"><Money c={plan.total} short /></b> on {marketName} today{results !== "keep" ? (results === "vendor" ? ", after selling what you make to a vendor" : ", after selling what you make on the AH") : ""}.</p>
      <p class="faint lv-sub">{plan.steps.length} steps, {plan.steps.reduce((n, s) => n + s.crafts, 0).toLocaleString()} crafts. Trainer fees aren't included.{#if plan.patterns.length} Uses {plan.patterns.length} pattern{plan.patterns.length > 1 ? "s" : ""} you'll need to get first (listed below).{/if}</p>
      {#if plan.gaps.length}<p class="lv-warn">No {patterns ? "" : "trainer "}recipe with a price gives skill points at <b>{rangesText(plan.gaps)}</b>{patterns ? "" : ". Try including patterns and plans"}{patterns ? ". You'll need another way past those levels (check in game)" : ""}.</p>{/if}
      {#if plan.steps.length}<p class="lv-actions"><button type="button" class="btn btn-sm" onclick={addAll} disabled={added}>{added ? "✓ Added to your crafting plan" : "+ Add every step to my crafting plan"}</button>{#if added}{" "}<a href="/planner">Open the planner</a>{/if}</p>{/if}
    {/if}
  </div>

  {#if ready && plan}
    <div class="lv-grid">
      <section aria-labelledby="lv-steps-title">
        <h2 id="lv-steps-title" class="lv-h">Step by step</h2>
        <div class="table-wrap">
          <table class="prices crafting lv-steps">
            <caption class="sr-only">Which recipe to craft at each skill, how many times and what it costs</caption>
            <thead><tr><th scope="col">Skill</th><th scope="col">Craft</th><th scope="col" class="num">Times</th><th scope="col" class="num">Each</th><th scope="col" class="num">Cost</th></tr></thead>
            <tbody>
              {#each plan.steps as s (s.from)}
                {@const r = s.recipe}
                <tr>
                  <td data-label="Skill" class="lv-skill">{s.from}–{s.to}</td>
                  <th scope="row">
                    {#if r[3]}<a class="item-link" href={recipeUrl(r[0], r[1])} {...tooltipAttrs(r[3])}><ItemIcon id={r[3]} />{r[4] || r[1]}</a>{:else}<a class="item-link" href={recipeUrl(r[0], r[1])}><ItemIcon id={null} />{r[1]}</a>{/if}
                    <span class="cat"><span class="tag lv-src-{sourceTag(r)}">{sourceTag(r)}</span>yellow {r[7]?.[1]}, grey {r[7]?.[2]}</span>
                  </th>
                  <td class="num" data-label="Times">{s.crafts.toLocaleString()}</td>
                  <td class="num" data-label="Each"><Money c={s.costEach} /></td>
                  <td class="num" data-label="Cost"><b><Money c={s.cost} short /></b></td>
                </tr>
              {:else}
                <tr><td colspan="5" class="empty">Nothing to craft between these skills.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="lv-shop-title">
        <h2 id="lv-shop-title" class="lv-h">Shopping list</h2>
        <div class="table-wrap">
          <table class="prices crafting lv-shop">
            <caption class="sr-only">Every material for the whole route, where it's cheapest and what it costs</caption>
            <thead><tr><th scope="col">Material</th><th scope="col" class="num">Need</th><th scope="col">Buy at</th><th scope="col" class="num">Total</th></tr></thead>
            <tbody>
              {#each plan.shopping as m (m.id)}
                <tr>
                  <th scope="row"><ItemLink id={m.id} name={itemSource.items[m.id]?.[0] || m.name} copy /></th>
                  <td class="num" data-label="Need">{m.qty.toLocaleString()}{#if m.source === "ah" && m.listed != null && m.qty > m.listed}<span class="cat thin" title="Fewer listed than you need: buying them all will push the price up">only {m.listed.toLocaleString()} listed</span>{/if}</td>
                  <td data-label="Buy at">{m.source === "ah" ? HOUSE_NAMES[m.house || ""] || "AH" : "Vendor"}<span class="cat"><Money c={m.unit} /> each{m.source === "vendor" ? " (estimate)" : ""}</span></td>
                  <td class="num" data-label="Total"><b><Money c={m.cost} short /></b></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if thin.length}<p class="faint">{thin.length} material{thin.length > 1 ? "s have" : " has"} fewer on sale than you need, so expect to pay more as you buy them out.</p>{/if}
        {#if plan.patterns.length}
          <h3 class="mini-head">Patterns and plans you need</h3>
          <ul class="mats">
            {#each plan.patterns as id (id)}
              {@const p = priceOf(id)}
              <li><ItemLink id={id} name={itemSource.items[id]?.[0]} />: {#if p && p.source === "ah"}<Money c={p.unit} /> on {HOUSE_NAMES[p.house || ""]}{:else}<span class="faint">not on the AH right now (a vendor or a drop)</span>{/if}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {:else if !emptyMsg}
    <div class="table-wrap"><table class="prices"><tbody><SkeletonRows rows={8} cols={5} /></tbody></table></div>
  {/if}

  {@render children?.()}
</div>

<style>
  .lv-row { display: flex; flex-wrap: wrap; gap: 14px 22px; margin-top: 12px; }
  .lv-num { width: 7.5em; }
  .lv-profs, .lv-opts { margin-top: 14px; }
  .lv-note { margin: 6px 0 0; font-size: .85rem; }
  .lv-top { margin-top: 6px; }
  .lv-headline { margin: 0; font-size: 1.15rem; }
  .lv-total { font-size: 1.25rem; }
  .lv-sub { margin: 6px 0 0; }
  .lv-warn { margin: 10px 0 0; color: #f0c674; }
  .lv-actions { margin: 12px 0 0; }
  .lv-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; margin-top: 20px; align-items: start; }
  @media (max-width: 1000px) { .lv-grid { grid-template-columns: 1fr; } }
  .lv-h { font-size: 1.2rem; margin: 0 0 10px; }
  .lv-skill { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .lv-src-pattern { color: #c9a0ff; }
  .lv-src-known { color: #9bd4a0; }
</style>
