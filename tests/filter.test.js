import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeProfile } from "../js/config.js";
import { normalize } from "../js/normalize.js";
import { normalizeRange, isInRange, venueCounts, venueListing, countInRange } from "../js/filter.js";

const raw = JSON.parse(readFileSync(new URL("./fixtures/mini.json", import.meta.url), "utf8"));
const model = normalize(raw, activeProfile);
const ex = (id) => model.exhibitions.find((e) => e.id === id);

test("normalizeRange sorts crossed slider handles", () => {
  assert.deepEqual(normalizeRange(2010, 1990), [1990, 2010]);
  assert.deepEqual(normalizeRange(1990, 2010), [1990, 2010]);
});

test("isInRange checks overlap of the exhibition interval", () => {
  assert.equal(isInRange(ex("Q1"), 1998, 1998), true);
  assert.equal(isInRange(ex("Q1"), 1999, 2000), false);
  assert.equal(isInRange(ex("Q4"), 0, 3000), false);
});

test("venueCounts counts multi-venue exhibitions at each venue", () => {
  const all = venueCounts(model, 1990, 2020);
  assert.equal(all.get("V1"), 3);
  assert.equal(all.get("V2"), 1);
  const none = venueCounts(model, 2006, 2009);
  assert.equal(none.get("V1"), 0);
  assert.equal(none.get("V2"), 0);
});

test("venueListing sorts in-range items by start and separates undated", () => {
  const listing = venueListing(model, "V1", 1990, 2020);
  assert.deepEqual(listing.inRange.map((e) => e.id), ["Q1", "Q2", "Q3"]);
  assert.deepEqual(listing.undated, []);
});

test("countInRange counts distinct exhibitions", () => {
  assert.equal(countInRange(model, 1990, 2020), 3);
});
