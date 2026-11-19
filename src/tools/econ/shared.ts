// Small helpers shared by the Economy page's sections.

/** Series colours for the index chart, in fixed order (validated for colour-blind separation on the dark panels). */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

/** Faction marker colours (the first two series colours) */
export const ALLIANCE = SERIES_COLORS[0];
export const HORDE = SERIES_COLORS[1];

/** 1234567 → "1.23M", 98765 → "98.8k", 950 → "950" */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return Math.round(n).toLocaleString("en-US");
}

/** Copper → whole gold, shortened: "968k gold" */
export const goldText = (copper: number) => compact(copper / 10000) + " gold";

/** "+12.3%" / "−4%" / "0%" */
export function pctText(p: number | null | undefined, digits = 1): string {
  if (p == null || !isFinite(p)) return "—";
  const r = Number(p.toFixed(digits));
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r) + "%";
}

export const FACTION_NAME: Record<string, string> = { alliance: "Alliance", horde: "Horde", neutral: "Blackwater" };
