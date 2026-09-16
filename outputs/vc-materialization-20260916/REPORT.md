# DEV VC materialization — phases 1–4

16 September 2026. Implementation and agent verification complete; owner acceptance pending. Development is **V14 / OLTP 1.000061 / OLAP 1.000064**, on appsheet-pg-dev-20260915 through database-3. Production remains V11 / OLTP 3.000098 / OLAP 1.100081, unchanged.

## Implemented scope

| Phase | Changes | Migration |
| --- | --- | --- |
| 1 | Charges: Principal Paid, Interest Paid, Total Paid, Principal Remaining, Interest Remaining, Amount Remaining, Payment Count, Payment Status, Payment Date. Loans: Total Interest Received, Total Principal Received, Outstanding Principal, Total Amount Received. | V12 |
| 2 | Delete OLTP Payment Allocations Calculated Order, Calculated Amount, Calculated Interest, Calculated Principal. Disable obsolete Payment - Freeze Allocation with FALSE and self-assignments of existing physical result fields. | No DDL |
| 3 | Borrowers: Total Interest Earned, Total Amount Loaned, Total Number of Loans, Total Outstanding Principal, Active Loan Interest Earned, Active Daily Interest, Has Closed Loan, Has Active Loan. Loans: Expected Daily Interest Amount. | V13 |
| 4 | Payments: Planned Allocation Amount, Posted Amount. | V14 |

All 24 OLTP replacements are physical, read-only and have **blank App formulas**; their old VC calculations no longer run. Four obsolete allocation VCs and their expression references are absent. All 48 corresponding fields across both apps were checked in saved app documentation. OLAP gained three previously absent hidden/read-only fields: Payment Count and both Payment aggregates. Other business-column properties were compared by table/name: existing types, display settings, keys, references and unrelated formulas were preserved. Regeneration changed only internal Editable Initial Value / Fixed definition metadata for Borrowers.Row ID and Charges.Row ID; key/read-only/initial expressions remain intact. Native generated process schemas reflect the regenerated column order.

Charges.Amount Due remains `[Principal Due] + [Interest Due]`, with immediate form feedback. Eligibility lists, differences, relationship lists and date-sensitive/presentation VCs remain. OLTP owns writes; OLAP reads shared values with its existing permissions. Reporting Charges retains its original 22 columns and READ_ONLY permission after removing auto-appended Payment Count. No Looker or export definition changed; report rendering was not retested.

## Calculation behavior

Existing prototype formulas remain the contract: signed default interest, unclamped principal, closed-loan charge-status override and inclusive installment denominator. Numeric helper values are not prematurely rounded. Payment decisions continue to use authoritative ledger queries and locks.

Transaction-deferred refreshes update old/new parents after insert, edit, reassignment or deletion. Borrower locks serialize affected families; conflicts fail promptly for retry. BEFORE triggers recompute forged cache values. Default-charge financial immutability permits only a narrow derived-field exception. V14 narrows the payment-processing trigger to original payment inputs so cache-only writes do not repost receipts. V12–V14 are applied and immutable; fixes require a higher migration.

## Benchmark

Chrome current desktop OLTP runtime; explicit Sync click to re-enabled Sync button; one warm-up excluded, seven samples per checkpoint. Same dataset throughout, before synthetic transaction tests. Timings include browser control/polling overhead. Sequential measurements have overlapping ranges and no randomized A/B control: observed medians are not guaranteed causal gains.

| Checkpoint | Median seconds | Versus baseline | Versus previous |
| --- | ---: | ---: | ---: |
| Baseline 1.000048 | 5.293 | — | — |
| Phase 1, 1.000052 | 4.925 | 6.95% faster | 6.95% faster |
| Phase 2, 1.000054 | 5.422 | 2.44% slower | 10.09% slower |
| Phase 3, 1.000059 | 5.107 | 3.51% faster | 5.81% faster |
| Phase 4, 1.000061 | 4.819 | 8.96% faster | 5.64% faster |

Phase 2 showed no measured gain. Final observed improvement is 0.474 seconds. [Raw timings](benchmark.json) retain all samples and versions. Final OLAP slice cleanup does not change measured OLTP configuration. No OLAP speed claim is made.

## Verification

- Backup restored locally: all 14 original table fingerprints and normalized schema matched; [backup evidence](backup-verification.json).
- Each migration passed preceding functional suites plus materialization tests and all four payment/close/generation/default concurrency suites. Logs retained here. Cases include signed/overpaid amounts, no children, forged caches, old/new parents, child deletion, nested defaults, helper fractions, closed flags and idempotent posted retries.
- Final independent parity: 847 Charges, 96 Loans, 53 Borrowers, 96 helpers and 180 Payments; zero mismatches. [SQL evidence](final-parity.jsonl). Flyway validation passed.
- Before GUI fixtures, original fingerprints of the 12 non-snapshot business tables matched the backup after all phases. Daily Analytics and Statistics differed while existing hourly refresh remained active; no final all-14 preservation claim is made. [Fingerprint evidence](original-data-preservation.json).
- Current GUI: unsaved charge Interest Due 20→25 immediately displayed Amount Due 125, then was discarded. Partial receipt 30 produced principal 10 / interest 20 / remaining 90. Full receipt 90 closed the loan with two payments. Default of a second synthetic loan produced principal 100 / interest -100 with no cash receipt. Borrower totals reconciled at loaned 200, interest -80, outstanding 0 and active flags false. OLAP synced and displayed matching read-only summaries. [Partial](gui-partial.txt) and [final](gui-final.txt) evidence contain synthetic data only.
- Synthetic borrower is now hidden; both loans have auto-charge off. History is retained. Existing owner-authorized notification routes were not changed; device delivery was not independently verified.
- All seven OLTP and two OLAP bots reviewed before writes. Four owner-only notification bots retain six tasks, daily SQL charge request and hourly analytics remain enabled, old first-day/payment processors and export remain disabled, pg_cron remains paused. No bot changes.
- Both apps retain development database-3 sources (8 OLTP / 12 OLAP business bindings). Shared reporting permissions are preserved. Overview and dictionary are reconciled with final app versions; production dictionary rows remain V11.

## Owner acceptance checks

1. Repeat a DEV partial/full receipt and check charge, loan, borrower and OLAP balances after sync.
2. Check charge-form immediate Amount Due feedback, ordinary loan edits and closure/default display.
3. Test mobile/offline resync and competing-device retry behavior. Database concurrency passed, but real device/offline behavior is not claimed verified.
4. Confirm expected owner-only notifications on the device.

Production deployment requires separate explicit approval, fresh backup/drift review and the exact accepted commit. Repository publication is not deployment approval.

## Rollback

Pre-change DEV: **OLTP 1.000048 / OLAP 1.000052 / V11**. Fresh OLAP version superseded stale inventory 1.000050. Repository starting commit `a046b9d6ec4d20f57759e7175f686cbb9984cebe`.

Private backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/vc-materialization-20260916/development-before.dump`, SHA256 `8B7B760FE8A346E7B2F47684F84CCE23FCB691AC4F1E20CBAA4F61001BDD0EC4`. Normalized schema SHA256 `172CFB5F4C1C009F4D35EE0A6D57CD376FA6AA50ED1337DCE52B08E24E629A33`. Local restore covers public/assessment objects; cloud cron/settings and credentials are outside its scope. External backup replication coverage is not established by Git.

Prefer a reviewed V15-or-higher forward fix retaining ledger history. Reverse materialization only through coordinated SQL and both-app changes: old same-name VCs cannot safely be restored independently over physical columns/triggers. Pause DEV writes/schedules, preserve subsequent data and review removal/rebinding dependencies. Full V11 restore discards later DEV writes and requires an explicit recovery decision; do not run it automatically. Repeat development bot-isolation preparation after any app restore.

## Further optimization

The [production performance review](PRODUCTION_PERFORMANCE_REVIEW.md) proposes Payments.Eligible Charges first, then Bangkok-date-aware borrower/statistics collection summaries. Loans.Last Interest Charge Date is another date-aware candidate. Proposals are not implemented. Inclusive parallel trace timings cannot be added as expected savings.
