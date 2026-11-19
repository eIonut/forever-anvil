<script lang="ts">
  // One of the site's line icons (src/lib/icons.ts), for the Svelte tools. Decorative only.
  import { ICONS, type IconName } from "../lib/icons";
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">{@html ICONS[name]}</svg>
