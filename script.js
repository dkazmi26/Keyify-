const makeSel = document.getElementById("make");
const modelSel = document.getElementById("model");
const yearSel = document.getElementById("year");
const partInput = document.getElementById("partq");
const results = document.getElementById("results");

const PROGRAMMING_OPTIONS = ["DIY", "Locksmith", "Dealer only", "Unconfirmed"];
const CARDS_SHOWN_FIRST = 5;

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

// Makes text safe to put into the page.
function h(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Same, but shows "Unknown" for blank fields.
function esc(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "Unknown";
  return h(value);
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

// Built once. Every card on the page comes from one of these groups.
const GROUPS = buildGroups(KEYS);

fill(makeSel, unique(KEYS.map(k => k.make)), "Select make");

makeSel.addEventListener("change", () => {
  const models = unique(KEYS.filter(k => k.make === makeSel.value).map(k => k.model));
  fill(modelSel, models, "Select model");
  modelSel.disabled = !makeSel.value;
  fill(yearSel, [], "Select year");
  yearSel.disabled = true;
  partInput.value = "";
  results.innerHTML = "";
});

modelSel.addEventListener("change", () => {
  const rows = KEYS.filter(k => k.make === makeSel.value && k.model === modelSel.value);
  const years = new Set();
  rows.forEach(r => { for (let y = r.yearFrom; y <= r.yearTo; y++) years.add(y); });
  fill(yearSel, [...years].sort((a, b) => b - a), "Select year");
  yearSel.disabled = !modelSel.value;
  partInput.value = "";
  results.innerHTML = "";
});

yearSel.addEventListener("change", () => {
  partInput.value = "";
  showVehicleResults();
});

partInput.addEventListener("input", showPartResults);

// Colour of the programming tag: green = you can do it yourself,
// orange = needs a locksmith or dealer, grey = nobody has confirmed it yet.
function programmingClass(p) {
  if (p === "DIY") return "ok";
  if (p === "Locksmith" || p === "Dealer only") return "no";
  return "unknown";
}

// "Avalon 2013-2018 · Corolla 2014-2020", grouped by make.
// The searched make is left unlabelled, other makes get a label.
function vehicleListHtml(vehicles, searchedMake) {
  const byMake = new Map();
  vehicles.forEach(v => {
    if (!byMake.has(v.make)) byMake.set(v.make, []);
    byMake.get(v.make).push(v);
  });
  return [...byMake.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([make, list]) => {
      const text = list
        .sort((a, b) => a.model.localeCompare(b.model))
        .map(v => `${h(v.model)} ${h(formatRanges(v.ranges))}`)
        .join(" · ");
      return `<p>${make === searchedMake ? "" : `<strong>${h(make)}:</strong> `}${text}</p>`;
    }).join("");
}

function partsHtml(parts) {
  if (!parts.length) return "";
  const shown = parts.slice(0, 2).map(h).join(" · ");
  const rest = parts.slice(2);
  const more = rest.length
    ? ` <span class="more-parts" hidden> · ${rest.map(h).join(" · ")}</span>` +
      ` <button type="button" class="link" data-action="more-parts" aria-expanded="false">+${rest.length} more</button>`
    : "";
  return `<p class="parts"><strong>Part #:</strong> ${shown}${more}</p>`;
}

const SUPPLY_ORDER = ["OEM", "Aftermarket", "Refurbished"];

// One entry per supply option for this key: { supply, sku }.
// In a vehicle search only listings that fit that vehicle and year are used.
// If one option has several SKUs, the listing with the tightest year range wins.
function supplyOptions(g, ctx) {
  const rows = g.rows.filter(r => r.sku && r.supply && (
    ctx.mode !== "vehicle" ||
    (r.make === ctx.make && r.model === ctx.model && ctx.year >= r.yearFrom && ctx.year <= r.yearTo)));
  const best = new Map();
  rows.forEach(r => {
    const span = r.yearTo - r.yearFrom;
    if (!best.has(r.supply) || span < best.get(r.supply).span) best.set(r.supply, { supply: r.supply, sku: r.sku, span });
  });
  const rank = s => { const i = SUPPLY_ORDER.indexOf(s); return i === -1 ? SUPPLY_ORDER.length : i; };
  return [...best.values()].sort((a, b) => rank(a.supply) - rank(b.supply) || a.supply.localeCompare(b.supply));
}

function keyDirectHtml(g, ctx) {
  const options = supplyOptions(g, ctx);
  if (!options.length) return "";
  return `<div class="kd">
      <h3>Available at KeyDirect</h3>
      <div class="kd-buttons">${options.map(o =>
        `<button type="button" class="kd-btn" data-action="copy-sku" data-sku="${h(o.sku)}">${h(o.supply)} · ${h(o.sku)}</button>`
      ).join("")}</div>
      <p class="kd-hint">Tap a button to copy the SKU, then search for it on KeyDirect.</p>
    </div>`;
}

// ctx: { mode: "vehicle" | "part", make, model, year }
function cardHtml(g, ctx, hidden) {
  const searched = g.vehicles.find(v => v.make === ctx.make && v.model === ctx.model);
  const others = g.vehicles.filter(v => !(v.make === ctx.make && v.model === ctx.model));

  let fits = "";
  let also = "";
  if (ctx.mode === "vehicle") {
    fits = `<p class="fits"><strong>Fits:</strong> ${h(formatRanges(searched.ranges))} ${h(searched.model)}</p>`;
    if (others.length) {
      also = `<details class="also"><summary>Also fits (${others.length})</summary>${vehicleListHtml(others, ctx.make)}</details>`;
    }
  } else {
    also = `<details class="also" open><summary>Fits (${g.vehicles.length})</summary>${vehicleListHtml(g.vehicles, null)}</details>`;
  }

  // Chip is hidden when it is blank or "Unknown".
  const chipValue = String(g.chip || "").trim();
  const chip = chipValue && chipValue.toLowerCase() !== "unknown"
    ? ` <span><strong>Chip:</strong> ${h(chipValue)}</span>` : "";

  const options = g.supplies.length
    ? `<p class="options"><strong>Options:</strong> ${g.supplies.map(s => `<span class="badge">${h(s)}</span>`).join(" ")}</p>`
    : "";

  const notes = g.notes.length
    ? `<details class="also"><summary>Source notes</summary>${g.notes.map(n => `<p>${h(n)}</p>`).join("")}</details>`
    : "";

  return `
    <div class="card"${hidden ? " hidden data-extra" : ""}>
      <h2>${esc(g.keyType)}</h2>
      <p class="ident"><span><strong>FCC:</strong> ${esc(g.fcc)}</span>${chip}</p>
      ${fits}
      ${options}
      ${partsHtml(g.parts)}
      ${also}
      ${keyDirectHtml(g, ctx)}
      <p class="vin">Confirm with your VIN before buying.</p>
      ${notes}
    </div>`;
}

function showMoreButton(extra) {
  if (extra <= 0) return "";
  return `<button type="button" class="more" data-action="show-more">Show ${extra} more ${extra === 1 ? "key" : "keys"}</button>`;
}

function showVehicleResults() {
  const year = Number(yearSel.value);
  if (!year) { results.innerHTML = ""; return; }
  const hits = searchVehicle(GROUPS, makeSel.value, modelSel.value, year);
  if (!hits.length) {
    results.innerHTML = '<p class="empty">No match found.</p>';
    return;
  }
  const listings = hits.reduce((n, x) => n + x.matchingRows, 0);
  const ctx = { mode: "vehicle", make: makeSel.value, model: modelSel.value, year };
  results.innerHTML =
    `<p class="count">${hits.length} ${hits.length === 1 ? "key" : "keys"} for this vehicle, grouped from ${listings} supplier ${listings === 1 ? "listing" : "listings"}.</p>` +
    hits.map((x, i) => cardHtml(x.g, ctx, i >= CARDS_SHOWN_FIRST)).join("") +
    showMoreButton(hits.length - CARDS_SHOWN_FIRST);
}

function showPartResults() {
  const q = partInput.value.trim();
  if (!q) { results.innerHTML = ""; return; }
  // Searching by number replaces any vehicle choice.
  makeSel.value = "";
  fill(modelSel, [], "Select model"); modelSel.disabled = true;
  fill(yearSel, [], "Select year"); yearSel.disabled = true;
  if (q.replace(/[^A-Za-z0-9]/g, "").length < 4) {
    results.innerHTML = '<p class="empty">Type at least 4 letters or numbers.</p>';
    return;
  }
  const hits = searchParts(GROUPS, q);
  if (!hits.length) {
    results.innerHTML = `<p class="empty">No key found with the number "${h(q)}".</p>`;
    return;
  }
  const ctx = { mode: "part" };
  results.innerHTML =
    `<p class="count">${hits.length} ${hits.length === 1 ? "key matches" : "keys match"} "${h(q)}".</p>` +
    hits.map((g, i) => cardHtml(g, ctx, i >= CARDS_SHOWN_FIRST)).join("") +
    showMoreButton(hits.length - CARDS_SHOWN_FIRST);
}

// One click handler for the "+N more" and "Show more" buttons.
results.addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "show-more") {
    results.querySelectorAll("[data-extra]").forEach(c => { c.hidden = false; });
    btn.remove();
  } else if (btn.dataset.action === "copy-sku") {
    const sku = btn.dataset.sku;
    const original = btn.textContent;
    const done = ok => {
      btn.textContent = ok ? "Copied " + sku : "Select and copy: " + sku;
      setTimeout(() => { btn.textContent = original; }, 2000);
    };
    try {
      navigator.clipboard.writeText(sku).then(() => done(true), () => done(false));
    } catch (err) {
      done(false);
    }
  } else if (btn.dataset.action === "more-parts") {
    const span = btn.previousElementSibling;
    const open = span.hidden;
    span.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "show less" : `+${span.textContent.split(" · ").filter(s => s.trim()).length} more`;
  }
});
