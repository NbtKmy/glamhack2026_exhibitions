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
