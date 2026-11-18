// Minimal Blizzard API client for WoW: Forever (Node 18+, no dependencies).
// Credentials come from environment variables (GitHub Secrets in production, .env locally).
// The secret and access token are never logged.
"use strict";

function createClient({ clientId, clientSecret, region }) {
  if (!clientId || !clientSecret) throw new Error("Missing BNET_CLIENT_ID / BNET_CLIENT_SECRET");
  region = (region || "eu").toLowerCase();
  const api = `https://${region}.api.blizzard.com`;
  const ns = { static: `static-forever-${region}`, dynamic: `dynamic-forever-${region}`, profile: `profile-forever-${region}` };
  let token = null, tokenExpires = 0, calls = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpires - 60000) return token;
    const res = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    calls++;
    if (!res.ok) throw new Error(`Token request failed (HTTP ${res.status})`);
    const j = await res.json();
    token = j.access_token;
    tokenExpires = Date.now() + (j.expires_in || 3600) * 1000;
    return token;
  }

  // GET JSON. Returns { status, json }. Retries network errors, 429 and 5xx with backoff.
  async function get(path, namespace, { retries = 3 } = {}) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${api}${path}${sep}namespace=${namespace}&locale=en_US`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken()}` } });
        calls++;
      } catch (e) {
        if (attempt >= retries) return { status: 0, json: null, error: e.message };
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await res.arrayBuffer().catch(() => {});
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) { await res.arrayBuffer().catch(() => {}); return { status: res.status, json: null }; }
      // Last-Modified tells us when Blizzard last refreshed this data (useful for character profiles)
      return { status: res.status, json: await res.json(), lastModified: res.headers.get("last-modified") || null };
    }
  }

  return { region, ns, get, callCount: () => calls };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run fn over items with at most `size` running at once.
async function pool(items, size, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }));
  return results;
}

module.exports = { createClient, pool, sleep };
