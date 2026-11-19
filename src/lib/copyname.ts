// "Copy name" buttons next to item names (CopyName.astro / CopyName.svelte), so players can paste the
// exact name into the in-game Auction House search. One click listener on the document handles every
// such button, on static pages and inside the Svelte tools alike.
// (Registered once: this module is loaded on every page through the header's script.)
import { copyText } from "./api";
import { announce } from "./announce";

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

document.addEventListener("click", async (e) => {
  const btn = (e.target as Element | null)?.closest<HTMLButtonElement>("button[data-copy-name]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const name = btn.dataset.copyName || "";
  if (!name) return;
  if (!(await copyText(name, "Copy this item name:"))) return;
  announce(`Copied "${name}"`);
  btn.classList.add("copied");
  const tip = btn.getAttribute("title");
  btn.setAttribute("title", "Copied!");
  clearTimeout(timers.get(btn));
  timers.set(btn, setTimeout(() => {
    btn.classList.remove("copied");
    btn.setAttribute("title", tip && tip !== "Copied!" ? tip : "Copy name for the Auction House search");
  }, 1500));
});
