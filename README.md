# glamhack2026_exhibitions

A map of exhibitions held in Switzerland, as recorded in Wikidata — built at
GLAMhack 2026.

Each circle is a venue; its size is the number of exhibitions there within the
selected years. Click a venue to list its exhibitions (with the language of the
title shown, since most exhibitions have no English label) and follow the
links to Wikidata. The bar at the bottom shows what is missing in the data:
exhibitions without dates, without an English label, without a Swiss venue,
and venues without coordinates.

## Timeline

`timeline.html` shows how many exhibitions are recorded for each year, counted
in every year they were running (an exhibition from 1998 to 2001 counts in all
four years). Click a bar to list that year's exhibitions. Exhibitions without
dates, or with implausible years (before 1000 or more than ten years ahead),
are only counted below the chart.

Wikidata exhibitions are shown in orange, exhibitions from the hackathon
Wikibase in blue. Where an exhibition is in Wikidata, the Wikidata record is
used: a Wikibase item with a Wikidata link (P69) is never counted from the
Wikibase side. If its Wikidata item is not in the Swiss snapshot, it is left
out entirely. The Wikibase snapshot (`data/wikibase-snapshot.json`) is
optional; without it the page shows Wikidata only. Once the Wikibase has
country and location properties, set their IDs and the Swiss item in
`wikibaseSource` in `js/config.js`.

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
npm run snapshot:wikibase   # refresh data/wikibase-snapshot.json
npm run duplicates     # refresh that snapshot, then check it against Wikidata
python3 -m http.server 8000   # then open http://localhost:8000/
```

Code layout:

- `js/config.js` — endpoint and all Wikidata IDs (one profile per data source)
- `js/queries.js` — builds and runs the SPARQL queries (browser and Node)
- `js/normalize.js` — raw SPARQL JSON → exhibitions, venues and gap counts
- `js/filter.js` — year-range filtering
- `js/duplicates.js` — title and date matching for the duplicate check
- `js/app.js` — Leaflet map, slider, side panel, gap bar

## Using another Wikibase

Add a profile to `js/config.js` next to `wikidata` and point `activeProfile` at
it. Fields to set: `endpoint`, `entityPrefix`, `directPropPrefix`, `itemUrl`,
`classExhibition`, `country`, the property IDs in `props`, and
`labelLanguages`. Then run `npm run snapshot`.

The page sets a Content Security Policy in `index.html` (GitHub Pages cannot
send headers). Add the new SPARQL endpoint's origin to `connect-src` there,
or the live fetch will be blocked. Leaflet is loaded from cdnjs with
Subresource Integrity hashes.

Note: dev servers that inject an inline live-reload script (e.g. VS Code
Live Server) are blocked by the policy; the page still works, only
auto-reload does not.

## Duplicate check for the hackathon Wikibase

The hackathon Wikibase was set up by Birk Weiberg
([birk/wikibase-exhibitions](https://github.com/birk/wikibase-exhibitions)),
a fork of Wikibase Suite made at GLAMhack 2026 for the challenge
"Exhibitions - Past and Present" by Museum Rietberg. It adds a stricter
exhibition schema based on WikiProject Exhibitions and an alternative
interface for browsing and editing exhibitions.

The hackathon Wikibase's SPARQL endpoint needs a password, so
`npm run snapshot:wikibase` reads its public MediaWiki API instead and stores
the exhibition items in `data/wikibase-snapshot.json`. Its property IDs live
in `wikibaseSource` in `js/config.js`, since the schema is not final.

`npm run duplicates` refreshes that snapshot, takes the items without a
Wikidata link (P69) and looks for the same exhibition, cheapest first: among
all other Wikibase items (so two new entries for the same show find each
other), in the map's Wikidata snapshot, then through Wikidata's search API.
Titles (labels, aliases and P4, any language) match exactly or on the main
title before a subtitle; dates are compared at the coarser precision.

- **likely**: same title, same start (or end) date
- **possible**: same title, one side has no date
- **different edition**: same title, other date (annual shows, biennials)

A date match without a title match is never reported. Search hits can be
books or people with the same name; the description column helps to dismiss
them. If a Wikidata request fails, that item gets an `error` row and the rest
of the check still runs. Results go to
`reports/duplicates.csv` and `reports/duplicates.json`.
`node scripts/check-duplicates.mjs --validate 30` hides the P69 of 30 linked
items and reports how often the matcher finds their known Wikidata item.

## Licence of the data

Wikidata content is available under CC0. Map tiles © OpenStreetMap
contributors.
