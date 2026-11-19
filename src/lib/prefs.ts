// Display settings (text size, high contrast, underlined links, reduced motion), saved per browser.
// BaseLayout applies them in <head> before the page paints; SettingsPanel changes them.
import { load, save } from "./store";

/** Storage key. Kept from the old site so visitors keep their settings. */
export const PREF_KEY = "codex-prefs";

export interface Prefs {
  text?: "md" | "lg" | "xl";
  contrast?: boolean;
  underline?: boolean;
  calm?: boolean;
}

export const getPrefs = (): Prefs => load<Prefs>(PREF_KEY) || {};

export function applyPrefs(p: Prefs): void {
  const h = document.documentElement;
  h.setAttribute("data-text", p.text || "md");
  h.toggleAttribute("data-contrast", !!p.contrast);
  h.toggleAttribute("data-calm", !!p.calm);
  h.toggleAttribute("data-underline", !!p.underline);
}

/** Save, apply, and tell the page (the header re-measures itself when text size changes). */
export function setPrefs(p: Prefs): void {
  save(PREF_KEY, p);
  applyPrefs(p);
  document.dispatchEvent(new CustomEvent("prefs-change"));
}
