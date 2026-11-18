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

// Rows with no FCC ID only group with rows of the same make. The one exception is
// the makes that already shared such groups before Ford was added (Toyota with
// Scion and Pontiac; Honda with Acura). Those stay together so existing cards do
// not change. Every other make, Subaru included, is on its own.
const KEY_FAMILIES = { Scion: "Toyota", Pontiac: "Toyota", Acura: "Honda" };
function keyFamily(make) {
  return KEY_FAMILIES[make] || make;
}

// Family of one row. Same as keyFamily(row.make) with one narrow exception: the single
// Subaru BRZ transponder row that came in the Toyota data (no FCC ID) stays with the
// Toyota family, so its card and the Toyota and Scion cards that list it do not change.
// No row in the Subaru data matches this.
function rowFamily(row) {
  if (row.make === "Subaru" && row.model === "BRZ" && !norm(row.fcc) && norm(row.keyType) === "TRANSPONDERKEY") return "Toyota";
  return keyFamily(row.make);
}

// One group per physical key.
//   1. keyType + FCC ID + board code    (when the FCC ID is present; the board
//      is part of the key only when it is filled in, so a blank board groups
//      by keyType + FCC ID alone). This is the same across makes.
//   2. no FCC ID: make + keyType + chip + part number + board, so rows that
//      would show exactly the same card fold together, never across makes
//   3. nothing to go on: the row stays on its own
// A blank value is never matched on its own.
function groupKeyOf(row, index) {
  const type = norm(row.keyType);
  const fcc = norm(row.fcc);
  const board = norm(row.board);
  if (fcc) return "F|" + type + "|" + fcc + "|" + board;
  const chip = normChip(row.chip);
  const pn = norm(row.partNumber);
  if (chip || pn || board) return "N|" + norm(rowFamily(row)) + "|" + type + "|" + chip + "|" + pn + "|" + board;
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
      board: mostCommon(rs.map(r => r.board)),
      chip: mostCommon(rs.map(r => r.chip)),
      frequency: mostCommon(rs.map(r => r.frequency)),
      parts,
      // The only things the search box can match: FCC ID, board code and part numbers.
      searchTerms: uniqueValues([fcc].concat(parts)).map(norm),
      boardNorm: norm(mostCommon(rs.map(r => r.board))),
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

// Button names for this exact vehicle and year, worked out the same way as
// partsForVehicle: only listings that fit the searched vehicle. If the listings
// disagree, the most common non-blank value wins (the first one seen breaks a tie).
// Returns "" when no fitting listing has buttons.
// Buttons are display-only: they are never used for grouping or search.
function buttonsForVehicle(g, make, model, year) {
  return mostCommon(g.rows
    .filter(r => r.make === make && r.model === model && year >= r.yearFrom && year <= r.yearTo)
    .map(r => r.buttons));
}

// Chip shown on a card: the most common chip among the group's rows from the searched
// vehicle's own make family (Toyota with Scion, Subaru and Pontiac; Honda with Acura;
// every other make on its own). A key that several brands share can list a different
// chip for each brand, and one brand's rows must not outvote another's. If that make
// has no chip at all, the whole group's chip is used, as before.
function chipForMake(g, make) {
  const fam = keyFamily(make);
  const own = mostCommon(g.rows.filter(r => keyFamily(r.make) === fam).map(r => r.chip));
  return own || g.chip;
}

// Chip for this exact vehicle and year, worked out like Part # (partsForVehicle): from
// the listings that fit the searched make, model and year.
//   - they all name the same chip       -> that chip
//   - they name different chips         -> no chip (the data disagrees, so show nothing)
//   - none of them names a chip         -> the make family's chip, as before
// "H Chip", "H-Chip", "H CHIP" and "Chip H" count as the same chip. "Super Chip" is an
// aftermarket cloner chip, not the car's chip, so it is ignored. A family name and a
// specific chip in that family agree ("4D" and "4D67" -> "4D67"). When the answer is the
// same chip as the make family's chip, the family's spelling is shown, so cards that
// already showed the right chip do not change.
function chipKey(v) {
  const n = norm(v).replace(/^CHIP/, "").replace(/CHIP$/, "");
  return n === "SUPER" ? "" : n;
}
function chipForVehicle(g, make, model, year) {
  const named = g.rows
    .filter(r => r.make === make && r.model === model && year >= r.yearFrom && year <= r.yearTo)
    .map(r => String(r.chip || "").trim())
    .filter(c => chipKey(c));
  const famChip = chipForMake(g, make);
  if (!named.length) return famChip;
  // Most specific chip named; every other named chip must be it or a family name of it.
  const best = named.reduce((a, b) => (chipKey(b).length > chipKey(a).length ? b : a));
  const bk = chipKey(best);
  if (!named.every(c => bk.startsWith(chipKey(c)))) return "";
  return chipKey(famChip) === bk ? famChip : best;
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

  // If this search already has a card with a board code for the same key type
  // and FCC ID, a "no board" card for that pair looks like a duplicate, so hide it.
  // (Only within this search: a vehicle whose only listing has no board keeps it.)
  const withBoard = new Set(hits
    .filter(x => x.g.boardNorm && norm(x.g.fcc))
    .map(x => norm(x.g.keyType) + "|" + norm(x.g.fcc)));
  return hits.filter(x => x.g.boardNorm || !norm(x.g.fcc) ||
    !withBoard.has(norm(x.g.keyType) + "|" + norm(x.g.fcc)));
}

// Groups where the FCC ID, the board code or any part number matches what was typed.
// Needs at least 4 letters or digits so "ABC" does not match half the catalogue.
// A board code must match exactly. Exactly 4 characters (like "0020") must match a
// whole FCC ID or part number too, so a board code does not drag in every part
// number that happens to contain those digits. Longer text matches anywhere inside.
function searchParts(groups, query) {
  const q = norm(query);
  if (q.length < 4) return [];
  return groups
    .filter(g => g.boardNorm === q ||
      g.searchTerms.some(t => (q.length === 4 ? t === q : t.includes(q))))
    .sort((a, b) => typeRank(a.keyType) - typeRank(b.keyType) ||
      String(a.keyType).localeCompare(String(b.keyType)));
}
