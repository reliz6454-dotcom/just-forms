// constants.js — shared storage keys + tiny JSON helpers (ES module)

export const LS = {
  CASE: "jf_case",                   // general heading + deponent info
  OATH: "jf_oathType",               // "swear" | "affirm"
  PARAS: "jf_paragraphs",            // [{id, number, text, exhibits[], runs[]}, ...]
  EXHIBIT_SCHEME: "jf_exhibitScheme",// "letters" | "numbers"
  AFFIDAVIT_ID: "jf_affidavitId",    // stable id for this affidavit session
  DOC_SCHEMA: "jf_docSchema",        // optional UI schema override for intake modal
  DOC_GUIDANCE: "jf_docGuidance"     // optional override for guidance text/examples
};

// Safe JSON read/write wrappers
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // ignore quota/serialize errors for now
  }
}

/**
 * Default schema used by the Document Intake Modal (affidavit index–oriented).
 * Each field: { key, label, type, required?, choices? }
 * Note: docDate is optional; UI provides a "no date" checkbox.
 */
export function getDefaultDocSchema() {
  return [
    { key: "shortDesc", label: "Short description", type: "textarea", required: true },
    { key: "docDate",   label: "Document date",     type: "date",     required: false },
    { key: "docType",   label: "Document type",     type: "select",
      choices: ["Email", "Invoice", "Receipt", "Image", "Other"] }
  ];
}

export function loadDocSchema() {
  const custom = loadJSON(LS.DOC_SCHEMA, null);
  return (Array.isArray(custom) && custom.length) ? custom : getDefaultDocSchema();
}

/**
 * Guidance block that appears above the form to coach self-reps.
 * You can override via LS.DOC_GUIDANCE with the same shape.
 */
export function getDefaultDocGuidance() {
  return {
    intro:
      "Please provide a short description of your document. Your affidavit may need to be indexed, and a clear short description will help automate that process if required.",
    note:
      "The court’s index lists the nature of each document and its date (if known). Keep your description brief but specific — what it is and who or what it involves. If there is no date on the document, check “This document has no date.”",
    examplesTitle: "Examples:",
    examples: [
      "Email from Jane Smith to John Doe re: delivery delay",
      "Receipt from Staples for binder tabs",
      "Photo of vehicle damage"
    ]
  };
}

export function loadDocGuidance() {
  const g = loadJSON(LS.DOC_GUIDANCE, null);
  if (g && Array.isArray(g.examples)) return g;
  return getDefaultDocGuidance();
}
