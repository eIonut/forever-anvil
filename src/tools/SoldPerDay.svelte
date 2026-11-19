<script lang="ts" module>
  /** 1234 → "1.2k", 42.3 → "42", 3.46 → "3.5", 0.4 → "<1", 0 → "0" */
  export function soldText(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    if (n >= 10) return String(Math.round(n));
    if (n >= 1) return n.toFixed(1).replace(/\.0$/, "");
    return n > 0 ? "<1" : "0";
  }
  /** "from the last 5 hours" / "from the last 3 days" */
  export function salesBasis(hours: number | undefined): string {
    if (!hours) return "";
    return hours < 48 ? `from the last ${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? "" : "s"} of trading` : `from the last ${Math.round(hours / 24)} days of trading`;
  }
</script>

<script lang="ts">
  // Estimated units sold per day for one item on one auction house (see pipeline/sales.js).
  // Shows "-" while the price job is still collecting its first hours of auction changes.
  import type { ItemPrice } from "./types";

  let { a, hours, suffix = "/day" }: { a: ItemPrice | null | undefined; hours: number | undefined; suffix?: string } = $props();
  const n = $derived(a?.[4] || 0);
</script>

{#if !hours}<span class="sold faint" title="Sales are still being counted. Check back in an hour or two.">-</span>
{:else}<span class="sold" class:faint={!n} title="About {n > 0 && n < 1 ? 'less than one' : soldText(n)} sold per day, estimated {salesBasis(hours)}">{soldText(n)}{suffix}</span>{/if}
