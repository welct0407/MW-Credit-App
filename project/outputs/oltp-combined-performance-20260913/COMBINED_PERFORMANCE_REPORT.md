# P01a + P04a combined test — 13 September 2026

**The combination showed a modest observed gain: median 17.904 seconds, versus 19.180 seconds before and 18.830 seconds after restoring the originals.** This is a 6.65% and 4.92% reduction respectively. Three repetitions per configuration and overlapping timings do not establish a statistically reliable speedup. The combination did not demonstrate a fundamental performance improvement.

The tested allocation and receipt cases passed, including all six allocation methods, zero-allocation rows, interest/principal splitting, same-date ordering, retry, deliberate reconciliation failure and recovery. Two qualifications matter: P01a changes the displayed eligible-outstanding description on Posted receipts to zero; and an existing same-day Close Loan path can do nothing when no charge exists. Neither should be hidden behind a blanket “fully validated” claim.

## Environment and final state

Only **LoanMgr Perf TEST 20260912**, app `8a96763c-d453-450b-ac00-a8dfb7dbb8a4`, and its separate **Money Perf TEST 20260912** database `aWCGib003O4AyK85Q4_KZc` were changed. Production was not edited or deployed. API access remained OFF. Tests used the current editor, new desktop React client and current native database UI. No legacy Test/Table Data page was used in this round.

Starting rollback version **1.000038** was recorded before edits. Final clone version **1.000044** retains the combination for review. Comparing the appdoc DOM property tables at those versions found exactly two property differences: the App formula of Payments[Eligible Charges] and Payment Allocations[Calculated Amount]. The temporary validation displays were restored. No new physical columns, tables, keys, references or slices were introduced this round.

| Version | Purpose |
| --- | --- |
| 1.000038 | Original expressions; initial control and rollback point |
| 1.000039 | P01a + P04a combined benchmark |
| 1.000040 | Both original expressions restored; reversal benchmark |
| 1.000041 | Combination reapplied for correctness tests |
| 1.000042 | Temporary Visible Allocations display included zero rows for inspection |
| 1.000043 | Temporary Receive All Charges position Prominent enabled new-GUI execution |
| 1.000044 | Both temporary displays restored; only P01a + P04a retained |

The original five-step receipt sequence remains Create Snapshots → Freeze Plan → Post Plan → Reconcile → Close Paid Loans. Notification bots, scheduled daily-charge generation and the historical cache initializer remain disabled. The copy remains undeployed, with cache OFF, delta OFF and quick sync ON. Historical test cache columns remain unused and stale; source repayment sums remain authoritative.

## Performance experiment

Metric: wall time from clicking Save to observing Posted in the new desktop GUI. It includes client, network, queue/server work, sync and observation delay. It is **not bot-only or server execution duration**. AppSheet's older testing/analyzer surfaces were not used to fill that measurement gap.

All nine measured receipts used borrower PERF-UI-SINGLE-001, amount 100, payment date 12 September 2026 and six eligible charges. The source balance decreases by 100 each run, while eligible-row count, posting count and interest-only allocation shape remain constant. The runs were sequential control → combined → restored control, not randomized or concurrent. Saved configuration versions were verified and sync requested; the new client does not independently display its loaded runtime version. Later validation also encountered stale client displays that required a fresh new-GUI session. This limits attribution of small wall-time differences.

| Configuration | Three observations (seconds) | Median | Reduction versus control |
| --- | --- | ---: | ---: |
| Original, before | 19.941, 17.603, 19.180 | 19.180 | — |
| Combined P01a + P04a | 18.402, 17.904, 16.483 | **17.904** | **1.276 s / 6.65%** |
| Original, restored | 18.830, 16.187, 24.436 | 18.830 | Combined is **0.926 s / 4.92%** lower |

The measured improvement is of similar size to observation intervals and ordinary run variability. Do not add the individual first-round proposal percentages or compare these client wall times directly with historical server-task measurements. No claim is made about large portfolios, parallel users, p95 latency or production throughput.

Every benchmark receipt was later checked against its allocation plan: six unique ranks, one positive allocation of 100 interest to charge row 690, five zero allocations, exactly one repayment, principal zero, received = planned = posted = 100, both differences zero, and Processed At populated. The same-date older charges retained descending row-number ordering. Raw IDs, UTC start times and last-Processing/first-Posted observations are in [receipt-timings.csv](receipt-timings.csv); computed statistics are in [benchmark-summary.json](benchmark-summary.json).

## Logical validation

### P01a: short-circuit eligibility after Posted

The candidate wraps the entire original SELECT in `IF([Status] = "Posted", LIST(), original_SELECT)`. Processing, Error and blank statuses retain the exact original borrower, target, loan, outstanding and date predicates. For Posted, the eligible list is intentionally empty. This avoids repeatedly evaluating a transactional candidate list for completed receipts.

Dependencies were reviewed in current configuration. Snapshot creation, allocation freezing, plan freezing and posting are Processing-guarded. Reconciliation checks plan completeness, allocation amounts and posted ledger totals before setting Posted. Loan closure uses posted repayments/loans rather than the now-empty eligible list. Retry requires Error and no other Processing receipt for that borrower; it first returns the receipt to Processing. All these paths retain their existing guards.

Reconcile sets Status and Processed At using the reconciliation predicate. If AppSheet evaluates assignments sequentially, the eligibility subset condition in the repeated timestamp expression can become vacuous after Posted; however, the Status decision has already passed the full predicate while Processing. Other plan and ledger checks remain. Successful receipts and successful retries had timestamps; the deliberately invalid retry stayed Error and had no displayed Processed At. This analysis is not proof of transaction atomicity under concurrent writers.

**Visible dependency:** Eligible Outstanding becomes zero for Posted receipts. Although that helper is hidden, Amount Received's description displays it. A live Posted edit form showed “Current eligible outstanding: ฿ 0”; the amount field was disabled. The form was cancelled without saving. This is not a ledger amount change, but the description should be hidden or reworded for Posted before production adoption if it could mislead users. Persisted-row validation bypass and noneditable financial fields were also reviewed; production permissions were not exhaustively exercised.

### P04a: direct predecessor comparison

Only the predecessor condition inside Calculated Amount's SUM/SELECT changes. Instead of comparing the two recursively evaluated Calculated Order values, it compares the frozen date descending, then frozen row number descending. Exact original and candidate expressions are preserved in [lab-config.json](lab-config.json) and the dictionary's OLTP Combined Test sheet.

For valid comparable snapshot tuples, let a row's rank be one plus the number of rows preceding it under that lexicographic order. A row has smaller rank exactly when its tuple precedes the current tuple. Consequently the old and new predicates select the same preceding balances, and the outer MAX/MIN calculation returns the same amount. Calculated Order itself, snapshot fields, interest-first split, posting guards and receipt sequence were unchanged.

An independent sequential allocation oracle sorts rows and spends a receipt budget interest first, then principal. It was compared with both expressions across **10,009 deterministic cases, 758,965 allocation assertions and 56 eligibility assertions**, all passing. Coverage includes zero/partial/exact/excess budgets, zero components, date ties, several receipts, target methods, another borrower, another loan, future dates, zero outstanding and Processing/Error/Posted/blank statuses. [logic-validation.json](logic-validation.json) records the result; the maintained script is `scripts/oltp-combined-logic-validation.mjs`.

These are local JavaScript mathematical checks, not 10,009 executions in AppSheet. Valid nonnegative whole-baht balances and comparable date/row-number snapshots are assumptions. Duplicate identical ordering tuples are a pre-existing weakness: a counterexample with two 100-balance rows and a 100 receipt lets both old and new calculations allocate 200. Normal snapshot guards prevent duplicate Ref Charge rows for a receipt and use the source row number; snapshot fields are noneditable through normal app configuration. Explicit malformed-data constraints are not comprehensive. Privileged native-database corruption and blank-date engine semantics are not certified.

## Live correctness results

Amounts below are baht. For every successful case, the detail showed Posted, received = planned = posted, both differences zero, and a populated Processed At. Stored plan rows and repayment counts were checked, including zero rows using the temporary display. The evidence is manually transcribed from new-GUI observations, not an API extraction.

| Case | Input / expected behavior | Observed result |
| --- | --- | --- |
| Nine benchmarks | 100 each against six charges | All nine: 100 interest, zero principal, six plan rows, one repayment |
| Invalid amounts | 0, -1, 1.5, and 195201 when eligible = 195200 | All four rejected; form retained with positive whole-baht/eligible-balance validation message; no receipt created |
| Lump Sum split | 94750 against 94700 interest plus principal | 94700 interest + 50 principal; six plan rows, one repayment |
| Lump Sum fan-out | 100100 after split | 99950 principal on newest charge, then 100 and 50 interest on older rows 695 and 694; three other rows zero; six plan rows, three repayments |
| Single Partial | 25 targeted to older charge 691 | 25 interest only; one plan and repayment; other eligible charges untouched |
| Retry already-posted ledger | Synthetic receipt Status manually changed to Error, then normal Retry | Returned Posted with the same allocation and same repayment ID; no duplicate posting |
| Single Full | Remaining 75 on charge 691 | 75 interest; one plan and repayment; target fully paid |
| Loan Close, second loan | 1010 = 10 interest + 1000 principal | One plan and repayment; loan Closed; other loan's 250 remained excluded |
| Receive All | Remaining 250 across three charges | 50 + 100 + 100 interest, ranks 1–3; three repayments; original loan Closed |
| First-day Auto | New 2000 loan, daily interest 20, automatic charge Y verified | Automatic 20 interest receipt, Net-off at Disbursement, one repayment |
| Date cutoff | Future charge 30 dated 14 September | Lump Sum form on 13 September: eligible 0; change to 14 September and blur: eligible 30. Save rejected by existing Payment Date <= TODAY validation; no future payment saved |
| Loan Close includes future charge | Close third loan on 13 September with future 30 interest | 2030 receipt; future row 698 ranked first with 30 interest, row 697 second with 2000 principal; two repayments; loan Closed |
| Deliberate mismatch | Synthetic 25 receipt changed to 26 in native DB, Status Error, normal Retry | Returned Error, received 26 versus plan/ledger 25, both differences 1, no displayed Processed At, same single repayment |
| Mismatch recovery | Restore amount 25, sync, normal Retry | Posted, both differences zero, same repayment `5Jx1gJ-AGL4sQfl58MGKUe`; Processed At 13 September 09:37:34 Bangkok |
| Posted edit display | Open successful receipt in edit form | Current eligible outstanding displayed 0; amount disabled; cancelled without changes |

The deliberate native-database edits were fault injection on one explicitly synthetic receipt, not a supported financial correction workflow. Original amount 25 was restored and successful reconciliation verified before finishing. No deliberate fault remains.

Final borrower UI reconciliation showed **3 loans, all Closed**, total amount loaned and closed-loan principal **103000**, total interest received and closed-loan interest **100560**. These agree with the independent fixture roll-forward: original loan principal 100000 and interest 100500, second loan 1000 + 10, third loan 2000 + 50. Total receipts implied by the reconciled principal and interest are **203560**. The inventory roll-forward is 44 historical receipts + 17 new = 61 receipts and 66 repayments; those aggregate row counts are calculated from the recorded starting fixture and checked case counts, not a separately exported whole-database row count.

### Existing edge case found

The second synthetic loan initially had automatic-charge blank, so no first-day charge was expected. After enabling Y, a same-day Close Loan action was available but created neither a charge nor a receipt. The unchanged Create Final Charge action requires positive accrued interest, which was zero on that date; Add Principal to Today had no charge to target; Receive Remaining was then ineligible. Moving only this test loan's start date back one day allowed the existing close flow to create and settle 1010 correctly. This is a pre-existing workflow gap for a loan with no current charge, not evidence that P01a/P04a broke automatic first-day generation. It was identified, not fixed, in this tuning round.

## Decision and review checklist

Keep the combination as a **test candidate with a modest, unproven performance benefit**. P04a has a clear equivalence argument under normal snapshot invariants. P01a has an intentional downstream display change that merits review. No production implementation is authorized by this report.

For owner acceptance in the new test GUI:

1. Review the split and fan-out receipts and confirm newest-date / descending-row, interest-first behavior matches the intended prototype.
2. Review Single Full, Single Partial, Receive All, First-day Auto and Loan Close receipts, including future-charge inclusion for Loan Close.
3. Decide whether the Posted “eligible outstanding 0” description is acceptable or should be adjusted before any production proposal.
4. Review the existing same-day/no-charge Close Loan gap separately.
5. If the modest gain warrants rollout work, first perform a larger interleaved benchmark and concurrent/offline interruption tests in the clone. Current tests do not certify simultaneous same-borrower writes, multiple permission profiles, externally corrupted snapshots or recovery from interruption at every posting step.

Rollback configuration by restoring both original expressions from lab-config.json or restoring clone version **1.000038**. App version restore does not undo database records or remove historical cache columns. Retain synthetic evidence for review; do not delete financially material records as a routine correction. A complete reset should use a fresh isolated copy. The production configuration and data require no rollback because they were not changed.

Documentation: `Documents/AppSheet_Data_Model_Overview.md`, the dictionary's **OLTP Combined Test** sheet, and `Change Logs/CHANGE_NOTES_OLTP_COMBINED_PERFORMANCE_2026-09-13.md`. Production inventory and prior lab history remain separate.
