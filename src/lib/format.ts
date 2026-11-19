// Formatting shared by pages and tools.

/** Gold, silver and copper in a copper amount, or null when there's no price. */
export function coins(copper: number | null | undefined): { g: number; s: number; c: number } | null {
  if (copper == null || isNaN(copper)) return null;
  const c = Math.round(copper);
  return { g: Math.floor(c / 10000), s: Math.floor((c % 10000) / 100), c: c % 100 };
}

/** "1,234g 40s 5c" as plain text (for descriptions and labels), "-" when there's no price. */
export function moneyText(copper: number | null | undefined): string {
  const m = coins(copper);
  if (!m) return "-";
  const parts: string[] = [];
  if (m.g) parts.push(num(m.g) + "g");
  if (m.g || m.s) parts.push(m.s + "s");
  parts.push(m.c + "c");
  return parts.join(" ");
}

/** 12,345 */
export const num = (n: number) => n.toLocaleString("en-US");

/** "19 November 2026" */
export const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "uncommon" → "Uncommon" */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
