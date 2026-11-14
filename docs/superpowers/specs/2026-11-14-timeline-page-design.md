# Exhibition Timeline Page — Design

Date: 2026-11-14 (GLAMhack 2026, final day is 2026-11-15)

## Intent

A second page next to the map that shows **how much exhibition data has been
entered, by the years the exhibitions ran**. It is part of the same demo of the
state of the data: the audience should see which periods are well covered and
which are thin, and how much the hackathon Wikibase adds on top of Wikidata.

## Goals

- New page `timeline.html`, linked from the map page header and back.
- Stacked bar chart, one bar per year: Wikidata exhibitions in one colour,
  hackathon Wikibase exhibitions in another.
- An exhibition counts in **every year it was running**: 1998–2001 adds one to
  each of 1998, 1999, 2000 and 2001.
- Exhibitions without any date are not in the bars; a line under the chart says
  "N exhibitions without dates" per source.
- A visible note: *"Where an exhibition is in Wikidata, the Wikidata record is
  used."*
- Clicking a bar opens a side panel (same look as the map's venue panel) listing
  the exhibitions running in that year, Wikidata first, then Wikibase. Each row:
  title (with language tag as on the map), dates, venue name(s) where known, and
  a link to the item.
- Works from bundled snapshots only.

## Non-goals

- Counting by data entry date (edit history). Not wanted.
- Live fetch on this page. The map page keeps its "Fetch latest data" button.
- Linking the timeline to the map's year slider.

## Anti-goals

- Counting the same exhibition twice (once from each source).
- Showing the Wikibase test entries on the public site as if they were real data.

## Data and deduplication

- Wikidata: `data/snapshot.json` through the existing `normalize()`; its date
  fallback (start/end/point in time, inverted ranges swapped) is reused as is.
- Wikibase: `data/wikibase-snapshot.json` through `fromWikibaseEntity()` from
  `js/duplicates.js`. Only items whose P2 (instance of) is the exhibition class
  are counted (class ID kept in `wikibaseSource` config).
- **Wikidata wins:** a Wikibase item with a P69 (Wikidata item) link is not
  counted from the Wikibase side at all. If the linked item is in the Swiss
  Wikidata snapshot, it is already counted there; if it is not, Wikidata does not
  place it in Switzerland, so it is left out.
- **Country and location:** the Wikibase schema will get country and location
  properties (as Wikidata's P17 and P276). Their IDs go into `wikibaseSource.props`
  as `country` / `location`, `null` until known. When a Wikibase item has a
  country and it is not Switzerland, it is left out; when it has none, it is
  counted. Location values are shown as venue names in the panel when present.
- If `data/wikibase-snapshot.json` is missing (404), the page shows Wikidata only
  and says the Wikibase data is not loaded yet.

## Approaches considered

- **A. Separate page with a hand-drawn SVG chart (chosen).** No new dependency,
  no CSP change, matches the map's "textContent only" rule. Costs writing the
  axis and hover text ourselves, which is small.
- B. Timeline inside the map page's bottom bar, linked to the slider. Rejected:
  the bar is too narrow for centuries of bars, and Wikibase items without places
  cannot appear on the map, which makes the panel inconsistent.
- C. Separate page with Chart.js from cdnjs. Rejected: a dependency for one chart,
  and the stacked colours and click handling still need configuration.

## Structure

- `js/timeline-data.js` — pure functions, tested with `node --test`:
  - Wikibase records → the same shape as Wikidata exhibitions
    (`id, source, title, start, end, startYear, endYear, venues, url`).
  - Merge with deduplication as above.
  - Year buckets: `Map<year, { wikidata: [...], wikibase: [...] }>` plus the
    no-date counts per source.
- `js/timeline.js` — page wiring: load snapshots, draw the SVG, panel.
- `timeline.html` — same CSP as `index.html`, minus the tile and Leaflet sources.
- `css/style.css` — chart styles added; panel styles shared.

## Calls left to the builder

- Year axis: from the earliest to the latest year with data, every year a bar,
  in a horizontally scrolling container; tick labels every 10 or 50 years
  depending on the span. Empty years stay as gaps (they are the point).
- Colours: Wikidata keeps the map's orange (`#c2410c`); Wikibase a contrasting
  blue. Both must stay readable in the existing light layout.
- Hover text on each bar: "1998: 34 Wikidata, 5 Wikibase".
- Keyboard: bars are focusable and Enter opens the panel.
- UI language: English, like the map page.

## Open (decided later, not blocking)

- When to commit `data/wikibase-snapshot.json`: only once it holds real team
  data. Until then the deployed page shows Wikidata only.
