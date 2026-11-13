# Swiss Exhibitions Map — Design

Date: 2026-11-14 (GLAMhack 2026, final day is 2026-11-15)

## Intent

A static website that visualises exhibitions held in Switzerland, as recorded in
Wikidata, on a map and a timeline.

Primary purpose: a **hackathon demo of the current state of the data**,
gaps included. The audience should see both what exists and what is missing
(no dates, no coordinates, no English label, no venue).

Fallback purpose: if the challenge team makes no other progress, the same site
is submitted as a **tool for finding exhibitions** by place and period.

The hackathon itself is entering its data into a separate Wikibase instance,
not Wikidata. Its details (endpoint, IDs) are not decided yet. This site must
be ready to point at that Wikibase later with configuration changes only.

## Goals

- Map of Switzerland (Leaflet) with one marker per venue; marker size reflects
  the number of exhibitions at that venue within the selected period.
- Two-handle year range slider; changing it updates marker counts live.
- Clicking a venue opens a side panel listing its exhibitions (year + title),
  each linking to its Wikidata item.
- Multilingual title fallback: exhibitions are mostly labelled in de/fr/it,
  rarely in en.
- A visible "data gaps" bar summarising what is missing.
- Works offline from a bundled snapshot; a "Fetch latest data" button re-runs
  the same queries live against the endpoint.
- Endpoint, entity prefixes, class/country QIDs and property IDs live in one
  config file, so a Wikibase can be added later.
- Deployable on GitHub Pages (repo: `NbtKmy/glamhack2026_exhibitions`).

## Non-goals (for now)

- Participants (P710: artists, curators). Wanted later; ~550 exhibitions have it.
- Lines between venues of travelling exhibitions (stretch goal, see below).
- Actually connecting to the hackathon Wikibase (only the config hook).
- UI translation / language switcher. UI text is English.
- Editing data or writing back to Wikidata.
- Build tooling, frameworks, npm dependencies.

## Anti-goals

- A demo that breaks because the SPARQL endpoint is slow or down.
  The bundled snapshot is the default data source for this reason.
- Hiding incomplete records. Gaps are part of the message.
- Showing only exhibitions that have English labels.
- Two copies of the data-processing logic (one for the snapshot, one for live).

## Data findings (QLever, 2026-11-14)

Endpoint: `https://qlever.dev/api/wikidata`. Returns SPARQL JSON, CORS `*`,
~0.2 s per query. QLever does not support `wikibase:label` or `wikibase:mwapi`,
and all PREFIXes must be declared explicitly. Labels come from `rdfs:label`.

Selection: `?ex wdt:P31/wdt:P279* wd:Q464980` (exhibition) with venue
`?ex wdt:P276 ?venue . ?venue wdt:P17 wd:Q39` (Switzerland).

- 2090 exhibitions, 137 venues.
- Start date P580 on 2031; end date P582 on 2026.
- 12 have only point in time P585 and no P580.
- Date precision of P580: day 2082, month 6, year 12.
- English label on only 399 (~19%).
- 34 exhibitions have more than one Swiss venue (travelling exhibitions).
- 9 venues have no coordinates (P625).
- 36 further exhibitions are in Switzerland via P17 or P131 but have no Swiss
  P276 venue, so they cannot be placed on the map.

## Approaches considered

- **A. Pre-fetched JSON + static page.** Robust at demo time, but data is frozen.
- **B. Live query on page load.** Always fresh, but the demo depends on the
  endpoint and all processing runs on every load.
- **C. A + "Fetch latest data" button (chosen).** The snapshot is the default;
  the button runs the same queries live.

C's usual cost is duplicated processing logic (a script for the snapshot and
JS for the live path). This is avoided by storing the **raw SPARQL responses**
as the snapshot and doing all normalisation in browser JS. The snapshot script
only runs the queries and saves the responses; it imports the same query
builder module the browser uses, so the queries exist in one place.

## Design

### Files

```
index.html
css/style.css
js/config.js       endpoint + IDs (Wikidata profile; Wikibase profile added later)
js/queries.js      builds SPARQL strings from config
js/normalize.js    raw SPARQL JSON -> { exhibitions, venues, gaps }
js/app.js          map, slider, side panel, gap bar, fetch button
data/snapshot.json { fetchedAt, endpoint, responses: { <queryName>: <raw SPARQL JSON> } }
scripts/fetch-snapshot.mjs   Node (v24, no deps) — imports config.js + queries.js, writes data/snapshot.json
```

Plain ES modules, no bundler. Leaflet is loaded from a CDN with an exact
version. Local development uses any static file server.

### Config

`config.js` exports an active profile with:

- `endpoint`
- entity / direct-property / rdfs prefixes (Wikidata: `http://www.wikidata.org/entity/`,
  `http://www.wikidata.org/prop/direct/`)
- `itemUrl(qid)` for links (Wikidata: `https://www.wikidata.org/wiki/<QID>`)
- `classExhibition` (Q464980), `country` (Q39)
- properties: `instanceOf` P31, `subclassOf` P279, `location` P276,
  `country` P17, `adminTerritory` P131, `start` P580, `end` P582,
  `pointInTime` P585, `coord` P625, `participant` P710 (unused for now)
- `labelLanguages`: `["en", "de", "fr", "it", "rm"]`

Only the Wikidata profile is written now.

### Queries

Split into a few queries to avoid row explosion (labels × venues × dates):

1. **exhibitions**: exhibition, Swiss venue (optional), start, end, point in
   time. The scope is the union of exhibitions with a Swiss P276 venue and
   exhibitions with P17 = Q39 or P131/P17 = Q39, so the 36 "no venue" cases
   are counted as a gap instead of being invisible.
2. **exhibitionLabels**: all `rdfs:label` values with language for those
   exhibitions.
3. **venues**: venue, coordinates, all labels.

The exact query shape is left to the builder, as long as the snapshot script
and the live button use the same builder functions.

### Normalisation (`normalize.js`)

- Group rows per exhibition; collect its set of venues.
- Dates: use the earliest P580 as start, the latest P582 as end. If there is no
  P580, use P585 as both. Reduce to years for filtering; keep the original
  date string for display.
- Title: first available label in `labelLanguages`, then any other language,
  then the QID. Record the chosen language and show it as a small tag, e.g. `[de]`.
- Coordinates: parse the WKT `Point(lon lat)` literal.
- Gaps: count exhibitions with no date, exhibitions with no English label,
  exhibitions with no Swiss venue, venues with no coordinates (and the
  exhibitions only at such venues).

### Interaction

- **Period filter:** an exhibition is visible if its interval
  `[startYear, endYear ?? startYear]` overlaps the selected range.
  The slider spans the earliest year in the data to the current year.
- **Markers:** circle markers, radius scaled by the visible count. A venue whose
  exhibitions are all outside the range or undated is drawn as a small grey
  marker rather than hidden, so it can still be clicked.
- **Multi-venue exhibitions:** counted once at each venue. Only Swiss venues
  are shown; foreign stops of a travelling exhibition are ignored.
- **Side panel:** venue name, link to the venue item, then exhibitions in the
  range sorted by start date (date + title + language tag, linking to the item),
  then a separate "Date unknown" section.
- **Gap bar:** fixed at the bottom; shows the gap counts, the snapshot date and
  endpoint, and the "Fetch latest data" button. During a live fetch, show a
  loading state. On failure, keep the current data and show the error.
  On success, replace the data and show the new fetch time.

### Stretch goals (only if time remains)

- Lines between the venues of the 34 multi-venue exhibitions.
- Clicking a gap count lists the affected items.
- P710 participants in the side panel.

## Left to the builder

- Exact SPARQL text and how the three queries are joined.
- Slider implementation (two native range inputs or a small library).
- Whether to clamp the slider's lower bound if a few outlier years stretch it.
- Marker radius scale and colours, panel styling.
- Basemap tiles (must allow use without an API key).
