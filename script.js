const makeSel = document.getElementById("make");
const modelSel = document.getElementById("model");
const yearSel = document.getElementById("year");
const partInput = document.getElementById("partq");
const results = document.getElementById("results");
const resetBtn = document.getElementById("reset");

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
  updateReset();
});

modelSel.addEventListener("change", () => {
  const rows = KEYS.filter(k => k.make === makeSel.value && k.model === modelSel.value);
  const years = new Set();
  rows.forEach(r => { for (let y = r.yearFrom; y <= r.yearTo; y++) years.add(y); });
  fill(yearSel, [...years].sort((a, b) => b - a), "Select year");
  yearSel.disabled = !modelSel.value;
  partInput.value = "";
  results.innerHTML = "";
  updateReset();
});

yearSel.addEventListener("change", () => {
  partInput.value = "";
  showVehicleResults();
  updateReset();
});

partInput.addEventListener("input", () => {
  showPartResults();
  updateReset();
});

// "Start over" shows only while something is chosen or typed. It puts the
// page back to how it first loaded so a new vehicle can be entered.
function updateReset() {
  resetBtn.hidden = !(makeSel.value || partInput.value.trim());
}

resetBtn.addEventListener("click", () => {
  makeSel.value = "";
  fill(modelSel, [], "Select model"); modelSel.disabled = true;
  fill(yearSel, [], "Select year"); yearSel.disabled = true;
  partInput.value = "";
  results.innerHTML = "";
  updateReset();
  window.scrollTo({ top: 0, behavior: "smooth" });
  makeSel.focus({ preventScroll: true });
});

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

// Part # line: first 2 numbers, the rest behind a "+N more" button.
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

// Card title: the key style only, no button count. The data keeps the raw keyType;
// this is display only. Any keyType not listed here is shown unchanged.
const KEY_TITLES = [
  [/^\d+-button smart key$/i, "Smart Key (push-to-start)"],
  [/^\d+-button remote head key$/i, "Remote Head Key"],
  [/^\d+-button flip key$/i, "Flip Key (folding blade)"],
  [/^\d+-button keyless entry remote$/i, "Keyless Entry Remote"],
  [/^transponder key$/i, "Transponder Key (no remote)"],
  [/^emergency key$/i, "Emergency Key (blade only)"]
];

function keyTitle(keyType) {
  const t = String(keyType || "").trim();
  const hit = KEY_TITLES.find(([pattern]) => pattern.test(t));
  return hit ? hit[1] : keyType;
}

// The N in "4-Button Smart Key", or 0 when the key type has no count.
function keyButtonCount(keyType) {
  const m = String(keyType || "").match(/(\d+)\s*-?\s*button/i);
  return m ? Number(m[1]) : 0;
}

// "4 buttons: Lock · Unlock · Trunk · Panic", or just "4 buttons" when there are
// no names. Transponder and emergency keys have no remote, so no buttons line.
function buttonsLineHtml(keyType, buttonsText) {
  if (/^(transponder|emergency) key$/i.test(String(keyType || "").trim())) return "";
  const n = keyButtonCount(keyType);
  const names = String(buttonsText || "").split(",").map(s => s.trim()).filter(Boolean);
  if (names.length) {
    const label = n ? `${n} ${n === 1 ? "button" : "buttons"}:` : "Buttons:";
    return `<p class="buttons"><strong>${label}</strong> ${names.map(h).join(" · ")}</p>`;
  }
  if (n) return `<p class="buttons"><strong>${n} ${n === 1 ? "button" : "buttons"}</strong></p>`;
  return "";
}

// One chip style on screen: uppercase, hyphen shown as a space ("H-Chip" -> "H CHIP").
// Display only; the data keeps what the CSV says.
function chipStyle(value) {
  return String(value).replace(/-/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

// ctx: { mode: "vehicle" | "part", make, model, year }
// Key photos (test): matched by key type + FCC ID. Cards without a photo look as before.
const KEY_PHOTOS = {
  "4-button remote head key|KR55WK49308": "images/honda-4-button-remote-head-key.jpg"
};
function photoFor(g) {
  const src = KEY_PHOTOS[String(g.keyType || "").trim().toLowerCase() + "|" + String(g.fcc || "").trim().toUpperCase()];
  return src ? `<img class="keyphoto" src="${src}" alt="" width="600" height="600" loading="lazy">` : "";
}

function cardHtml(g, ctx, hidden) {
  const searched = g.vehicles.find(v => v.make === ctx.make && v.model === ctx.model);
  const others = g.vehicles.filter(v => !(v.make === ctx.make && v.model === ctx.model));

  let parts, buttonsText, chipText, fits = "", also = "";
  if (ctx.mode === "vehicle") {
    // Only part numbers and buttons from listings that fit the searched vehicle and year.
    parts = partsForVehicle(g, ctx.make, ctx.model, ctx.year);
    buttonsText = buttonsForVehicle(g, ctx.make, ctx.model, ctx.year);
    // Chip comes from the listings that fit this make, model and year.
    chipText = chipForVehicle(g, ctx.make, ctx.model, ctx.year);
    fits = `<p class="fits"><strong>Fits:</strong> ${h(formatRanges(searched.ranges))} ${h(searched.model)}</p>`;
    if (others.length) {
      also = `<details class="also"><summary>Also fits (${others.length})</summary>${vehicleListHtml(others, ctx.make)}</details>`;
    }
  } else {
    parts = g.parts;
    buttonsText = mostCommon(g.rows.map(r => r.buttons));
    chipText = g.chip;
    also = `<details class="also" open><summary>Fits (${g.vehicles.length})</summary>${vehicleListHtml(g.vehicles, null)}</details>`;
  }

  // FCC, chip, frequency and board each hide themselves when blank (FCC also when "Unknown").
  const fccValue = String(g.fcc || "").trim();
  const boardValue = String(g.board || "").trim();
  const chipValue = String(chipText || "").trim();
  const identParts = [];
  // Frequency only shows when the data has it (filled only when two sources agree).
  const freqValue = String(g.frequency || "").trim();
  const spec = (label, value) => `<div class="spec"><span class="spec-label">${label}</span><span class="spec-value">${h(value)}</span></div>`;
  // Emergency and transponder keys have no radio, so no FCC ID: the data keeps their key code
  // (HU100, TOY44D-PT, HO03) in the same column, and the card calls it a key code. A few
  // emergency keys sit under a smart key's real FCC ID (HYQ14FBA, TQ8-FOB-4F35): those stay "FCC ID".
  const KEY_CODE = /^(TOY|HO|HD|HU|HY\d|H\d|B\d|DW|GM\d|FO\d|T\d+S|KK|SZ|Y\d{3}|SIP\d|CY\d|NI\d|NSN\d|DA\d|MZ\d|MAZ\d|MIT\d)/i;
  const noRemote = /^(emergency key|transponder key)$/i.test(String(g.keyType || "").trim()) && KEY_CODE.test(fccValue);
  if (fccValue && fccValue.toLowerCase() !== "unknown") identParts.push(spec(noRemote ? "Key code" : "FCC ID", fccValue));
  if (chipValue && chipValue.toLowerCase() !== "unknown") identParts.push(spec("Chip", chipStyle(chipValue)));
  if (freqValue) identParts.push(spec("Frequency", freqValue));
  if (boardValue) identParts.push(spec("Board", boardValue));
  const ident = identParts.length ? `<div class="specs">${identParts.join("")}</div>` : "";

  return `
    <div class="card"${hidden ? " hidden data-extra" : ""}>
      <div class="cardhead">
        <div class="cardtitle">
          <h2>${esc(keyTitle(g.keyType))}</h2>
          ${buttonsLineHtml(g.keyType, buttonsText)}
        </div>
        ${photoFor(g)}
      </div>
      ${ident}
      ${partsHtml(parts)}
      ${fits}
      ${also}
      <p class="vin">Confirm with your VIN before buying.</p>
    </div>`;
}

// Cards that would look exactly the same (same title, same fields, same lists) are
// shown once. A card that differs in any field is never folded.
function uniqueCards(groups, ctx) {
  const seen = new Set(), keep = [];
  groups.forEach(g => {
    const html = cardHtml(g, ctx, false);
    if (!seen.has(html)) { seen.add(html); keep.push(g); }
  });
  return keep;
}

function showMoreButton(extra) {
  if (extra <= 0) return "";
  return `<button type="button" class="more" data-action="show-more">Show ${extra} more ${extra === 1 ? "key" : "keys"}</button>`;
}

// Same "Start over" at the end of the results, so nobody has to scroll back up.
function startOverButton() {
  return '<button type="button" class="more" data-action="reset">Start over</button>';
}

function showVehicleResults() {
  const year = Number(yearSel.value);
  if (!year) { results.innerHTML = ""; return; }
  const hits = searchVehicle(GROUPS, makeSel.value, modelSel.value, year);
  if (!hits.length) {
    results.innerHTML = '<p class="empty">No match found.</p>';
    return;
  }
  const ctx = { mode: "vehicle", make: makeSel.value, model: modelSel.value, year };
  const cards = uniqueCards(hits.map(x => x.g), ctx);
  results.innerHTML =
    `<p class="count">${cards.length} ${cards.length === 1 ? "key" : "keys"} for this vehicle.</p>` +
    cards.map((g, i) => cardHtml(g, ctx, i >= CARDS_SHOWN_FIRST)).join("") +
    showMoreButton(cards.length - CARDS_SHOWN_FIRST) + startOverButton();
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
  const cards = uniqueCards(hits, ctx);
  results.innerHTML =
    `<p class="count">${cards.length} ${cards.length === 1 ? "key matches" : "keys match"} "${h(q)}".</p>` +
    cards.map((g, i) => cardHtml(g, ctx, i >= CARDS_SHOWN_FIRST)).join("") +
    showMoreButton(cards.length - CARDS_SHOWN_FIRST) + startOverButton();
}

// One click handler for the "+N more" and "Show more" buttons.
results.addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "reset") {
    resetBtn.click();
  } else if (btn.dataset.action === "show-more") {
    results.querySelectorAll("[data-extra]").forEach(c => { c.hidden = false; });
    btn.remove();
  } else if (btn.dataset.action === "more-parts") {
    const span = btn.previousElementSibling;
    const open = span.hidden;
    span.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "show less" : `+${span.textContent.split(" · ").filter(s => s.trim()).length} more`;
  }
});
