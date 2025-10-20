/* affidavit-body.js — UI (heading/intro preview, paragraph editor, history, files)
   NOTE: All export logic has been moved to affidavit-export.js
*/

/* ---------- DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

/* ---------- Storage keys ---------- */
const LS_CASE_KEY   = "jf_case";
const LS_OATH_KEY   = "jf_oathType";
const LS_PARAS_KEY  = "jf_paragraphs";

/* ---------- History (Undo/Redo) ---------- */
const MAX_HISTORY = 50;
let UNDO_STACK = [];
let REDO_STACK = [];

function snapshotParas() {
  return localStorage.getItem(LS_PARAS_KEY) || "[]";
}
function pushHistory() {
  UNDO_STACK.push(snapshotParas());
  if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift();
  REDO_STACK = [];
  syncUndoRedoButtons();
}
function restoreFrom(serialized) {
  localStorage.setItem(LS_PARAS_KEY, serialized);
  renderParagraphs();
  syncUndoRedoButtons();
}
function canUndo() { return UNDO_STACK.length > 0; }
function canRedo() { return REDO_STACK.length > 0; }
function undo() {
  if (!canUndo()) return;
  const cur = snapshotParas();
  const prev = UNDO_STACK.pop();
  REDO_STACK.push(cur);
  restoreFrom(prev);
}
function redo() {
  if (!canRedo()) return;
  const cur = snapshotParas();
  const next = REDO_STACK.pop();
  UNDO_STACK.push(cur);
  restoreFrom(next);
}
function syncUndoRedoButtons() {
  const ub = $("#undoBtn"), rb = $("#redoBtn");
  if (!ub || !rb) return;
  ub.disabled = !canUndo();
  rb.disabled = !canRedo();
}

/* ---------- IndexedDB for exhibit PDFs ---------- */
const DB_NAME = "affidavitDB";
const STORE   = "files";

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
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

/* ---------- Load/save ---------- */
function loadCase() {
  try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}"); }
  catch { return {}; }
}
function loadOath() {
  try { return JSON.parse(localStorage.getItem(LS_OATH_KEY) || "null"); }
  catch { return null; }
}
function loadParas() {
  try { return JSON.parse(localStorage.getItem(LS_PARAS_KEY) || "[]"); }
  catch { return []; }
}
function saveParas(list) {
  localStorage.setItem(LS_PARAS_KEY, JSON.stringify(list));
}

/* ---------- Utilities ---------- */
function alpha(n) {
  // 1 -> A, 26 -> Z, 27 -> AA
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
function byNumber(a, b) {
  return (a.number || 0) - (b.number || 0);
}

/* ---------- Model helpers ---------- */
function createParagraph() {
  return { id: crypto.randomUUID(), number: 0, text: "", exhibitFileId: null };
}
function newParagraph() {
  const list = loadParas().sort(byNumber);
  const p = createParagraph();
  p.number = list.length + 1;
  return p;
}
function renumber(list) {
  list.forEach((p, i) => { p.number = i + 1; });
  return list;
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
function addParagraph() {
  pushHistory();
  const list = loadParas().sort(byNumber);
  list.push(newParagraph());
  saveParas(renumber(list));
}
function insertNewAt(target1) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const p = createParagraph();
  const idx = Math.max(0, Math.min(target1 - 1, list.length));
  list.splice(idx, 0, p);
  saveParas(renumber(list));
}
function insertNewBelow(number1) {
  pushHistory();
  insertNewAt(number1 + 1);
}
function upsertParagraph(patch) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(x => x.id === patch.id);
  if (i === -1) list.push(patch);
  else list[i] = { ...list[i], ...patch };
  saveParas(renumber(list));
}
function removeParagraph(id) {
  pushHistory();
  const list = loadParas().filter(p => p.id !== id).sort(byNumber);
  saveParas(renumber(list));
}

/* ---------- Exhibit labels (for on-screen pills only) ---------- */
function computeExhibitLabels(paras) {
  const map = new Map();
  let idx = 1;
  paras.filter(p => !!p.exhibitFileId).forEach(p => {
    map.set(p.id, alpha(idx));
    idx++;
  });
  return map;
}

/* ============================================================================
   GENERAL HEADING HELPERS (used for preview only; export has its own copy)
   ============================================================================ */
function partyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person  = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}
function collectNames(list) {
  return (Array.isArray(list) ? list : [])
    .map(partyDisplayName)
    .map(s => s.trim())
    .filter(Boolean);
}
function listWithEtAl(names, limit = 3) {
  if (names.length <= limit) return names.join(", ");
  return names.slice(0, limit).join(", ") + ", et al.";
}
function roleLabelFor(side, count, isMotion, movingSide) {
  const isPlaintiff = side === "plaintiff";
  const base = isPlaintiff
    ? (count > 1 ? "Plaintiffs" : "Plaintiff")
    : (count > 1 ? "Defendants" : "Defendant");
  if (!isMotion) return base;
  const isMovingThisSide = movingSide === (isPlaintiff ? "plaintiff" : "defendant");
  const suffix = isMovingThisSide
    ? (count > 1 ? "/Moving Parties" : "/Moving Party")
    : (count > 1 ? "/Responding Parties" : "/Responding Party");
  return base + suffix;
}
function formatCourtFile(cf = {}) {
  const parts = [cf.year, cf.assign, cf.suffix].map(v => (v || "").toString().trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return "CV-" + parts.join("-");
}
function buildGeneralHeading(caseData = {}) {
  const courtName = (caseData.courtName || "ONTARIO SUPERIOR COURT OF JUSTICE").trim();
  const fileNo    = formatCourtFile(caseData.courtFile || {});
  const plNamesRaw = collectNames(caseData.plaintiffs || []);
  const dfNamesRaw = collectNames(caseData.defendants || []);
  const plNames = plNamesRaw.length
    ? listWithEtAl(plNamesRaw, 3)
    : "[Add plaintiffs in the General Heading form]";
  const dfNames = dfNamesRaw.length
    ? listWithEtAl(dfNamesRaw, 3)
    : "[Add defendants in the General Heading form]";
  const isMotion   = !!(caseData.motion && caseData.motion.isMotion);
  const movingSide = caseData.motion ? caseData.motion.movingSide : null;
  const plRole = roleLabelFor("plaintiff", plNamesRaw.length || 1, isMotion, movingSide);
  const dfRole = roleLabelFor("defendant", dfNamesRaw.length || 1, isMotion, movingSide);
  return {
    l1: fileNo ? `Court File No. ${fileNo}` : "Court File No.",
    l2: courtName,
    l3: "BETWEEN:",
    l4: plNames,
    l5: plRole,
    l6: "-AND-",
    l7: dfNames,
    l8: dfRole
  };
}

/* ---------- Render heading (preview) ---------- */
function renderHeading() {
  const c  = loadCase();
  const gh = buildGeneralHeading(c);
  const container = $("#heading");
  if (!container) return;
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
    </div>
  `;
}

/* ---------- Render intro (preview) ---------- */
function renderIntro() {
  const c = loadCase();
  const d = c.deponent || {};
  const oath = (loadOath() || "").toLowerCase();

  const nameOf = (person) => [person?.first, person?.last].filter(Boolean).join(" ").trim();
  const roleLower = (d.role || "").toLowerCase();

  let fullName = nameOf(d);
  if (!fullName) {
    if (roleLower === "plaintiff" && Array.isArray(c.plaintiffs) && c.plaintiffs[0]) fullName = nameOf(c.plaintiffs[0]);
    if (roleLower === "defendant" && Array.isArray(c.defendants) && c.defendants[0]) fullName = nameOf(c.defendants[0]);
  }

  const cityPart     = d.city ? `of the City of ${d.city}` : "";
  const provincePart = d.prov ? `in the Province of ${d.prov}` : "";
  let capacityPhrase = "";

  switch (roleLower) {
    case "plaintiff":
    case "defendant":
      capacityPhrase = `the ${roleLower}`;
      break;

    case "lawyer": {
      const side = d.lawyerSide === "plaintiff" ? "plaintiff"
                 : d.lawyerSide === "defendant" ? "defendant" : null;
      let companyName = "";
      if (side && Number.isInteger(d.lawyerPartyIndex)) {
        const list = side === "plaintiff" ? (c.plaintiffs || []) : (c.defendants || []);
        const party = list[d.lawyerPartyIndex] || null;
        companyName = partyDisplayName(party);
      }
      if (companyName) {
        const postfix = side ? (side === "plaintiff" ? ", the plaintiff" : ", the defendant") : "";
        if (postfix && !companyName.endsWith(postfix)) companyName += postfix;
        capacityPhrase = `the lawyer for ${companyName}`;
      } else {
        capacityPhrase = "the lawyer for a party";
      }
      break;
    }

    case "officer":
    case "employee": {
      const side = d.roleSide === "plaintiff" ? "plaintiff"
                 : d.roleSide === "defendant" ? "defendant" : null;
      let companyName = "";
      if (side && Number.isInteger(d.rolePartyIndex)) {
        const list = side === "plaintiff" ? (c.plaintiffs || []) : (c.defendants || []);
        const party = list[d.rolePartyIndex] || null;
        companyName = partyDisplayName(party);
      }
      if (companyName) {
        const postfix = side ? (side === "plaintiff" ? ", the plaintiff" : ", the defendant") : "";
        if (companyName && !companyName.endsWith(postfix)) companyName += postfix;
        capacityPhrase = d.roleDetail
          ? `the ${d.roleDetail} of ${companyName}`
          : `an ${roleLower} of ${companyName}`;
      } else {
        capacityPhrase = d.roleDetail
          ? `the ${d.roleDetail} of a party`
          : `an ${roleLower} of a party`;
      }
      break;
    }

    default:
      capacityPhrase = d.role ? `the ${d.role}` : "";
  }

  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const parts = [fullName ? `I, <strong>${fullName}</strong>` : "I,", cityPart, provincePart, capacityPhrase || null]
    .filter(Boolean);

  const intro = $("#intro");
  if (!intro) return;
  intro.innerHTML = `
    <h2>Affidavit of ${fullName || ""}</h2>
    <p class="mt-12">${parts.join(", ")}, ${oathText}</p>
  `;
}

/* ---------- Paragraph list UI ---------- */
const paraList = $("#paraList");

function renderParagraphs() {
  const list = loadParas().sort(byNumber);
  const labels = computeExhibitLabels(list); // letters on-screen
  paraList.innerHTML = "";
  list.forEach(p => paraList.appendChild(renderRow(p, list.length, labels)));
}

function renderRow(p, totalCount, labels) {
  const row = el("div", { className: "row" });
  const labelText = p.exhibitFileId
    ? (labels.get(p.id) ? `Exhibit ${labels.get(p.id)}` : "Exhibit")
    : "No exhibit";

  // UPDATED: static number badge + clearly labeled move control
  row.innerHTML = `
    <div class="row-num">
      <div class="para-num-row">
        <!-- Inline No. + current number -->
        <label class="no-inline"> Para No. <span class="pill"># ${p.number}</span></label>

        <!-- Move control on one line with compact input -->
        <div class="move-controls">
          <label for="move-${p.id}">Move to Para No.:</label>
          <div class="num-controls">
            <input
              type="number"
              id="move-${p.id}"
              class="num"
              min="1"
              max="${totalCount}"
              step="1"
              value="${p.number}"
            >
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
    </div>
  `;


  // DOM refs (unchanged)
  const num = $(".num", row);
  const txt = $(".txt", row);
  const file = $(".file", row);
  const del = $(".del", row);
  const insBelow = $(".insBelow", row);
  const name = $(".fileName", row);
  const applyReorder = $(".applyReorder", row);

  // Helpers (unchanged)
  const desiredNumber = () => {
    let n = Math.round(Number(num.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > totalCount) n = totalCount;
    return n;
  };

  const syncButtonState = () => {
    applyReorder.disabled = (desiredNumber() === p.number);
  };
  syncButtonState();
  num.addEventListener("input", syncButtonState);

  // Actions (unchanged)
  applyReorder.onclick = () => {
    const n = desiredNumber();
    if (n !== p.number) {
      moveToPosition(p.id, n);
      renderParagraphs();
    }
  };

  del.onclick = () => {
    if (confirm("Remove this paragraph?")) {
      removeParagraph(p.id);
      renderParagraphs();
    }
  };

  insBelow.onclick = () => {
    insertNewBelow(p.number);
    renderParagraphs();
  };

  txt.oninput = () => {
    upsertParagraph({ id: p.id, text: txt.value });
  };

  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      alert("Please attach a PDF.");
      file.value = "";
      return;
    }
    const fileId = await saveFileBlob(f);
    upsertParagraph({ id: p.id, exhibitFileId: fileId });
    renderParagraphs();
  };

  (async () => {
    if (p.exhibitFileId) {
      const rec = await getFileBlob(p.exhibitFileId);
      if (rec) name.textContent = `• ${rec.name}`;
    }
  })();

  return row;
}

/* ---------- Init (no export wiring here) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Back
  $("#back").onclick = () => history.back();

  // Undo/Redo
  const undoBtn = $("#undoBtn"), redoBtn = $("#redoBtn");
  if (undoBtn) undoBtn.onclick = () => undo();
  if (redoBtn) redoBtn.onclick = () => redo();

  // Render heading + intro previews
  renderHeading();
  renderIntro();

  // Ensure at least one paragraph exists
  if (loadParas().length === 0) {
    addParagraph();
  }
  renderParagraphs();

  // Add / Insert controls
  $("#addParaEnd").onclick = () => {
    addParagraph();
    renderParagraphs();
  };


  // History baseline + button states
  if (UNDO_STACK.length === 0) UNDO_STACK.push(snapshotParas());
  syncUndoRedoButtons();
});
