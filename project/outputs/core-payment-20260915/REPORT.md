# Core payment phases 1–3 — development verification

15 September 2026. Implemented in development, pending overall owner acceptance and separate production release approval. Production remains Flyway V5, OLTP 3.000080, OLAP 1.100055.

## Result and boundaries

V6 posts Single Full, Single Partial, Receive All, Lump Sum, Loan Close and First-day Auto through one SQL transaction. Allocation and repayment components reconcile to the receipt; eligible loans close with the exact closing-payment Ref. First-day loan/charge/receipt/ledger creation is atomic. Charge state remains derived from the ledger. The existing daily Close Loan wrapper still generates its final charge in AppSheet before inserting its payment. Scheduled/manual charge generation beyond first-day, defaults and analytics remain later phases.

Current development: OLTP **1.000032**, OLAP **1.000033**, Flyway **V6**. Both use database-3; OLAP financial sources remain READ_ONLY. New Loans.Ref Closing Payment is a nullable read-only Ref to Payments.Row ID in both apps, not a key/label/IsPartOf. No formula/default/backfill. Payments.Related Loans is the generated REF_ROWS list. OLAP Reporting Loans includes the Ref; existing forms/detail orders and other formulas are preserved. No Looker report was edited; report rendering and exports were not tested. Existing repayment grain and financial measures are unchanged.

## Current-GUI tests in Chrome

All receipts below originated through the current OLTP desktop app. SQL verification follows each submission; current OLAP shows the same loan balances and totals.

| Method | Amount | Result |
| --- | ---: | --- |
| Lump Sum | ฿150 | Two allocations: newest 120 (20 interest + 100 principal), older 30 (20 interest + 10 principal); one loan closes, 90 remains |
| Receive All | ฿240 | Two allocations, both 100-principal loans close; one closure summary for the payment |
| Single Partial | ฿50 | 20 interest + 30 principal; 70 remains |
| Single Full | ฿70 | Remaining principal collected; loan closes and receive actions disappear |
| First-day Auto | ฿115 | One-day installment, principal 100 + interest/fee 15; loan, charge, payment and closure committed together |
| Loan Close | ฿130 | Existing daily wrapper generates final charge; SQL posts two allocations, principal 100 + interest 30; loan closes |

All six receipts are Posted and their ledger sums equal receipt amounts. See [synthetic ledger verification](gui-ledger-verification.txt). OLAP synthetic portfolio showed closed principal 600 and active principal 400. Its first-day detail showed principal received 100, interest received 15, total received 115, outstanding 0, Closed status and one related charge; no financial edit/delete actions were present.

An initial first-day form attempt inadvertently toggled the default Y selection off, saving Auto Charge Enabled NULL. Correctly, SQL created no first-day charge/payment. A second loan retaining Y passed. The first record remains as a no-auto case, not a failed posting. Close Loan fixtures were corrected before receipt posting to ordinary daily-loan setup (historical interest-only charges; principal introduced by the existing close action).

Owner feedback: **“Received and amounts look correct”** for development receipt pushes, the two-loan ฿240 summary and ฿115 first-day alerts. This confirms the tested device delivery/content, not exactly-once delivery under every retry. A separate manually added first-day Charge notification route was configuration-reviewed but not exercised through the GUI. The Automation monitor opened an older interface and was closed; no legacy Test/Run workflow was used. No current AppSheet end-to-end speed benchmark was captured.

## Database checks

- Disposable PostgreSQL 18.6 rebuild: six migrations, repeat migration no-op, validation and checksum tampering rejection pass. The final rebuilt normalized schema matches development V6 exactly. CI now runs the same core functional/concurrency suite. [Final local test transcript](disposable-regression.txt) records the functional pass and independent-borrower observation of 108.33 ms (earlier run 118.20 ms).
- Functional suite: all methods; interest-first and newest-first allocation; positive whole-baht and exact-full validation; borrower/date/overpayment rejection; immutable posted inputs/children; retry/stale finalizer protection; future unpaid charge prevents closure; first-day daily fee/installment rounding/disabled/fixed-date cases; invalid first-day transaction rolls back; one-day installment closes.
- Concurrency: competing receipts for one borrower cannot over-allocate; independent borrower proceeds; legacy finalizer has no new financial effects. Local independent-borrower observation 118.20 ms is not a Cloud SQL/AppSheet performance claim.
- Development V6 applied at 18:23:11 Bangkok, reported 348 ms; current Flyway validation passes with 7 validated entries, no warnings/invalid migrations.
- [Original-record preservation](original-record-preservation.json): all 14 public business tables retain their pre-migration row counts and fingerprints after excluding the explicitly synthetic fixture family and new nullable Loans field. No historical backfill or original financial-record edit.
- V6 file SHA256: `9b1479c42c9b390188d7fb476b788cd66d07f541029078635cdf89502e795eb7`.
- Normalized development V6 schema SHA256: `b9e8eadc239537cc1651ce2605a2c78fec255d16109c6a473dc744bbbb42b24f`. Private export `flyway/development-schema-20260915-191134.sql`.

Five CP6GUI borrowers were hidden and all ten fixture loans' automatic charging disabled after testing. Their financial rows are retained. Daily generation remains disabled, as do all three OLAP schedule/export bots.

## Notifications and rollback

Four reviewed OLTP notification-only bots are enabled: Notification - Charge Received, Notification - New Loan Created, Notification - Loan Closed, Notification - First-Day Charge (repurposed Auto Receive First-Day Charge). Every task routes only to the owner test account. Financial bots Create First-Day Charge and Payments - Process Receipt remain disabled; Payment - Process Receipt and Payment - Close Paid Loans actions are hidden with condition FALSE.

[AppSheet configuration](appsheet-configuration.md) records the event/branch expressions and templates for recovery. The overview, dictionary and development/environment/preparation registers have been updated together. Dictionary verification preserved all sheet values except the recorded 109 intended row changes, with zero formula-error matches and visual review of affected rows. XLSX native-feature counts (formulas, merges, validation, conditional formatting, table/drawing/hyperlink references) remained unchanged across all 12 sheets; this dictionary contains zero native Excel formulas.

Rollback versions: OLTP **1.000025**, OLAP **1.000031**, Git **a6b3a7d**, Flyway **V5**. Private `core-payment-20260915/development-before-1821.dump` SHA256 `a07f62910794d1f9d3bf0b37e59b85c1cc778c02d408165411399903a5314bca`; archive listing verified, **full restore not verified**. Do not restore app versions alone while V6 routing is active. Pause entry, reconcile receipts, use a reviewed higher migration to restore compatible prior processing/disable new first-day routing, then restore matching app configuration. Retain posted history and the additive Ref; no applied migration editing or financial-row deletion. A production release requires a freshly verified restorable backup, drift/dependency review, exact tested commit/hashes and explicit owner approval.

## Owner acceptance checklist

1. Review full/partial/Receive All/lump-sum and daily loan-close UX and totals in both development apps.
2. Confirm first-day daily/installment rules, fee treatment and closing summary meet expectations (tested push amounts already acknowledged).
3. Before broader rollout, exercise offline/multiple-device stale submissions and the manually added first-day-charge push route. SQL rejection/concurrency tests already pass; these remaining checks concern app recovery and notification behavior.
4. Approve the development result separately from any production release. Scheduled/export/Looker tests remain outside this release; no measured speedup is claimed.
