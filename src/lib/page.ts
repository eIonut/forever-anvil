// Page scripts with the client-side router (<ClientRouter /> in BaseLayout).
//
// Moving between pages no longer reloads the browser: the router swaps in the new page and a
// component's <script> runs only once per visit, not once per page. So scripts that wire up the page
// use onPage(): the setup runs on the first page and again after every navigation.
// Listeners added with the given signal are removed before the next page's setup, so they never pile up:
//   onPage((signal) => { window.addEventListener("scroll", f, { signal }); });
//
// A script, once loaded, keeps running on every later page, including pages without its component:
// each setup must check that its elements are on the page and stop quietly when they aren't.

// The router makes each new page's <head> match the server's HTML, removing anything else. That
// would drop what third-party scripts added at runtime, such as Wowhead's tooltip stylesheet
// (tooltips would show unstyled) and the loaded tooltip/AdSense scripts. So before each swap, every
// stylesheet or script from another site is marked to stay, with a stand-in in the new page's head
// that the router matches and discards. A kept script isn't run again.
// (Registered once: this module is loaded on every page through the header's script.)
const KEEP = "data-astro-transition-persist";
document.addEventListener("astro:before-swap", (e) => {
  const next = (e as Event & { newDocument: Document }).newDocument;
  for (const el of document.head.querySelectorAll<HTMLLinkElement | HTMLScriptElement>("link[rel=stylesheet][href], script[src]")) {
    const url = new URL(el instanceof HTMLLinkElement ? el.href : el.src, location.href);
    if (url.origin === location.origin) continue;
    const id = el.getAttribute(KEEP) || "ext-" + url.href;
    el.setAttribute(KEEP, id);
    if (next.head.querySelector(`[${KEEP}="${CSS.escape(id)}"]`)) continue;
    const standIn = next.createElement(el.tagName.toLowerCase());
    standIn.setAttribute(KEEP, id);
    if (el instanceof HTMLLinkElement) { standIn.setAttribute("rel", "stylesheet"); standIn.setAttribute("href", el.href); }
    next.head.appendChild(standIn);
  }
});

export function onPage(setup: (signal: AbortSignal) => void): void {
  let ac: AbortController | null = null;
  document.addEventListener("astro:page-load", () => {
    ac?.abort();
    ac = new AbortController();
    setup(ac.signal);
  });
}
