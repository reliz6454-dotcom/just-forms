// general-heading.js — ordered multi-party with per-party contact + counsel
// Saves to localStorage key "jf_case"

const LS_CASE_KEY = "jf_case";

// tiny helpers
const val = (id) => (document.getElementById(id)?.value || "").trim();
function show(el, yes) { if (!el) return; el.hidden = !yes; el.setAttribute("aria-hidden", yes ? "false" : "true"); }
function radioChecked(id){ const n=document.getElementById(id); return !!(n && n.checked); }

// party display name (company preferred)
function partyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}

/* ---------------------------------------
   READ A SINGLE PARTY BLOCK (pl|df)
----------------------------------------*/
function readPartyNode(node, cls) {
  if (!node) return null;

  // identity
  const first   = node.querySelector(`.${cls}-first`)?.value.trim()   || "";
  const last    = node.querySelector(`.${cls}-last`)?.value.trim()    || "";
  const company = node.querySelector(`.${cls}-company`)?.value.trim() || "";

  // contact (required regardless of counsel)
  const addr1   = node.querySelector(`.${cls}-addr1`)?.value.trim()   || "";
  const addr2   = node.querySelector(`.${cls}-addr2`)?.value.trim()   || "";
  const city    = node.querySelector(`.${cls}-city`)?.value.trim()    || "";
  const prov    = node.querySelector(`.${cls}-prov`)?.value.trim()    || "";
  const postal  = node.querySelector(`.${cls}-postal`)?.value.trim()  || "";
  const phone   = node.querySelector(`.${cls}-phone`)?.value.trim()   || "";
  const email   = node.querySelector(`.${cls}-email`)?.value.trim()   || "";

  // representation
  const representedEl = node.querySelector(`.${cls}-represented`);
  const represented = !!(representedEl && representedEl.checked);

  let lawyer = null;
  if (represented) {
    lawyer = {
      firm:     node.querySelector(`.${cls}-law-firm`)?.value.trim()     || "",
      first:    node.querySelector(`.${cls}-law-first`)?.value.trim()    || "",
      last:     node.querySelector(`.${cls}-law-last`)?.value.trim()     || "",
      addr1:    node.querySelector(`.${cls}-law-addr1`)?.value.trim()    || "",
      addr2:    node.querySelector(`.${cls}-law-addr2`)?.value.trim()    || "",
      city:     node.querySelector(`.${cls}-law-city`)?.value.trim()     || "",
      prov:     node.querySelector(`.${cls}-law-prov`)?.value.trim()     || "",
      postal:   node.querySelector(`.${cls}-law-postal`)?.value.trim()   || "",
      phone:    node.querySelector(`.${cls}-law-phone`)?.value.trim()    || "",
      email:    node.querySelector(`.${cls}-law-email`)?.value.trim()    || "",
      license:  node.querySelector(`.${cls}-law-license`)?.value.trim()  || "",
    };
  }

  return {
    first, last, company,
    contact: { addr1, addr2, city, prov, postal, phone, email },
    represented,
    lawyer
  };
}

/* ---------------------------------------
   VALIDATION
----------------------------------------*/
function validateFirstParty(blockSelector, clsPrefix, roleLabel) {
  const block = document.querySelector(blockSelector);
  if (!block) return true;

  const first   = block.querySelector(`.${clsPrefix}-first`)?.value.trim()   || "";
  const last    = block.querySelector(`.${clsPrefix}-last`)?.value.trim()    || "";
  const company = block.querySelector(`.${clsPrefix}-company`)?.value.trim() || "";

  if (company || (first && last)) return true;

  alert(`Enter either BOTH First and Last Name OR the Company Legal Name for the first ${roleLabel}.`);
  if (!first && !company) block.querySelector(`.${clsPrefix}-first`)?.focus();
  else if (!last && !company) block.querySelector(`.${clsPrefix}-last`)?.focus();
  return false;
}

function requireContact(node, cls, partyLabel) {
  const need = [
    [`.${cls}-addr1`, "Address 1"],
    [`.${cls}-city`,  "City"],
    [`.${cls}-prov`,  "Province"],
    [`.${cls}-postal`,"Postal Code"],
    [`.${cls}-phone`, "Phone"],
    [`.${cls}-email`, "Email"],
  ];
  for (const [sel, name] of need) {
    const el = node.querySelector(sel);
    const v = el?.value.trim() || "";
    if (!v) {
      alert(`${partyLabel}: Please enter ${name}.`);
      el?.focus();
      return false;
    }
  }
  return true;
}

function requireLawyerIfRepresented(node, cls, partyLabel) {
  const represented = !!node.querySelector(`.${cls}-represented`)?.checked;
  if (!represented) return true;

  const need = [
    [`.${cls}-law-first`,   "lawyer first name"],
    [`.${cls}-law-last`,    "lawyer last name"],
    [`.${cls}-law-addr1`,   "lawyer address 1"],
    [`.${cls}-law-city`,    "lawyer city"],
    [`.${cls}-law-prov`,    "lawyer province"],
    [`.${cls}-law-postal`,  "lawyer postal code"],
    [`.${cls}-law-phone`,   "lawyer phone"],
    [`.${cls}-law-email`,   "lawyer email"],
    [`.${cls}-law-license`, "lawyer licence number"],
  ];
  for (const [sel, name] of need) {
    const el = node.querySelector(sel);
    const v = el?.value.trim() || "";
    if (!v) {
      alert(`${partyLabel}: Please enter ${name}.`);
      el?.focus();
      return false;
    }
  }
  return true;
}

/* ---------------------------------------
   READ LISTS
----------------------------------------*/
function readPartyList(rootSelector, firstSelector, extraSelector, cls) {
  const out = [];
  const root = document.querySelector(rootSelector);
  if (!root) return out;

  // first block
  const firstNode = root.querySelector(firstSelector);
  if (firstNode) out.push(readPartyNode(firstNode, cls));

  // extras
  const extraWrap = root.querySelector(extraSelector);
  if (extraWrap) {
    extraWrap.querySelectorAll(".party-block").forEach(row => out.push(readPartyNode(row, cls)));
  }

  // drop totally empty identity rows
  return out.filter(p => p && (p.company || p.first || p.last));
}

/* ---------------------------------------
   MOTION UI
----------------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  // Motion block toggle
  const motionYes = document.getElementById("motion-yes");
  const motionNo  = document.getElementById("motion-no");
  const motionBox = document.getElementById("motion-fields");

  function syncMotionUI(){
    const isYes = radioChecked("motion-yes");
    show(motionBox, isYes);
    if (!isYes) {
      document.getElementById("moving-plaintiff")?.removeAttribute("checked");
      document.getElementById("moving-defendant")?.removeAttribute("checked");
    }
  }
  [motionYes, motionNo].forEach(r => r && r.addEventListener("change", syncMotionUI));
  syncMotionUI();

  // Prefill from storage (if any) for motion only
  try {
    const existing = JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
    const m = existing?.motion;
    if (m) {
      if (m.isMotion) {
        if (motionYes) motionYes.checked = true;
        if (motionNo)  motionNo.checked = false;
        const mp = document.getElementById("moving-plaintiff");
        const md = document.getElementById("moving-defendant");
        if (m.movingSide === "plaintiff" && mp) mp.checked = true;
        if (m.movingSide === "defendant" && md) md.checked = true;
      } else {
        if (motionNo) motionNo.checked = true;
      }
      syncMotionUI();
    }
  } catch {}

  /* ---------------------------------------
     Dynamic add/remove rows
  ----------------------------------------*/
  const MAX = 5;

  // plaintiffs
  (function wirePlaintiffs(){
    const firstBlock = document.querySelector("#plaintiff-information .party-first");
    const addFirst   = document.getElementById("add-plaintiff-initial");
    const extraWrap  = document.getElementById("extra-plaintiffs");
    const tpl        = document.getElementById("plaintiff-row-template");

    if (!firstBlock || !addFirst || !extraWrap || !tpl) return;

    function wireRepresentationBlock(block, cls){
      const cb = block.querySelector(`.${cls}-represented`);
      const panel = block.querySelector(".lawyer-fields");
      const sync = () => { if (panel) panel.hidden = !cb.checked; };
      if (cb) { cb.addEventListener("change", sync); sync(); }
    }

    function createExtraRow() {
      const node = tpl.content.firstElementChild.cloneNode(true);
      // wire representation toggle
      wireRepresentationBlock(node, "pl");

      // add/remove
      node.querySelector(".remove-party-btn")?.addEventListener("click", () => {
        node.remove(); updateButtons();
      });
      node.querySelector(".add-more")?.addEventListener("click", () => addExtra());

      return node;
    }

    function addExtra() {
      const total = 1 + extraWrap.children.length;
      if (total >= MAX) return;
      const row = createExtraRow();
      extraWrap.appendChild(row);
      updateButtons();
    }

    function updateButtons() {
      const total = 1 + extraWrap.children.length;
      addFirst.disabled = (total >= MAX) || (extraWrap.children.length > 0);

      const extras = Array.from(extraWrap.children);
      extras.forEach((row, idx) => {
        const add = row.querySelector(".add-more");
        if (add) add.disabled = (idx !== extras.length - 1) || (total >= MAX);
      });
    }

    // wire first block representation toggle
    wireRepresentationBlock(firstBlock, "pl");
    addFirst.addEventListener("click", () => addExtra());
    updateButtons();
  })();

  // defendants
  (function wireDefendants(){
    const firstBlock = document.querySelector("#defendant-information .def-party-first");
    const addFirst   = document.getElementById("add-defendant-initial");
    const extraWrap  = document.getElementById("extra-defendants");
    const tpl        = document.getElementById("defendant-row-template");

    if (!firstBlock || !addFirst || !extraWrap || !tpl) return;

    function wireRepresentationBlock(block, cls){
      const cb = block.querySelector(`.${cls}-represented`);
      const panel = block.querySelector(".lawyer-fields");
      const sync = () => { if (panel) panel.hidden = !cb.checked; };
      if (cb) { cb.addEventListener("change", sync); sync(); }
    }

    function createExtraRow() {
      const node = tpl.content.firstElementChild.cloneNode(true);
      wireRepresentationBlock(node, "df");

      node.querySelector(".remove-party-btn")?.addEventListener("click", () => {
        node.remove(); updateButtons();
      });
      node.querySelector(".add-more")?.addEventListener("click", () => addExtra());

      return node;
    }

    function addExtra() {
      const total = 1 + extraWrap.children.length;
      if (total >= MAX) return;
      const row = createExtraRow();
      extraWrap.appendChild(row);
      updateButtons();
    }

    function updateButtons() {
      const total = 1 + extraWrap.children.length;
      addFirst.disabled = (total >= MAX) || (extraWrap.children.length > 0);

      const extras = Array.from(extraWrap.children);
      extras.forEach((row, idx) => {
        const add = row.querySelector(".add-more");
        if (add) add.disabled = (idx !== extras.length - 1) || (total >= MAX);
      });
    }

    wireRepresentationBlock(firstBlock, "df");
    addFirst.addEventListener("click", () => addExtra());
    updateButtons();
  })();

  /* ---------------------------------------
     Submit → validate and save jf_case
  ----------------------------------------*/
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    // court info
    const courtName = val("name-of-court");
    const year      = val("court-file-year");
    const assign    = val("court-file-assigned");
    const suffix    = val("court-file-suffix");

    // minimal identity validation for first party on each side
    if (!validateFirstParty("#plaintiff-information .party-first", "pl", "plaintiff")) return;
    if (!validateFirstParty("#defendant-information .def-party-first", "df", "defendant")) return;

    // read lists
    const plaintiffs = readPartyList("#plaintiff-information", ".party-first", "#extra-plaintiffs", "pl");
    const defendants = readPartyList("#defendant-information", ".def-party-first", "#extra-defendants", "df");

    if (!plaintiffs.length || !defendants.length) {
      alert("Please enter at least one Plaintiff and one Defendant.");
      return;
    }

    // require contact for every party; require lawyer fields if represented
    function checkSide(list, sideLabel, rootSelector, firstSelector, extraSelector, cls) {
      const root = document.querySelector(rootSelector);
      const first = root.querySelector(firstSelector);
      const extras = root.querySelectorAll(`${extraSelector} .party-block`);

      const nodes = [first, ...extras];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const n = nodes[i];
        const who = `${sideLabel} #${i+1} (${partyDisplayName(p) || "Unnamed"})`;
        if (!requireContact(n, cls, who)) return false;
        if (!requireLawyerIfRepresented(n, cls, who)) return false;
      }
      return true;
    }

    if (!checkSide(plaintiffs, "Plaintiff", "#plaintiff-information", ".party-first", "#extra-plaintiffs", "pl")) return;
    if (!checkSide(defendants, "Defendant", "#defendant-information", ".def-party-first", "#extra-defendants", "df")) return;

    // motion
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

    // save jf_case
    const caseData = {
      courtName,
      courtFile: { year, assign, suffix },
      plaintiffs,
      defendants,
      motion: { isMotion, movingSide }
    };

    try {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(caseData));
    } catch (err) {
      console.error("Failed to save case data:", err);
      alert("Could not save your information in this browser.");
      return;
    }

    // next step
    window.location.href = "affidavit-intro.html";
  });
});
