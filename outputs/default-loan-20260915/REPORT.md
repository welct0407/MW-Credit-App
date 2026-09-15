# Phase 6 — Default Loan in SQL

Date: 15 September 2026. Development implementation and verification complete; owner acceptance pending. Production unchanged.

## Implemented behavior

The existing confirmed OLTP Default Loan button sets Defaulted TRUE, Close Date TODAY(), Closed By USEREMAIL(), and closed Loan Status in a single update. SQL independently validates the request and derives Default Loss Amount. The closed status is included in the originating AppSheet event so the existing closure bot can route the notification; SQL financial work and closure commit or roll back together.

V10 `default_loan_transition` → `post_loan_default` checks open/nondefaulted/auto-enabled eligibility, positive outstanding principal, paid charges today and unresolved borrower receipts. Bangkok date and nonblank actor are required. Borrower NOWAIT avoids lock inversion with the originating Loans update, followed by ordered charge locks. Duplicate identical requests are no-ops; changes to recorded default financial state are rejected.

Preserve the prototype loss convention: outstanding principal is posted as positive principal and equal negative interest, totaling zero cash. A deterministic `df10:<loan-key-length>:<loan-key>` charge and repayment retain proper loan/charge references. Prior Payments, Payment Allocations and Repayments are unchanged. No new Payments row or closing-payment reference is produced. Reserved loss postings cannot be updated/deleted and cannot initiate first-day receipts.

Unpaid and partial charges are retained, not deleted. Their due components become paid components; Notes appends original amounts, write-off amounts, actor, date and posting key while preserving earlier notes. Fully paid charges remain unchanged. Seven obsolete Default actions are hidden with FALSE conditions. Confirmation and button eligibility remain unchanged.

The default branch of Notification - Loan Closed uses current Loans LOOKUP values to show **Principal loss / No cash received**. Its sole destination remains the owner account authorized for development notifications. Ordinary closure keeps its principal/interest message. OLAP's existing Default Loss Amount formatting is corrected from dollars/two decimals to baht/zero decimals.

## Versions, backup and hashes

| Item | Before | After |
| --- | --- | --- |
| Development database | V9 | V10 |
| Development OLTP | 1.000039 | 1.000042 |
| Development OLAP | 1.000039 | 1.000040 |
| Production database/apps | V5 / 3.000080 / 1.100055 | Unchanged |

- Starting Git commit: `8bc5e6243eae8cd75bd2e2f9f55f96592d96d063`.
- V10 SHA256: `f1c972d6b85c7abc28e50549ac47534fc540b6a73e57f815bf18cb1c43ee54eb`.
- Before schema SHA256: `49765db93df4c0851d171394d9e340f0b0f361d6e4160bc62861a6cd165aea91`.
- After schema SHA256: `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`, equal to the independent V10 rebuild.
- Private dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/default-loan-20260915/development-before.dump`; SHA256 `c0d12ea906c8c9a5137542599c1947d5dc07bb9b408882225053ff700760173c`. pg_restore archive listing checked; this task did not perform a full dump restore.
- Private folder also holds before/after schema, original fingerprints and pre-edit dictionary. Credentials and the database dump are outside Git; their location does not establish external backup coverage.

Flyway applied V10 in development at 21:24 Bangkok (263 ms migration execution); validation passed. This migration timing is not a workflow speed measurement. Pre-migration validate reported V10 pending, as expected; migrate then applied it successfully without repair or checksum edits.

## Current-GUI tests

Every default below was confirmed through the current development OLTP app in Chrome, then read back in the current OLAP app. Setup was synthetic SQL confined to DF10GUI; no original financial row was changed.

| Case | Original principal | Earlier principal repaid | Default loss | Total cash before/after | Remaining principal | Charges retained after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unpaid daily | 100 | 0 | 100 | 0 / 0 | 0 | 2 |
| Partially paid daily | 100 | 10 | 90 | 30 / 30 | 0 | 2 |
| Fixed date, no prior charge | 110 | 0 | 110 | 0 / 0 | 0 | 1 |
| Installment with prior payment | 103 | 11 | 92 | 15 / 15 | 0 | 2 |

Each has Defaulted Y, closed status, 15 September close date and exactly one loss repayment. OLTP and OLAP agree on loss, zero remaining principal, preserved cash and net interest (-100/-70/-110/-88 respectively). OLAP remains read-only, with no operational edit/default/receive controls. Its final loss display was verified in baht. The user has been asked to confirm receipt of the four owner-only default pushes and their loss/no-cash wording; feedback pending.

After verification, DF10GUI borrowers were hidden and loan auto-charge flags disabled; all synthetic financial history remains. The existing nightly development job was rechecked active at 00:05 Bangkok. No new schedule was created.

Both complete appdoc property inventories were compared. OLTP changed only eight intended actions and version metadata; its columns/slices/references/formulas/defaults are unchanged. OLAP changed only Default Loss Amount CurrencySymbol/DecimalDigits and version metadata. Bot templates and destinations were checked separately in the current editor. No regeneration was needed. Both apps retain development database-3 and their existing development companion links.

## SQL and preservation checks

Disposable PostgreSQL 18.6 / Flyway 13.6.0 tests cover earlier payment/close/generation behavior plus unpaid/partial/no-charge default, duplicate request, stale date, paid-today rejection, invalid component rollback, disabled-auto rejection, immutable loss entries, same-day first-day isolation and rejection of subsequent cash collection against the defaulted charge. A late invalid charge rolls back an earlier write-off in the same request.

Concurrent default behind scheduled generation fails promptly (initial measured borrower-busy request 100.58 ms), then retries successfully without duplicate posting. Earlier payment, Close Loan and generation concurrency tests are retained in CI. No app speed percentage is claimed; browser navigation/reading delays are not a clean end-to-end benchmark.

All original rows across 14 business tables match pre-task fingerprints after excluding only DF10GUI fixtures. Live normalized schema matches an independent V10 rebuild. See `schema-verification.json`, `original-row-preservation.json`, `gui-posting-results.txt`, `flyway-validation.json` and `regression-results.txt`.

## Model documentation and limits

The model overview, XLSX data dictionary, development difference register, environment inventory, preparation baseline, database README and change log are updated together. All 12 workbook sheets round-trip with only intended cell changes; existing formulas, merges, validations, conditional formatting, tables, drawings, links and panes are preserved. Changed dictionary views were rendered and checked.

Retaining written-off charges changes row counts relative to legacy deletion. Amount-based reporting remains governed by posted components and default flags; count-based Looker/export interpretations should be reviewed before production promotion. No Looker report was edited or audited, and no report backup was required. This work does not implement phase 7 analytics refresh or redesign historical default recovery/reversal workflows.

The existing OLAP hidden Charge Generation Request/unsearchable warning remains; it is unrelated to this change. SQL-owned default loss postings intentionally remain distinguishable from cash receipts. A correction to a recorded default needs a separately reviewed forward adjustment, not unsetting Defaulted.

## Acceptance and recovery

Owner acceptance pending. Suggested final check: sync both development apps, review the four DEV Default loans, verify baht loss/zero outstanding/preserved earlier cash, and confirm the default push wording. Production promotion requires separate explicit approval and the normal backup/drift/dependency gates.

Rollback is coordinated: stop new default requests first. Do not restore OLTP 1.000039's six-step chain while the V10 transition trigger remains active. Prefer an immutable higher-version forward fix; for an isolated development rollback, restore the recorded V9 database snapshot together with the compatible app versions. App restoration must repeat the development preparation checklist and retain owner-only notification destinations. Never copy development financial data into production. The approved 00:05 Bangkok nightly development job must be checked/restored explicitly after any database rollback.
