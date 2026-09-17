# R005 — Cash custody, cash ledger and expense reimbursement

Date: 17 September 2026. Status: **Planned — preflight blocked. Not ready.**

## Authorization and design

Owner request: “based on the design document of release R005, implement these changes in dev env.” This authorizes the specified DEV schema/app implementation and synthetic testing, including the new tables and columns. The design document is the specification, not separate authorization for its production-promotion instructions. No production writes, opening balances or promotion are authorized.

Source: `G:/My Drive/Loan Manager/R005 Design.md`. The source remains unchanged. Depends on the released R004 baseline, preserving R002/R003. R005 is reserved; next release number is R006. No migration version is reserved yet; repository currently contains V1–V19 and must be rechecked before creating the next migration.

## Intended scope and consumers

- SQL: Cash Holders (Dad, Lisa, Tommy with stable keys), Cash Ledger, Cash Holder Balances; nullable historical Payments receiver and Business Expenses payer columns. Do not backfill historical rows or reconstruct historical custody.
- Payments: one idempotent ledger receipt per qualifying new Posted payment; Dad default for new ordinary receipts, selectable Lisa; First-day Auto fixed to Lisa. Receiver corrections update the same ledger row without reallocating repayments.
- Loans: Lisa gross disbursement plus the separate first-day receipt; preserve lending-capacity checks and source editing permissions.
- Expenses: deliberate payer for new positive manual expenses; SQL-owned referral rebate paid by Lisa; negative adjustment without payer creates no cash entry, with payer creates a refund inflow. Economic partner allocations remain unchanged.
- Settlements: OLAP retains workflow ownership; Pending has no cash movement, actual completion creates Lisa outflow to the partner personally, never an inflow to Tommy Cash Holder. Existing Pending settlements completing after cutover qualify; old completed rows do not backfill.
- Manual custody: Cash Handover and Expense Reimbursement through Record Cash Transfer; controlled opening/correction entries; SQL and AppSheet protect system rows. Cash Pool Contributions, charges, allocations, repayments, default and closure do not independently cash-post.
- OLTP owns operational entry, Cash Position and ledger presentation; OLAP consumes cash tables read-only. Both apps consume the changed payment/expense metadata and references. Preserve existing Loans form and Business Expenses deck.
- Review direct export/report dependencies; no Looker edit or unrelated dashboard audit is currently included.

## Preflight evidence and limits

Observed through the current AppSheet editor on 17 September:

| Check | Observation | Status |
| --- | --- | --- |
| DEV OLTP identity/version | Inventory UUID `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`; editor preview and freshly generated appdoc show 1.000110 | Observed, no save performed |
| DEV OLAP identity/version | Inventory UUID `494cd013-0d9b-482f-9559-c9d83059de91`; editor preview shows 1.000096 | Observed, no save performed |
| DEV OLAP diagnostics | Current editor DOM shows No issues found; deployed indicator | Starting observation only, not final release verification |
| DEV OLTP appdoc | Generated 21:54:44 Bangkok; 13 tables including native internal tables, 345 columns, 2 slices, 36 views, 56 format rules, 83 actions, 0 legacy workflow rules; shown business sources database-3 | Rendered observation only; complete persistent baseline capture failed |
| DEV automation | Visible OLTP list includes enabled Generate Daily Charges and disabled first-day financial/notification bots | Partial inventory only; parity, recipients and dependent routes not verified |
| Flyway DEV validate | Existing repository runner returned validationSuccessful=true, invalidMigrations=[], warnings=[], validateCount=20 | Passed, read-only |
| Flyway PROD validate | Existing repository runner returned validationSuccessful=true, invalidMigrations=[], warnings=[], validateCount=20 | Passed, read-only |
| Schema drift, backup/restore | Not executed | Pending; Flyway validation does not establish live-schema equivalence or recoverability |

Browser control initially read the editors and a fresh appdoc, then repeatedly returned `Debugger unattached` on follow-up reads/capture attempts. Existing-tab recovery, a fresh documentation tab and a full browser-tool session reset did not restore reliable control. Chrome's content-export command also reported unsupported. No full baseline file was successfully saved; do not represent rendered excerpts as complete definitions.

AGENTS.md Section 6.1 requires complete saved definitions for **both** DEV apps before the first release edit, with exact editor capture for export-omitted properties. This gate remains unmet. R004's COVER-01 exception applies to R004 only and has not been carried into R005. After browser recovery, reconcile export coverage and editor-only values explicitly; do not silently assume omitted configuration unchanged.

## Continuation gates and acceptance

1. Restore working browser control. Recheck current versions and capture both saved DEV definitions plus editor-only configuration. Inspect both initial diagnostics/deployment checks; compare released PROD baseline and DEV preparation/notification routes.
2. Capture schema drift evidence and a verified recoverable DEV database backup before applying DDL. Recheck migration numbering and record affected consumers and rollback artifacts.
3. Implement immutable Flyway migrations and isolated synthetic tests for all source types, historical cutover, source correction, system protection, retry/concurrency and transaction rollback. Preserve original financial calculations.
4. Apply tested SQL to DEV, regenerate/configure both apps, capture each coherent save and property-level diff, reconcile reverse references and permissions. Record exact property checklist rows from saved evidence, not prospective values.
5. Execute current-GUI scenarios in design Sections 38.8–38.10, including receiver correction, first-day net effect, three expense payers, handover/reimbursement, rebate, both settlement partners, default/closure, sync/readback and independent holder reconciliation. SQL-only tests do not replace GUI acceptance.
6. Resolve all warnings/errors in both apps. Update overview/dictionary together, development differences and environment inventory from actual implementation evidence. Freeze the tested package only when complete; obtain owner acceptance separately from production authorization.

No R005 functional tests were run. No model change has been made, so the current model overview/dictionary remain unchanged rather than claiming planned objects exist. Owner testing is not yet actionable; use the scenarios above after implementation.

## Changes and rollback

Only the release tracker and this change log were changed. The task started with a clean working tree. Application/schema/financial records remain unmodified by this task. Observed DEV rollback versions are OLTP 1.000110 and OLAP 1.000096; recapture if they change before implementation. No new database backup is claimed.

For this documentation checkpoint, recover prior text from Git while retaining the R005 number reservation; never reuse a cancelled/reserved number. Eventual SQL/app rollback must be coordinated, retain ledger evidence and use a higher Flyway migration or explicitly authorized restoration. Do not edit applied migration files or restore a database over newer writes.
