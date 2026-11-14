# glamhack2026_exhibitions

A map of exhibitions held in Switzerland, as recorded in Wikidata — built at
GLAMhack 2026.

Each circle is a venue; its size is the number of exhibitions there within the
selected years. Click a venue to list its exhibitions (with the language of the
title shown, since most exhibitions have no English label) and follow the
links to Wikidata. The bar at the bottom shows what is missing in the data:
exhibitions without dates, without an English label, without a Swiss venue,
and venues without coordinates.

## Data

Exhibitions are items that are an instance of (a subclass of) *exhibition*
(Q464980) and are located in Switzerland (Q39) through their venue (P276),
their country (P17) or their administrative territory (P131). Dates come from
start time (P580), end time (P582) or point in time (P585).

The site loads a bundled snapshot (`data/snapshot.json`, the raw SPARQL
responses) so it works even when the endpoint is slow or down. "Fetch latest
data" runs the same queries live against
[QLever](https://qlever.dev/api/wikidata). QLever's public endpoint
rate-limits heavy use; if a live fetch fails, the current data stays on screen.

## Development

No dependencies; Node 24 is only used for tests and the snapshot script.

```sh
npm test               # unit tests (node:test)
npm run snapshot       # refresh data/snapshot.json from the endpoint
python3 -m http.server 8000   # then open http://localhost:8000/
```

Code layout:

- `js/config.js` — endpoint and all Wikidata IDs (one profile per data source)
- `js/queries.js` — builds and runs the SPARQL queries (browser and Node)
- `js/normalize.js` — raw SPARQL JSON → exhibitions, venues and gap counts
- `js/filter.js` — year-range filtering
- `js/app.js` — Leaflet map, slider, side panel, gap bar

## Using another Wikibase

Add a profile to `js/config.js` next to `wikidata` and point `activeProfile` at
it. Fields to set: `endpoint`, `entityPrefix`, `directPropPrefix`, `itemUrl`,
`classExhibition`, `country`, the property IDs in `props`, and
`labelLanguages`. Then run `npm run snapshot`.

## Licence of the data

Wikidata content is available under CC0. Map tiles © OpenStreetMap
contributors.
