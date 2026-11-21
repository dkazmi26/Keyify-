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
  "3-button smart key|KR5TXPZ1": "images/3-button-smart-key-kr5txpz1.jpg",
  "4-button smart key|SY5HMFNA04": "images/4-button-smart-key-sy5hmfna04.jpg",
  "4-button smart key|HYQ14FLC": "images/4-button-smart-key-hyq14flc.jpg",
  "emergency key|Y171": "images/emergency-key-y171.jpg",
  "4-button smart key|M3N-40821302": "images/4-button-smart-key-m3n-40821302.jpg",
  "5-button smart key|M3N-40821302": "images/5-button-smart-key-m3n-40821302.jpg",
  "transponder key|Y160": "images/transponder-key-y160.jpg",
  "transponder key|Y170": "images/transponder-key-y170.jpg",
  "4-button smart key|HYQ14FLB": "images/4-button-smart-key-hyq14flb.jpg",
  "4-button smart key|HYQ14AHK": "images/4-button-smart-key-hyq14ahk.jpg",
  "4-button smart key|HYQ14AHC": "images/4-button-smart-key-hyq14ahc.jpg",
  "4-button remote head key|OHT692713AA": "images/4-button-remote-head-key-oht692713aa.jpg",
  "5-button smart key|GQ4-76T": "images/5-button-smart-key-gq4-76t.jpg",
  "5-button smart key|M3M-40821302": "images/5-button-smart-key-m3m-40821302.jpg",
  "3-button smart key|M3N-40821302": "images/3-button-smart-key-m3n-40821302.jpg",
  "4-button remote head key|CWTWBU766": "images/4-button-remote-head-key-cwtwbu766.jpg",
  "5-button smart key|HYQ2EB": "images/5-button-smart-key-hyq2eb.jpg",
  "smart key wallet card|HYQ14CBB": "images/smart-key-wallet-card-hyq14cbb.jpg",
  "4-button remote head key|CWTWB1U811": "images/4-button-remote-head-key-cwtwb1u811.jpg",
  "4-button smart key|GQ4-54T": "images/4-button-smart-key-gq4-54t.jpg",
  "4-button remote head key|CWTB1G077": "images/4-button-remote-head-key-cwtb1g077.jpg",
  "5-button smart key|HYQ2AB": "images/5-button-smart-key-hyq2ab.jpg",
  "transponder key|MIT17": "images/transponder-key-mit17.jpg",
  "transponder key|MIT17A": "images/transponder-key-mit17a.jpg",
  "3-button keyless entry remote|GQ43VT9T": "images/3-button-keyless-entry-remote-gq43vt9t.jpg",
  "4-button keyless entry remote|GQ43VT17T": "images/4-button-keyless-entry-remote-gq43vt17t.jpg",
  "7-button smart key|M3N-97395900": "images/7-button-smart-key-m3n-97395900.jpg",
  "6-button smart key|HYQ1AA": "images/6-button-smart-key-hyq1aa.jpg",
  "transponder key|TOY50": "images/transponder-key-toy50.jpg",
  "4-button smart key|WAZSKE11D01": "images/4-button-smart-key-wazske11d01.jpg",
  "transponder key|B100": "images/transponder-key-b100.jpg",
  "transponder key|TOY48": "images/transponder-key-toy48.jpg",
  "4-button smart key|HYQ14FBF": "images/4-button-smart-key-hyq14fbf.jpg",
  "transponder key|TOY50-PT": "images/transponder-key-toy50-pt.jpg",
  "transponder key|TOY40BT4": "images/transponder-key-toy40bt4.jpg",
  "4-button smart key|WAZSKE13D03": "images/4-button-smart-key-wazske13d03.jpg",
  "transponder key|MAZ24R": "images/transponder-key-maz24r.jpg",
  "5-button smart key|GQ4-54T": "images/5-button-smart-key-gq4-54t.jpg",
  "5-button smart key|OHT-4882056": "images/5-button-smart-key-oht-4882056.jpg",
  "transponder key|Y165": "images/transponder-key-y165.jpg",
  "4-button keyless entry remote|GQ43VT9T": "images/4-button-keyless-entry-remote-gq43vt9t.jpg",
  "4-button smart key|HYQ14AKB": "images/4-button-smart-key-hyq14akb.jpg",
  "emergency key|HY22": "images/emergency-key-hy22.jpg",
  "4-button smart key|TQ8-FOB-4F19": "images/4-button-smart-key-tq8-fob-4f19.jpg",
  "4-button smart key|SY5XMFNA04": "images/4-button-smart-key-sy5xmfna04.jpg",
  "transponder key|TOY48BT4": "images/transponder-key-toy48bt4.jpg",
  "3-button smart key|GQ4-54T": "images/3-button-smart-key-gq4-54t.jpg",
  "3-button smart key|GQ4-76T": "images/3-button-smart-key-gq4-76t.jpg",
  "emergency key|B106": "images/emergency-key-b106.jpg",
  "emergency key|B116": "images/emergency-key-b116.jpg",
  "5-button smart key|NBG009768T": "images/5-button-smart-key-nbg009768t.jpg",
  "4-button smart key|HYQ2AB": "images/4-button-smart-key-hyq2ab.jpg",
  "emergency key|HY15": "images/emergency-key-hy15.jpg",
  "3-button smart key|WAZSKE13D03": "images/3-button-smart-key-wazske13d03.jpg",
  "emergency key|MZ27": "images/emergency-key-mz27.jpg",
  "4-button flip key|BGBX1T478SKE125-01": "images/4-button-flip-key-bgbx1t478ske125-01.jpg",
  "3-button smart key|OUC644M-KEY-N": "images/3-button-smart-key-ouc644m-key-n.jpg",
  "4-button smart key|OHT-4882056": "images/4-button-smart-key-oht-4882056.jpg",
  "6-button smart key|M3N-97395900": "images/6-button-smart-key-m3n-97395900.jpg",
  "2-button keyless entry remote|NHVWB1U711": "images/2-button-keyless-entry-remote-nhvwb1u711.jpg",
  "transponder key|TOY43RH-PT": "images/transponder-key-toy43rh-pt.jpg",
  "transponder key|TOY43RT45": "images/transponder-key-toy43rt45.jpg",
  "4-button smart key|YG0G21TB2": "images/4-button-smart-key-yg0g21tb2.jpg",
  "transponder key|B99": "images/transponder-key-b99.jpg",
  "5-button smart key|YG0G20TB1": "images/5-button-smart-key-yg0g20tb1.jpg",
  "5-button smart key|HYQ2ES": "images/5-button-smart-key-hyq2es.jpg",
  "5-button smart key|HYQ1ES": "images/5-button-smart-key-hyq1es.jpg",
  "emergency key|HY21": "images/emergency-key-hy21.jpg",
  "4-button flip key|TQ8-RKE-4F25": "images/4-button-flip-key-tq8-rke-4f25.jpg",
  "emergency key|KK10": "images/emergency-key-kk10.jpg",
  "transponder key|TOY40": "images/transponder-key-toy40.jpg",
  "3-button smart key|HYQ14FLC": "images/3-button-smart-key-hyq14flc.jpg",
  "3-button flip key|BGBX1T478SKE125-01": "images/3-button-flip-key-bgbx1t478ske125-01.jpg",
  "2-button keyless entry remote|OUCG8D-525M-A": "images/2-button-keyless-entry-remote-oucg8d-525m-a.jpg",
  "3-button keyless entry remote|OUCG8D-525M-A": "images/3-button-keyless-entry-remote-oucg8d-525m-a.jpg",
  "transponder key|MIT16A": "images/transponder-key-mit16a.jpg",
  "emergency key|MIT3": "images/emergency-key-mit3.jpg",
  "6-button smart key|OHT-4882056": "images/6-button-smart-key-oht-4882056.jpg",
  "3-button keyless entry remote|GQ43VT17T": "images/3-button-keyless-entry-remote-gq43vt17t.jpg",
  "3-button remote head key|KOBDT04A": "images/3-button-remote-head-key-kobdt04a.jpg",
  "3-button keyless entry remote|GQ43VT7T": "images/3-button-keyless-entry-remote-gq43vt7t.jpg",
  "transponder key|B120": "images/transponder-key-b120.jpg",
  "5-button keyless entry remote|OUC60270": "images/5-button-keyless-entry-remote-ouc60270.jpg",
  "6-button keyless entry remote|OUC6000066": "images/6-button-keyless-entry-remote-ouc6000066.jpg",
  "5-button keyless entry remote|M3N32337100": "images/5-button-keyless-entry-remote-m3n32337100.jpg",
  "5-button keyless entry remote|OUC6000066": "images/5-button-keyless-entry-remote-ouc6000066.jpg",
  "3-button smart key|HYQ1EA": "images/3-button-smart-key-hyq1ea.jpg",
  "4-button flip key|NYODD4TX1306-TFL": "images/4-button-flip-key-nyodd4tx1306-tfl.jpg",
  "4-button smart key|HYQ14FBB": "images/4-button-smart-key-hyq14fbb.jpg",
  "smart key wallet card|HYQ14CBP": "images/smart-key-wallet-card-hyq14cbp.jpg",
  "4-button flip key|KPU41788": "images/4-button-flip-key-kpu41788.jpg",
  "4-button smart key|CWTWBU735": "images/4-button-smart-key-cwtwbu735.jpg",
  "3-button flip key|CWTWB1G767": "images/3-button-flip-key-cwtwb1g767.jpg",
  "3-button smart key|KR5S180144106": "images/3-button-smart-key-kr5s180144106.jpg",
  "transponder key|Y162": "images/transponder-key-y162.jpg",
  "4-button smart key|M3M-40821302": "images/4-button-smart-key-m3m-40821302.jpg",
  "emergency key|SIP22": "images/emergency-key-sip22.jpg",
  "emergency key|HYQ14ACX": "images/emergency-key-hyq14acx.jpg",
  "2-button keyless entry remote|A269ZUA111": "images/2-button-keyless-entry-remote-a269zua111.jpg",
  "transponder key|B114R": "images/transponder-key-b114r.jpg",
  "5-button flip key|KOBGT04A": "images/5-button-flip-key-kobgt04a.jpg",
  "3-button keyless entry remote|L2C0007T": "images/3-button-keyless-entry-remote-l2c0007t.jpg",
  "3-button keyless entry remote|KOBGT04A": "images/3-button-keyless-entry-remote-kobgt04a.jpg",
  "6-button keyless entry remote|KOBGT04A": "images/6-button-keyless-entry-remote-kobgt04a.jpg",
  "3-button flip key|LXP-T003": "images/3-button-flip-key-lxp-t003.jpg",
  "6-button keyless entry remote|M3N32337100": "images/6-button-keyless-entry-remote-m3n32337100.jpg",
  "3-button keyless entry remote|MYT3X6898B": "images/3-button-keyless-entry-remote-myt3x6898b.jpg",
  "transponder key|B98": "images/transponder-key-b98.jpg",
  "4-button keyless entry remote|ABO0204T": "images/4-button-keyless-entry-remote-abo0204t.jpg",
  "3-button remote head key|CWTWB1U793": "images/3-button-remote-head-key-cwtwb1u793.jpg",
  "4-button smart key|M3N-A2C31243300": "images/4-button-smart-key-m3n-a2c31243300.jpg",
  "4-button smart key|M3N5WY8406": "images/4-button-smart-key-m3n5wy8406.jpg",
  "4-button smart key|HYQ1EA": "images/4-button-smart-key-hyq1ea.jpg",
  "emergency key|HY18": "images/emergency-key-hy18.jpg",
  "4-button smart key|TQ8-FOB-4F18": "images/4-button-smart-key-tq8-fob-4f18.jpg",
  "4-button flip key|TQ8-RKE-3F04": "images/4-button-flip-key-tq8-rke-3f04.jpg",
  "3-button keyless entry remote|OSLOKA-850T": "images/3-button-keyless-entry-remote-osloka-850t.jpg",
  "4-button flip key|TQ8-RKE-4F19": "images/4-button-flip-key-tq8-rke-4f19.jpg",
  "emergency key|KK12": "images/emergency-key-kk12.jpg",
  "4-button smart key|TQ8-FOB-4F17": "images/4-button-smart-key-tq8-fob-4f17.jpg",
  "4-button smart key|TQ8-FOB-4F06": "images/4-button-smart-key-tq8-fob-4f06.jpg",
  "3-button flip key|NYOSEKSAM11ATX": "images/3-button-flip-key-nyoseksam11atx.jpg",
  "3-button smart key|HYQ14FBF": "images/3-button-smart-key-hyq14fbf.jpg",
  "3-button keyless entry remote|KPU41794": "images/3-button-keyless-entry-remote-kpu41794.jpg",
  "3-button flip key|KPU41788": "images/3-button-flip-key-kpu41788.jpg",
  "transponder key|MIT13": "images/transponder-key-mit13.jpg",
  "4-button smart key|OUC644M-KEY-N": "images/4-button-smart-key-ouc644m-key-n.jpg",
  "4-button smart key|KR5TXPZ1": "images/4-button-smart-key-kr5txpz1.jpg",
  "3-button smart key|CWTWBU729": "images/3-button-smart-key-cwtwbu729.jpg",
  "4-button smart key|KR5S180144204": "images/4-button-smart-key-kr5s180144204.jpg",
  "5-button smart key|KR5S180144106": "images/5-button-smart-key-kr5s180144106.jpg",
  "3-button smart key|OHT-4882056": "images/3-button-smart-key-oht-4882056.jpg",
  "5-button smart key|M3N-97395900": "images/5-button-smart-key-m3n-97395900.jpg",
  "3-button remote head key|M3N5WY72XX": "images/3-button-remote-head-key-m3n5wy72xx.jpg",
  "6-button remote head key|M3N5WY72XX": "images/6-button-remote-head-key-m3n5wy72xx.jpg",
  "5-button smart key|M3NWXF0B1": "images/5-button-smart-key-m3nwxf0b1.jpg",
  "6-button smart key|M3NWXF0B1": "images/6-button-smart-key-m3nwxf0b1.jpg",
  "transponder key|B110": "images/transponder-key-b110.jpg",
  "5-button keyless entry remote|M3N65981403": "images/5-button-keyless-entry-remote-m3n65981403.jpg",
  "7-button smart key|YG0G20TB1": "images/7-button-smart-key-yg0g20tb1.jpg",
  "3-button keyless entry remote|M3N-32337200": "images/3-button-keyless-entry-remote-m3n-32337200.jpg",
  "5-button smart key|M3N-32337200": "images/5-button-smart-key-m3n-32337200.jpg",
  "3-button smart key|M3N-A2C31243800": "images/3-button-smart-key-m3n-a2c31243800.jpg",
  "4-button smart key|M3N-A3C054338": "images/4-button-smart-key-m3n-a3c054338.jpg",
  "4-button smart key|M3N-A3C108397": "images/4-button-smart-key-m3n-a3c108397.jpg",
  "4-button smart key|M3N-A3C054339": "images/4-button-smart-key-m3n-a3c054339.jpg",
  "5-button smart key|M3N-A3C054338": "images/5-button-smart-key-m3n-a3c054338.jpg",
  "transponder key|B107": "images/transponder-key-b107.jpg",
  "6-button smart key|HYQ2AB": "images/6-button-smart-key-hyq2ab.jpg",
  "6-button smart key|HYQ2EB": "images/6-button-smart-key-hyq2eb.jpg",
  "transponder key|B115": "images/transponder-key-b115.jpg",
  "3-button smart key|HYQ1ES": "images/3-button-smart-key-hyq1es.jpg",
  "6-button smart key|HUFGM2718": "images/6-button-smart-key-hufgm2718.jpg",
  "5-button smart key|NYOMBEC5FOB2004": "images/5-button-smart-key-nyombec5fob2004.jpg",
  "3-button keyless entry remote|PINHA-T038": "images/3-button-keyless-entry-remote-pinha-t038.jpg",
  "4-button flip key|TQ8-RKE-4F31": "images/4-button-flip-key-tq8-rke-4f31.jpg",
  "4-button flip key|TQ8-RKE-4F16": "images/4-button-flip-key-tq8-rke-4f16.jpg",
  "5-button smart key|TQ8-FOB-4F26": "images/5-button-smart-key-tq8-fob-4f26.jpg",
  "6-button smart key|TQ8-FOB-4F81M44": "images/6-button-smart-key-tq8-fob-4f81m44.jpg",
  "4-button smart key|CQOFN00040": "images/4-button-smart-key-cqofn00040.jpg",
  "4-button flip key|OSLOKA-OKA875T": "images/4-button-flip-key-osloka-oka875t.jpg",
  "4-button flip key|TQ8-RKE-3F05": "images/4-button-flip-key-tq8-rke-3f05.jpg",
  "4-button keyless entry remote|PLNHM-T011": "images/4-button-keyless-entry-remote-plnhm-t011.jpg",
  "3-button keyless entry remote|PLNBONTEC-T009": "images/3-button-keyless-entry-remote-plnbontec-t009.jpg",
  "4-button flip key|OSLOKA-910T": "images/4-button-flip-key-osloka-910t.jpg",
  "4-button flip key|TQ8-RKE-4F42": "images/4-button-flip-key-tq8-rke-4f42.jpg",
  "3-button remote head key|HYQ12BBK": "images/3-button-remote-head-key-hyq12bbk.jpg",
  "3-button keyless entry remote|KPU41846": "images/3-button-keyless-entry-remote-kpu41846.jpg",
  "2-button keyless entry remote|HYQ12ABA": "images/2-button-keyless-entry-remote-hyq12aba.jpg",
  "transponder key|MIT9": "images/transponder-key-mit9.jpg",
  "4-button remote head key|OUCG8D-620M-A": "images/4-button-remote-head-key-oucg8d-620m-a.jpg",
  "3-button remote head key|OUCG8D-620M-A": "images/3-button-remote-head-key-oucg8d-620m-a.jpg",
  "3-button keyless entry remote|E4EG8D-522M-A": "images/3-button-keyless-entry-remote-e4eg8d-522m-a.jpg",
  "transponder key|MIT8": "images/transponder-key-mit8.jpg",
  "transponder key|MIT12": "images/transponder-key-mit12.jpg",
  "4-button remote head key|CWTWB1U816": "images/4-button-remote-head-key-cwtwb1u816.jpg",
  "3-button flip key|2ADPXTRF198": "images/3-button-flip-key-2adpxtrf198.jpg",
  "3-button flip key|LTQF12AM433TX": "images/3-button-flip-key-ltqf12am433tx.jpg",
  "4-button remote head key|M3N5WY72XX": "images/4-button-remote-head-key-m3n5wy72xx.jpg",
  "3-button smart key|M3N-97395900": "images/3-button-smart-key-m3n-97395900.jpg",
  "3-button flip key|2ADFTFI5AM433TX": "images/3-button-flip-key-2adftfi5am433tx.jpg",
  "4-button flip key|2ADFTFI5AM433TX": "images/4-button-flip-key-2adftfi5am433tx.jpg",
  "4-button remote head key|CWTWBU745": "images/4-button-remote-head-key-cwtwbu745.jpg",
  "4-button keyless entry remote|CWTWB1U819": "images/4-button-keyless-entry-remote-cwtwb1u819.jpg",
  "4-button smart key|HYQ14FBN": "images/4-button-smart-key-hyq14fbn.jpg",
  "4-button smart key|HYQ14FBW": "images/4-button-smart-key-hyq14fbw.jpg",
  "4-button flip key|HYQ12BFH": "images/4-button-flip-key-hyq12bfh.jpg",
  "6-button smart key|HYQ4EA": "images/6-button-smart-key-hyq4ea.jpg",
  "5-button smart key|HYQ4AS": "images/5-button-smart-key-hyq4as.jpg",
  "5-button smart key|YGOG21TB2": "images/5-button-smart-key-ygog21tb2.jpg",
  "3-button flip key|A2GM3AFUS03": "images/3-button-flip-key-a2gm3afus03.jpg",
  "transponder key|DW04CT6": "images/transponder-key-dw04ct6.jpg",
  "transponder key|FO21T17": "images/transponder-key-fo21t17.jpg",
  "3-button smart key|M3N-A3C108397": "images/3-button-smart-key-m3n-a3c108397.jpg",
  "3-button smart key|M3N-A2C931423": "images/3-button-smart-key-m3n-a2c931423.jpg",
  "3-button smart key|N5F-A08TDA": "images/3-button-smart-key-n5f-a08tda.jpg",
  "4-button smart key|HYQ4AS": "images/4-button-smart-key-hyq4as.jpg",
  "transponder key|B112": "images/transponder-key-b112.jpg",
  "5-button smart key|NBGG093UCC": "images/5-button-smart-key-nbgg093ucc.jpg",
  "6-button keyless entry remote|OUC6000223": "images/6-button-keyless-entry-remote-ouc6000223.jpg",
  "3-button smart key|HYQ2AB": "images/3-button-smart-key-hyq2ab.jpg",
  "4-button smart key|HYQ2EB": "images/4-button-smart-key-hyq2eb.jpg",
  "4-button smart key|HYQ2ES": "images/4-button-smart-key-hyq2es.jpg",
  "3-button smart key|HYQ1AS": "images/3-button-smart-key-hyq1as.jpg",
  "4-button smart key|HYQ1AS": "images/4-button-smart-key-hyq1as.jpg",
  "5-button smart key|HYQ1AS": "images/5-button-smart-key-hyq1as.jpg",
  "3-button remote head key|CWTWB1U545": "images/3-button-remote-head-key-cwtwb1u545.jpg",
  "6-button remote head key|N5F-A04TAA": "images/6-button-remote-head-key-n5f-a04taa.jpg",
  "5-button keyless entry remote|OUCG8D-440H-A": "images/5-button-keyless-entry-remote-oucg8d-440h-a.jpg",
  "6-button keyless entry remote|OUCG8D-399H-A": "images/6-button-keyless-entry-remote-oucg8d-399h-a.jpg",
  "6-button smart key|KR5V2X": "images/6-button-smart-key-kr5v2x.jpg",
  "5-button remote head key|N5F-A04TAA": "images/5-button-remote-head-key-n5f-a04taa.jpg",
  "3-button keyless entry remote|E4EG8DJ": "images/3-button-keyless-entry-remote-e4eg8dj.jpg",
  "5-button smart key|KR5V1X": "images/5-button-smart-key-kr5v1x.jpg",
  "3-button smart key|A2C97488400": "images/3-button-smart-key-a2c97488400.jpg",
  "5-button smart key|ACJ932HK1310A": "images/5-button-smart-key-acj932hk1310a.jpg",
  "3-button keyless entry remote|TQ8-RKE-3F01": "images/3-button-keyless-entry-remote-tq8-rke-3f01.jpg",
  "3-button keyless entry remote|TQ8-RKE-4F14": "images/3-button-keyless-entry-remote-tq8-rke-4f14.jpg",
  "4-button keyless entry remote|OSLOKA-360T": "images/4-button-keyless-entry-remote-osloka-360t.jpg",
  "4-button keyless entry remote|OSLOKA-423T": "images/4-button-keyless-entry-remote-osloka-423t.jpg",
  "emergency key|HY18R": "images/emergency-key-hy18r.jpg",
  "3-button smart key|SY5QXFGE03": "images/3-button-smart-key-sy5qxfge03.jpg",
  "4-button smart key|SY5VISMKFNA04": "images/4-button-smart-key-sy5vismkfna04.jpg",
  "4-button keyless entry remote|PINHA-T008": "images/4-button-keyless-entry-remote-pinha-t008.jpg",
  "4-button keyless entry remote|OSLOKA-310T": "images/4-button-keyless-entry-remote-osloka-310t.jpg",
  "4-button keyless entry remote|NYOSEKS-TF10ATX": "images/4-button-keyless-entry-remote-nyoseks-tf10atx.jpg",
  "4-button smart key|SY5JFFGE04": "images/4-button-smart-key-sy5jffge04.jpg",
  "3-button flip key|TQ8HM-T034": "images/3-button-flip-key-tq8hm-t034.jpg",
  "3-button flip key|TQ8-RKE-3F02": "images/3-button-flip-key-tq8-rke-3f02.jpg",
  "5-button smart key|NYOSYEC5FOB1907": "images/5-button-smart-key-nyosyec5fob1907.jpg",
  "3-button keyless entry remote|PINHA-T036": "images/3-button-keyless-entry-remote-pinha-t036.jpg",
  "7-button smart key|TQ8-FOB-4F61U44": "images/7-button-smart-key-tq8-fob-4f61u44.jpg",
  "emergency key|HY20": "images/emergency-key-hy20.jpg",
  "4-button keyless entry remote|OSLOKA-630T": "images/4-button-keyless-entry-remote-osloka-630t.jpg",
  "3-button keyless entry remote|NYOSEKS-SL10ATX": "images/3-button-keyless-entry-remote-nyoseks-sl10atx.jpg",
  "4-button smart key|HYQ14FLD": "images/4-button-smart-key-hyq14fld.jpg",
  "transponder key|H72": "images/transponder-key-h72.jpg",
  "4-button keyless entry remote|KPU41777": "images/4-button-keyless-entry-remote-kpu41777.jpg",
  "4-button keyless entry remote|KPU41848": "images/4-button-keyless-entry-remote-kpu41848.jpg",
  "transponder key|H74": "images/transponder-key-h74.jpg",
  "4-button smart key|KR5MTXN1": "images/4-button-smart-key-kr5mtxn1.jpg",
  "3-button smart key|CWTWBAU771": "images/3-button-smart-key-cwtwbau771.jpg",
  "4-button smart key|CWTWB1U815": "images/4-button-smart-key-cwtwb1u815.jpg",
  "transponder key|Y173": "images/transponder-key-y173.jpg",
  "transponder key|Y199": "images/transponder-key-y199.jpg",
  "5-button smart key|M3NWXFOB": "images/5-button-smart-key-m3nwxfob.jpg",
  "4-button keyless entry remote|NHVWB1U711": "images/4-button-keyless-entry-remote-nhvwb1u711.jpg",
  "6-button smart key|HYQ14ADR": "images/6-button-smart-key-hyq14adr.jpg",
  "4-button keyless entry remote|HYQ12BAN": "images/4-button-keyless-entry-remote-hyq12ban.jpg",
  "3-button smart key|MOZB21TG": "images/3-button-smart-key-mozb21tg.jpg",
  "4-button remote head key|HYQ12BDC": "images/4-button-remote-head-key-hyq12bdc.jpg",
  "3-button smart key|HYQ14FBW": "images/3-button-smart-key-hyq14fbw.jpg",
  "6-button smart key|HYQ14FBX": "images/6-button-smart-key-hyq14fbx.jpg",
  "4-button smart key|1551A-14FBW": "images/4-button-smart-key-1551a-14fbw.jpg",
  "3-button flip key|HYQ12BFS": "images/3-button-flip-key-hyq12bfs.jpg",
  "4-button flip key|HYQ12BBY": "images/4-button-flip-key-hyq12bby.jpg",
  "5-button smart key|KOBJTF10A": "images/5-button-smart-key-kobjtf10a.jpg",
  "emergency key|HU101": "images/emergency-key-hu101.jpg",
  "4-button flip key|MYT8Z0837231": "images/4-button-flip-key-myt8z0837231.jpg",
  "transponder key|HU66": "images/transponder-key-hu66.jpg",
  "4-button smart key|IYZFBSB802": "images/4-button-smart-key-iyzfbsb802.jpg",
  "3-button remote head key|LX8FZV": "images/3-button-remote-head-key-lx8fzv.jpg",
  "remote head key|LX8FZV": "images/remote-head-key-lx8fzv.jpg",
  "4-button smart key|YGOHUF5662": "images/4-button-smart-key-ygohuf5662.jpg",
  "4-button flip key|NBG92596263": "images/4-button-flip-key-nbg92596263.jpg",
  "emergency key|HU64": "images/emergency-key-hu64.jpg",
  "4-button flip key|NBG010180T": "images/4-button-flip-key-nbg010180t.jpg",
  "4-button smart key|NBGIDGNG1": "images/4-button-smart-key-nbgidgng1.jpg",
  "transponder key|HU64": "images/transponder-key-hu64.jpg",
  "4-button smart key|YGOHUF8423": "images/4-button-smart-key-ygohuf8423.jpg",
  "emergency key|HU92": "images/emergency-key-hu92.jpg",
  "4-button flip key|NBGFS93N": "images/4-button-flip-key-nbgfs93n.jpg",
  "5-button smart key|KR55WK49264": "images/5-button-smart-key-kr55wk49264.jpg",
  "4-button smart key|KR55WK50138": "images/4-button-smart-key-kr55wk50138.jpg",
  "4-button flip key|NBG009272T": "images/4-button-flip-key-nbg009272t.jpg",
  "4-button flip key|NBG8137T": "images/4-button-flip-key-nbg8137t.jpg",
  "4-button smart key|LX8766S": "images/4-button-smart-key-lx8766s.jpg",
  "3-button flip key|IJ0959753F": "images/3-button-flip-key-ij0959753f.jpg",
  "4-button flip key|KR55WK45032": "images/4-button-flip-key-kr55wk45032.jpg",
  "3-button smart key|KR55WK50138": "images/3-button-smart-key-kr55wk50138.jpg",
  "4-button flip key|NBGFS12A01": "images/4-button-flip-key-nbgfs12a01.jpg",
  "5-button smart key|KR5ALFA434": "images/5-button-smart-key-kr5alfa434.jpg",
  "3-button smart key|KR55WK49127": "images/3-button-smart-key-kr55wk49127.jpg",
  "3-button smart key|KR55WK49147": "images/3-button-smart-key-kr55wk49147.jpg",
  "3-button remote head key|LX8F2V": "images/3-button-remote-head-key-lx8f2v.jpg",
  "emergency key|HU162T": "images/emergency-key-hu162t.jpg",
  "transponder key|HU56": "images/transponder-key-hu56.jpg",
  "emergency key|HU92RP": "images/emergency-key-hu92rp.jpg",
  "3-button smart key|NBGIDGNG1": "images/3-button-smart-key-nbgidgng1.jpg",
  "transponder key|HU39": "images/transponder-key-hu39.jpg",
  "3-button flip key|KR55WK45032": "images/3-button-flip-key-kr55wk45032.jpg",
  "4-button smart key|NBG009066T": "images/4-button-smart-key-nbg009066t.jpg",
  "5-button flip key|NBGFS93N": "images/5-button-flip-key-nbgfs93n.jpg"
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

  const photo = photoFor(g);
  return `
    <div class="card${photo ? " hasphoto" : ""}"${hidden ? " hidden data-extra" : ""}>
      ${photo}
      <div class="cardhead">
        <div class="cardtitle">
          <h2>${esc(keyTitle(g.keyType))}</h2>
          ${buttonsLineHtml(g.keyType, buttonsText)}
        </div>
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
