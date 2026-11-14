const makeSel = document.getElementById("make");
const modelSel = document.getElementById("model");
const yearSel = document.getElementById("year");
const results = document.getElementById("results");

const PROGRAMMING_OPTIONS = ["DIY", "Locksmith", "Dealer only", "Unconfirmed"];

// Warns in the browser console (F12) if a keys.js entry looks wrong.
// It never blocks the page, it just helps you catch typos early.
function checkData() {
  KEYS.forEach((k, i) => {
    const name = `KEYS[${i}] (${k.make} ${k.model})`;
    ["make", "model", "yearFrom", "yearTo"].forEach(f => {
      if (!k[f]) console.warn(`${name}: missing ${f}`);
    });
    if (k.yearFrom > k.yearTo) console.warn(`${name}: yearFrom is after yearTo`);
    if (!PROGRAMMING_OPTIONS.includes(k.programming)) {
      console.warn(`${name}: programming "${k.programming}" is not one of ${PROGRAMMING_OPTIONS.join(", ")}`);
    }
    if (k.make !== String(k.make).trim() || k.model !== String(k.model).trim()) {
      console.warn(`${name}: extra spaces in make or model`);
    }
  });
}
checkData();

// Makes text safe to put into the page, and shows "Unknown" for blank fields.
function esc(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "Unknown";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unique(list) {
  return [...new Set(list)].sort();
}

function fill(select, values, placeholder) {
  select.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.appendChild(first);
  values.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

fill(makeSel, unique(KEYS.map(k => k.make)), "Select make");

makeSel.addEventListener("change", () => {
  const models = unique(KEYS.filter(k => k.make === makeSel.value).map(k => k.model));
  fill(modelSel, models, "Select model");
  modelSel.disabled = !makeSel.value;
  fill(yearSel, [], "Select year");
  yearSel.disabled = true;
  results.innerHTML = "";
});

modelSel.addEventListener("change", () => {
  const rows = KEYS.filter(k => k.make === makeSel.value && k.model === modelSel.value);
  const years = new Set();
  rows.forEach(r => { for (let y = r.yearFrom; y <= r.yearTo; y++) years.add(y); });
  fill(yearSel, [...years].sort((a, b) => b - a), "Select year");
  yearSel.disabled = !modelSel.value;
  results.innerHTML = "";
});

yearSel.addEventListener("change", showResults);

// Colour of the programming tag: green = you can do it yourself,
// orange = needs a locksmith or dealer, grey = nobody has confirmed it yet.
function programmingClass(p) {
  if (p === "DIY") return "ok";
  if (p === "Locksmith" || p === "Dealer only") return "no";
  return "unknown";
}

function showResults() {
  const year = Number(yearSel.value);
  if (!year) { results.innerHTML = ""; return; }
  const matches = KEYS.filter(k =>
    k.make === makeSel.value && k.model === modelSel.value &&
    year >= k.yearFrom && year <= k.yearTo
  );
  if (!matches.length) {
    results.innerHTML = '<p class="empty">No match found.</p>';
    return;
  }
  results.innerHTML = matches.map(k => `
    <div class="card">
      <h2>${year} ${esc(k.make)} ${esc(k.model)}</h2>
      <dl>
        <dt>Key type</dt><dd>${esc(k.keyType)}</dd>
        <dt>Chip</dt><dd>${esc(k.chip)}</dd>
        <dt>FCC ID</dt><dd>${esc(k.fcc)}</dd>
        <dt>Part number</dt><dd>${esc(k.partNumber)}</dd>
        <dt>Programming</dt>
        <dd><span class="tag ${programmingClass(k.programming)}">${esc(k.programming)}</span></dd>
        <dt>Notes</dt><dd>${esc(k.notes)}</dd>
        <dt>Status</dt>
        <dd><span class="tag ${k.verified ? "ok" : "unknown"}">${k.verified ? "Verified" : "Not verified"}</span></dd>
      </dl>
    </div>
  `).join("");
}
