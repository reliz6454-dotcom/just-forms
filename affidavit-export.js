// affidavit-export.js (ES Module) — MULTI-EXHIBIT UPDATE
// Purpose: TXT export (working) + PDF scheme modal (stub for future merge)

import { LS, loadJSON } from "./constants.js";

/* ---------- DOM helper ---------- */
const $_ = (sel, el = document) => el.querySelector(sel);

/* ---------- Loaders ---------- */
const exLoadCase   = () => loadJSON(LS.CASE, {});
const exLoadOath   = () => loadJSON(LS.OATH, null);
const exLoadParas  = () => loadJSON(LS.PARAS, []);
const exLoadScheme = () =>
  localStorage.getItem(LS.EXHIBIT_SCHEME) ||
  localStorage.getItem("jf_exhibitScheme") || // legacy fallback
  "letters";
const exSaveScheme = (s) => {
  localStorage.setItem(LS.EXHIBIT_SCHEME, s);
  // Optional: write legacy key for a short transition
  localStorage.setItem("jf_exhibitScheme", s);
};

/* ---------- Utilities ---------- */
function exAlpha(n) { let s = ""; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
const exByNumber = (a, b) => (a.number || 0) - (b.number || 0);

/**
 * Compute exhibit labels globally across ALL paragraphs, left→right within each paragraph,
 * top→bottom by paragraph.number. Returns Map<exhibitId, labelString>.
 */
function exComputeExhibitLabels(paras, scheme) {
  const map = new Map(); // exhibitId -> label
  let idx = 1; // first exhibit is A / 1
  paras.sort(exByNumber).forEach(p => {
    (p.exhibits || []).forEach(ex => {
      const label = scheme === "numbers" ? String(idx) : exAlpha(idx);
      map.set(ex.id, label);
      idx++;
    });
  });
  return map;
}

/* ---------- Heading helpers (self-contained for export) ---------- */
function exPartyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}
const exCollectNames = (list) => (Array.isArray(list) ? list : []).map(exPartyDisplayName).map(s => s.trim()).filter(Boolean);
const exListWithEtAl = (names, limit = 3) => names.length <= limit ? names.join(", ") : names.slice(0, limit).join(", ") + ", et al.";
function exRoleLabelFor(side, count, isMotion, movingSide) {
  const isPl = side === "plaintiff";
  const base = isPl ? (count > 1 ? "Plaintiffs" : "Plaintiff") : (count > 1 ? "Defendants" : "Defendant");
  if (!isMotion) return base;
  const movingThisSide = movingSide === (isPl ? "plaintiff" : "defendant");
  const suffix = movingThisSide ? (count > 1 ? "/Moving Parties" : "/Moving Party") : (count > 1 ? "/Responding Parties" : "/Responding Party");
  return base + suffix;
}
function exFormatCourtFile(cf = {}) {
  const parts = [cf.year, cf.assign, cf.suffix].map(v => (v || "").toString().trim()).filter(Boolean);
  return parts.length ? ("CV-" + parts.join("-")) : "";
}
function exBuildGeneralHeading(caseData = {}) {
  const courtName = (caseData.courtName || "ONTARIO SUPERIOR COURT OF JUSTICE").trim();
  const fileNo    = exFormatCourtFile(caseData.courtFile || {});
  const plRaw = exCollectNames(caseData.plaintiffs || []);
  const dfRaw = exCollectNames(caseData.defendants || []);
  const pl = plRaw.length ? exListWithEtAl(plRaw, 3) : "[Add plaintiffs in the General Heading form]";
  const df = dfRaw.length ? exListWithEtAl(dfRaw, 3) : "[Add defendants in the General Heading form]";
  const isMotion = !!(caseData.motion && caseData.motion.isMotion);
  const movingSide = caseData.motion ? caseData.motion.movingSide : null;
  const plRole = exRoleLabelFor("plaintiff", plRaw.length || 1, isMotion, movingSide);
  const dfRole = exRoleLabelFor("defendant", dfRaw.length || 1, isMotion, movingSide);
  return { l1: fileNo ? `Court File No. ${fileNo}` : "Court File No.", l2: courtName, l3: "BETWEEN:", l4: pl, l5: plRole, l6: "-AND-", l7: df, l8: dfRole };
}

/* ---------- TXT export ---------- */
function exBuildAffidavitText() {
  const c   = exLoadCase();
  const d   = c.deponent || {};
  const oath = (exLoadOath() || "").toLowerCase();

  const paras  = exLoadParas().sort(exByNumber);
  const scheme = exLoadScheme();
  const labels = exComputeExhibitLabels(paras, scheme);

  const gh = exBuildGeneralHeading(c);

  const lines = [];
  // General heading (8 lines)
  lines.push(gh.l1, gh.l2, gh.l3, gh.l4, gh.l5, gh.l6, gh.l7, gh.l8, "");

  // Title line
  const nameOf = (person) => [person?.first, person?.last].filter(Boolean).join(" ").trim();
  const roleLower = (d.role || "").toLowerCase();
  let title = nameOf(d);
  if (!title) {
    if (roleLower === "plaintiff" && Array.isArray(c.plaintiffs) && c.plaintiffs[0]) title = nameOf(c.plaintiffs[0]);
    if (roleLower === "defendant" && Array.isArray(c.defendants) && c.defendants[0]) title = nameOf(c.defendants[0]);
  }
  lines.push(`Affidavit of ${title || ""}`, "");

  // Opening sentence
  const cityPart     = d.city ? `of the City of ${d.city}` : "";
  const provincePart = d.prov ? `in the Province of ${d.prov}` : "";
  let capacityPhrase = "";
  switch (roleLower) {
    case "plaintiff":
    case "defendant": capacityPhrase = `the ${roleLower}`; break;
    case "lawyer":    capacityPhrase = "the lawyer for a party"; break;
    case "officer":
    case "employee":  capacityPhrase = d.roleDetail ? `the ${d.roleDetail} of a party` : `an ${roleLower} of a party`; break;
    default:          capacityPhrase = d.role ? `the ${d.role}` : "";
  }
  const oathText = oath === "swear" ? "MAKE OATH AND SAY:" : "AFFIRM:";
  const opening = [title ? `I, ${title}` : "I,", cityPart, provincePart, capacityPhrase || null].filter(Boolean).join(", ");
  lines.push(`${opening}, ${oathText}`, "");

  // Numbered paragraphs with inline exhibit refs (multi-exhibit)
  paras.forEach(p => {
    const ids = (p.exhibits || []).map(ex => labels.get(ex.id)).filter(Boolean);
    const suffix = ids.length ? ` (Exhibit${ids.length > 1 ? "s" : ""} ${ids.join(", ")})` : "";
    lines.push(`${p.number}. ${p.text || ""}${suffix}`);
  });

  return lines.join("\n");
}

function exDownload(name, blobText) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([blobText], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ---------- PDF export (stub) ---------- */
function exAskExhibitScheme() {
  return new Promise((resolve) => {
    const modal  = document.getElementById("schemeModal");
    const ok     = document.getElementById("schemeOk");
    const cancel = document.getElementById("schemeCancel");
    const form   = document.getElementById("schemeForm");

    // Preselect based on current preference
    const current = exLoadScheme();
    const currentRadio = form?.querySelector(`input[name="scheme"][value="${current}"]`);
    if (currentRadio) currentRadio.checked = true;

    const close = (value) => { modal.setAttribute("aria-hidden", "true"); ok.onclick = cancel.onclick = null; resolve(value); };

    modal.setAttribute("aria-hidden", "false");
    ok.onclick = () => {
      const chosen = new FormData(form).get("scheme") || "letters";
      exSaveScheme(chosen);
      close(chosen);
    };
    cancel.onclick = () => close(null);
    modal.onclick = (e) => { if (e.target === modal) close(null); };
  });
}

/* ---------- Wire buttons ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const btnTxt = $_("#exportTxt");
  const btnPdf = $_("#exportPdf");

  if (btnTxt) {
    btnTxt.onclick = () => {
      const txt = exBuildAffidavitText();
      exDownload("Affidavit.txt", txt);
    };
  }

  if (btnPdf) {
    btnPdf.onclick = async () => {
      const scheme = await exAskExhibitScheme();
      if (!scheme) return; // user canceled

      // Compute global exhibit labels (for future PDF merge ordering)
      const paras = exLoadParas().sort(exByNumber);
      const labels = exComputeExhibitLabels(paras, scheme);
      // 'labels' is Map<exhibitId, label>. Use when assembling a merged PDF.

      alert(
        `Export will use ${scheme === "letters" ? "Letters (A, B, C…)" : "Numbers (1, 2, 3…)"}.` +
        "\n\n(Stub: implement PDF merge here using the computed labels in paragraph/exhibit order.)"
      );
    };
  }
});
