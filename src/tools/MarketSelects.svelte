<script lang="ts">
  // Region, server group and auction house pickers, shared by the price tools.
  // prefix gives the fields unique ids (e.g. "pr" → #pr-region).
  interface Props {
    prefix: string;
    region: string;
    group: string;
    faction: string;
    groups: { value: string; label: string }[];
    onregion: (v: string) => void;
    ongroup: (v: string) => void;
    onfaction: (v: string) => void;
  }
  let { prefix, region, group, faction, groups, onregion, ongroup, onfaction }: Props = $props();
  const pick = (fn: (v: string) => void) => (e: Event) => fn((e.currentTarget as HTMLSelectElement).value);
</script>

<div><label class="field-label" for="{prefix}-region">Region</label>
  <select class="input" id="{prefix}-region" onchange={pick(onregion)}>
    <option value="eu" selected={region === "eu"}>Europe</option><option value="us" selected={region === "us"}>Americas &amp; Oceania</option>
  </select></div>
<div><label class="field-label" for="{prefix}-group">Server group</label>
  <select class="input" id="{prefix}-group" onchange={pick(ongroup)}>
    {#each groups as g (g.value)}<option value={g.value} selected={g.value === group}>{g.label}</option>{/each}
  </select></div>
<div><label class="field-label" for="{prefix}-faction">Auction House</label>
  <select class="input" id="{prefix}-faction" onchange={pick(onfaction)}>
    <option value="alliance" selected={faction === "alliance"}>Alliance</option><option value="horde" selected={faction === "horde"}>Horde</option><option value="neutral" selected={faction === "neutral"}>Blackwater (neutral)</option>
  </select></div>
