# Atomic Close Loan — development verification

15 September 2026. Implemented in development: Flyway V7, OLTP **1.000036**, OLAP **1.000036**. Production remains V5 / OLTP 3.000080 / OLAP 1.100055. Owner approved nullable `Payments.Ref Target Loan`; production promotion is not authorized.

## Result and ownership

Close Loan now submits one Payments command with the target loan. PostgreSQL locks the borrower, loan and charges, prepares or updates the final charge, calculates the receipt from current balances, and invokes the existing unified payment engine. Final charge, allocations, repayments, Posted status, loan closure and `Ref Closing Payment` commit or roll back together. AppSheet retains confirmation, navigation and the existing owner-only notification process.

Outstanding principal is loan principal less repayment principal. SQL adds only the portion not already scheduled on charges. Existing paid principal remains intact. If there is no charge today, accrued interest is daily interest times nonnegative elapsed days from the latest charge date, falling back to Loan Date. A same-day loan has zero elapsed interest. Already scheduled future principal is included once. Reserved `lc7:` charge keys bypass first-day net-off processing.

New commands require an open, auto-enabled daily-interest loan, matching borrower, positive outstanding principal and today's Bangkok date. Inconsistent components, multiple charges today, non-whole receipt amounts and stale dates fail atomically. Posted retries are harmless, targets cannot change after preparation/posting, and competing close commands serialize. Legacy V6 receipts with blank target loan keep their existing behavior. Separate default-loan preparation is unchanged.

## Both-app reconciliation

Before-edit versions: OLTP **1.000032**, OLAP **1.000034**, Git `c0d509b09a38d3fc42415b1fd2b22c0aeac3acad`. Fresh OLAP 34 had one generated closing-payment navigation visibility difference from the earlier 33 checkpoint; preserved.

Payments regenerated in both current editors, followed by saved appdoc comparison:

- New nullable physical `Payments.Ref Target Loan`: Ref to Loans.Row ID, not key/label/IsPartOf, no initial value or app formula. Display `เงินกู้ที่ปิดยอด / Closing Loan`.
- OLTP uses **Editable_If = FALSE**, with static Read-Only No, so users cannot edit it but the command action can assign it. Static Read-Only Yes prevented action assignment. OLAP uses Read-Only Yes. SQL protects posted targets.
- Generated `Loans.Related Payments`: read-only List of Ref, `REF_ROWS("Payments", "Ref Target Loan")`. Generated `View Ref (Ref Target Loan)` navigation in both apps.
- OLAP Reporting Loans includes Related Payments; existing closing reference, filter, actions and READ_ONLY permissions retained.
- Regeneration changed Payments.Row ID metadata: Fixed definition Yes to No; Editable Initial Value No to Yes. **Key Yes, Read-Only Yes and UNIQUEID() initial value remain unchanged.**
- OLTP changes two validation expressions and five actions, detailed in [configuration](appsheet-configuration.md). Existing manually ordered forms/details, remaining formulas, sources and companion-app links are preserved. Both apps still use database-3; OLAP has no financial editing.

All bot definitions were compared with the before-edit definitions. The four reviewed OLTP notification-only bots retain the sole destination `LIST("welct0407@mw-credit.com")`. Superseded financial bots, daily generation and all three OLAP scheduled/export bots remain disabled. No new bot or destination was introduced. See the prior core-payment configuration for exact unchanged templates.

## Tests

| Current OLTP GUI case | Close receipt | Result |
| --- | ---: | --- |
| Old charge: interest 20, last charge yesterday | ฿130 | SQL adds principal 100 and interest 10; two paid charges |
| No existing charge, loan five days old | ฿150 | SQL creates principal 100 plus interest 50 |
| Same-day loan, no existing charge | ฿100 | Principal only; no first-day automatic receipt |
| Today's charge principal 100 + interest 20; partial receipt 50 first | ฿70 | Partial paid interest 20/principal 30; closure pays remaining principal 70, no duplicate charge |

All five GUI-created receipts are Posted and match their repayment ledgers. Four Close Loan receipts total 450; including the partial receipt, total receipts are 500, principal 400 and interest 100. Four loans are closed with the exact causal payment reference. Current OLAP GUI shows closed principal 400 and interest totals 50/30/20/0. Partial-case detail shows principal paid 100, interest paid 20, total received 120, outstanding principal zero, one charge, and no edit action.

Disposable PostgreSQL rebuild, V6 regressions and V7 SQL tests passed. Coverage includes partially paid principal, already paid today's interest, no/today/future charge paths, borrower mismatch, stale dates, duplicate-today charge rejection, fractional amounts, immutable targets and retries. An injected error **after ordinary posting** rolls back the entire close transaction. Concurrent close requests produce one receipt/final charge and reject the loser after lock release. Existing independent-borrower and competing-overpayment tests also passed. These are SQL concurrency checks, not an offline multi-device AppSheet test or an app performance benchmark.

Final fixture sessions explicitly use Asia/Bangkok for consistent CI dates. Seven migrations rebuild, the second migrate is a no-op, and checksum tampering is rejected. `baselineRebuildMatch=false` in the generic runner compares V7 to the original V1 and is expected; the V7 rebuild matches the live development schema below.

`Test-AtomicLoanClosePreservation.ps1` confirms original row counts and fingerprints unchanged across all 14 base tables, including prior V6 fixtures. It excludes only AC7GUI test-family rows and the newly added Payments field. Four synthetic borrowers were hidden and their four auto-charge flags disabled after testing; financial history retained.

## Schema and recovery evidence

- V7 applied development at **19:40:49 Bangkok**, migration execution 294 ms. SHA256 `f99e5a258ba138a55a61820524468f05b1202c92e78a9ee046c1d3d5a31e2bf2`.
- Fresh Flyway validate passes, 8 entries, no warnings. Live normalized schema matches the disposable rebuilt schema: `0a1972cc1e8eb5a072da584d394cfc85b3b1b96fc991e11b6fba9c39a4480c98`.
- Private before-change dump: `Documents/ChatGPT/AppSheet-Loan-Project/atomic-close-20260915/development-before.dump`, SHA256 `57fd2939ddc2da2a57b640d992015beb6d8c17d382863b41deb0896add6a612f`. Archive list checked; full restore not tested. Backup and credential recovery coverage is separate from Git.
- Before-change normalized V6 schema: `b9e8eadc239537cc1651ce2605a2c78fec255d16109c6a473dc744bbbb42b24f`.

V7 is applied and immutable. For fallback, pause Close Loan entry, sync/reconcile outstanding commands, then use a reviewed **V8 or higher** forward fix and the matching app versions/actions. Restore the V6 charge trigger behavior and disable the new command trigger only in coordination with restoring the wrapper. Retain additive references, posted receipts and ledgers. An app-only rollback does not undo SQL; a database restore would require a separate write-freeze and reconciliation plan.

## Acceptance and remaining checks

Automated checks and both current development GUI checks passed. Owner confirmed receipt/closure pushes for 130/150/100/70 and the partial receipt 50: **received and amounts correct**. Prior phases 1–3 push amounts were already accepted. This accepts the tested notification amounts; it does not authorize production promotion or establish untested offline behavior.

Manual acceptance: sync both development apps, confirm Close Loan shows a closed loan and matching receipt/ledger, verify the closing-loan reference cannot be edited, and confirm the owner-only receipt/closure messages. Offline requests crossing midnight and two-device recovery remain untested through AppSheet; SQL stale-date and concurrency guards passed. On stale requests, sync and reconfirm rather than changing financial history.

No Looker/export execution was tested. Existing financial grains and measure definitions are unchanged; no direct report configuration change was needed. Documentation and tests do not authorize production release.
