// Groups supplier rows into one entry per physical key.
// Rules come from key-grouping-spec.md. No page code in here, only data logic.

// Uppercase and drop everything except letters and digits, so
// "89070-06790", "89070 06790" and "8907006790" all compare equal.
function norm(v) {
  return String(v === undefined || v === null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "H Chip", "H-Chip" and "H CHIP" are the same chip.
function normChip(v) {
  return norm(v).replace(/CHIP$/, "");
}

// One group per physical key.
//   1. keyType + FCC ID                 (when the FCC ID is present)
//   2. no FCC ID: keyType + chip + part number, so rows that would show
//      exactly the same card fold together
//   3. nothing to go on: the row stays on its own
// A blank value is never matched on its own.
function groupKeyOf(row, index) {
  const type = norm(row.keyType);
  const fcc = norm(row.fcc);
  if (fcc) return "F|" + type + "|" + fcc;
  const chip = normChip(row.chip);
  const pn = norm(row.partNumber);
  if (chip || pn) return "N|" + type + "|" + chip + "|" + pn;
  return "R|" + index;
}

function uniqueValues(values) {
  const seen = new Set(), out = [];
  values.forEach(v => {
    const s = String(v === undefined || v === null ? "" : v).trim();
    const n = norm(s);
    if (n && !seen.has(n)) { seen.add(n); out.push(s); }
  });
  return out;
}

function mostCommon(values) {
  const counts = new Map();
  values.filter(v => String(v || "").trim()).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  let best = "", n = 0;
  counts.forEach((c, v) => { if (c > n) { best = v; n = c; } });
  return best;
}

// Joins overlapping or back-to-back year ranges: 2014-2016 + 2015-2017 -> 2014-2017.
function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  sorted.forEach(r => {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  });
  return out;
}

function formatRanges(ranges) {
  return mergeRanges(ranges).map(r => (r[0] === r[1] ? String(r[0]) : r[0] + "-" + r[1])).join(", ");
}

function buildGroups(rows) {
  const map = new Map();
  rows.forEach((row, i) => {
    const key = groupKeyOf(row, i);
    if (!map.has(key)) map.set(key, { key, rows: [] });
    map.get(key).rows.push(row);
  });

  return [...map.values()].map(g => {
    const rs = g.rows;
    const parts = uniqueValues(rs.map(r => r.partNumber));
    const fcc = mostCommon(rs.map(r => r.fcc));

    // make + model -> list of [from, to]
    const vehicles = new Map();
    rs.forEach(r => {
      const vk = r.make + "\u0000" + r.model;
      if (!vehicles.has(vk)) vehicles.set(vk, { make: r.make, model: r.model, ranges: [] });
      vehicles.get(vk).ranges.push([r.yearFrom, r.yearTo]);
    });

    return {
      key: g.key,
      rows: rs,
      keyType: rs[0].keyType,
      fcc,
      chip: mostCommon(rs.map(r => r.chip)),
      parts,
      // The only things the search box can match: FCC ID and part numbers.
      searchTerms: uniqueValues([fcc].concat(parts)).map(norm),
      vehicles: [...vehicles.values()]
    };
  });
}

// Part numbers from the listings that fit this exact vehicle and year.
function partsForVehicle(g, make, model, year) {
  return uniqueValues(g.rows
    .filter(r => r.make === make && r.model === model && year >= r.yearFrom && year <= r.yearTo)
    .map(r => r.partNumber));
}

// Smart key, flip / remote head, keyless remote, transponder, emergency / metal.
function typeRank(keyType) {
  const t = String(keyType || "").toLowerCase();
  if (t.includes("smart")) return 0;
  if (t.includes("flip") || t.includes("remote head")) return 1;
  if (t.includes("keyless") || t.includes("remote")) return 2;
  if (t.includes("transponder")) return 3;
  if (t.includes("emergency") || t.includes("metal")) return 4;
  return 5;
}

// Groups that fit this vehicle and year, best first.
// "Exact year match" = the supplier lists a single-year row for exactly this year.
function searchVehicle(groups, make, model, year) {
  const hits = [];
  groups.forEach(g => {
    const matching = g.rows.filter(r =>
      r.make === make && r.model === model && year >= r.yearFrom && year <= r.yearTo);
    if (!matching.length) return;
    const exact = matching.some(r => r.yearFrom === year && r.yearTo === year);
    const span = Math.min(...matching.map(r => r.yearTo - r.yearFrom));
    hits.push({ g, exact, span, matchingRows: matching.length });
  });
  hits.sort((a, b) =>
    (b.exact - a.exact) ||
    (typeRank(a.g.keyType) - typeRank(b.g.keyType)) ||
    (a.span - b.span) ||
    String(a.g.keyType).localeCompare(String(b.g.keyType)));
  return hits;
}

// Groups where the FCC ID or any part number contains what was typed.
// Needs at least 4 letters or digits so "ABC" does not match half the catalogue.
function searchParts(groups, query) {
  const q = norm(query);
  if (q.length < 4) return [];
  return groups
    .filter(g => g.searchTerms.some(t => t.includes(q)))
    .sort((a, b) => typeRank(a.keyType) - typeRank(b.keyType) ||
      String(a.keyType).localeCompare(String(b.keyType)));
}
