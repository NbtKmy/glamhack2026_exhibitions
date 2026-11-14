# Exhibition Timeline Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `timeline.html` page with a stacked per-year bar chart (Wikidata vs hackathon Wikibase exhibitions, counted in every year they ran) and a click-to-open panel listing that year's exhibitions.

**Architecture:** Pure data functions in `js/timeline-data.js` (tested with `node --test`) turn both snapshots into one exhibition shape, deduplicate (Wikidata wins), and bucket by year. `js/timeline.js` wires the page: loads snapshots, draws a hand-built SVG, renders the panel. DOM helpers shared with the map move to `js/dom.js`.

**Tech Stack:** Plain ES modules, SVG, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-timeline-page-design.md`

## Global Constraints

- No new dependencies; no chart library.
- All text from data is inserted with `textContent` (via `el()`), never as HTML.
- UI language: English.
- Colours: Wikidata `#c2410c` (existing `--accent`); Wikibase `#2563eb`.
- Note text, verbatim: "Where an exhibition is in Wikidata, the Wikidata record is used."
- Hover text per bar: `"1998: 34 Wikidata, 5 Wikibase"`.
- An exhibition counts in every year from `startYear` to `endYear` inclusive.
- Wikibase item IDs and property IDs live only in `wikibaseSource` in `js/config.js`.
- Do not commit `data/wikibase-snapshot.json` or `reports/` (test data).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Wikibase snapshot missing (404 on GitHub Pages, where it is not committed) → page shows Wikidata bars and the line "Hackathon Wikibase data is not loaded yet." No console error that stops rendering.
2. Wikibase item with only an end date, or end before start → same fallback as Wikidata: start = end; inverted pair swapped.
3. Wikibase date with year precision only (`+1998-00-00`, precision 9) → counted in 1998, shown as `1998`.
4. Year with zero exhibitions inside the range → an empty slot (gap stays visible), not removed from the axis.
5. Wikibase item with a P69 link to an item not in the Swiss Wikidata snapshot → not counted anywhere.

---

### Task 1: Config and Wikibase records in the shared shape

**Files:**
- Modify: `js/config.js` (`wikibaseSource`)
- Create: `js/timeline-data.js`
- Create: `tests/timeline-data.test.js`
- Create: `tests/fixtures/wikibase-mini.json`

**Interfaces:**
- Consumes: `parseTime(value)` from `js/duplicates.js` → `{ year, month, day, precision } | null`.
- Produces:
  - `wikibaseSource.exhibitionClasses = ["Q20", "Q21", "Q1100"]`; `wikibaseSource.switzerland = null`; `wikibaseSource.props.country = null`; `wikibaseSource.props.location = null`.
  - `wikibaseExhibitions(snapshot, source) -> Exhibition[]` where
    `Exhibition = { id, source: "wikibase", title, titleLang, start, end, startYear, endYear, venues: string[], url, wikidataId }`;
    `start`/`end` are `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"` strings or `null`.

- [ ] **Step 1: Write the fixture** `tests/fixtures/wikibase-mini.json`: `{ "entities": {...}, "locations": {...} }` with items:
  - `Q501` P2=Q20, label de "Ausstellung A", P23 `+1998-03-01` (precision 11), P24 `+2001-06-30` (11)
  - `Q502` P2=Q1100, label en "Year Only", P23 `+2005-00-00` (precision 9), no P24
  - `Q503` P2=Q20, label fr "Fin seule", only P24 `+2010-05-00` (precision 10)
  - `Q504` P2=Q20, label en "Inverted", P23 `+2003-01-01`, P24 `+2002-01-01`
  - `Q505` P2=Q20, label en "Linked", P69 `Q999`
  - `Q506` P2=Q9 (not an exhibition class), label en "Venue-ish"
  - `Q507` P2=Q20, label en "No date"
  - `Q508` P2=Q20, label en "Abroad", P23 `+2000-01-01`, country claim `Q77` (property `P90` in the fixture)
  - `Q509` P2=Q20, label en "At venue", P23 `+2000-01-01`, location claim `Q600` (property `P91`); `locations.Q600` has label en "Kunsthaus"

- [ ] **Step 2: Write the failing tests** in `tests/timeline-data.test.js`, using a test source `{ ...wikibaseSource, switzerland: "Q76", props: { ...wikibaseSource.props, country: "P90", location: "P91" } }`:

```js
test("wikibase: full dates become strings and years", () => {
  const e = byId("Q501");
  assert.deepEqual([e.start, e.end, e.startYear, e.endYear], ["1998-03-01", "2001-06-30", 1998, 2001]);
  assert.equal(e.source, "wikibase");
  assert.equal(e.url, wikibaseSource.itemUrl("Q501"));
});
test("wikibase: year precision gives a year string, end falls back to start", () => {
  assert.deepEqual([byId("Q502").start, byId("Q502").end, byId("Q502").endYear], ["2005", "2005", 2005]);
});
test("wikibase: end alone is used as start", () => {
  assert.deepEqual([byId("Q503").start, byId("Q503").end], ["2010-05", "2010-05"]);
});
test("wikibase: inverted range is swapped", () => {
  assert.deepEqual([byId("Q504").startYear, byId("Q504").endYear], [2002, 2003]);
});
test("wikibase: non-exhibition classes are skipped", () => assert.equal(byId("Q506"), undefined));
test("wikibase: undated item has null years", () => assert.equal(byId("Q507").startYear, null));
test("wikibase: other country is skipped, missing country is kept", () => {
  assert.equal(byId("Q508"), undefined);
  assert.ok(byId("Q501"));
});
test("wikibase: location labels become venues", () => assert.deepEqual(byId("Q509").venues, ["Kunsthaus"]));
test("wikibase: P69 link is kept as wikidataId", () => assert.equal(byId("Q505").wikidataId, "Q999"));
test("wikibase: missing snapshot gives no records", () => assert.deepEqual(wikibaseExhibitions(null, source), []));
```

- [ ] **Step 3: Run** `node --test tests/timeline-data.test.js` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `wikibaseExhibitions(snapshot, source)`** in `js/timeline-data.js`. Title via `pickLabel(labels, profiles.wikidata.labelLanguages)` from `normalize.js`, falling back to the P4 title then the ID. Date strings follow `parseTime` precision. Country rule applies only when both `source.props.country` and `source.switzerland` are set. Location rule only when `source.props.location` is set; label from `snapshot.locations?.[id]`, else the ID. Add the config fields listed in Interfaces.

- [ ] **Step 5: Snapshot script fetches location labels.** In `scripts/fetch-wikibase-snapshot.mjs`, when `wikibaseSource.props.location` is set, collect the location item IDs from the fetched entities and store their labels under a top-level `locations` key (`{ Q600: { labels: {...} } }`), using the same sequential `fetchEntities`. When it is `null`, write no `locations` key. Entities under `entities` stay exhibitions only, so `check-duplicates.mjs` is unaffected.

- [ ] **Step 6: Run** `npm test` — Expected: all tests PASS.

- [ ] **Step 7: Commit** `feat: read hackathon Wikibase exhibitions for the timeline`.

### Task 2: Merge, deduplicate and bucket by year

**Files:**
- Modify: `js/timeline-data.js`
- Modify: `tests/timeline-data.test.js`

**Interfaces:**
- Consumes: `normalize(responses, profile)` model; `Exhibition[]` from Task 1.
- Produces:
  - `wikidataExhibitions(model, profile) -> Exhibition[]` (`source: "wikidata"`, `venues` = venue names from `model.venues`, `url = profile.itemUrl(id)`, `wikidataId = id`).
  - `mergeSources(wikidata: Exhibition[], wikibase: Exhibition[]) -> Exhibition[]` — drops every Wikibase record with a `wikidataId`.
  - `yearBuckets(exhibitions) -> { years: [{ year, wikidata: Exhibition[], wikibase: Exhibition[] }], undated: { wikidata: number, wikibase: number } }` — `years` covers every year from the minimum `startYear` to the maximum `endYear`, empty years included, ascending; each list sorted by `start` then `title`. No dated exhibitions → `years: []`.

- [ ] **Step 1: Write the failing tests:**

```js
test("merge: linked Wikibase items are dropped, whether or not Wikidata has them", () => {
  const merged = mergeSources([wd("Q1", 2000, 2000)], [wb("Q501", 2000, 2000, "Q1"), wb("Q505", 2000, 2000, "Q999"), wb("Q507", 2000, 2000, null)]);
  assert.deepEqual(merged.map((e) => e.id), ["Q1", "Q507"]);
});
test("buckets: an exhibition counts in every running year", () => {
  const { years } = yearBuckets([wd("Q1", 1998, 2001)]);
  assert.deepEqual(years.map((y) => [y.year, y.wikidata.length]), [[1998, 1], [1999, 1], [2000, 1], [2001, 1]]);
});
test("buckets: empty years inside the range are kept", () => {
  const { years } = yearBuckets([wd("Q1", 1990, 1990), wb("Q2", 1993, 1993, null)]);
  assert.deepEqual(years.map((y) => y.year), [1990, 1991, 1992, 1993]);
  assert.equal(years[1].wikidata.length + years[1].wikibase.length, 0);
  assert.equal(years[3].wikibase.length, 1);
});
test("buckets: undated are counted per source, not placed", () => {
  const r = yearBuckets([wd("Q1", null, null), wb("Q2", null, null, null), wb("Q3", null, null, null)]);
  assert.deepEqual(r.undated, { wikidata: 1, wikibase: 2 });
  assert.deepEqual(r.years, []);
});
test("wikidataExhibitions: venue ids become names", () => { /* from tests/fixtures/mini.json via normalize; Q2 venues are the names of V1 and V2 */ });
```
(`wd`/`wb` are small test helpers building an `Exhibition` with the given id, years and `wikidataId`.)

- [ ] **Step 2: Run** `node --test tests/timeline-data.test.js` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three functions in `js/timeline-data.js`.
- [ ] **Step 4: Run** `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: count exhibitions per running year from both sources`.

### Task 3: Timeline page

**Files:**
- Create: `js/dom.js` (move `el`, `langTag` out of `js/app.js`; `app.js` imports them)
- Create: `timeline.html`
- Create: `js/timeline.js`
- Modify: `index.html` (header link "Timeline →" to `timeline.html`)
- Modify: `css/style.css` (chart, legend, note, header link; `--wikibase: #2563eb`)
- Modify: `README.md` (one short section on the timeline page and the dedup rule)

**Interfaces:**
- Consumes: everything from Tasks 1–2; `exhibitionItem`-style rows as in `js/app.js` (time, link, language tag) plus a venue line and a source tag.

- [ ] **Step 1: Move `el` and `langTag` to `js/dom.js`**, import them in `js/app.js`. Run `npm test` — PASS — and open `index.html` via `npx serve` (or `python3 -m http.server`): map still renders.

- [ ] **Step 2: Write `timeline.html`.** Same structure and CSP as `index.html`, minus Leaflet and the tile host (`img-src 'self' data:`; `connect-src 'self'`). Header: `<h1>Exhibitions in Switzerland — timeline</h1>`, the note sentence (Global Constraints), link "← Map". Main: a horizontally scrolling `<div id="chart">`, a legend (two swatches: "Wikidata", "Hackathon Wikibase"), `<p id="undated">`, `<p id="wikibase-status">`, and the same `<aside id="panel">` markup as the map.

- [ ] **Step 3: Write `js/timeline.js`.**
  - Load `data/snapshot.json` (required) and `data/wikibase-snapshot.json` (optional: non-OK or parse error → `null`, and `#wikibase-status` reads "Hackathon Wikibase data is not loaded yet.").
  - SVG: one `<g>` per year at fixed bar width 8px, gap 2px, height 240px plot; linear y scale to the max yearly total; Wikidata rect at the bottom, Wikibase rect stacked above. Empty years draw nothing but keep their slot. Y axis: 0 and max with a few round ticks. X tick labels every 10 years (every 50 when the span exceeds 300 years).
  - Each year group: transparent full-height hit rect, `<title>` with the hover text, `tabindex="0"`, `role="button"`, `aria-label` = hover text; click or Enter opens the panel. Selected year gets an outline.
  - Panel: `<h2>` year, `<p class="muted">` "N exhibitions running in YEAR", then `<h3>Wikidata (n)</h3>` list and `<h3>Hackathon Wikibase (n)</h3>` list (omit a heading whose list is empty). Row: dates, linked title, language tag, venues joined by ", " (muted), all via `el()`.
  - `#undated`: "Without dates: N Wikidata, M Wikibase" (omit the Wikibase part when Wikibase is not loaded).

- [ ] **Step 4: Verify in a browser** (`python3 -m http.server` then open `/timeline.html`):
  - Bars from 1881 to 2027; hover on 1998 shows the hover text format.
  - Click a bar → panel lists that year's exhibitions; close button works; Enter on a focused bar opens it.
  - Temporarily rename `data/wikibase-snapshot.json` → status line appears, bars still render; rename back.
  - With the snapshot present: the Wikibase colour appears only where unlinked items have dates (currently none of the 3 test items may have dates — then no blue, which is correct).
  - No CSP errors in the console; width ~400px: chart scrolls horizontally, page does not.

- [ ] **Step 5: Run** `npm test` — Expected: all PASS.

- [ ] **Step 6: Commit** `feat: add exhibition timeline page` (do not stage `data/wikibase-snapshot.json` or `reports/`).
