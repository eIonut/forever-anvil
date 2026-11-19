<script lang="ts">
  // A price in copper as in the game's money frame: number + gold/silver/copper coin icon.
  // The g/s/c letters stay in the text (visually hidden) for screen readers and copy-paste.
  import { coins } from "../lib/format";

  let { c }: { c: number | null | undefined } = $props();
  const m = $derived(coins(c));
</script>

{#if m}<span class="money">{#if m.g}<span class="coin g">{m.g.toLocaleString("en-US")}<span class="sr-only">g</span></span>{/if}{#if m.g || m.s}<span class="coin s">{m.s}<span class="sr-only">s</span></span>{/if}<span class="coin c">{m.c}<span class="sr-only">c</span></span></span>{:else}<span class="faint">-</span>{/if}
