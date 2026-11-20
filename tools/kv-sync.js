// Copies the price job's public files between ./out and Cloudflare Workers KV (what the Worker serves).
//
//   node tools/kv-sync.js push   upload files that changed since the last upload (run after the price job)
//   node tools/kv-sync.js pull   download every public file that's missing from ./out
//                                (used when GitHub's saved copy of ./out is gone, so history isn't lost)
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (GitHub secrets). The namespace id comes from
// wrangler.jsonc, or KV_NAMESPACE_ID.
//
// KV's free plan allows 1,000 writes a day, so unchanged files are skipped: out/_kv-ledger.json remembers
// a fingerprint of each uploaded file. Every value expires after 28 days, so if the job ever stops, the
// Blizzard data disappears by itself within Blizzard's 30-day limit. Unchanged files are uploaded again
// after 7 days to keep them from expiring.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isPublicKey } from "../worker/routes.js";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const LEDGER = path.join(OUT, "_kv-ledger.json");
const TTL_S = 28 * 86400;
const REFRESH_MS = 7 * 86400 * 1000;
const BATCH_BYTES = 40 * 1024 * 1024; // the bulk upload allows 100 MB per request
const DAILY_WRITE_WARNING = 900;      // the free plan's limit is 1,000

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const namespace = process.env.KV_NAMESPACE_ID || readNamespaceId();
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}`;

function readNamespaceId() {
  const text = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const ns = (JSON.parse(text).kv_namespaces || []).find((n) => n.binding === "DATA");
  return ns && ns.id;
}

async function cf(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
    return res;
  }
}

const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; } };
const fingerprint = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

async function push() {
  const ledger = readJSON(LEDGER, { keys: {}, day: null, writes: 0 });
  const today = new Date().toISOString().slice(0, 10);
  if (ledger.day !== today) { ledger.day = today; ledger.writes = 0; }
  const now = Date.now();

  const queue = [];
  for (const f of fs.readdirSync(OUT)) {
    const key = f.replace(/\.json$/, "");
    if (!f.endsWith(".json") || !isPublicKey(key)) continue;
    const value = fs.readFileSync(path.join(OUT, f), "utf8");
    const h = fingerprint(value);
    const last = ledger.keys[key];
    if (last && last.h === h && now - last.at < REFRESH_MS) continue;
    queue.push({ key, value, h });
  }
  if (!queue.length) { console.log("KV: nothing changed"); return; }

  // in batches of up to ~40 MB
  let batch = [], size = 0, sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    const res = await cf("PUT", `${base}/bulk`, batch.map((x) => ({ key: x.key, value: x.value, metadata: { h: x.h }, expiration_ttl: TTL_S })));
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) throw new Error(`KV upload failed (HTTP ${res.status}): ${JSON.stringify(j.errors || [])}`);
    for (const x of batch) ledger.keys[x.key] = { h: x.h, at: now };
    sent += batch.length;
    batch = []; size = 0;
    fs.writeFileSync(LEDGER, JSON.stringify(ledger)); // after each batch, so a later failure doesn't resend it
  };
  for (const x of queue) {
    if (size + x.value.length > BATCH_BYTES) await flush();
    batch.push(x); size += x.value.length;
  }
  await flush();
  ledger.writes += sent;
  fs.writeFileSync(LEDGER, JSON.stringify(ledger));
  console.log(`KV: uploaded ${sent} changed files (${ledger.writes} writes today, free limit 1,000)`);
  if (ledger.writes > DAILY_WRITE_WARNING) console.log(`::warning::KV writes today: ${ledger.writes}, close to the free limit of 1,000`);
}

async function pull() {
  fs.mkdirSync(OUT, { recursive: true });
  const ledger = readJSON(LEDGER, { keys: {}, day: null, writes: 0 });
  const keys = [];
  let cursor = "";
  do {
    const res = await cf("GET", `${base}/keys?limit=1000${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) throw new Error(`KV list failed (HTTP ${res.status}): ${JSON.stringify(j.errors || [])}`);
    keys.push(...j.result);
    cursor = j.result_info && j.result_info.cursor;
  } while (cursor);

  const todo = keys.filter((k) => isPublicKey(k.name) && !fs.existsSync(path.join(OUT, k.name + ".json")));
  let got = 0, i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < todo.length) {
      const k = todo[i++];
      const res = await cf("GET", `${base}/values/${encodeURIComponent(k.name)}`);
      if (!res.ok) { console.log(`KV: couldn't download ${k.name} (HTTP ${res.status})`); continue; }
      fs.writeFileSync(path.join(OUT, k.name + ".json"), await res.text());
      // when it was uploaded, worked out from its expiry, so it's refreshed on schedule
      const at = k.expiration ? k.expiration * 1000 - TTL_S * 1000 : 0;
      if (k.metadata && k.metadata.h) ledger.keys[k.name] = { h: k.metadata.h, at };
      got++;
    }
  }));
  fs.writeFileSync(LEDGER, JSON.stringify(ledger));
  console.log(`KV: downloaded ${got} of ${keys.length} stored files into out/`);
}

const cmd = process.argv[2];
if (!["push", "pull"].includes(cmd)) { console.error("Usage: node tools/kv-sync.js push|pull"); process.exit(2); }
if (!token || !account) { console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"); process.exit(2); }
if (!namespace || /REPLACE/.test(namespace)) { console.error("Put the KV namespace id in wrangler.jsonc (npx wrangler kv namespace create DATA)"); process.exit(2); }
(cmd === "push" ? push() : pull()).catch((e) => { console.error(e.message); process.exit(1); });
