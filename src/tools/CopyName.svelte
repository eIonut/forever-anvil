<script lang="ts">
  // Small button that copies an item's name, for pasting into the in-game Auction House search.
  // The click is handled once for the whole site in src/lib/copyname.ts. Astro twin: src/components/CopyName.astro.
  import Icon from "./Icon.svelte";
  let { name, large = false }: { name: string; large?: boolean } = $props();
</script>

<button type="button" class="copy-name" class:copy-name-lg={large} data-copy-name={name} title="Copy name for the Auction House search" aria-label="Copy name: {name}">
  <span class="copy-name-idle"><Icon name="copy" size={large ? 20 : 15} line /></span>
  <span class="copy-name-done"><Icon name="check" size={large ? 20 : 15} line /></span>
</button>
