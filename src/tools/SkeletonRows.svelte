<script lang="ts">
  // Placeholder table rows with a soft shimmer while a table's data downloads,
  // so the table keeps its shape instead of jumping when the rows arrive.
  let { rows = 8, cols }: { rows?: number; cols: number } = $props();
</script>

{#each Array(rows) as _, i}
  <tr class="skeleton-row" aria-hidden="true">
    {#each Array(cols) as _, j}<td>{#if j === 0}<span class="sk-icon"></span>{/if}<span class="sk-bar" style:width="{j === 0 ? 46 + ((i * 37) % 34) : 40 + ((i * 13 + j * 29) % 40)}%"></span></td>{/each}
  </tr>
{/each}
