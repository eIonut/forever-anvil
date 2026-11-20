<script lang="ts">
  // "Loading…" with a small spinning rune ring, for anything that waits on a download.
  let { text = "Loading…", block = false }: { text?: string; block?: boolean } = $props();
</script>

<span class="loading" class:loading-block={block} role="status"><span class="spinner" aria-hidden="true"></span>{text}</span>
