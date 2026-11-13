# Swiss Exhibitions Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static site that maps Swiss exhibitions from Wikidata by venue, filters them by a year range, lists them per venue in a side panel, and shows data gaps, from a bundled snapshot with a "Fetch latest data" button.

**Architecture:** Pure ES modules shared by browser and Node: `config.js` (profile), `queries.js` (SPARQL build + fetch), `normalize.js` (raw SPARQL JSON → model), `filter.js` (year-range logic). `app.js` wires Leaflet and the DOM. The snapshot is the raw SPARQL responses written by a Node script that imports the same `queries.js`.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Leaflet 1.9.4 from cdnjs, OpenStreetMap tiles, Node v24.22.3 or later (November 2026 security release; `node:test`, built-in `fetch`, no npm dependencies).

**Spec:** `docs/superpowers/specs/2026-11-14-exhibition-map-design.md`

## Global Constraints

- No npm dependencies, no bundler, no framework. `package.json` exists only for `"type": "module"` and scripts.
- Modules under `js/` except `app.js` must not touch `window`/`document`, so they run under `node --test`.
- Endpoint `https://qlever.dev/api/wikidata`; every query declares its PREFIXes; never use `wikibase:label` or `wikibase:mwapi`.
- All Wikidata IDs and the endpoint come from the active profile in `js/config.js`, never hard-coded elsewhere.
- Label fallback order: `labelLanguages` = `["en", "de", "fr", "it", "rm"]`, then any language, then the QID.
- UI text is English.
- External scripts only from cdnjs with an exact version: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/`.
- Before using Leaflet APIs, read the 1.9.4 reference (https://leafletjs.com/reference.html) and add `Leaflet — URL — map` to the "外部ライブラリ" section of the vault note `scriptum machinae/参照URL.md`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Labels are untrusted text from Wikidata: titles and venue names must be inserted with `textContent` / DOM nodes, never `innerHTML` or Leaflet HTML-string popups. (Task 5 check.)
2. Live fetch fails (network error, HTTP 500, timeout): current data stays on screen and the error is shown. (`runQuery` rejects on non-OK — Task 1 test; UI behavior — Task 6 check.)
3. An exhibition with an end date but no start date, or no dates at all, must not crash and must land in the right bucket. (Task 3 tests.)
4. The two slider handles crossing (from > to) still filters a sane range. (`normalizeRange` — Task 4 test.)
5. An exhibition with no labels at all, or a venue with no labels or no coordinates, still renders (QID as title; venue off-map but counted). (Task 3 tests.)

---

### Task 1: Project skeleton, config and queries

**Files:**
- Create: `package.json`, `js/config.js`, `js/queries.js`, `tests/queries.test.js`

**Interfaces:**
- Produces:
  - `js/config.js`: `export const profiles = { wikidata: Profile }`, `export const activeProfile = profiles.wikidata`.
    `Profile = { name, endpoint, entityPrefix, directPropPrefix, itemUrl(id) -> string, classExhibition, country, props: { instanceOf, subclassOf, location, country, adminTerritory, start, end, pointInTime, coord, participant }, labelLanguages: string[] }`.
    Wikidata values: `entityPrefix` `http://www.wikidata.org/entity/`, `directPropPrefix` `http://www.wikidata.org/prop/direct/`, `itemUrl` → `https://www.wikidata.org/wiki/<id>`, `classExhibition` `Q464980`, `country` `Q39`, props P31, P279, P276, P17, P131, P580, P582, P585, P625, P710.
  - `js/queries.js`:
    - `buildQueries(profile) -> { exhibitions: string, exhibitionLabels: string, venues: string }`
    - `runQuery(profile, sparql, fetchFn = fetch) -> Promise<object>` — POST `application/x-www-form-urlencoded` body `query=…`, header `Accept: application/sparql-results+json`; throws `Error` with status text when `!res.ok`.
    - `fetchAll(profile, fetchFn = fetch) -> Promise<{ exhibitions, exhibitionLabels, venues }>` — raw SPARQL JSON per query, run in parallel.

Query result variables (later tasks rely on these names):
- `exhibitions`: `?ex ?venue ?start ?end ?pit`. Scope: instance of (subclass of)* exhibition AND (`P276/P17 = country` UNION `P17 = country` UNION `P131/P17 = country`). `?venue` is OPTIONAL and must itself have `P17 = country`. `?start`, `?end`, `?pit` OPTIONAL.
- `exhibitionLabels`: `?ex ?label` (all languages; language comes from `xml:lang`). Same scope.
- `venues`: `?venue ?coord ?label`, for Swiss venues of in-scope exhibitions; `?coord`, `?label` OPTIONAL.

- [ ] **Step 1: Create `package.json`** with `{"name": "glamhack2026-exhibitions", "private": true, "type": "module", "scripts": {"test": "node --test tests/", "snapshot": "node scripts/fetch-snapshot.mjs"}}`.
- [ ] **Step 2: Write failing tests** in `tests/queries.test.js`:
  - `buildQueries` returns the three keys; each string contains `PREFIX wd: <http://www.wikidata.org/entity/>` and `PREFIX wdt: <http://www.wikidata.org/prop/direct/>`, `wd:Q464980`, `wd:Q39`; none contains `wikibase:label`.
  - `buildQueries` with a copy of the profile whose `country` is `Q999` contains `wd:Q999` and not `wd:Q39` (proves IDs come from the profile).
  - `runQuery` with a fake `fetchFn` returning `{ ok: true, json: async () => ({ results: { bindings: [] } }) }` resolves to that object and was called with method `POST` and the profile endpoint.
  - `runQuery` with a fake returning `{ ok: false, status: 500, statusText: "Server Error" }` rejects with a message containing `500`.
- [ ] **Step 3: Run** `npm test` — expected FAIL (modules missing).
- [ ] **Step 4: Implement** `js/config.js` and `js/queries.js` per Interfaces. Factor the scope pattern into one helper so the three queries share it.
- [ ] **Step 5: Run** `npm test` — expected PASS.
- [ ] **Step 6: Live smoke check:** `node -e "import('./js/queries.js').then(async q=>{const c=await import('./js/config.js');const r=await q.fetchAll(c.activeProfile);console.log(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.results.bindings.length])))})"` — expected three non-zero counts; distinct `?ex` in `exhibitions` ≈ 2126 (2090 with a Swiss venue + 36 without).
- [ ] **Step 7: Commit** `feat: add config profile and SPARQL query builder`.

### Task 2: Snapshot script and bundled data

**Files:**
- Create: `scripts/fetch-snapshot.mjs`, `data/snapshot.json` (generated)

**Interfaces:**
- Consumes: `fetchAll`, `activeProfile`.
- Produces: `data/snapshot.json` = `{ fetchedAt: ISO string, endpoint: string, profile: string, responses: { exhibitions, exhibitionLabels, venues } }`.

- [ ] **Step 1: Implement** `scripts/fetch-snapshot.mjs`: call `fetchAll(activeProfile)`, write the object above as compact `JSON.stringify` (no indentation) to `data/snapshot.json`, print row counts per query. Exit code 1 on error without overwriting the existing file.
- [ ] **Step 2: Run** `npm run snapshot` — expected: three row counts printed, `data/snapshot.json` exists, `node -e "const s=require('fs').readFileSync('data/snapshot.json','utf8');const j=JSON.parse(s);console.log(j.fetchedAt,Object.keys(j.responses))"` prints a timestamp and the three keys. (Use `--input-type=commonjs` or an `import` variant if `require` is unavailable.)
- [ ] **Step 3: Commit** `feat: add snapshot script and initial Wikidata snapshot`.

### Task 3: Normalisation

**Files:**
- Create: `js/normalize.js`, `tests/normalize.test.js`, `tests/fixtures/mini.json`

**Interfaces:**
- Consumes: raw responses shape from Task 1, `Profile`.
- Produces:
  - `normalize(responses, profile) -> Model`
  - `Model = { exhibitions: Exhibition[], venues: Venue[], gaps: Gaps, yearRange: [minYear, maxYear] }`
  - `Exhibition = { id, title, titleLang, start: "YYYY-MM-DD"|null, end: "YYYY-MM-DD"|null, startYear: number|null, endYear: number|null, venueIds: string[] }`
  - `Venue = { id, name, nameLang, lat: number|null, lon: number|null, exhibitionIds: string[] }`
  - `Gaps = { total, noDate, noEnglishLabel, noVenue, venuesNoCoord, exhibitionsOffMap }` — `exhibitionsOffMap` = exhibitions with no venue that has coordinates (includes `noVenue`).
  - helpers: `pickLabel(labels: {value, lang}[], languages) -> {value, lang}|null`, `parsePoint(wkt) -> {lat, lon}|null`, `localId(uri, profile) -> string`.
  - `yearRange`: min of all `startYear`, max of all `endYear ?? startYear`; `[currentYear, currentYear]` when nothing is dated.

Rules (from spec): earliest P580 = start, latest P582 = end; if no P580 use P585 for both; if neither P580 nor P585 but P582 exists, use P582 as start and end. Year = integer before the first `-` (after an optional sign). Title falls back to the QID with `titleLang = null`. WKT is `Point(lon lat)`.

- [ ] **Step 1: Write fixture** `tests/fixtures/mini.json` (raw SPARQL JSON for the three queries) covering: `Q1` two starts (1999-05-01, 1998-03-01), end 1998-06-30, one venue `V1`, labels de+fr only; `Q2` only `pit` 2005-01-01, venues `V1` and `V2`, label en; `Q3` only end 2010-12-31; `Q4` no dates, no labels, no venue; venue `V1` with coord `Point(8.5 47.37)` and label de; `V2` no coord, no label.
- [ ] **Step 2: Write failing tests** asserting:
  - `Q1`: `start "1998-03-01"`, `startYear 1998`, `endYear 1998`, `titleLang "de"`.
  - `Q2`: `startYear 2005`, `endYear 2005`, `venueIds` = `["V1","V2"]`, `titleLang "en"`.
  - `Q3`: `startYear 2010`, `endYear 2010`.
  - `Q4`: `title "Q4"`, `titleLang null`, `venueIds []`, `startYear null`.
  - `V1`: `lat 47.37`, `lon 8.5`; `V2`: `lat null`, `name "V2"`.
  - gaps: `total 4`, `noDate 1`, `noEnglishLabel 3`, `noVenue 1`, `venuesNoCoord 1`, `exhibitionsOffMap 1` (Q4; Q2 is also at V1).
  - `yearRange` = `[1998, 2010]`.
  - `pickLabel([{value:"A",lang:"ja"}], ["en"])` → `{value:"A", lang:"ja"}`; `pickLabel([], ["en"])` → `null`.
  - `parsePoint("Point(8.5 47.37)")` → `{lat:47.37, lon:8.5}`; `parsePoint("garbage")` → `null`.
- [ ] **Step 3: Run** `npm test` — expected FAIL.
- [ ] **Step 4: Implement** `js/normalize.js`.
- [ ] **Step 5: Run** `npm test` — expected PASS.
- [ ] **Step 6: Real-data check:** a one-liner that loads `data/snapshot.json`, runs `normalize`, prints `gaps` and `yearRange` — expected `total` ≈ 2126, `noVenue` ≈ 36, `noEnglishLabel` ≈ 1700. Record the printed `yearRange`.
- [ ] **Step 7: Commit** `feat: normalise raw SPARQL responses into exhibitions, venues and gaps`.

### Task 4: Year-range filtering

**Files:**
- Create: `js/filter.js`, `tests/filter.test.js`

**Interfaces:**
- Consumes: `Model`, `Exhibition`.
- Produces:
  - `normalizeRange(a, b) -> [from, to]` (sorted).
  - `isInRange(ex, from, to) -> boolean` — overlap of `[startYear, endYear ?? startYear]` with `[from, to]`; `false` when `startYear` is null.
  - `venueCounts(model, from, to) -> Map<venueId, number>` — every venue present (0 allowed); multi-venue exhibitions count at each venue.
  - `venueListing(model, venueId, from, to) -> { inRange: Exhibition[], undated: Exhibition[] }` — `inRange` sorted by `start` ascending.
  - `countInRange(model, from, to) -> number` (distinct exhibitions).

- [ ] **Step 1: Write failing tests** (reuse `normalize` on `tests/fixtures/mini.json`):
  - `normalizeRange(2010, 1990)` → `[1990, 2010]`.
  - `isInRange(Q1, 1998, 1998)` true; `isInRange(Q1, 1999, 2000)` false (Q1's interval is 1998–1998: earliest start, latest end); `isInRange(Q4, 0, 3000)` false.
  - `venueCounts(model, 1990, 2020)` → `V1: 2`, `V2: 1`; `venueCounts(model, 2006, 2009)` → `V1: 0`, `V2: 0`.
  - `venueListing(model, "V1", 1990, 2020).inRange` ids → `["Q1","Q2"]`.
  - `countInRange(model, 1990, 2020)` → `3`.
- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement** `js/filter.js`.
- [ ] **Step 4: Run** `npm test` — expected PASS.
- [ ] **Step 5: Commit** `feat: add year-range filtering`.

### Task 5: Page, map, slider, side panel, gap bar

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: `activeProfile`, `normalize`, `filter.js` functions, `data/snapshot.json`.
- Produces (for Task 6): in `app.js`, `setData(model, meta)` where `meta = { fetchedAt, endpoint }` re-renders everything; module state `currentModel`.

Layout per spec sketch: map fills the left, side panel on the right (hidden until a venue is clicked, closable), bottom bar with the two-handle year slider (two native `<input type="range">` overlaid, plus the numeric from–to readout and "N exhibitions in range"), gap counts, snapshot date + endpoint, and the "Fetch latest data" button (inert until Task 6). Map initial view: Switzerland, center `[46.8, 8.2]`, zoom 8. Tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with the OSM attribution.

- [ ] **Step 1: Implement** the three files. Markers: `L.circleMarker` per venue with coordinates; radius `4 + 3*sqrt(count)`; grey and radius 4 when count is 0. Tooltip text = venue name (set as text, not HTML — use a DOM element). Slider `min/max` = `model.yearRange`; initial range = full range. On input: `normalizeRange`, update marker styles and the open panel. Panel: venue name linking to `profile.itemUrl(id)`, then `inRange` items as `start` + title + `[lang]` tag linking to the item, then a "Date unknown" section. All text via `textContent`.
- [ ] **Step 2: Serve and check:** `python3 -m http.server 8000` in the repo, open `http://localhost:8000/` with Playwright. Expected: markers over Switzerland; no console errors; moving the left handle to 2020 shrinks markers; clicking the Zürich-area marker opens the panel with linked titles carrying language tags; gap bar shows the Task 3 numbers.
- [ ] **Step 3: XSS check:** in the Playwright console, call `setData` with a model whose one exhibition title is `<img src=x onerror=alert(1)>`; open its venue; expected: the literal text is shown, no `<img>` element is created.
- [ ] **Step 4: Screenshot** to the scratchpad for the user, then commit `feat: add map page with year slider, venue panel and gap bar`.

### Task 6: "Fetch latest data" button

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `fetchAll`, `normalize`, `setData`.

- [ ] **Step 1: Implement** the click handler: disable the button and show "Fetching…"; `fetchAll(activeProfile)` → `normalize` → `setData(model, { fetchedAt: new Date().toISOString(), endpoint })`, label the source as "live"; on error keep the current model, show `Fetch failed: <message>` in the bar, re-enable the button. Abort after 60 s via `AbortController` passed through a wrapped `fetchFn`.
- [ ] **Step 2: Check success** with Playwright: click, expected the date updates and source reads "live", counts unchanged or close to snapshot.
- [ ] **Step 3: Check failure:** temporarily point `activeProfile.endpoint` at `https://qlever.dev/api/does-not-exist` from the console (or route-block it in Playwright); click; expected error text shown and markers unchanged.
- [ ] **Step 4: Commit** `feat: add live data refresh button`.

### Task 7: README and GitHub Pages

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write README** (English): what the site shows, data source and snapshot date, `npm run snapshot`, `npm test`, local serving, how to add a Wikibase profile in `js/config.js` (list the fields to change).
- [ ] **Step 2: Run** `npm test` — expected all PASS.
- [ ] **Step 3: Commit** `docs: add README`.
- [ ] **Step 4: Ask the user** before pushing the branch / merging to `main` and enabling GitHub Pages (outward-facing).

### Stretch (only after Task 7, each its own commit)

- Lines between Swiss venues of multi-venue exhibitions (toggle in the bar).
- Clicking a gap count lists the affected items in the side panel.
- P710 participants in the panel.
