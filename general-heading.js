// general-heading.js — ordered multi-party + dynamic add/remove (Plaintiffs + Defendants)
// Backward compatible with legacy single-party fields

// Shared localStorage key
const LS_CASE_KEY = "jf_case";

// Small helper to read/trim by id
const val = (id) => (document.getElementById(id)?.value || "").trim();

/* ---------------------------
   Tiny UI helpers (new)
----------------------------*/
function show(el, yes) { if (!el) return; el.hidden = !yes; el.setAttribute("aria-hidden", yes ? "false" : "true"); }
function radioChecked(id){ const n=document.getElementById(id); return !!(n && n.checked); }

/* ---------------------------
   Party readers (ordered)
----------------------------*/

// Read a single party block for a given role
function readPartyNode(node, cls) {
  if (!node) return null;
  const first   = node.querySelector(`.${cls}-first`)?.value.trim()   || "";
  const last    = node.querySelector(`.${cls}-last`)?.value.trim()    || "";
  const company = node.querySelector(`.${cls}-company`)?.value.trim() || "";
  return { first, last, company };
}

// Turn first+extra nodes into an ordered array, with fallback to legacy single-field IDs
function readPartyList({ firstSelector, extraContainerSelector, cls, fallbackIds }) {
  const out = [];

  // First (always-visible) block
  const firstNode = document.querySelector(firstSelector);
  if (firstNode) out.push(readPartyNode(firstNode, cls));

  // Any appended blocks
  const extraWrap = document.querySelector(extraContainerSelector);
  if (extraWrap) {
    extraWrap.querySelectorAll(".party-block").forEach((row) => {
      out.push(readPartyNode(row, cls));
    });
  }

  // Fallback to legacy single-party fields if dynamic UI not present
  if (!firstNode && fallbackIds) {
    const { firstId, lastId, companyId } = fallbackIds;
    out.push({
      first:   (document.getElementById(firstId)?.value || "").trim(),
      last:    (document.getElementById(lastId)?.value || "").trim(),
      company: (document.getElementById(companyId)?.value || "").trim(),
    });
  }

  // Drop completely empty entries (no person and no company)
  return out.filter((p) => p && (p.company || p.first || p.last));
}

/* ---------------------------
   Minimal validation helpers
----------------------------*/

function atLeastOneParty(list) {
  return Array.isArray(list) && list.length > 0;
}

// Optional: warn if a row mixes person + company (we allow it, but nudge the user)
function findMixedEntries(list) {
  return list.findIndex((p) => p && (p.company && (p.first || p.last)));
}

/** Enforce: first party must have (first & last) OR company. */
function validateFirstParty(blockSelector, clsPrefix, roleLabel) {
  const block = document.querySelector(blockSelector);
  if (!block) return true; // nothing to check if the block isn't on the page

  const first   = block.querySelector(`.${clsPrefix}-first`)?.value.trim()   || "";
  const last    = block.querySelector(`.${clsPrefix}-last`)?.value.trim()    || "";
  const company = block.querySelector(`.${clsPrefix}-company`)?.value.trim() || "";

  // Accept if company provided
  if (company) return true;

  // Accept if BOTH first & last provided
  if (first && last) return true;

  // Otherwise block with clear message and focus
  alert(`Enter either BOTH First and Last Name OR the Company Legal Name for the first ${roleLabel}.`);
  if (!first) block.querySelector(`.${clsPrefix}-first`)?.focus();
  else if (!last) block.querySelector(`.${clsPrefix}-last`)?.focus();
  return false;
}

/* ---------------------------
   Submit handler (save & go)
----------------------------*/

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  /* --- Motion UI wiring (new) --- */
  const motionYes = document.getElementById("motion-yes");
  const motionNo  = document.getElementById("motion-no");
  const motionBox = document.getElementById("motion-fields");

  function syncMotionUI(){
    const isYes = radioChecked("motion-yes");
    show(motionBox, isYes);
    if (!isYes) {
      // Clear any moving-side choice if user flipped back to No
      const mp = document.getElementById("moving-plaintiff");
      const md = document.getElementById("moving-defendant");
      if (mp) mp.checked = false;
      if (md) md.checked = false;
    }
  }
  [motionYes, motionNo].forEach(r => r && r.addEventListener("change", syncMotionUI));
  syncMotionUI();

  // Prefill from storage if present (optional but nice)
  (function initMotionFromStorage(){
    try {
      const existing = JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
      const m = existing?.motion;
      if (!m) return;
      if (m.isMotion) {
        if (motionYes) motionYes.checked = true;
        if (motionNo)  motionNo.checked = false;
        const mp = document.getElementById("moving-plaintiff");
        const md = document.getElementById("moving-defendant");
        if (m.movingSide === "plaintiff" && mp) mp.checked = true;
        if (m.movingSide === "defendant" && md) md.checked = true;
      } else {
        if (motionNo) motionNo.checked = true;
        if (motionYes) motionYes.checked = false;
      }
      syncMotionUI();
    } catch {}
  })();
  /* --- end Motion UI wiring --- */

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Respect native HTML5 validation already present in your markup
    if (!form.reportValidity()) return;

    // Court info
    const courtName = val("name-of-court");
    const year      = val("court-file-year");
    const assign    = val("court-file-assigned");
    const suffix    = val("court-file-suffix");

    // Plaintiffs (ordered)
    const plaintiffs = readPartyList({
      firstSelector: ".party-first",                   // first plaintiff block
      extraContainerSelector: "#extra-plaintiffs",
      cls: "pl",                                       // class prefix for inputs
      fallbackIds: { firstId: "plaintiff-first-name", lastId: "plaintiff-last-name", companyId: "plaintiff-company" },
    });

    // Defendants (ordered)
    const defendants = readPartyList({
      firstSelector: ".def-party-first",               // first defendant block
      extraContainerSelector: "#extra-defendants",
      cls: "df",                                       // class prefix for inputs
      fallbackIds: { firstId: "defendant-first-name", lastId: "defendant-last-name", companyId: "defendant-company" },
    });

    // 🔒 Enforce: first plaintiff and first defendant must have (first+last) OR company
    if (!validateFirstParty("#plaintiff-information .party-first", "pl", "plaintiff")) return;
    if (!validateFirstParty("#defendant-information .def-party-first", "df", "defendant")) return;

    // Minimal extra validation: must have at least one plaintiff and one defendant
    if (!atLeastOneParty(plaintiffs) || !atLeastOneParty(defendants)) {
      alert("Please enter at least one Plaintiff and one Defendant (person or Company Legal Name).");
      return;
    }

    // Soft warning if a row mixes person + company (allowed, but likely a mistake)
    const mixedPl = findMixedEntries(plaintiffs);
    const mixedDf = findMixedEntries(defendants);
    if (mixedPl !== -1 || mixedDf !== -1) {
      const proceed = confirm(
        "It looks like one or more entries include BOTH a person's name and a Company Legal Name.\n\n" +
        "Usually you should fill EITHER the person fields OR the company field for each party.\n\n" +
        "Click OK to continue anyway, or Cancel to review."
      );
      if (!proceed) return;
    }

    /* --- Motion context (new) --- */
    const isMotion = radioChecked("motion-yes");
    let movingSide = null;

    if (isMotion) {
      const mp = radioChecked("moving-plaintiff");
      const md = radioChecked("moving-defendant");
      if (!mp && !md) {
        alert("Please select which side is the Moving Party.");
        document.getElementById("moving-plaintiff")?.focus();
        return;
      }
      movingSide = mp ? "plaintiff" : "defendant";
    }
    /* --- end Motion context --- */

    // Build and save case object
    const caseData = {
      courtName,
      courtFile: { year, assign, suffix },
      plaintiffs,   // [{first,last,company}, ...] in entered order
      defendants,   // [{first,last,company}, ...] in entered order
      motion: { isMotion, movingSide } // <-- NEW
    };

    try {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(caseData));
    } catch (err) {
      console.error("Failed to save case data:", err);
      alert("Could not save your information in this browser.");
      return;
    }

    // Continue to next step
    window.location.href = "affidavit-intro.html";
  });
});

/* ---------------------------
   Dynamic Plaintiffs UI
----------------------------*/

document.addEventListener("DOMContentLoaded", () => {
  const MAX = 5;

  const firstBlock = document.querySelector("#plaintiff-information .party-first");
  const firstAdd   = document.getElementById("add-plaintiff-initial");
  const extraWrap  = document.getElementById("extra-plaintiffs");
  const tpl        = document.getElementById("plaintiff-row-template");

  if (!firstBlock || !firstAdd || !extraWrap || !tpl) return;

  const load  = () => { try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}"); } catch { return {}; } };
  const save  = (d) => localStorage.setItem(LS_CASE_KEY, JSON.stringify(d));
  const ensure = (d) => { if (!Array.isArray(d.plaintiffs)) d.plaintiffs = []; return d; };

  function readAll() {
    const all = [];
    all.push({
      first:   firstBlock.querySelector(".pl-first")?.value.trim() || "",
      last:    firstBlock.querySelector(".pl-last")?.value.trim()  || "",
      company: firstBlock.querySelector(".pl-company")?.value.trim() || "",
    });
    extraWrap.querySelectorAll(".party-block").forEach(row => {
      all.push({
        first:   row.querySelector(".pl-first")?.value.trim() || "",
        last:    row.querySelector(".pl-last")?.value.trim()  || "",
        company: row.querySelector(".pl-company")?.value.trim() || "",
      });
    });
    return all.filter(p => p.first || p.last || p.company);
  }

  function syncToStorage() {
    const data = ensure(load());
    data.plaintiffs = readAll();
    save(data);
    updateButtons();
  }

  function createExtraRow(values = { first: "", last: "", company: "" }) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".pl-first").value   = values.first   || "";
    node.querySelector(".pl-last").value    = values.last    || "";
    node.querySelector(".pl-company").value = values.company || "";

    node.querySelectorAll("input").forEach(i => i.addEventListener("input", syncToStorage));
    node.querySelector(".remove-party-btn").addEventListener("click", () => {
      node.remove();
      syncToStorage();
    });
    node.querySelector(".add-more").addEventListener("click", () => addExtra());

    return node;
  }

  function addExtra(values) {
    const total = 1 + extraWrap.children.length; // includes the always-visible first
    if (total >= MAX) return;
    const row = createExtraRow(values);
    extraWrap.appendChild(row);
    syncToStorage();
  }

  function updateButtons() {
    const total = 1 + extraWrap.children.length;

    firstAdd.disabled = (total >= MAX) || (extraWrap.children.length > 0);

    const extras = Array.from(extraWrap.children);
    extras.forEach((row, idx) => {
      const add = row.querySelector(".add-more");
      add.disabled = (idx !== extras.length - 1) || (total >= MAX);
    });
  }

  firstBlock.querySelectorAll("input").forEach(i => i.addEventListener("input", syncToStorage));
  firstAdd.addEventListener("click", () => addExtra());

  (function initFromStorage() {
    const data = ensure(load());
    const saved = data.plaintiffs || [];
    if (saved[0]) {
      firstBlock.querySelector(".pl-first").value   = saved[0].first   || "";
      firstBlock.querySelector(".pl-last").value    = saved[0].last    || "";
      firstBlock.querySelector(".pl-company").value = saved[0].company || "";
    }
    for (let i = 1; i < Math.min(saved.length, MAX); i++) addExtra(saved[i]);
    updateButtons();
    syncToStorage();
  })();
});

/* ---------------------------
   Dynamic Defendants UI
----------------------------*/

document.addEventListener("DOMContentLoaded", () => {
  const MAX = 5;

  const firstBlock = document.querySelector("#defendant-information .def-party-first");
  const firstAdd   = document.getElementById("add-defendant-initial");
  const extraWrap  = document.getElementById("extra-defendants");
  const tpl        = document.getElementById("defendant-row-template");

  if (!firstBlock || !firstAdd || !extraWrap || !tpl) return;

  const load  = () => { try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}"); } catch { return {}; } };
  const save  = (d) => localStorage.setItem(LS_CASE_KEY, JSON.stringify(d));
  const ensure = (d) => { if (!Array.isArray(d.defendants)) d.defendants = []; return d; };

  function readAll() {
    const all = [];
    all.push({
      first:   firstBlock.querySelector(".df-first")?.value.trim() || "",
      last:    firstBlock.querySelector(".df-last")?.value.trim()  || "",
      company: firstBlock.querySelector(".df-company")?.value.trim() || "",
    });
    extraWrap.querySelectorAll(".party-block").forEach(row => {
      all.push({
        first:   row.querySelector(".df-first")?.value.trim() || "",
        last:    row.querySelector(".df-last")?.value.trim()  || "",
        company: row.querySelector(".df-company")?.value.trim() || "",
      });
    });
    return all.filter(p => p.first || p.last || p.company);
  }

  function syncToStorage() {
    const data = ensure(load());
    data.defendants = readAll();
    save(data);
    updateButtons();
  }

  function createExtraRow(values = { first: "", last: "", company: "" }) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".df-first").value   = values.first   || "";
    node.querySelector(".df-last").value    = values.last    || "";
    node.querySelector(".df-company").value = values.company || "";

    node.querySelectorAll("input").forEach(i => i.addEventListener("input", syncToStorage));
    node.querySelector(".remove-party-btn").addEventListener("click", () => {
      node.remove();
      syncToStorage();
    });
    node.querySelector(".add-more").addEventListener("click", () => addExtra());

    return node;
  }

  function addExtra(values) {
    const total = 1 + extraWrap.children.length; // includes the always-visible first
    if (total >= MAX) return;
    const row = createExtraRow(values);
    extraWrap.appendChild(row);
    syncToStorage();
  }

  function updateButtons() {
    const total = 1 + extraWrap.children.length;

    firstAdd.disabled = (total >= MAX) || (extraWrap.children.length > 0);

    const extras = Array.from(extraWrap.children);
    extras.forEach((row, idx) => {
      const add = row.querySelector(".add-more");
      add.disabled = (idx !== extras.length - 1) || (total >= MAX);
    });
  }

  firstBlock.querySelectorAll("input").forEach(i => i.addEventListener("input", syncToStorage));
  firstAdd.addEventListener("click", () => addExtra());

  (function initFromStorage() {
    const data = ensure(load());
    const saved = data.defendants || [];
    if (saved[0]) {
      firstBlock.querySelector(".df-first").value   = saved[0].first   || "";
      firstBlock.querySelector(".df-last").value    = saved[0].last    || "";
      firstBlock.querySelector(".df-company").value = saved[0].company || "";
    }
    for (let i = 1; i < Math.min(saved.length, MAX); i++) addExtra(saved[i]);
    updateButtons();
    syncToStorage();
  })();
});
