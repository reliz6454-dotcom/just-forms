// affidavit-intro.js — deponent + conditional affiliation (officer/employee OR lawyer)

// --- Keys ---
const LS_CASE_KEY = "jf_case";
const LS_OATH_KEY = "jf_oathType";

// --- Helpers ---
const val = (id) => (document.getElementById(id)?.value || "").trim();
function loadCase() {
  try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}"); }
  catch { return {}; }
}
function partyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person = [p.first || "", p.last || ""].map(s => s.trim()).filter(Boolean).join(" ").trim();
  return company || person || "";
}
function populatePartySelect(selectEl, side) {
  const data = loadCase() || {};
  const list = Array.isArray(side === "plaintiff" ? data.plaintiffs : data.defendants)
    ? (side === "plaintiff" ? data.plaintiffs : data.defendants)
    : [];
  selectEl.innerHTML = '<option value="">— Select party —</option>';
  list.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = partyDisplayName(p) || `Party #${idx + 1}`;
    selectEl.appendChild(opt);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  // Inputs
  const first = document.getElementById("deponent-first-name");
  const last  = document.getElementById("deponent-last-name");
  const city  = document.getElementById("deponent-city");
  const prov  = document.getElementById("deponent-province");

  // Role / Oath radios
  const roleRadios = Array.from(document.querySelectorAll('input[name="role"]'));
  const oathRadios = Array.from(document.querySelectorAll('input[name="oath"]'));

  // Officer/Employee UI
  const roleDetailBox    = document.getElementById("role-detail-box");
  const roleDetail       = document.getElementById("role-detail");
  const affiliationBox   = document.getElementById("affiliation-box");
  const affSidePl        = document.getElementById("aff-side-plaintiff");
  const affSideDf        = document.getElementById("aff-side-defendant");
  const affiliationParty = document.getElementById("affiliation-party");

  // Lawyer UI
  const lawyerBox   = document.getElementById("lawyer-box");
  const lawSidePl   = document.getElementById("law-side-plaintiff");
  const lawSideDf   = document.getElementById("law-side-defendant");
  const lawyerParty = document.getElementById("lawyer-party");

  // Require basic person + location fields
  [first, last, city, prov].forEach(i => i && i.setAttribute("required", ""));
  if (!roleRadios.some(r => r.hasAttribute("required"))) {
    roleRadios[0]?.setAttribute("required", "");
  }
  if (!oathRadios.some(r => r.hasAttribute("required"))) {
    document.getElementById("swear")?.setAttribute("required", "");
  }

  // Show/hide + conditional required
  function updateRoleUI() {
    const selected = document.querySelector('input[name="role"]:checked')?.value || "";

    const isOfficerOrEmployee = selected === "officer" || selected === "employee";
    const isLawyer = selected === "lawyer";

    // Officer/Employee: show role detail + affiliation
    roleDetailBox.style.display  = isOfficerOrEmployee ? "block" : "none";
    affiliationBox.style.display = isOfficerOrEmployee ? "block" : "none";

    if (isOfficerOrEmployee) {
      roleDetail.setAttribute("required", "");
      affiliationParty.setAttribute("required", "");
    } else {
      roleDetail.removeAttribute("required");
      roleDetail.setCustomValidity("");
      affiliationParty.removeAttribute("required");
      // clear choices
      if (affSidePl) affSidePl.checked = false;
      if (affSideDf) affSideDf.checked = false;
      affiliationParty.innerHTML = '<option value="">— Select party —</option>';
    }

    // Lawyer: show its own affiliation box
    lawyerBox.style.display = isLawyer ? "block" : "none";
    if (isLawyer) {
      lawyerParty.setAttribute("required", "");
    } else {
      lawyerParty.removeAttribute("required");
      if (lawSidePl) lawSidePl.checked = false;
      if (lawSideDf) lawSideDf.checked = false;
      lawyerParty.innerHTML = '<option value="">— Select party —</option>';
    }
  }

  roleRadios.forEach(r => r.addEventListener("change", updateRoleUI));
  updateRoleUI();

  // Populate selects when a side gets chosen
  [affSidePl, affSideDf].forEach(r => r && r.addEventListener("change", () => {
    const side = affSidePl?.checked ? "plaintiff" : (affSideDf?.checked ? "defendant" : "");
    if (side) populatePartySelect(affiliationParty, side);
  }));
  [lawSidePl, lawSideDf].forEach(r => r && r.addEventListener("change", () => {
    const side = lawSidePl?.checked ? "plaintiff" : (lawSideDf?.checked ? "defendant" : "");
    if (side) populatePartySelect(lawyerParty, side);
  }));

  // Submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const selectedRole = document.querySelector('input[name="role"]:checked')?.value || "";
    const isOfficerOrEmployee = selectedRole === "officer" || selectedRole === "employee";
    const isLawyer = selectedRole === "lawyer";

    // Officer/Employee validation
    let roleSide = null;
    let rolePartyIndex = null;
    if (isOfficerOrEmployee) {
      if (!val("role-detail")) {
        roleDetail.setCustomValidity("Please specify your role/title (e.g., Director, Manager).");
        form.reportValidity();
        roleDetail.focus();
        return;
      } else {
        roleDetail.setCustomValidity("");
      }
      roleSide = affSidePl?.checked ? "plaintiff" : (affSideDf?.checked ? "defendant" : null);
      if (!roleSide) {
        alert("Please choose whether you are an officer/employee of the plaintiff(s) or defendant(s).");
        (affSidePl || affSideDf)?.focus();
        return;
      }
      if (!affiliationParty.value) {
        alert("Please select the specific party.");
        affiliationParty.focus();
        return;
      }
      rolePartyIndex = parseInt(affiliationParty.value, 10);
      if (!Number.isInteger(rolePartyIndex)) {
        alert("Please select a valid party.");
        affiliationParty.focus();
        return;
      }
    }

    // Lawyer validation
    let lawyerSide = null;
    let lawyerPartyIndex = null;
    if (isLawyer) {
      lawyerSide = lawSidePl?.checked ? "plaintiff" : (lawSideDf?.checked ? "defendant" : null);
      if (!lawyerSide) {
        alert("Please choose whether you are the lawyer for the plaintiff(s) or defendant(s).");
        (lawSidePl || lawSideDf)?.focus();
        return;
      }
      if (!lawyerParty.value) {
        alert("Please select the specific party you represent.");
        lawyerParty.focus();
        return;
      }
      lawyerPartyIndex = parseInt(lawyerParty.value, 10);
      if (!Number.isInteger(lawyerPartyIndex)) {
        alert("Please select a valid party.");
        lawyerParty.focus();
        return;
      }
    }

    // Oath
    const oath = document.querySelector('input[name="oath"]:checked')?.value || null;
    if (!oath) { alert("Please choose whether you will swear or affirm."); return; }
    localStorage.setItem(LS_OATH_KEY, JSON.stringify(oath));

    // Save deponent
    const deponent = {
      first: val("deponent-first-name"),
      last:  val("deponent-last-name"),
      city:  val("deponent-city"),
      prov:  val("deponent-province"),
      role:  selectedRole,
      roleDetail: val("role-detail") || null,
      // officer/employee
      roleSide,
      rolePartyIndex,
      // lawyer
      lawyerSide,
      lawyerPartyIndex
    };

    const existing = JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
    if (existing) {
      existing.deponent = deponent;
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(existing));
    } else {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify({ deponent }));
    }

    // Continue
    window.location.href = "affidavit-body.html";
  });
});
