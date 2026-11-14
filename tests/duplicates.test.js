import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeProfile, wikibaseSource } from "../js/config.js";
import {
  normTitle,
  parseTime,
  compareDates,
  titleMatch,
  fromWikibaseEntity,
  fromWikidataEntity,
  fromSparql,
  findMatches,
} from "../js/duplicates.js";

const snak = (property, value) => ({ mainsnak: { snaktype: "value", property, datavalue: { value } } });
const time = (t, precision) => ({ time: t, precision });

const wbEntity = {
  id: "Q900",
  labels: { en: { language: "en", value: "Giacometti: The Late Works" } },
  aliases: { de: [{ language: "de", value: "Giacometti – Das Spätwerk" }] },
  claims: {
    P4: [snak("P4", { text: "Giacometti. Spätwerk", language: "de" })],
    P23: [snak("P23", time("+1998-03-01T00:00:00Z", 11))],
    P24: [snak("P24", time("+1998-06-30T00:00:00Z", 11))],
    P69: [snak("P69", "Q12345")],
  },
};

const wdEntity = {
  id: "Q555",
  labels: { fr: { language: "fr", value: "Giacometti : the late works" } },
  descriptions: { de: { language: "de", value: "Ausstellung" }, en: { language: "en", value: "exhibition" } },
  claims: {
    P580: [snak("P580", time("+1998-00-00T00:00:00Z", 9))],
    P582: [snak("P582", time("+1998-00-00T00:00:00Z", 9))],
  },
};

test("titles are compared without case, accents or punctuation", () => {
  assert.equal(normTitle("  Écoles d’Art: “Paris”  "), "ecoles d art paris");
  assert.equal(normTitle("Spätwerk"), "spatwerk");
});

test("time values keep their precision and drop zero month and day", () => {
  assert.deepEqual(parseTime(time("+1998-00-00T00:00:00Z", 9)), { year: 1998, month: null, day: null, precision: 9 });
  assert.deepEqual(parseTime(time("+1998-06-00T00:00:00Z", 11)), { year: 1998, month: 6, day: null, precision: 10 });
  assert.deepEqual(parseTime(time("-0500-01-01T00:00:00Z", 11)), { year: -500, month: 1, day: 1, precision: 11 });
  assert.equal(parseTime(time("+1990-00-00T00:00:00Z", 8)), null);
});

test("a Wikibase entity yields labels, aliases, P4 titles, dates and its Wikidata link", () => {
  const r = fromWikibaseEntity(wbEntity, wikibaseSource);
  assert.equal(r.id, "Q900");
  assert.equal(r.wikidataId, "Q12345");
  assert.deepEqual(
    r.titles.map((t) => t.value),
    ["Giacometti: The Late Works", "Giacometti – Das Spätwerk", "Giacometti. Spätwerk"],
  );
  assert.equal(r.start.day, 1);
  assert.equal(r.end.month, 6);
});

test("the English description is preferred", () => {
  assert.equal(fromWikidataEntity(wdEntity).description, "exhibition");
  assert.equal(fromWikibaseEntity(wbEntity, wikibaseSource).description, null);
});

test("dates are compared at the coarser precision", () => {
  const a = fromWikibaseEntity(wbEntity, wikibaseSource);
  const b = fromWikidataEntity(wdEntity);
  assert.equal(compareDates(a, b), "same");
  assert.equal(compareDates(a, { start: parseTime(time("+1999-00-00T00:00:00Z", 9)), end: null }), "conflict");
  assert.equal(compareDates(a, { start: null, end: null }), "unknown");
  assert.equal(compareDates({ start: null, end: a.end }, { start: null, end: b.end }), "same");
});

test("titles match exactly or on the main title before a subtitle", () => {
  const a = { titles: [{ value: "Giacometti: The Late Works", lang: "en" }] };
  assert.equal(titleMatch(a, { titles: [{ value: "giacometti the late works", lang: "fr" }] }), "exact");
  assert.equal(titleMatch(a, { titles: [{ value: "Giacometti", lang: "de" }] }), "main");
  assert.equal(titleMatch(a, { titles: [{ value: "Giacometti and Picasso", lang: "en" }] }), null);
});

test("verdicts: same dates are likely, unknown dates possible, other dates a different edition", () => {
  const target = fromWikibaseEntity({ ...wbEntity, id: "Q901", claims: { ...wbEntity.claims, P69: [] } }, wikibaseSource);
  const later = { id: "Q556", titles: target.titles, start: parseTime(time("+2004-00-00T00:00:00Z", 9)), end: null };
  const undated = { id: "Q557", titles: target.titles, start: null, end: null };
  const unrelated = { id: "Q558", titles: [{ value: "Other show", lang: "en" }], start: target.start, end: target.end };
  const matches = findMatches(target, [later, unrelated, undated, fromWikidataEntity(wdEntity)]);
  assert.deepEqual(
    matches.map((m) => [m.candidate.id, m.verdict]),
    [["Q555", "likely"], ["Q557", "possible"], ["Q556", "different edition"]],
  );
});

test("an item is never matched with itself", () => {
  const r = fromWikibaseEntity(wbEntity, wikibaseSource);
  assert.deepEqual(findMatches(r, [r]), []);
});

test("SPARQL snapshot rows become records with year precision", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/mini.json", import.meta.url), "utf8"));
  const q1 = fromSparql(raw, activeProfile).find((r) => r.id === "Q1");
  assert.equal(q1.wikidataId, "Q1");
  assert.equal(q1.start.precision, 9);
  assert.equal(q1.start.year, 1998);
  assert.ok(q1.titles.some((t) => t.value === "Ausstellung"));
});

test("two unlinked Wikibase items with the same title find each other", () => {
  const unlinked = (id) => fromWikibaseEntity({ ...wbEntity, id, claims: { ...wbEntity.claims, P69: [] } }, wikibaseSource);
  const [a, b] = [unlinked("Q901"), unlinked("Q902")];
  const matches = findMatches(a, [a, b]);
  assert.deepEqual(matches.map((m) => [m.candidate.id, m.candidate.wikidataId, m.verdict]), [["Q902", null, "likely"]]);
});
