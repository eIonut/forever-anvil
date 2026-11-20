// Small pop-up notifications ("toasts") in the corner of the screen, for things the visitor just did:
// a name or link copied, a recipe added to the plan, settings reset, a lookup that failed.
//   notify("Link copied")                       success (the default)
//   notify("Couldn't load prices", "error")
// Each toast is also read out through the shared live region (announce), so the toast itself is hidden
// from screen readers and nothing is read twice. Toasts close on their own; a click closes one sooner.
// The stack is created on first use, and again after a page change replaces <body>.
import { ICONS } from "./icons";
import { announce } from "./announce";

export type NotifyKind = "success" | "info" | "error";

const GLYPH: Record<NotifyKind, string> = {
  success: ICONS.check,
  info: ICONS.about,
  error: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`, // lucide: triangle-alert
};

const MAX = 3;

function stack(): HTMLElement {
  let el = document.getElementById("toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "toasts";
    el.className = "toasts";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

function close(t: HTMLElement): void {
  if (t.classList.contains("leaving")) return;
  t.classList.add("leaving");
  // remove after the exit animation (or at once when animations are off)
  const done = () => t.remove();
  t.addEventListener("animationend", done, { once: true });
  setTimeout(done, 400);
}

export function notify(message: string, kind: NotifyKind = "success", ms = kind === "error" ? 6000 : 3200): void {
  announce(message);
  const host = stack();
  // the same message twice in a row: restart the existing toast instead of stacking a copy
  const last = host.lastElementChild as HTMLElement | null;
  if (last && !last.classList.contains("leaving") && last.dataset.msg === message) {
    clearTimeout(Number(last.dataset.timer));
    last.classList.remove("bump"); void last.offsetWidth; last.classList.add("bump");
    last.dataset.timer = String(setTimeout(() => close(last), ms));
    return;
  }
  const t = document.createElement("div");
  t.className = "toast toast-" + kind;
  t.dataset.msg = message;
  t.innerHTML = `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[kind]}</svg><span></span>`;
  t.querySelector("span")!.textContent = message;
  t.addEventListener("click", () => close(t));
  host.appendChild(t);
  const live = [...host.children].filter((c) => !c.classList.contains("leaving")) as HTMLElement[];
  for (const old of live.slice(0, Math.max(0, live.length - MAX))) close(old);
  t.dataset.timer = String(setTimeout(() => close(t), ms));
}
