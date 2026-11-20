// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ensureHourlyRun } from "./hourly.js";

const NOW = Date.parse("2026-11-20T15:47:00Z");
const ago = (min) => new Date(NOW - min * 60000).toISOString();

// a fake GitHub: answers the runs list with `runs`, records every request
function fakeGitHub(runs, { dispatchStatus = 204 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body && JSON.parse(init.body), headers: init.headers });
    if (url.endsWith("/dispatches")) return new Response(null, { status: dispatchStatus });
    return Response.json({ workflow_runs: runs });
  };
  return { fetch, calls };
}

const env = { GITHUB_TOKEN: "test-token" };

test("hourly backup: starts the price job when GitHub's schedule missed it", async () => {
  const gh = fakeGitHub([{ event: "push", created_at: ago(5) }, { event: "schedule", created_at: ago(90) }]);
  assert.equal(await ensureHourlyRun(env, { fetch: gh.fetch, now: NOW }), "started");
  const post = gh.calls.find((c) => c.method === "POST");
  assert.match(post.url, /\/repos\/eIonut\/forever-anvil\/actions\/workflows\/site\.yml\/dispatches$/);
  assert.deepEqual(post.body, { ref: "main", inputs: { deploy: "false" } });
  assert.equal(post.headers.Authorization, "Bearer test-token");
  assert.ok(post.headers["User-Agent"]);
});

test("hourly backup: does nothing when a price job started recently", async () => {
  for (const event of ["schedule", "workflow_dispatch"]) {
    const gh = fakeGitHub([{ event, created_at: ago(30) }]);
    assert.equal(await ensureHourlyRun(env, { fetch: gh.fetch, now: NOW }), "skipped");
    assert.equal(gh.calls.length, 1);
  }
});

test("hourly backup: no token, no requests", async () => {
  const gh = fakeGitHub([]);
  assert.equal(await ensureHourlyRun({}, { fetch: gh.fetch, now: NOW }), "not-configured");
  assert.equal(gh.calls.length, 0);
});

test("hourly backup: a refused dispatch is an error (shows in the Worker's logs)", async () => {
  const gh = fakeGitHub([], { dispatchStatus: 403 });
  await assert.rejects(ensureHourlyRun(env, { fetch: gh.fetch, now: NOW }), /dispatch: 403/);
});
