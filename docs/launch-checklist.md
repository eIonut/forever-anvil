# Launch checklist: putting Forever Anvil online

How the live site works:

| Piece | What it does | Where |
|---|---|---|
| **Worker** `forever-anvil` | Serves the site from `dist/`, the price data at `/api/...` and the character lookup at `/api/character` | `worker/index.js`, `wrangler.jsonc` |
| **Workers KV** `DATA` | Holds the price job's public files (like `out/`, online) | Cloudflare |
| **GitHub workflow** "Prices and deploy" | Hourly: price job (EU + US) → uploads changed files to KV. Daily, and on every push to `main`: rebuilds and deploys the site | `.github/workflows/site.yml` |
| **Worker cron** (minute 47) | Backup for GitHub's unreliable schedule: starts the workflow when no price job has run in the last 40 minutes | `worker/hourly.js`, `wrangler.jsonc` |

All of it fits in the free plans: the Worker only runs for `/api` requests (pages, images and scripts don't count toward its 100,000 a day), KV gets ~600 of its 1,000 free writes a day, and GitHub Actions is free for public repositories. **Going over a free limit never costs money**: Cloudflare returns errors until the limit resets at midnight UTC. Just don't upgrade to Workers Paid.

Do the steps in this order. Commands go in a terminal in the project folder. **Never paste a secret (Blizzard secret, API token) into chat**; the commands below ask for them directly.

---

## 1. The domain

Buying `foreveranvil.com` from Cloudflare adds it to your account, ready to use. Nothing else to do.

## 2. Sign Wrangler in to Cloudflare

```powershell
npx wrangler login
```

A browser window asks you to allow access. Allow it.

## 3. Create the KV store

```powershell
npx wrangler kv namespace create DATA
```

It prints an `id` (not secret). Put it in `wrangler.jsonc` in place of `REPLACE_WITH_KV_NAMESPACE_ID`, or tell Claude the id.

## 4. First deploy, from your computer

```powershell
npm run build
```

```powershell
npx wrangler deploy
```

This creates the Worker and connects it to `foreveranvil.com`. The site is live after a minute or two. The tools say data is unavailable until the price job runs in step 8. That's expected.

## 5. A separate Blizzard API client for the character lookup

So nobody spamming lookups can use up the price job's Blizzard quota (36,000 calls an hour per client):

1. At https://community.developer.battle.net/access/clients, click **Create client**. Use the name "Forever Anvil lookups" and the redirect URL `https://foreveranvil.com`. The use case is the character lookup on the website.
2. Give the Worker its id and secret. Each command asks you to paste the value:

```powershell
npx wrangler secret put BNET_CLIENT_ID
```

```powershell
npx wrangler secret put BNET_CLIENT_SECRET
```

## 6. A Cloudflare API token for GitHub

1. Go to Cloudflare dashboard → your profile (top right) → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers** → **Use template**.
2. Under *Account Resources*, pick your account. Under *Zone Resources*, pick `foreveranvil.com`.
3. Create it and copy the token. It's shown only once.
4. Also copy your **Account ID**: Cloudflare dashboard → *Workers & Pages* → it's in the right-hand column.

## 7. GitHub secrets

GitHub → `eIonut/forever-tome` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, four times:

| Name | Value |
|---|---|
| `BNET_CLIENT_ID` | Your **original** "Forever Tome" Blizzard client id (the one in `.env`): the price job's |
| `BNET_CLIENT_SECRET` | Its secret |
| `CLOUDFLARE_API_TOKEN` | The token from step 6 |
| `CLOUDFLARE_ACCOUNT_ID` | The account id from step 6 |

## 8. Push and start the workflow

Push the commit (with the KV id in `wrangler.jsonc`). Then: GitHub → **Actions** → **Prices and deploy** → **Run workflow**. The first run takes a few minutes. After it finishes, reload the site and the tools show prices. From then on it runs by itself every hour.

If a run fails, GitHub emails you. Open the run to see which step failed.

## 9. Rate limiting on `/api` (Cloudflare dashboard)

`foreveranvil.com` → **Security** → **WAF** → **Rate limiting rules** → **Create rule**:

- Name: `API`
- If incoming requests match: **URI Path** · **starts with** · `/api/`
- With the same characteristics: **IP**
- When rate exceeds: **100** requests per **10 seconds**
- Then: **Block** for **10 seconds**

Blocked requests stop at Cloudflare's edge and never reach the Worker, so they don't use its daily allowance. The Worker also limits character lookups to 10 a minute per visitor.

## 10. HTTPS and www

- `foreveranvil.com` → **SSL/TLS** → **Edge Certificates** → turn on **Always Use HTTPS**.
- Optional, so `www.foreveranvil.com` works too:
  1. In **DNS**, add a record: type `AAAA`, name `www`, IPv6 `100::`, Proxied (orange cloud).
  2. In **Rules** → **Redirect Rules**, add a rule: hostname equals `www.foreveranvil.com` → dynamic redirect to `concat("https://foreveranvil.com", http.request.uri.path)`, status 301, preserve query string.

## 11. Backup for the hourly schedule (a GitHub token for the Worker)

GitHub's schedule is best-effort, and a new schedule can take hours to start. Every hour at minute 47 (UTC), the Worker checks whether a price job has started in the last 40 minutes, and if not, starts the workflow itself (`worker/hourly.js`). It needs a GitHub token that can do nothing but that:

1. GitHub → your profile → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `forever-anvil worker`. Expiration: the longest offered (put a reminder in your calendar to renew it). Repository access: **Only select repositories** → `eIonut/forever-anvil`.
3. Permissions → Repository permissions → **Actions: Read and write**. Leave everything else at "No access".
4. Generate it, then give it to the Worker (the command asks you to paste it):

```powershell
npx wrangler secret put GITHUB_TOKEN
```

To check that it works: Cloudflare → *Workers & Pages* → `forever-anvil` → *Logs*. Each hour after minute 47 there's a line "Hourly backup trigger: started" (it started the job), "skipped" (GitHub's schedule already ran it) or "not-configured" (no token). An expired or wrong token shows up there as an error.

Free plan: up to 5 cron triggers per account. This uses 1.

## 12. After launch

Follow "What you need to do after launch" in [seo-report.md](seo-report.md): Search Console, Bing, the sitemap, and sharing links with the community.

---

## Day to day

- **Code changes go live** when you push to `main` (the workflow rebuilds and deploys).
- **Pause everything:** GitHub → Actions → Prices and deploy → `···` → *Disable workflow*. Data in KV expires by itself after 28 days. The built pages keep their data until the next deploy, so redeploy or take the site down within 30 days (Blizzard's limit).
- **Usage:** Cloudflare → *Workers & Pages* → `forever-anvil` → *Metrics* (requests per day). For KV writes, the workflow log shows "writes today".
- **Logs/errors from the Worker:** Cloudflare → `forever-anvil` → *Logs*.
