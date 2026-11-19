// Helpers for a recipe's skill levels and where it's learned (row [7] of the recipes file,
// written by pipeline/recipeinfo.js). Used by the craft calculator and the recipe pages.

/** [required skill (null = set by the trainer), turns yellow at, turns grey at, source, teaching item id (0 = none), spell id] */
export type RecipeInfo = [number | null, number, number, "auto" | "item" | "trainer", number, number];

export interface SkillLevels {
  /** skill needed to learn it (orange from here); null when only the trainer knows */
  req: number | null;
  yellow: number;
  green: number;
  grey: number;
}

export function skillLevels(info: RecipeInfo | null | undefined): SkillLevels | null {
  if (!info || !info[2]) return null;
  const [req, yellow, grey] = info;
  return { req, yellow, green: Math.floor((yellow + grey) / 2), grey };
}

/** a number to sort by: the skill needed, or when it turns yellow for trainer recipes */
export const skillSortKey = (info: RecipeInfo | null | undefined) => (info ? (info[0] ?? info[1]) : null);

/** "Taught by profession trainers" / "From an item" / "Learned with the profession" */
export function sourceLabel(info: RecipeInfo | null | undefined): string {
  if (!info) return "";
  return info[3] === "auto" ? "Learned with the profession" : info[3] === "item" ? "From a recipe item" : "Taught by trainers";
}

export const wowheadSpell = (spell: number) => `https://www.wowhead.com/forever/spell=${spell}`;
export const wowheadItem = (item: number) => `https://www.wowhead.com/forever/item=${item}`;

/** One sentence on the skill colours, for titles and screen readers */
export function skillSentence(s: SkillLevels, prof: string): string {
  const start = s.req != null ? `Needs ${prof} ${s.req}. ` : "";
  if (s.yellow >= s.grey) return `${start}Gives no skill points from ${s.grey}.`;
  return `${start}Always gives a skill point below ${s.yellow} (orange), usually below ${s.green} (yellow), sometimes below ${s.grey} (green), never from ${s.grey} (grey).`;
}
