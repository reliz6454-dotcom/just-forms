// constants.js — shared storage keys + tiny JSON helpers (ES module)

export const LS = {
  CASE: "jf_case",                 // general heading + deponent info
  OATH: "jf_oathType",             // "swear" | "affirm"
  PARAS: "jf_paragraphs",          // [{id, number, text, exhibitFileId}, ...]
  EXHIBIT_SCHEME: "jf_exhibitScheme" // "letters" | "numbers"
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
