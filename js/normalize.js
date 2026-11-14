// Turns the raw SPARQL responses (see queries.js) into the model the page uses.

export function localId(uri, profile) {
  return uri.startsWith(profile.entityPrefix) ? uri.slice(profile.entityPrefix.length) : uri;
}

export function pickLabel(labels, languages) {
  for (const lang of languages) {
    const hit = labels.find((l) => l.lang === lang);
    if (hit) return hit;
  }
  return labels[0] ?? null;
}

export function parsePoint(wkt) {
  const m = /^\s*point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)\s*$/i.exec(wkt ?? "");
  return m ? { lat: Number(m[2]), lon: Number(m[1]) } : null;
}

// "1998-03-01T00:00:00Z" -> { date: "1998-03-01", year: 1998, key: 19980301 }
function parseDate(value) {
  const m = /^(-?\d+)-(\d\d)-(\d\d)/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  return { date: m[0], year, key: year * 10000 + Number(m[2]) * 100 + Number(m[3]) };
}

function rows(response) {
  return response?.results?.bindings ?? [];
}

function earliest(dates) {
  return dates.reduce((a, b) => (a && a.key <= b.key ? a : b), null);
}

function latest(dates) {
  return dates.reduce((a, b) => (a && a.key >= b.key ? a : b), null);
}

export function normalize(responses, profile) {
  const id = (binding) => localId(binding.value, profile);

  const exMap = new Map();
  const getEx = (exId) => {
    if (!exMap.has(exId)) {
      exMap.set(exId, { venueIds: new Set(), starts: [], ends: [], pits: [], labels: [] });
    }
    return exMap.get(exId);
  };
  for (const r of rows(responses.exhibitions)) {
    const e = getEx(id(r.ex));
    if (r.venue) e.venueIds.add(id(r.venue));
    for (const [key, list] of [["start", e.starts], ["end", e.ends], ["pit", e.pits]]) {
      const d = r[key] && parseDate(r[key].value);
      if (d) list.push(d);
    }
  }
  for (const r of rows(responses.exhibitionLabels)) {
    getEx(id(r.ex)).labels.push({ value: r.label.value, lang: r.label["xml:lang"] ?? null });
  }

  const venueMap = new Map();
  const getVenue = (vId) => {
    if (!venueMap.has(vId)) venueMap.set(vId, { point: null, labels: [], exhibitionIds: [] });
    return venueMap.get(vId);
  };
  for (const r of rows(responses.venues)) {
    const v = getVenue(id(r.venue));
    if (r.coord && !v.point) v.point = parsePoint(r.coord.value);
    if (r.label) v.labels.push({ value: r.label.value, lang: r.label["xml:lang"] ?? null });
  }

  const exhibitions = [];
  for (const [exId, e] of exMap) {
    let start = earliest(e.starts);
    let end = latest(e.ends);
    if (!start) start = earliest(e.pits);
    if (!start) start = end;
    if (!end) end = latest(e.pits) ?? start;
    const label = pickLabel(e.labels, profile.labelLanguages);
    const venueIds = [...e.venueIds];
    for (const vId of venueIds) getVenue(vId).exhibitionIds.push(exId);
    exhibitions.push({
      id: exId,
      title: label ? label.value : exId,
      titleLang: label ? label.lang : null,
      start: start ? start.date : null,
      end: end ? end.date : null,
      startYear: start ? start.year : null,
      endYear: end ? end.year : null,
      venueIds,
      hasEnglishLabel: e.labels.some((l) => l.lang === "en"),
    });
  }

  const venues = [...venueMap].map(([vId, v]) => {
    const label = pickLabel(v.labels, profile.labelLanguages);
    return {
      id: vId,
      name: label ? label.value : vId,
      nameLang: label ? label.lang : null,
      lat: v.point ? v.point.lat : null,
      lon: v.point ? v.point.lon : null,
      exhibitionIds: v.exhibitionIds,
    };
  });

  const mapped = new Set(venues.filter((v) => v.lat !== null).map((v) => v.id));
  const gaps = {
    total: exhibitions.length,
    noDate: exhibitions.filter((e) => e.startYear === null).length,
    noEnglishLabel: exhibitions.filter((e) => !e.hasEnglishLabel).length,
    noVenue: exhibitions.filter((e) => e.venueIds.length === 0).length,
    venuesNoCoord: venues.length - mapped.size,
    exhibitionsOffMap: exhibitions.filter((e) => !e.venueIds.some((v) => mapped.has(v))).length,
  };

  const dated = exhibitions.filter((e) => e.startYear !== null);
  const thisYear = new Date().getUTCFullYear();
  const yearRange = dated.length
    ? [Math.min(...dated.map((e) => e.startYear)), Math.max(...dated.map((e) => e.endYear ?? e.startYear))]
    : [thisYear, thisYear];

  return { exhibitions, venues, gaps, yearRange };
}
