# Database lump-sum workflow — Dev review

15 September 2026. Implemented in Dev OLTP **1.000014**, PostgreSQL **Flyway V3**. Dev OLAP **1.000027** reads the results. **Owner acceptance and production promotion remain pending.**

[Open Dev OLTP](https://www.appsheet.com/start/65faacd8-2b0d-43bf-9e0a-58eb915dcf9b?platform=desktop) · [Open Dev OLAP](https://www.appsheet.com/start/494cd013-0d9b-482f-9559-c9d83059de91?platform=desktop)

## Result and design

One receipt now commits its allocation, repayments, reconciliation and eligible loan closures in a single PostgreSQL transaction. A failed allocation commits none of those records. AppSheet handles entry, validation and display. Existing Payments, Payment Allocations and Repayments provide the command, frozen allocation and ledger, respectively. No new business tables or columns were needed.

The owner selected **newest eligible charge first**. SQL orders by charge date descending, then immutable charge key descending using C collation. It pays interest before principal within each charge. Equal-date ties previously used the provider's row ordinal; the new stable-key tie rule is an intentional change for review. Charges after Payment Date are excluded. Positive whole-baht receipts cannot exceed the current eligible balance.

Only funded charges create allocations and repayments. A ฿100 payment against the six-charge benchmark creates **one allocation instead of six**, while retaining the same ledger amount. SQL window sums calculate the allocation; seven indexes support borrower, loan, charge and receipt lookups. Borrower locks serialize competing receipt commands, while independent borrowers can proceed. Source loans/charges are locked before reading balances.

SQL-generated child keys use `ls2:<payment-key>:<charge-key>`. Existing foreign keys and grain remain intact. `Charge Row Number Snapshot` stores negative Allocation Order for these rows, preserving the existing AppSheet allocation-order calculations without relying on a transient provider ordinal. Historical rows retain their original meaning. SQL child records are immutable; routine correction must use a separately designed auditable adjustment, not direct ledger editing.

Posted receipt inputs are protected. A stale Processing status in a metadata update remains Posted and creates no duplicate ledger rows. Existing partial legacy results are refused for automatic reallocation and must be reconciled. Other payment methods retain the existing AppSheet bot chain.

## Performance

All functional payment submissions used the current standalone AppSheet desktop interface. Server durations came from Performance Analyzer opened through the current editor. The historical comparison is the earlier six-charge experiment in [the September 12 assessment](../oltp-performance-lab-20260912/PERFORMANCE_TEST_REPORT.md).

| Measure | Original | Final SQL workflow | Median reduction |
| --- | ---: | ---: | ---: |
| Today's Dev server Add row, 5 runs each | 14.438 s | 5.370 s | **62.8%** |
| Historical original server Add row, 3 runs | 15.582 s | 5.370 s | **65.5%** |
| Today's successful Save to borrower ready + sync complete | 14.567 s, 3 runs | 12.165 s, 5 runs | **16.5%** |
| Allocations written per six-charge/฿100 receipt | 6 | 1 | **83.3% fewer** |

Server samples, chronological:

- Original: 20.561, 18.739, 14.438, 8.401, 8.157 seconds.
- Final V3: 8.063, 5.370, 7.694, 3.693, 3.377 seconds.
- Final screen wait: 15.719, 12.165, 14.470, 10.648, 9.283 seconds.

These are small sequential observational samples, not randomized trials or a measured sustainable throughput increase. Original timings declined as the session warmed. Server ranges are 8.157–20.561 vs 3.377–8.063 seconds; screen ranges overlap at 14.469–20.630 vs 9.283–15.719 seconds. AppSheet sync, network and client computation still account for substantial wait. Historical infrastructure/app state differs, so today's control is the stronger comparator. No production speed claim is made. Server Add row is an AppSheet operation duration, **not isolated SQL execution time**. Historical Save-to-Posted measurements use a different endpoint/workload and are not mixed with this screen metric.

Four exploratory V2 samples are retained separately. BASE-01 had no continuous screen timer; BASE-02's 34.511 seconds includes an observation gap and is excluded. Two automation Save attempts timed out before submission; form state and database absence were checked before retry. Only successful clicks are timed. Raw measurements and exclusions are in [verification.json](verification.json), [server-results.json](server-results.json) and [ui-timings.json](ui-timings.json).

## Verification performed

| Test | Observed result |
| --- | --- |
| Five original + nine SQL benchmark receipts | All Posted; every receipt equals allocated amount and posted ledger amount |
| Form validation: 0, -1, 0.5, 361 against 360 available | Save rejected; form remained open |
| ฿150, same-date tie and partial interest | C: interest 30 + principal 100; B: interest 20 only; exactly two allocations |
| Remaining ฿210 across two loans | B principal 100; A interest 10 + principal 100 |
| Closure and future charge | L1 closes with principal 100/interest 10 received; L2 stays active with principal 200/interest 50 received and tomorrow's interest 50 unpaid |
| Receipt presentation | Posted, planned and posted totals equal received, both differences zero; one repayment per funded allocation |
| Posted metadata edit in new GUI | Bank Reference changed; monetary/date fields disabled; status/child counts/totals preserved |
| Retained Single Partial path | New-GUI ฿10 on benchmark charge B1 posted through the existing bot; charge shows ฿10 paid and ฿90 remaining |
| Dev OLAP new GUI | Borrower totals, closed loan, paid charge and repayment components read back; no operational edit controls on these OLAP details |
| Supplemental local PostgreSQL regression | Exact allocation, sum conservation, future/other borrower isolation, invalid/missing/over-balance inputs, no eligible charge, forged initial Posted rejection, retry idempotency, SQL ledger protection, legacy metadata compatibility, pending legacy receipt exclusion and 1,000-charge fan-out checks passed |
| Concurrent local sessions | Competing ฿70 against remaining ฿30 rejected after lock release; no partial receipt; independent borrower completed before the first lock released |
| Flyway | Fresh V1–V3 rebuild, validate, second migrate no-op and checksum mutation rejection passed; Dev migrate/validate passed |
| Live schema drift | Fresh normalized Dev schema exactly matches the tested V1–V3 reconstruction (schema-verification.json) |
| Cross-app shortcuts | OLTP → Dev OLAP and OLAP → Dev OLTP verified through current GUI buttons |
| Existing Dev data | All 14 original business-table row counts/fingerprints match before-state after excluding explicitly identified synthetic fixtures |

Local SQL tests supplement the new-GUI tests; they are not represented as app/device tests. Evidence: `local-regression-final.txt`, `final-results.jsonl`, `ui-*.txt`, migration/validation JSON and before/after original fingerprints in this directory. No production financial data was altered.

## Limits and downstream findings

- Browser functional tests used one signed-in operator. SQL concurrency was tested with separate database sessions. Multi-device offline sync, interrupted network recovery and DB-rejection presentation on a stale device were not simulated. Invalid server commands roll back; an AppSheet client may retain a failed local edit requiring correction and resync. Production release testing must cover that recovery path.
- Locks coordinate these receipt commands and receipt-linked legacy writes. Arbitrary external ledger writers and concurrent direct edits/deletes of historical records are not certified. Keep financial writers within the documented workflows.
- The existing borrower `Closed Loan Principle` formula is `Total Amount Loaned - Total Outstanding Principal`. The synthetic case exposes its misleading label: it shows 300 although only the 100-principal loan closed. Both apps share the existing definition. The loan-level statuses and repayment components reconcile correctly. This pre-existing reporting definition is recorded for separate review; no unrelated formula was changed. Some existing OLAP component fields also display `$` while the workflow uses baht.
- Direct PostgreSQL child writes do not reproduce AppSheet-generated child change events. Development notifications/export bots remain disabled. Production notification dependencies must be reviewed and explicitly accepted or implemented before release; this task does not claim notification parity. Loan assessment sees changes through its existing source-freshness mechanism. Persisted Daily Analytics/export/Looker refresh was not run or audited, and no dashboard was edited.
- Existing synthetic fixtures remain for review: `LS26 BENCHMARK SYNTHETIC` and `LS26 CORRECTNESS SYNTHETIC`. Collection and auto-charge flags are off; no contact information was populated. They must never be copied to production.

## Owner review

1. In Dev OLTP, search Payments for `LS26-CHECK-150` and `LS26-CHECK-210`. Inspect allocation order, interest/principal, related repayments and zero differences.
2. In Borrowers, search `LS26 CORRECTNESS`. Confirm the 100-principal loan closed and the 200-principal loan remains active for tomorrow's charge. Compare the same borrower/loan in Dev OLAP.
3. Review the stable-key rule for equal-date charges, protected posted records and server-rejection recovery limitations above. The benchmark borrower remains available for another synthetic lump sum if desired.
4. Give acceptance feedback here. Production deployment requires a separate release approval after the preparation and rollback checklist below.

## Promotion and rollback

Authoritative history: [CHANGE_NOTES_DB_LUMPSUM_2026-09-15.md](../../Change%20Logs/CHANGE_NOTES_DB_LUMPSUM_2026-09-15.md). Model overview, data dictionary, Development Changes and Environment Inventory were updated together. Dictionary round-trip and read-only native-property/style checks passed for all 12 sheets and 53,720 existing cells; only intended sync inventory values and new development documentation changed. The commit containing this report and exact migration hashes is the release candidate, not approval to deploy.

Rollback points: Dev OLTP **1.000013**, Dev OLAP **1.000027** unchanged; Dev schema normalized to V1 before changes. Private app definitions/schema export and original workbook are under the established external Documents/ChatGPT project folder. Their backup coverage is not established by repository publication. App restore alone does not undo database behavior or posted receipts.

For a future approved release: verify a restorable production backup and schema drift; review all consumers, notification events and current pending receipts; pause new receipts and drain existing Processing/Error receipts; record fresh production app versions; apply the two exact app conditions below and immutable V2/V3 through the approved Flyway runner; validate hashes/schema, source isolation and current-GUI OLTP/OLAP readback; resume entry only after verification. Promote schema/configuration only, never fixture data. Preserve current production companion links and development bot isolation. No schema regeneration is needed because no physical fields changed.

Both the `Payment queued or retried` event condition and `Payment - Process Receipt` grouped-action condition become:

```text
AND([Status] = "Processing", [Allocation Method] <> "Lump Sum")
```

To fall back, pause receipt entry and reconcile in-flight work. Add a **new higher Flyway migration** disabling only `process_lump_sum` on `public."Payments"`, retaining guard functions/indexes and posted history, then restore the two original `[Status] = "Processing"` conditions. Test new legacy-path receipts before resuming. Do not edit applied V2/V3, run repair/clean, delete posted child rows or restore a Dev version that reconnects production. Removing all SQL guards or correcting posted financial history requires a separately reviewed migration/adjustment.

Exact SHA256:

- V2: `86aa12f62de9f6c8918c14c4acc201487d651ea601daecd122e1b22824193021`
- V3: `b44a38000fa0858d883008a8ebe26bd3a639e9d91617cf8097978e732748b707`
