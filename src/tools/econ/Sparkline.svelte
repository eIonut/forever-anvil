<script lang="ts">
  // Tiny trend line for the index list (decorative: the value and change sit next to it as text).
  let { points, color = "currentColor" }: { points: [number, number][]; color?: string } = $props();
  const W = 64, H = 20;
  const d = $derived.by(() => {
    if (points.length < 2) return "";
    const ts = points.map((p) => p[0]), vs = points.map((p) => p[1]);
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    let v0 = Math.min(...vs), v1 = Math.max(...vs);
    if (v0 === v1) { v0 -= 1; v1 += 1; }
    return points.map((p, i) => (i ? "L" : "M") + ((p[0] - t0) / (t1 - t0 || 1) * (W - 2) + 1).toFixed(1) + " " + (H - 2 - (p[1] - v0) / (v1 - v0) * (H - 4)).toFixed(1)).join(" ");
  });
</script>

<svg class="ec-spark" viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true" focusable="false">{#if d}<path {d} stroke={color} />{/if}</svg>
