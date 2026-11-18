// Local preview server (no install needed): node serve.js  ->  http://localhost:8080
// Serves the site, plus /api/character for the character lookup (uses your .env keys
// server-side; in production a Cloudflare Worker provides the same endpoint).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml" };

// Never serve secrets or tooling: dotfiles (.env, .git, .claude), node_modules, docs drafts stay reachable
const BLOCKED = /(^|[\\/])(\.[^\\/]*|node_modules)([\\/]|$)/;

/* ---------- character API (local stand-in for the Cloudflare Worker) ---------- */
function loadEnv() {
  const f = path.join(ROOT, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const clients = {};
const cache = new Map();           // key → { t, body }
const CACHE_MS = 15 * 60 * 1000;   // show live data; keep at most 15 minutes
const hits = new Map();            // ip → [timestamps] (simple rate limit)

// data/optout.json holds SHA-256 fingerprints of "region:firstname-lastname", never names,
// because the file is published with the site. Add entries with: node tools/optout.js
function optedOut(region, slug) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "optout.json"), "utf8"));
    const h = require("crypto").createHash("sha256").update(region + ":" + slug).digest("hex");
    return Array.isArray(list) && list.includes(h);
  } catch (e) { return false; }
}

async function characterApi(req, res, url) {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  const ip = req.socket.remoteAddress || "";
  const recent = (hits.get(ip) || []).filter((t) => Date.now() - t < 60000);
  if (recent.length >= 30) return send(429, { error: "too-many" });
  recent.push(Date.now()); hits.set(ip, recent);

  const region = (url.searchParams.get("region") || "eu").toLowerCase();
  if (!["us", "eu", "kr", "tw"].includes(region)) return send(400, { error: "bad-region" });
  if (!process.env.BNET_CLIENT_ID || !process.env.BNET_CLIENT_SECRET) return send(503, { error: "not-configured" });

  const { lookupCharacter, normalizeName } = require("./pipeline/character");
  const slug = normalizeName(url.searchParams.get("name"));
  if (!slug) return send(400, { error: "bad-name" });
  if (optedOut(region, slug)) return send(404, { error: "not-found" });

  const key = region + ":" + slug;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return send(200, hit.body);
  try {
    const { createClient } = require("./pipeline/blizzard");
    clients[region] = clients[region] || createClient({ clientId: process.env.BNET_CLIENT_ID, clientSecret: process.env.BNET_CLIENT_SECRET, region });
    const result = await lookupCharacter(clients[region], slug);
    if (result.error) return send(result.error === "not-found" ? 404 : result.error === "bad-name" ? 400 : 502, { error: result.error });
    const body = Object.assign({ region, fetched: new Date().toISOString() }, result);
    cache.set(key, { t: Date.now(), body });
    for (const [k, v] of cache) if (Date.now() - v.t > CACHE_MS) cache.delete(k); // drop expired copies
    send(200, body);
  } catch (e) {
    send(502, { error: "unavailable" });
  }
}

/* ---------- static files ---------- */
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/character") return void characterApi(req, res, url);

  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || BLOCKED.test(path.relative(ROOT, file))) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    // no-cache: the browser may keep a copy but must check for a newer one each time (avoids stale scripts while developing)
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}).listen(PORT, () => console.log("Forever Tome running at http://localhost:" + PORT));
