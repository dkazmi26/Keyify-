const makeSel = document.getElementById("make");
const modelSel = document.getElementById("model");
const yearSel = document.getElementById("year");
const results = document.getElementById("results");

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
      <h2>${year} ${k.make} ${k.model}</h2>
      <dl>
        <dt>Key type</dt><dd>${k.keyType}</dd>
        <dt>Chip</dt><dd>${k.chip}</dd>
        <dt>FCC ID</dt><dd>${k.fcc}</dd>
        <dt>Part number</dt><dd>${k.partNumber}</dd>
        <dt>Programming</dt>
        <dd><span class="tag ${k.programming === "DIY" ? "ok" : "no"}">${k.programming}</span></dd>
        <dt>Notes</dt><dd>${k.notes}</dd>
        <dt>Status</dt><dd>${k.verified ? "Verified" : "Not verified"}</dd>
      </dl>
    </div>
  `).join("");
}
