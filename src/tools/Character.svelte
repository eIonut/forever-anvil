<script lang="ts">
  // Character lookup: asks /api/character (the Worker in production, the dev server locally),
  // which fetches the public profile from Blizzard. /character?r=eu&n=Name-Surname shares a lookup.
  import { onMount, tick } from "svelte";
  import config from "../config.js";
  import { ago, copyText, localTime } from "../lib/api";
  import { announce } from "../lib/announce";
  import { load, save } from "../lib/store";
  import { setupWowhead } from "../lib/wowhead";

  interface Result {
    region: string;
    fetched: string;
    blizzardUpdated?: string;
    partial?: boolean;
    character: { name?: string; surname?: string; slug: string; level: number; race?: string; class?: string; guild?: string; faction?: string; ruleset?: string; lastLogin?: string; avatar?: string };
    gear: { slot?: string; id: number; name?: string; quality?: string; level?: number }[];
    professions: { name: string; skill?: number | null; max?: number }[];
    reputations: { faction: string; standing?: string }[];
  }

  // classes with a colour variable (--c-<id>) in style.css
  const CLASS_IDS = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
  const QUAL: Record<string, string> = { poor: "q-poor", common: "q-common", uncommon: "q-uncommon", rare: "q-rare", epic: "q-epic", legendary: "q-legendary" };
  const ERR: Record<string, string> = {
    "not-found": "We couldn't find that character. Check the spelling (first and last name), and note that characters only appear after reaching level 10 and logging out once.",
    "bad-name": "Please enter a first and last name, like \"Thrallina Stormhoof\".",
    "too-many": "Too many lookups in a short time — wait a minute and try again.",
    "not-configured": "The character lookup isn't set up on this server yet (missing Blizzard API keys).",
    unavailable: "Blizzard's character service didn't answer. Please try again in a few minutes.",
  };

  let region = $state("eu"), name = $state("");
  let view = $state.raw<{ kind: "none" } | { kind: "loading"; name: string } | { kind: "error"; message: string } | { kind: "ok"; d: Result }>({ kind: "none" });
  let shareLabel = $state("Copy link");
  let nameBox: HTMLInputElement;

  async function lookup() {
    const n = name.trim(), r = region;
    if (!n) { nameBox.focus(); return; }
    save("codex-char", { region: r });
    view = { kind: "loading", name: n };
    const base = ((config as { characterApi?: string }).characterApi || "/api").replace(/\/$/, "");
    try {
      const res = await fetch(base + "/character?region=" + encodeURIComponent(r) + "&name=" + encodeURIComponent(n));
      const d = await res.json().catch(() => ({ error: "unavailable" }));
      if (!d || d.error) { view = { kind: "error", message: ERR[d && d.error] || ERR.unavailable }; return; }
      shareLabel = "Copy link";
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
    if (await copyText(url, "Copy this link:")) { announce("Link copied"); shareLabel = "Copied!"; }
  }

  onMount(() => {
    const params = new URLSearchParams(location.search);
    region = params.get("r") || load<{ region?: string }>("codex-char")?.region || "eu";
    name = (params.get("n") || "").replace(/-/g, " ");
    if (name) lookup();
  });
</script>

<form class="panel ch-form" onsubmit={(e) => { e.preventDefault(); lookup(); }}>
  <div><label class="field-label" for="ch-region">Region</label>
    <select class="input" id="ch-region" bind:value={region}><option value="eu">Europe</option><option value="us">Americas &amp; Oceania</option><option value="kr">Korea</option><option value="tw">Taiwan</option></select></div>
  <div class="ch-name"><label class="field-label" for="ch-name">Character name</label>
    <input class="input" id="ch-name" placeholder="Firstname Lastname" autocomplete="off" maxlength="40" aria-describedby="ch-hint" bind:value={name} bind:this={nameBox} /></div>
  <button class="btn" type="submit">Look up</button>
  <p class="faint" id="ch-hint">Forever characters have a first and last name, e.g. "Thrallina Stormhoof". The character must be level 10+ and have logged out at least once since.</p>
</form>

<div id="ch-result" aria-live="polite">
  {#if view.kind === "loading"}<p class="faint">Looking up {view.name}…</p>
  {:else if view.kind === "error"}<div class="panel note warn">{view.message}</div>
  {:else if view.kind === "ok"}
    {@const d = view.d}
    {@const c = d.character}
    {@const cid = String(c.class || "").toLowerCase()}
    <article class="panel ch-card" style={CLASS_IDS.includes(cid) ? `--cc: var(--c-${cid})` : undefined}>
      <div class="ch-head">
        {#if c.avatar}<img class="ch-avatar" src={c.avatar} alt="" width="84" height="84" />{:else}<span class="class-icon ch-avatar" aria-hidden="true">{(c.class || "?").charAt(0)}</span>{/if}
        <div>
          <h2>{[c.name, c.surname].filter(Boolean).join(" ") || c.slug}</h2>
          <p class="ch-sub">Level {c.level} {c.race || ""} <b style="color:var(--cc, var(--gold))">{c.class || ""}</b>{c.guild ? " · <" + c.guild + ">" : ""}</p>
          <p class="faint">{[c.faction, c.ruleset ? c.ruleset + " ruleset" : null, d.region.toUpperCase(), c.lastLogin ? "last logged in " + ago(c.lastLogin) : null].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="ch-share" onclick={() => share(d)}>{shareLabel}</button>
      </div>
      <p class="note fresh">{#if d.blizzardUpdated}<b>Blizzard last updated this profile {ago(d.blizzardUpdated)}</b> ({localTime(d.blizzardUpdated)}).{" "}{/if}Profiles only refresh after the character logs out, and Blizzard can take several hours — sometimes until the next day — so very recent gear or skill changes may not show yet.{d.partial ? " Some sections aren't available yet." : ""}</p>
      <div class="grid grid-2 ch-sections">
        <section>
          <h3>Equipped gear</h3>
          {#if d.gear.length}
            <ul class="ch-gear">
              {#each d.gear as g}<li><span class="slot">{g.slot || ""}</span><a class="wh {QUAL[g.quality || ''] || ''}" href="https://www.wowhead.com/forever/item={g.id}" target="_blank" rel="noopener nofollow" data-wh-rename-link="false">{g.name || "Item #" + g.id}</a>{#if g.level}{" "}<span class="faint">ilvl {g.level}</span>{/if}</li>{/each}
            </ul>
          {:else}<p class="faint">No gear data.</p>{/if}
        </section>
        <section>
          <h3>Professions</h3>
          {#if d.professions.length}
            <ul class="ch-prof">
              {#each d.professions as p}<li><span>{p.name}</span><b>{p.skill != null ? p.skill + (p.max ? " / " + p.max : "") : ""}</b><div class="progress" aria-hidden="true"><i style="width:{p.max ? Math.round((p.skill || 0) / p.max * 100) : 0}%"></i></div></li>{/each}
            </ul>
          {:else}<p class="faint">No professions learned.</p>{/if}
          <h3 style="margin-top:18px">Top reputations</h3>
          {#if d.reputations.length}
            <ul class="clean ch-rep">{#each d.reputations as r}<li><span>{r.faction}</span> <b class="faint">{r.standing || ""}</b></li>{/each}</ul>
          {:else}<p class="faint">No reputation data.</p>{/if}
        </section>
      </div>
      <p class="faint">Fetched {new Date(d.fetched).toLocaleString()}. Data provided by Blizzard Entertainment.</p>
    </article>
  {/if}
</div>
