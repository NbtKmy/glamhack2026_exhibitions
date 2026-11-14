import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeProfile, wikibaseSource } from "../js/config.js";
import { normalize } from "../js/normalize.js";
import { mergeSources, wikibaseExhibitions, wikidataExhibitions, yearBuckets } from "../js/timeline-data.js";

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

const record = (source) => (id, startYear, endYear, wikidataId = null) => ({
  id,
  source,
  title: id,
  titleLang: null,
  start: startYear === null ? null : String(startYear),
  end: endYear === null ? null : String(endYear),
  startYear,
  endYear,
  venues: [],
  url: id,
  wikidataId: source === "wikidata" ? id : wikidataId,
});
const wd = record("wikidata");
const wb = record("wikibase");

test("merge: linked Wikibase items are dropped, whether or not Wikidata has them", () => {
  const merged = mergeSources(
    [wd("Q1", 2000, 2000)],
    [wb("Q501", 2000, 2000, "Q1"), wb("Q505", 2000, 2000, "Q999"), wb("Q507", 2000, 2000)],
  );
  assert.deepEqual(merged.map((e) => e.id), ["Q1", "Q507"]);
});

test("buckets: an exhibition counts in every running year", () => {
  const { years } = yearBuckets([wd("Q1", 1998, 2001)]);
  assert.deepEqual(years.map((y) => [y.year, y.wikidata.length]), [[1998, 1], [1999, 1], [2000, 1], [2001, 1]]);
});

test("buckets: empty years inside the range are kept", () => {
  const { years } = yearBuckets([wd("Q1", 1990, 1990), wb("Q2", 1993, 1993)]);
  assert.deepEqual(years.map((y) => y.year), [1990, 1991, 1992, 1993]);
  assert.equal(years[1].wikidata.length + years[1].wikibase.length, 0);
  assert.equal(years[3].wikibase.length, 1);
});

test("buckets: undated are counted per source, not placed", () => {
  const r = yearBuckets([wd("Q1", null, null), wb("Q2", null, null), wb("Q3", null, null)]);
  assert.deepEqual(r.undated, { wikidata: 1, wikibase: 2 });
  assert.deepEqual(r.years, []);
});

test("buckets: lists are sorted by start, then title", () => {
  const a = { ...wd("Qa", 2000, 2000), start: "2000-05", title: "B" };
  const b = { ...wd("Qb", 2000, 2000), start: "2000-05", title: "A" };
  const c = { ...wd("Qc", 1999, 2000), start: "1999" };
  const [, y2000] = yearBuckets([a, b, c]).years;
  assert.deepEqual(y2000.wikidata.map((e) => e.id), ["Qc", "Qb", "Qa"]);
});

test("wikidataExhibitions: venue ids become names, items link to Wikidata", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/mini.json", import.meta.url), "utf8"));
  const list = wikidataExhibitions(normalize(raw, activeProfile), activeProfile);
  const q2 = list.find((e) => e.id === "Q2");
  assert.deepEqual(q2.venues, ["Kunsthaus", "V2"]);
  assert.equal(q2.source, "wikidata");
  assert.equal(q2.wikidataId, "Q2");
  assert.equal(q2.url, activeProfile.itemUrl("Q2"));
  assert.equal(q2.startYear, 2005);
});
