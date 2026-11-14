// Builds the SPARQL queries from a profile and runs them. Shared by the
// browser (live refresh) and scripts/fetch-snapshot.mjs (bundled snapshot).

function prefixes(profile) {
  return [
    `PREFIX wd: <${profile.entityPrefix}>`,
    `PREFIX wdt: <${profile.directPropPrefix}>`,
    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
  ].join("\n");
}

// Exhibitions in the country: via a venue (P276), directly (P17),
// or via an administrative territory (P131).
function scope(profile) {
  const p = profile.props;
  return `?ex wdt:${p.instanceOf}/wdt:${p.subclassOf}* wd:${profile.classExhibition} .
    { ?ex wdt:${p.location}/wdt:${p.country} wd:${profile.country} }
    UNION { ?ex wdt:${p.country} wd:${profile.country} }
    UNION { ?ex wdt:${p.adminTerritory}/wdt:${p.country} wd:${profile.country} }`;
}

export function buildQueries(profile) {
  const p = profile.props;
  const head = prefixes(profile);
  const scopedEx = `{ SELECT DISTINCT ?ex WHERE { ${scope(profile)} } }`;
  return {
    exhibitions: `${head}
SELECT ?ex ?venue ?start ?end ?pit WHERE {
  ${scopedEx}
  OPTIONAL { ?ex wdt:${p.location} ?venue . ?venue wdt:${p.country} wd:${profile.country} }
  OPTIONAL { ?ex wdt:${p.start} ?start }
  OPTIONAL { ?ex wdt:${p.end} ?end }
  OPTIONAL { ?ex wdt:${p.pointInTime} ?pit }
}`,
    exhibitionLabels: `${head}
SELECT ?ex ?label WHERE {
  ${scopedEx}
  ?ex rdfs:label ?label .
}`,
    venues: `${head}
SELECT ?venue ?coord ?label WHERE {
  { SELECT DISTINCT ?venue WHERE {
    ${scope(profile)}
    ?ex wdt:${p.location} ?venue . ?venue wdt:${p.country} wd:${profile.country} } }
  OPTIONAL { ?venue wdt:${p.coord} ?coord }
  OPTIONAL { ?venue rdfs:label ?label }
}`,
  };
}

export async function runQuery(profile, sparql, fetchFn = fetch) {
  const res = await fetchFn(profile.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    },
    body: new URLSearchParams({ query: sparql }).toString(),
  });
  if (!res.ok) throw new Error(`SPARQL request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchAll(profile, fetchFn = fetch) {
  const queries = buildQueries(profile);
  const names = Object.keys(queries);
  const results = await Promise.all(names.map((n) => runQuery(profile, queries[n], fetchFn)));
  return Object.fromEntries(names.map((n, i) => [n, results[i]]));
}
