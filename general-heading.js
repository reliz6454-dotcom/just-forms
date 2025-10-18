// general-heading.js (validated version)

// Shared localStorage key used by all pages
const LS_CASE_KEY = "jf_case";

// Helper to read and trim value by id
const val = (id) => (document.getElementById(id)?.value || "").trim();

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form"); // works even if there's no id
  if (!form) return;

  // Add required attributes for key fields if missing
  const requiredIds = [
    "name-of-court",
    "court-file-year",
    "court-file-assigned",
    "plaintiff-first-name",
    "plaintiff-last-name",
    "defendant-first-name",
    "defendant-last-name"
  ];
  requiredIds.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.setAttribute("required", "");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Trigger HTML5 validation
    if (!form.reportValidity()) return;

    // Collect data
    const courtName = val("name-of-court");
    const year      = val("court-file-year");
    const assign    = val("court-file-assigned");
    const suffix    = val("court-file-suffix");

    const plaintiffFirst = val("plaintiff-first-name");
    const plaintiffLast  = val("plaintiff-last-name");
    const defendantFirst = val("defendant-first-name");
    const defendantLast  = val("defendant-last-name");

    // Build the case object
    const caseData = {
      courtName,
      courtFile: { year, assign, suffix },
      plaintiff: { first: plaintiffFirst, last: plaintiffLast },
      defendant: { first: defendantFirst, last: defendantLast }
    };

    // Save for later pages
    try {
      localStorage.setItem(LS_CASE_KEY, JSON.stringify(caseData));
    } catch (err) {
      console.error("Failed to save case data:", err);
      alert("Could not save your information in this browser.");
      return;
    }

    // Move to next step
    window.location.href = "affidavit-intro.html";
  });
});
