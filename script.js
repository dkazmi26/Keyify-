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
  "transponder key|HD106-PT": "images/transponder-key-hd106-pt.jpg",
  "3-button smart key|HYQ14FBA": "images/3-button-smart-key-hyq14fba.jpg",
  "transponder key|HO03": "images/transponder-key-ho03.jpg",
  "transponder key|HO03-PT": "images/transponder-key-ho03-pt.jpg",
  "3-button keyless entry remote|BAB237131-056": "images/3-button-keyless-entry-remote-bab237131-056.jpg",
  "emergency key|HO01": "images/emergency-key-ho01.jpg",
  "transponder key|TOY44D-PT": "images/transponder-key-toy44d-pt.jpg",
  "3-button remote head key|GQ4-52T": "images/3-button-remote-head-key-gq4-52t.jpg",
  "3-button remote head key|MLBHLIK-1T": "images/3-button-remote-head-key-mlbhlik-1t.jpg",
  "4-button remote head key|HYQ12BDM": "images/4-button-remote-head-key-hyq12bdm.jpg",
  "3-button keyless entry remote|GQ43VT20T": "images/3-button-keyless-entry-remote-gq43vt20t.jpg",
  "transponder key|TOY44G-PT": "images/transponder-key-toy44g-pt.jpg",
  "3-button smart key|HYQ14AAB": "images/3-button-smart-key-hyq14aab.jpg",
  "5-button smart key|KR5TP-4": "images/5-button-smart-key-kr5tp-4.jpg",
  "transponder key|HD106": "images/transponder-key-hd106.jpg",
  "4-button smart key|HYQ14AAB": "images/4-button-smart-key-hyq14aab.jpg",
  "4-button smart key|HYQ14FBX": "images/4-button-smart-key-hyq14fbx.jpg",
  "5-button smart key|KR5V2X": "images/5-button-smart-key-kr5v2x.jpg",
  "3-button remote head key|HYQ12BBY": "images/3-button-remote-head-key-hyq12bby.jpg",
  "emergency key|HYQ14FBA": "images/emergency-key-hyq14fba.jpg",
  "transponder key|TOY44H-PT": "images/transponder-key-toy44h-pt.jpg",
  "transponder key|TOY44H": "images/transponder-key-toy44h.jpg",
  "4-button smart key|HYQ14FBA": "images/4-button-smart-key-hyq14fba.jpg",
  "3-button keyless entry remote|HYQ12BBX": "images/3-button-keyless-entry-remote-hyq12bbx.jpg",
  "transponder key|TOY43AT4": "images/transponder-key-toy43at4.jpg",
  "4-button smart key|KR5V2X": "images/4-button-smart-key-kr5v2x.jpg",
  "4-button smart key|ACJ932HK1210A": "images/4-button-smart-key-acj932hk1210a.jpg",
  "4-button smart key|HYQ14FBC": "images/4-button-smart-key-hyq14fbc.jpg",
  "3-button remote head key|MOZB41TG": "images/3-button-remote-head-key-mozb41tg.jpg",
  "3-button keyless entry remote|HYQ12BAN": "images/3-button-keyless-entry-remote-hyq12ban.jpg",
  "3-button remote head key|N5F-S0084A": "images/3-button-remote-head-key-n5f-s0084a.jpg",
  "4-button smart key|KR5TP-4": "images/4-button-smart-key-kr5tp-4.jpg",
  "4-button remote head key|HYQ12BBY": "images/4-button-remote-head-key-hyq12bby.jpg",
  "3-button remote head key|HYQ12BBT": "images/3-button-remote-head-key-hyq12bbt.jpg",
  "3-button remote head key|HYQ12BDM": "images/3-button-remote-head-key-hyq12bdm.jpg",
  "transponder key|HO01": "images/transponder-key-ho01.jpg",
  "transponder key|HO05": "images/transponder-key-ho05.jpg",
  "3-button remote head key|OUCG8D-380H-A": "images/3-button-remote-head-key-oucg8d-380h-a.jpg",
  "4-button remote head key|MLBHLIK-1T": "images/4-button-remote-head-key-mlbhlik-1t.jpg",
  "4-button remote head key|MLBHLIK6-1T": "images/4-button-remote-head-key-mlbhlik6-1t.jpg",
  "transponder key|HO01-PT": "images/transponder-key-ho01-pt.jpg",
  "transponder key|HO01T5": "images/transponder-key-ho01t5.jpg",
  "transponder key|HOV01T5": "images/transponder-key-hov01t5.jpg",
  "transponder key|HO05-PT": "images/transponder-key-ho05-pt.jpg",
  "4-button remote head key|GQ4-29T": "images/4-button-remote-head-key-gq4-29t.jpg",
  "transponder key|TOY48H-PT": "images/transponder-key-toy48h-pt.jpg",
  "4-button smart key|HYQ14FLA": "images/4-button-smart-key-hyq14fla.jpg",
  "3-button smart key|HYQ14FBX": "images/3-button-smart-key-hyq14fbx.jpg",
  "5-button smart key|CWTWB1G0090": "images/5-button-smart-key-cwtwb1g0090.jpg",
  "4-button smart key|HYQ14ACX": "images/4-button-smart-key-hyq14acx.jpg",
  "4-button flip key|GQ43VT20T": "images/4-button-flip-key-gq43vt20t.jpg",
  "4-button flip key|HYQ12BFB": "images/4-button-flip-key-hyq12bfb.jpg",
  "3-button smart key|HYQ14ACX": "images/3-button-smart-key-hyq14acx.jpg",
  "4-button remote head key|MLBHLIK6-1TA": "images/4-button-remote-head-key-mlbhlik6-1ta.jpg",
  "6-button smart key|KR5V1X": "images/6-button-smart-key-kr5v1x.jpg",
  "4-button keyless entry remote|A269ZUA101": "images/4-button-keyless-entry-remote-a269zua101.jpg",
  "4-button flip key|MLBHLIK-1T": "images/4-button-flip-key-mlbhlik-1t.jpg",
  "3-button flip key|HYQ12BFB": "images/3-button-flip-key-hyq12bfb.jpg",
  "4-button keyless entry remote|GQ43VT20T": "images/4-button-keyless-entry-remote-gq43vt20t.jpg",
  "3-button remote head key|GQ429T": "images/3-button-remote-head-key-gq429t.jpg",
  "3-button smart key|HYQ14FBC": "images/3-button-smart-key-hyq14fbc.jpg",
  "4-button remote head key|GQ4-52T": "images/4-button-remote-head-key-gq4-52t.jpg",
  "3-button remote head key|HYQ12BDP": "images/3-button-remote-head-key-hyq12bdp.jpg",
  "4-button remote head key|OUCG8D-380H-A": "images/4-button-remote-head-key-oucg8d-380h-a.jpg",
  "3-button keyless entry remote|NHVWB1U523": "images/3-button-keyless-entry-remote-nhvwb1u523.jpg",
  "4-button keyless entry remote|OUCG8D-344H-A": "images/4-button-keyless-entry-remote-oucg8d-344h-a.jpg",
  "3-button smart key|ACJ932HK1210A": "images/3-button-smart-key-acj932hk1210a.jpg",
  "7-button smart key|KR5V2X": "images/7-button-smart-key-kr5v2x.jpg",
  "4-button smart key|A2C97488400": "images/4-button-smart-key-a2c97488400.jpg",
  "4-button smart key|HYQ14AEM": "images/4-button-smart-key-hyq14aem.jpg",
  "4-button keyless entry remote|GQ43VT14T": "images/4-button-keyless-entry-remote-gq43vt14t.jpg",
  "4-button smart key|HYQ14FBE": "images/4-button-smart-key-hyq14fbe.jpg",
  "3-button flip key|GQ4-73T": "images/3-button-flip-key-gq4-73t.jpg",
  "4-button remote head key|KR55WK49308": "images/4-button-remote-head-key-kr55wk49308.jpg",
  "transponder key|HD113": "images/transponder-key-hd113.jpg",
  "4-button remote head key|N5F-S0084A": "images/4-button-remote-head-key-n5f-s0084a.jpg",
  "3-button smart key|KR5V1X": "images/3-button-smart-key-kr5v1x.jpg",
  "4-button smart key|KR5V1X": "images/4-button-smart-key-kr5v1x.jpg",
  "5-button keyless entry remote|OUCG8D-399H-A": "images/5-button-keyless-entry-remote-oucg8d-399h-a.jpg",
  "4-button keyless entry remote|E4EG8DJ": "images/4-button-keyless-entry-remote-e4eg8dj.jpg",
  "4-button keyless entry remote|KOBUTAH2T": "images/4-button-keyless-entry-remote-kobutah2t.jpg",
  "transponder key|HD113-PT": "images/transponder-key-hd113-pt.jpg",
  "7-button smart key|KR5TP-4": "images/7-button-smart-key-kr5tp-4.jpg",
  "3-button remote head key|HYQ1512V": "images/3-button-remote-head-key-hyq1512v.jpg",
  "4-button keyless entry remote|HYQ12BBX": "images/4-button-keyless-entry-remote-hyq12bbx.jpg",
  "4-button remote head key|HYQ12BEL": "images/4-button-remote-head-key-hyq12bel.jpg",
  "4-button flip key|HYQ12BDM": "images/4-button-flip-key-hyq12bdm.jpg",
  "5-button keyless entry remote|GQ43VT20T": "images/5-button-keyless-entry-remote-gq43vt20t.jpg",
  "6-button keyless entry remote|GQ43VT20T": "images/6-button-keyless-entry-remote-gq43vt20t.jpg",
  "3-button smart key|MOZB31EG": "images/3-button-smart-key-mozb31eg.jpg",
  "emergency key|NI06": "images/emergency-key-ni06.jpg",
  "4-button remote head key|OUC6000022": "images/4-button-remote-head-key-ouc6000022.jpg",
  "4-button flip key|CWTWB1U331": "images/4-button-flip-key-cwtwb1u331.jpg",
  "3-button remote head key|OUCD6000022": "images/3-button-remote-head-key-oucd6000022.jpg",
  "3-button flip key|N5F-A08TAA": "images/3-button-flip-key-n5f-a08taa.jpg",
  "5-button smart key|KR5S180144014": "images/5-button-smart-key-kr5s180144014.jpg",
  "3-button keyless entry remote|CWTWB1U331": "images/3-button-keyless-entry-remote-cwtwb1u331.jpg",
  "4-button smart key|KR5S180144014": "images/4-button-smart-key-kr5s180144014.jpg",
  "3-button keyless entry remote|CWTWB1U345": "images/3-button-keyless-entry-remote-cwtwb1u345.jpg",
  "4-button keyless entry remote|CWTWB1U311": "images/4-button-keyless-entry-remote-cwtwb1u311.jpg",
  "transponder key|HU100": "images/transponder-key-hu100.jpg",
  "transponder key|B111": "images/transponder-key-b111.jpg",
  "emergency key|HU100": "images/emergency-key-hu100.jpg",
  "transponder key|H72-PT": "images/transponder-key-h72-pt.jpg",
  "5-button smart key|HYQ4EA": "images/5-button-smart-key-hyq4ea.jpg",
  "5-button smart key|M3N-A2C31243300": "images/5-button-smart-key-m3n-a2c31243300.jpg",
  "4-button smart key|HYQ4EA": "images/4-button-smart-key-hyq4ea.jpg",
  "3-button smart key|M3N-A2C93142300": "images/3-button-smart-key-m3n-a2c93142300.jpg",
  "3-button flip key|N5F-A08TBLP": "images/3-button-flip-key-n5f-a08tblp.jpg",
  "4-button keyless entry remote|KOBLEAR1XT": "images/4-button-keyless-entry-remote-koblear1xt.jpg",
  "4-button flip key|KBRASTU15": "images/4-button-flip-key-kbrastu15.jpg",
  "4-button keyless entry remote|KBRASTU15": "images/4-button-keyless-entry-remote-kbrastu15.jpg",
  "emergency key|NI05T": "images/emergency-key-ni05t.jpg",
  "3-button keyless entry remote|KBRASTU15": "images/3-button-keyless-entry-remote-kbrastu15.jpg",
  "5-button smart key|M3N-A3C108397": "images/5-button-smart-key-m3n-a3c108397.jpg",
  "4-button smart key|KR5TXN7": "images/4-button-smart-key-kr5txn7.jpg",
  "4-button keyless entry remote|M3N32337100": "images/4-button-keyless-entry-remote-m3n32337100.jpg",
  "4-button smart key|M3N-A2C931423": "images/4-button-smart-key-m3n-a2c931423.jpg",
  "5-button smart key|M3N-A3C054339": "images/5-button-smart-key-m3n-a3c054339.jpg",
  "4-button keyless entry remote|KOBGT04A": "images/4-button-keyless-entry-remote-kobgt04a.jpg",
  "4-button smart key|KR5TXN3": "images/4-button-smart-key-kr5txn3.jpg",
  "transponder key|T30S30FD": "images/transponder-key-t30s30fd.jpg",
  "4-button keyless entry remote|KOBUT1BT": "images/4-button-keyless-entry-remote-kobut1bt.jpg",
  "4-button smart key|KR5TXN1": "images/4-button-smart-key-kr5txn1.jpg",
  "5-button smart key|KR5TXN4": "images/5-button-smart-key-kr5txn4.jpg",
  "5-button smart key|KR5TXPZ3": "images/5-button-smart-key-kr5txpz3.jpg",
  "4-button smart key|KR55WK49622": "images/4-button-smart-key-kr55wk49622.jpg",
  "4-button flip key|N5F-A08TBLP": "images/4-button-flip-key-n5f-a08tblp.jpg",
  "4-button keyless entry remote|OUC6000066": "images/4-button-keyless-entry-remote-ouc6000066.jpg",
  "5-button smart key|YG0G21TB2": "images/5-button-smart-key-yg0g21tb2.jpg",
  "6-button smart key|YG0G21TB2": "images/6-button-smart-key-yg0g21tb2.jpg",
  "4-button flip key|N5F-A08TDA": "images/4-button-flip-key-n5f-a08tda.jpg",
  "4-button smart key|M3N-A2C93142300": "images/4-button-smart-key-m3n-a2c93142300.jpg",
  "3-button keyless entry remote|KOBLEAR1XT": "images/3-button-keyless-entry-remote-koblear1xt.jpg",
  "5-button smart key|HYQ4AA": "images/5-button-smart-key-hyq4aa.jpg",
  "5-button smart key|HYQ4ES": "images/5-button-smart-key-hyq4es.jpg",
  "3-button smart key|CWTWB1U808": "images/3-button-smart-key-cwtwb1u808.jpg",
  "3-button smart key|KR5TXN1": "images/3-button-smart-key-kr5txn1.jpg",
  "4-button smart key|M3N-A2C931426": "images/4-button-smart-key-m3n-a2c931426.jpg",
  "4-button keyless entry remote|OUC60270": "images/4-button-keyless-entry-remote-ouc60270.jpg",
  "4-button smart key|HYQ4AA": "images/4-button-smart-key-hyq4aa.jpg",
  "3-button keyless entry remote|M3N32337100": "images/3-button-keyless-entry-remote-m3n32337100.jpg",
  "4-button flip key|LXP-T003": "images/4-button-flip-key-lxp-t003.jpg",
  "4-button smart key|CWTWB1U787": "images/4-button-smart-key-cwtwb1u787.jpg",
  "3-button remote head key|CWTWB1U751": "images/3-button-remote-head-key-cwtwb1u751.jpg",
  "5-button remote head key|CWTWB1U793": "images/5-button-remote-head-key-cwtwb1u793.jpg",
  "3-button smart key|KR55WK48801": "images/3-button-smart-key-kr55wk48801.jpg",
  "4-button remote head key|CWTWB1U793": "images/4-button-remote-head-key-cwtwb1u793.jpg",
  "3-button remote head key|KR55WK47899": "images/3-button-remote-head-key-kr55wk47899.jpg",
  "5-button smart key|CMIT": "images/5-button-smart-key-cmit.jpg",
  "4-button smart key|HYQ4ES": "images/4-button-smart-key-hyq4es.jpg",
  "3-button smart key|HYQ4AA": "images/3-button-smart-key-hyq4aa.jpg",
  "3-button smart key|KR5S180144014": "images/3-button-smart-key-kr5s180144014.jpg",
  "4-button smart key|M3N-A2C31243800": "images/4-button-smart-key-m3n-a2c31243800.jpg",
  "4-button flip key|OUCD6000022": "images/4-button-flip-key-oucd6000022.jpg",
  "transponder key|H73-PT": "images/transponder-key-h73-pt.jpg",
  "4-button keyless entry remote|CWTWB1U343": "images/4-button-keyless-entry-remote-cwtwb1u343.jpg",
  "3-button keyless entry remote|LHJ011": "images/3-button-keyless-entry-remote-lhj011.jpg",
  "3-button smart key|HYQ4EA": "images/3-button-smart-key-hyq4ea.jpg",
  "5-button keyless entry remote|KOBGT04A": "images/5-button-keyless-entry-remote-kobgt04a.jpg",
  "5-button smart key|CWTWB1G744": "images/5-button-smart-key-cwtwb1g744.jpg",
  "4-button smart key|CWTWB1U840": "images/4-button-smart-key-cwtwb1u840.jpg",
  "4-button flip key|N5F-A08TAA": "images/4-button-flip-key-n5f-a08taa.jpg",
  "5-button keyless entry remote|CWTWB1U511": "images/5-button-keyless-entry-remote-cwtwb1u511.jpg",
  "3-button flip key|LXP-T004": "images/3-button-flip-key-lxp-t004.jpg",
  "4-button flip key|LXP-T004": "images/4-button-flip-key-lxp-t004.jpg",
  "3-button smart key|HYQ1AA": "images/3-button-smart-key-hyq1aa.jpg",
  "3-button keyless entry remote|KOBUT1BT": "images/3-button-keyless-entry-remote-kobut1bt.jpg",
  "4-button smart key|HYQ1AA": "images/4-button-smart-key-hyq1aa.jpg",
  "transponder key|B97": "images/transponder-key-b97.jpg",
  "3-button smart key|KR5TXPZ1": "images/3-button-smart-key-kr5txpz1.jpg"
};
function photoFor(g) {
  const src = KEY_PHOTOS[String(g.keyType || "").trim().toLowerCase() + "|" + String(g.fcc || "").trim().toUpperCase()];
  return src ? `<img class="keyphoto" src="${src}" alt="" width="360" height="360" loading="lazy">` : "";
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
