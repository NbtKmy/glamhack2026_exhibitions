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

// Sequential on purpose: QLever answers parallel requests from one client
// with 429 Too Many Requests.
export async function fetchAll(profile, fetchFn = fetch) {
  const results = {};
  for (const [name, sparql] of Object.entries(buildQueries(profile))) {
    results[name] = await runQuery(profile, sparql, fetchFn);
  }
  return results;
}

// Wraps a fetch function so each request is aborted after `ms` milliseconds.
export function timeoutFetch(ms, fetchFn = fetch) {
  return async (url, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${ms / 1000} s`)), ms);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
