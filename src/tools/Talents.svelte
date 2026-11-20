<script lang="ts">
  // Talent calculator with the real WoW: Forever trees (from Blizzard's API, saved by the price job).
  // The build lives in the address (#c=mage&b=...&l=40), so a link shares it; rules in src/lib/talentmath.js.
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import * as TM from "../lib/talentmath.js";
  import { copyText, getJSON, priceUrl } from "../lib/api";
  import { announce } from "../lib/announce";
  import { notify } from "../lib/notify";
  import { load, save } from "../lib/store";

  let { children }: { children?: Snippet } = $props();

  /** [nodeId, row, col, name, icon, [rank descriptions], [required node ids]] */
  type Node = [number, number, number, string, string | null, string[], number[]];
  interface Spec { id: number; name: string; icon: string | null; nodes: Node[] }
  interface Cls { id: number; name: string; icon: string | null; specs: Spec[] }
  type Build = Record<number, Record<string, number>>;

  const SAVE_KEY = "codex-talents";
  let data = $state.raw<{ classes: Cls[] } | null>(null);
  let empty = $state(false);
  let cls = $state.raw<Cls | null>(null);
  let build = $state<Build>({});
  let level = $state(60);
  let selected = $state<{ t: number; id: number } | null>(null);
  let tip = $state<{ t: number; id: number; left: number; top: number } | null>(null);
  let shake = $state("");
  let shareLabel = $state("Copy build link");
  let app: HTMLElement, tipBox: HTMLElement;

  const specs = $derived(cls?.specs || []);
  const available = $derived(TM.pointsForLevel(level));
  const spent = $derived(TM.total(build));
  const find = (t: number, id: number | string) => specs[t]?.nodes.find((n) => String(n[0]) === String(id));
  const btnOf = (t: number, id: number) => app?.querySelector<HTMLButtonElement>(`.tc-talent[data-t="${t}"][data-n="${id}"]`);

  function nodeState(t: number, n: Node) {
    const r = TM.rankOf(build, t, n), max = TM.maxRank(n);
    if (r >= max) return "max";
    if (r > 0) return "partial";
    return TM.whyLocked(specs, build, t, n, available) ? "locked" : "open";
  }
  function reqText(t: number, n: Node) {
    const why = TM.whyLocked(specs, build, t, n, available);
    if (!why || why === "max") return "";
    if (why === "no-points") return "No talent points left at level " + level + ".";
    if (why.startsWith("row:")) return "Requires " + why.slice(4) + " points in " + specs[t].name + ".";
    const req = specs[t].nodes.find((x) => String(x[0]) === why.slice(4));
    return req ? "Requires " + TM.maxRank(req) + " point" + (TM.maxRank(req) > 1 ? "s" : "") + " in " + req[3] + "." : "";
  }
  function label(t: number, n: Node) {
    const req = reqText(t, n);
    return n[3] + ", rank " + TM.rankOf(build, t, n) + " of " + TM.maxRank(n) + "." + (req ? " " + req : "");
  }
  // arrows from each prerequisite (row, col) to the talent that needs it, in grid units
  function arrows(t: number, s: Spec) {
    const out: { d: string; met: boolean }[] = [];
    for (const n of s.nodes) for (const req of n[6]) {
      const p = s.nodes.find((x) => x[0] === req);
      if (!p) continue;
      const met = TM.rankOf(build, t, p) >= TM.maxRank(p);
      let x1 = (p[2] - 0.5) * 100, y1 = (p[1] - 0.5) * 100 + 30, x2 = (n[2] - 0.5) * 100, y2 = (n[1] - 0.5) * 100 - 32;
      if (p[1] === n[1]) { y1 = y2 = (n[1] - 0.5) * 100; x1 += n[2] > p[2] ? 32 : -32; x2 += n[2] > p[2] ? -32 : 32; }
      const bend = p[2] !== n[2] && p[1] !== n[1] ? " L" + x1 + " " + (y1 + y2) / 2 + " L" + x2 + " " + (y1 + y2) / 2 : "";
      out.push({ d: "M" + x1 + " " + y1 + bend + " L" + x2 + " " + y2, met });
    }
    return out;
  }

  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    return { c: h.get("c"), b: h.get("b"), l: parseInt(h.get("l") || "", 10) };
  }

  function selectClass(name: string, code: string | null) {
    cls = data!.classes.find((c) => c.name.toLowerCase() === name) || data!.classes[0];
    // links can be hand-edited: re-apply the real rules before showing a shared build
    build = code ? (TM.sanitize(cls.specs, TM.decode(cls.specs, code), TM.pointsForLevel(level)) as Build) : {};
    selected = null;
  }

  // keep the address and the saved build up to date
  $effect(() => {
    if (!cls) return;
    const code = TM.encode(specs, build);
    const hash = "c=" + encodeURIComponent(cls.name.toLowerCase()) + (code !== "-" && code.replace(/-/g, "") ? "&b=" + code : "") + (level !== 60 ? "&l=" + level : "");
    history.replaceState(null, "", "#" + hash);
    save(SAVE_KEY, { c: cls.name.toLowerCase(), b: code, l: level });
  });

  async function showTip(t: number, n: Node) {
    tip = { t, id: n[0], left: 0, top: 0 };
    await tick();
    const btn = btnOf(t, n[0]);
    if (!btn || !tip || !tipBox) return;
    const b = btn.getBoundingClientRect(), a = app.getBoundingClientRect();
    let left = Math.min(b.right - a.left + 10, a.width - tipBox.offsetWidth - 8);
    if (b.right + tipBox.offsetWidth + 20 > window.innerWidth) left = Math.max(8, b.left - a.left - tipBox.offsetWidth - 10);
    tip = { t, id: n[0], left, top: b.top - a.top };
  }

  function change(t: number, n: Node, dir: 1 | -1) {
    const ok = dir > 0 ? TM.add(specs, build, t, n, available) : TM.remove(specs, build, t, n);
    if (!ok) {
      announce(dir > 0 ? reqText(t, n) || n[3] + " is at max rank." : "Can't unlearn " + n[3] + ": other talents depend on it.");
      shake = t + ":" + n[0];
      setTimeout(() => (shake = ""), 300);
    }
    selected = { t, id: n[0] };
    if (tip) showTip(t, n);
    if (ok) announce(n[3] + " rank " + TM.rankOf(build, t, n) + " of " + TM.maxRank(n) + ". " + (TM.pointsForLevel(level) - TM.total(build)) + " points left.");
  }

  function keydown(e: KeyboardEvent, t: number, n: Node) {
    if (e.key === "Delete" || e.key === "Backspace" || e.key === "-") { e.preventDefault(); change(t, n, -1); }
    else if (e.key === "+") { e.preventDefault(); change(t, n, 1); }
  }

  function detailAction(act: "plus" | "minus" | "close") {
    if (!selected) return;
    const { t, id } = selected;
    if (act === "close") { selected = null; btnOf(t, id)?.focus({ preventScroll: true }); return; }
    const n = find(t, id);
    if (n) change(t, n, act === "plus" ? 1 : -1);
  }

  async function share() {
    if (await copyText(location.href, "Copy this link:")) {
      notify("Build link copied");
      shareLabel = "Link copied!";
      setTimeout(() => (shareLabel = "Copy build link"), 2500);
    }
  }

  onMount(() => {
    getJSON<{ classes: Cls[] }>(priceUrl("talents", "eu")).then((d) => {
      if (!d?.classes) { empty = true; return; }
      data = d;
      const h = readHash(), saved = load<{ c?: string; b?: string; l?: number }>(SAVE_KEY) || {};
      const pick = h.c || saved.c || "warrior";
      level = h.l || saved.l || 60;
      selectClass(pick, h.c ? h.b : pick === saved.c ? saved.b || null : null);
    });
    const onHash = () => {
      const h = readHash();
      if (data && h.c) { level = h.l || 60; selectClass(h.c, h.b); }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
</script>

{#snippet describe(t: number, n: Node)}
  {@const r = TM.rankOf(build, t, n)}
  {@const max = TM.maxRank(n)}
  {@const req = reqText(t, n)}
  {@const next = r > 0 && r < max ? n[5][r] : null}
  <b class="tc-tip-name">{n[3]}</b><span class="tc-tip-rank">Rank {r}/{max}</span>{#if req}<p class="tc-req">{req}</p>{/if}<p>{r > 0 ? n[5][r - 1] : n[5][0]}</p>{#if next}<p class="tc-next"><b>Next rank:</b> {next}</p>{/if}
{/snippet}

<div class="wrap section" hidden={!empty}><div class="panel"><h2>No talent data yet</h2><p>Run <code>npm run prices</code>, then reload this page.</p></div></div>

<div class="wrap section tc-app" hidden={empty} bind:this={app} style={cls ? `--cc: var(--c-${cls.name.toLowerCase()})` : undefined}>
  <nav class="tc-classes" role="group" aria-label="Choose a class">
    {#each data?.classes || [] as c (c.id)}
      {@const on = cls === c}
      <button type="button" class="tc-class" class:active={on} data-c={c.name.toLowerCase()} aria-pressed={on} style="--cc:var(--c-{c.name.toLowerCase()})"
        onclick={() => { selectClass(c.name.toLowerCase(), null); announce(cls!.name + " talents"); }}>
        {#if c.icon}<img src={c.icon} alt="" width="28" height="28" />{/if}<span>{c.name}</span>
      </button>
    {/each}
  </nav>

  <div class="panel tc-summary">
    <div class="tc-build">
      <span class="eyebrow-sm">Your build</span>
      <h2><span>{cls?.name || ""}</span> <span class="tc-split" aria-hidden="true">{specs.map((s, t) => TM.treeTotal(build, t)).join(" / ")}</span></h2>
      <p class="sr-only">{specs.map((s, t) => s.name + " " + TM.treeTotal(build, t)).join(", ")}</p>
    </div>
    <div class="tc-points">
      <label for="tc-level" class="field-label">Level</label>
      <input class="input" id="tc-level" type="number" min="10" max="60" value={level}
        onchange={(e) => { level = Math.max(10, Math.min(60, parseInt(e.currentTarget.value, 10) || 60)); e.currentTarget.value = String(level); }} />
    </div>
    <div class="tc-left-box"><b class:over={spent > available}>{cls ? available - spent : 51}</b><span>points left</span></div>
    <div class="tc-progress"><div class="progress" aria-hidden="true"><i style="width:{Math.min(100, available ? spent / available * 100 : 0)}%"></i></div><span class="faint">{cls ? spent + " / " + available + " spent" : ""}</span></div>
    <div class="tc-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => { build = {}; selected = null; notify("All talents reset", "info"); }}>Reset all</button>
      <button type="button" class="btn btn-sm" onclick={share}>{shareLabel}</button>
    </div>
  </div>
  <p class="faint tc-help">Click a talent to learn it · right-click (or Shift-click) to unlearn · keyboard: Tab to a talent, Enter to learn, Delete to unlearn. Numbers on the left are the points needed in that tree to unlock each row.</p>

  <div class="tc-trees">
    {#each specs as s, t (s.id)}
      <section class="tc-tree" aria-labelledby="tc-tree-{t}" style="--spec-icon:url('{s.icon || ''}')">
        <header class="tc-tree-head">
          {#if s.icon}<img src={s.icon} alt="" width="30" height="30" />{/if}
          <h2 id="tc-tree-{t}">{s.name}</h2><span class="tc-tree-pts">{TM.treeTotal(build, t)}</span>
          <button type="button" class="icon-btn tc-reset-tree" title="Reset {s.name}" onclick={() => { delete build[t]; selected = null; announce("Tree reset"); }}><span aria-hidden="true">↺</span><span class="sr-only">Reset {s.name}</span></button>
        </header>
        <div class="tc-grid">
          <svg class="tc-lines" viewBox="0 0 400 700" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="tc-head-off" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" class="tc-arrowhead" /></marker>
              <marker id="tc-head-met" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" class="tc-arrowhead met" /></marker>
            </defs>
            {#each arrows(t, s) as a}<path class="tc-arrow" class:met={a.met} d={a.d} marker-end="url(#tc-head-{a.met ? 'met' : 'off'})" />{/each}
          </svg>
          {#each [1, 2, 3, 4, 5, 6, 7] as row}<span class="tc-rowlabel" style="grid-row:{row}" aria-hidden="true">{(row - 1) * 5}</span>{/each}
          {#each s.nodes as n (n[0])}
            {@const st = nodeState(t, n)}
            <button type="button" class="tc-talent s-{st}" class:tc-shake={shake === t + ":" + n[0]} style="grid-row:{n[1]};grid-column:{n[2] + 1}" data-t={t} data-n={n[0]}
              aria-label={label(t, n)} aria-disabled={st === "locked" ? "true" : undefined}
              onclick={(e) => change(t, n, e.shiftKey ? -1 : 1)}
              oncontextmenu={(e) => { e.preventDefault(); change(t, n, -1); }}
              onkeydown={(e) => keydown(e, t, n)}
              onmouseenter={() => showTip(t, n)} onmouseleave={() => (tip = null)}
              onfocus={() => { showTip(t, n); selected = { t, id: n[0] }; }} onblur={() => (tip = null)}>
              {#if n[4]}<img src={n[4]} alt="" width="44" height="44" loading="lazy" />{/if}<span class="tc-rank" aria-hidden="true">{TM.rankOf(build, t, n)}/{TM.maxRank(n)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <div class="tc-tip" role="tooltip" hidden={!tip} bind:this={tipBox} style={tip ? `left:${tip.left}px;top:${tip.top}px` : undefined}>
    {#if tip}{@const n = find(tip.t, tip.id)}{#if n}{@render describe(tip.t, n)}<p class="faint tc-tip-help">Click to learn · right-click to unlearn</p>{/if}{/if}
  </div>
  <section class="panel tc-detail" aria-live="polite" aria-label="Selected talent" hidden={!selected}>
    {#if selected}{@const n = find(selected.t, selected.id)}{#if n}
      <div class="tc-detail-icon">{#if n[4]}<img src={n[4]} alt="" width="48" height="48" />{/if}</div><div>{@render describe(selected.t, n)}</div>
      <div class="tc-detail-btns"><button type="button" class="btn btn-ghost btn-sm" onclick={() => detailAction("minus")}>− Unlearn</button><button type="button" class="btn btn-sm" onclick={() => detailAction("plus")}>+ Learn</button><button type="button" class="btn btn-ghost btn-sm" onclick={() => detailAction("close")}>Close</button></div>
    {/if}{/if}
  </section>

  {@render children?.()}
</div>
