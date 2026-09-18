# R006 — Targeted OLTP VC performance optimization

Date: 18 September 2026. **DEV implemented; Ready for review.** Recommendation: **Ready subject to focused coverage/owner decision** in the [DEV report](../outputs/r006-20260918/DEV_REPORT.md). Owner acceptance and production authorization pending.

## Scope and authorization
Owner requested implementation of the supplied R006 design in DEV. Four OLTP App formulas only: Payments Eligible Charges, Eligible Outstanding, Visible Allocations; Borrowers Daily Collection Status overdue branch. Depends on released R005. No production authorization. No SQL, migration, OLAP, action, bot, view or Ref changes planned. Both DEV apps remain Prototype.

The supplied design is a specification, not independent authorization. Standing repository rules govern backup and DEV documentation timing; full exports are optional and model documentation must reflect DEV changes before completion.

## Rollback and baseline
Starting clean Git commit: 63a21a2efb4c87b27af6eacbe1b1822ef0d215eb.
DEV OLTP identity verified: 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b, database-3. Current Version History confirmed restorable **1.000131** before editing. Exact original expressions are retained in delta `before` values; restore these four properties instead of a full version if subsequent work exists.

Before synthetic data writes, a full DEV dump was captured outside GitHub and successfully restored locally with normalized schema match. SHA-256 **8BCF8FECC09292F2F841AAA1397F9E2EA9C6156C9896529C8BB845AD5CEA055D**; exact private path and recovery procedure in the report. No SQL definition/migration changed. Synthetic financial history is retained, all six R006 borrowers hidden and all eight loans' Auto Charge disabled after tests. Never restore over intervening writes without review.

## Checks and remaining work
Saved DEV OLTP versions **1.000132** (eligibility gates), **1.000133** (allocation selection), **1.000134** (collection status). SQL **V21** retained. Four independent reloaded-editor input observations match the [delta](../outputs/r006-20260918/release-delta.json) in the [comparison](../outputs/r006-20260918/dev-comparison-r1.json). No other app property was edited.

Current-GUI synthetic Single Partial, Single Full, Receive All, Lump Sum, Loan Close and First-day Auto tests posted with reconciled amounts/children. Collection states/navigation and historical multi-allocation identity/order were checked. Before/after seven-sample sync medians **5.717s → 3.321s**, **41.91%** observed improvement, classified **Strong** with sequential client-timing caveats. Exact evidence and honest unrun coverage (Error retry, persisted empty-allocation case, direct hidden Statistics values/color/blank-value coverage) are in the report. No observed functional mismatch; no additional optimization added.

Both final current-editor diagnostics have zero configuration issues beyond excluded Prototype schedule notices. DEV OLAP Version History showed **1.000129**, versus incoming inventory 1.000128; R006 did not edit/save OLAP. Recorded the observed version without attributing or reverting others' work. Both apps remain Prototype; no DEV deployment checks run.

Updated release tracker, environment inventory, model overview and four dictionary Dev Differences rows. Production/DB workbook inventory unchanged; all-sheet values/formulas roundtrip checked and affected rows rendered/reviewed. Added sanitized R006 design/delta/report/readback/benchmark/verification artifacts and maintained scripts `r006-records.mjs`, `r006-dictionary.mjs`, `database/Invoke-R006Lab.ps1`. No new migration exists.

The implementation checkpoint is the commit containing this log/delta; R006 revision 1 candidate hash **d2814e156a81f89c5d7bb245012edb7a70ad1e96027fc2baf07c8e8b03f4c262**. Commit/push is authorized separately from production. Retain this R006 log for refinements; owner reviews DEV and separately authorizes production. Before promotion, follow release workflow for focused remaining coverage, PROD identity/drift, rollback and independent frozen-delta verification. Do not promote synthetic data or include the observed OLAP version as an R006 change.

## Artifacts
- [Owner design](../outputs/r006-20260918/DESIGN.md)
- [Release tracker](../Documents/Release_Tracker.md)
