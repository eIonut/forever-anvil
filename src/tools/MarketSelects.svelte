<script lang="ts">
  // Region, ruleset and auction house pickers, shared by the price tools.
  // Each is a row of radio buttons styled as chips: one click to switch, and every choice is visible.
  // prefix keeps the radio groups apart (e.g. "pr" → name="pr-region").
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
  import Icon from "./Icon.svelte";
  import { rulesetIcon } from "../lib/icons";

  let { prefix, region, group, faction, groups, onregion, ongroup, onfaction }: Props = $props();

  const REGIONS = [
    { value: "eu", label: "Europe" },
    // Americas ("us") is left out until it can be tested; the pipeline can still build it.
  ];
  const HOUSES = [
    { value: "alliance", label: "Alliance", hint: "" },
    { value: "horde", label: "Horde", hint: "" },
    { value: "neutral", label: "Blackwater", hint: "neutral, both factions" },
  ];

  // "Group A · ruleset not confirmed yet" → chip "Group A", with the rest as a hint
  const split = (label: string) => {
    const [name, ...rest] = label.split(" · ");
    return { name, hint: rest.join(" · ") };
  };
</script>

<div class="market-bar">
  <fieldset class="chip-group">
    <legend>Region</legend>
    <div class="chips">
      {#each REGIONS as r (r.value)}
        <label class="chip"><input type="radio" name="{prefix}-region" value={r.value} checked={region === r.value} onchange={() => onregion(r.value)} /><span>{r.label}</span></label>
      {/each}
    </div>
  </fieldset>
  <fieldset class="chip-group">
    <legend>Ruleset <span class="legend-hint">(server group)</span></legend>
    <div class="chips">
      {#each groups as g (g.value)}
        {@const l = split(g.label)}
        {@const ri = rulesetIcon(l.name)}
        <label class="chip" title={l.hint || undefined}><input type="radio" name="{prefix}-group" value={g.value} checked={g.value === group} onchange={() => ongroup(g.value)} /><span>{#if ri}<Icon name={ri} size={22} />{/if}{l.name}{#if l.hint}<span class="sr-only"> ({l.hint})</span><sup class="chip-flag" aria-hidden="true">?</sup>{/if}</span></label>
      {/each}
    </div>
  </fieldset>
  <fieldset class="chip-group">
    <legend>Auction house</legend>
    <div class="chips">
      {#each HOUSES as h (h.value)}
        <label class="chip chip-{h.value}"><input type="radio" name="{prefix}-faction" value={h.value} checked={faction === h.value} onchange={() => onfaction(h.value)} /><span><Icon name={h.value as "alliance" | "horde" | "neutral"} size={22} />{h.label}{#if h.hint}<span class="sr-only"> ({h.hint})</span>{/if}</span></label>
      {/each}
    </div>
  </fieldset>
</div>
