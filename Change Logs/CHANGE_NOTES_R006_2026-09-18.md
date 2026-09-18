# R006 — Targeted OLTP VC performance optimization

Date: 18 September 2026. **DEV implemented and R006 applied to PROD.** Release status: **Deployment applied; verification incomplete** because the deployed-state Deployment Check page exposed no fresh Run control. The current PROD editor reports No issues found, all four frozen targets independently read back in PROD version 3.000173, and focused read-only smoke checks loaded the dashboard and Collection views without financial writes.

## Scope and authorization
Owner requested implementation of the supplied R006 design in DEV. Four OLTP App formulas only: Payments Eligible Charges, Eligible Outstanding, Visible Allocations; Borrowers Daily Collection Status overdue branch. Depends on released R005. In the current turn the owner explicitly authorized **“move R006 to prod.”** No SQL, migration, OLAP, action, bot, view or Ref changes were made. Both DEV apps remain Prototype.

The supplied design is a specification, not independent authorization. Standing repository rules govern backup and DEV documentation timing; full exports are optional and model documentation must reflect DEV changes before completion.

## Rollback and baseline
Starting clean Git commit: 63a21a2efb4c87b27af6eacbe1b1822ef0d215eb.
DEV OLTP identity verified: 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b, database-3. Current Version History confirmed restorable **1.000131** before editing. Exact original expressions are retained in delta `before` values; restore these four properties instead of a full version if subsequent work exists.

Before synthetic data writes, a full DEV dump was captured outside GitHub and successfully restored locally with normalized schema match. SHA-256 **8BCF8FECC09292F2F841AAA1397F9E2EA9C6156C9896529C8BB845AD5CEA055D**; exact private path and recovery procedure in the report. No SQL definition/migration changed. Synthetic financial history is retained, all six R006 borrowers hidden and all eight loans' Auto Charge disabled after tests. Never restore over intervening writes without review.

## Checks and remaining work
Saved DEV OLTP versions **1.000132** (eligibility gates), **1.000133** (allocation selection), **1.000134** (collection status). SQL **V21** retained. Four independent reloaded-editor input observations match the [delta](../outputs/r006-20260918/release-delta.json) in the [comparison](../outputs/r006-20260918/dev-comparison-r1.json). No other app property was edited.

Current-GUI synthetic Single Partial, Single Full, Receive All, Lump Sum, Loan Close and First-day Auto tests posted with reconciled amounts/children. Collection states/navigation and historical multi-allocation identity/order were checked. Before/after seven-sample sync medians **5.717s → 3.321s**, **41.91%** observed improvement, classified **Strong** with sequential client-timing caveats. Exact evidence and honest unrun coverage (Error retry, persisted empty-allocation case, direct hidden Statistics values/color/blank-value coverage) are in the report. No observed functional mismatch; no additional optimization added.

Both final current-editor diagnostics have zero configuration issues beyond excluded Prototype schedule notices. DEV OLAP Version History showed **1.000129**, versus incoming inventory 1.000128; R006 did not edit/save OLAP. Recorded the observed version without attributing or reverting others' work. Both apps remain Prototype; no DEV deployment checks run.

## PROD application and verification

Before the write, PROD identity was independently confirmed as Loan Manager ผู้จัดการสินเชื่อ, app ID **93844270-6aa5-420b-a960-bcdf08abd357**, database-2, editor version **3.000172**. That version is the restorable AppSheet rollback point. The four exact frozen PROD targets were saved in the current editor, producing PROD version **3.000173**. After reloading the editor, each formula matched the frozen delta and the editor diagnostic returned **No issues found**. The independent comparison is [prod-comparison-r1.json](../outputs/r006-20260918/prod-comparison-r1.json), with source observations in [prod-saved-observations.json](../outputs/r006-20260918/prod-saved-observations.json).

The current PROD runtime loaded and synchronized the dashboard, then loaded Collection with normal production borrowers and Not Paid/Overdue groups. No R006 synthetic DEV data was visible and no financial write or notification was submitted. The current Deployment Check page reports the app **Deployed**, but in deployed state it exposes no fresh Run control. Switching PROD to Prototype solely to force a check would alter the live deployment state, so the deployment-check zero-warning gate remains pending and the tracker status is **Deployment applied; verification incomplete**. Re-run the current Deployment Check when AppSheet exposes a control, then update this log and the tracker before calling R006 Released.

Updated release tracker, environment inventory, model overview and four dictionary Dev Differences rows. Production/DB workbook inventory unchanged; all-sheet values/formulas roundtrip checked and affected rows rendered/reviewed. Added sanitized R006 design/delta/report/readback/benchmark/verification artifacts and maintained scripts `r006-records.mjs`, `r006-dictionary.mjs`, `r006-promote-dictionary.mjs`, `database/Invoke-R006Lab.ps1`. No new migration exists.

The implementation checkpoint is commit **dad1b79e37e2f22f0b67197a5a7d3ef05054706d**; R006 revision 1 candidate hash **d2814e156a81f89c5d7bb245012edb7a70ad1e96027fc2baf07c8e8b03f4c262**. Production application is recorded in PROD version **3.000173**, with rollback **3.000172**. Commit/push of this promotion evidence and documentation follows the repository owner rule. Do not promote synthetic data or include the observed OLAP version as an R006 change.

## Artifacts
- [Owner design](../outputs/r006-20260918/DESIGN.md)
- [Release tracker](../Documents/Release_Tracker.md)
