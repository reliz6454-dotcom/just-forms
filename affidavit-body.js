// affidavit-body.js — exhibits + paragraph editor + metadata intake + RTE
// Variant: cleaned to use ZWSP-only cushions (no visible space) and remove visible-space deletion branches

import { LS, loadJSON, saveJSON, loadDocSchema, loadDocGuidance } from "./constants.js";

/* ---------- DOM helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
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

/* ---------- IndexedDB for files + document meta ---------- */
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
async function writeDoc(doc) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function readDoc(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}
async function saveFileBlob(file) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const id = crypto.randomUUID();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      id, name: file.name, type: file.type, size: file.size, blob: file,
      uploadedAt: new Date().toISOString(),
      pageCount: null,
      meta: {}, system: {}, tags: []
    });
    tx.oncomplete = () => res(id);
    tx.onerror    = () => rej(tx.error);
  });
}
async function getFileBlob(id) {
  const rec = await readDoc(id);
  return rec ? { id: rec.id, name: rec.name, type: rec.type, blob: rec.blob } : null;
}

/* ---------- Optional: compute page count with PDF.js if available ---------- */
async function computePdfPageCountFromBlob(blob) {
  try {
    if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== "function") return null;
    const url = URL.createObjectURL(blob);
    const t = await window.pdfjsLib.getDocument({ url }).promise;
    const pages = t.numPages || null;
    URL.revokeObjectURL(url);
    return pages;
  } catch { return null; }
}

/* ---------- Utilities ---------- */
const byNumber = (a, b) => (a.number || 0) - (b.number || 0);
const stripGuards = (s) => (s || "").replace(/\u200B/g, "");

// Chip predicate
const isChipEl = (n) => n && n.nodeType === 1 && n.classList?.contains("exh-chip");

/* ---------- Guard helpers for ZWSP-only cushions ---------- */
const LEFT_GUARD_TEXT  = "\u200B"; // ZWSP only
const RIGHT_GUARD_TEXT = "\u200B"; // ZWSP only
function isZwspText(n)  { return !!(n && n.nodeType === Node.TEXT_NODE && /\u200B/.test(n.nodeValue || "")); }

/* ---------- Selection helpers for chips ---------- */
function rangeContainsChip(range) {
  if (!range || range.collapsed) return false;
  const frag = range.cloneContents?.();
  if (!frag) return false;
  const probe = document.createElement("div");
  probe.appendChild(frag);
  return !!probe.querySelector(".exh-chip");
}
function trimRangeToAvoidChips(range, root) {
  const r = range.cloneRange();

  // Move start forward past any chip
  while (true) {
    const sc = r.startContainer;
    const so = r.startOffset;
    if (!root.contains(sc)) break;

    if (sc.nodeType === Node.ELEMENT_NODE) {
      const child = sc.childNodes[so] || null;
      if (isChipEl(child)) {
        const after = child.nextSibling;
        if (!after) return null;
        r.setStart(after, after.nodeType === Node.TEXT_NODE ? 0 : 0);
        continue;
      }
    }
    if (sc.nodeType === Node.ELEMENT_NODE && isChipEl(sc)) {
      const after = sc.nextSibling;
      if (!after) return null;
      r.setStart(after, after.nodeType === Node.TEXT_NODE ? 0 : 0);
      continue;
    }
    break;
  }

  // Move end backward before any chip
  while (true) {
    const ec = r.endContainer;
    const eo = r.endOffset;
    if (!root.contains(ec)) break;

    if (ec.nodeType === Node.ELEMENT_NODE) {
      const idx = eo - 1;
      const child = ec.childNodes[idx] || null;
      if (isChipEl(child)) {
        const before = child.previousSibling;
        if (!before) return null;
        const len = before.nodeType === Node.TEXT_NODE ? (before.nodeValue || "").length : (before.childNodes?.length || 0);
        r.setEnd(before, len);
        continue;
      }
    }
    if (ec.nodeType === Node.ELEMENT_NODE && isChipEl(ec)) {
      const before = ec.previousSibling;
      if (!before) return null;
      const len = before.nodeType === Node.TEXT_NODE ? (before.nodeValue || "").length : (before.childNodes?.length || 0);
      r.setEnd(before, len);
      continue;
    }
    break;
  }

  return r.collapsed ? null : r;
}

/* ---------- Clipboard text writer (fallback safe) ---------- */
async function writePlainTextToClipboard(txt) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch (_) {}
  const ta = document.createElement("textarea");
  ta.style.position = "fixed"; ta.style.opacity = "0";
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (_) {}
  document.body.removeChild(ta);
  return true;
}

/* ---------- Model helpers ---------- */
const createParagraph = () => ({
  id: crypto.randomUUID(),
  number: 0,
  text: "",
  html: "",
  exhibits: [],
  runs: [{ type: "text", text: "" }]
});
function newParagraph() { const list = loadParas().sort(byNumber); const p = createParagraph(); p.number = list.length + 1; return p; }
function renumber(list) { list.forEach((p, i) => { p.number = i + 1; }); return list; }
function ensureRuns(p) {
  if (!p) return p;
  if (!Array.isArray(p.runs)) {
    const baseText = (p.text || "");
    const textRun = { type: "text", text: baseText };
    const exRuns  = Array.isArray(p.exhibits) ? p.exhibits.map(ex => ({ type: "exhibit", exId: ex.id })) : [];
    p.runs = [textRun, ...exRuns];
  }
  if (typeof p.html !== "string") p.html = "";
  return p;
}

/* ---------- One-time migration ---------- */
async function migrateParasIfNeeded() {
  let changed = false;
  const list = loadParas();
  for (const p of list) {
    if (p && p.exhibitFileId && !Array.isArray(p.exhibits)) {
      let name = "Exhibit.pdf";
      try { const rec = await getFileBlob(p.exhibitFileId); if (rec?.name) name = rec.name; } catch {}
      p.exhibits = [{ id: crypto.randomUUID(), fileId: p.exhibitFileId, name }];
      delete p.exhibitFileId;
      changed = true;
    } else if (p && !Array.isArray(p.exhibits)) { p.exhibits = []; changed = true; }
    const before = JSON.stringify(p.runs || null);
    ensureRuns(p);
    if (JSON.stringify(p.runs || null) !== before) changed = true;
    if (typeof p.html !== "string") { p.html = ""; changed = true; }
  }
  if (changed) saveParas(list);
}

/* ---------- Exhibit labels ---------- */
function computeExhibitLabels(paras) {
  const scheme = getExhibitScheme();
  const map = new Map();
  let idx = 0;
  paras.sort(byNumber).forEach(p => {
    (p.exhibits || []).forEach(ex => { map.set(ex.id, labelFor(idx, scheme)); idx++; });
  });
  return map;
}

/* ---------- Heading & intro ---------- */
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

/* ---------- Sanitizer (allow a tiny HTML subset) ---------- */
function sanitizeHTML(inputHTML) {
  const ALLOWED = new Set(["B","STRONG","I","EM","U","UL","OL","LI","BR","SPAN","#text"]);
  const container = document.createElement("div");
  container.innerHTML = inputHTML || "";

  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;

    const tag = node.tagName;
    if (!ALLOWED.has(tag)) {
      let buf = "";
      node.childNodes.forEach(ch => { buf += clean(ch); });
      return buf;
    }

    if (tag === "SPAN") {
      const cls = node.classList;
      if (!cls || !cls.contains("exh-chip")) {
        let buf = "";
        node.childNodes.forEach(ch => { buf += clean(ch); });
        return buf;
      }
    }

    // Intentionally do NOT persist custom list-style attrs; use browser defaults
    let open = `<${tag.toLowerCase()}`;
    if (tag === "SPAN" && node.classList.contains("exh-chip")) {
      const exId = node.getAttribute("data-ex-id") || node.dataset.exId || "";
      open += ` class="exh-chip" data-ex-id="${exId}" contenteditable="false"`;
    }
    open += ">";

    let inner = "";
    node.childNodes.forEach(ch => { inner += clean(ch); });
    const close = `</${tag.toLowerCase()}>`;
    return open + inner + close;
  }

  let out = "";
  container.childNodes.forEach(ch => { out += clean(ch); });
  return out;
}

/* ---------- Chips (+ caret guards) ---------- */
function makeExhibitChip(exId, labelText) {
  const chip = document.createElement("span");
  chip.className = "exh-chip";
  chip.textContent = `exhibit "${labelText || "?"}"`;
  chip.setAttribute("data-ex-id", exId);
  chip.contentEditable = "false";
  chip.setAttribute("draggable", "false");
  chip.setAttribute("tabindex", "-1");
  return chip;
}
function makeChipWithGuards(exId, labelText) {
  // ZWSP on both sides
  const leftGuard  = document.createTextNode(LEFT_GUARD_TEXT);
  const chip       = makeExhibitChip(exId, labelText);
  const rightGuard = document.createTextNode(RIGHT_GUARD_TEXT);
  return [leftGuard, chip, rightGuard];
}
function appendChipWithGuards(parent, exId, labelText) {
  const trio = makeChipWithGuards(exId, labelText);
  trio.forEach(n => parent.appendChild(n));
}
function ensureGuardsAroundChip(chip) {
  const prev = chip.previousSibling;
  const next = chip.nextSibling;

  if (!(prev && prev.nodeType === Node.TEXT_NODE && prev.nodeValue === LEFT_GUARD_TEXT)) {
    chip.parentNode?.insertBefore(document.createTextNode(LEFT_GUARD_TEXT), chip);
  }

  if (!(next && next.nodeType === Node.TEXT_NODE && next.nodeValue === RIGHT_GUARD_TEXT)) {
    chip.parentNode?.insertBefore(document.createTextNode(RIGHT_GUARD_TEXT), chip.nextSibling);
  }
}

/* ---------- Inline editor (runs <-> DOM chips + RTE) ---------- */
function renderEditorFromParagraph(p, labels) {
  const ed = document.createElement("div");
  ed.className = "para-editor";
  ed.contentEditable = "true";
  ed.setAttribute("data-paragraph-id", p.id);

  if (p.html) {
    ed.innerHTML = p.html;
  } else {
    const runs = Array.isArray(p.runs) ? p.runs : [{ type: "text", text: p.text || "" }];
    for (const r of runs) {
      if (r?.type === "text") ed.append(document.createTextNode(r.text || ""));
      else if (r?.type === "exhibit" && r.exId) {
        const lab = labels?.get(r.exId) || "?";
        appendChipWithGuards(ed, r.exId, lab);
      }
    }
    if (!ed.firstChild) ed.append(document.createTextNode(""));
  }

  // Refresh chip labels + ensure guards exist
  ed.querySelectorAll(".exh-chip").forEach(ch => {
    const exId = ch.getAttribute("data-ex-id");
    const lab  = exId ? (labels.get(exId) || "?") : "?";
    ch.textContent = `exhibit "${lab}"`;
    ch.contentEditable = "false";
    ch.setAttribute("draggable", "false");
    ensureGuardsAroundChip(ch);
  });

  return ed;
}
function collectRunsFromEditor(editorEl) {
  const out = [];
  const pushText = (txt) => {
    const cleaned = stripGuards(txt);
    if (!cleaned) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.text += cleaned;
    else out.push({ type: "text", text: cleaned });
  };

  for (const node of editorEl.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) { pushText(node.nodeValue || ""); continue; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elx = node;
      if (elx.classList.contains("exh-chip")) {
        const exId = elx.getAttribute("data-ex-id") || elx.dataset.exId || "";
        if (exId) out.push({ type: "exhibit", exId });
      } else {
        const walker = document.createTreeWalker(elx, NodeFilter.SHOW_ALL, null);
        let n, buf = "";
        while ((n = walker.nextNode())) {
          if (n.nodeType === Node.TEXT_NODE) buf += n.nodeValue || "";
          if (n.nodeType === Node.ELEMENT_NODE && n.classList?.contains("exh-chip")) {
            const id = n.getAttribute("data-ex-id") || n.dataset.exId || "";
            if (id) out.push({ type: "exhibit", exId: id });
          }
        }
        pushText(buf);
      }
    }
  }
  return out;
}

/* ---------- Smart-backspace helpers (for list items that start with guard+chip) ---------- */
function closestTag(el, tag) {
  tag = tag.toUpperCase();
  while (el && el.nodeType === 1) {
    if (el.tagName === tag) return el;
    el = el.parentElement;
  }
  return null;
}

// LI starts with LEFT_GUARD_TEXT + CHIP (or CHIP directly)
function liStartsWithChip(li) {
  if (!li) return false;
  let first = li.firstChild;
  while (first && first.nodeType === Node.TEXT_NODE && (first.nodeValue || "") === "") first = first.nextSibling;
  if (!first) return false;
  if (first.nodeType === Node.TEXT_NODE && first.nodeValue === LEFT_GUARD_TEXT) {
    const second = first.nextSibling;
    return isChipEl(second);
  }
  return isChipEl(first);
}

// Caret detection at the VERY start of a chip-leading <li>
function caretAtStartOfLiWithChip(range) {
  if (!range || !range.collapsed) return null;
  const li = closestTag(range.startContainer, "LI");
  if (!li) return null;

  // Determine the first meaningful node
  let first = li.firstChild;
  while (first && first.nodeType === Node.TEXT_NODE && first.nodeValue === "") first = first.nextSibling;

  const startsWithGuardThenChip =
    first && first.nodeType === Node.TEXT_NODE && first.nodeValue === LEFT_GUARD_TEXT && isChipEl(first.nextSibling);
  const startsWithChip = isChipEl(first);

  if (!(startsWithGuardThenChip || startsWithChip)) return null;

  const sc = range.startContainer;
  const so = range.startOffset;

  if (sc === li && so === 0) return li;                       // caret at start of LI
  if (startsWithGuardThenChip && sc === first && so <= 1) return li; // inside guard at its start
  if (sc && sc.nodeType === Node.TEXT_NODE && so === 0 && isChipEl(sc.nextSibling)) return li;

  return null;
}

function shouldOutdentAtCaret(range) {
  if (!range || !range.collapsed) return null;

  // Find containing LI
  let container = range.startContainer;
  if (container.nodeType === Node.ELEMENT_NODE) {
    const childAt = container.childNodes[range.startOffset] || container.childNodes[range.startOffset - 1] || container;
    const liFromProbe = closestTag(childAt, "LI");
    if (liFromProbe) container = liFromProbe;
  }
  const li = closestTag(container, "LI");
  if (!li) return null;

  // Early check: if LI starts with guard+chip (or chip), outdent on backspace at start/cushion
  const sc = range.startContainer;
  const so = range.startOffset;

  if (liStartsWithChip(li)) {
    if (sc === li && so === 0) return li;

    const first = li.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE && first.nodeValue === LEFT_GUARD_TEXT) {
      if (sc === first) return li;
      const afterGuard = first.nextSibling;
      if (isChipEl(afterGuard) && so === 0 && sc.nodeType === Node.TEXT_NODE) return li;
    }

    const firstNode = li.firstChild;
    if (isChipEl(firstNode) && sc === li && so === 0) return li;

    if (sc && sc.nodeType === Node.TEXT_NODE && so === 0 && isChipEl(sc.nextSibling)) return li;
  }

  return null;
}

function safeOutdentFromLi(editor) {
  editor.focus();
  document.execCommand("outdent", false, null);
}

/* === Chip protection (hardened; chips are non-deletable, text around is editable) === */
function protectChips(editor) {
  let _isComposing = false;
  editor.addEventListener("compositionstart", () => { _isComposing = true; });
  editor.addEventListener("compositionend",   () => { _isComposing = false; });

  // Clicking a chip places caret after right guard
  editor.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (isChipEl(t)) {
      e.preventDefault();
      ensureGuardsAroundChip(t);
      const rightGuard = t.nextSibling;
      const r = document.createRange();
      if (rightGuard && rightGuard.nodeType === Node.TEXT_NODE) {
        r.setStart(rightGuard, rightGuard.nodeValue.length);
      } else {
        const guard = document.createTextNode(RIGHT_GUARD_TEXT);
        t.parentNode?.insertBefore(guard, t.nextSibling);
        r.setStart(guard, guard.nodeValue.length);
      }
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }
  });

  // Block delete/cut operations that would touch chips + smart backspace for list-start chips
  editor.addEventListener("beforeinput", (e) => {
    if (_isComposing) return;
    const t = e.inputType || "";
    const isDelete =
      t.startsWith("delete") ||
      t === "deleteByCut" ||
      t === "insertReplacementText";

    const sel = document.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);

    // SMART BACKSPACE EARLY: outdent must win before guard tweaks
    if (t === "deleteContentBackward") {
      const liEarly = caretAtStartOfLiWithChip(r) || shouldOutdentAtCaret(r);
      if (liEarly) {
        e.preventDefault();
        e.stopPropagation();
        safeOutdentFromLi(editor);
        return;
      }
    }

    if (!isDelete) return;

    // If selection covers a chip, cancel deletion entirely
    if (!r.collapsed && rangeContainsChip(r)) {
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // Collapsed: prevent deleting a chip when caret is adjacent
    const sc = r.startContainer, so = r.startOffset;

    const neighborAt = (container, offset, dir) => {
      if (container.nodeType === Node.TEXT_NODE) {
        return dir < 0 ? container.previousSibling : container.nextSibling;
      }
      const idx = offset + (dir < 0 ? -1 : 0);
      return container.childNodes[idx] || null;
    };

    const leftNode  = neighborAt(sc, so, -1);
    const rightNode = neighborAt(sc, so, +1);

    const deletingBackward = t === "deleteContentBackward" || t === "deleteWordBackward" || t === "deleteSoftLineBackward";
    const deletingForward  = t === "deleteContentForward"  || t === "deleteWordForward"  || t === "deleteHardLineForward";

    // Give smart-outdent another chance
    if (deletingBackward) {
      const li2 = caretAtStartOfLiWithChip(r) || shouldOutdentAtCaret(r);
      if (li2) {
        e.preventDefault();
        e.stopPropagation();
        safeOutdentFromLi(editor);
        return;
      }
    }

    // Normal delete within text nodes away from edges
    if (sc.nodeType === Node.TEXT_NODE) {
      if (deletingBackward && so > 0) return;
      if (deletingForward  && so < (sc.nodeValue || "").length) return;
    }

    // Block deleting the chip itself
    const willHitChipBackward = (deletingBackward && isChipEl(leftNode));
    const willHitChipForward  = (deletingForward  && isChipEl(rightNode));

    if (willHitChipBackward || willHitChipForward) {
      e.preventDefault(); e.stopPropagation();
      return;
    }
  }, { capture: true });

  // Fallback for Backspace/Delete & context-menu Cut (also includes smart-backspace)
  editor.addEventListener("keydown", (e) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;

    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);

    // SMART BACKSPACE mirror (ensure outdent runs first)
    if (e.key === "Backspace") {
      const liEarly = caretAtStartOfLiWithChip(r) || shouldOutdentAtCaret(r);
      if (liEarly) {
        e.preventDefault();
        e.stopPropagation();
        safeOutdentFromLi(editor);
        return;
      }
    }

    // If selection spans a chip, block
    if (!r.collapsed) {
      const frag = r.cloneContents?.();
      if (frag) {
        const probe = document.createElement("div");
        probe.appendChild(frag);
        if (probe.querySelector(".exh-chip")) {
          e.preventDefault(); e.stopPropagation();
          return;
        }
      }
    } else {
      // Collapsed: check adjacency
      const sc = r.startContainer, so = r.startOffset;

      const neighborAt = (container, offset, dir) => {
        if (container.nodeType === Node.TEXT_NODE) {
          return dir < 0 ? container.previousSibling : container.nextSibling;
        }
        const idx = offset + (dir < 0 ? -1 : 0);
        return container.childNodes[idx] || null;
      };
      const leftNode  = neighborAt(sc, so, -1);
      const rightNode = neighborAt(sc, so, +1);

      const hit =
        (e.key === "Backspace" && isChipEl(leftNode)) ||
        (e.key === "Delete"    && isChipEl(rightNode));
      if (hit) { e.preventDefault(); e.stopPropagation(); return; }
    }
  }, { capture: true });

  editor.addEventListener("cut", async (e) => {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (r.collapsed) return;

    const frag = r.cloneContents?.();
    if (!frag) return;
    const probe = document.createElement("div");
    probe.appendChild(frag);
    if (probe.querySelector(".exh-chip")) {
      e.preventDefault(); e.stopPropagation();
      const txt = probe.textContent || "";
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(txt);
      } catch (_) {}
      document.execCommand("delete", false, null);
    }
  }, { capture: true });

  // Prevent dragging chips
  editor.addEventListener("dragstart", (e) => { if (isChipEl(e.target)) e.preventDefault(); });

  // Re-assert guards; keep editor from becoming empty
  const mo = new MutationObserver(() => {
    editor.querySelectorAll(".exh-chip").forEach(ensureGuardsAroundChip);
    if (editor.childNodes.length === 0) editor.append(document.createTextNode(""));
  });
  mo.observe(editor, { childList: true, subtree: true, characterData: true });
}

/* ---------- RTE toolbar (dropdown removed) ---------- */
function buildRteToolbar() {
  const tb = el("div", { className: "rte-toolbar" });
  const btn = (label, cmd, title) => el("button", { type: "button", innerText: label, title: title || label, dataset: { cmd } });
  tb.append(
    btn("B", "bold", "Bold (Cmd/Ctrl+B)"),
    btn("i", "italic", "Italic (Cmd/Ctrl+I)"),
    btn("U", "underline", "Underline (Cmd/Ctrl+U)"),
    el("span", { className: "sep" }),
    btn("•", "insertUnorderedList", "Bulleted list"),
    btn("1.", "insertOrderedList", "Numbered list"),
    el("span", { className: "sep" }),
    btn("→", "indent", "Indent"),
    btn("←", "outdent", "Outdent"),
    el("span", { className: "sep" }),
    btn("Clear", "removeFormat", "Clear direct formatting")
  );
  return tb;
}
function getActiveEditor(toolbar) {
  let ed = toolbar?.nextElementSibling;
  if (ed && ed.classList.contains("para-editor")) return ed;
  return null;
}
function execOnEditor(ed, cmd, value = null) {
  if (!ed) return;
  ed.focus();
  document.execCommand(cmd, false, value);
}

/* ---------- Save editor HTML (sanitized) + runs(chips) ---------- */
function persistEditor(p, ed) {
  const raw = ed.innerHTML;
  const clean = sanitizeHTML(raw);
  const runs = collectRunsFromEditor(ed);
  upsertParagraph({ id: p.id, html: clean, runs });
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
function insertNewAt(target1) { pushHistory(); const list = loadParas().sort(byNumber); const p = createParagraph(); const idx = Math.max(0, Math.min(target1 - 1, list.length)); list.splice(idx, 0, p); saveParas(renumber(list)); }
const insertNewBelow = (n) => { pushHistory(); insertNewAt(n + 1); };
function upsertParagraph(patch) { pushHistory(); const list = loadParas().sort(byNumber); const i = list.findIndex(x => x.id === patch.id); if (i === -1) list.push(patch); else list[i] = { ...list[i], ...patch }; saveParas(renumber(list)); }
function removeParagraph(id) { pushHistory(); const list = loadParas().filter(p => p.id !== id).sort(byNumber); saveParas(renumber(list)); }

/* ---------- Exhibit mutations (with guards) ---------- */
function addExhibits(pId, entries) {
  pushHistory();
  const list = loadParas().sort(byNumber);
  const i = list.findIndex(p => p.id === pId);
  if (i === -1) return;
  const p = ensureRuns(list[i]);
  p.exhibits = p.exhibits || [];
  const newExIds = [];
  for (const e of entries) {
    const exId = crypto.randomUUID();
    p.exhibits.push({ id: exId, fileId: e.fileId, name: e.name || "Exhibit" });
    newExIds.push(exId);
  }
  for (const exId of newExIds) p.runs.push({ type: "exhibit", exId });

  if (typeof p.html === "string" && p.html.trim()) {
    const tmp = document.createElement("div");
    tmp.innerHTML = p.html;
    newExIds.forEach(exId => appendChipWithGuards(tmp, exId, "?"));
    p.html = sanitizeHTML(tmp.innerHTML);
  }
  saveParas(renumber(list));
}
function moveExhibit(pId, exId, dir) {
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

  if (typeof p.html === "string" && p.html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = p.html;
    const chip = tmp.querySelector(`.exh-chip[data-ex-id="${exId}"]`);
    if (chip && chip.parentNode) {
      const parent = chip.parentNode;
      const leftGuard  = chip.previousSibling && chip.previousSibling.nodeType === Node.TEXT_NODE && isZwspText(chip.previousSibling) ? chip.previousSibling : (chip.previousSibling && chip.previousSibling.nodeType === Node.TEXT_NODE && chip.previousSibling.nodeValue === LEFT_GUARD_TEXT ? chip.previousSibling : null);
      const rightGuard = chip.nextSibling     && chip.nextSibling.nodeType === Node.TEXT_NODE && isZwspText(chip.nextSibling) ? chip.nextSibling : null;

      const group = [leftGuard, chip, rightGuard].filter(Boolean);

      const siblings = Array.from(parent.childNodes);
      const curFirst = group[0] || chip;
      const curIdx = siblings.indexOf(curFirst);
      let targetIdx = curIdx;

      if (dir > 0) {
        const afterGroup = siblings[curIdx + group.length] || null;
        if (afterGroup) {
          targetIdx = siblings.indexOf(afterGroup) + 1;
        } else {
          targetIdx = siblings.length;
        }
      } else {
        const beforeGroup = siblings[curIdx - 1] || null;
        if (beforeGroup) {
          targetIdx = siblings.indexOf(beforeGroup);
        } else {
          targetIdx = 0;
        }
      }

      group.forEach(n => parent.removeChild(n));
      const ref = parent.childNodes[targetIdx] || null;
      group.forEach(n => parent.insertBefore(n, ref));
    }
    p.html = sanitizeHTML(tmp.innerHTML);
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
  if (typeof p.html === "string" && p.html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = p.html;
    const chip = tmp.querySelector(`.exh-chip[data-ex-id="${exId}"]`);
    if (chip) {
      const left  = chip.previousSibling;
      const right = chip.nextSibling;
      if (left  && left.nodeType  === Node.TEXT_NODE && isZwspText(left))  left.remove();
      chip.remove();
      if (right && right.nodeType === Node.TEXT_NODE && isZwspText(right)) right.remove();
    }
    p.html = sanitizeHTML(tmp.innerHTML);
  }
  saveParas(renumber(list));
}

/* ---------- Affidavit linkage helpers ---------- */
function ensureAffidavitId() {
  let id = localStorage.getItem(LS.AFFIDAVIT_ID);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(LS.AFFIDAVIT_ID, id); }
  return id;
}
function findExhibitLocationByFileId(fileId) {
  const paras = loadParas().sort((a,b)=>(a.number||0)-(b.number||0));
  for (const p of paras) {
    const hit = (p.exhibits || []).find(ex => ex.fileId === fileId);
    if (hit) return { paragraphId: p.id, paragraphNo: p.number, exhibitId: hit.id };
  }
  return null;
}

/* ---------- Document Intake Modal ---------- */
let docMetaModal, docMetaForm, docMetaErr, docMetaSave, docMetaGuidance;
let _pendingMetaQueue = []; // [{fileId, defaults}]
let _currentMeta      = null;
let _lastFocused = null;
function lockBackground() { document.body.dataset._scrollY = String(window.scrollY || 0); document.body.style.top = `-${document.body.dataset._scrollY}px`; document.body.style.position = "fixed"; document.body.style.width = "100%"; }
function unlockBackground() { const y = Number(document.body.dataset._scrollY || 0); document.body.style.position = ""; document.body.style.top = ""; document.body.style.width = ""; window.scrollTo(0, y); }
function trapFocus(modalEl) {
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nodes = () => Array.from(modalEl.querySelectorAll(FOCUSABLE)).filter(n => !n.hasAttribute("disabled"));
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); return; }
    if (e.key !== "Tab") return;
    const list = nodes(); if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  modalEl.addEventListener("keydown", onKey);
  modalEl._removeTrap = () => modalEl.removeEventListener("keydown", onKey);
}
function renderGuidanceBlock() {
  const g = loadDocGuidance();
  docMetaGuidance.innerHTML = "";
  const title = el("h4", { innerText: "Why this matters" });
  const p1    = el("p",  { innerText: g.intro });
  const p2    = el("p",  { innerText: g.note });
  const exH   = el("h4", { innerText: g.examplesTitle });
  const list  = el("ul");
  g.examples.forEach(txt => list.append(el("li", { innerText: txt })));
  docMetaGuidance.append(title, p1, p2, exH, list);
}
function makeNoDateControl(forInputId) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const id = forInputId + "-none";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.id = id; cb.ariaLabel = "This document has no date";
  const label = document.createElement("label"); label.htmlFor = id; label.textContent = "This document has no date";
  wrap.append(cb, label);
  return wrap;
}
async function openDocMetaForFile(fileId) {
  const rec = await readDoc(fileId);
  const defaults = rec?.meta || {};
  openDocMetaModal({ fileId, defaults });
}
function openDocMetaModal(payload) {
  _currentMeta = payload;
  const schema = loadDocSchema(); const guidance = loadDocGuidance();
  renderGuidanceBlock();
  docMetaForm.innerHTML = "";
  let dateFieldWrap = null;

  schema.forEach(field => {
    const wrap = el("div", { className: "field" });
    const id = `docmeta-${field.key}`;
    const labelText = field.label + (field.required ? " *" : "");
    const label = el("label", { htmlFor: id, innerText: labelText });
    let input;
    const value = payload.defaults?.[field.key] ?? "";
    switch (field.type) {
      case "textarea": {
        const ex = Array.isArray(guidance.examples) ? guidance.examples.slice(0, 3) : [];
        const placeholder = ex.length ? `e.g., ${ex[0]}\n• ${ex[1] || ""}\n• ${ex[2] || ""}`.trim() : "e.g., Email from Jane Smith re: delivery delay";
        input = el("textarea", { id, value, placeholder });
        break;
      }
      case "select": {
        input = el("select", { id });
        const choices = field.choices || [];
        choices.forEach(opt => input.append(el("option", { value: opt, innerText: opt })));
        if (value && !choices.includes(value)) input.append(el("option", { value, innerText: value }));
        if (value) input.value = value;
        break;
      }
      case "date": {
        input = el("input", { id, type: "date", value });
        break;
      }
      default: {
        input = el("input", { id, type: "text", value });
      }
    }
    wrap.append(label, input);
    docMetaForm.append(wrap);
    if (field.type === "date") dateFieldWrap = wrap;
  });

  if (dateFieldWrap) {
    const dateInput = dateFieldWrap.querySelector('input[type="date"]');
    const noneCtrl = makeNoDateControl(dateInput.id);
    dateFieldWrap.after(noneCtrl);
    const noneCb = noneCtrl.querySelector('input[type="checkbox"]');
    const prevNoDate = !!payload.defaults?.noDocDate; noneCb.checked = prevNoDate;
    const syncDateState = () => { if (noneCb.checked) { dateInput.value = ""; dateInput.disabled = true; } else { dateInput.disabled = false; } };
    syncDateState(); noneCb.addEventListener("change", syncDateState);
  }

  docMetaErr.textContent = "";
  _lastFocused = document.activeElement;
  lockBackground();
  docMetaModal.setAttribute("aria-hidden", "false");
  trapFocus(docMetaModal);
  const firstInput = docMetaForm.querySelector("textarea, input, select, button");
  (firstInput || docMetaSave)?.focus();
}
function closeDocMetaModal() {
  docMetaModal.setAttribute("aria-hidden", "true");
  if (typeof docMetaModal._removeTrap === "function") docMetaModal._removeTrap();
  unlockBackground();
  if (_lastFocused) { try { _lastFocused.focus(); } catch {} }
  _currentMeta = null;
}
async function saveDocMeta(fileId, meta) {
  const rec = await readDoc(fileId);
  if (!rec) return;
  const link = findExhibitLocationByFileId(fileId);
  const affidavitId = localStorage.getItem(LS.AFFIDAVIT_ID) || null;
  rec.meta = { ...(rec.meta || {}), ...meta };
  rec.system = { ...(rec.system || {}), attachedTo: "affidavit", affidavitId, paragraphId: link?.paragraphId || null, paragraphNo: link?.paragraphNo ?? null, exhibitId: link?.exhibitId || null };
  if (rec.pageCount == null && rec.type === "application/pdf" && rec.blob) { rec.pageCount = await computePdfPageCountFromBlob(rec.blob); }
  await writeDoc(rec);
}
function validateDocMetaFromForm() {
  const schema = loadDocSchema();
  const out = {}; let noDate = false;
  for (const field of schema) {
    const elmt = document.getElementById(`docmeta-${field.key}`); if (!elmt) continue;
    let v = (elmt.value || "").trim();
    if (field.type === "date") { const noneCb = document.getElementById(`${elmt.id}-none`); noDate = !!(noneCb && noneCb.checked); if (noDate) v = ""; }
    if (field.required && !v) return { ok: false, message: `Please provide: ${field.label}.` };
    out[field.key] = v;
  }
  const dateEl = document.getElementById("docmeta-docDate");
  if (dateEl) {
    const noneCb = document.getElementById(`${dateEl.id}-none`);
    const hasDate = !dateEl.disabled && (dateEl.value || "").trim();
    const noDateChecked = !!(noneCb && noneCb.checked);
    if (!hasDate && !noDateChecked) return { ok: false, message: 'Please enter a document date or check “This document has no date”.' };
  }
  out.noDocDate = noDate;
  return { ok: true, data: out };
}
async function handleDocMetaSave() {
  if (!_currentMeta) return;
  const v = validateDocMetaFromForm();
  if (!v.ok) { docMetaErr.textContent = v.message || "Please complete required fields."; return; }
  await saveDocMeta(_currentMeta.fileId, v.data);
  closeDocMetaModal();
  processNextMetaInQueue();
}
function processNextMetaInQueue() {
  if (_pendingMetaQueue.length === 0) return;
  const next = _pendingMetaQueue.shift();
  openDocMetaModal(next);
}

/* ---------- Row rendering (adds toolbar) ---------- */
function renderRow(p, totalCount, labels) {
  const row = el("div", { className: "row" });

  // Left column
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

  // Middle column
  const mid = el("div", { className: "row-text" });
  const textLbl = el("label", { innerText: "Paragraph text" });

  // RTE toolbar + editor (no dropdown)
  const toolbar = buildRteToolbar();
  const editor = renderEditorFromParagraph(p, labels);
  protectChips(editor);

  // Toolbar wiring
  toolbar.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const cmd = target.dataset?.cmd;
    if (!cmd) return;

    const ed = getActiveEditor(toolbar);
    if (!ed) return;

    if (cmd === "insertOrderedList") {
      execOnEditor(ed, "insertOrderedList");
    } else if (cmd === "insertUnorderedList") {
      execOnEditor(ed, "insertUnorderedList");
    } else {
      execOnEditor(ed, cmd);
    }

    persistEditor(p, ed);
    syncUndoRedoButtons();
  });

  // Keyboard shortcuts (B/I/U)
  editor.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (["b","i","u"].includes(e.key.toLowerCase())) e.preventDefault();
    const map = { b: "bold", i: "italic", u: "underline" };
    const cmd = map[e.key.toLowerCase()];
    if (cmd) {
      execOnEditor(editor, cmd);
      persistEditor(p, editor);
      syncUndoRedoButtons();
    }
  });

  // Exhibit strip
  const strip = el("div", { className: "exhibit-strip" });
  const addBtn = el("button", { type: "button", className: "addExhibitsBtn", innerText: "+ Add exhibit(s)" });
  const fileMulti = el("input", { type: "file", className: "fileMulti", accept: "application/pdf,image/*", multiple: true });
  fileMulti.hidden = true;
  strip.append(addBtn, fileMulti);

  function makeClickableSpan(span, onOpen) {
    span.classList.add("clickable");
    span.tabIndex = 0;
    span.addEventListener("click", onOpen);
    span.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } });
  }

  function renderExhibitChipsRail() {
    [...strip.querySelectorAll(".rail-chip")].forEach(n => n.remove());
    (p.exhibits || []).forEach((ex, idx) => {
      const lab = labels.get(ex.id) || "";
      const chip = el("div", { className: "exhibit-chip rail-chip", dataset: { exId: ex.id } });

      const labelSpan = el("span", { className: "pill exhibit-label", innerText: `exhibit "${lab}"`, title: "Edit exhibit details" });
      const nameSpan  = el("span", { className: "exhibit-name", innerText: `• ${ex.name || "Exhibit"}`, title: "Edit exhibit details" });

      const openEditor = () => { openDocMetaForFile(ex.fileId); };
      makeClickableSpan(labelSpan, openEditor);
      makeClickableSpan(nameSpan, openEditor);

      const actions   = el("div", { className: "exhibit-actions" });
      const leftBtn   = el("button", { type: "button", className: "ex-left",  innerText: "←", title: "Move exhibit left" });
      const rightBtn  = el("button", { type: "button", className: "ex-right", innerText: "→", title: "Move exhibit right" });
      const editBtn   = el("button", { type: "button", className: "ex-edit",  innerText: "Edit", title: "Edit description/date/type" });

      if (idx === 0) leftBtn.disabled = true;
      if (idx === (p.exhibits.length - 1)) rightBtn.disabled = true;

      leftBtn.onclick  = () => { moveExhibit(p.id, ex.id, -1); renderParagraphs(); };
      rightBtn.onclick = () => { moveExhibit(p.id, ex.id, +1); renderParagraphs(); };
      editBtn.onclick  = openEditor;

      actions.append(leftBtn, rightBtn, editBtn);
      chip.append(labelSpan, nameSpan, actions);
      strip.insertBefore(chip, addBtn);
    });
  }
  renderExhibitChipsRail();

  // Save on input (with sanitization)
  editor.addEventListener("input", () => {
    persistEditor(p, editor);
    syncUndoRedoButtons();
  });

  // Reorder / delete / insert
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
  const openPicker = () => fileMulti.click();
  addBtn.onclick = openPicker;

  fileMulti.onchange = async () => {
    const files = Array.from(fileMulti.files || []);
    if (!files.length) return;

    const invalid = files.find(f => !(f.type === "application/pdf" || f.type.startsWith("image/")));
    if (invalid) { alert("Please attach PDF files or images only."); fileMulti.value = ""; return; }

    try {
      const entries = [];
      for (const f of files) {
        const fileId = await saveFileBlob(f);
        entries.push({ fileId, name: f.name });
        _pendingMetaQueue.push({
          fileId,
          defaults: {
            shortDesc: f.name.replace(/\.(pdf|png|jpe?g|gif|webp|tiff?)$/i, ""),
            docDate: (f.name.match(/\b(20\d{2}|19\d{2})[-_\.]?(0[1-9]|1[0-2])[-_\.]?(0[1-9]|[12]\d|3[01])\b/) || [])[0]?.replace(/[_.]/g, "-") || ""
          }
        });
      }
      addExhibits(p.id, entries);
      renderParagraphs();

      if (docMetaModal?.getAttribute("aria-hidden") !== "false") processNextMetaInQueue();
    } catch (e) {
      console.error("Exhibit save failed:", e);
      alert("Could not save one of the selected files. Please try again.");
    }
    fileMulti.value = "";
  };

  mid.append(textLbl, toolbar, editor, strip);

  // Right column (spacer)
  const right = el("div", { className: "row-file" });
  row.append(left, mid, right);
  return row;
}

/* ---------- Paragraph list UI ---------- */
function renderParagraphs() {
  const container = document.querySelector("#paraList");
  if (!container) return;

  const list = loadParas().sort(byNumber).map(ensureRuns);
  const labels = computeExhibitLabels(list);

  container.innerHTML = "";
  list.forEach(p => container.appendChild(renderRow(p, list.length, labels)));
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureAffidavitId();

  const backBtn = $("#back"); if (backBtn) backBtn.onclick = () => history.back();

  // Exhibit label toggle
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

  // Modal refs
  docMetaModal    = $("#docMetaModal");
  docMetaForm     = $("#docMetaForm");
  docMetaErr      = $("#docMetaErrors");
  docMetaSave     = $("#docMetaSave");
  docMetaGuidance = $("#docMetaGuidance");

  if (docMetaModal) {
    docMetaModal.addEventListener("click", (e) => {
      if (e.target === docMetaModal) {
        e.stopPropagation();
        e.preventDefault();
        docMetaErr.textContent = "Please complete the fields and click Save to continue.";
      }
    });
  }
  if (docMetaSave) docMetaSave.onclick = handleDocMetaSave;

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
