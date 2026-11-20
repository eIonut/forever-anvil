// Forever Anvil's Cloudflare Worker: serves the built site (./dist) and the /api addresses.
//
//   /api/<kind>/<region>[/<part>]   price-job files from Workers KV (see routes.js)
//   /api/character?region=&name=    character lookup, asked from Blizzard with the key kept here
//
// Only /api requests run this code (wrangler.jsonc: run_worker_first). Pages, images and scripts
// are served by Cloudflare directly, for free, and don't count toward the Worker's daily limit.
//
// Protection, outermost first:
//   1. A Cloudflare rate-limiting rule on /api/* (dashboard, see docs/launch-checklist.md) blocks
//      anyone sending too many requests before they reach this code.
//   2. Browsers may reuse each answer for a few minutes (Cache-Control), so normal visitors ask rarely.
//   3. Answers are kept in Cloudflare's cache here, so most requests never read KV or call Blizzard.
//   4. Character lookups have their own per-visitor limit and a 15-minute cache per character.
import { dataRoute } from "./routes.js";
import { createClient } from "../pipeline/blizzard.js";
import { lookupCharacter, normalizeName } from "../pipeline/character.js";
import optout from "../data/optout.json";

const EDGE_TTL = 120;           // Cloudflare's cached copy of a data file: at most 2 minutes behind KV
const CHARACTER_TTL = 15 * 60;  // a looked-up character: at most 15 minutes old
const NOT_FOUND_TTL = 5 * 60;   // "no such character": asked again after 5 minutes
const LOOKUPS_PER_MINUTE = 10;  // per visitor (IP), on top of the dashboard rule
const LOOKUP_REGIONS = ["us", "eu", "kr", "tw"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return noindex(await api(request, url, env, ctx));
  }
};

async function api(request, url, env, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD") return json(405, { error: "method" }, "no-store");
  try {
    if (url.pathname === "/api/character") return await character(request, url, env, ctx);
    const route = dataRoute(url.pathname);
    if (route) return await dataFile(request, url, route, env, ctx);
    return json(404, { error: "not-found" }, "public, max-age=3600");
  } catch (e) {
    console.error("API error", url.pathname, e && e.message);
    return json(502, { error: "unavailable" }, "no-store");
  }
}

// Search engines may fetch /api (robots.txt allows it, so pages render with their data when
// Google looks at them), but the JSON files themselves never appear in search results.
function noindex(res) {
  const out = new Response(res.body, res); // cached responses are read-only: copy before changing headers
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}

/* ---------- price-job files ---------- */

async function dataFile(request, url, { key, ttl }, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.origin + url.pathname); // ignore ?query, so it can't bypass the cache
  let res = await cache.match(cacheKey);
  if (!res) {
    const { value, metadata } = await env.DATA.getWithMetadata(key, { type: "text" });
    if (value == null) {
      // missing (the job hasn't uploaded it yet): browsers retry after a minute
      res = json(404, { error: "no-data" }, "public, max-age=60, s-maxage=60");
    } else {
      res = new Response(value, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // browsers: ttl; Cloudflare's cache: EDGE_TTL (s-maxage), so a new upload shows within ~2 minutes
          "Cache-Control": `public, max-age=${ttl}, s-maxage=${EDGE_TTL}`,
          ...(metadata && metadata.h ? { ETag: `"${metadata.h}"` } : {})
        }
      });
    }
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  // the browser's copy is still current: answer "not modified" without sending the file again
  const etag = res.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": res.headers.get("Cache-Control") } });
  }
  return res;
}

/* ---------- character lookup ---------- */

const clients = {};        // region → Blizzard client (keeps its access token while this copy of the Worker runs)
const recentLookups = new Map(); // ip → [timestamps]

function tooMany(ip) {
  const now = Date.now();
  const recent = (recentLookups.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= LOOKUPS_PER_MINUTE) return true;
  recent.push(now);
  recentLookups.set(ip, recent);
  if (recentLookups.size > 5000) recentLookups.delete(recentLookups.keys().next().value); // keep memory small
  return false;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function character(request, url, env, ctx) {
  const region = String(url.searchParams.get("region") || "eu").toLowerCase();
  if (!LOOKUP_REGIONS.includes(region)) return json(400, { error: "bad-region" }, "no-store");
  const slug = normalizeName(url.searchParams.get("name"));
  if (!slug) return json(400, { error: "bad-name" }, "no-store");

  // opted-out characters look exactly like unknown ones (data/optout.json, filled with tools/optout.js)
  if (Array.isArray(optout) && optout.length && optout.includes(await sha256Hex(region + ":" + slug))) {
    return json(404, { error: "not-found" }, "no-store");
  }

  // a recent answer for this character: no Blizzard calls, and it doesn't count toward the visitor's limit
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/character/${region}/${slug}`);
  const hit = await cache.match(cacheKey);
  if (hit) return withBrowserCache(hit);

  if (tooMany(request.headers.get("CF-Connecting-IP") || "unknown")) return json(429, { error: "too-many" }, "no-store");
  if (!env.BNET_CLIENT_ID || !env.BNET_CLIENT_SECRET) return json(503, { error: "not-configured" }, "no-store");

  clients[region] ||= createClient({ clientId: env.BNET_CLIENT_ID, clientSecret: env.BNET_CLIENT_SECRET, region });
  const result = await lookupCharacter(clients[region], slug);
  let res;
  if (result.error === "not-found") res = json(404, { error: "not-found" }, `public, s-maxage=${NOT_FOUND_TTL}`);
  else if (result.error) return json(result.error === "bad-name" ? 400 : 502, { error: result.error }, "no-store");
  else res = json(200, Object.assign({ region, fetched: new Date().toISOString() }, result), `public, s-maxage=${CHARACTER_TTL}`);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return withBrowserCache(res);
}

// Cloudflare's cache keeps lookups for 15 minutes; the visitor's browser keeps its own copy for 5
function withBrowserCache(res) {
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, max-age=300");
  return out;
}

function json(status, body, cacheControl) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl }
  });
}
