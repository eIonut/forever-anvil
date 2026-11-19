<script lang="ts">
  // A price in copper as coloured coins: 1,234g 40s 5c (readable without colour too).
  import { coins } from "../lib/format";

  let { c }: { c: number | null | undefined } = $props();
  const m = $derived(coins(c));
</script>

{#if m}<span class="money">{#if m.g}<span class="coin g">{m.g.toLocaleString()}g</span>{" "}{/if}{#if m.g || m.s}<span class="coin s">{m.s}s</span>{" "}{/if}<span class="coin c">{m.c}c</span></span>{:else}<span class="faint">—</span>{/if}
