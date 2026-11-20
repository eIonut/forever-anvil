<script lang="ts">
  // Star button that adds an item to the visitor's watchlist, or removes it. The click is handled once for
  // the whole site in src/lib/watchlist.ts. Astro twin: src/components/WatchStar.astro.
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import { watch } from "./watch.svelte";

  let { id, name, large = false }: { id: number; name: string; large?: boolean } = $props();
  onMount(() => watch.init());
  const on = $derived(watch.ids.has(id));
</script>

<button type="button" class="watch-star" class:watch-star-lg={large} data-watch-id={id} data-watch-name={name} aria-pressed={on} aria-label="Watch {name}" title={on ? "On your watchlist (click to remove)" : "Add to your watchlist"}>
  <Icon name="star" size={large ? 20 : 15} line />
</button>
