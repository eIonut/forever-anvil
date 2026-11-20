<script lang="ts">
  // Link to our own item page when we know the item's name. Otherwise link to Wowhead, which fills in
  // the name (brand-new Forever items Blizzard's API doesn't describe yet); our icon stays.
  // copy: also show a button that copies the name, for the in-game Auction House search.
  // watch: also show the watchlist star.
  import { itemUrl } from "../lib/urls";
  import { tooltipAttrs } from "../lib/wowhead";
  import CopyName from "./CopyName.svelte";
  import ItemIcon from "./ItemIcon.svelte";
  import WatchStar from "./WatchStar.svelte";

  let { id, name, class: cls = "", copy = false, watch = false }: { id: number; name: string | null | undefined; class?: string; copy?: boolean; watch?: boolean } = $props();
</script>

{#if name}<a class="item-link{cls ? ' ' + cls : ''}" href={itemUrl(id, name)} {...tooltipAttrs(id)}><ItemIcon {id} />{name}</a>{#if copy}<CopyName {name} />{/if}{#if watch}<WatchStar {id} {name} />{/if}{:else}<ItemIcon {id} /><a class="wh item-link" href="https://www.wowhead.com/forever/item={id}" target="_blank" rel="noopener nofollow" data-wh-rename-link="true" data-wh-icon-added="true">Item #{id}</a>{/if}
