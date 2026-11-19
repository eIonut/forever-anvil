// The /api/character endpoint for local development: checks the request, rate-limits,
// honours the opt-out list, caches for 15 minutes and asks Blizzard (see character.js).
// Used by the Astro dev server (integrations/dev-api.ts).
// In production a Cloudflare Worker provides the same endpoint.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "./blizzard.js";
import { lookupCharacter, normalizeName } from "./character.js";

const CACHE_MS = 15 * 60 * 1000; // show live data; keep at most 15 minutes
const REGIONS = ["us", "eu", "kr", "tw"];

/** Read KEY=value lines from .env into process.env (existing variables win). */
export function loadDotEnv(root) {
  const f = path.join(root, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * root: project folder (for .env and data/optout.json).
 * Returns handle({ region, name, ip }) → Promise<{ status, body }>.
 */
export function createCharacterApi(root) {
  loadDotEnv(root);
  const clients = {};
  const cache = new Map(); // "region:slug" → { t, body }
  const hits = new Map();  // ip → [timestamps] (simple rate limit)

  // data/optout.json holds SHA-256 fingerprints of "region:firstname-lastname", never names,
  // because the file is published with the site. Add entries with: node tools/optout.js
  function optedOut(region, slug) {
    try {
      const list = JSON.parse(fs.readFileSync(path.join(root, "data", "optout.json"), "utf8"));
      const h = crypto.createHash("sha256").update(region + ":" + slug).digest("hex");
      return Array.isArray(list) && list.includes(h);
    } catch (e) { return false; }
  }

  return async function handle({ region, name, ip = "" }) {
    const reply = (status, body) => ({ status, body });
    const recent = (hits.get(ip) || []).filter((t) => Date.now() - t < 60000);
    if (recent.length >= 30) return reply(429, { error: "too-many" });
    recent.push(Date.now()); hits.set(ip, recent);

    region = String(region || "eu").toLowerCase();
    if (!REGIONS.includes(region)) return reply(400, { error: "bad-region" });
    if (!process.env.BNET_CLIENT_ID || !process.env.BNET_CLIENT_SECRET) return reply(503, { error: "not-configured" });

    const slug = normalizeName(name);
    if (!slug) return reply(400, { error: "bad-name" });
    if (optedOut(region, slug)) return reply(404, { error: "not-found" });

    const key = region + ":" + slug;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return reply(200, hit.body);
    try {
      clients[region] ||= createClient({ clientId: process.env.BNET_CLIENT_ID, clientSecret: process.env.BNET_CLIENT_SECRET, region });
      const result = await lookupCharacter(clients[region], slug);
      if (result.error) return reply(result.error === "not-found" ? 404 : result.error === "bad-name" ? 400 : 502, { error: result.error });
      const body = Object.assign({ region, fetched: new Date().toISOString() }, result);
      cache.set(key, { t: Date.now(), body });
      for (const [k, v] of cache) if (Date.now() - v.t > CACHE_MS) cache.delete(k); // drop expired copies
      return reply(200, body);
    } catch (e) {
      return reply(502, { error: "unavailable" });
    }
  };
}
