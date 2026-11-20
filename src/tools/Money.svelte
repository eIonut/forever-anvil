<script lang="ts">
  // A price in copper as in the game's money frame: number + gold/silver/copper coin icon.
  // The g/s/c letters stay in the text (visually hidden) for screen readers and copy-paste.
  import { coins } from "../lib/format";

  // short: leave out the copper once a price reaches a gold (for tight tables)
  let { c, short = false }: { c: number | null | undefined; short?: boolean } = $props();
  const m = $derived(coins(c));
</script>

{#if m}<span class="money">{#if m.g}<span class="coin g">{m.g.toLocaleString("en-US")}<span class="sr-only">g</span></span>{/if}{#if m.g || m.s}<span class="coin s">{m.s}<span class="sr-only">s</span></span>{/if}{#if !(short && m.g)}<span class="coin c">{m.c}<span class="sr-only">c</span></span>{/if}</span>{:else}<span class="faint">-</span>{/if}
