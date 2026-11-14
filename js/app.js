// Page wiring: Leaflet map, year slider, venue panel and gap bar.
// All text from the data is inserted with textContent, never as HTML.
import { activeProfile } from "./config.js";
import { normalize } from "./normalize.js";
import { normalizeRange, venueCounts, venueListing, countInRange } from "./filter.js";
import { fetchAll, timeoutFetch } from "./queries.js";

const COLOR_ACTIVE = "#c2410c";
const COLOR_IDLE = "#9ca3af";
const LIVE_TIMEOUT_MS = 60_000;

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function langTag(lang) {
  return lang ? el("span", { className: "lang" }, lang) : el("span", { className: "lang none" }, "no label");
}

const map = L.map("map").setView([46.8, 8.2], 8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let currentModel = null;
let range = [0, 0];
let openVenueId = null;
const markers = new Map(); // venueId -> { marker, tip }

function radiusFor(count) {
  return count > 0 ? 4 + 2 * Math.sqrt(count) : 4;
}

function buildMarkers(model) {
  for (const { marker } of markers.values()) marker.remove();
  markers.clear();
  for (const venue of model.venues) {
    if (venue.lat === null) continue;
    const tip = el("span");
    const marker = L.circleMarker([venue.lat, venue.lon], { weight: 1, fillOpacity: 0.6 })
      .bindTooltip(tip)
      .on("click", () => openPanel(venue.id))
      .addTo(map);
    markers.set(venue.id, { marker, tip, venue });
  }
}

function update() {
  const [from, to] = range;
  $("year-from").textContent = from;
  $("year-to").textContent = to;
  $("in-range").textContent = `${countInRange(currentModel, from, to)} exhibitions in range`;
  const counts = venueCounts(currentModel, from, to);
  for (const { marker, tip, venue } of markers.values()) {
    const count = counts.get(venue.id) ?? 0;
    const color = count > 0 ? COLOR_ACTIVE : COLOR_IDLE;
    marker.setRadius(radiusFor(count));
    marker.setStyle({ color, fillColor: color, fillOpacity: count > 0 ? 0.45 : 0.4 });
    if (count > 0) marker.bringToFront();
    tip.textContent = `${venue.name} — ${count}`;
  }
  if (openVenueId) renderPanel(openVenueId);
}

function exhibitionItem(ex) {
  const when = ex.start ? (ex.end && ex.end !== ex.start ? `${ex.start} – ${ex.end}` : ex.start) : null;
  return el(
    "li",
    {},
    when ? el("time", {}, when) : null,
    el("a", { href: activeProfile.itemUrl(ex.id), target: "_blank", rel: "noopener noreferrer" }, ex.title),
    langTag(ex.titleLang),
  );
}

function renderPanel(venueId) {
  const venue = currentModel.venues.find((v) => v.id === venueId);
  if (!venue) return closePanel();
  const [from, to] = range;
  const { inRange, undated } = venueListing(currentModel, venueId, from, to);
  const outside = venue.exhibitionIds.length - inRange.length - undated.length;
  const body = $("panel-body");
  body.replaceChildren(
    el("h2", {}, el("a", { href: activeProfile.itemUrl(venue.id), target: "_blank", rel: "noopener noreferrer" }, venue.name)),
    el("p", { className: "muted" }, `${venue.exhibitionIds.length} exhibitions in total, ${outside} outside ${from}–${to}`),
    el("h3", {}, `${from}–${to} (${inRange.length})`),
    el("ul", {}, ...inRange.map(exhibitionItem)),
  );
  if (undated.length) {
    body.append(el("h3", {}, `Date unknown (${undated.length})`), el("ul", {}, ...undated.map(exhibitionItem)));
  }
}

function openPanel(venueId) {
  openVenueId = venueId;
  $("panel").hidden = false;
  renderPanel(venueId);
  map.invalidateSize();
}

function closePanel() {
  openVenueId = null;
  $("panel").hidden = true;
  map.invalidateSize();
}

function renderGaps(gaps) {
  const items = [
    [gaps.total, "exhibitions in total"],
    [gaps.noDate, "without dates"],
    [gaps.noEnglishLabel, "without an English label"],
    [gaps.noVenue, "without a Swiss venue"],
    [gaps.venuesNoCoord, "venues without coordinates"],
    [gaps.exhibitionsOffMap, "only at venues without coordinates"],
  ];
  $("gaps").replaceChildren(...items.map(([n, text]) => el("li", {}, el("strong", {}, n), ` ${text}`)));
}

function renderMeta(meta) {
  const host = meta.endpoint.replace(/^https?:\/\//, "");
  const date = meta.fetchedAt.slice(0, 16).replace("T", " ");
  $("source-meta").textContent = `${meta.source === "live" ? "Live data" : "Snapshot"} ${date} UTC · ${host}`;
}

// On a refresh the selected years are kept, clamped to the new data.
function setupSlider(model, keepRange) {
  const [min, max] = model.yearRange;
  for (const input of [$("slider-from"), $("slider-to")]) {
    input.min = min;
    input.max = max;
    input.step = 1;
  }
  const clamp = (y) => Math.min(max, Math.max(min, y));
  range = keepRange ? normalizeRange(clamp(range[0]), clamp(range[1])) : [min, max];
  $("slider-from").value = range[0];
  $("slider-to").value = range[1];
}

function onSlide() {
  if (!currentModel) return;
  range = normalizeRange(Number($("slider-from").value), Number($("slider-to").value));
  update();
}

export function setData(model, meta) {
  const isRefresh = currentModel !== null;
  currentModel = model;
  buildMarkers(model);
  setupSlider(model, isRefresh);
  renderGaps(model.gaps);
  renderMeta(meta);
  update();
}

$("slider-from").addEventListener("input", onSlide);
$("slider-to").addEventListener("input", onSlide);
$("panel-close").addEventListener("click", closePanel);

async function fetchLive() {
  const button = $("fetch-live");
  const status = $("fetch-status");
  button.disabled = true;
  status.className = "status";
  status.textContent = "Fetching…";
  try {
    const responses = await fetchAll(activeProfile, timeoutFetch(LIVE_TIMEOUT_MS), {
      onRetry: (ms) => {
        status.textContent = `Endpoint busy (429), retrying in ${ms / 1000} s…`;
      },
    });
    const model = normalize(responses, activeProfile);
    if (model.exhibitions.length === 0) throw new Error("Endpoint returned no exhibitions");
    setData(model, { fetchedAt: new Date().toISOString(), endpoint: activeProfile.endpoint, source: "live" });
    status.textContent = "";
  } catch (err) {
    status.className = "status error";
    status.textContent = `Fetch failed: ${err.message}`;
  } finally {
    button.disabled = false;
  }
}

$("fetch-live").addEventListener("click", fetchLive);

window.exhibitionMap = { setData, normalize, profile: activeProfile };

try {
  const res = await fetch("data/snapshot.json");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const snapshot = await res.json();
  setData(normalize(snapshot.responses, activeProfile), {
    fetchedAt: snapshot.fetchedAt,
    endpoint: snapshot.endpoint,
    source: "snapshot",
  });
} catch (err) {
  $("fetch-status").className = "status error";
  $("fetch-status").textContent = `Could not load the bundled snapshot (${err.message}). Try "Fetch latest data".`;
}
