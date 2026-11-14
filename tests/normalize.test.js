import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeProfile } from "../js/config.js";
import { normalize, pickLabel, parsePoint } from "../js/normalize.js";

const raw = JSON.parse(readFileSync(new URL("./fixtures/mini.json", import.meta.url), "utf8"));
const model = normalize(raw, activeProfile);
const ex = (id) => model.exhibitions.find((e) => e.id === id);
const venue = (id) => model.venues.find((v) => v.id === id);

test("earliest start and latest end are used", () => {
  assert.equal(ex("Q1").start, "1998-03-01");
  assert.equal(ex("Q1").startYear, 1998);
  assert.equal(ex("Q1").endYear, 1998);
});

test("title falls back through labelLanguages", () => {
  assert.equal(ex("Q1").title, "Ausstellung");
  assert.equal(ex("Q1").titleLang, "de");
  assert.equal(ex("Q2").titleLang, "en");
});

test("point in time is used when there is no start", () => {
  assert.equal(ex("Q2").startYear, 2005);
  assert.equal(ex("Q2").endYear, 2005);
  assert.deepEqual(ex("Q2").venueIds, ["V1", "V2"]);
});

test("end date alone is used as start and end", () => {
  assert.equal(ex("Q3").startYear, 2010);
  assert.equal(ex("Q3").endYear, 2010);
});

test("an exhibition without labels, dates or venue still normalises", () => {
  assert.equal(ex("Q4").title, "Q4");
  assert.equal(ex("Q4").titleLang, null);
  assert.deepEqual(ex("Q4").venueIds, []);
  assert.equal(ex("Q4").startYear, null);
});

test("venues get coordinates and fall back to the ID as name", () => {
  assert.equal(venue("V1").lat, 47.37);
  assert.equal(venue("V1").lon, 8.5);
  assert.equal(venue("V1").name, "Kunsthaus");
  assert.equal(venue("V2").lat, null);
  assert.equal(venue("V2").name, "V2");
  assert.deepEqual(venue("V1").exhibitionIds.sort(), ["Q1", "Q2", "Q3"]);
});

test("gaps are counted", () => {
  assert.deepEqual(model.gaps, {
    total: 4, noDate: 1, noEnglishLabel: 3, noVenue: 1, venuesNoCoord: 1, exhibitionsOffMap: 1,
  });
});

test("yearRange spans the dated exhibitions", () => {
  assert.deepEqual(model.yearRange, [1998, 2010]);
});

test("pickLabel falls back to any language, or null", () => {
  assert.deepEqual(pickLabel([{ value: "A", lang: "ja" }], ["en"]), { value: "A", lang: "ja" });
  assert.equal(pickLabel([], ["en"]), null);
});

test("parsePoint reads WKT points in either case", () => {
  assert.deepEqual(parsePoint("Point(8.5 47.37)"), { lat: 47.37, lon: 8.5 });
  assert.deepEqual(parsePoint("POINT(6.945180 46.998837)"), { lat: 46.998837, lon: 6.94518 });
  assert.equal(parsePoint("garbage"), null);
});
