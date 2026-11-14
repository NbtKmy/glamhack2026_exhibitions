// Stores the hackathon Wikibase's exhibition items in data/wikibase-snapshot.json.
// Its SPARQL endpoint needs a password, so this reads the public MediaWiki API:
// the team's list endpoint gives the item IDs, wbgetentities gives full claims
// (the list omits P33 coordinates and P69 Wikidata links).
import { writeFile } from "node:fs/promises";
import { wikibaseSource } from "../js/config.js";
import { claimValues } from "../js/duplicates.js";

const LIST_URL = wikibaseSource.listUrl;
const API_URL = wikibaseSource.apiUrl;
const BATCH = 50; // wbgetentities limit for anonymous users
const OUT = new URL("../data/wikibase-snapshot.json", import.meta.url);

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchEntities(ids) {
  const entities = {};
  // Sequential on purpose: the wiki is a small hackathon server.
  for (let i = 0; i < ids.length; i += BATCH) {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: ids.slice(i, i + BATCH).join("|"),
      props: "labels|descriptions|aliases|claims",
      format: "json",
    });
    const data = await getJson(`${API_URL}?${params}`);
    if (data.error) throw new Error(`wbgetentities: ${data.error.info}`);
    Object.assign(entities, data.entities);
  }
  return entities;
}

try {
  const list = await getJson(LIST_URL);
  const ids = list.items.map((item) => item.id);
  const entities = await fetchEntities(ids);
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    source: API_URL,
    listGeneratedAt: list.generated,
    entities,
  };
  // Venue labels for the timeline, kept apart so `entities` stays exhibitions only.
  const locationProp = wikibaseSource.props.location;
  if (locationProp) {
    const locationIds = new Set(
      Object.values(entities).flatMap((e) => claimValues(e, locationProp).map((v) => v.id)),
    );
    snapshot.locations = await fetchEntities([...locationIds]);
  }
  await writeFile(OUT, JSON.stringify(snapshot));
  console.log(`${Object.keys(entities).length} entities`);
} catch (err) {
  console.error(`Snapshot failed, existing file kept: ${err.message}`);
  process.exit(1);
}
