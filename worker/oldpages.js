// Old item and recipe addresses. A page's address carries its name (/item/2770-copper-ore), so a
// renamed item or recipe, or a link with a typo in the name, has no page. When the id still has a
// page under another name, send the visitor (and Google) there with a permanent redirect.
//
// Pages are served by Cloudflare without running the Worker; this only runs for addresses with no
// file, so it costs nothing for normal visits.

const PAGE = /^\/(item|recipe)\/(\d+)(?:-[^/]*)?\/?$/;

/** "/item/18677-zephyr-cloak" → { kind: "item", id: "18677" }, anything else → null */
export function parsePageAddress(pathname) {
  const m = PAGE.exec(pathname);
  return m ? { kind: m[1], id: m[2] } : null;
}

/** Where an address should go now, or null when it has no newer page (or is already right). */
export function currentAddress(pathname, slugs) {
  const p = parsePageAddress(pathname);
  const slug = p && slugs?.[p.kind]?.[p.id];
  if (!slug) return null;
  const to = `/${p.kind}/${slug}`;
  return to === pathname.replace(/\/$/, "") ? null : to;
}

let cached = null; // { slugs, at }: kept for 10 minutes per Worker instance
const KEEP_MS = 10 * 60 * 1000;

async function loadSlugs(request, env) {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.slugs;
  const res = await env.ASSETS.fetch(new Request(new URL("/page-slugs.json", request.url)));
  const slugs = res.ok ? await res.json() : null;
  cached = { slugs, at: Date.now() };
  return slugs;
}

/** A redirect for an old item/recipe address, or null to serve the normal response. */
export async function oldPageRedirect(request, url, env) {
  if (!parsePageAddress(url.pathname)) return null;
  const slugs = await loadSlugs(request, env);
  const to = currentAddress(url.pathname, slugs);
  return to ? Response.redirect(new URL(to + url.search, url).toString(), 301) : null;
}
