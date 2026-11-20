<script lang="ts">
  // Character lookup: asks /api/character (the Worker in production, the dev server locally),
  // which fetches the public profile from Blizzard. /character?r=eu&n=Name-Surname shares a lookup.
  // The result is drawn like the in-game character sheet: gear slots down both sides of Blizzard's
  // render of the character, weapons underneath, then professions and reputations as skill bars.
  import { onMount, tick } from "svelte";
  import config from "../config.js";
  import { ago, copyText, localTime } from "../lib/api";
  import { notify } from "../lib/notify";
  import { load, save } from "../lib/store";
  import { setupWowhead } from "../lib/wowhead";
  import { iconUrl } from "../lib/pricemath.js";
  import { professionIcon, wowIcon } from "../lib/icons";
  import Icon from "./Icon.svelte";
  import Loading from "./Loading.svelte";

  interface Gear { slot?: string; slotType?: string | null; id: number; icon?: number | null; enchant?: string | null; name?: string; quality?: string; level?: number }
  interface Result {
    region: string;
    fetched: string;
    blizzardUpdated?: string;
    partial?: boolean;
    character: { name?: string; surname?: string; slug: string; level: number; race?: string; class?: string; guild?: string; faction?: string; ruleset?: string; lastLogin?: string; avatar?: string; inset?: string | null; render?: string | null; renderRaw?: boolean };
    gear: Gear[];
    professions: { id?: number | null; name: string; skill?: number | null; max?: number | null }[];
    reputations: { faction: string; standing?: string; value?: number | null; max?: number | null }[];
  }

  // classes with a colour variable (--c-<id>) in global.css
  const CLASS_IDS = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
  const ERR: Record<string, string> = {
    "not-found": "We couldn't find that character. Check the spelling (first and last name), and note that characters only appear after reaching level 10 and logging out once.",
    "bad-name": "Please enter a first and last name, like \"Thrallina Stormhoof\".",
    "too-many": "Too many lookups in a short time. Wait a minute and try again.",
    "not-configured": "The character lookup isn't set up on this server yet (missing Blizzard API keys).",
    unavailable: "Blizzard's character service didn't answer. Please try again in a few minutes.",
  };

  // the in-game character sheet: left column, right column, weapons along the bottom
  const LEFT = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST"];
  const RIGHT = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"];
  const WEAPONS = ["MAIN_HAND", "OFF_HAND", "RANGED"];
  const SLOT_LABEL: Record<string, string> = {
    HEAD: "Head", NECK: "Neck", SHOULDER: "Shoulders", BACK: "Back", CHEST: "Chest", SHIRT: "Shirt", TABARD: "Tabard", WRIST: "Wrist",
    HANDS: "Hands", WAIST: "Waist", LEGS: "Legs", FEET: "Feet", FINGER_1: "Finger", FINGER_2: "Finger", TRINKET_1: "Trinket", TRINKET_2: "Trinket",
    MAIN_HAND: "Main hand", OFF_HAND: "Off hand", RANGED: "Ranged", AMMO: "Ammo",
  };
  // older cached answers have only the slot's name ("Main Hand", "Ring 1"…): map those too
  const SLOT_BY_NAME: Record<string, string> = {
    head: "HEAD", neck: "NECK", shoulders: "SHOULDER", shoulder: "SHOULDER", back: "BACK", chest: "CHEST", shirt: "SHIRT", tabard: "TABARD", wrist: "WRIST",
    hands: "HANDS", waist: "WAIST", legs: "LEGS", feet: "FEET", "ring 1": "FINGER_1", "ring 2": "FINGER_2", "finger 1": "FINGER_1", "finger 2": "FINGER_2",
    "trinket 1": "TRINKET_1", "trinket 2": "TRINKET_2", "main hand": "MAIN_HAND", "off hand": "OFF_HAND", ranged: "RANGED", relic: "RANGED",
  };
  // profession icons when the answer has no profession id
  const PROF_BY_NAME: Record<string, number> = {
    alchemy: 171, blacksmithing: 164, cooking: 185, enchanting: 333, engineering: 202, "first aid": 129,
    fishing: 356, herbalism: 182, leatherworking: 165, mining: 186, skinning: 393, tailoring: 197,
  };
  // reputation standings, coloured as in the game
  const STANDING: Record<string, string> = {
    hated: "hated", hostile: "hostile", unfriendly: "unfriendly", neutral: "neutral",
    friendly: "friendly", honored: "honored", revered: "revered", exalted: "exalted",
  };

  let region = $state("eu"), name = $state("");
  let view = $state.raw<{ kind: "none" } | { kind: "loading"; name: string } | { kind: "error"; message: string } | { kind: "ok"; d: Result }>({ kind: "none" });
  let renderFailed = $state(false);
  let nameBox: HTMLInputElement;

  const slotOf = (g: Gear) => g.slotType || SLOT_BY_NAME[String(g.slot || "").toLowerCase()] || null;

  /** gear by slot, plus anything in a slot this sheet doesn't draw (shown under the weapons) */
  function layout(d: Result) {
    const by: Record<string, Gear> = {};
    const extra: Gear[] = [];
    for (const g of d.gear) {
      const s = slotOf(g);
      if (s && SLOT_LABEL[s] && !by[s]) by[s] = g; else extra.push(g);
    }
    // average item level, as the game counts it: without shirt, tabard and ammo
    const counted = d.gear.filter((g) => g.level && !["SHIRT", "TABARD", "AMMO"].includes(slotOf(g) || ""));
    const avg = counted.length ? Math.round(counted.reduce((s, g) => s + (g.level || 0), 0) / counted.length) : null;
    return { by, extra, avg };
  }

  const profIcon = (p: Result["professions"][number]) => {
    const key = professionIcon(p.id ?? PROF_BY_NAME[p.name.toLowerCase()] ?? "");
    return key ? wowIcon(key) : undefined;
  };
  const pct = (v?: number | null, max?: number | null) => (max ? Math.max(0, Math.min(100, Math.round(((v || 0) / max) * 100))) : 0);

  async function lookup() {
    const n = name.trim(), r = region;
    if (!n) { nameBox.focus(); return; }
    save("codex-char", { region: r });
    view = { kind: "loading", name: n };
    renderFailed = false;
    const base = ((config as { characterApi?: string }).characterApi || "/api").replace(/\/$/, "");
    try {
      const res = await fetch(base + "/character?region=" + encodeURIComponent(r) + "&name=" + encodeURIComponent(n));
      const d = await res.json().catch(() => ({ error: "unavailable" }));
      if (!d || d.error) { view = { kind: "error", message: ERR[d && d.error] || ERR.unavailable }; return; }
      view = { kind: "ok", d };
      history.replaceState(null, "", "?r=" + encodeURIComponent(r) + "&n=" + encodeURIComponent(d.character.slug));
      await tick();
      setupWowhead();
    } catch {
      view = { kind: "error", message: ERR.unavailable };
    }
  }

  async function share(d: Result) {
    const url = location.origin + location.pathname + "?r=" + encodeURIComponent(d.region) + "&n=" + encodeURIComponent(d.character.slug);
    if (await copyText(url, "Copy this link:")) notify("Link to this character copied");
  }

  onMount(() => {
    const params = new URLSearchParams(location.search);
    region = params.get("r") || load<{ region?: string }>("codex-char")?.region || "eu";
    name = (params.get("n") || "").replace(/-/g, " ");
    if (name) lookup();
  });
</script>

{#snippet slot(type: string, g: Gear | undefined, side: string, rg: string)}
  {@const q = g?.quality || ""}
  <li class="ch-slot {side}" class:empty={!g}>
    {#if g}
      <a class="wh ch-slot-link" href="https://www.wowhead.com/forever/item={g.id}" target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">
        <span class="ch-ico" data-q={q}>{#if g.icon}<img src={iconUrl(g.icon, rg, 56)} alt="" width="44" height="44" loading="lazy" decoding="async" />{/if}</span>
        <span class="ch-txt">
          <span class="ch-iname q-{q || 'common'}">{g.name || "Item #" + g.id}</span>
          <span class="ch-meta">{SLOT_LABEL[type] || g.slot || ""}{#if g.level}{" · "}<span class="ch-ilvl">ilvl {g.level}</span>{/if}</span>
          {#if g.enchant}<span class="ch-ench">{g.enchant}</span>{/if}
        </span>
      </a>
    {:else}
      <span class="ch-slot-link" aria-label="{SLOT_LABEL[type]}: empty">
        <span class="ch-ico" aria-hidden="true"></span>
        <span class="ch-txt" aria-hidden="true"><span class="ch-meta">{SLOT_LABEL[type]}</span></span>
      </span>
    {/if}
  </li>
{/snippet}

<form class="panel ch-form" onsubmit={(e) => { e.preventDefault(); lookup(); }}>
  <div><label class="field-label" for="ch-region">Region</label>
    <select class="input" id="ch-region" bind:value={region}><option value="eu">Europe</option><option value="kr">Korea</option><option value="tw">Taiwan</option></select></div>
  <div class="ch-name"><label class="field-label" for="ch-name">Character name</label>
    <input class="input" id="ch-name" placeholder="Firstname Lastname" autocomplete="off" maxlength="40" aria-describedby="ch-hint" bind:value={name} bind:this={nameBox} /></div>
  <button class="btn" type="submit" disabled={view.kind === "loading"} aria-busy={view.kind === "loading"}>{#if view.kind === "loading"}<span class="spinner spinner-on-gold" aria-hidden="true"></span>Looking up…{:else}Look up{/if}</button>
  <p class="faint" id="ch-hint">Forever characters have a first and last name, e.g. "Thrallina Stormhoof". The character must be level 10+ and have logged out at least once since.</p>
</form>

<div id="ch-result" aria-live="polite">
  {#if view.kind === "loading"}
    <div class="panel ch-card ch-skeleton" aria-busy="true">
      <div class="ch-head">
        <span class="ch-avatar sk-block"></span>
        <div><Loading text={"Looking up " + view.name + " on Blizzard's servers…"} /><span class="sk-bar" style="width:220px;display:block;margin-top:10px"></span></div>
      </div>
      <div class="ch-doll" aria-hidden="true">
        <ul class="ch-col left">{#each LEFT as _}<li class="ch-slot"><span class="ch-slot-link"><span class="ch-ico sk-block"></span><span class="ch-txt"><span class="sk-bar" style="width:70%"></span></span></span></li>{/each}</ul>
        <div class="ch-stage sk-block"></div>
        <ul class="ch-col right">{#each RIGHT as _}<li class="ch-slot right"><span class="ch-slot-link"><span class="ch-ico sk-block"></span><span class="ch-txt"><span class="sk-bar" style="width:70%"></span></span></span></li>{/each}</ul>
      </div>
    </div>
  {:else if view.kind === "error"}<div class="panel note warn">{view.message}</div>
  {:else if view.kind === "ok"}
    {@const d = view.d}
    {@const c = d.character}
    {@const cid = String(c.class || "").toLowerCase()}
    {@const L = layout(d)}
    {@const fac = String(c.faction || "").toLowerCase()}
    <article class="panel ch-card" style={CLASS_IDS.includes(cid) ? `--cc: var(--c-${cid})` : undefined}>
      <div class="ch-head">
        {#if c.avatar}<img class="ch-avatar" src={c.avatar} alt="" width="84" height="84" />{:else}<span class="class-icon ch-avatar" aria-hidden="true">{(c.class || "?").charAt(0)}</span>{/if}
        <div>
          <h2>{[c.name, c.surname].filter(Boolean).join(" ") || c.slug}</h2>
          <p class="ch-sub">Level {c.level} {c.race || ""} <b style="color:var(--cc, var(--gold))">{c.class || ""}</b>{#if c.guild}{" "}<span class="ch-guild">&lt;{c.guild}&gt;</span>{/if}</p>
          <p class="faint ch-facts">
            {#if fac === "horde" || fac === "alliance"}<span class="ch-fact"><Icon name={fac} size={18} />{c.faction}</span>{:else if c.faction}<span class="ch-fact">{c.faction}</span>{/if}
            {#if c.ruleset}<span class="ch-fact">{c.ruleset} ruleset</span>{/if}
            <span class="ch-fact">{d.region.toUpperCase()}</span>
            {#if c.lastLogin}<span class="ch-fact">Last logged in {ago(c.lastLogin)}</span>{/if}
          </p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="ch-share" onclick={() => share(d)}><Icon name="link" size={16} />Copy link</button>
      </div>
      <p class="note fresh">{#if d.blizzardUpdated}<b>Blizzard last updated this profile {ago(d.blizzardUpdated)}</b> ({localTime(d.blizzardUpdated)}).{" "}{/if}Profiles only refresh after the character logs out, and Blizzard can take several hours (sometimes until the next day), so very recent gear or skill changes may not show yet.{d.partial ? " Some sections aren't available yet." : ""}</p>

      <section class="ch-doll-wrap" aria-labelledby="ch-gear-title">
        <h3 id="ch-gear-title" class="ch-h">Equipped gear{#if L.avg}<span class="ch-avg">Average item level <b>{L.avg}</b></span>{/if}</h3>
        {#if d.gear.length}
          <div class="ch-doll">
            <ul class="ch-col left">{#each LEFT as t}{@render slot(t, L.by[t], "left", d.region)}{/each}</ul>
            <div class="ch-stage" class:has-render={c.render && !renderFailed} class:raw={c.renderRaw}>
              {#if c.render && !renderFailed}
                <img class="ch-render" src={c.render} alt="{[c.name, c.surname].filter(Boolean).join(' ')}, as rendered by Blizzard" onerror={() => (renderFailed = true)} />
              {:else}
                <div class="ch-portrait">
                  {#if c.inset || c.avatar}<img src={c.inset || c.avatar} alt="" />{:else}<span class="ch-initial" aria-hidden="true">{(c.class || "?").charAt(0)}</span>{/if}
                </div>
              {/if}
              <div class="ch-plate">
                <b>{c.name || c.slug}</b>
                <span>Level {c.level} <span style="color:var(--cc, var(--gold))">{c.class || ""}</span></span>
              </div>
            </div>
            <ul class="ch-col right">{#each RIGHT as t}{@render slot(t, L.by[t], "right", d.region)}{/each}</ul>
            <ul class="ch-weapons">{#each WEAPONS as t}{@render slot(t, L.by[t], "weapon", d.region)}{/each}{#if L.by.AMMO}{@render slot("AMMO", L.by.AMMO, "weapon", d.region)}{/if}{#each L.extra as g}{@render slot(g.slotType || "", g, "weapon", d.region)}{/each}</ul>
          </div>
        {:else}<p class="faint">No gear data.</p>{/if}
      </section>

      <div class="grid grid-2 ch-sections">
        <section aria-labelledby="ch-prof-title">
          <h3 id="ch-prof-title" class="ch-h">Professions</h3>
          {#if d.professions.length}
            <ul class="ch-prof">
              {#each d.professions as p}
                {@const icon = profIcon(p)}
                <li>
                  <span class="ch-prof-ico" style:background-image={icon ? `url(${icon})` : undefined} aria-hidden="true"></span>
                  <div class="ch-skillbar" role="img" aria-label="{p.name}: {p.skill ?? '?'}{p.max ? ' of ' + p.max : ''}">
                    <i style:width="{pct(p.skill, p.max)}%"></i>
                    <span class="ch-skill-name">{p.name}</span>
                    <span class="ch-skill-num">{p.skill != null ? p.skill + (p.max ? " / " + p.max : "") : ""}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}<p class="faint">No professions learned.</p>{/if}
        </section>
        <section aria-labelledby="ch-rep-title">
          <h3 id="ch-rep-title" class="ch-h">Top reputations</h3>
          {#if d.reputations.length}
            <ul class="ch-rep">
              {#each d.reputations as r}
                {@const st = STANDING[String(r.standing || "").toLowerCase()] || "neutral"}
                <li>
                  <div class="ch-repbar st-{st}" role="img" aria-label="{r.faction}: {r.standing || 'unknown'}{r.max ? ', ' + (r.value || 0) + ' of ' + r.max : ''}">
                    <i style:width="{r.max ? pct(r.value, r.max) : st === 'exalted' ? 100 : 0}%"></i>
                    <span class="ch-skill-name">{r.faction}</span>
                    <span class="ch-skill-num">{r.standing || ""}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}<p class="faint">No reputation data.</p>{/if}
        </section>
      </div>
      <p class="faint">Fetched {new Date(d.fetched).toLocaleString()}. Data and character images provided by Blizzard Entertainment.</p>
    </article>
  {/if}
</div>
