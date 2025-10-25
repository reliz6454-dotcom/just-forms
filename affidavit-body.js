// affidavit-body.js (ES Module) — INLINE EXHIBIT CHIPS (non-deletable) + MULTI-EXHIBIT
// Purpose: UI (heading/intro preview, paragraph editor with inline chips, history, files)

import { LS, loadJSON, saveJSON } from "./constants.js";

/* ---------- DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);

/** Safe element creator */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props) {
    const { dataset, ...rest } = props;
    if (rest && Object.keys(rest).length) Object.assign(node, rest);
    if (dataset) for (const [k, v] of Object.entries(dataset)) { try { node.dataset[k] = v; } catch {} }
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/* ---------- Exhibit scheme (letters | numbers) ---------- */
const getExhibitScheme = () => localStorage.getItem(LS.EXHIBIT_SCHEME) || "letters";
const setExhibitScheme = (s) => localStorage.setItem(LS.EXHIBIT_SCHEME, s);
const indexToLetter = (idx) => { let n = idx + 1, s = ""; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
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
const createParagraph = () => ({ id: crypto.randomUUID(), number: 0, text: "", exhibits: [], runs: [{ type: "text", text: "" }] });
function newParagraph() {
  const list = loadParas().sort(byNumber);
  const p = createParagraph(); p.number = list.length + 1;
  return p;
}
function renumber(list) { list.forEach((p, i) => { p.number = i + 1; }); return list; }

/** Ensure p.runs exists (migrate from legacy text/exhibits) */
function ensureRuns(p) {
  if (!p) return p;
  if (Array.isArray(p.runs)) return p;
  const baseText = (p.text || "");
  const textRun = { type: "text", text: baseText };
  const exRuns  = Array.isArray(p.exhibits) ? p.exhibits.map(ex => ({ type: "exhibit", exId: ex.id })) : [];
  p.runs = [textRun, ...exRuns];
  return p;
}

/* ---------- One-time migration: exhibitFileId -> exhibits[] and add runs[] ---------- */
async function migrateParasIfNeeded() {
  let changed = false;
  const list = loadParas();
  for (const p of list) {
    // Old single-exhibit key → exhibits[]
    if (p && p.exhibitFileId && !Array.isArray(p.exhibits)) {
      let name = "Exhibit.pdf";
      try { const rec = await getFileBlob(p.exhibitFileId); if (rec?.name) name = rec.name; } catch {}
      p.exhibits = [{ id: crypto.randomUUID(), fileId: p.exhibitFileId, name }];
      delete p.exhibitFileId;
      changed = true;
    } else if (p && !Array.isArray(p.exhibits)) {
      p.exhibits = [];
      changed = true;
    }
    // Ensure runs[]
    const before = JSON.stringify(p.runs || null);
    ensureRuns(p);
    if (JSON.stringify(p.runs || null) !== before) changed = true;
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
  // entries: [{fileId, name}] ; we also insert inline chips at end
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  const p = ensureRuns(list[i]);
  p.exhibits = p.exhibits || [];
  const newExIds = [];
  for (const e of entries) {
    const exId = crypto.randomUUID();
    p.exhibits.push({ id: exId, fileId: e.fileId, name: e.name || "Exhibit.pdf" });
    newExIds.push(exId);
  }
  // Insert chips at end (simple, robust). Caret mapping can be added later.
  for (const exId of newExIds) p.runs.push({ type: "exhibit", exId });

  saveParas(renumber(list));
}

function moveExhibit(pId, exId, dir) {
  // dir: -1 left, +1 right
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  const p = ensureRuns(list[i]);
  const exs = p.exhibits || [];
  const idx = exs.findIndex(x => x.id === exId);
  if (idx === -1) { saveParas(renumber(list)); return; }
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= exs.length) { saveParas(renumber(list)); return; }
  [exs[idx], exs[swapWith]] = [exs[swapWith], exs[idx]];

  // Also move the FIRST occurrence of that exhibit chip relative to nearest exhibit chip in the same direction
  const rIdx = p.runs.findIndex(r => r.type === "exhibit" && r.exId === exId);
  if (rIdx !== -1) {
    // find neighbor exhibit run in the chosen direction
    let j = rIdx + dir;
    while (j >= 0 && j < p.runs.length && p.runs[j].type !== "exhibit") j += dir;
    if (j >= 0 && j < p.runs.length && p.runs[j].type === "exhibit") {
      [p.runs[rIdx], p.runs[j]] = [p.runs[j], p.runs[rIdx]];
    }
  }

  saveParas(renumber(list));
}

function removeExhibit(pId, exId) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  const p = ensureRuns(list[i]);
  p.exhibits = (p.exhibits || []).filter(x => x.id !== exId);
  p.runs = (p.runs || []).filter(r => !(r.type === "exhibit" && r.exId === exId));
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

/* ---------- Inline editor (chips) ---------- */

/** Build a contenteditable editor DOM from runs[] */
function renderEditorFromRuns(p, labels) {
  ensureRuns(p);
  const editor = el("div", { className: "para-editor", contentEditable: "true" });
  p.runs.forEach(run => {
    if (run.type === "text") {
      editor.append(document.createTextNode(run.text || ""));
    } else if (run.type === "exhibit") {
      const lab = labels.get(run.exId) || "?";
      const chip = el("span", { className: "exh-chip", dataset: { exId: run.exId } });
      chip.setAttribute("contenteditable", "false");
      chip.setAttribute("draggable", "false");
      chip.textContent = `(exhibit "${lab || "?"}")`;
      editor.append(chip);
    }
  });
  return editor;
}

/** Serialize editor DOM back into runs[] */
function collectRunsFromEditor(editor) {
  const runs = [];
  for (const node of editor.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || "";
      if (text) {
        const last = runs[runs.length - 1];
        if (last && last.type === "text") last.text += text;
        else runs.push({ type: "text", text });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("exh-chip")) {
      runs.push({ type: "exhibit", exId: node.dataset.exId });
    }
  }
  if (runs.length === 0) runs.push({ type: "text", text: "" });
  return runs;
}

/** Prevent deletion of chips while allowing typing around them */
function protectChips(editor) {
  const isChip = (n) => n && n.nodeType === 1 && n.classList?.contains("exh-chip");

  function blocksDeletion(range, direction /* -1 back, +1 forward */) {
    if (!range) return false;

    // If selection spans across any chip, block.
    if (!range.collapsed) {
      const fragment = range.cloneContents?.();
      return !!fragment?.querySelector?.(".exh-chip");
    }

    // Collapsed caret: inspect neighbor at the boundary.
    const sc = range.startContainer;
    const so = range.startOffset;

    if (sc.nodeType === Node.TEXT_NODE) {
      if (direction === -1 && so === 0)  return isChip(sc.previousSibling);
      if (direction === +1 && so === sc.length) return isChip(sc.nextSibling);
      return false;
    }

    if (sc.nodeType === Node.ELEMENT_NODE) {
      if (direction === -1) {
        const leftNode = sc.childNodes[so - 1] || null;
        if (isChip(leftNode)) return true;
        if (leftNode && leftNode.nodeType === Node.TEXT_NODE && so - 2 >= 0) {
          const left2 = sc.childNodes[so - 2];
          if (isChip(left2) && (leftNode.nodeValue || "").length === 0) return true;
        }
      } else {
        const rightNode = sc.childNodes[so] || null;
        if (isChip(rightNode)) return true;
        if (rightNode && rightNode.nodeType === Node.TEXT_NODE && so + 1 < sc.childNodes.length) {
          const right2 = sc.childNodes[so + 1];
          if (isChip(right2) && (rightNode.nodeValue || "").length === 0) return true;
        }
      }
    }
    return false;
  }

  // beforeinput: cancel deletion ops precisely at chip boundaries
  editor.addEventListener("beforeinput", (e) => {
    const t = e.inputType || "";
    if (!/deleteContent/.test(t)) return;

    const sel = document.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);

    const dir =
      t === "deleteContentBackward" || t === "deleteWordBackward" || t === "deleteSoftLineBackward" ? -1 : +1;

    if (blocksDeletion(r, dir)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Keydown fallback (older engines / IME quirks)
  editor.addEventListener("keydown", (e) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const sel = document.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    const dir = e.key === "Backspace" ? -1 : +1;
    if (blocksDeletion(r, dir)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Safety net: if a chip is somehow removed by the browser, trigger a refresh via input event.
  const mo = new MutationObserver((mutList) => {
    for (const m of mutList) {
      for (const n of m.removedNodes) {
        if (isChip(n)) {
          const evt = new Event("input", { bubbles: true });
          editor.dispatchEvent(evt);
          return;
        }
      }
    }
  });
  mo.observe(editor, { childList: true, subtree: true });
}

/* ---------- Paragraph list UI ---------- */
const paraList = $("#paraList");

function renderParagraphs() {
  const list = loadParas().sort(byNumber).map(ensureRuns);
  const labels = computeExhibitLabels(list);
  paraList.innerHTML = "";
  list.forEach(p => paraList.appendChild(renderRow(p, list.length, labels)));
}

function renderRow(p, totalCount, labels) {
  const row = el("div", { className: "row" });

  // Left column (numbers + controls)
  const left = el("div", { className: "row-num" });
  const numWrap = el("div", { className: "para-num-row" });

  const labelAndBadge = el("label", { className: "no-inline", innerHTML: ` Paragraph No. <span class="pill"># ${p.number}</span>` });

  const moveControls = el("div", { className: "move-controls" });
  const moveLbl = el("label", { htmlFor: `move-${p.id}`, innerText: "Move to Paragraph No.:" });
  const numControls = el("div", { className: "num-controls" });
  const num = el("input", { type: "number", id: `move-${p.id}`, className: "num", min: 1, max: totalCount, step: 1, value: p.number });
  const applyReorder = el("button", { type: "button", className: "applyReorder", innerText: "Apply" });
  numControls.append(num, applyReorder);
  moveControls.append(moveLbl, numControls);

  const delBtn = el("button", { type: "button", className: "del", innerText: "Remove paragraph" });
  const insBelow = el("button", { type: "button", className: "insBelow", innerText: "Insert new paragraph below" });

  numWrap.append(labelAndBadge, moveControls, delBtn, insBelow);
  left.append(numWrap);

  // Middle column (editor + exhibits)
  const mid = el("div", { className: "row-text" });
  const textLbl = el("label", { innerText: "Paragraph text" });

  // Editor
  const editor = renderEditorFromRuns(p, labels);
  protectChips(editor);

  // Exhibit strip
  const strip = el("div", { className: "exhibit-strip" });
  const addBtn = el("button", { type: "button", className: "addExhibitsBtn", innerText: "+ Add exhibit(s)" });
  const fileMulti = el("input", { type: "file", className: "fileMulti", accept: "application/pdf", multiple: true });
  fileMulti.hidden = true;

  strip.append(addBtn, fileMulti);

  // Render existing exhibit chips (rail below editor)
  function renderExhibitChipsRail() {
    // remove current "exhibit-chip" elements in rail (not the inline editor chips)
    [...strip.querySelectorAll(".rail-chip")].forEach(n => n.remove());

    (p.exhibits || []).forEach((ex, idx) => {
      const lab = labels.get(ex.id) || "";
      const chip = el("div", { className: "exhibit-chip rail-chip", dataset: { exId: ex.id } });
      const labelSpan = el("span", { className: "pill exhibit-label", innerText: `exhibit "${lab}"` });
      const nameSpan  = el("span", { className: "exhibit-name", innerText: `• ${ex.name || "Exhibit.pdf"}` });
      const actions   = el("div", { className: "exhibit-actions" });
      const leftBtn   = el("button", { type: "button", className: "ex-left",  innerText: "←", title: "Move exhibit left" });
      const rightBtn  = el("button", { type: "button", className: "ex-right", innerText: "→", title: "Move exhibit right" });
      const xBtn      = el("button", { type: "button", className: "ex-remove", innerText: "✕", title: "Remove exhibit" });

      if (idx === 0) leftBtn.disabled = true;
      if (idx === (p.exhibits.length - 1)) rightBtn.disabled = true;

      leftBtn.onclick  = () => { moveExhibit(p.id, ex.id, -1); renderParagraphs(); };
      rightBtn.onclick = () => { moveExhibit(p.id, ex.id, +1); renderParagraphs(); };
      xBtn.onclick     = () => { if (confirm("Remove this exhibit?")) { removeExhibit(p.id, ex.id); renderParagraphs(); } };

      actions.append(leftBtn, rightBtn, xBtn);
      chip.append(labelSpan, nameSpan, actions);
      strip.insertBefore(chip, addBtn);
    });
  }
  renderExhibitChipsRail();

  // Wire editor change → persist runs
  editor.addEventListener("input", () => {
    const runs = collectRunsFromEditor(editor);
    upsertParagraph({ id: p.id, runs });
    syncUndoRedoButtons();
  });

  // Wire paragraph controls
  const desiredNumber = () => {
    let n = Math.round(Number(num.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > totalCount) n = totalCount;
    return n;
  };
  const syncApplyState = () => { applyReorder.disabled = (desiredNumber() === p.number); };
  syncApplyState(); num.addEventListener("input", syncApplyState);
  applyReorder.onclick = () => { const n = desiredNumber(); if (n !== p.number) { moveToPosition(p.id, n); renderParagraphs(); } };
  delBtn.onclick = () => { if (confirm("Remove this paragraph?")) { removeParagraph(p.id); renderParagraphs(); } };
  insBelow.onclick = () => { insertNewBelow(p.number); renderParagraphs(); };

  // Add exhibits (picker)
  addBtn.onclick = () => fileMulti.click();
  fileMulti.onchange = async () => {
    const files = Array.from(fileMulti.files || []);
    if (!files.length) return;

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
    fileMulti.value = "";
  };

  mid.append(textLbl, editor, strip);


  // Right column (kept for layout compatibility; unused)
  const right = el("div", { className: "row-file" });

  row.append(left, mid, right);
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

  // One-time migration from legacy → multi exhibits + runs[]
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
