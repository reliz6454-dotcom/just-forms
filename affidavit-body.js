// affidavit-body.js (ES Module) — MULTI-EXHIBIT + SAFE DOM HELPER
// Purpose: UI (heading/intro preview, paragraph editor, history, files)

import { LS, loadJSON, saveJSON } from "./constants.js";

/* ---------- DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);

/** Safe element creator:
 * - assigns plain props via Object.assign
 * - assigns dataset keys via element.dataset[k] = v (no throwing)
 * - optional children: el('div', {..}, child1, child2)
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props) {
    const { dataset, ...rest } = props;
    if (rest && Object.keys(rest).length) Object.assign(node, rest);
    if (dataset) {
      for (const [k, v] of Object.entries(dataset)) {
        try { node.dataset[k] = v; } catch { /* ignore */ }
      }
    }
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(c);
  }
  return node;
}

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
const createParagraph = () => ({ id: crypto.randomUUID(), number: 0, text: "", exhibits: [] });
function newParagraph() {
  const list = loadParas().sort(byNumber);
  const p = createParagraph(); p.number = list.length + 1;
  return p;
}
function renumber(list) { list.forEach((p, i) => { p.number = i + 1; }); return list; }

/* ---------- One-time migration: exhibitFileId -> exhibits[] ---------- */
async function migrateParasIfNeeded() {
  let changed = false;
  const list = loadParas();
  for (const p of list) {
    if (p && p.exhibitFileId && !Array.isArray(p.exhibits)) {
      let name = "Exhibit.pdf";
      try {
        const rec = await getFileBlob(p.exhibitFileId);
        if (rec?.name) name = rec.name;
      } catch {}
      p.exhibits = [{ id: crypto.randomUUID(), fileId: p.exhibitFileId, name }];
      delete p.exhibitFileId;
      changed = true;
    } else if (p && !Array.isArray(p.exhibits)) {
      p.exhibits = []; // ensure array exists going forward
      changed = true;
    }
  }
  if (changed) saveParas(list);
}

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

/* ---------- Exhibit mutations (multi-exhibit) ---------- */
function addExhibits(pId, entries) {
  // entries: [{fileId, name}, ...]
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  list[i].exhibits = list[i].exhibits || [];
  for (const e of entries) {
    list[i].exhibits.push({ id: crypto.randomUUID(), fileId: e.fileId, name: e.name || "Exhibit.pdf" });
  }
  saveParas(renumber(list));
}
function moveExhibit(pId, exId, dir) {
  // dir: -1 left, +1 right
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  const exs = list[i].exhibits || [];
  const idx = exs.findIndex(x => x.id === exId);
  if (idx === -1) return;
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= exs.length) { syncUndoRedoButtons(); return; }
  [exs[idx], exs[swapWith]] = [exs[swapWith], exs[idx]];
  saveParas(renumber(list));
}
function removeExhibit(pId, exId) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  list[i].exhibits = (list[i].exhibits || []).filter(x => x.id !== exId);
  saveParas(renumber(list));
}

/* ---------- Exhibit labels (global across all exhibits) ---------- */
function computeExhibitLabels(paras) {
  const scheme = getExhibitScheme();
  const map = new Map(); // exhibitId -> label
  let idx = 0;
  paras.sort(byNumber).forEach(p => {
    (p.exhibits || []).forEach(ex => {
      map.set(ex.id, labelFor(idx, scheme));
      idx++;
    });
  });
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

  // Build exhibits summary for the pill under the textarea
  const exCount = (p.exhibits || []).length;
  let pillText = "No exhibits";
  if (exCount === 1) {
    const only = p.exhibits[0];
    const lab = labels.get(only.id);
    pillText = `Exhibit ${lab || ""}`.trim();
  } else if (exCount > 1) {
    const labs = p.exhibits.map(ex => labels.get(ex.id)).filter(Boolean).join(", ");
    pillText = `Exhibits ${labs}`;
  }

  row.innerHTML = `
    <div class="row-num">
      <div class="para-num-row">
        <label class="no-inline"> Paragraph No. <span class="pill"># ${p.number}</span></label>
        <div class="move-controls">
          <label for="move-${p.id}">Move to Paragraph No.:</label>
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
        <span class="pill">${pillText}</span>
      </div>

      <!-- Exhibit strip -->
      <div class="exhibit-strip">
        <!-- chips injected here -->
        <button type="button" class="addExhibitsBtn">+ Add exhibit(s)</button>
        <input type="file" class="fileMulti" accept="application/pdf" multiple hidden>
      </div>
    </div>

    <!-- Right column currently unused (kept for layout compatibility) -->
    <div class="row-file"></div>
  `;

  // Controls
  const num = $(".num", row);
  const txt = $(".txt", row);
  const del = $(".del", row);
  const insBelow = $(".insBelow", row);
  const applyReorder = $(".applyReorder", row);
  const exStrip = $(".exhibit-strip", row);
  const addBtn = $(".addExhibitsBtn", row);
  const fileMulti = $(".fileMulti", row);

  // Move paragraph
  const desiredNumber = () => {
    let n = Math.round(Number(num.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > totalCount) n = totalCount;
    return n;
  };
  const syncButtonState = () => { applyReorder.disabled = (desiredNumber() === p.number); };
  syncButtonState(); num.addEventListener("input", syncButtonState);
  applyReorder.onclick = () => { const n = desiredNumber(); if (n !== p.number) { moveToPosition(p.id, n); renderParagraphs(); } };

  // Paragraph text
  txt.oninput = () => { upsertParagraph({ id: p.id, text: txt.value }); };

  // Paragraph actions
  del.onclick = () => { if (confirm("Remove this paragraph?")) { removeParagraph(p.id); renderParagraphs(); } };
  insBelow.onclick = () => { insertNewBelow(p.number); renderParagraphs(); };

  // Render exhibit chips
  function renderExhibitChips() {
    // Remove any existing chips (keep the add button + hidden input at the end)
    [...exStrip.querySelectorAll(".exhibit-chip")].forEach(n => n.remove());

    (p.exhibits || []).forEach((ex, idx) => {
      const lab = labels.get(ex.id) || "";
      const chip = el("div", { className: "exhibit-chip", dataset: { exId: ex.id } });

      const labelSpan = el("span", { className: "pill exhibit-label", innerText: `Exhibit ${lab}` });
      const nameSpan  = el("span", { className: "exhibit-name", innerText: `• ${ex.name || "Exhibit.pdf"}` });

      const actions = el("div", { className: "exhibit-actions" });
      const leftBtn  = el("button", { type: "button", className: "ex-left",  innerText: "←", title: "Move exhibit left" });
      const rightBtn = el("button", { type: "button", className: "ex-right", innerText: "→", title: "Move exhibit right" });
      const xBtn     = el("button", { type: "button", className: "ex-remove", innerText: "✕", title: "Remove exhibit" });

      // Disable when at bounds
      if (idx === 0) leftBtn.disabled = true;
      if (idx === (p.exhibits.length - 1)) rightBtn.disabled = true;

      leftBtn.onclick  = () => { moveExhibit(p.id, ex.id, -1); renderParagraphs(); };
      rightBtn.onclick = () => { moveExhibit(p.id, ex.id, +1); renderParagraphs(); };
      xBtn.onclick     = () => { if (confirm("Remove this exhibit?")) { removeExhibit(p.id, ex.id); renderParagraphs(); } };

      actions.append(leftBtn, rightBtn, xBtn);
      chip.append(labelSpan, nameSpan, actions);

      // Insert before the add button
      exStrip.insertBefore(chip, addBtn);
    });
  }

  renderExhibitChips();

  // Add exhibits (multiple)
  addBtn.onclick = () => fileMulti.click();
  fileMulti.onchange = async () => {
    const files = Array.from(fileMulti.files || []);
    if (!files.length) return;

    // Validate all are PDFs
    const invalid = files.find(f => f.type !== "application/pdf");
    if (invalid) { alert("Please attach PDF files only."); fileMulti.value = ""; return; }

    try {
      const entries = [];
      for (const f of files) {
        const fileId = await saveFileBlob(f);
        entries.push({ fileId, name: f.name });
      }
      addExhibits(p.id, entries);
      renderParagraphs();
    } catch (e) {
      console.error("Exhibit save failed:", e);
      alert("Could not save one of the selected files. Please try again.");
    }

    // Reset the input so the same file can be chosen again if desired
    fileMulti.value = "";
  };

  return row;
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
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

  // One-time migration from single exhibit to multi
  await migrateParasIfNeeded();

  renderHeading();
  renderIntro();

  if (loadParas().length === 0) addParagraph();
  renderParagraphs();

  const addBtn = $("#addParaEnd");
  if (addBtn) addBtn.onclick = () => { addParagraph(); renderParagraphs(); };

  if (UNDO_STACK.length === 0) UNDO_STACK.push(snapshotParas());
  syncUndoRedoButtons();
});
