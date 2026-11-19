// Local preview server for the old (pre-Astro) pages: npm run legacy  ->  http://localhost:8080
// Serves the site, plus /api/character for the character lookup (uses your .env keys
// server-side; in production a Cloudflare Worker provides the same endpoint).
// Removed in step 5 of docs/astro-migration-plan.md, once every page runs on Astro.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createCharacterApi } from "./pipeline/character-api.js";
const ROOT = import.meta.dirname;
const PORT = process.env.PORT || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml" };

// Never serve secrets or tooling: dotfiles (.env, .git, .claude), node_modules, docs drafts stay reachable
const BLOCKED = /(^|[\\/])(\.[^\\/]*|node_modules)([\\/]|$)/;

/* ---------- character API (local stand-in for the Cloudflare Worker) ---------- */
const characterApi = createCharacterApi(ROOT);
async function handleCharacter(req, res, url) {
  const { status, body } = await characterApi({ region: url.searchParams.get("region"), name: url.searchParams.get("name"), ip: req.socket.remoteAddress || "" });
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/* ---------- static files ---------- */
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/character") return void handleCharacter(req, res, url);

  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || BLOCKED.test(path.relative(ROOT, file))) { res.writeHead(404); return res.end("Not found"); }
  // files that moved to public/ for the Astro site (favicon, images, robots.txt) are served from there
  const fallback = path.join(ROOT, "public", path.relative(ROOT, file));
  fs.readFile(file, (err, data) => {
    if (err && file !== fallback) return fs.readFile(fallback, (err2, data2) => send(err2, data2, fallback));
    send(err, data, file);
  });
  function send(err, data, file) {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    // no-cache: the browser may keep a copy but must check for a newer one each time (avoids stale scripts while developing)
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  }
}).listen(PORT, () => console.log("Forever Tome running at http://localhost:" + PORT));
