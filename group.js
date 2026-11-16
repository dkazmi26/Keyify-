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

// The data has no product titles, so the key code comes from the SKU:
// "K-TOY44D" -> "TOY44D". Returns "" if the SKU has no code in it.
function keyCodeFromSku(sku) {
  const m = String(sku || "").toUpperCase().match(/[A-Z]{2,4}\d{2}[A-Z]{0,2}/);
  return m ? m[0] : "";
}

// Spec section 1.
//   1. keyType + fcc                      (when fcc is present)
//   2. keyType + chip + key code          (when there is no fcc but there is a code)
//   3. fallback: the supplier SKU itself  (same SKU = same product; never merges anything
//      the spec would keep apart)
//   4. last resort: the row on its own
// partNumber is NOT part of the key.
function groupKeyOf(row, index) {
  const type = norm(row.keyType);
  const fcc = norm(row.fcc);
  if (fcc) return "F|" + type + "|" + fcc;
  const code = keyCodeFromSku(row.sku);
  if (code) return "C|" + type + "|" + normChip(row.chip) + "|" + code;
  if (norm(row.sku)) return "S|" + norm(row.sku);
  return "R|" + index;
}

function addUnique(list, seen, value) {
  const v = String(value === undefined || value === null ? "" : value).trim();
  const n = norm(v);
  if (!n || seen.has(n)) return;
  seen.add(n);
  list.push(v);
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
    // "parts" is what the card shows under Part #: OEM part numbers only.
    const parts = [], seen = new Set();
    rs.forEach(r => addUnique(parts, seen, r.partNumber));

    // "searchTerms" is what the search box can match: part numbers, then
    // supplier SKUs, then FCC IDs. These are searchable but not shown under Part #.
    const searchTerms = parts.slice(), seenSearch = new Set(parts.map(norm));
    rs.forEach(r => addUnique(searchTerms, seenSearch, r.sku));
    rs.forEach(r => addUnique(searchTerms, seenSearch, r.fcc));

    const supplies = [], seenSupply = new Set();
    rs.forEach(r => addUnique(supplies, seenSupply, r.supply));

    const notes = [], seenNotes = new Set();
    rs.forEach(r => addUnique(notes, seenNotes, r.notes));

    // make + model -> list of [from, to]
    const vehicles = new Map();
    rs.forEach(r => {
      const vk = r.make + "\u0000" + r.model;
      if (!vehicles.has(vk)) vehicles.set(vk, { make: r.make, model: r.model, ranges: [] });
      vehicles.get(vk).ranges.push([r.yearFrom, r.yearTo]);
    });

    const programmings = new Set(rs.map(r => r.programming || "Unconfirmed"));

    return {
      key: g.key,
      rows: rs,
      keyType: rs[0].keyType,
      fcc: mostCommon(rs.map(r => r.fcc)),
      chip: mostCommon(rs.map(r => r.chip)),
      parts,
      partsNorm: searchTerms.map(norm),
      supplies,
      notes,
      vehicles: [...vehicles.values()],
      programming: programmings.size === 1 ? [...programmings][0] : "Unconfirmed",
      verified: rs.every(r => r.verified === true)
    };
  });
}

// Spec section 5: smart key, flip / remote head, keyless remote, transponder, emergency / metal.
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

// Groups where any part number, SKU or FCC ID contains what was typed.
// Needs at least 4 letters or digits so "ABC" does not match half the catalogue.
function searchParts(groups, query) {
  const q = norm(query);
  if (q.length < 4) return [];
  return groups
    .filter(g => g.partsNorm.some(p => p.includes(q)))
    .sort((a, b) => typeRank(a.keyType) - typeRank(b.keyType) ||
      String(a.keyType).localeCompare(String(b.keyType)));
}
