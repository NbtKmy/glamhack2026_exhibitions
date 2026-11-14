// Data for the timeline page: both sources in one exhibition shape,
// { id, source, title, titleLang, start, end, startYear, endYear, venues, url, wikidataId }
// where start and end are "YYYY", "YYYY-MM" or "YYYY-MM-DD" strings or null.
import { profiles } from "./config.js";
import { pickLabel } from "./normalize.js";
import { claimValues, parseTime } from "./duplicates.js";

const pad = (n) => String(n).padStart(2, "0");

function dateString(t) {
  if (!t) return null;
  return [String(t.year), t.month && pad(t.month), t.day && pad(t.day)].filter(Boolean).join("-");
}

const sortKey = (t) => t.year * 10000 + (t.month ?? 0) * 100 + (t.day ?? 0);

function firstTime(entity, property) {
  return claimValues(entity, property).map(parseTime).find(Boolean) ?? null;
}

function labelList(labels) {
  return Object.values(labels ?? {}).map((l) => ({ value: l.value, lang: l.language }));
}

function entityTitle(entity, source) {
  const label = pickLabel(labelList(entity.labels), profiles.wikidata.labelLanguages);
  if (label) return label;
  const title = claimValues(entity, source.props.title)[0];
  return title ? { value: title.text, lang: title.language } : { value: entity.id, lang: null };
}

function isExhibition(entity, source) {
  return claimValues(entity, source.props.instanceOf).some((v) => source.exhibitionClasses.includes(v.id));
}

// The country rule needs both IDs; until then every item counts.
function inSwitzerland(entity, source) {
  if (!source.props.country || !source.switzerland) return true;
  const countries = claimValues(entity, source.props.country).map((v) => v.id);
  return countries.length === 0 || countries.includes(source.switzerland);
}

function venueNames(entity, source, locations) {
  if (!source.props.location) return [];
  return claimValues(entity, source.props.location).map((v) => {
    const label = pickLabel(labelList(locations?.[v.id]?.labels), profiles.wikidata.labelLanguages);
    return label ? label.value : v.id;
  });
}

export function wikibaseExhibitions(snapshot, source) {
  if (!snapshot) return [];
  const result = [];
  for (const entity of Object.values(snapshot.entities ?? {})) {
    if (!isExhibition(entity, source) || !inSwitzerland(entity, source)) continue;
    let start = firstTime(entity, source.props.start);
    let end = firstTime(entity, source.props.end);
    start ??= end;
    end ??= start;
    if (start && sortKey(end) < sortKey(start)) [start, end] = [end, start];
    const title = entityTitle(entity, source);
    result.push({
      id: entity.id,
      source: "wikibase",
      title: title.value,
      titleLang: title.lang,
      start: dateString(start),
      end: dateString(end),
      startYear: start ? start.year : null,
      endYear: end ? end.year : null,
      venues: venueNames(entity, source, snapshot.locations),
      url: source.itemUrl(entity.id),
      wikidataId: claimValues(entity, source.props.wikidataItem)[0] ?? null,
    });
  }
  return result;
}

export function wikidataExhibitions(model, profile) {
  const venueName = new Map(model.venues.map((v) => [v.id, v.name]));
  return model.exhibitions.map((e) => ({
    id: e.id,
    source: "wikidata",
    title: e.title,
    titleLang: e.titleLang,
    start: e.start,
    end: e.end,
    startYear: e.startYear,
    endYear: e.endYear,
    venues: e.venueIds.map((id) => venueName.get(id) ?? id),
    url: profile.itemUrl(e.id),
    wikidataId: e.id,
  }));
}

// Wikidata wins: a Wikibase item linked to Wikidata is counted there or, when
// Wikidata does not place it in Switzerland, not at all.
export function mergeSources(wikidata, wikibase) {
  return [...wikidata, ...wikibase.filter((e) => !e.wikidataId)];
}

const byStartThenTitle = (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);

// Anyone can edit Wikidata: one wrong year must not stretch the axis to
// millions of years. Such exhibitions are counted as undated.
const MIN_YEAR = 1000;
const plausible = (year) => year !== null && year >= MIN_YEAR && year <= new Date().getUTCFullYear() + 10;

// Every year from the first start to the last end, empty years included.
// An exhibition is listed in each year it was running.
export function yearBuckets(exhibitions) {
  const undated = { wikidata: 0, wikibase: 0 };
  const dated = [];
  for (const e of exhibitions) {
    if (!plausible(e.startYear) || !plausible(e.endYear)) undated[e.source] += 1;
    else dated.push(e);
  }
  if (dated.length === 0) return { years: [], undated };
  const first = Math.min(...dated.map((e) => e.startYear));
  const last = Math.max(...dated.map((e) => e.endYear));
  const years = Array.from({ length: last - first + 1 }, (_, i) => ({ year: first + i, wikidata: [], wikibase: [] }));
  for (const e of [...dated].sort(byStartThenTitle)) {
    for (let y = e.startYear; y <= e.endYear; y++) years[y - first][e.source].push(e);
  }
  return { years, undated };
}
