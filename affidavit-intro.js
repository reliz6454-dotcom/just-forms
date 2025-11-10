// affidavit-intro.js — for affidavit-intro.html (robust reveal + org validation)
const LS_CASE_KEY = "jf_case";

/* ------------ tiny helpers ------------ */
const byStr = (s) => (s || "").trim();
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function loadCase() {
  try { return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveCase(obj) {
  localStorage.setItem(LS_CASE_KEY, JSON.stringify(obj || {}));
}
const partyName = (p) => byStr(p?.company) || [byStr(p?.first), byStr(p?.last)].filter(Boolean).join(" ").trim();
const isCorp = (p) => !!byStr(p?.company);

function showNode(node, on) {
  if (!node) return;
  node.hidden = !on;
  node.style.display = on ? "" : "none"; // <- critical fix (handles inline display:none)
}
function show(selOrNode, on) {
  if (typeof selOrNode === "string") showNode($(selOrNode), on);
  else showNode(selOrNode, on);
}

/* ------------ builders ------------ */
function renderSelfPartyList(container, list, savedIdx) {
  if (!container) return;
  container.innerHTML = "";
  list.forEach((p, idx) => {
    const id = `self-party-${idx}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = "self-party";
    inp.id = id;
    inp.value = String(idx);
    if (Number(savedIdx) === idx) inp.checked = true;

    label.appendChild(inp);
    label.appendChild(document.createTextNode(" " + (partyName(p) || `Party #${idx + 1}`)));
    container.appendChild(label);
  });
}

function renderAffiliationList(container, list, savedIdx) {
  if (!container) return;
  container.innerHTML = "";

  const corps = list.map((p, i) => ({ p, i })).filter(({ p }) => isCorp(p));
  if (corps.length === 0) {
    const msg = document.createElement("p");
    msg.className = "hint";
    msg.textContent = "No corporate parties on this side.";
    container.appendChild(msg);
    return;
  }

  corps.forEach(({ p, i }) => {
    const id = `aff-pick-${i}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = "aff-pick";
    inp.id = id;
    inp.value = String(i); // store ORIGINAL index into side list
    if (Number(savedIdx) === i) inp.checked = true;

    label.appendChild(inp);
    label.appendChild(document.createTextNode(" " + (partyName(p) || `Organization #${i + 1}`)));
    container.appendChild(label);
  });
}

function renderPartyChecklist(container, list, savedIdxs) {
  if (!container) return;
  const chosen = new Set((savedIdxs || []).map(Number));
  container.innerHTML = "";
  list.forEach((p, idx) => {
    const id = `multi-pick-${idx}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);

    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.className = "multi-pick";
    inp.id = id;
    inp.value = String(idx);
    if (chosen.has(idx)) inp.checked = true;

    label.appendChild(inp);
    label.appendChild(document.createTextNode(" " + (partyName(p) || `Party #${idx + 1}`)));
    container.appendChild(label);
  });
}

/* ------------ UI sync ------------ */
function syncRoleUI() {
  const role = document.querySelector('input[name="role"]:checked')?.value || "";

  show("#self-party-box", role === "plaintiff" || role === "defendant");
  show("#role-detail-box", role === "employee" || role === "officer");
  show("#affiliation-box", role === "employee" || role === "officer");
  show("#lawyer-box", role === "lawyer");
  show("#witness-box", role === "witness");
}

/* ------------ populate from saved ------------ */
function populateFromSaved() {
  const c = loadCase();
  const d = c.deponent || {};

  // simple fields
  $("#deponent-first-name") && ($("#deponent-first-name").value = d.first || "");
  $("#deponent-last-name")  && ($("#deponent-last-name").value  = d.last  || "");
  $("#deponent-city")       && ($("#deponent-city").value       = d.city  || "");
  $("#deponent-province")   && ($("#deponent-province").value   = d.prov  || "");
  $("#role-detail")         && ($("#role-detail").value         = d.roleDetail || "");

  // role
  if (d.role) {
    const r = $(`#role-${d.role.toLowerCase()}`);
    if (r) r.checked = true;
  }

  // oath
  if (d.oath) {
    const o = document.querySelector(`input[name="oath"][value="${d.oath}"]`);
    if (o) o.checked = true;
  }

  const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
  const dfs = Array.isArray(c.defendants) ? c.defendants : [];
  const role = document.querySelector('input[name="role"]:checked')?.value || "";

  // self party
  if (role === "plaintiff") {
    renderSelfPartyList($("#self-party-list"), pls, d.selfPartyIndex ?? 0);
  } else if (role === "defendant") {
    renderSelfPartyList($("#self-party-list"), dfs, d.selfPartyIndex ?? 0);
  } else {
    $("#self-party-list") && ($("#self-party-list").innerHTML = "");
  }

  // employee/officer affiliation
  if (role === "employee" || role === "officer") {
    const side = (d.roleSide === "defendant") ? "defendant" : "plaintiff";
    if (side === "defendant") $("#aff-side-defendant").checked = true;
    else $("#aff-side-plaintiff").checked = true;

    const list = side === "defendant" ? dfs : pls;
    renderAffiliationList($("#affiliation-party-list"), list, d.rolePartyIndex);
  } else {
    $("#affiliation-party-list") && ($("#affiliation-party-list").innerHTML = "");
  }

  // lawyer
  if (role === "lawyer") {
    const side = (d.lawyerSide === "defendant") ? "defendant" : "plaintiff";
    if (side === "defendant") $("#law-side-defendant").checked = true;
    else $("#law-side-plaintiff").checked = true;

    $("#lawyer-all-label").textContent = side === "defendant" ? "All Defendants" : "All Plaintiffs";
    const list = side === "defendant" ? dfs : pls;
    renderPartyChecklist($("#lawyer-party-list"), list, d.lawyerPartyIndexes || []);
    $("#lawyer-all").checked = !!d.lawyerAllParties;
  } else {
    $("#lawyer-party-list") && ($("#lawyer-party-list").innerHTML = "");
  }

  // witness
  if (role === "witness") {
    const side = (d.witnessSide === "defendant") ? "defendant" : "plaintiff";
    if (side === "defendant") $("#wit-side-defendant").checked = true;
    else $("#wit-side-plaintiff").checked = true;

    $("#witness-all-label").textContent = side === "defendant" ? "All Defendants" : "All Plaintiffs";
    const list = side === "defendant" ? dfs : pls;
    renderPartyChecklist($("#witness-party-list"), list, d.witnessPartyIndexes || []);
    $("#witness-all").checked = !!d.witnessAllParties;
  } else {
    $("#witness-party-list") && ($("#witness-party-list").innerHTML = "");
  }

  // finally reveal blocks for current role
  syncRoleUI();
}

/* ------------ submit ------------ */
function onSubmit(e) {
  e.preventDefault();

  const c = loadCase();
  const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
  const dfs = Array.isArray(c.defendants) ? c.defendants : [];

  const role = document.querySelector('input[name="role"]:checked')?.value || "";
  const d = {
    role,
    first: byStr($("#deponent-first-name")?.value),
    last:  byStr($("#deponent-last-name")?.value),
    city:  byStr($("#deponent-city")?.value),
    prov:  byStr($("#deponent-province")?.value),
    roleDetail: byStr($("#role-detail")?.value),
  };

  const oath = document.querySelector('input[name="oath"]:checked')?.value;
  if (!oath) { alert("Please select Swear or Affirm."); return; }
  d.oath = oath;

  switch (role) {
    case "plaintiff": {
      const sel = document.querySelector('input[name="self-party"]:checked');
      const idx = sel ? Number(sel.value) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= pls.length) {
        alert("Please select which Plaintiff you are.");
        return;
      }
      d.selfPartyIndex = idx;
      break;
    }
    case "defendant": {
      const sel = document.querySelector('input[name="self-party"]:checked');
      const idx = sel ? Number(sel.value) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= dfs.length) {
        alert("Please select which Defendant you are.");
        return;
      }
      d.selfPartyIndex = idx;
      break;
    }
    case "employee":
    case "officer": {
      const side = document.querySelector('input[name="aff-side"]:checked')?.value;
      if (side !== "plaintiff" && side !== "defendant") {
        alert("Please choose whether you work for a Plaintiff or a Defendant.");
        return;
      }
      const list = side === "defendant" ? dfs : pls;

      // ensure there is at least one corporation to pick
      if (!list.some(isCorp)) {
        alert(`No corporate ${side === "defendant" ? "defendants" : "plaintiffs"} entered on Page 1.`);
        return;
      }

      const sel = document.querySelector('input[name="aff-pick"]:checked');
      const idx = sel ? Number(sel.value) : NaN;

      if (!Number.isInteger(idx) || !list[idx]) {
        alert("Please select a valid organization.");
        return;
      }
      if (!isCorp(list[idx])) {
        alert("Please select a valid organization.");
        return;
      }

      d.roleSide = side;
      d.rolePartyIndex = idx;
      break;
    }
    case "lawyer": {
      const side = document.querySelector('input[name="law-side"]:checked')?.value;
      if (side !== "plaintiff" && side !== "defendant") {
        alert("For 'Lawyer', please select Plaintiffs or Defendants.");
        return;
      }
      d.lawyerSide = side;
      d.lawyerAllParties = !!$("#lawyer-all")?.checked;
      const list = side === "defendant" ? dfs : pls;
      const chosen = $$("#lawyer-party-list .multi-pick").filter(n => n.checked).map(n => Number(n.value));
      d.lawyerPartyIndexes = d.lawyerAllParties ? [] :
        chosen.filter(i => Number.isInteger(i) && i >= 0 && i < list.length);
      break;
    }
    case "witness": {
      const side = document.querySelector('input[name="wit-side"]:checked')?.value || "plaintiff";
      d.witnessSide = side === "defendant" ? "defendant" : "plaintiff";
      d.witnessAllParties = !!$("#witness-all")?.checked;
      const list = d.witnessSide === "defendant" ? dfs : pls;
      const chosen = $$("#witness-party-list .multi-pick").filter(n => n.checked).map(n => Number(n.value));
      d.witnessPartyIndexes = d.witnessAllParties ? [] :
        chosen.filter(i => Number.isInteger(i) && i >= 0 && i < list.length);
      break;
    }
    default:
      alert("Please choose your role in this case.");
      return;
  }

  c.deponent = d;
  try { saveCase(c); } catch(_) { alert("Could not save in this browser."); return; }
  window.location.href = "affidavit-body.html";
}

/* ------------ wiring ------------ */
document.addEventListener("DOMContentLoaded", () => {
  // Back
  $("#back")?.addEventListener("click", (e) => {
    e.preventDefault();
    try {
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
        history.back(); return;
      }
    } catch(_) {}
    window.location.href = "index.html";
  });

  // Initial populate
  populateFromSaved();

  // Role toggles → rebuild dynamic sections + reveal
  $$('input[name="role"]').forEach(r => r.addEventListener("change", () => {
    const c = loadCase();
    const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
    const dfs = Array.isArray(c.defendants) ? c.defendants : [];
    const role = document.querySelector('input[name="role"]:checked')?.value || "";

    if (role === "plaintiff") {
      renderSelfPartyList($("#self-party-list"), pls, 0);
    } else if (role === "defendant") {
      renderSelfPartyList($("#self-party-list"), dfs, 0);
    } else {
      $("#self-party-list") && ($("#self-party-list").innerHTML = "");
    }

    if (role === "employee" || role === "officer") {
      $("#aff-side-plaintiff").checked = true; // default
      renderAffiliationList($("#affiliation-party-list"), pls, null);
    } else {
      $("#affiliation-party-list") && ($("#affiliation-party-list").innerHTML = "");
    }

    if (role === "lawyer") {
      $("#law-side-plaintiff").checked = true;
      $("#lawyer-all").checked = false;
      $("#lawyer-all-label").textContent = "All Plaintiffs";
      renderPartyChecklist($("#lawyer-party-list"), pls, []);
    } else {
      $("#lawyer-party-list") && ($("#lawyer-party-list").innerHTML = "");
    }

    if (role === "witness") {
      $("#wit-side-plaintiff").checked = true;
      $("#witness-all").checked = false;
      $("#witness-all-label").textContent = "All Plaintiffs";
      renderPartyChecklist($("#witness-party-list"), pls, []);
    } else {
      $("#witness-party-list") && ($("#witness-party-list").innerHTML = "");
    }

    syncRoleUI();
  }));

  // Employee/Officer: switch side
  $$('input[name="aff-side"]').forEach(r => r.addEventListener("change", () => {
    const c = loadCase();
    const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
    const dfs = Array.isArray(c.defendants) ? c.defendants : [];
    const side = document.querySelector('input[name="aff-side"]:checked')?.value || "plaintiff";
    renderAffiliationList($("#affiliation-party-list"), side === "defendant" ? dfs : pls, null);
  }));

  // Lawyer: switch side
  $$('input[name="law-side"]').forEach(r => r.addEventListener("change", () => {
    const c = loadCase();
    const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
    const dfs = Array.isArray(c.defendants) ? c.defendants : [];
    const side = document.querySelector('input[name="law-side"]:checked')?.value || "plaintiff";
    $("#lawyer-all").checked = false;
    $("#lawyer-all-label").textContent = side === "defendant" ? "All Defendants" : "All Plaintiffs";
    renderPartyChecklist($("#lawyer-party-list"), side === "defendant" ? dfs : pls, []);
  }));

  // Witness: switch side
  $$('input[name="wit-side"]').forEach(r => r.addEventListener("change", () => {
    const c = loadCase();
    const pls = Array.isArray(c.plaintiffs) ? c.plaintiffs : [];
    const dfs = Array.isArray(c.defendants) ? c.defendants : [];
    const side = document.querySelector('input[name="wit-side"]:checked')?.value || "plaintiff";
    $("#witness-all").checked = false;
    $("#witness-all-label").textContent = side === "defendant" ? "All Defendants" : "All Plaintiffs";
    renderPartyChecklist($("#witness-party-list"), side === "defendant" ? dfs : pls, []);
  }));

  // All-toggles simply clear explicit selections (keeps state simple)
  $("#lawyer-all")?.addEventListener("change", () => {
    $$("#lawyer-party-list .multi-pick").forEach(ch => ch.checked = false);
  });
  $("#witness-all")?.addEventListener("change", () => {
    $$("#witness-party-list .multi-pick").forEach(ch => ch.checked = false);
  });

  // Submit
  $("form")?.addEventListener("submit", onSubmit);

  // Ensure correct reveal at first paint
  syncRoleUI();
});
