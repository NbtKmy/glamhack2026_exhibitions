// Timeline page: stacked bars per year (Wikidata, hackathon Wikibase) and a
// panel listing the exhibitions running in the clicked year.
import { activeProfile, wikibaseSource } from "./config.js";
import { normalize } from "./normalize.js";
import { mergeSources, wikibaseExhibitions, wikidataExhibitions, yearBuckets } from "./timeline-data.js";
import { el, langTag } from "./dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BAR = 8;
const STEP = 10; // bar width plus gap
const PLOT_HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 24, left: 36 };

const $ = (id) => document.getElementById(id);

let buckets = null;
let selectedYear = null;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// A round tick step giving about four ticks: 1, 2, 5, 10, 20, 50, ...
function tickStep(max) {
  const raw = Math.max(1, max / 4);
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
}

const hoverText = (y) => `${y.year}: ${y.wikidata.length} Wikidata, ${y.wikibase.length} Wikibase`;

function drawChart({ years }) {
  const chart = $("chart");
  if (years.length === 0) {
    chart.replaceChildren(el("p", { className: "muted" }, "No dated exhibitions."));
    return;
  }
  const max = Math.max(...years.map((y) => y.wikidata.length + y.wikibase.length));
  const step = tickStep(max);
  const top = Math.ceil(max / step) * step;
  const scale = (n) => (n / top) * PLOT_HEIGHT;
  const width = MARGIN.left + years.length * STEP + MARGIN.right;
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;
  const baseline = MARGIN.top + PLOT_HEIGHT;
  const labelEvery = years.length > 300 ? 50 : 10;

  const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "group" });
  for (let n = 0; n <= top; n += step) {
    const y = baseline - scale(n);
    root.append(
      svg("line", { class: n === 0 ? "axis" : "gridline", x1: MARGIN.left - 4, x2: width - MARGIN.right, y1: y, y2: y }),
      svg("text", { x: MARGIN.left - 6, y: y + 3, "text-anchor": "end" }, n),
    );
  }

  years.forEach((y, i) => {
    const x = MARGIN.left + i * STEP;
    const wd = scale(y.wikidata.length);
    const wb = scale(y.wikibase.length);
    const group = svg(
      "g",
      { class: "year", tabindex: "0", role: "button", "aria-label": hoverText(y), "data-year": y.year },
      svg("title", {}, hoverText(y)),
      svg("rect", { class: "hit", x: x - 1, y: MARGIN.top, width: STEP, height: PLOT_HEIGHT }),
      wd ? svg("rect", { class: "wikidata", x, y: baseline - wd, width: BAR, height: wd }) : null,
      wb ? svg("rect", { class: "wikibase", x, y: baseline - wd - wb, width: BAR, height: wb }) : null,
    );
    group.addEventListener("click", () => openPanel(y.year));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPanel(y.year);
      }
    });
    root.append(group);
    if (y.year % labelEvery === 0) {
      root.append(svg("text", { x: x + BAR / 2, y: baseline + 14, "text-anchor": "middle" }, y.year));
    }
  });
  chart.replaceChildren(root);
  chart.scrollLeft = chart.scrollWidth; // most records are recent
}

function exhibitionItem(ex) {
  const when = ex.start ? (ex.end && ex.end !== ex.start ? `${ex.start} – ${ex.end}` : ex.start) : null;
  return el(
    "li",
    {},
    when ? el("time", {}, when) : null,
    el("a", { href: ex.url, target: "_blank", rel: "noopener noreferrer" }, ex.title),
    langTag(ex.titleLang),
    ex.venues.length ? el("span", { className: "source-tag" }, ex.venues.join(", ")) : null,
  );
}

function markSelected() {
  for (const node of $("chart").querySelectorAll(".year")) {
    node.classList.toggle("selected", Number(node.dataset.year) === selectedYear);
  }
}

function openPanel(year) {
  const entry = buckets.years.find((y) => y.year === year);
  if (!entry) return;
  selectedYear = year;
  markSelected();
  const body = $("panel-body");
  const total = entry.wikidata.length + entry.wikibase.length;
  body.replaceChildren(
    el("h2", {}, String(year)),
    el("p", { className: "muted" }, `${total} exhibitions running in ${year}`),
  );
  for (const [label, list] of [["Wikidata", entry.wikidata], ["Hackathon Wikibase", entry.wikibase]]) {
    if (list.length) body.append(el("h3", {}, `${label} (${list.length})`), el("ul", {}, ...list.map(exhibitionItem)));
  }
  $("panel").hidden = false;
  $("chart").querySelector(".year.selected")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function closePanel() {
  selectedYear = null;
  markSelected();
  $("panel").hidden = true;
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// The Wikibase snapshot is optional: it is not published until it holds real data.
async function loadWikibase() {
  try {
    return await loadJson("data/wikibase-snapshot.json");
  } catch {
    return null;
  }
}

$("panel-close").addEventListener("click", closePanel);

try {
  const [snapshot, wikibase] = await Promise.all([loadJson("data/snapshot.json"), loadWikibase()]);
  const wikidata = wikidataExhibitions(normalize(snapshot.responses, activeProfile), activeProfile);
  buckets = yearBuckets(mergeSources(wikidata, wikibaseExhibitions(wikibase, wikibaseSource)));
  drawChart(buckets);
  const { undated } = buckets;
  $("undated").textContent = wikibase
    ? `Without dates: ${undated.wikidata} Wikidata, ${undated.wikibase} Wikibase`
    : `Without dates: ${undated.wikidata} Wikidata`;
  if (!wikibase) $("wikibase-status").textContent = "Hackathon Wikibase data is not loaded yet.";
} catch (err) {
  $("load-status").className = "status error";
  $("load-status").textContent = `Could not load the bundled snapshot (${err.message}).`;
}
