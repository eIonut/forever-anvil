<script lang="ts">
  // AH upgrade finder, under a looked-up character: gear on their ruleset's auction houses (their
  // faction's and Blackwater) with a higher item level than what they wear, that their class can use and
  // that they're high enough level for. Math: src/lib/upgrades.js.
  import { onMount } from "svelte";
  import { getCachedJSON, getJSON, priceUrl } from "../lib/api";
  import { load as loadStore, save as saveStore } from "../lib/store";
  import { setupWowhead } from "../lib/wowhead";
  import { findUpgrades } from "../lib/upgrades.js";
  import { useItems, itemSource, type ItemInfo } from "./itemIcons.svelte";
  import type { GroupPrices, Meta } from "./types";
  import Freshness from "./Freshness.svelte";
  import Loading from "./Loading.svelte";
  import { iconUrl } from "../lib/pricemath.js";
  import ItemIcon from "./ItemIcon.svelte";
  import ItemLink from "./ItemLink.svelte";
  import Money from "./Money.svelte";

  interface Props {
    region: string;
    character: { level: number; class?: string; faction?: string; ruleset?: string };
    gear: { slotType?: string | null; id: number; level?: number; name?: string; icon?: number | null; quality?: string | null }[];
    /** shown first on the card (the /upgrades page) */
    first?: boolean;
  }
  let { region, character, gear, first = false }: Props = $props();

  const SLOT_NAMES: Record<string, string> = {
    HEAD: "Head", NECK: "Neck", SHOULDER: "Shoulders", BACK: "Back", CHEST: "Chest", WRIST: "Wrist", HANDS: "Hands",
    WAIST: "Waist", LEGS: "Legs", FEET: "Feet", FINGER: "Ring", TRINKET: "Trinket", MAIN_HAND: "Main hand", OFF_HAND: "Off hand", RANGED: "Ranged",
  };
  const HOUSE_NAMES: Record<string, string> = { alliance: "Alliance AH", horde: "Horde AH", neutral: "Blackwater" };
  const BUDGETS = [{ v: 10000, l: "Up to 1g" }, { v: 50000, l: "Up to 5g" }, { v: 200000, l: "Up to 20g" }, { v: 1000000, l: "Up to 100g" }, { v: 0, l: "Any price" }];
  const PREFS_KEY = "anvil-upgrades";

  // "Roleplay PvP", "RP-PvP", "rp pvp" → "rppvp"; "PvP" → "pvp"; "Normal"/"PvE" → "normal"
  function rulesetKey(name: string | undefined): string {
    const s = String(name || "").toLowerCase();
    const rp = /roleplay|\brp\b|^rp/.test(s), pvp = /pvp/.test(s.replace(/^rp-?/, "").replace(/roleplay/, ""));
    if (rp && pvp) return "rppvp";
    if (rp) return "rp";
    if (/pvp/.test(s)) return "pvp";
    if (/normal|pve/.test(s)) return "normal";
    return "";
  }

  let budget = $state(200000);
  let meta = $state.raw<Meta | null>(null);
  let groupData = $state.raw<GroupPrices | null>(null);
  let group = $state(""), status = $state<"loading" | "ready" | "none">("loading");

  const faction = $derived(String(character.faction || "").toLowerCase());
  const houses = $derived(groupData ? Object.entries(groupData.houses).filter(([, h]) => h.faction === faction || h.faction === "neutral").map(([id, h]) => ({ id, ...h })) : []);
  const slots = $derived(status === "ready" ? findUpgrades(character, gear as never, itemSource.items as never, houses, { maxPrice: budget || null }) : []);
  const wornName = (id: number) => gear.find((g) => g.id === id)?.name || itemSource.items[id]?.[0] || "Item #" + id;
  const wornGear = (id: number) => gear.find((g) => g.id === id);
  const rulesetName = $derived(meta?.rulesets?.[group] || "Group " + group);

  onMount(async () => {
    const saved = loadStore<{ budget?: number }>(PREFS_KEY);
    if (saved && BUDGETS.some((b) => b.v === saved.budget)) budget = saved.budget!;
    const [m, items] = await Promise.all([getJSON<Meta>(priceUrl("meta", region)), getCachedJSON<Record<string, ItemInfo>>(priceUrl("items", region))]);
    useItems(region, items);
    meta = m;
    const want = rulesetKey(character.ruleset);
    const g = Object.entries(m?.rulesets || {}).find(([, name]) => rulesetKey(name) === want)?.[0];
    if (!m?.groups?.length || !items || !g || !m.groups.includes(g) || (faction !== "horde" && faction !== "alliance")) { status = "none"; return; }
    group = g;
    groupData = await getJSON<GroupPrices>(priceUrl("prices", region, g));
    status = groupData ? "ready" : "none";
  });

  $effect(() => { if (status === "ready") { void slots; setupWowhead(); } });
</script>

<!-- the worn item's icon: from the character lookup (it has every item's icon and quality), else the items file -->
{#snippet wornIcon(id: number)}
  {@const g = wornGear(id)}
  {#if g?.icon}<img class="item-icon{g.quality ? ' qb-' + g.quality : ''}" src={iconUrl(g.icon, region, 36)} alt="" width="20" height="20" loading="lazy" decoding="async" />{:else}<ItemIcon {id} />{/if}
{/snippet}

<section class="up" class:up-first-sec={first} aria-labelledby="up-title">
  <h3 id="up-title" class="ch-h">Upgrades on the Auction House</h3>
  {#if status === "loading"}<Loading text="Checking the auction houses for upgrades…" />
  {:else if status === "none"}
    <p class="faint">We don't have auction prices for this character's ruleset{region !== "eu" && region !== "us" ? " or region" : ""} yet, so we can't look for upgrades.</p>
  {:else}
    <p class="up-intro">Gear for sale right now on {rulesetName} ({HOUSE_NAMES[faction]} and Blackwater) with a <b>higher item level</b> than what {character.class ? "this " + character.class.toLowerCase() : "they"} wear{character.class ? "s" : ""}, that the class can use at level {character.level}.</p>
    <div class="control-row up-row">
      <div><label class="field-label" for="up-budget">Price per item</label>
        <select class="input" id="up-budget" onchange={(e) => { budget = Number(e.currentTarget.value); saveStore(PREFS_KEY, { budget }); }}>
          {#each BUDGETS as b (b.v)}<option value={b.v} selected={budget === b.v}>{b.l}</option>{/each}
        </select></div>
    </div>
    <Freshness {region} updated={groupData?.updated} />
    {#if slots.length}
      <div class="table-wrap">
        <table class="prices crafting up-table">
          <caption class="sr-only">Auction House upgrades by slot: what's worn now, the upgrade, its price and where to buy it</caption>
          <thead><tr><th scope="col">Slot</th><th scope="col">Wearing</th><th scope="col">Upgrade</th><th scope="col" class="up-gain-col">Better by</th><th scope="col" class="num">Price</th><th scope="col">Buy at</th></tr></thead>
          <tbody>
            {#each slots as s, si (s.slot)}
              {#each s.options as o, i (o.id)}
                <tr class:up-first={i === 0} class:up-alt={si % 2 === 1}>
                  <td data-label="Slot" class="up-slot" class:up-blank={i > 0}>{i === 0 ? SLOT_NAMES[s.slot] : ""}</td>
                  <td data-label="Wearing" class:up-blank={i > 0}>{#if i === 0}{#if s.wearing}<span class="up-worn">{@render wornIcon(s.wearing.id)}{wornName(s.wearing.id)}</span><span class="cat">item level {s.wearing.level ?? "?"}</span>{:else}<span class="faint">Nothing</span>{/if}{/if}</td>
                  <th scope="row"><ItemLink id={o.id} name={itemSource.items[o.id]?.[0]} copy /><span class="cat">item level {o.level}{o.reqLevel ? " · needs level " + o.reqLevel : ""}</span></th>
                  <td class="up-gain-col" data-label="Better by"><span class="up-gain" title="{o.gain} item levels higher than what's worn now"><span aria-hidden="true">▲</span> +{o.gain}<span class="sr-only"> item levels</span></span></td>
                  <td class="num" data-label="Price"><b><Money c={o.price} short /></b></td>
                  <td data-label="Buy at">{HOUSE_NAMES[o.house] || o.house}</td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="faint">No upgrades on these auction houses {budget ? "at this price" : "right now"}.{budget && budget < 1000000 ? " Try a higher price limit." : ""}</p>
    {/if}
    <p class="faint up-note">Ranked by item level, the one thing we know for every item; check each item's stats (hover it) suit your spec. Up to three per slot, highest item level first, then cheapest. Only items Blizzard describes are included, so some brand-new Forever items may be missing.</p>
  {/if}
</section>

<style>
  .up { margin-top: 26px; scroll-margin-top: calc(var(--header-h, 64px) + 12px); }
  .up-first-sec { margin: 18px 0 30px; }
  .up-intro { margin: 0 0 8px; }
  .up-row { display: flex; gap: 14px; margin-bottom: 4px; }
  .up-slot { font-weight: 700; white-space: nowrap; color: var(--gold-2); }
  .up-worn { display: block; }
  .up-note { margin-top: 10px; }
  /* how much better: a green badge in its own column, so it's the first thing you see */
  .up-gain-col { text-align: center; }
  .up-gain {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; white-space: nowrap;
    font-weight: 700; font-size: 1rem; font-feature-settings: "lnum" 1, "tnum" 1;
    color: var(--up); background: rgba(127, 220, 106, .12); border: 1px solid rgba(127, 220, 106, .45);
  }
  .up-gain > span[aria-hidden] { font-size: .7em; }
  /* each slot is one group: alternate groups get a light band (instead of row stripes) and a line above */
  .up-table tbody tr:nth-child(even) { background: none; }
  .up-table tbody tr.up-alt { background: rgba(255, 255, 255, .035); }
  .up-table tbody tr:hover { background: rgba(232, 189, 85, .06); }
  .up-table tbody tr:not(.up-first) > :global(*) { border-top: 0; }
  .up-table tbody tr.up-first:not(:first-child) > :global(*) { border-top: 1px solid var(--line); }
  /* phones: the 2nd and 3rd option of a slot don't repeat the empty slot and wearing labels */
  @media (max-width: 900px) { .up-table tbody tr:not(.up-first) > td.up-blank { display: none; } .up-gain-col { text-align: left; } }
</style>
