// general-heading.js — ordered multi-party with per-party contact + counsel (+ reuse-counsel)
// Persists to localStorage key "jf_case"

const LS_CASE_KEY = "jf_case";

/* ---------------------------------------
   Tiny helpers
----------------------------------------*/
const val = (id) => (document.getElementById(id)?.value || "").trim();
function show(el, yes) {
  if (!el) return;
  el.hidden = !yes;
  el.setAttribute("aria-hidden", yes ? "false" : "true");
}
function radioChecked(id) {
  const n = document.getElementById(id);
  return !!(n && n.checked);
}

const loadCase = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
  } catch {
    return null;
  }
};
const saveCase = (obj) => localStorage.setItem(LS_CASE_KEY, JSON.stringify(obj));

/* ---------------------------------------
   Display helpers
----------------------------------------*/
function partyDisplayName(p) {
  if (!p) return "";
  const company = (p.company || "").trim();
  const person = [p.first || "", p.last || ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return company || person || "";
}

function lawyerDisplay(l) {
  if (!l) return "";
  const name = [l.first || "", l.last || ""].map((s) => s.trim()).filter(Boolean).join(" ");
  const firm = (l.firm || "").trim();
  const lic = (l.license || "").trim();
  const bits = [];
  if (name) bits.push(name);
  if (firm) bits.push(firm);
  if (lic) bits.push(`#${lic}`);
  return bits.join(" • ");
}

function lawyerKey(l) {
  const lic = (l.license || "").trim().toLowerCase();
  if (lic) return `lic:${lic}`;
  const name = `${(l.first || "").trim().toLowerCase()}|${(l.last || "").trim().toLowerCase()}`;
  const firm = (l.firm || "").trim().toLowerCase();
  return `nf:${name}|${firm}`;
}

/* ---------------------------------------
   Counsel UI: show/hide per row
----------------------------------------*/
function syncCounselUIForRow(row, cls) {
  if (!row) return;

  const represented = !!row.querySelector(`.${cls}-represented`)?.checked;
  const lawyerBox = row.querySelector(".lawyer-fields");
  if (lawyerBox) lawyerBox.hidden = !represented;

  const useExisting = !!row.querySelector(`.${cls}-use-existing-lawyer`)?.checked;

  const existingWrap = row.querySelector(".existing-lawyer-select");
  if (existingWrap) existingWrap.hidden = !useExisting;

  const manualWrap = row.querySelector(".manual-lawyer-fields");
  if (manualWrap) manualWrap.hidden = useExisting;

  if (represented) populateLawyerSelects(cls);
}

function wireCounselUI(rootSelector, cls) {
  const root = document.querySelector(rootSelector);
  if (!root) return;

  // Delegated handler works for first row + cloned rows
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const isRepresented = t.classList.contains(`${cls}-represented`);
    const isUseExisting = t.classList.contains(`${cls}-use-existing-lawyer`);
    if (!isRepresented && !isUseExisting) return;

    const row = t.closest(".party-block");
    if (!row) return;

    syncCounselUIForRow(row, cls);
  });

  // Initial sync on load / populate
  root.querySelectorAll(".party-block").forEach((row) => syncCounselUIForRow(row, cls));
}

/* ---------------------------------------
   Court info (load/save + populate)
----------------------------------------*/
function readCourtFromDom() {
  return {
    file: {
      year: (document.getElementById("court-file-year")?.value || "").trim(),
      assigned: (document.getElementById("court-file-assigned")?.value || "").trim(),
      suffix: (document.getElementById("court-file-suffix")?.value || "").trim(),
    },
    name: (document.getElementById("name-of-court")?.value || "").trim(),
    proceedingPlace: (document.getElementById("proceeding-place")?.value || "").trim(),
  };
}

function fillCourtIntoDom(court) {
  if (!court) return;
  const set = (id, v) => {
    const n = document.getElementById(id);
    if (n) n.value = v || "";
  };
  set("court-file-year", court.file?.year);
  set("court-file-assigned", court.file?.assigned);
  set("court-file-suffix", court.file?.suffix);
  set("name-of-court", court.name);
  set("proceeding-place", court.proceedingPlace);
}

/* ---------------------------------------
   Read one party block (pl|df)
----------------------------------------*/
function readPartyNode(node, cls) {
  if (!node) return null;

  const first = node.querySelector(`.${cls}-first`)?.value.trim() || "";
  const last = node.querySelector(`.${cls}-last`)?.value.trim() || "";
  const company = node.querySelector(`.${cls}-company`)?.value.trim() || "";

  const addr1 = node.querySelector(`.${cls}-addr1`)?.value.trim() || "";
  const addr2 = node.querySelector(`.${cls}-addr2`)?.value.trim() || "";
  const city = node.querySelector(`.${cls}-city`)?.value.trim() || "";
  const prov = node.querySelector(`.${cls}-prov`)?.value.trim() || "";
  const postal = node.querySelector(`.${cls}-postal`)?.value.trim() || "";
  const phone = node.querySelector(`.${cls}-phone`)?.value.trim() || "";
  const email = node.querySelector(`.${cls}-email`)?.value.trim() || "";

  const representedEl = node.querySelector(`.${cls}-represented`);
  const represented = !!(representedEl && representedEl.checked);

  let lawyer = null;
  let useExistingLawyer = false;

  if (represented) {
    useExistingLawyer = !!node.querySelector(`.${cls}-use-existing-lawyer`)?.checked;
    const sel = node.querySelector(`.${cls}-lawyer-select`);

    if (useExistingLawyer && sel && sel.value) {
      try {
        lawyer = JSON.parse(sel.value);
      } catch {
        lawyer = null;
      }
    } else {
      lawyer = {
        firm: node.querySelector(`.${cls}-law-firm`)?.value.trim() || "",
        first: node.querySelector(`.${cls}-law-first`)?.value.trim() || "",
        last: node.querySelector(`.${cls}-law-last`)?.value.trim() || "",
        addr1: node.querySelector(`.${cls}-law-addr1`)?.value.trim() || "",
        addr2: node.querySelector(`.${cls}-law-addr2`)?.value.trim() || "",
        city: node.querySelector(`.${cls}-law-city`)?.value.trim() || "",
        prov: node.querySelector(`.${cls}-law-prov`)?.value.trim() || "",
        postal: node.querySelector(`.${cls}-law-postal`)?.value.trim() || "",
        phone: node.querySelector(`.${cls}-law-phone`)?.value.trim() || "",
        email: node.querySelector(`.${cls}-law-email`)?.value.trim() || "",
        license: node.querySelector(`.${cls}-law-license`)?.value.trim() || "",
      };
    }
  }

  return {
    first,
    last,
    company,
    contact: { addr1, addr2, city, prov, postal, phone, email },
    represented,
    useExistingLawyer,
    lawyer,
  };
}

/* ---------------------------------------
   Validation
----------------------------------------*/
function requireIdentity(node, cls, partyLabel, requiredStrict) {
  const first = node.querySelector(`.${cls}-first`)?.value.trim() || "";
  const last = node.querySelector(`.${cls}-last`)?.value.trim() || "";
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
    [`.${cls}-city`, "City"],
    [`.${cls}-prov`, "Province"],
    [`.${cls}-postal`, "Postal Code"],
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
    [`.${cls}-law-first`, "lawyer first name"],
    [`.${cls}-law-last`, "lawyer last name"],
    [`.${cls}-law-addr1`, "lawyer address 1"],
    [`.${cls}-law-city`, "lawyer city"],
    [`.${cls}-law-prov`, "lawyer province"],
    [`.${cls}-law-postal`, "lawyer postal code"],
    [`.${cls}-law-phone`, "lawyer phone"],
    [`.${cls}-law-email`, "lawyer email"],
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
   Collect / populate reusable lawyers
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
  root.querySelectorAll(`${extraSel} .party-block`).forEach((n) => blocks.push(n));

  const map = new Map();
  for (const n of blocks) {
    const represented = !!n.querySelector(`.${sideCls}-represented`)?.checked;
    if (!represented) continue;

    const useExisting = !!n.querySelector(`.${sideCls}-use-existing-lawyer`)?.checked;
    let l = null;

    if (useExisting) {
      const sel = n.querySelector(`.${sideCls}-lawyer-select`);
      if (sel && sel.value) {
        try {
          l = JSON.parse(sel.value);
        } catch {
          l = null;
        }
      }
    } else {
      const first = n.querySelector(`.${sideCls}-law-first`)?.value.trim();
      const last = n.querySelector(`.${sideCls}-law-last`)?.value.trim();
      const firm = n.querySelector(`.${sideCls}-law-firm`)?.value.trim();
      const lic = n.querySelector(`.${sideCls}-law-license`)?.value.trim();

      if (first || last || firm || lic) {
        l = {
          firm: firm || "",
          first: first || "",
          last: last || "",
          addr1: n.querySelector(`.${sideCls}-law-addr1`)?.value.trim() || "",
          addr2: n.querySelector(`.${sideCls}-law-addr2`)?.value.trim() || "",
          city: n.querySelector(`.${sideCls}-law-city`)?.value.trim() || "",
          prov: n.querySelector(`.${sideCls}-law-prov`)?.value.trim() || "",
          postal: n.querySelector(`.${sideCls}-law-postal`)?.value.trim() || "",
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

  root.querySelectorAll(`.${sideCls}-lawyer-select`).forEach((sel) => {
    const current = sel.value || "";
    sel.innerHTML = `<option value="">— select —</option>`;

    lawyers.forEach((l) => {
      const opt = document.createElement("option");
      opt.textContent = lawyerDisplay(l);
      opt.value = JSON.stringify(l);
      sel.appendChild(opt);
    });

    if (current) {
      const found = Array.from(sel.options).some((o) => o.value === current);
      if (found) sel.value = current;
    }
  });
}

/* ---------------------------------------
   Read lists
----------------------------------------*/
function readPartyList(rootSelector, firstSelector, extraSelector, cls) {
  const out = [];
  const root = document.querySelector(rootSelector);
  if (!root) return out;

  const firstNode = root.querySelector(firstSelector);
  if (firstNode) out.push(readPartyNode(firstNode, cls));

  const extraWrap = root.querySelector(extraSelector);
  if (extraWrap) {
    extraWrap.querySelectorAll(".party-block").forEach((row) => out.push(readPartyNode(row, cls)));
  }

  // keep only rows with a valid identity
  return out.filter(
    (p) =>
      p &&
      ((p.company && p.company.trim()) || ((p.first && p.first.trim()) && (p.last && p.last.trim())))
  );
}

/* ---------------------------------------
   DOM helpers for population & cloning
----------------------------------------*/
function clearPartyRow(row, cls) {
  row
    .querySelectorAll(
      `.${cls}-first, .${cls}-last, .${cls}-company, .${cls}-addr1, .${cls}-addr2, .${cls}-city, .${cls}-prov, .${cls}-postal, .${cls}-phone, .${cls}-email, .${cls}-law-firm, .${cls}-law-first, .${cls}-law-last, .${cls}-law-addr1, .${cls}-law-addr2, .${cls}-law-city, .${cls}-law-prov, .${cls}-law-postal, .${cls}-law-phone, .${cls}-law-email, .${cls}-law-license`
    )
    .forEach((i) => {
      i.value = "";
    });

  row.querySelectorAll(`.${cls}-represented, .${cls}-use-existing-lawyer`).forEach((i) => {
    i.checked = false;
  });

  const sel = row.querySelector(`.${cls}-lawyer-select`);
  if (sel) sel.innerHTML = `<option value="">— select —</option>`;

  // reset UI state
  const box = row.querySelector(".lawyer-fields");
  if (box) box.hidden = true;

  const ex = row.querySelector(".existing-lawyer-select");
  if (ex) ex.hidden = true;

  const manual = row.querySelector(".manual-lawyer-fields");
  if (manual) manual.hidden = false;
}

function fillPartyRow(row, cls, data) {
  const setVal = (selector, v) => {
    const n = row.querySelector(selector);
    if (n) n.value = v || "";
  };
  const setChk = (selector, on) => {
    const n = row.querySelector(selector);
    if (n) n.checked = !!on;
  };

  setVal(`.${cls}-first`, data.first);
  setVal(`.${cls}-last`, data.last);
  setVal(`.${cls}-company`, data.company);

  setVal(`.${cls}-addr1`, data.contact?.addr1);
  setVal(`.${cls}-addr2`, data.contact?.addr2);
  setVal(`.${cls}-city`, data.contact?.city);
  setVal(`.${cls}-prov`, data.contact?.prov);
  setVal(`.${cls}-postal`, data.contact?.postal);
  setVal(`.${cls}-phone`, data.contact?.phone);
  setVal(`.${cls}-email`, data.contact?.email);

  setChk(`.${cls}-represented`, data.represented);
  setChk(`.${cls}-use-existing-lawyer`, !!data.useExistingLawyer);

  const sel = row.querySelector(`.${cls}-lawyer-select`);

  if (data.represented) {
    // populate list first so options exist
    populateLawyerSelects(cls);

    const l = data.lawyer || null;

    if (sel && l && data.useExistingLawyer) {
      const v = JSON.stringify(l);
      const found = Array.from(sel.options).some((o) => o.value === v);
      if (!found) {
        const opt = document.createElement("option");
        opt.textContent = lawyerDisplay(l);
        opt.value = v;
        sel.appendChild(opt);
      }
      sel.value = v;
    } else if (sel) {
      sel.value = "";
    }

    // Fill manual fields only if NOT using existing
    if (l && !data.useExistingLawyer) {
      setVal(`.${cls}-law-firm`, l.firm);
      setVal(`.${cls}-law-first`, l.first);
      setVal(`.${cls}-law-last`, l.last);
      setVal(`.${cls}-law-addr1`, l.addr1);
      setVal(`.${cls}-law-addr2`, l.addr2);
      setVal(`.${cls}-law-city`, l.city);
      setVal(`.${cls}-law-prov`, l.prov);
      setVal(`.${cls}-law-postal`, l.postal);
      setVal(`.${cls}-law-phone`, l.phone);
      setVal(`.${cls}-law-email`, l.email);
      setVal(`.${cls}-law-license`, l.license);
    }
  } else {
    if (sel) {
      sel.innerHTML = `<option value="">— select —</option>`;
      sel.value = "";
    }
  }

  // ensure the UI (hidden/shown) matches saved state
  syncCounselUIForRow(row, cls);
}

function clonePartyRow(side) {
  const isPl = side === "pl";
  const rootSel = isPl ? "#plaintiff-information" : "#defendant-information";
  const firstSel = isPl ? ".party-first" : ".def-party-first";
  const extraSel = isPl ? "#extra-plaintiffs" : "#extra-defendants";
  const cls = isPl ? "pl" : "df";

  const root = document.querySelector(rootSel);
  const first = root?.querySelector(firstSel);
  const extra = root?.querySelector(extraSel);
  if (!root || !first || !extra) return null;

  const row = first.cloneNode(true);

  // ✅ Prevent duplicate IDs in cloned rows
  row.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

  row.classList.remove("party-first");
  row.classList.remove("def-party-first");
  row.classList.add("party-block");


  clearPartyRow(row, cls);
  extra.appendChild(row);

  // ✅ FIX: wire the "Add another..." button inside THIS cloned row
  const addBtn = row.querySelector(".add-party-btn");
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clonePartyRow(side);
    });
  }

  // ✅ NEW: ensure cloned rows have a Remove button + wiring
  const actions = row.querySelector(".party-actions");
  if (actions) {
    let removeBtn = actions.querySelector(".remove-party-btn");
    if (!removeBtn) {
      removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-party-btn";
      removeBtn.textContent = "Remove";
      actions.appendChild(removeBtn);
    }

    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      row.remove();
      // refresh reusable-lawyer dropdowns since the set of lawyers may have changed
      populateLawyerSelects(cls);
    });
  }

  // keep any dynamic selects in sync
  populateLawyerSelects(cls);

  // ensure new row starts with correct UI state
  syncCounselUIForRow(row, cls);

  return row;
}



function ensurePartyRowsFromData(side, list) {
  const isPl = side === "pl";
  const rootSel = isPl ? "#plaintiff-information" : "#defendant-information";
  const firstSel = isPl ? ".party-first" : ".def-party-first";
  const extraSel = isPl ? "#extra-plaintiffs" : "#extra-defendants";
  const cls = isPl ? "pl" : "df";

  const root = document.querySelector(rootSel);
  const first = root?.querySelector(firstSel);
  const extra = root?.querySelector(extraSel);
  if (!root || !first || !extra) return;

  if (list.length === 0) {
    clearPartyRow(first, cls);
    extra.querySelectorAll(".party-block").forEach((n) => n.remove());
    syncCounselUIForRow(first, cls);
    return;
  }

  fillPartyRow(first, cls, list[0]);

  const existing = [...extra.querySelectorAll(".party-block")];
  const need = Math.max(0, list.length - 1);

  for (let i = existing.length; i < need; i++) clonePartyRow(side);

  const rows = [...extra.querySelectorAll(".party-block")];
  rows.forEach((row, idx) => fillPartyRow(row, cls, list[idx + 1]));

  if (rows.length > need) rows.slice(need).forEach((n) => n.remove());

  populateLawyerSelects(cls);
}

/* ---------------------------------------
   Main
----------------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  // Optional Back button (if present)
  const backBtn = document.getElementById("back");
  if (backBtn) {
    backBtn.onclick = () => {
      try {
        if (
          document.referrer &&
          new URL(document.referrer).origin === location.origin &&
          history.length > 1
        )
          return history.back();
      } catch (_) {}
      window.location.href = "index.html";
    };
  }

  // Wire "Add another …" buttons — accept either set of IDs to be resilient
  const addPl = document.getElementById("add-plaintiff") || document.getElementById("add-plaintiff-initial");
  const addDf = document.getElementById("add-defendant") || document.getElementById("add-defendant-initial");
  if (addPl) addPl.addEventListener("click", (e) => { e.preventDefault(); clonePartyRow("pl"); });
  if (addDf) addDf.addEventListener("click", (e) => { e.preventDefault(); clonePartyRow("df"); });

  // ✅ Delegated remove handler (works for any .remove-party-btn)
  function wireRemoveDelegation(rootSelector, extraSelector, cls) {
    const root = document.querySelector(rootSelector);
    const extra = document.querySelector(extraSelector);
    if (!root || !extra) return;

    root.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".remove-party-btn");
      if (!btn) return;

      const row = btn.closest(".party-block");
      if (!row) return;

      // Only allow removing rows that are in the "extra" container
      if (!extra.contains(row)) return;

      e.preventDefault();
      row.remove();
      populateLawyerSelects(cls);
    });
  }

  wireRemoveDelegation("#plaintiff-information", "#extra-plaintiffs", "pl");
  wireRemoveDelegation("#defendant-information", "#extra-defendants", "df");



  // Populate from storage (court + parties)
  const data = loadCase() || {};
  fillCourtIntoDom(data?.court);

  const plaintiffs = Array.isArray(data.plaintiffs) ? data.plaintiffs : [];
  const defendants = Array.isArray(data.defendants) ? data.defendants : [];
  ensurePartyRowsFromData("pl", plaintiffs);
  ensurePartyRowsFromData("df", defendants);

  // Counsel UI wiring (must be AFTER rows exist in DOM)
  wireCounselUI("#plaintiff-information", "pl");
  wireCounselUI("#defendant-information", "df");

  // Motion UI (if present)
  const motionYes = document.getElementById("motion-yes");
  const motionNo = document.getElementById("motion-no");
  const motionBox = document.getElementById("motion-fields");
  function syncMotionUI() {
    const isYes = radioChecked("motion-yes");
    show(motionBox, isYes);
    if (!isYes) {
      document.getElementById("moving-plaintiff")?.removeAttribute("checked");
      document.getElementById("moving-defendant")?.removeAttribute("checked");
    }
  }
  [motionYes, motionNo].forEach((r) => r && r.addEventListener("change", syncMotionUI));
  if (motionBox) syncMotionUI();

  // Submit → collect & save jf_case → go to intro page
  const form = document.querySelector("form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const plList = readPartyList("#plaintiff-information", ".party-first", "#extra-plaintiffs", "pl");
    const dfList = readPartyList("#defendant-information", ".def-party-first", "#extra-defendants", "df");

    // Validate identity on first rows (strict)
    const plRoot = document.querySelector("#plaintiff-information");
    const dfRoot = document.querySelector("#defendant-information");
    const plFirst = plRoot?.querySelector(".party-first");
    const dfFirst = dfRoot?.querySelector(".def-party-first");
    if (plFirst && !requireIdentity(plFirst, "pl", "Plaintiff (first row)", true)) return;
    if (dfFirst && !requireIdentity(dfFirst, "df", "Defendant (first row)", true)) return;

    // Optional: require contact on first rows
    // if (plFirst && !requireContact(plFirst, "pl", "Plaintiff (first row)")) return;
    // if (dfFirst && !requireContact(dfFirst, "df", "Defendant (first row)")) return;

    const next = loadCase() || {};
    next.court = readCourtFromDom();
    next.plaintiffs = plList;
    next.defendants = dfList;

    try {
      saveCase(next);
    } catch (err) {
      console.error(err);
      alert("Could not save your information in this browser.");
      return;
    }

    window.location.href = "affidavit-intro.html";
  });
});
