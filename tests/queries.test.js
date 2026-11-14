import { test } from "node:test";
import assert from "node:assert/strict";
import { activeProfile } from "../js/config.js";
import { buildQueries, runQuery } from "../js/queries.js";

test("buildQueries returns the three named queries", () => {
  const q = buildQueries(activeProfile);
  assert.deepEqual(Object.keys(q).sort(), ["exhibitionLabels", "exhibitions", "venues"]);
});

test("every query declares prefixes and uses the profile IDs", () => {
  for (const sparql of Object.values(buildQueries(activeProfile))) {
    assert.match(sparql, /PREFIX wd: <http:\/\/www\.wikidata\.org\/entity\/>/);
    assert.match(sparql, /PREFIX wdt: <http:\/\/www\.wikidata\.org\/prop\/direct\/>/);
    assert.match(sparql, /wd:Q464980/);
    assert.match(sparql, /wd:Q39\b/);
    assert.doesNotMatch(sparql, /wikibase:label/);
  }
});

test("IDs come from the profile, not hard-coded", () => {
  const profile = { ...activeProfile, country: "Q999" };
  for (const sparql of Object.values(buildQueries(profile))) {
    assert.match(sparql, /wd:Q999\b/);
    assert.doesNotMatch(sparql, /wd:Q39\b/);
  }
});

test("runQuery POSTs to the profile endpoint and returns the JSON", async () => {
  const body = { results: { bindings: [] } };
  let call;
  const fetchFn = async (url, init) => {
    call = { url, init };
    return { ok: true, json: async () => body };
  };
  const result = await runQuery(activeProfile, "SELECT * WHERE {}", fetchFn);
  assert.equal(result, body);
  assert.equal(call.url, activeProfile.endpoint);
  assert.equal(call.init.method, "POST");
});

test("runQuery rejects on a non-OK response", async () => {
  const fetchFn = async () => ({ ok: false, status: 500, statusText: "Server Error" });
  await assert.rejects(runQuery(activeProfile, "SELECT * WHERE {}", fetchFn), /500/);
});

test("timeoutFetch aborts a request that takes too long", async () => {
  const { timeoutFetch } = await import("../js/queries.js");
  const slow = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  await assert.rejects(timeoutFetch(20, slow)("https://example.org", {}), /aborted|timed out/);
});

test("timeoutFetch passes through a fast response", async () => {
  const { timeoutFetch } = await import("../js/queries.js");
  const fast = async () => ({ ok: true, json: async () => ({ a: 1 }) });
  const res = await timeoutFetch(1000, fast)("https://example.org", {});
  assert.equal(res.ok, true);
  assert.deepEqual(await res.json(), { a: 1 });
});

test("fetchAll sends one request at a time (QLever rate-limits parallel requests)", async () => {
  const { fetchAll } = await import("../js/queries.js");
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchFn = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { ok: true, json: async () => ({ results: { bindings: [] } }) };
  };
  const result = await fetchAll(activeProfile, fetchFn);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(Object.keys(result).sort(), ["exhibitionLabels", "exhibitions", "venues"]);
});

test("timeoutFetch also times out a response body that never arrives", async () => {
  const { timeoutFetch } = await import("../js/queries.js");
  const stalled = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(runQuery(activeProfile, "SELECT * WHERE {}", timeoutFetch(20, stalled)), /timed out/);
});

test("runQuery explains a 429 rate limit", async () => {
  const fetchFn = async () => ({ ok: false, status: 429, statusText: "Too Many Requests" });
  await assert.rejects(runQuery(activeProfile, "SELECT * WHERE {}", fetchFn), /rate-limit.*try again in a minute/i);
});
