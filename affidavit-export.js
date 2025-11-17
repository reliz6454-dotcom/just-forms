// affidavit-export.js — TXT + PDF exports (affidavit, exhibits, full package)
// Uses TeX Gyre Termes fonts from /fonts and pdf-lib (loaded in affidavit-body.html)

import { LS, loadJSON } from "./constants.js";

/* ---------------------------
 *  Basic loaders + helpers
 * --------------------------- */

const $_ = (sel, el = document) => el.querySelector(sel);

const exLoadCase   = () => loadJSON(LS.CASE, {});
const exLoadOath   = () => loadJSON(LS.OATH, null);
const exLoadParas  = () => loadJSON(LS.PARAS, []);
const exLoadScheme = () =>
  localStorage.getItem(LS.EXHIBIT_SCHEME) ||
  localStorage.getItem("jf_exhibitScheme") ||
  "letters";

const ZWSP = /\u200B/g;
const collapse = (s) =>
  String(s || "")
    .replace(ZWSP, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

const byNo = (a, b) => (a.number || 0) - (b.number || 0);

function exAlpha(n) {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function computeExLabels(paras, scheme) {
  const map = new Map();
  let idx = 1;
  paras.sort(byNo).forEach((p) => {
    (p.exhibits || []).forEach((ex) => {
      map.set(ex.id, scheme === "numbers" ? String(idx) : exAlpha(idx));
      idx++;
    });
  });
  return map;
}

/* ---------- Heading helpers (match your preview) ---------- */

function partyName(p) {
  if (!p) return "";
  const co = (p.company || "").trim();
  const person = [p.first || "", p.last || ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return co || person || "";
}

const names = (arr) => (Array.isArray(arr) ? arr : []).map(partyName).filter(Boolean);
const etAl = (xs, limit = 3) =>
  xs.length <= limit ? xs.join(", ") : xs.slice(0, limit).join(", ") + ", et al.";

function roleFor(side, count, isMotion, movingSide) {
  const isPl = side === "plaintiff";
  const base = isPl
    ? count > 1
      ? "Plaintiffs"
      : "Plaintiff"
    : count > 1
    ? "Defendants"
    : "Defendant";
  if (!isMotion) return base;
  const moving = movingSide === (isPl ? "plaintiff" : "defendant");
  return (
    base +
    (moving
      ? count > 1
        ? "/Moving Parties"
        : "/Moving Party"
      : count > 1
      ? "/Responding Parties"
      : "/Responding Party")
  );
}

const fmtFile = (cf = {}) => {
  const parts = [cf.year, cf.assign, cf.suffix]
    .map((v) => (v || "").toString().trim())
    .filter(Boolean);
  return parts.length ? "CV-" + parts.join("-") : "";
};

function buildGH(c = {}) {
  const court = (c.courtName || "ONTARIO SUPERIOR COURT OF JUSTICE").trim();
  const file = fmtFile(c.courtFile || {});
  const plRaw = names(c.plaintiffs || []);
  const dfRaw = names(c.defendants || []);

  const pl = plRaw.length
    ? etAl(plRaw, 3)
    : "[Add plaintiffs in the General Heading form]";
  const df = dfRaw.length
    ? etAl(dfRaw, 3)
    : "[Add defendants in the General Heading form]";

  const isMotion = !!(c.motion && c.motion.isMotion);
  const moving = c.motion ? c.motion.movingSide : null;

  return {
    l1: file ? `Court File No. ${file}` : "Court File No.",
    l2: court,
    l3: "BETWEEN:",
    l4: pl,
    l5: roleFor("plaintiff", plRaw.length || 1, isMotion, moving),
    l6: "-AND-",
    l7: df,
    l8: roleFor("defendant", dfRaw.length || 1, isMotion, moving),
    fileNo: file
  };
}

/* ----------------------------
 *  Exhibit chip → text helpers
 * ---------------------------- */

function chipText(spanEl, labels) {
  const id = spanEl.getAttribute("data-ex-id") || "";
  const lab = labels.get(id);
  return lab ? `(exhibit "${lab}")` : `(exhibit "?")`;
}

function isOL(el) {
  const tag = el.tagName?.toLowerCase() || "";
  if (tag === "ol") return true;
  const dt = el.getAttribute?.("data-type") || "";
  if (dt === "orderedList") return true;
  const cls = el.className || "";
  if (/\bordered[- ]?list\b/i.test(cls)) return true;
  const lt = el.getAttribute?.("data-list-type") || "";
  if (/alpha|decimal/i.test(lt)) return true;
  return false;
}
function isUL(el) {
  const tag = el.tagName?.toLowerCase() || "";
  if (tag === "ul") return true;
  const dt = el.getAttribute?.("data-type") || "";
  if (dt === "bulletList") return true;
  const cls = el.className || "";
  if (/\bbullet[- ]?list\b/i.test(cls)) return true;
  return false;
}

function aIndex(idx) {
  let n = idx + 1,
    s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/* Collect inline text (skipping nested lists, which are handled separately) */
function collectInlineNoLists(node, labels) {
  if (node.nodeType === Node.TEXT_NODE) return collapse(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node;
  const tag = el.tagName.toLowerCase();
  if (tag === "span" && el.classList.contains("exh-chip")) return chipText(el, labels);
  if (tag === "br") return " ";
  if (isOL(el) || isUL(el)) return "";

  let acc = [];
  for (const ch of el.childNodes) acc.push(collectInlineNoLists(ch, labels));
  return collapse(acc.join(" "));
}

/* Serialize paragraph HTML → array of lines (chips preserved) */
function renderPara(p, labels) {
  const html = (p.html || "").trim();

  // Fallback from runs[]
  if (!html) {
    const runs = Array.isArray(p.runs)
      ? p.runs
      : [
          { type: "text", text: p.text || "" },
          ...(p.exhibits || []).map((ex) => ({ type: "exhibit", exId: ex.id }))
        ];
    const s = collapse(
      runs
        .map((r) => {
          if (r.type === "text") return r.text || "";
          if (r.type === "exhibit") {
            const lab = labels.get(r.exId);
            return lab ? `(exhibit "${lab}")` : "";
          }
          return "";
        })
        .join(" ")
    );
    return s ? [s] : [];
  }

  const root = document.createElement("div");
  root.innerHTML = html;

  const out = [];

  const walk = (node, depth = 0) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;

    if (isOL(el) || isUL(el)) {
      const ordered = isOL(el);
      const start = ordered
        ? Math.max(parseInt(el.getAttribute?.("start") || "1", 10) || 1, 1)
        : 1;
      let idx = start - 1;

      for (const li of el.children) {
        if (li.tagName.toLowerCase() !== "li") continue;
        const indent = "  ".repeat(depth);
        const marker = ordered ? `${aIndex(idx++)}. ` : "• ";
        const text = collectInlineNoLists(li, labels);
        out.push(indent + marker + text);

        // nested lists
        for (const sub of li.children) {
          if (isOL(sub) || isUL(sub)) walk(sub, depth + 1);
        }
      }
      return;
    }

    const tag = el.tagName.toLowerCase();
    if (tag === "p" || tag === "div") {
      const t = collectInlineNoLists(el, labels);
      if (t) out.push(t);
      for (const ch of el.childNodes) walk(ch, depth);
      return;
    }

    for (const ch of el.childNodes) walk(ch, depth);
  };

  walk(root);

  if (out.length === 0) {
    const t = collectInlineNoLists(root, labels);
    return t ? [t] : [];
  }

  // Greedy merge marker-only lines with following text lines
  const markerOnly = /^\s*(?:•|[a-z]+\.|[a-z]{2,}\.)\s*$/i;
  const markerStart = /^\s*(?:• |[a-z]+\. )/i;

  for (let i = 0; i < out.length; i++) {
    if (!markerOnly.test(out[i])) continue;

    let j = i + 1;
    while (j < out.length && out[j].trim() === "") out.splice(j, 1);

    while (j < out.length && !markerStart.test(out[j]) && out[j].trim() !== "") {
      out[i] = out[i].trimEnd() + " " + out[j].trimStart();
      out.splice(j, 1);
    }
  }

  // Drop chip-only duplicate lines
  const chipLine = /^\(exhibit\s+"([^"]+)"\)$/i;
  for (let i = 1; i < out.length; i++) {
    const m = out[i].match(chipLine);
    if (m && out[i - 1].includes(`(exhibit "${m[1]}")`)) {
      out.splice(i, 1);
      i--;
    }
  }

  // Deduplicate consecutive lines
  for (let i = 1; i < out.length; i++) {
    if (out[i] === out[i - 1]) {
      out.splice(i, 1);
      i--;
    }
  }

  return out;
}

/* -----------------------
 * TXT Affidavit builder
 * ----------------------- */

function buildAffidavitText(includeBacksheet, swornDateUpper) {
  const c = exLoadCase();
  const d = c.deponent || {};
  const oath = (exLoadOath() || "").toLowerCase();
  const paras = exLoadParas().sort(byNo);

  const scheme = exLoadScheme();
  const labels = computeExLabels(paras, scheme);
  const gh = buildGH(c);

  const lines = [];

  // General heading
  lines.push(gh.l1, gh.l2, gh.l3, gh.l4, gh.l5, gh.l6, gh.l7, gh.l8, "");

  // Title
  const nameOf = (x) =>
    [x?.first, x?.last].filter(Boolean).join(" ").trim();
  const role = (d.role || "").toLowerCase();
  let title = nameOf(d);
  if (!title) {
    if (role === "plaintiff" && c.plaintiffs?.[0]) title = nameOf(c.plaintiffs[0]);
    if (role === "defendant" && c.defendants?.[0]) title = nameOf(c.defendants[0]);
  }
  lines.push(`Affidavit of ${title || ""}`, "");

  // Intro / opening line
  const city = d.city ? `of the City of ${d.city}` : "";
  const prov = d.prov ? `in the Province of ${d.prov}` : "";
  let cap = "";
  switch (role) {
    case "plaintiff":
    case "defendant":
      cap = `the ${role}`;
      break;
    case "lawyer":
      cap = "the lawyer for a party";
      break;
    case "officer":
    case "employee":
      cap = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${role} of a party`;
      break;
    default:
      cap = d.role ? `the ${d.role}` : "";
  }
  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const opening = [title ? `I, ${title}` : "I,", city, prov, cap || null]
    .filter(Boolean)
    .join(", ");
  lines.push(`${opening}, ${oathText}`, "");

  // Paragraphs: N. + head, lists beneath
  paras.forEach((p) => {
    const paraLines = renderPara(p, labels);
    const listStart = /^\s*(?:• |[a-z]+\. )/i;
    const head = [];
    const list = [];
    let inList = false;
    for (const ln of paraLines) {
      if (!inList && listStart.test(ln)) inList = true;
      (inList ? list : head).push(ln);
    }

    if (head.length === 0 && list.length === 0) {
      lines.push(`${p.number}.`);
      lines.push("");
      return;
    }

    if (head.length) {
      lines.push(`${p.number}. ${head[0]}`);
      for (let i = 1; i < head.length; i++) lines.push(`   ${head[i]}`);
    } else {
      lines.push(`${p.number}.`);
    }
    for (const ln of list) lines.push(`   ${ln}`);
    lines.push("");
  });

  // Simple jurat text note
  lines.push("JURAT", "");
  lines.push(
    "Sworn or Affirmed before me:",
    "   (select one): [ ] in person   OR   [ ] by video conference",
    "",
    "In person:",
    "   at the (City, Town, etc.) of ______________________",
    "   in the (County, Regional Municipality, etc.) of ______________________,",
    "   on (date) ______________________.",
    "",
    "Signature of Commissioner: ____________________________",
    "Signature of Deponent:    ____________________________",
    ""
  );

  if (includeBacksheet) {
    const shortTitle = (() => {
      const first = (p) => {
        const co = (p?.company || "").trim();
        const person = [p?.first || "", p?.last || ""]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        return co || person || "";
      };
      const p1 = first((c.plaintiffs || [])[0]) || "Plaintiff";
      const d1 = first((c.defendants || [])[0]) || "Defendant";
      return `${p1} v. ${d1}`;
    })();

    lines.push("");
    lines.push("BACKSHEET", "");
    lines.push(gh.l2); // Court name
    lines.push(`Court File No.: ${gh.fileNo || ""}`);
    lines.push(shortTitle);
    lines.push("");
    const deponentName = [d.first || "", d.last || ""]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    const swornLine = swornDateUpper
      ? `SWORN ${swornDateUpper}`
      : "Sworn __________________________";
    lines.push(`AFFIDAVIT OF ${deponentName.toUpperCase()}`);
    lines.push(swornLine);
  }

  return lines.join("\n");
}

/* --------------------------
 *  IndexedDB: read exhibits
 * -------------------------- */

const DB = "affidavitDB";
const STORE = "files";

const exOpenDB = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

async function exReadDoc(id) {
  const db = await exOpenDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).get(id);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}

/* Return array of { exId, fileId, label, name, metaRec } in label order */
async function exCollectExhibits() {
  const paras = exLoadParas().sort(byNo);
  const scheme = exLoadScheme();
  const labels = computeExLabels(paras, scheme);

  const seen = new Set();
  const out = [];

  for (const p of paras) {
    for (const ex of p.exhibits || []) {
      if (!ex.fileId || seen.has(ex.fileId)) continue;
      seen.add(ex.fileId);
      const label = labels.get(ex.id) || "?";
      const rec = await exReadDoc(ex.fileId);
      out.push({
        exId: ex.id,
        fileId: ex.fileId,
        label,
        name: ex.name || rec?.name || `Exhibit ${label}`,
        meta: rec?.meta || {},
        blob: rec?.blob || null,
        type: rec?.type || ""
      });
    }
  }

  // sort by label in logical order (A, B, C or 1, 2, 3)
  out.sort((a, b) => {
    const aa = a.label;
    const bb = b.label;
    if (/^\d+$/.test(aa) && /^\d+$/.test(bb)) return Number(aa) - Number(bb);
    return aa.localeCompare(bb);
  });

  return out;
}

function exHasAnyExhibits() {
  const paras = exLoadParas();
  return paras.some((p) => (p.exhibits || []).length > 0);
}

/* ---------------------------
 *  PDF low-level helpers
 * --------------------------- */

const { PDFDocument, rgb } = (window.PDFLib || {});

async function ensurePdfLib() {
  if (!PDFDocument || !rgb) {
    alert("PDF export requires pdf-lib (could not find PDFLib on window).");
    throw new Error("PDFLib missing");
  }
}

async function embedSerifFonts(pdfDoc) {
  const fonts = {};

  // Try custom TeX Gyre Termes fonts (your /fonts folder)
  async function tryEmbed(key, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      fonts[key] = await pdfDoc.embedFont(new Uint8Array(bytes));
    } catch (e) {
      // ignore — fallback will handle it
    }
  }

  await tryEmbed("regular", "fonts/texgyretermes-regular.otf");
  await tryEmbed("italic",  "fonts/texgyretermes-italic.otf");
  await tryEmbed("bold",    "fonts/texgyretermes-bold.otf");

  // Fallback to built-in Times family if custom fonts missing
  if (!fonts.regular) {
    fonts.regular = await pdfDoc.embedStandardFont("Times-Roman");
  }
  if (!fonts.italic) {
    fonts.italic = await pdfDoc.embedStandardFont("Times-Italic");
  }
  if (!fonts.bold) {
    fonts.bold = await pdfDoc.embedStandardFont("Times-Bold");
  }

  return fonts;
}

/* Helper to draw multi-line text with alignment + line spacing
   (used by exhibits + backsheet; affidavit body uses its own wrapper) */
function drawLines(page, lines, opts) {
  const {
    font,
    size = 12,
    x,
    yStart,
    width,
    lineGap = 12,
    align = "left" // left | center | right
  } = opts;

  let y = yStart;

  for (const line of lines) {
    const text = line || "";
    const textWidth = font.widthOfTextAtSize(text, size);
    let drawX = x;

    if (align === "center") {
      drawX = x + (width - textWidth) / 2;
    } else if (align === "right") {
      drawX = x + width - textWidth;
    }

    page.drawText(text, { x: drawX, y, size, font });
    y -= size + lineGap;
  }

  return y;
}

/* ---------------------------
 *  PDF: affidavit main body
 * --------------------------- */

async function buildAffidavitPdfDoc(swornDateUpperForBacksheet) {
  await ensurePdfLib();
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedSerifFonts(pdfDoc);
  const fontReg = fonts.regular;
  const fontBold = fonts.bold;

  // Initial page + layout constants
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  const marginLeft = 72;     // 1 inch
  const marginRight = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const contentWidth = width - marginLeft - marginRight;
  const lineGap = 12;        // extra gap beyond font size (12pt) ≈ double spacing

  // Current y cursor
  let y = height - marginTop;

  // Case data
  const c = exLoadCase();
  const d = c.deponent || {};
  const oath = (exLoadOath() || "").toLowerCase();
  const paras = exLoadParas().sort(byNo);

  const scheme = exLoadScheme();
  const labels = computeExLabels(paras, scheme);
  const gh = buildGH(c);

  // --- Helpers just for this function ---

  function newPage() {
    page = pdfDoc.addPage();
    ({ width, height } = page.getSize());
    y = height - marginTop;
  }

  function ensureSpace(linesNeeded = 1, size = 12) {
    const needed = linesNeeded * (size + lineGap);
    if (y - needed < marginBottom) {
      newPage();
    }
  }

  function wrapText(text, font, size, maxWidth) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let current = "";

    for (const w of words) {
      if (!w) continue;
      const candidate = current ? current + " " + w : w;
      const wWidth = font.widthOfTextAtSize(candidate, size);
      if (wWidth <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    if (!lines.length) lines.push(""); // keep at least one line
    return lines;
  }

  function drawWrappedLines(rawLines, opts) {
    const {
      font,
      size = 12,
      align = "left",
      extraGapAfter = 0
    } = opts;

    for (const raw of rawLines) {
      const text = String(raw || "");
      // Blank line: just advance one line
      if (!text.trim()) {
        ensureSpace(1, size);
        y -= size + lineGap;
        continue;
      }

      const segments = wrapText(text, font, size, contentWidth);
      for (const seg of segments) {
        ensureSpace(1, size);

        const textWidth = font.widthOfTextAtSize(seg, size);
        let drawX = marginLeft;
        if (align === "center") {
          drawX = marginLeft + (contentWidth - textWidth) / 2;
        } else if (align === "right") {
          drawX = marginLeft + contentWidth - textWidth;
        }

        page.drawText(seg, { x: drawX, y, size, font });
        y -= size + lineGap;
      }
    }

    if (extraGapAfter) {
      ensureSpace(extraGapAfter / (size + lineGap), size);
      y -= extraGapAfter;
    }
  }

  // --- Layout: heading ---

  // Court File No. (right aligned)
  drawWrappedLines([gh.l1], {
    font: fontReg,
    size: 12,
    align: "right"
  });

  // Court name centred
  drawWrappedLines([gh.l2], {
    font: fontReg,
    size: 12,
    align: "center",
    extraGapAfter: 6
  });

  // BETWEEN:
  drawWrappedLines([gh.l3], {
    font: fontBold,
    size: 12,
    align: "left"
  });

  // Plaintiffs / role
  drawWrappedLines([gh.l4], {
    font: fontReg,
    size: 12,
    align: "center"
  });
  drawWrappedLines([gh.l5], {
    font: fontReg,
    size: 12,
    align: "right"
  });

  // -AND-
  drawWrappedLines([gh.l6], {
    font: fontBold,
    size: 12,
    align: "center"
  });

  // Defendants / role
  drawWrappedLines([gh.l7], {
    font: fontReg,
    size: 12,
    align: "center"
  });
  drawWrappedLines([gh.l8], {
    font: fontReg,
    size: 12,
    align: "right",
    extraGapAfter: 2 * (12 + lineGap)
  });

  // --- Title "AFFIDAVIT OF ..." ---

  const nameOf = (x) =>
    [x?.first, x?.last].filter(Boolean).join(" ").trim();
  const role = (d.role || "").toLowerCase();
  let title = nameOf(d);
  if (!title) {
    if (role === "plaintiff" && c.plaintiffs?.[0]) title = nameOf(c.plaintiffs[0]);
    if (role === "defendant" && c.defendants?.[0]) title = nameOf(c.defendants[0]);
  }

  drawWrappedLines(
    [`AFFIDAVIT OF ${String(title || "").toUpperCase()}`],
    {
      font: fontBold,
      size: 12,
      align: "center",
      extraGapAfter: 2 * (12 + lineGap)
    }
  );

  // --- Intro line ---

  const city = d.city ? `of the City of ${d.city}` : "";
  const prov = d.prov ? `in the Province of ${d.prov}` : "";
  let cap = "";
  switch (role) {
    case "plaintiff":
    case "defendant":
      cap = `the ${role}`;
      break;
    case "lawyer":
      cap = "the lawyer for a party";
      break;
    case "officer":
    case "employee":
      cap = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${role} of a party`;
      break;
    default:
      cap = d.role ? `the ${d.role}` : "";
  }
  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const opening = [title ? `I, ${title}` : "I,", city, prov, cap || null]
    .filter(Boolean)
    .join(", ");
  const openingLine = `${opening}, ${oathText}`;

  drawWrappedLines([openingLine], {
    font: fontReg,
    size: 12,
    align: "left",
    extraGapAfter: 12 + lineGap
  });

  // --- Paragraphs (with lists) ---

  const listStart = /^\s*(?:• |[a-z]+\. )/i;

  for (const p of paras) {
    const paraLines = renderPara(p, labels);
    const head = [];
    const list = [];
    let inList = false;

    for (const ln of paraLines) {
      if (!inList && listStart.test(ln)) inList = true;
      (inList ? list : head).push(ln);
    }

    if (head.length === 0 && list.length === 0) {
      // Empty numbered paragraph
      drawWrappedLines([`${p.number}.`], {
        font: fontReg,
        size: 12,
        align: "left",
        extraGapAfter: 12 + lineGap
      });
      continue;
    }

    if (head.length) {
      const first = `${p.number}. ${head[0]}`;
      drawWrappedLines([first], {
        font: fontReg,
        size: 12,
        align: "left"
      });
      if (head.length > 1) {
        const rest = head.slice(1).map((ln) => `   ${ln}`);
        drawWrappedLines(rest, {
          font: fontReg,
          size: 12,
          align: "left"
        });
      }
    } else {
      drawWrappedLines([`${p.number}.`], {
        font: fontReg,
        size: 12,
        align: "left"
      });
    }

    if (list.length) {
      const listLines = list.map((ln) => `   ${ln}`);
      drawWrappedLines(listLines, {
        font: fontReg,
        size: 12,
        align: "left"
      });
    }

    // extra blank line between paragraphs
    drawWrappedLines([""], {
      font: fontReg,
      size: 12,
      align: "left"
    });
  }

  // --- Jurat block at end (will spill to next page if needed) ---

  const juratLines = [
    "Sworn or Affirmed before me:",
    "   (select one): [ ] in person   OR   [ ] by video conference",
    "",
    "In person:",
    "   at the (City, Town, etc.) of ______________________",
    "   in the (County, Regional Municipality, etc.) of ______________________,",
    "   on (date) ______________________.",
    "",
    "Signature of Commissioner: ____________________________",
    "Signature of Deponent:    ____________________________"
  ];

  drawWrappedLines(juratLines, {
    font: fontReg,
    size: 12,
    align: "left"
  });

  return pdfDoc;
}

/* --------------------------
 *  PDF: Exhibit cover pages
 * -------------------------- */

async function buildExhibitsPdfDoc() {
  await ensurePdfLib();
  const exhibits = await exCollectExhibits();
  if (!exhibits.length) {
    alert("There are no exhibits attached to this affidavit.");
    return null;
  }

  const c = exLoadCase();
  const d = c.deponent || {};
  const deponentName = [d.first || "", d.last || ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const pdfDoc = await PDFDocument.create();
  const fonts = await embedSerifFonts(pdfDoc);
  const fontReg = fonts.regular;
  const fontBold = fonts.bold;

  for (const ex of exhibits) {
    const coverPage = pdfDoc.addPage();
    const { width, height } = coverPage.getSize();
    const marginLeft = 72;
    const marginRight = 72;
    const contentWidth = width - marginLeft - marginRight;
    const lineGap = 12;

    let y = height - 144;

    // "Exhibit A"
    y = drawLines(coverPage, [`Exhibit ${ex.label}`], {
      font: fontBold,
      size: 12,
      x: marginLeft,
      yStart: y,
      width: contentWidth,
      lineGap,
      align: "center"
    });

    // "This is exhibit A to the affidavit of ..."
    const desc =
      ex.meta?.shortDesc ||
      `This is exhibit ${ex.label} to the affidavit of ${deponentName || "the deponent"}.`;

    y -= 12;
    y = drawLines(coverPage, [desc], {
      font: fontReg,
      size: 12,
      x: marginLeft,
      yStart: y,
      width: contentWidth,
      lineGap,
      align: "center"
    });

    // Signature line
    y -= 36;
    const sigWidth = 240;
    const sigX = marginLeft + (contentWidth - sigWidth) / 2;
    const sigY = y;
    coverPage.drawLine({
      start: { x: sigX, y: sigY },
      end: { x: sigX + sigWidth, y: sigY },
      thickness: 0.5,
      color: rgb(0, 0, 0)
    });
    y -= 18;
    drawLines(
      coverPage,
      ["Signature of Commissioner (or as may be)"],
      {
        font: fontReg,
        size: 12,
        x: marginLeft,
        yStart: y,
        width: contentWidth,
        lineGap,
        align: "center"
      }
    );

    // Append exhibit file pages, if any
    if (ex.blob && ex.type === "application/pdf") {
      const bytes = new Uint8Array(await ex.blob.arrayBuffer());
      const srcDoc = await PDFDocument.load(bytes);
      const copied = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const p of copied) pdfDoc.addPage(p);
    } else if (ex.blob && ex.type.startsWith("image/")) {
      const imgBytes = new Uint8Array(await ex.blob.arrayBuffer());
      let img;
      if (ex.type === "image/png") {
        img = await pdfDoc.embedPng(imgBytes);
      } else {
        img = await pdfDoc.embedJpg(imgBytes);
      }
      const imgPage = pdfDoc.addPage();
      const { width: pw, height: ph } = imgPage.getSize();
      const scale = Math.min((pw - 72 * 2) / img.width, (ph - 72 * 2) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      imgPage.drawImage(img, {
        x: (pw - w) / 2,
        y: (ph - h) / 2,
        width: w,
        height: h
      });
    }
  }

  return pdfDoc;
}

/* --------------------------
 *  PDF: Backsheet page
 * -------------------------- */

async function buildBacksheetPdfDoc(swornDateUpper) {
  await ensurePdfLib();
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedSerifFonts(pdfDoc);
  const fontReg = fonts.regular;
  const fontBold = fonts.bold;

  const c = exLoadCase();
  const d = c.deponent || {};

  const gh = buildGH(c);
  const where = (c.commencedAt || "").trim();
  const court = gh.l2;
  const fileNo = gh.fileNo;

  const namesList = (arr) => (Array.isArray(arr) ? arr : []).map(partyName).filter(Boolean);
  const etAlName = (arr) => {
    const ns = namesList(arr);
    if (ns.length <= 1) return ns[0] || "";
    return `${ns[0]}, et al.`;
  };

  const plNames = etAlName(c.plaintiffs || []);
  const dfNames = etAlName(c.defendants || []);
  const isMotion = !!(c.motion && c.motion.isMotion);
  const movingSide = c.motion ? c.motion.movingSide : null;

  const plRole = roleFor(
    "plaintiff",
    (c.plaintiffs || []).length || 1,
    isMotion,
    movingSide
  );
  const dfRole = roleFor(
    "defendant",
    (c.defendants || []).length || 1,
    isMotion,
    movingSide
  );

  const deponentFull = [d.first || "", d.last || ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const marginLeft = 72;
  const marginRight = 72;
  const contentWidth = width - marginLeft - marginRight;
  const lineGap = 10;

  let y = height - 72;

  // Court file no. top-right
  y = drawLines(page, [`Court File No.: ${fileNo || ""}`], {
    font: fontReg,
    size: 12,
    x: marginLeft,
    yStart: y,
    width: contentWidth,
    lineGap,
    align: "right"
  });

  // Parties row
  y -= 24;
  const partiesLines = [
    `${plNames}`,
    `${plRole}`,
    "",
    `${dfNames}`,
    `${dfRole}`
  ];
  drawLines(page, partiesLines, {
    font: fontReg,
    size: 12,
    x: marginLeft,
    yStart: y,
    width: contentWidth,
    lineGap,
    align: "center"
  });

  // Court + commenced at
  y -= 5 * (12 + lineGap);
  y = drawLines(page, [court], {
    font: fontReg,
    size: 12,
    x: marginLeft,
    yStart: y,
    width: contentWidth,
    lineGap,
    align: "center"
  });
  y = drawLines(
    page,
    [`Proceeding commenced at ${where || "(place)"}`],
    {
      font: fontReg,
      size: 12,
      x: marginLeft,
      yStart: y,
      width: contentWidth,
      lineGap,
      align: "center"
    }
  );

  // Affidavit title and sworn line
  y -= 2 * (12 + lineGap);
  y = drawLines(
    page,
    [`AFFIDAVIT OF ${deponentFull.toUpperCase()}`],
    {
      font: fontBold,
      size: 12,
      x: marginLeft,
      yStart: y,
      width: contentWidth,
      lineGap,
      align: "center"
    }
  );

  const swornLine = swornDateUpper
    ? `SWORN ${swornDateUpper}`
    : "Sworn [date left blank]";
  y = drawLines(page, [swornLine], {
    font: fontBold,
    size: 12,
    x: marginLeft,
    yStart: y,
    width: contentWidth,
    lineGap,
    align: "center"
  });

  return pdfDoc;
}

/* --------------------------
 *  Sworn date prompt
 * -------------------------- */

async function promptBacksheetDateUpper() {
  const raw = window.prompt(
    "Backsheet sworn date (optional):\n\nEnter a date as you want it to appear (e.g., August 10, 2025), or leave blank and click OK to omit.",
    ""
  );
  if (raw === null) {
    // user cancelled; treat as leaving blank but still exporting
    return "";
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed.toUpperCase() : "";
}

/* --------------------------
 *  Wire up export buttons
 * -------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const btnTxt = $_("#exportTxt");
  const btnAffPdf = $_("#exportAffPdf");
  const btnExhPdf = $_("#exportExhPdf");
  const btnFullPdf = $_("#exportFullPdf");
  const cbAppendBack = $_("#appendBackTxt");

  // Default TXT "append backsheet" only when there are no exhibits
  if (cbAppendBack) {
    cbAppendBack.checked = !exHasAnyExhibits();
  }

  if (btnTxt) {
    btnTxt.onclick = async () => {
      let swornUpper = "";
      const wantBack = cbAppendBack ? cbAppendBack.checked : false;
      if (wantBack) {
        swornUpper = await promptBacksheetDateUpper();
      }
      const txt = buildAffidavitText(wantBack, swornUpper);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
      a.download = "Affidavit.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    };
  }

  if (btnAffPdf) {
    btnAffPdf.onclick = async () => {
      try {
        const pdfDoc = await buildAffidavitPdfDoc();
        const bytes = await pdfDoc.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Affidavit.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (e) {
        console.error(e);
      }
    };
  }

  if (btnExhPdf) {
    btnExhPdf.onclick = async () => {
      try {
        const pdfDoc = await buildExhibitsPdfDoc();
        if (!pdfDoc) return;
        const bytes = await pdfDoc.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Exhibits.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (e) {
        console.error(e);
      }
    };
  }

  if (btnFullPdf) {
    btnFullPdf.onclick = async () => {
      try {
        const swornUpper = await promptBacksheetDateUpper();

        const affDoc = await buildAffidavitPdfDoc(swornUpper);
        const exhDoc = await buildExhibitsPdfDoc();
        const backDoc = await buildBacksheetPdfDoc(swornUpper);

        const full = await PDFDocument.create();

        // Affidavit body pages
        if (affDoc) {
          const affPages = await full.copyPages(affDoc, affDoc.getPageIndices());
          affPages.forEach((p) => full.addPage(p));
        }

        // Exhibits
        if (exhDoc) {
          const exhPages = await full.copyPages(exhDoc, exhDoc.getPageIndices());
          exhPages.forEach((p) => full.addPage(p));
        }

        // Backsheet last
        if (backDoc) {
          const backPages = await full.copyPages(backDoc, backDoc.getPageIndices());
          backPages.forEach((p) => full.addPage(p));
        }

        const bytes = await full.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Affidavit_Full_Package.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (e) {
        console.error(e);
      }
    };
  }
});
