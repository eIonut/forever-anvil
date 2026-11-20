<script lang="ts">
  // "Updated 12 min ago · all 12 EU auction houses, every hour · from Blizzard, no addon needed"
  // Shown on every price view. Our edge over scan-based sites is that every auction house is read from
  // Blizzard's API every hour, with nobody needing to run an addon, so we say so wherever prices appear.
  //   updated: when the prices on screen were taken (a tool's group file). Left out on pages built once a
  //            day (item, recipe pages): then it reads the price job's last run from the meta file.
  //   live:    on those static pages, label it as the live prices (the page itself is a daily snapshot).
  import { onMount } from "svelte";
  import { getJSON, localTime, priceUrl } from "../lib/api";
  import type { Meta } from "./types";

  let { region = "eu", updated = null, live = false }: { region?: string; updated?: string | null; live?: boolean } = $props();

  const REGION_NAMES: Record<string, string> = { eu: "EU", us: "US", kr: "Korean", tw: "Taiwanese" };
  const STALE_MS = 2 * 3600_000; // the job runs hourly; past two hours something is late

  let meta = $state.raw<(Meta & { lastRun?: string; houses?: number }) | null>(null);
  let now = $state(Date.now());

  const when = $derived(updated || meta?.lastRun || null);
  const age = $derived(when ? now - new Date(when).getTime() : NaN);
  // every auction house that had listings in the last run; older meta files only list the groups (3 houses each)
  const houses = $derived(meta?.houses || (meta?.groups?.length ? meta.groups.length * 3 : 0));

  function short(ms: number): string {
    const m = Math.round(ms / 60000);
    if (m < 2) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? " hour ago" : " hours ago");
    return Math.round(h / 24) + " days ago";
  }

  onMount(() => {
    getJSON<Meta & { lastRun?: string; houses?: number }>(priceUrl("meta", region)).then((m) => (meta = m));
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
</script>

{#if when && !isNaN(age)}
  <p class="freshness" class:stale={age > STALE_MS}>
    <span class="fr-dot" aria-hidden="true"></span>
    <span>{live ? "Live prices updated" : "Updated"} <time datetime={when} title={localTime(when)}>{short(age)}</time></span>
    {#if age > STALE_MS}
      <span class="fr-sep" aria-hidden="true">·</span><span>the hourly update is running late, so prices may have moved</span>
    {:else}
      {#if houses}<span class="fr-sep" aria-hidden="true">·</span><span>all {houses} {REGION_NAMES[region] || region.toUpperCase()} auction houses, every hour</span>{/if}
      <span class="fr-sep" aria-hidden="true">·</span><span>straight from Blizzard, no addon needed</span>
    {/if}
  </p>
{/if}

