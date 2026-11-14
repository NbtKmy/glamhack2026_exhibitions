// Finds exhibitions that may already exist elsewhere, by title and date.
// Every source is turned into the same record shape:
// { source, id, wikidataId, titles: [{ value, lang }], description, start, end }
// where start and end are parseTime() results or null.
import { localId, normalize } from "./normalize.js";

// Wikidata's own properties, used for entities fetched from its API.
const WIKIDATA_PROPS = { title: "P1476", start: "P580", end: "P582", pointInTime: "P585" };
const MIN_MAIN_TITLE = 6; // shorter main titles ("Art", "Salon") match too much

export function normTitle(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// The part before a subtitle: "Giacometti: The Late Works" -> "giacometti".
function mainTitle(value) {
  const [main] = value.split(/\s*[:–—]\s*|\s+-\s+/);
  const norm = normTitle(main);
  return norm.length >= MIN_MAIN_TITLE ? norm : null;
}

// Wikibase time value -> { year, month, day, precision }, or null below year
// precision. Zero months and days ("+1998-00-00") lower the precision.
export function parseTime(value) {
  const m = /^([+-]?\d+)-(\d\d)-(\d\d)/.exec(value?.time ?? "");
  if (!m || value.precision < 9) return null;
  const year = Number(m[1]);
  const month = value.precision >= 10 && Number(m[2]) > 0 ? Number(m[2]) : null;
  const day = value.precision >= 11 && month && Number(m[3]) > 0 ? Number(m[3]) : null;
  return { year, month, day, precision: day ? 11 : month ? 10 : 9 };
}

function yearOnly(year) {
  return year === null ? null : { year, month: null, day: null, precision: 9 };
}

function sameDate(a, b) {
  const precision = Math.min(a.precision, b.precision);
  if (a.year !== b.year) return false;
  if (precision >= 10 && a.month !== b.month) return false;
  if (precision >= 11 && a.day !== b.day) return false;
  return true;
}

// Starts are compared when both have one, otherwise ends.
export function compareDates(a, b) {
  for (const key of ["start", "end"]) {
    if (a[key] && b[key]) return sameDate(a[key], b[key]) ? "same" : "conflict";
  }
  return "unknown";
}

export function titleMatch(a, b) {
  const full = (r) => new Set(r.titles.map((t) => normTitle(t.value)).filter(Boolean));
  const keys = (r) => new Set([...full(r), ...r.titles.map((t) => mainTitle(t.value)).filter(Boolean)]);
  const bFull = full(b);
  if ([...full(a)].some((k) => bFull.has(k))) return "exact";
  const bKeys = keys(b);
  return [...keys(a)].some((k) => bKeys.has(k)) ? "main" : null;
}

export function claimValues(entity, property) {
  return (entity.claims?.[property] ?? [])
    .filter((s) => s.rank !== "deprecated" && s.mainsnak?.snaktype === "value")
    .map((s) => s.mainsnak.datavalue.value);
}

function firstTime(entity, ...properties) {
  for (const p of properties) {
    const t = claimValues(entity, p).map(parseTime).find(Boolean);
    if (t) return t;
  }
  return null;
}

function entityTitles(entity, titleProperty) {
  const titles = [
    ...Object.values(entity.labels ?? {}).map((l) => ({ value: l.value, lang: l.language })),
    ...Object.values(entity.aliases ?? {}).flat().map((l) => ({ value: l.value, lang: l.language })),
    ...claimValues(entity, titleProperty).map((v) => ({ value: v.text, lang: v.language })),
  ];
  const seen = new Set();
  return titles.filter((t) => {
    const key = `${t.lang}\u0000${t.value}`;
    return seen.has(key) ? false : seen.add(key);
  });
}

function description(entity) {
  const all = entity.descriptions ?? {};
  return (all.en ?? Object.values(all)[0])?.value ?? null;
}

export function fromWikibaseEntity(entity, source) {
  const { props } = source;
  return {
    source: source.name,
    id: entity.id,
    wikidataId: claimValues(entity, props.wikidataItem)[0] ?? null,
    titles: entityTitles(entity, props.title),
    description: description(entity),
    start: firstTime(entity, props.start),
    end: firstTime(entity, props.end),
  };
}

export function fromWikidataEntity(entity) {
  const p = WIKIDATA_PROPS;
  return {
    source: "wikidata",
    id: entity.id,
    wikidataId: entity.id,
    titles: entityTitles(entity, p.title),
    description: description(entity),
    start: firstTime(entity, p.start, p.pointInTime),
    end: firstTime(entity, p.end, p.pointInTime),
  };
}

// Records from the map's SPARQL snapshot. Its dates carry no precision, so
// only the year is trusted (a year-precision date reads as 1 January).
export function fromSparql(responses, profile) {
  const titles = new Map();
  for (const r of responses.exhibitionLabels?.results?.bindings ?? []) {
    const id = localId(r.ex.value, profile);
    if (!titles.has(id)) titles.set(id, []);
    titles.get(id).push({ value: r.label.value, lang: r.label["xml:lang"] ?? null });
  }
  return normalize(responses, profile).exhibitions.map((e) => ({
    source: "wikidata",
    id: e.id,
    wikidataId: e.id,
    titles: titles.get(e.id) ?? [],
    description: null,
    start: yearOnly(e.startYear),
    end: yearOnly(e.endYear),
  }));
}

const VERDICTS = { same: "likely", unknown: "possible", conflict: "different edition" };
const RANK = { likely: 0, possible: 1, "different edition": 2 };

// Candidates sharing a title with the target, best first. A date match alone
// is never reported: annual shows share dates with unrelated exhibitions.
export function findMatches(target, candidates) {
  const matches = [];
  for (const candidate of candidates) {
    if (candidate.source === target.source && candidate.id === target.id) continue;
    const title = titleMatch(target, candidate);
    if (!title) continue;
    const dates = compareDates(target, candidate);
    matches.push({ candidate, title, dates, verdict: VERDICTS[dates] });
  }
  return matches.sort(
    (a, b) => RANK[a.verdict] - RANK[b.verdict] || (a.title === "exact" ? 0 : 1) - (b.title === "exact" ? 0 : 1),
  );
}
