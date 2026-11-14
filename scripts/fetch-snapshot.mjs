// Runs the same queries as the live "Fetch latest data" button and stores
// the raw SPARQL responses in data/snapshot.json.
import { writeFile } from "node:fs/promises";
import { activeProfile } from "../js/config.js";
import { fetchAll } from "../js/queries.js";

const OUT = new URL("../data/snapshot.json", import.meta.url);

try {
  const responses = await fetchAll(activeProfile);
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    endpoint: activeProfile.endpoint,
    profile: activeProfile.name,
    responses,
  };
  await writeFile(OUT, JSON.stringify(snapshot));
  for (const [name, res] of Object.entries(responses)) {
    console.log(`${name}: ${res.results.bindings.length} rows`);
  }
} catch (err) {
  console.error(`Snapshot failed, existing file kept: ${err.message}`);
  process.exit(1);
}
