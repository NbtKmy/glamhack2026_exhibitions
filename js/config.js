// Data source profiles. Every endpoint-specific ID lives here so another
// Wikibase can be added as a new profile without touching the other modules.

export const profiles = {
  wikidata: {
    name: "wikidata",
    endpoint: "https://qlever.dev/api/wikidata",
    apiUrl: "https://www.wikidata.org/w/api.php",
    entityPrefix: "http://www.wikidata.org/entity/",
    directPropPrefix: "http://www.wikidata.org/prop/direct/",
    itemUrl: (id) => `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`,
    classExhibition: "Q464980",
    country: "Q39",
    props: {
      instanceOf: "P31",
      subclassOf: "P279",
      location: "P276",
      country: "P17",
      adminTerritory: "P131",
      start: "P580",
      end: "P582",
      pointInTime: "P585",
      coord: "P625",
      participant: "P710",
    },
    labelLanguages: ["en", "de", "fr", "it", "rm"],
  },
};

export const activeProfile = profiles.wikidata;

// The hackathon Wikibase. Its SPARQL endpoint needs a password, so scripts read
// the public MediaWiki API instead. The schema is not final: keep its IDs here.
const wikibaseBase = "https://emma.zeedonk-symmetric.ts.net";

export const wikibaseSource = {
  name: "glamhack-wikibase",
  apiUrl: `${wikibaseBase}/w/api.php`,
  listUrl: `${wikibaseBase}/tools/exhibitions/api/list.php`,
  itemUrl: (id) => `${wikibaseBase}/wiki/Item:${encodeURIComponent(id)}`,
  exhibitionClasses: ["Q20", "Q21", "Q1100"], // exhibition, art exhibition, temporary exhibition
  switzerland: null, // not in the schema yet
  props: {
    instanceOf: "P2",
    title: "P4",
    start: "P23",
    end: "P24",
    wikidataItem: "P69",
    country: null, // planned, like Wikidata's P17
    location: null, // planned, like Wikidata's P276
  },
};
