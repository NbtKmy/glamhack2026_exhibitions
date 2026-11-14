// Data source profiles. Every endpoint-specific ID lives here so another
// Wikibase can be added as a new profile without touching the other modules.

export const profiles = {
  wikidata: {
    name: "wikidata",
    endpoint: "https://qlever.dev/api/wikidata",
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
