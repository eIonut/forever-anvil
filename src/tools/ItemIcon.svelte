<script lang="ts">
  // Small item icon (a blank of the same size when there's none, so lists stay aligned).
  import { iconUrl } from "../lib/pricemath.js";
  import { itemSource } from "./itemIcons.svelte";

  let { id }: { id: number | string | null | undefined } = $props();
  const info = $derived((id != null && itemSource.items[id]) || []);
  const url = $derived(iconUrl(info[6], itemSource.region, 36));
</script>

{#if url}<img class="item-icon{info[4] ? ' qb-' + info[4] : ''}" src={url} alt="" width="20" height="20" loading="lazy" decoding="async" />{:else}<span class="item-icon" aria-hidden="true"></span>{/if}
