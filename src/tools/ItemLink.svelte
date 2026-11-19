<script lang="ts">
  // Link to our own item page when we know the item's name. Otherwise link to Wowhead, which fills in
  // the name (brand-new Forever items Blizzard's API doesn't describe yet); our icon stays.
  import { itemUrl } from "../lib/urls";
  import { tooltipAttrs } from "../lib/wowhead";
  import ItemIcon from "./ItemIcon.svelte";

  let { id, name, class: cls = "" }: { id: number; name: string | null | undefined; class?: string } = $props();
</script>

{#if name}<a class="item-link{cls ? ' ' + cls : ''}" href={itemUrl(id, name)} {...tooltipAttrs(id)}><ItemIcon {id} />{name}</a>{:else}<ItemIcon {id} /><a class="wh item-link" href="https://www.wowhead.com/forever/item={id}" target="_blank" rel="noopener nofollow" data-wh-rename-link="true" data-wh-icon-added="true">Item #{id}</a>{/if}
