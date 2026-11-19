<script lang="ts">
  // One of the site's icons, for the Svelte tools: Blizzard's game icon when the name is in WOW_ICONS
  // (src/lib/icons.ts), otherwise a line icon (Lucide). Decorative only.
  import { ICONS, wowIcon, type AnyIconName } from "../lib/icons";
  let { name, size = 24, stroke = 2, line = false }: { name: AnyIconName; size?: number; stroke?: number; line?: boolean } = $props();
  const wow = $derived(line ? undefined : wowIcon(name));
</script>

{#if wow}
  <span class="icon wow-icon" style:width="{size}px" style:height="{size}px" style:background-image="url({wow})" aria-hidden="true"></span>
{:else}
  <svg class="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{@html ICONS[name as keyof typeof ICONS]}</svg>
{/if}
