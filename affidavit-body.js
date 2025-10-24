// affidavit-body.js (ES Module)
// Purpose: UI (heading/intro preview, paragraph editor, history, files)

import { LS, loadJSON, saveJSON } from "./constants.js";

/* ---------- DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

/* ---------- Exhibit scheme (letters | numbers) ---------- */
const getExhibitScheme = () => localStorage.getItem(LS.EXHIBIT_SCHEME) || "letters";
const setExhibitScheme = (s) => localStorage.setItem(LS.EXHIBIT_SCHEME, s);
const indexToLetter = (idx) => {
  let n = idx + 1, s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};
const labelFor = (idx, scheme) => scheme === "numbers" ? String(idx + 1) : indexToLetter(idx);

/* ---------- Storage access ---------- */
const loadCase  = () => loadJSON(LS.CASE, {});
const loadOath  = () => loadJSON(LS.OATH, null);
const loadParas = () => loadJSON(LS.PARAS, []);
const saveParas = (list) => saveJSON(LS.PARAS, list);

/* ---------- History (Undo/Redo) ---------- */
const MAX_HISTORY = 50;
let UNDO_STACK = [];
let REDO_STACK = [];

const snapshotParas = () => localStorage.getItem(LS.PARAS) || "[]";
function pushHistory() { UNDO_STACK.push(snapshotParas()); if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift(); REDO_STACK = []; syncUndoRedoButtons(); }
function restoreFrom(serialized) { localStorage.setItem(LS.PARAS, serialized); renderParagraphs(); syncUndoRedoButtons(); }
const canUndo = () => UNDO_STACK.length > 0;
const canRedo = () => REDO_STACK.length > 0;
function undo() { if (!canUndo()) return; const cur = snapshotParas(); const prev = UNDO_STACK.pop(); REDO_STACK.push(cur); restoreFrom(prev); }
function redo() { if (!canRedo()) return; const cur = snapshotParas(); const next = REDO_STACK.pop(); UNDO_STACK.push(cur); restoreFrom(next); }
function syncUndoRedoButtons() { const ub = $("#undoBtn"), rb = $("#redoBtn"); if (!ub || !rb) return; ub.disabled = !canUndo(); rb.disabled = !canRedo(); }

/* ---------- IndexedDB for exhibit PDFs ---------- */
const DB_NAME = "affidavitDB";
const STORE   = "files";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function saveFileBlob(file) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const id = crypto.randomUUID();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, name: file.name, type: file.type, blob: file });
    tx.oncomplete = () => res(id);
    tx.onerror    = () => rej(tx.error);
  });
}
async function getFileBlob(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = () => rej(req.error);
  });
}

/* ---------- Utilities ---------- */
const byNumber = (a, b) => (a.number || 0) - (b.number || 0);

/* ---------- Model helpers ---------- */
const createParagraph = () => ({ id: crypto.randomUUID(), number: 0, text: "", exhibitFileId: null });
function newParagraph() {
  const list = loadParas().sort(byNumber);
  const p = createParagraph(); p.number = list.length + 1;
  return p;
}
function renumber(list) { list.forEach((p, i) => { p.number = i + 1; }); return list; }

/* ---------- Paragraph CRUD & reorder ---------- */
function moveToPosition(id, target1) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const fromIdx = list.findIndex(p => p.id === id);
  if (fromIdx === -1) return;
  const item = list.splice(fromIdx, 1)[0];
  const insertIdx = Math.max(0, Math.min(target1 - 1, list.length));
  list.splice(insertIdx, 0, item);
  saveParas(renumber(list));
}
function addParagraph() { pushHistory(); const list = loadParas().sort(byNumber); list.push(newParagraph()); saveParas(renumber(list)); }
function insertNewAt(target1) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const p = createParagraph();
  const idx = Math.max(0, Math.min(target1 - 1, list.length));
  list.splice(idx, 0, p);
  saveParas(renumber(list));
}
const insertNewBelow = (n) => { pushHistory(); insertNewAt(n + 1); };
function upsertParagraph(patch) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(x => x.id === patch.id);
  if (i === -1) list.push(patch); else list[i] = { ...list[i], ...patch };
  saveParas(renumber(list));
}
function removeParagraph(id) { pushHistory(); const list = loadParas().filter(p => p.id !== id).sort(byNumber); saveParas(renumber(list)); }

/* ---------- Exhibit labels (on-screen pills) ---------- */
function computeExhibitLabels(paras) {
  const scheme = getExhibitScheme();
  const map = new Map(); let idx = 0;
  paras.filter(p => !!p.exhibitFileId).forEach(p => { if (!map.has(p.id)) { map.set(p.id, labelFor(idx, scheme)); idx++; } });
  return map;
}

/* ---------- General Heading helpers (preview only) ---------- */
function partyDisplayName(p) { if (!p) return ""; const company = (p.company || "").trim(); const person = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim(); return company || person || ""; }
const collectNames = (list) => (Array.isArray(list) ? list : []).map(partyDisplayName).map(s => s.trim()).filter(Boolean);
function listWithEtAl(names, limit = 3) { return names.length <= limit ? names.join(", ") : names.slice(0, limit).join(", ") + ", et al."; }
function roleLabelFor(side, count, isMotion, movingSide) {
  const isPlaintiff = side === "plaintiff";
  const base = isPlaintiff ? (count > 1 ? "Plaintiffs" : "Plaintiff") : (count > 1 ? "Defendants" : "Defendant");
  if (!isMotion) return base;
  const isMovingThisSide = movingSide === (isPlaintiff ? "plaintiff" : "defendant");
  const suffix = isMovingThisSide ? (count > 1 ? "/Moving Parties" : "/Moving Party") : (count > 1 ? "/Responding Parties" : "/Responding Party");
  return base + suffix;
}
function formatCourtFile(cf = {}) { const parts = [cf.year, cf.assign, cf.suffix].map(v => (v || "").toString().trim()).filter(Boolean); return parts.length ? ("CV-" + parts.join("-")) : ""; }
function buildGeneralHeading(caseData = {}) {
  const courtName = (caseData.courtName || "ONTARIO SUPERIOR COURT OF JUSTICE").trim();
  const fileNo    = formatCourtFile(caseData.courtFile || {});
  const plRaw = collectNames(caseData.plaintiffs || []);
  const dfRaw = collectNames(caseData.defendants || []);
  const pl = plRaw.length ? listWithEtAl(plRaw, 3) : "[Add plaintiffs in the General Heading form]";
  const df = dfRaw.length ? listWithEtAl(dfRaw, 3) : "[Add defendants in the General Heading form]";
  const isMotion = !!(caseData.motion && caseData.motion.isMotion);
  const movingSide = caseData.motion ? caseData.motion.movingSide : null;
  const plRole = roleLabelFor("plaintiff", plRaw.length || 1, isMotion, movingSide);
  const dfRole = roleLabelFor("defendant", dfRaw.length || 1, isMotion, movingSide);
  return { l1: fileNo ? `Court File No. ${fileNo}` : "Court File No.", l2: courtName, l3: "BETWEEN:", l4: pl, l5: plRole, l6: "-AND-", l7: df, l8: dfRole };
}

/* ---------- Render heading & intro ---------- */
function renderHeading() {
  const c  = loadCase();
  const gh = buildGeneralHeading(c);
  const container = $("#heading"); if (!container) return;
  container.innerHTML = `
    <div class="gh">
      <div class="gh-line gh-file-no">${gh.l1}</div>
      <div class="gh-line gh-court">${gh.l2}</div>
      <div class="gh-line gh-between">${gh.l3}</div>
      <div class="gh-line gh-parties gh-plaintiffs">${gh.l4}</div>
      <div class="gh-line gh-role gh-pl-role">${gh.l5}</div>
      <div class="gh-line gh-and">${gh.l6}</div>
      <div class="gh-line gh-parties gh-defendants">${gh.l7}</div>
      <div class="gh-line gh-role gh-def-role">${gh.l8}</div>
    </div>`;
}
function renderIntro() {
  const c = loadCase(); const d = c.deponent || {}; const oath = (loadOath() || "").toLowerCase();
  const nameOf = (person) => [person?.first, person?.last].filter(Boolean).join(" ").trim();
  const roleLower = (d.role || "").toLowerCase();
  let fullName = nameOf(d);
  if (!fullName) {
    if (roleLower === "plaintiff" && Array.isArray(c.plaintiffs) && c.plaintiffs[0]) fullName = nameOf(c.plaintiffs[0]);
    if (roleLower === "defendant" && Array.isArray(c.defendants) && c.defendants[0]) fullName = nameOf(c.defendants[0]);
  }
  const cityPart = d.city ? `of the City of ${d.city}` : "";
  const provincePart = d.prov ? `in the Province of ${d.prov}` : "";
  let capacityPhrase = "";
  switch (roleLower) {
    case "plaintiff":
    case "defendant": capacityPhrase = `the ${roleLower}`; break;
    case "lawyer":    capacityPhrase = "the lawyer for a party"; break;
    case "officer":
    case "employee": {
      const side = d.roleSide === "plaintiff" ? "plaintiff" : (d.roleSide === "defendant" ? "defendant" : null);
      const list = side === "plaintiff" ? (c.plaintiffs || []) : (c.defendants || []);
      const party = Number.isInteger(d.rolePartyIndex) ? (list[d.rolePartyIndex] || null) : null;
      const companyName = party ? partyDisplayName(party) : "";
      capacityPhrase = companyName
        ? (d.roleDetail ? `the ${d.roleDetail} of ${companyName}${side ? (side === "plaintiff" ? ", the plaintiff" : ", the defendant") : ""}` : `an ${roleLower} of ${companyName}`)
        : (d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${roleLower} of a party`);
      break;
    }
    default: capacityPhrase = d.role ? `the ${d.role}` : "";
  }
  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const parts = [fullName ? `I, <strong>${fullName}</strong>` : "I,", cityPart, provincePart, capacityPhrase || null].filter(Boolean);
  const intro = $("#intro"); if (!intro) return;
  intro.innerHTML = `<h2>Affidavit of ${fullName || ""}</h2><p class="mt-12">${parts.join(", ")}, ${oathText}</p>`;
}

/* ---------- Paragraph list UI ---------- */
const paraList = $("#paraList");
function renderParagraphs() {
  const list = loadParas().sort(byNumber);
  const labels = computeExhibitLabels(list);
  paraList.innerHTML = "";
  list.forEach(p => paraList.appendChild(renderRow(p, list.length, labels)));
}
function renderRow(p, totalCount, labels) {
  const row = el("div", { className: "row" });
  const lbl = labels.get(p.id);
  const labelText = p.exhibitFileId ? (lbl ? `Exhibit ${lbl}` : "Exhibit") : "No exhibit";
  row.innerHTML = `
    <div class="row-num">
      <div class="para-num-row">
        <label class="no-inline"> Para No. <span class="pill"># ${p.number}</span></label>
        <div class="move-controls">
          <label for="move-${p.id}">Move to Para No.:</label>
          <div class="num-controls">
            <input type="number" id="move-${p.id}" class="num" min="1" max="${totalCount}" step="1" value="${p.number}">
            <button type="button" class="applyReorder">Apply</button>
          </div>
        </div>
        <button type="button" class="del">Remove paragraph</button>
        <button type="button" class="insBelow">Insert new paragraph below</button>
      </div>
    </div>
    <div class="row-text">
      <label>Paragraph text</label>
      <textarea class="txt" placeholder="Type the paragraph…">${p.text || ""}</textarea>
      <div>
        <span class="pill">${labelText}</span>
        <span class="fileName ml-6"></span>
      </div>
    </div>
    <div class="row-file">
      <label>Attach PDF (optional)</label>
      <input type="file" class="file" accept="application/pdf">
    </div>`;
  const num = $(".num", row);
  const txt = $(".txt", row);
  const file = $(".file", row);
  const del = $(".del", row);
  const insBelow = $(".insBelow", row);
  const name = $(".fileName", row);
  const applyReorder = $(".applyReorder", row);
  const desiredNumber = () => { let n = Math.round(Number(num.value)); if (!Number.isFinite(n) || n < 1) n = 1; if (n > totalCount) n = totalCount; return n; };
  const syncButtonState = () => { applyReorder.disabled = (desiredNumber() === p.number); };
  syncButtonState(); num.addEventListener("input", syncButtonState);
  applyReorder.onclick = () => { const n = desiredNumber(); if (n !== p.number) { moveToPosition(p.id, n); renderParagraphs(); } };
  del.onclick = () => { if (confirm("Remove this paragraph?")) { removeParagraph(p.id); renderParagraphs(); } };
  insBelow.onclick = () => { insertNewBelow(p.number); renderParagraphs(); };
  txt.oninput = () => { upsertParagraph({ id: p.id, text: txt.value }); };
  file.onchange = async () => {
    const f = file.files?.[0]; if (!f) return;
    if (f.type !== "application/pdf") { alert("Please attach a PDF."); file.value = ""; return; }
    const fileId = await saveFileBlob(f);
    upsertParagraph({ id: p.id, exhibitFileId: fileId });
    renderParagraphs();
  };
  (async () => { if (p.exhibitFileId) { const rec = await getFileBlob(p.exhibitFileId); if (rec) name.textContent = `• ${rec.name}`; } })();
  return row;
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const backBtn = $("#back"); if (backBtn) backBtn.onclick = () => history.back();

  // Toggle for exhibit scheme
  const toggle = document.getElementById("schemeToggle");
  const textEl = document.getElementById("schemeText");
  if (toggle) {
    const current = getExhibitScheme();
    toggle.checked = (current === "numbers");
    if (textEl) textEl.textContent = toggle.checked ? "Numbers" : "Letters";
    toggle.addEventListener("change", () => {
      const newScheme = toggle.checked ? "numbers" : "letters";
      setExhibitScheme(newScheme);
      if (textEl) textEl.textContent = toggle.checked ? "Numbers" : "Letters";
      renderParagraphs();
    });
  }

  const undoBtn = $("#undoBtn"), redoBtn = $("#redoBtn");
  if (undoBtn) undoBtn.onclick = () => undo();
  if (redoBtn) redoBtn.onclick = () => redo();

  renderHeading();
  renderIntro();

  if (loadParas().length === 0) addParagraph();
  renderParagraphs();

  const addBtn = $("#addParaEnd");
  if (addBtn) addBtn.onclick = () => { addParagraph(); renderParagraphs(); };

  if (UNDO_STACK.length === 0) UNDO_STACK.push(snapshotParas());
  syncUndoRedoButtons();
});
