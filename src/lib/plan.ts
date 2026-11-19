// The visitor's crafting plan, saved in the browser. Shared by the planner,
// the craft profit calculator and the "+ Add to my crafting plan" buttons on recipe pages.
import { load, save } from "./store";

/** Storage key. Kept from the old site so visitors keep their plan. */
export const PLAN_KEY = "codex-plan";

export interface Plan {
  /** recipes to craft: r = recipe id, n = how many times */
  list: { r: number; n: number }[];
  /** materials already owned: item id → units */
  have: Record<string, number>;
}

export function getPlan(): Plan {
  const p = load<Plan>(PLAN_KEY);
  return p && Array.isArray(p.list) ? p : { list: [], have: {} };
}

export function setPlan(p: Plan): void {
  save(PLAN_KEY, p);
  updatePlanBadges();
}

/** Add a recipe (or more crafts of one already planned). Returns how many recipes the plan has. */
export function addToPlan(recipeId: number | string, crafts = 1): number {
  const p = getPlan();
  const id = Number(recipeId);
  const entry = p.list.find((x) => x.r === id);
  if (entry) entry.n += crafts;
  else p.list.push({ r: id, n: crafts });
  setPlan(p);
  return p.list.length;
}

/** Show the number of planned recipes on every [data-plan-count] badge (hidden when empty). */
export function updatePlanBadges(): void {
  const n = getPlan().list.length;
  document.querySelectorAll<HTMLElement>("[data-plan-count]").forEach((el) => {
    el.textContent = String(n);
    el.hidden = !n;
  });
}
