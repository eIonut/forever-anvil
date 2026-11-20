// Backup for the hourly price job. GitHub's own schedule (site.yml, minute 17) is best-effort: new
// schedules can take hours to start, and busy hours get delayed or skipped. So Cloudflare also runs
// this every hour (wrangler.jsonc "triggers", minute 47): if no price-job run has started on GitHub
// in the last 40 minutes, it starts one through GitHub's API ("Run workflow", without a deploy;
// the workflow still deploys by itself when the last deploy is over 20 hours old).
//
// Needs the Worker secret GITHUB_TOKEN: a fine-grained token for this repository only, with
// "Actions: Read and write" (docs/launch-checklist.md, step 11). Without it this does nothing.
export const REPO = "eIonut/forever-anvil";
export const WORKFLOW = "site.yml";
const RECENT_MS = 40 * 60 * 1000;

const API = "https://api.github.com";

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "forever-anvil-worker" // GitHub refuses requests without one
  };
}

// → "started" | "skipped" (a price-job run is recent) | "not-configured"; throws on API errors
export async function ensureHourlyRun(env, { fetch: f = fetch, now = Date.now() } = {}) {
  if (!env.GITHUB_TOKEN) return "not-configured";
  const base = `${API}/repos/${REPO}/actions/workflows/${WORKFLOW}`;

  const res = await f(`${base}/runs?per_page=10`, { headers: headers(env.GITHUB_TOKEN) });
  if (!res.ok) throw new Error(`GitHub runs list: ${res.status} ${await res.text()}`);
  const { workflow_runs: runs = [] } = await res.json();
  // push runs only rebuild the site; schedule and "Run workflow" runs do the price job
  const recent = runs.some((r) => r.event !== "push" && now - Date.parse(r.created_at) < RECENT_MS);
  if (recent) return "skipped";

  const go = await f(`${base}/dispatches`, {
    method: "POST",
    headers: { ...headers(env.GITHUB_TOKEN), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { deploy: "false" } })
  });
  if (!go.ok) throw new Error(`GitHub dispatch: ${go.status} ${await go.text()}`);
  return "started";
}
