<script lang="ts">
  // Waylaid Crate calculator: which crate turns the least gold into Merchant's Favor right now.
  // Every bundle that fills a crate (from Blizzard's crate data, pipeline/crates.js) is priced on your
  // faction's auction house and on Blackwater; the cheaper one wins. Math: src/lib/cratemath.js.
  import Freshness from "./Freshness.svelte";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import Loading from "./Loading.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { getCachedJSON, getJSON, groupLabel, noDataMessage, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { getMarketPrefs, saveMarketPrefs } from "../lib/marketPrefs";
  import { load as loadStore, save as saveStore } from "../lib/store";
  import { setupWowhead, tooltipAttrs } from "../lib/wowhead";
  import { itemUrl } from "../lib/urls";
  import ItemIcon from "./ItemIcon.svelte";
  import { rankCrates, costForFavor, TIERS } from "../lib/cratemath.js";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import type { GroupPrices, Meta } from "./types";
  import MarketSelects from "./MarketSelects.svelte";
  import Money from "./Money.svelte";
  import ItemLink from "./ItemLink.svelte";

  let { children }: { children?: Snippet } = $props();

  /** crates_<region>.json: [crateId, name, requiredLevel, [[itemId|null, qty, name], ...]] */
  type CrateRow = [number, string, number, [number | null, number, string][]];
  interface CrateFile { day: number; crates: CrateRow[] }
  interface Fill { itemId: number | null; qty: number; name: string; cost: number | null; unit: number | null; houseId: string | null; faction: string | null; listed: number }
  interface Ranked {
    id: number; name: string; level: number; tier: number; tierName: string; kind: string; label: string;
    favor: number; confirmed: boolean; fills: Fill[]; best: Fill | null; perFavor: number | null;
    crate: { cost: number; houseId: string; faction: string } | null; buyAndFillPerFavor: number | null;
  }

  // Things Merchant's Favor buys (Warcraft Wiki, 2026-11-20), for the "how much for my goal" box
  const GOALS = [
    { value: 200, label: "Faction tabard (200)" },
    { value: 1000, label: "Profession title (1,000)" },
    { value: 1200, label: "Advertising License Application (1,200)" },
    { value: 1500, label: "Packmule Treat (1,500)" },
    { value: 6000, label: "Pack mount, at Exalted (6,000)" },
  ];
  const HOUSE_NAMES: Record<string, string> = { alliance: "Alliance AH", horde: "Horde AH", neutral: "Blackwater" };
  const PREFS_KEY = "anvil-crates";

  let region = $state("eu"), group = $state(""), faction = $state("horde");
  let tier = $state("all"), kind = $state("all"), rankBy = $state<"fill" | "buy">("fill"), bonus = $state(0);
  let goal = $state(1000);
  let open = $state<Record<number, boolean>>({});
  let groups = $state<{ value: string; label: string }[]>([]);
  let crates = $state.raw<CrateFile | null>(null);
  let groupData = $state.raw<GroupPrices | null>(null);
  let ready = $state(false), emptyMsg = $state("");

  function save() {
    saveMarketPrefs({ region, group, faction });
    saveStore(PREFS_KEY, { tier, kind, rankBy, bonus, goal });
  }

  // you can buy from your own faction's auction house and from Blackwater; Blackwater alone if you picked it
  const houses = $derived.by(() => {
    if (!groupData) return [];
    return Object.entries(groupData.houses)
      .filter(([, h]) => h.faction === faction || h.faction === "neutral")
      .map(([id, h]) => ({ id, faction: h.faction, items: h.items }));
  });
  const all = $derived<Ranked[]>(crates && houses.length ? rankCrates(crates.crates, houses, { bonusPct: bonus, rankBy: rankBy === "buy" ? "buy" : "fill" }) : []);
  const rows = $derived(all.filter((r) => (tier === "all" || r.tierName === tier) && (kind === "all" || r.kind === kind)));
  const metric = (r: Ranked) => (rankBy === "buy" ? r.buyAndFillPerFavor : r.perFavor);
  const top = $derived(rows.find((r) => metric(r) != null) || null);
  const goalPlan = $derived.by(() => {
    if (!top || !top.best || !(goal > 0)) return null;
    const perCrate = top.best.cost! + (rankBy === "buy" && top.crate ? top.crate.cost : 0);
    return costForFavor(perCrate, top.favor, goal);
  });

  const houseName = (f: string | null) => (f ? HOUSE_NAMES[f] || f : "");
  const fmtFavor = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  async function loadRegion() {
    ready = false;
    const [meta, items, cr] = await Promise.all([
      getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region)), getCachedJSON<CrateFile>(priceUrl("crates", region)),
    ]);
    useItems(region, items);
    if (!meta?.groups?.length || !cr?.crates?.length) {
      emptyMsg = noDataMessage("The crate calculator is temporarily unavailable.", "No crate/price data on this computer yet. Run `npm run prices -- --force-crates=true`, then reload.");
      return;
    }
    emptyMsg = "";
    crates = cr;
    groups = meta.groups.map((g) => ({ value: g, label: groupLabel(meta, g) }));
    if (!meta.groups.includes(group)) group = meta.groups[0];
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
    const s = loadStore<{ tier?: string; kind?: string; rankBy?: "fill" | "buy"; bonus?: number; goal?: number }>(PREFS_KEY);
    if (s) {
      if (s.tier && (s.tier === "all" || TIERS.includes(s.tier))) tier = s.tier;
      if (s.kind === "all" || s.kind === "gathered" || s.kind === "crafted") kind = s.kind;
      if (s.rankBy === "fill" || s.rankBy === "buy") rankBy = s.rankBy;
      if ([0, 5, 10, 15].includes(Number(s.bonus))) bonus = Number(s.bonus);
      if (Number(s.goal) > 0) goal = Number(s.goal);
    }
    loadRegion();
  });

  $effect(() => {
    if (!ready) return;
    announce(rows.length + " crates ranked");
    setupWowhead();
  });
</script>

{#snippet bundle(f: Fill)}
  <b>{f.qty}×</b> {#if f.itemId}<ItemLink id={f.itemId} name={itemSource.items[f.itemId]?.[0] || f.name} />{:else}{f.name}{/if}
{/snippet}

<div class="wrap section" hidden={!emptyMsg}><div class="panel"><h2>No data yet</h2><p>{emptyMsg}</p></div></div>

<div class="wrap section" hidden={!!emptyMsg}>
  <div class="panel controls">
    <MarketSelects prefix="wc" {region} {group} {faction} {groups}
      onregion={(v) => { region = v; save(); loadRegion(); }}
      ongroup={(v) => { group = v; save(); loadGroup(); }}
      onfaction={(v) => { faction = v; save(); }} />
    <div class="market-bar wc-filters">
    <fieldset class="chip-group">
      <legend>Crate tier</legend>
      <div class="chips">
        {#each ["all", ...TIERS] as t (t)}
          <label class="chip"><input type="radio" name="wc-tier" value={t} checked={tier === t} onchange={() => { tier = t; save(); }} /><span>{t === "all" ? "All tiers" : t}</span></label>
        {/each}
      </div>
    </fieldset>
    <fieldset class="chip-group">
      <legend>Crate kind</legend>
      <div class="chips">
        {#each [{ v: "all", l: "All crates" }, { v: "gathered", l: "Gathered goods", n: "herbs, ore, leather, cloth, enchanting" }, { v: "crafted", l: "Crafted goods", n: "bolts, hides, bars, parts" }] as k (k.v)}
          <label class="chip" title={k.n}><input type="radio" name="wc-kind" value={k.v} checked={kind === k.v} onchange={() => { kind = k.v; save(); }} /><span>{k.l}{#if k.n}<span class="sr-only"> ({k.n})</span>{/if}</span></label>
        {/each}
      </div>
    </fieldset>
    <fieldset class="chip-group">
      <legend>Rank by</legend>
      <div class="chips">
        <label class="chip"><input type="radio" name="wc-rank" value="fill" checked={rankBy === "fill"} onchange={() => { rankBy = "fill"; save(); }} /><span>Filling cost <span class="chip-note">(you have the crate)</span></span></label>
        <label class="chip"><input type="radio" name="wc-rank" value="buy" checked={rankBy === "buy"} onchange={() => { rankBy = "buy"; save(); }} /><span>Buy the crate and fill it</span></label>
      </div>
    </fieldset>
    </div>
    <div class="control-row wc-row">
      <div><label class="field-label" for="wc-bonus">Legacy Favor bonus</label>
        <select class="input" id="wc-bonus" onchange={(e) => { bonus = Number(e.currentTarget.value); save(); }}>
          {#each [0, 5, 10, 15] as b (b)}<option value={b} selected={bonus === b}>{b ? "+" + b + "%" : "None"}</option>{/each}
        </select></div>
      <div><label class="field-label" for="wc-goal">Favor you're saving for</label>
        <select class="input" id="wc-goal" onchange={(e) => { goal = Number(e.currentTarget.value); save(); }}>
          {#each GOALS as g (g.value)}<option value={g.value} selected={goal === g.value}>{g.label}</option>{/each}
          {#if !GOALS.some((g) => g.value === goal)}<option value={goal} selected>{goal.toLocaleString()} Favor</option>{/if}
        </select></div>
    </div>
  </div>

  <div class="panel wc-top" aria-live="polite">
    {#if !ready}<Loading text="Pricing every crate…" />
    {:else if top && top.best}
      <p class="wc-top-line">Cheapest Favor right now: <b>{top.label}</b>, filled with {@render bundle(top.best)} from {houseName(top.best.faction)}: <b><Money c={Math.round(metric(top)!)} /></b> per Favor{#if !top.confirmed}<span class="tag wc-exp" title="Nobody has confirmed how much Favor Artisan crates give">expected</span>{/if}.</p>
      {#if goalPlan}<p class="faint" style="margin:6px 0 0">{goal.toLocaleString()} Favor this way: {goalPlan.crates.toLocaleString()} crates, about <Money c={goalPlan.cost} short />{rankBy === "fill" ? " in materials, if you already have the crates" : " buying the crates on the AH too"}. Prices move as you buy, so treat it as a lower bound.</p>{/if}
    {:else}<p>None of these crates can be filled from this auction house right now.</p>{/if}
  </div>

  <Freshness {region} updated={groupData?.updated} />
  <div class="section-head">
    <p class="faint" style="margin:0">{#if ready && groupData}{rows.length} crates · compares {faction === "neutral" ? "Blackwater only" : houseName(faction) + " and Blackwater"}{/if}</p>
  </div>
  <div class="table-wrap">
    <table class="prices crafting crates">
      <caption class="sr-only">Waylaid Crates ranked by gold per Merchant's Favor, with the cheapest bundle to fill each one</caption>
      <thead><tr>
        <th scope="col">Crate</th><th scope="col" class="num">Favor</th><th scope="col">Cheapest bundle</th><th scope="col" class="num">Fill cost</th>
        <th scope="col" class="num" aria-sort={rankBy === "fill" ? "ascending" : undefined}>Per Favor</th><th scope="col" class="num">Crate on AH</th>
        <th scope="col" class="num" aria-sort={rankBy === "buy" ? "ascending" : undefined}>Buy + fill, per Favor</th>
        <th scope="col"><span class="sr-only">Other bundles</span></th>
      </tr></thead>
      <tbody>
        {#if !ready}{#if !emptyMsg}<SkeletonRows cols={8} />{/if}{:else}
          {#each rows as r (r.id)}
            <tr class:wc-best={r === top}>
              <th scope="row"><a class="item-link" href={itemUrl(r.id, r.name)} {...tooltipAttrs(r.id)}><ItemIcon id={r.id} />{r.label}</a><span class="cat">{r.kind === "crafted" ? "Crafted goods" : "Gathered goods"} · level {r.level}</span></th>
              <td class="num" data-label="Favor">{fmtFavor(r.favor)}{#if !r.confirmed}<span class="cat" title="Nobody has confirmed how much Favor Artisan crates give; this follows the pattern of the other tiers">expected</span>{/if}</td>
              <td data-label="Cheapest bundle">{#if r.best}{@render bundle(r.best)}<span class="cat">{houseName(r.best.faction)} · {r.best.listed.toLocaleString()} listed</span>{:else}<span class="faint">Not enough on sale</span>{/if}</td>
              <td class="num" data-label="Fill cost"><Money c={r.best?.cost} /></td>
              <td class="num" data-label="Per Favor">{#if r.perFavor != null}<b class:wc-rank={rankBy === "fill"}><Money c={Math.round(r.perFavor)} /></b>{:else}<span class="faint">-</span>{/if}</td>
              <td class="num" data-label="Crate on AH">{#if r.crate}<Money c={r.crate.cost} /><span class="cat">{houseName(r.crate.faction)}</span>{:else}<span class="faint">None listed</span>{/if}</td>
              <td class="num" data-label="Buy + fill, per Favor">{#if r.buyAndFillPerFavor != null}<b class:wc-rank={rankBy === "buy"}><Money c={Math.round(r.buyAndFillPerFavor)} /></b>{:else}<span class="faint">-</span>{/if}</td>
              <td class="cr-actions">{#if r.fills.length > 1}<button type="button" class="btn btn-ghost btn-sm" aria-expanded={!!open[r.id]} onclick={() => (open[r.id] = !open[r.id])}>{r.fills.length - 1} other{r.fills.length > 2 ? "s" : ""}<span class="sr-only"> way{r.fills.length > 2 ? "s" : ""} to fill {r.label}</span></button>{/if}</td>
            </tr>
            {#if open[r.id]}
              <tr class="cr-detail"><td colspan="8">
                <h3 class="mini-head">Every bundle that fills {r.label}</h3>
                <ul class="mats">
                  {#each r.fills as f, j (j)}
                    <li>{@render bundle(f)}: {#if f.cost != null}<Money c={f.cost} /> <span class="faint">({f.qty} × <Money c={f.unit} /> on {houseName(f.faction)}, <Money c={Math.round(f.cost / r.favor)} /> per Favor)</span>{:else}<span class="faint">not enough on sale</span>{/if}</li>
                  {/each}
                </ul>
              </td></tr>
            {/if}
          {:else}
            <tr><td colspan="8" class="empty">No crates match.</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <p class="faint wc-note">Favor per crate is from player reports: gathered-goods crates give 5, 10 and 15 Favor (Apprentice to Expert), crafted-goods crates twice that. Artisan crates are expected to give 20 and 40, but nobody has confirmed it yet.</p>

  {@render children?.()}
</div>

<style>
  .wc-filters { margin-top: 14px; }
  .wc-row { display: flex; flex-wrap: wrap; gap: 14px 22px; margin-top: 12px; }
  .wc-top { margin-top: 16px; }
  .wc-top-line { margin: 0; font-size: 1.05rem; }
  .wc-exp { margin-left: 6px; }
  @media (min-width: 761px) { tr.wc-best > * { background: rgba(255, 209, 102, .07); } }
  .wc-note { margin-top: 10px; }
</style>
