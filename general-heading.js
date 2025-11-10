// general-heading.js — ordered multi-party with per-party contact + counsel (+ reuse-counsel)
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

// build a stable label for a lawyer for dropdown display/identity
function lawyerDisplay(l) {
  if (!l) return "";
  const name = [l.first || "", l.last || ""].map(s=>s.trim()).filter(Boolean).join(" ");
  const firm = (l.firm || "").trim();
  const lic  = (l.license || "").trim();
  const bits = [];
  if (name) bits.push(name);
  if (firm) bits.push(firm);
  if (lic)  bits.push(`#${lic}`);
  return bits.join(" • ");
}

function lawyerKey(l) {
  const lic = (l.license || "").trim().toLowerCase();
  if (lic) return `lic:${lic}`;
  const name = `${(l.first||"").trim().toLowerCase()}|${(l.last||"").trim().toLowerCase()}`;
  const firm = (l.firm||"").trim().toLowerCase();
  return `nf:${name}|${firm}`;
}

/* ---------------------------------------
   READ A SINGLE PARTY BLOCK (pl|df)
----------------------------------------*/
function readPartyNode(node, cls) {
  if (!node) return null;

  const first   = node.querySelector(`.${cls}-first`)?.value.trim()   || "";
  const last    = node.querySelector(`.${cls}-last`)?.value.trim()    || "";
  const company = node.querySelector(`.${cls}-company`)?.value.trim() || "";

  const addr1   = node.querySelector(`.${cls}-addr1`)?.value.trim()   || "";
  const addr2   = node.querySelector(`.${cls}-addr2`)?.value.trim()   || "";
  const city    = node.querySelector(`.${cls}-city`)?.value.trim()    || "";
  const prov    = node.querySelector(`.${cls}-prov`)?.value.trim()    || "";
  const postal  = node.querySelector(`.${cls}-postal`)?.value.trim()  || "";
  const phone   = node.querySelector(`.${cls}-phone`)?.value.trim()   || "";
  const email   = node.querySelector(`.${cls}-email`)?.value.trim()   || "";

  const representedEl = node.querySelector(`.${cls}-represented`);
  const represented = !!(representedEl && representedEl.checked);

  let lawyer = null;
  if (represented) {
    const useExisting = !!node.querySelector(`.${cls}-use-existing-lawyer`)?.checked;
    const sel = node.querySelector(`.${cls}-lawyer-select`);
    if (useExisting && sel && sel.value) {
      try {
        lawyer = JSON.parse(sel.value);
      } catch {
        lawyer = null;
      }
    } else {
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
function requireIdentity(node, cls, partyLabel, requiredStrict) {
  const first   = node.querySelector(`.${cls}-first`)?.value.trim()   || "";
  const last    = node.querySelector(`.${cls}-last`)?.value.trim()    || "";
  const company = node.querySelector(`.${cls}-company`)?.value.trim() || "";

  const anyTyped = !!(first || last || company);
  const valid = !!(company || (first && last));

  if (requiredStrict) {
    if (!valid) {
      alert(`${partyLabel}: Enter either BOTH First and Last Name OR the Company Legal Name.`);
      if (!company) {
        if (!first) node.querySelector(`.${cls}-first`)?.focus();
        else if (!last) node.querySelector(`.${cls}-last`)?.focus();
        else node.querySelector(`.${cls}-company`)?.focus();
      } else {
        node.querySelector(`.${cls}-company`)?.focus();
      }
      return false;
    }
    return true;
  }

  if (!anyTyped) return true;
  if (valid) return true;

  alert(`${partyLabel}: If you use this row, enter BOTH First and Last Name OR the Company Legal Name.`);
  if (!company) {
    if (!first) node.querySelector(`.${cls}-first`)?.focus();
    else if (!last) node.querySelector(`.${cls}-last`)?.focus();
    else node.querySelector(`.${cls}-company`)?.focus();
  } else {
    node.querySelector(`.${cls}-company`)?.focus();
  }
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

  const useExisting = !!node.querySelector(`.${cls}-use-existing-lawyer`)?.checked;
  const sel = node.querySelector(`.${cls}-lawyer-select`);

  if (useExisting) {
    if (!sel || !sel.value) {
      alert(`${partyLabel}: Please choose a previously provided lawyer from the list.`);
      sel?.focus();
      return false;
    }
    return true;
  }

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
  for (const [selr, name] of need) {
    const el = node.querySelector(selr);
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
   COLLECT/POPULATE REUSABLE LAWYERS
----------------------------------------*/
function collectLawyers(sideCls) {
  const rootSel = sideCls === "pl" ? "#plaintiff-information" : "#defendant-information";
  const firstSel = sideCls === "pl" ? ".party-first" : ".def-party-first";
  const extraSel = sideCls === "pl" ? "#extra-plaintiffs" : "#extra-defendants";

  const root = document.querySelector(rootSel);
  if (!root) return [];

  const blocks = [];
  const firstNode = root.querySelector(firstSel);
  if (firstNode) blocks.push(firstNode);
  root.querySelectorAll(`${extraSel} .party-block`).forEach(n => blocks.push(n));

  const map = new Map();
  for (const n of blocks) {
    const represented = !!n.querySelector(`.${sideCls}-represented`)?.checked;
    if (!represented) continue;

    const useExisting = !!n.querySelector(`.${sideCls}-use-existing-lawyer`)?.checked;
    let l = null;
    if (useExisting) {
      const sel = n.querySelector(`.${sideCls}-lawyer-select`);
      if (sel && sel.value) {
        try { l = JSON.parse(sel.value); } catch { l = null; }
      }
    } else {
      const first = n.querySelector(`.${sideCls}-law-first`)?.value.trim();
      const last  = n.querySelector(`.${sideCls}-law-last`)?.value.trim();
      const firm  = n.querySelector(`.${sideCls}-law-firm`)?.value.trim();
      const lic   = n.querySelector(`.${sideCls}-law-license`)?.value.trim();
      if ((first || last || firm || lic)) {
        l = {
          firm: firm || "",
          first: first || "",
          last: last || "",
          addr1: n.querySelector(`.${sideCls}-law-addr1`)?.value.trim() || "",
          addr2: n.querySelector(`.${sideCls}-law-addr2`)?.value.trim() || "",
          city:  n.querySelector(`.${sideCls}-law-city`)?.value.trim()  || "",
          prov:  n.querySelector(`.${sideCls}-law-prov`)?.value.trim()  || "",
          postal:n.querySelector(`.${sideCls}-law-postal`)?.value.trim()|| "",
          phone: n.querySelector(`.${sideCls}-law-phone`)?.value.trim() || "",
          email: n.querySelector(`.${sideCls}-law-email`)?.value.trim() || "",
          license: lic || "",
        };
      }
    }
    if (l) {
      const key = lawyerKey(l);
      if (!map.has(key)) map.set(key, l);
    }
  }

  return Array.from(map.values());
}

function populateLawyerSelects(sideCls) {
  const lawyers = collectLawyers(sideCls);
  const rootSel = sideCls === "pl" ? "#plaintiff-information" : "#defendant-information";
  const root = document.querySelector(rootSel);
  if (!root) return;

  root.querySelectorAll(`.${sideCls}-lawyer-select`).forEach(sel => {
    const current = sel.value || "";
    sel.innerHTML = `<option value="">— select —</option>`;
    lawyers.forEach(l => {
      const opt = document.createElement("option");
      opt.textContent = lawyerDisplay(l);
      opt.value = JSON.stringify(l);
      sel.appendChild(opt);
    });
    if (current) {
      const found = Array.from(sel.options).some(o => o.value === current);
      if (found) sel.value = current;
    }
  });
}

/* ---------------------------------------
   READ LISTS
----------------------------------------*/
function readPartyList(rootSelector, firstSelector, extraSelector, cls) {
  const out = [];
  const root = document.querySelector(rootSelector);
  if (!root) return out;

  const firstNode = root.querySelector(firstSelector);
  if (firstNode) out.push(readPartyNode(firstNode, cls));

  const extraWrap = root.querySelector(extraSelector);
  if (extraWrap) {
    extraWrap.querySelectorAll(".party-block").forEach(row => out.push(readPartyNode(row, cls)));
  }

  return out.filter(p => p && ( (p.company && p.company.trim()) || ((p.first && p.first.trim()) && (p.last && p.last.trim())) ));
}

/* ---------------------------------------
   DOM Helpers for population
----------------------------------------*/
const loadCase = () => {
  try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null"); }
  catch { return null; }
};
const set = (root, sel, v) => { const n = root.querySelector(sel); if (n) n.value = v || ""; };
const setChk = (root, sel, on) => { const n = root.querySelector(sel); if (n) n.checked = !!on; };

/* ---------------------------------------
   MAIN DOMContentLoaded
----------------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  // ✅ FIRST AND ONLY declaration of "form"
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

  /* ---------------------------------------
     Helpers to wire representation
  ----------------------------------------*/
  function wireRepresentationBlock(block, cls){
    const cb = block.querySelector(`.${cls}-represented`);
    const panel = block.querySelector(".lawyer-fields");
    const manualWrap = block.querySelector(".manual-lawyer-fields");
    const reuseCb = block.querySelector(`.${cls}-use-existing-lawyer`);
    const selectWrap = block.querySelector(".existing-lawyer-select");
    const select = block.querySelector(`.${cls}-lawyer-select`);

    const syncRepresented = () => {
      show(panel, !!cb?.checked);
      if (cb?.checked) populateLawyerSelects(cls);
    };

    const syncReuse = () => {
      const useExisting = !!reuseCb?.checked;
      show(selectWrap, useExisting);
      show(manualWrap, !useExisting);
      if (useExisting) populateLawyerSelects(cls);
    };

    cb?.addEventListener("change", syncRepresented);
    reuseCb?.addEventListener("change", syncReuse);
    select?.addEventListener("change", () => {});

    const manualInputs = block.querySelectorAll([
      `.${cls}-law-firm`,
      `.${cls}-law-first`,
      `.${cls}-law-last`,
      `.${cls}-law-addr1`,
      `.${cls}-law-addr2`,
      `.${cls}-law-city`,
      `.${cls}-law-prov`,
      `.${cls}-law-postal`,
      `.${cls}-law-phone`,
      `.${cls}-law-email`,
      `.${cls}-law-license`,
    ].join(","));
    manualInputs.forEach(inp => inp.addEventListener("input", () => populateLawyerSelects(cls)));

    syncRepresented();
    syncReuse();
  }

  /* ---------------------------------------
     Build each party block dynamically
  ----------------------------------------*/
  function wireSide(side){
    const isPl = side === "pl";
    const firstBlock = document.querySelector(isPl ? "#plaintiff-information .party-first" : "#defendant-information .def-party-first");
    const addFirst   = document.getElementById(isPl ? "add-plaintiff-initial" : "add-defendant-initial");
    const extraWrap  = document.getElementById(isPl ? "extra-plaintiffs" : "extra-defendants");
    const tpl        = document.getElementById(isPl ? "plaintiff-row-template" : "defendant-row-template");
    const MAX = 5;

    if (!firstBlock || !addFirst || !extraWrap || !tpl) return;

    function createExtraRow() {
      const node = tpl.content.firstElementChild.cloneNode(true);
      wireRepresentationBlock(node, side);

      node.querySelector(".remove-party-btn")?.addEventListener("click", () => {
        node.remove(); updateButtons();
        populateLawyerSelects(side);
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
      populateLawyerSelects(side);
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

    wireRepresentationBlock(firstBlock, side);
    addFirst.addEventListener("click", () => addExtra());
    updateButtons();

    return { firstBlock, extraWrap, addExtra };
  }

  const wirePl = wireSide("pl");
  const wireDf = wireSide("df");

  /* ---------------------------------------
     Populate from saved jf_case (prefill + rebuild rows)
  ----------------------------------------*/
  function populatePartyInto(block, cls, party){
    if (!block || !party) return;
    set(block, `.${cls}-first`,   party.first || "");
    set(block, `.${cls}-last`,    party.last || "");
    set(block, `.${cls}-company`, party.company || "");

    const c = party.contact || {};
    set(block, `.${cls}-addr1`,  c.addr1 || "");
    set(block, `.${cls}-addr2`,  c.addr2 || "");
    set(block, `.${cls}-city`,   c.city  || "");
    set(block, `.${cls}-prov`,   c.prov  || "");
    set(block, `.${cls}-postal`, c.postal|| "");
    set(block, `.${cls}-phone`,  c.phone || "");
    set(block, `.${cls}-email`,  c.email || "");

    setChk(block, `.${cls}-represented`, !!party.represented);
    // ensure UI visible before filling
    block.querySelector(`.${cls}-represented`)?.dispatchEvent(new Event("change"));

    if (party.represented) {
      // We will always fill manual fields (simpler & reliable)
      const reuse = block.querySelector(`.${cls}-use-existing-lawyer`);
      if (reuse) { reuse.checked = false; reuse.dispatchEvent(new Event("change")); }

      const L = party.lawyer || {};
      set(block, `.${cls}-law-firm`,    L.firm    || "");
      set(block, `.${cls}-law-first`,   L.first   || "");
      set(block, `.${cls}-law-last`,    L.last    || "");
      set(block, `.${cls}-law-addr1`,   L.addr1   || "");
      set(block, `.${cls}-law-addr2`,   L.addr2   || "");
      set(block, `.${cls}-law-city`,    L.city    || "");
      set(block, `.${cls}-law-prov`,    L.prov    || "");
      set(block, `.${cls}-law-postal`,  L.postal  || "");
      set(block, `.${cls}-law-phone`,   L.phone   || "");
      set(block, `.${cls}-law-email`,   L.email   || "");
      set(block, `.${cls}-law-license`, L.license || "");
    }
  }

  function populateFromSaved(){
    const data = loadCase();
    if (!data) return;

    // Court
    const courtName  = document.getElementById("name-of-court");
    const commencedAt= document.getElementById("proceeding-place");
    if (courtName)   courtName.value   = (data.courtName || "");
    if (commencedAt) commencedAt.value = (data.commencedAt || "");

    const cf = data.courtFile || {};
    const y = document.getElementById("court-file-year");
    const a = document.getElementById("court-file-assigned");
    const s = document.getElementById("court-file-suffix");
    if (y) y.value = cf.year || "";
    if (a) a.value = cf.assign || "";
    if (s) s.value = cf.suffix || "";

    // Motion
    const isMotion = !!(data.motion && data.motion.isMotion);
    const movingSide = data.motion ? data.motion.movingSide : null;
    const mYes = document.getElementById("motion-yes");
    const mNo  = document.getElementById("motion-no");
    if (mYes && mNo) {
      mYes.checked = isMotion; mNo.checked = !isMotion;
      syncMotionUI();
      if (isMotion) {
        const mp = document.getElementById("moving-plaintiff");
        const md = document.getElementById("moving-defendant");
        if (movingSide === "plaintiff" && mp) mp.checked = true;
        if (movingSide === "defendant" && md) md.checked = true;
      }
    }

    // Plaintiffs
    const pls = Array.isArray(data.plaintiffs) ? data.plaintiffs : [];
    if (pls.length && wirePl) {
      populatePartyInto(wirePl.firstBlock, "pl", pls[0]);
      for (let i = 1; i < Math.min(pls.length, 5); i++) {
        const row = wirePl.addExtra();
        // addExtra appends and returns nothing; we need the last child to fill
        const node = document.getElementById("extra-plaintiffs")?.lastElementChild;
        populatePartyInto(node, "pl", pls[i]);
      }
    }

    // Defendants
    const dfs = Array.isArray(data.defendants) ? data.defendants : [];
    if (dfs.length && wireDf) {
      populatePartyInto(wireDf.firstBlock, "df", dfs[0]);
      for (let i = 1; i < Math.min(dfs.length, 5); i++) {
        const row = wireDf.addExtra();
        const node = document.getElementById("extra-defendants")?.lastElementChild;
        populatePartyInto(node, "df", dfs[i]);
      }
    }

    // refresh lawyer selects post-fill (so any manual lawyers are visible as options if user flips the toggle)
    populateLawyerSelects("pl");
    populateLawyerSelects("df");
  }

  // Run population now that wiring exists
  populateFromSaved();

  /* ---------------------------------------
     ✅ Submit → validate and save jf_case (overwrite)
  ----------------------------------------*/
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const courtName  = val("name-of-court");
    const commencedAt = val("proceeding-place"); // NEW
    const year       = val("court-file-year");
    const assign     = val("court-file-assigned");
    const suffix     = val("court-file-suffix");

    // identity validation helpers
    function getSideNodes(rootSelector, firstSelector, extraSelector) {
      const root  = document.querySelector(rootSelector);
      const first = root?.querySelector(firstSelector) || null;
      const extras= root ? Array.from(root.querySelectorAll(`${extraSelector} .party-block`)) : [];
      return { first, extras };
    }

    const plNodes = getSideNodes("#plaintiff-information", ".party-first", "#extra-plaintiffs");
    const dfNodes = getSideNodes("#defendant-information", ".def-party-first", "#extra-defendants");

    if (!requireIdentity(plNodes.first, "pl", "Plaintiff #1", true)) return;
    for (let i = 0; i < plNodes.extras.length; i++) {
      if (!requireIdentity(plNodes.extras[i], "pl", `Plaintiff #${i+2}`, false)) return;
    }
    if (!requireIdentity(dfNodes.first, "df", "Defendant #1", true)) return;
    for (let i = 0; i < dfNodes.extras.length; i++) {
      if (!requireIdentity(dfNodes.extras[i], "df", `Defendant #${i+2}`, false)) return;
    }

    const plaintiffs = readPartyList("#plaintiff-information", ".party-first", "#extra-plaintiffs", "pl");
    const defendants = readPartyList("#defendant-information", ".def-party-first", "#extra-defendants", "df");

    if (!plaintiffs.length || !defendants.length) {
      alert("Please enter at least one Plaintiff and one Defendant.");
      return;
    }

    function checkSide(list, sideLabel, rootSelector, firstSelector, extraSelector, cls) {
      const root  = document.querySelector(rootSelector);
      const first = root.querySelector(firstSelector);
      const extras= root.querySelectorAll(`${extraSelector} .party-block`);

      const nodesInOrder = [first, ...extras];
      const nodesKept = [];
      for (const n of nodesInOrder) {
        const f = n.querySelector(`.${cls}-first`)?.value.trim() || "";
        const l = n.querySelector(`.${cls}-last`)?.value.trim() || "";
        const c = n.querySelector(`.${cls}-company`)?.value.trim() || "";
        if (c || (f && l)) nodesKept.push(n);
      }

      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const n = nodesKept[i];
        const who = `${sideLabel} #${i+1} (${partyDisplayName(p) || "Unnamed"})`;
        if (!requireContact(n, cls, who)) return false;
        if (!requireLawyerIfRepresented(n, cls, who)) return false;
      }
      return true;
    }

    if (!checkSide(plaintiffs, "Plaintiff", "#plaintiff-information", ".party-first", "#extra-plaintiffs", "pl")) return;
    if (!checkSide(defendants, "Defendant", "#defendant-information", ".def-party-first", "#extra-defendants", "df")) return;

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

    const caseData = {
      courtName,
      commencedAt, // NEW
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

    window.location.href = "affidavit-intro.html";
  });
});
