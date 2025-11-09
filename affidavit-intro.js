// affidavit-intro.js — checklist UX: multi-select for Lawyer/Witness, single-select for Officer/Employee, radios for self party
const LS_CASE_KEY = "jf_case";
const LS_OATH_KEY = "jf_oathType";

const val = (id) => (document.getElementById(id)?.value || "").trim();

function loadCase() {
  try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}"); }
  catch { return {}; }
}
function parties(side) {
  const data = loadCase() || {};
  const list = side === "plaintiff" ? data.plaintiffs : data.defendants;
  return Array.isArray(list) ? list : [];
}
function corporateParties(side) {
  // Only parties with a non-empty company name are considered corporate
  return parties(side).filter(p => (p?.company || "").trim().length > 0);
}
function partyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}

/* ---------- Renderers ---------- */
function renderPartyRadios(container, side, nameAttr, autoSelectIfSingle = true) {
  const list = parties(side);
  container.innerHTML = "";
  list.forEach((p, idx) => {
    const id = `${nameAttr}-${idx}`;
    const label = partyDisplayName(p) || `Party #${idx + 1}`;
    const row = document.createElement("label");
    row.innerHTML = `<input type="radio" name="${nameAttr}" id="${id}" value="${idx}"> ${label}`;
    container.appendChild(row);
  });
  if (autoSelectIfSingle && list.length === 1) {
    const first = container.querySelector(`input[name="${nameAttr}"]`);
    if (first) first.checked = true;
  }
}

function renderOrgRadiosCorporateOnly(container, side, nameAttr) {
  const list = corporateParties(side);
  container.innerHTML = "";
  if (list.length === 0) {
    const note = document.createElement("div");
    note.className = "hint";
    note.textContent = "No corporate organizations found on this side.";
    container.appendChild(note);
    return;
  }
  list.forEach((p, idx) => {
    // Use the index within the ORIGINAL parties array so downstream indices remain correct.
    const all = parties(side);
    const originalIndex = all.findIndex(ap => ap === p);
    const id = `${nameAttr}-${originalIndex}`;
    const label = partyDisplayName(p);
    const row = document.createElement("label");
    row.innerHTML = `<input type="radio" name="${nameAttr}" id="${id}" value="${originalIndex}"> ${label}`;
    container.appendChild(row);
  });
}

function renderPartyCheckboxes(container, side, nameAttr) {
  const list = parties(side);
  container.innerHTML = "";
  list.forEach((p, idx) => {
    const id = `${nameAttr}-${idx}`;
    const label = partyDisplayName(p) || `Party #${idx + 1}`;
    const row = document.createElement("label");
    row.innerHTML = `<input type="checkbox" name="${nameAttr}" id="${id}" value="${idx}"> ${label}`;
    container.appendChild(row);
  });
}

function getCheckedIndexes(nameAttr) {
  return Array.from(document.querySelectorAll(`input[name="${nameAttr}"]:checked`))
    .map(i => parseInt(i.value, 10))
    .filter(Number.isInteger);
}

/* ---------- DOM Ready ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  // Identity/location
  const first = document.getElementById("deponent-first-name");
  const last  = document.getElementById("deponent-last-name");
  const city  = document.getElementById("deponent-city");
  const prov  = document.getElementById("deponent-province");

  // Role / Oath
  const roleRadios = Array.from(document.querySelectorAll('input[name="role"]'));
  const oathRadios = Array.from(document.querySelectorAll('input[name="oath"]'));

  // Self party
  const selfPartyBox = document.getElementById("self-party-box");
  const selfPartyList = document.getElementById("self-party-list");

  // Officer/Employee
  const roleDetailBox = document.getElementById("role-detail-box");
  const roleDetail    = document.getElementById("role-detail");
  const affiliationBox= document.getElementById("affiliation-box");
  const affSidePl     = document.getElementById("aff-side-plaintiff");
  const affSideDf     = document.getElementById("aff-side-defendant");
  const affiliationPartyList = document.getElementById("affiliation-party-list");

  // Lawyer
  const lawyerBox = document.getElementById("lawyer-box");
  const lawSidePl = document.getElementById("law-side-plaintiff");
  const lawSideDf = document.getElementById("law-side-defendant");
  const lawyerAll = document.getElementById("lawyer-all");
  const lawyerAllLabel = document.getElementById("lawyer-all-label");
  const lawyerPartyList = document.getElementById("lawyer-party-list");

  // Witness
  const witnessBox = document.getElementById("witness-box");
  const witSidePl  = document.getElementById("wit-side-plaintiff");
  const witSideDf  = document.getElementById("wit-side-defendant");
  const witnessAll = document.getElementById("witness-all");
  const witnessAllLabel = document.getElementById("witness-all-label");
  const witnessPartyList = document.getElementById("witness-party-list");

  // Required basics
  [first, last, city, prov].forEach(i => i && i.setAttribute("required", ""));
  if (!roleRadios.some(r => r.hasAttribute("required"))) roleRadios[0]?.setAttribute("required", "");
  if (!oathRadios.some(r => r.hasAttribute("required"))) document.getElementById("swear")?.setAttribute("required", "");

  /* ----- Role UI ----- */
  function updateRoleUI() {
    const role = document.querySelector('input[name="role"]:checked')?.value || "";

    const isPl = role === "plaintiff";
    const isDf = role === "defendant";
    const isLaw = role === "lawyer";
    const isOff = role === "officer";
    const isEmp = role === "employee";
    const isOE = isOff || isEmp;
    const isWit = role === "witness";

    // Self party radios
    selfPartyBox.style.display = (isPl || isDf) ? "block" : "none";
    if (isPl) renderPartyRadios(selfPartyList, "plaintiff", "self-party");
    else if (isDf) renderPartyRadios(selfPartyList, "defendant", "self-party");
    else selfPartyList.innerHTML = "";

    // Officer/Employee single org
    roleDetailBox.style.display = isOE ? "block" : "none";
    affiliationBox.style.display = isOE ? "block" : "none";
    if (!isOE) {
      roleDetail.value = "";
      [affSidePl, affSideDf].forEach(x => x && (x.checked = false));
      affiliationPartyList.innerHTML = "";
    }

    // Lawyer multi
    lawyerBox.style.display = isLaw ? "block" : "none";
    if (!isLaw) {
      [lawSidePl, lawSideDf].forEach(x => x && (x.checked = false));
      lawyerAll.checked = false;
      lawyerPartyList.innerHTML = "";
      lawyerAllLabel.textContent = "All Plaintiffs";
    }

    // Witness multi
    witnessBox.style.display = isWit ? "block" : "none";
    if (!isWit) {
      [witSidePl, witSideDf].forEach(x => x && (x.checked = false));
      witnessAll.checked = false;
      witnessPartyList.innerHTML = "";
      witnessAllLabel.textContent = "All Plaintiffs";
    }
  }
  roleRadios.forEach(r => r.addEventListener("change", updateRoleUI));
  updateRoleUI();

  /* ----- Side pick → populate lists ----- */
  function onAffSideChange() {
    const side = affSidePl?.checked ? "plaintiff" : (affSideDf?.checked ? "defendant" : "");
    affiliationPartyList.innerHTML = "";
    if (side) {
      // Only corporate entities for Officer/Employee
      renderOrgRadiosCorporateOnly(affiliationPartyList, side, "aff-party");
    }
  }
  [affSidePl, affSideDf].forEach(r => r && r.addEventListener("change", onAffSideChange));

  function onLawSideChange() {
    const side = lawSidePl?.checked ? "plaintiff" : (lawSideDf?.checked ? "defendant" : "");
    lawyerPartyList.innerHTML = "";
    lawyerAll.checked = false;
    if (side) {
      renderPartyCheckboxes(lawyerPartyList, side, "law-party");
      lawyerAllLabel.textContent = side === "plaintiff" ? "All Plaintiffs" : "All Defendants";
    } else {
      lawyerAllLabel.textContent = "All Plaintiffs";
    }
  }
  [lawSidePl, lawSideDf].forEach(r => r && r.addEventListener("change", onLawSideChange));

  function onWitSideChange() {
    const side = witSidePl?.checked ? "plaintiff" : (witSideDf?.checked ? "defendant" : "");
    witnessPartyList.innerHTML = "";
    witnessAll.checked = false;
    if (side) {
      renderPartyCheckboxes(witnessPartyList, side, "wit-party");
      witnessAllLabel.textContent = side === "plaintiff" ? "All Plaintiffs" : "All Defendants";
    } else {
      witnessAllLabel.textContent = "All Plaintiffs";
    }
  }
  [witSidePl, witSideDf].forEach(r => r && r.addEventListener("change", onWitSideChange));

  /* ----- “Select All” wiring for lawyer/witness ----- */
  function syncAllCheckbox(master, nameAttr) {
    const boxes = Array.from(document.querySelectorAll(`input[name="${nameAttr}"]`));
    boxes.forEach(b => b.checked = master.checked);
  }
  function reflectMasterFromChildren(master, nameAttr) {
    const boxes = Array.from(document.querySelectorAll(`input[name="${nameAttr}"]`));
    const allOn = boxes.length > 0 && boxes.every(b => b.checked);
    master.checked = allOn;
  }

  lawyerAll.addEventListener("change", () => syncAllCheckbox(lawyerAll, "law-party"));
  witnessAll.addEventListener("change", () => syncAllCheckbox(witnessAll, "wit-party"));

  lawyerPartyList.addEventListener("change", () => reflectMasterFromChildren(lawyerAll, "law-party"));
  witnessPartyList.addEventListener("change", () => reflectMasterFromChildren(witnessAll, "wit-party"));

  /* ----- Submit → validate & save ----- */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const role = document.querySelector('input[name="role"]:checked')?.value || "";
    const isPl = role === "plaintiff";
    const isDf = role === "defendant";
    const isLaw = role === "lawyer";
    const isOff = role === "officer";
    const isEmp = role === "employee";
    const isOE = isOff || isEmp;
    const isWit = role === "witness";

    // Self party (exactly one)
    let selfPartyIndex = null;
    if (isPl || isDf) {
      const sel = document.querySelector('input[name="self-party"]:checked');
      if (!sel) { alert(`Please select which ${isPl ? "plaintiff" : "defendant"} you are.`); return; }
      selfPartyIndex = parseInt(sel.value, 10);
      if (!Number.isInteger(selfPartyIndex)) { alert("Please select a valid party."); return; }
    }

    // Officer/Employee — single organization (CORPORATE ONLY)
    let roleSide = null;
    let rolePartyIndex = null;
    if (isOE) {
      if (!val("role-detail")) {
        document.getElementById("role-detail").setCustomValidity("Please enter your role/title.");
        form.reportValidity();
        document.getElementById("role-detail").focus();
        return;
      } else {
        document.getElementById("role-detail").setCustomValidity("");
      }
      roleSide = (document.getElementById("aff-side-plaintiff")?.checked ? "plaintiff"
               : document.getElementById("aff-side-defendant")?.checked ? "defendant" : null);
      if (!roleSide) { alert("Please choose Plaintiffs or Defendants for your employer."); return; }
      const sel = document.querySelector('input[name="aff-party"]:checked');
      if (!sel) { alert("Please select the specific organization (one only)."); return; }
      rolePartyIndex = parseInt(sel.value, 10);
      if (!Number.isInteger(rolePartyIndex)) { alert("Please select a valid organization."); return; }

      // Extra guard: ensure the chosen party is corporate
      const chosen = parties(roleSide)[rolePartyIndex];
      if (!chosen || !(chosen.company || "").trim()) {
        alert("Please select a corporate organization.");
        return;
      }
    }

    // Lawyer — multi
    let lawyerSide = null;
    let lawyerPartyIndexes = [];
    let lawyerAllParties = false;
    if (isLaw) {
      lawyerSide = lawSidePl?.checked ? "plaintiff" : (lawSideDf?.checked ? "defendant" : null);
      if (!lawyerSide) { alert("Please choose Plaintiffs or Defendants you represent."); return; }
      const picks = getCheckedIndexes("law-party");
      if (picks.length === 0 && !lawyerAll.checked) { alert("Select at least one party, or choose Select All."); return; }
      lawyerAllParties = lawyerAll.checked;
      lawyerPartyIndexes = picks;
    }

    // Witness — multi
    let witnessSide = null;
    let witnessPartyIndexes = [];
    let witnessAllParties = false;
    if (isWit) {
      witnessSide = witSidePl?.checked ? "plaintiff" : (witSideDf?.checked ? "defendant" : null);
      if (!witnessSide) { alert("Please choose whether your evidence supports Plaintiffs or Defendants."); return; }
      const picks = getCheckedIndexes("wit-party");
      if (picks.length === 0 && !witnessAll.checked) { alert("Select at least one party, or choose Select All."); return; }
      witnessAllParties = witnessAll.checked;
      witnessPartyIndexes = picks;
    }

    // Oath
    const oath = document.querySelector('input[name="oath"]:checked')?.value || null;
    if (!oath) { alert("Please choose whether you will swear or affirm."); return; }
    localStorage.setItem(LS_OATH_KEY, JSON.stringify(oath));

    // Save
    const deponent = {
      first: val("deponent-first-name"),
      last:  val("deponent-last-name"),
      city:  val("deponent-city"),
      prov:  val("deponent-province"),
      role,

      // self as party
      selfPartyIndex,                   // number when role is plaintiff/defendant

      // officer/employee (single, corporate only)
      roleDetail: val("role-detail") || null,
      roleSide,                         // "plaintiff"|"defendant" or null
      rolePartyIndex,                   // number or null

      // lawyer (multi)
      lawyerSide,                       // "plaintiff"|"defendant" or null
      lawyerPartyIndexes,               // number[] (subset)
      lawyerAllParties,                 // boolean

      // witness (multi)
      witnessSide,                      // "plaintiff"|"defendant" or null
      witnessPartyIndexes,              // number[] (subset)
      witnessAllParties                 // boolean
    };

    const existing = JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
    if (existing) {
      existing.deponent = deponent;
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(existing));
    } else {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify({ deponent }));
    }

    // Next step
    window.location.href = "affidavit-body.html";
  });
});
