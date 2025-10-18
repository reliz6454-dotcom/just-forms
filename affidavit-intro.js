// affidavit-intro.js (drop-in replacement)

// --- Keys ---
const LS_CASE_KEY = "jf_case";
const LS_OATH_KEY = "jf_oathType";

// --- Helper for values ---
const val = (id) => (document.getElementById(id)?.value || "").trim();

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  // Inputs
  const first = document.getElementById("deponent-first-name");
  const last  = document.getElementById("deponent-last-name"); // (spelling kept to match your HTML)
  const city  = document.getElementById("deponent-city");
  const prov  = document.getElementById("deponent-province");
  const roleDetailBox = document.getElementById("role-detail-box");
  const roleDetail = document.getElementById("role-detail");

  // Radios
  const roleRadios = Array.from(document.querySelectorAll('input[name="role"]'));
  const oathRadios = Array.from(document.querySelectorAll('input[name="oath"]'));

  // 1) Make key fields required (in case HTML doesn't have required)
  [first, last, city, prov].forEach(input => {
    if (input) input.setAttribute("required", "");
  });
  // Role group: put required on one radio in the group if none has it
  if (!roleRadios.some(r => r.hasAttribute("required"))) {
    const firstRole = roleRadios[0];
    if (firstRole) firstRole.setAttribute("required", "");
  }
  // Oath group: keep your existing required on #swear; ensure at least one has required
  if (!oathRadios.some(r => r.hasAttribute("required"))) {
    const swear = document.getElementById("swear");
    if (swear) swear.setAttribute("required", "");
  }

  // 2) Show/hide role detail + make it conditionally required
  function updateRoleDetailRequired() {
    const selected = document.querySelector('input[name="role"]:checked')?.value;
    const needsDetail = selected === "officer" || selected === "employee";

    roleDetailBox.style.display = needsDetail ? "block" : "none";

    if (needsDetail) {
      roleDetail.setAttribute("required", "");
      // Clear any stale custom error when user starts typing
      roleDetail.oninput = () => roleDetail.setCustomValidity("");
    } else {
      roleDetail.removeAttribute("required");
      roleDetail.setCustomValidity("");
    }
  }

  roleRadios.forEach(r => r.addEventListener("change", updateRoleDetailRequired));
  updateRoleDetailRequired(); // initial state

  // 3) Handle submit with validation
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Trigger built-in validation first (required, etc.)
    if (!form.reportValidity()) return;

    // Extra guard: if role requires detail and it's empty, block and focus
    const selectedRole = document.querySelector('input[name="role"]:checked')?.value || "";
    const needsDetail = selectedRole === "officer" || selectedRole === "employee";
    if (needsDetail && !val("role-detail")) {
      roleDetail.setCustomValidity("Please specify your capacity (e.g., Director, Manager).");
      form.reportValidity();
      roleDetail.focus();
      return;
    } else {
      roleDetail.setCustomValidity("");
    }

    // 4) Save the oath (swear/affirm)
    const oathRadio = document.querySelector('input[name="oath"]:checked');
    const oath = oathRadio ? oathRadio.value : null;
    if (!oath) {
      // Shouldn't happen because of required, but guard anyway
      alert("Please choose whether you will swear or affirm.");
      return;
    }
    localStorage.setItem(LS_OATH_KEY, JSON.stringify(oath));

    // 5) Save deponent info
    const deponent = {
      first: val("deponent-first-name"),
      last:  val("deponent-last-name"),
      city:  val("deponent-city"),
      prov:  val("deponent-province"),
      role:  selectedRole,
      roleDetail: val("role-detail")
    };

    // 6) Merge with existing case object from the general heading page
    const existing = JSON.parse(localStorage.getItem(LS_CASE_KEY) || "null");
    if (existing) {
      existing.deponent = deponent;
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(existing));
    } else {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify({ deponent }));
    }

    // 7) Navigate only after all data is valid and saved
    window.location.href = "affidavit-body.html";
  });
});
