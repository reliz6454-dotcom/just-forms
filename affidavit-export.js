/* affidavit-export.js — All export logic (TXT working; PDF stub; DOC future)
   Depends only on localStorage + DOM. Include AFTER affidavit-body.js.
*/

/* ---------- DOM helper ---------- */
const $_ = (sel, el = document) => el.querySelector(sel);

/* ---------- Storage keys ---------- */
const LS_CASE_KEY   = "jf_case";
const LS_OATH_KEY   = "jf_oathType";
const LS_PARAS_KEY  = "jf_paragraphs";
const LS_SCHEME_KEY = "jf_exhibitScheme"; // "letters" | "numbers"

/* ---------- Loaders ---------- */
function exLoadCase()  { try { return JSON.parse(localStorage.getItem(LS_CASE_KEY)  || "{}"); } catch { return {}; } }
function exLoadOath()  { try { return JSON.parse(localStorage.getItem(LS_OATH_KEY)  || "null"); } catch { return null; } }
function exLoadParas() { try { return JSON.parse(localStorage.getItem(LS_PARAS_KEY) || "[]"); } catch { return []; } }
function exLoadScheme(){ return localStorage.getItem(LS_SCHEME_KEY) || "letters"; }
function exSaveScheme(s){ localStorage.setItem(LS_SCHEME_KEY, s); }

/* ---------- Utilities ---------- */
function exAlpha(n) {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
function exByNumber(a, b) { return (a.number || 0) - (b.number || 0); }
function exComputeExhibitLabels(paras, scheme) {
  const map = new Map();
  let idx = 1;
  paras.filter(p => !!p.exhibitFileId).forEach(p => {
    map.set(p.id, scheme === "numbers" ? String(idx) : exAlpha(idx));
    idx++;
  });
  return map;
}

/* ---------- Heading helpers (duplicated here to keep export self-contained) ---------- */
function exPartyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person  = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}
function exCollectNames(list) {
  return (Array.isArray(list) ? list : [])
    .map(exPartyDisplayName)
    .map(s => s.trim())
    .filter(Boolean);
}
function exListWithEtAl(names, limit = 3) {
  if (names.length <= limit) return names.join(", ");
  return names.slice(0, limit).join(", ") + ", et al.";
}
function exRoleLabelFor(side, count, isMotion, movingSide) {
  const isPl = side === "plaintiff";
  const base = isPl ? (count > 1 ? "Plaintiffs" : "Plaintiff")
                    : (count > 1 ? "Defendants" : "Defendant");
  if (!isMotion) return base;
  const movingThisSide = movingSide === (isPl ? "plaintiff" : "defendant");
  const suffix = movingThisSide ? (count > 1 ? "/Moving Parties" : "/Moving Party")
                                : (count > 1 ? "/Responding Parties" : "/Responding Party");
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
  return {
    l1: fileNo ? `Court File No. ${fileNo}` : "Court File No.",
    l2: courtName,
    l3: "BETWEEN:",
    l4: pl,
    l5: plRole,
    l6: "-AND-",
    l7: df,
    l8: dfRole
  };
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

  // Numbered paragraphs with inline exhibit refs
  paras.forEach(p => {
    const label = p.exhibitFileId ? labels.get(p.id) : null;
    const suffix = label ? ` (Exhibit ${label})` : "";
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

    const close = (value) => {
      modal.setAttribute("aria-hidden", "true");
      ok.onclick = cancel.onclick = null;
      resolve(value); // "letters" | "numbers" | null
    };

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

/* ---------- Wire up export buttons ---------- */
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
      if (!scheme) return;
      const paras = exLoadParas().sort(exByNumber);
      const labels = exComputeExhibitLabels(paras, scheme);

      alert(
        `Export will use ${scheme === "letters" ? "Letters (A, B, C…)" : "Numbers (1, 2, 3…)"} for exhibits.\n\n` +
        "(Stub: implement PDF merge here using the computed labels.)"
      );
    };
  }
});
