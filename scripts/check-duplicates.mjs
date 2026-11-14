// Lists hackathon Wikibase exhibitions without a Wikidata link (P69) that may
// already exist, matching titles and dates in three steps, cheapest first:
//   1. all other Wikibase items, linked or not (offline)
//   2. the map's Wikidata snapshot, data/snapshot.json (offline)
//   3. Wikidata's search API, only for items still without a likely match
// Writes reports/duplicates.json and reports/duplicates.csv.
//
// --validate N hides the P69 link of N linked items instead and reports how
// often their known Wikidata item comes back as "likely". Writes no files.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { activeProfile, profiles, wikibaseSource } from "../js/config.js";
import { findMatches, fromSparql, fromWikibaseEntity, fromWikidataEntity } from "../js/duplicates.js";

const DATA = new URL("../data/", import.meta.url);
const REPORTS = new URL("../reports/", import.meta.url);
const WIKIDATA_API = profiles.wikidata.apiUrl;
const USER_AGENT = "glamhack2026-exhibitions duplicate check (https://github.com/NbtKmy/glamhack2026_exhibitions)";
const SEARCH_LIMIT = 7;
const MAX_SEARCHES = 6; // per item
const BATCH = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One request at a time, waiting when Wikidata reports replication lag.
async function wikidataApi(params, attempt = 0) {
  const url = `${WIKIDATA_API}?${new URLSearchParams({ ...params, format: "json", maxlag: "5" })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  const data = res.ok ? await res.json() : null;
  if ((res.status === 429 || data?.error?.code === "maxlag") && attempt < 3) {
    await sleep(1000 * Number(res.headers.get("retry-after") ?? 5));
    return wikidataApi(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikidata API HTTP ${res.status}`);
  if (data.error) throw new Error(`Wikidata API: ${data.error.info}`);
  return data;
}

function searchTerms(record) {
  const terms = new Map();
  for (const { value, lang } of record.titles) {
    const language = lang ?? "en";
    for (const term of [value, value.split(/\s*[:–—]\s*|\s+-\s+/)[0]]) {
      terms.set(`${language}\u0000${term}`, { term, language });
    }
  }
  return [...terms.values()].slice(0, MAX_SEARCHES);
}

async function searchWikidata(record, cache) {
  const ids = new Set();
  for (const { term, language } of searchTerms(record)) {
    const data = await wikidataApi({
      action: "wbsearchentities",
      search: term,
      language,
      uselang: language,
      type: "item",
      limit: String(SEARCH_LIMIT),
    });
    for (const hit of data.search ?? []) ids.add(hit.id);
  }
  const missing = [...ids].filter((id) => !cache.has(id));
  for (let i = 0; i < missing.length; i += BATCH) {
    const data = await wikidataApi({
      action: "wbgetentities",
      ids: missing.slice(i, i + BATCH).join("|"),
      props: "labels|aliases|descriptions|claims",
    });
    for (const entity of Object.values(data.entities ?? {})) {
      if (entity.id) cache.set(entity.id, fromWikidataEntity(entity));
    }
  }
  return [...ids].map((id) => cache.get(id)).filter(Boolean);
}

// A failed Wikidata request is recorded on its item; the rest still run.
async function check(targets, wikibase, swiss) {
  const cache = new Map();
  const results = [];
  for (const target of targets) {
    const matches = [
      ...findMatches(target, wikibase).map((m) => ({ ...m, via: "wikibase" })),
      ...findMatches(target, swiss).map((m) => ({ ...m, via: "wikidata snapshot" })),
    ];
    let error = null;
    if (!matches.some((m) => m.verdict === "likely")) {
      try {
        const found = await searchWikidata(target, cache);
        matches.push(...findMatches(target, found).map((m) => ({ ...m, via: "wikidata search" })));
      } catch (err) {
        error = err.message;
      }
    }
    results.push({ target, matches, error });
  }
  return results;
}

const fmt = (d) =>
  d ? [String(d.year), d.month && String(d.month).padStart(2, "0"), d.day && String(d.day).padStart(2, "0")].filter(Boolean).join("-") : "";

function csv(results) {
  const header = [
    "wikibase_id", "wikibase_title", "wikibase_start", "wikibase_end", "verdict", "title_match", "found_via",
    "match_id", "wikidata_id", "match_title", "match_description", "match_start", "match_end",
    "wikibase_url", "match_url", "error",
  ];
  const cell = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const rows = [];
  const url = (r) => (r.source === "wikidata" ? profiles.wikidata.itemUrl(r.id) : wikibaseSource.itemUrl(r.id));
  for (const { target, matches, error } of results) {
    const base = [target.id, target.titles[0]?.value ?? "", fmt(target.start), fmt(target.end)];
    const verdict = error ? "error" : "none";
    if (matches.length === 0) rows.push([...base, verdict, "", "", "", "", "", "", "", "", url(target), "", error ?? ""]);
    for (const m of matches) {
      const c = m.candidate;
      rows.push([
        ...base, m.verdict, m.title, m.via, c.id, c.wikidataId ?? "", c.titles[0]?.value ?? "", c.description ?? "",
        fmt(c.start), fmt(c.end), url(target), url(c), error ?? "",
      ]);
    }
  }
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

async function main() {
  const validateArg = process.argv.indexOf("--validate");
  const validate = validateArg === -1 ? 0 : Number(process.argv[validateArg + 1] ?? 30);

  const wikibase = JSON.parse(await readFile(new URL("wikibase-snapshot.json", DATA), "utf8"));
  const sparql = JSON.parse(await readFile(new URL("snapshot.json", DATA), "utf8"));
  const records = Object.values(wikibase.entities).map((e) => fromWikibaseEntity(e, wikibaseSource));
  const swiss = fromSparql(sparql.responses, activeProfile);

  if (validate > 0) {
    const pool = records.filter((r) => r.wikidataId && r.titles.length);
    const step = Math.max(1, Math.floor(pool.length / validate));
    const hidden = pool.filter((_, i) => i % step === 0).slice(0, validate);
    const hiddenIds = new Set(hidden.map((r) => r.id));
    const rest = records.filter((r) => !hiddenIds.has(r.id));
    const results = await check(hidden.map((r) => ({ ...r, wikidataId: null })), rest, swiss);
    let likely = 0;
    let found = 0;
    let first = 0;
    let others = 0;
    for (const { target, matches } of results) {
      const known = hidden.find((r) => r.id === target.id).wikidataId;
      const hit = matches.find((m) => m.candidate.wikidataId === known);
      const wrong = new Set(matches.map((m) => m.candidate.wikidataId).filter((id) => id !== known)).size;
      if (hit) found++;
      if (hit?.verdict === "likely") likely++;
      if (hit && matches[0].candidate.wikidataId === known) first++;
      others += wrong;
      if (hit?.verdict !== "likely" || wrong) {
        console.log(`${target.id} ${known} "${target.titles[0].value}": ${hit ? hit.verdict : "not found"}, ${wrong} other candidates`);
      }
    }
    console.log(
      `${found}/${results.length} known Wikidata items found (${likely} as likely, ${first} ranked first), ` +
        `${others} other candidates in total`,
    );
    return;
  }

  const targets = records.filter((r) => !r.wikidataId);
  const results = await check(targets, records, swiss);
  await mkdir(REPORTS, { recursive: true });
  await writeFile(
    new URL("duplicates.json", REPORTS),
    JSON.stringify({ checkedAt: new Date().toISOString(), wikibaseFetchedAt: wikibase.fetchedAt, results }, null, 1),
  );
  await writeFile(new URL("duplicates.csv", REPORTS), csv(results));
  const count = (v) => results.filter((r) => r.matches.some((m) => m.verdict === v)).length;
  console.log(
    `${targets.length} items without a Wikidata link: ${count("likely")} likely duplicates, ` +
      `${count("possible")} possible, ${count("different edition")} with a different edition`,
  );
  const failed = results.filter((r) => r.error).length;
  if (failed) console.warn(`${failed} items could not be searched on Wikidata; see the error column`);
}

main().catch((err) => {
  console.error(`Duplicate check failed: ${err.message}`);
  process.exit(1);
});
