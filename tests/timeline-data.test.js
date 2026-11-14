import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wikibaseSource } from "../js/config.js";
import { wikibaseExhibitions } from "../js/timeline-data.js";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/wikibase-mini.json", import.meta.url), "utf8"));
const source = {
  ...wikibaseSource,
  switzerland: "Q76",
  props: { ...wikibaseSource.props, country: "P90", location: "P91" },
};
const records = wikibaseExhibitions(snapshot, source);
const byId = (id) => records.find((e) => e.id === id);

test("wikibase: full dates become strings and years", () => {
  const e = byId("Q501");
  assert.deepEqual([e.start, e.end, e.startYear, e.endYear], ["1998-03-01", "2001-06-30", 1998, 2001]);
  assert.equal(e.source, "wikibase");
  assert.equal(e.title, "Ausstellung A");
  assert.equal(e.titleLang, "de");
  assert.equal(e.url, wikibaseSource.itemUrl("Q501"));
});

test("wikibase: year precision gives a year string, end falls back to start", () => {
  const e = byId("Q502");
  assert.deepEqual([e.start, e.end, e.endYear], ["2005", "2005", 2005]);
});

test("wikibase: end alone is used as start", () => {
  assert.deepEqual([byId("Q503").start, byId("Q503").end], ["2010-05", "2010-05"]);
});

test("wikibase: inverted range is swapped", () => {
  assert.deepEqual([byId("Q504").startYear, byId("Q504").endYear], [2002, 2003]);
});

test("wikibase: non-exhibition classes are skipped", () => {
  assert.equal(byId("Q506"), undefined);
});

test("wikibase: undated item has null years", () => {
  assert.equal(byId("Q507").startYear, null);
  assert.equal(byId("Q507").start, null);
});

test("wikibase: other country is skipped, missing country is kept", () => {
  assert.equal(byId("Q508"), undefined);
  assert.ok(byId("Q501"));
});

test("wikibase: country rule is off until the IDs are configured", () => {
  assert.ok(wikibaseExhibitions(snapshot, wikibaseSource).find((e) => e.id === "Q508"));
});

test("wikibase: location labels become venues", () => {
  assert.deepEqual(byId("Q509").venues, ["Kunsthaus"]);
  assert.deepEqual(byId("Q501").venues, []);
});

test("wikibase: P69 link is kept as wikidataId", () => {
  assert.equal(byId("Q505").wikidataId, "Q999");
  assert.equal(byId("Q501").wikidataId, null);
});

test("wikibase: missing snapshot gives no records", () => {
  assert.deepEqual(wikibaseExhibitions(null, source), []);
});
