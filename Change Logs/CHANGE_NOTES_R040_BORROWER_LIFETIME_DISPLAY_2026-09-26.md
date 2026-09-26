# R040 — Borrower Portfolio lifetime display

**Date:** 26 September 2026. **Status:** Metabase report saved and verified; R040 remains Open for owner review.

**Purpose and scope:** Show the achieved daily interest-rate bar at one decimal and add that rate plus lifetime interest return to the bottom Borrower comparison table. The two ratios reuse model 310 without changing their formulas or Activity-date independence.

**Changed objects/files:** Metabase dashboard 3, Portfolio tab 104, saved questions 313 (format only) and 289 (two model-backed columns, table format). Maintained scoped helper `scripts/metabase/RefineBorrowerLifetimeDisplay.mjs`; sanitized plan/verification and handover under `outputs/r040-borrower-lifetime-display/`; current report/release references. No AppSheet, SQL, financial data, permission or runtime change.

**Rollback:** Starting Git `82677ce27768648561f7872f7aab699d5cfe0ffc`; pre-change dashboard/cards/model held privately under `Documents/ChatGPT/AppSheet-Loan-Project/r040-borrower-lifetime-display`. Recovery dashboard 14 was created before either card edit. Restore questions 313/289 from the private baseline after checking for intervening edits; dashboard layout was not changed.

**Checks:** New query preflight; saved card/readback checks; 30 comparison rows and eight rate bars queried; both new values reconciled to model 310 by borrower ID; date-slicer invariance and population mapping checked; dashboard placements and Detail drill link preserved. Refreshed Chrome Gmail UI showed one-decimal bar labels and both one-decimal comparison values. No remaining manual test identified.

[Implementation and evidence](../outputs/r040-borrower-lifetime-display/README.md).
