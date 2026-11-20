// A thin gold bar along the top of the window while the next page loads (client-side navigation with
// the router in BaseLayout). It only appears when loading takes longer than a moment, so quick page
// changes don't flicker. The bar lives on <html>, outside <body>, so the page swap doesn't remove it.
// (Registered once: this module is loaded on every page through the header's script.)
let bar: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;

function el(): HTMLElement {
  if (!bar || !bar.isConnected) {
    bar = document.createElement("div");
    bar.className = "nav-progress";
    bar.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(bar);
  }
  return bar;
}

document.addEventListener("astro:before-preparation", () => {
  clearTimeout(showTimer);
  showTimer = setTimeout(() => { const b = el(); b.classList.remove("done"); b.classList.add("on"); }, 120);
});
document.addEventListener("astro:after-swap", () => {
  clearTimeout(showTimer);
  if (!bar?.classList.contains("on")) return;
  bar.classList.add("done");
  setTimeout(() => bar?.classList.remove("on", "done"), 350);
});
