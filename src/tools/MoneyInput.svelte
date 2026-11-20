<script lang="ts">
  // A price entered like the in-game Auction House: a gold, a silver and a copper box, each followed
  // by its coin. Empty boxes count as 0; silver or copper over 99 carries over (150 silver → 1g 50s)
  // and the boxes then show the tidied amount.
  // onchange fires once the visitor is done: when focus leaves all three boxes, or on Enter,
  // with the price in copper, or null when every box is empty.
  import { coins } from "../lib/format";
  import { moneyFromParts } from "../lib/watchmath.js";

  interface Props {
    /** price in copper, or null for none */
    value: number | null | undefined;
    /** start of the three boxes' ids */
    id: string;
    /** what the price is for, read out before each box: "Target price for Silk Cloth" */
    label: string;
    onchange: (copper: number | null) => void;
  }
  let { value, id, label, onchange }: Props = $props();

  const show = (v: number | null | undefined) => {
    const m = coins(v);
    return m ? { g: m.g ? String(m.g) : "", s: m.s ? String(m.s) : "", c: m.c ? String(m.c) : "" } : { g: "", s: "", c: "" };
  };
  let g = $state(""), s = $state(""), c = $state("");
  let shown: number | null | undefined = undefined;
  // follow the saved value (also when it changes elsewhere, e.g. in another tab)
  $effect(() => {
    if (value === shown) return;
    shown = value;
    ({ g, s, c } = show(value));
  });

  let box: HTMLFieldSetElement | undefined = $state();

  function commit() {
    const next = moneyFromParts(g, s, c);
    ({ g, s, c } = show(next)); // tidy: carry over, drop zeros
    if (next === (value ?? null)) return;
    shown = next;
    onchange(next);
  }

  function onKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
    e.currentTarget.blur();
  }

  const digits = (e: Event & { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.value.replace(/\D/g, "");
    if (v !== e.currentTarget.value) e.currentTarget.value = v;
    return v;
  };
</script>

<fieldset class="money-input" bind:this={box}
  onfocusout={(e) => { if (!box?.contains(e.relatedTarget as Node | null)) commit(); }}>
  <legend class="sr-only">{label}</legend>
  <label class="mi-part mi-g"><span class="sr-only">Gold</span><input class="input" id="{id}-g" type="text" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="0" onkeydown={onKey} value={g} oninput={(e) => (g = digits(e))} /><span class="mi-coin g" aria-hidden="true"></span></label>
  <label class="mi-part"><span class="sr-only">Silver</span><input class="input" id="{id}-s" type="text" inputmode="numeric" autocomplete="off" maxlength="3" placeholder="0" onkeydown={onKey} value={s} oninput={(e) => (s = digits(e))} /><span class="mi-coin s" aria-hidden="true"></span></label>
  <label class="mi-part"><span class="sr-only">Copper</span><input class="input" id="{id}-c" type="text" inputmode="numeric" autocomplete="off" maxlength="3" placeholder="0" onkeydown={onKey} value={c} oninput={(e) => (c = digits(e))} /><span class="mi-coin c" aria-hidden="true"></span></label>
</fieldset>
