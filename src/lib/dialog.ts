// Site-styled popups, in place of the browser's own confirm() and prompt() boxes (which look out of
// place and can't be styled):
//   if (await askConfirm({ title: "Clear your watchlist?", message: "…", confirmLabel: "Clear watchlist", danger: true })) …
//   showCopyBox("Copy this link", url)     the text, selected, for when the browser blocks the clipboard
// Each popup is a <dialog> opened with showModal(): focus stays inside it, Escape or a click outside
// closes it as "Cancel", and focus goes back to where it was. It's removed from the page once closed.

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** a red confirm button, for actions that delete something */
  danger?: boolean;
}

let counter = 0;

/** Build an empty popup: the dialog, and the panel inside it to fill */
function makeDialog(title: string): { dlg: HTMLDialogElement; box: HTMLFormElement; titleId: string } {
  const n = ++counter;
  const dlg = document.createElement("dialog");
  dlg.className = "site-dialog";
  const titleId = `sd-title-${n}`;
  dlg.setAttribute("aria-labelledby", titleId);
  const box = document.createElement("form");
  box.method = "dialog";
  box.className = "panel site-dialog-box";
  const h = document.createElement("h2");
  h.id = titleId;
  h.textContent = title;
  box.appendChild(h);
  dlg.appendChild(box);
  // a click on the dimmed backdrop (outside the panel) cancels
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(""); });
  return { dlg, box, titleId };
}

function button(label: string, value: string, cls: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "submit";
  b.value = value;
  b.className = cls;
  b.textContent = label;
  return b;
}

/** Open a popup, and remove it once it closes. Resolves with the button value it closed with ("" = cancelled). */
function open(dlg: HTMLDialogElement, focus: HTMLElement | null): Promise<string> {
  const back = document.activeElement as HTMLElement | null;
  document.body.appendChild(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      dlg.remove();
      back?.focus?.({ preventScroll: true });
      resolve(dlg.returnValue);
    }, { once: true });
    dlg.showModal();
    focus?.focus();
  });
}

/** Ask the visitor to confirm. Resolves true only when they pick the confirm button. */
export async function askConfirm(o: ConfirmOptions): Promise<boolean> {
  const { dlg, box } = makeDialog(o.title);
  if (o.message) {
    const p = document.createElement("p");
    p.id = dlg.getAttribute("aria-labelledby") + "-msg";
    p.textContent = o.message;
    dlg.setAttribute("aria-describedby", p.id);
    box.appendChild(p);
  }
  const actions = document.createElement("div");
  actions.className = "site-dialog-actions";
  const cancel = button(o.cancelLabel || "Cancel", "cancel", "btn btn-ghost");
  const ok = button(o.confirmLabel || "OK", "ok", o.danger ? "btn btn-danger" : "btn");
  actions.append(cancel, ok);
  box.appendChild(actions);
  // start on Cancel when confirming deletes something, so a stray Enter doesn't
  return (await open(dlg, o.danger ? cancel : ok)) === "ok";
}

/** Show some text, selected, to copy by hand (the browser blocked the clipboard). */
export function showCopyBox(title: string, text: string): void {
  const { dlg, box } = makeDialog(title);
  const multi = text.includes("\n");
  const field = document.createElement(multi ? "textarea" : "input") as HTMLInputElement | HTMLTextAreaElement;
  field.className = "input site-dialog-copy";
  field.readOnly = true;
  field.value = text;
  field.setAttribute("aria-label", title);
  if (field instanceof HTMLTextAreaElement) field.rows = Math.min(10, text.split("\n").length);
  const hint = document.createElement("p");
  hint.className = "faint";
  hint.textContent = "Your browser didn't let us copy it for you. Press Ctrl+C (Cmd+C on a Mac), or long-press on a phone.";
  const actions = document.createElement("div");
  actions.className = "site-dialog-actions";
  actions.appendChild(button("Close", "close", "btn"));
  box.append(field, hint, actions);
  open(dlg, field);
  field.select();
}
