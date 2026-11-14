// Year-range filtering over the normalised model.

export function normalizeRange(a, b) {
  return a <= b ? [a, b] : [b, a];
}

export function isInRange(ex, from, to) {
  if (ex.startYear === null) return false;
  return ex.startYear <= to && (ex.endYear ?? ex.startYear) >= from;
}

export function venueCounts(model, from, to) {
  const counts = new Map(model.venues.map((v) => [v.id, 0]));
  for (const ex of model.exhibitions) {
    if (!isInRange(ex, from, to)) continue;
    for (const vId of ex.venueIds) counts.set(vId, (counts.get(vId) ?? 0) + 1);
  }
  return counts;
}

export function venueListing(model, venueId, from, to) {
  const venue = model.venues.find((v) => v.id === venueId);
  const ids = new Set(venue ? venue.exhibitionIds : []);
  const items = model.exhibitions.filter((e) => ids.has(e.id));
  return {
    inRange: items.filter((e) => isInRange(e, from, to)).sort((a, b) => a.start.localeCompare(b.start)),
    undated: items.filter((e) => e.startYear === null),
  };
}

export function countInRange(model, from, to) {
  return model.exhibitions.filter((e) => isInRange(e, from, to)).length;
}
