# Phase 6 — atomic Default Loan (2026-09-15)

**Subsequent release:** the owner accepted the implementation through the explicit request to promote phases 1–6 on 15 September 2026. Production promotion is complete at OLTP 3.000094 / OLAP 1.100062 / Flyway V10; see the core-promotion-20260915 release report. Separate phase-6 device notification feedback was not explicitly received. The development-only status and rollback checkpoints below are historical.


Status: implemented and verified in development; owner acceptance/notification feedback pending. Production unchanged. Implementation published to master as `6202997846fabfc7a5c175c383cdc6184bc4322a`; independent GitHub migration CI passed.

## Rollback and scope
- Starting Git commit: `8bc5e6243eae8cd75bd2e2f9f55f96592d96d063`.
- Confirmed current development OLTP and OLAP appdoc versions: **1.000039 / 1.000039**; development Flyway V9.
- Private development dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/default-loan-20260915/development-before.dump`; pg_restore listing checked; SHA256 `c0d12ea906c8c9a5137542599c1947d5dc07bb9b408882225053ff700760173c`.
- Normalized starting business schema SHA256 `49765db93df4c0851d171394d9e340f0b0f361d6e4160bc62861a6cd165aea91`.
- Production and phase 7 analytics are outside scope. Development nightly generation remains owner-approved at 00:05 Bangkok.

## Design and consumers
OLTP owns the confirmed Default Loan action. Loans, Charges and Repayments are shared with OLAP; payment allocations remain linked to their original charges. Preserve the prototype's zero-cash loss posting: remaining principal paid with equal negative interest, plus Default Loss Amount. Use the existing Defaulted transition with Close Date and Closed By as the atomic request; no new physical column or table.

Replace the six-step financial action chain with one update. Retain unpaid charges instead of deleting them: reduce outstanding components to paid components and append an audit note containing original amounts, write-off amounts, date, actor and posting reference. This preserves keys and history but retains more charge rows than the legacy deletion flow; count-based reporting may therefore differ. No unrelated Looker audit or report edit is planned.

## Verification and rollback
V10 applied and validated at 21:24 Bangkok; migration SHA256 `f1c972d6b85c7abc28e50549ac47534fc540b6a73e57f815bf18cb1c43ee54eb`. Live schema equals the independent V10 rebuild (`242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`). Full payment/close/generation/default functional and concurrency suites pass, repeat migrate is a no-op, and checksum tampering is rejected.

Final app versions: OLTP **1.000042**, OLAP **1.000040**. OLTP changed only the confirmed Default wrapper and seven obsolete Default action conditions; the existing closure notification now distinguishes loss/no cash. OLAP changed only loss currency/decimals to baht/0. Current editor bot inventory retained four reviewed owner-only notification routes and all superseded processing/schedule/export disabled states. No schema regeneration or new business field was needed.

DF10GUI fixtures are retained with borrowers hidden and auto-charge flags off after verification. The approved 00:05 Bangkok development job remains active; its state was rechecked. No production or collection-runtime change.

Current-GUI synthetic defaults in OLTP and readback in OLAP: unpaid daily loss 100/cash 0; partially paid daily loss 90/prior cash 30; fixed-date/no-charge loss 110/cash 0; installment loss 92/prior cash 15. All outstanding principal zero, one loss posting per loan, previous cash and charge/payment references preserved. OLAP remains read-only. Original records across 14 tables match pre-task fingerprints. Owner has been asked to confirm four default pushes and loss/no-cash wording; feedback pending.

Updated overview, XLSX dictionary (12 sheets; intended cells only, native features preserved, error scan and rendered checks), development differences, environment inventory, preparation baseline, database README and CI. Maintained snapshot/lab/regression/concurrency/preservation/dictionary scripts and evidence are under scripts/ and outputs/. Full details: [phase 6 report](../outputs/default-loan-20260915/REPORT.md).

Downstream limitation: retaining written-off charge rows may affect count-based reports. No Looker edit/audit or phase 7 analytics work. Existing OLAP hidden-column/unsearchable warning remains unrelated. No clean end-to-end app performance percentage was measured. Manual final check: sync both development apps, verify loss/zero principal/prior cash on DEV Default fixtures and confirm default notification wording.

For rollback, stop new default requests and restore the recorded OLTP app version only with coordinated database compatibility review; do not replay the legacy six-step action against the new default trigger. Applied migrations remain immutable; use a forward fix or restore the isolated development snapshot. Never restore development financial data into production.

## Publication verification

Normal push verified local HEAD and origin/master equal `6202997846fabfc7a5c175c383cdc6184bc4322a`. [GitHub Database migrations run 11](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/34984089290) succeeded in 3m 37s, including migration immutability and disposable rebuild/default concurrency checks. The sole annotation is the pre-existing pinned checkout action's Node 20/24 compatibility warning. A documentation-only follow-up records this result and clarifies that the V8/V9 app versions in the README describe the earlier checkpoint; it does not change the tested migration or app configuration.
