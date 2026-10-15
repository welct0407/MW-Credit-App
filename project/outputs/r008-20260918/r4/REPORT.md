# R008 revision 4 — native borrower navigation

DEV only, 19 September 2026. Saved OLTP **1.000181**, OLAP **1.000170**, both Prototype; SQL remains V24. PROD remains V22 / OLTP 3.000173 / OLAP 1.100131. This revision supersedes revision 3 for candidate review, retaining all preceding R008 functionality and the Bangkok-date repair.

## Owner-requested behavior

Charges and Repayments previously displayed a Text Borrower Name TE with a custom Open Borrower action attached. Both apps now display a native virtual Ref, Borrower Reference TE, using `[Ref Loans].[Ref Borrowers]`, referencing Borrowers.Row ID, not part-of, read-only, neither key nor label, displayed as Borrower Name TE in detail views. The existing Text fields and their consumers remain intact. Loans_Detail uses its existing Ref Borrowers in the same position; the native View Ref action is attached to Ref Borrowers again.

Deleted Open Borrower from Charge and Open Borrower from Repayment in both apps. Saved action/view/slice inspection found no remaining references to these custom actions. Remaining Text-name view uses are borrower labels, loan grouping and formatting, not custom borrower-navigation actions. Native generated View Ref actions remain intrinsic to AppSheet Ref navigation.

The owner's additional request extends Receive All hiding to **all borrower detail screens**, including Borrowers_Detail opened from a charge. The condition uses `CONTEXT("ViewType") <> "Detail"` with the previous financial eligibility checks unchanged. Collection's inline action and its account selector remain available.

## Generated dependencies and model records

The four new forward Refs generated four read-only Borrowers reverse lists: OLTP Related Repayments / Related Charges; OLAP Related Repayments / Related Charges By Borrower Reference TE. The pre-existing OLAP Related Charges based on Ref Collection Borrower is unchanged. Generated ordered slice membership and four native Ref actions are included in this revision. Existing detail column orders are explicit and do not expose the new reverse lists. Reporting Charges and Reporting Repayments slice membership is unchanged; Reporting Borrowers receives only generated reverse-list membership. No SQL provider, metric, physical schema, report binding, financial data or notification route changes.

The model overview and dictionary retain the production reference with labeled DEV changes. Exact saved properties and prior definitions are in BT/BA/AT/AA.json, generated action captures and RECEIVE_SAVED.json. The 33 refinement targets include 9 updates to existing R008 items and 24 additions, producing a complete **199-item** candidate. Earlier observations for unaffected targets are explicitly reused with their original versions/timestamps. Navigation readbacks at OLTP 1.000180 remain applicable at 1.000181, whose only subsequent edit is Receive All visibility. Revision 3's ordinary-borrower prominent-action test is superseded.

## Current GUI verification

- OLTP and OLAP Charges_Detail, Loans_Detail and Repayments_Detail: clicking the **Ref field itself**, not the adjacent action icon, opens Borrowers_Detail for the correct synthetic borrower R008GUI-E. All six tests pass. Fixtures: R008GUI-CE1, R008GUI-LE and repayment `pc6:22:3vDYFamdywqPlAWH5aWhIv:R008GUI-CE1`.
- OLTP charge R006-Lump-C2 → borrower R006-Lump: correct borrower detail opens and Receive All is absent; Lump Sum remains. This borrower has a remaining balance, so absence is not caused by fully-paid eligibility.
- Collection's R006-Lump inline Receive All opens the one-field selector with DEV Dad Account 2 preselected. Cancel returns without saving or posting. No financial write was performed during this refinement.
- Final saved current-editor diagnostics show only the specifically owner-excluded existing Prototype schedule execution limitations: OLTP Daily 00:05 and OLAP Every Hour. No other configuration errors/warnings. Schedules and Prototype modes preserved; no Deployment Check.
- Saved configuration comparison verifies every recorded target; prior SQL/financial regression evidence is reused because no financial implementation changed. No new notification execution or mobile-performance claim.

## Recovery and readiness

Starting Git commit **6220df6748159e0d412c7669d8fc5b5ebfb3f13e**, clean tree. Restorable pre-edit app versions: OLTP **1.000179**, OLAP **1.000169**. BT/BA capture prior affected definitions; restore these properties or use coordinated app-version recovery while preserving later work. No database restore is needed for this refinement. Whole R008 recovery and V23→V24 promotion order remain in the original candidate report/manifest.

Requested desktop behavior is implemented and verified. **Ready for review subject to existing owner checks**, not production-authorized: compact-form/mobile acceptance, explicit account opening allocations and production recipient-context review. Live openings remain uninitialized. Promotion requires scoped approval, current rollback points, independent PROD verification and the existing production documentation checklist. No production closure is claimed.

Dictionary verification: appended 44 exact DEV rows at Dev Differences!A2725:E2768; every pre-existing worksheet value and formula preserved through export/import. Three rendered samples reviewed for legibility. Canonical configuration SHA256: 3a689c3d9a658f1927c57cb202ee06b0c74bdd10de0527a71783ca4a5cbfd656.
