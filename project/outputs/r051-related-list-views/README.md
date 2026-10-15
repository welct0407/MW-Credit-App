# R051 related-list SQL-view experiment

7 October 2026 (Asia/Bangkok). **Experiment complete; AppSheet candidate not retained.** Final DEV is OLTP **1.000206**, OLAP **1.000056**, PostgreSQL **V76**. R051 remains Open; PR16 remains draft, stacked on PR15. No PROD mutation, merge or promotion.

## Result

Replacing the expensive reverse-reference formulas is technically possible without storing ID lists in database columns. In OLTP204, the existing Payments columns retained their names, List-of-Ref types, labels and inline displays, while ordinary SQL view results replaced three `REF_ROWS` expressions and the positive-allocation filter. Old formulas did not run alongside the candidate.

The saved-row trace stopped fetching Loans, Repayments and Payment Allocations separately for those calculations. However, the same child data is still needed during full sync for existing screens and other formulas. The additional helper table did not deliver a convincing overall save/sync improvement.

| Three-sample median, seconds | Original OLTP200 | Complete candidate204 | Change |
| --- | ---: | ---: | ---: |
| Edit-row server operation | 3.261 | 2.494 | 23.5% lower |
| Manual app sync | 2.985 | 3.450 | 15.6% higher |
| Edit operation plus its following sync | 6.821 | 6.593 | 3.3% lower; inconclusive |

These are AppSheet Performance Analyzer durations, not client stopwatch measurements. Samples are small, sequential rather than randomized, with variable cache/network/service latency. The first baseline edit was 13.440s. No general loading-time, production-scale AppSheet or all-seven-channel speedup is established. Paired server durations omit client gaps and rendering.

**Recommendation:** do not adopt this helper-table design as a save/sync optimization. Original formulas were restored in OLTP205; the extra AppSheet binding and generated helper definition were removed in206. Final AppDoc has zero mentions of the helper. The original22 business tables plus user settings remain. Previously retained Posted eligibility guards and V74 forecast optimization remain unchanged. The additive SQL view stays dormant, preserving immutable migration history and a reproducible prototype for review.

## Implementation and measurements

- V75 creates ordinary `public.oltp_payment_related_ids_v1`, one row per payment with query-time repayment, allocation and closing-loan keys. V76 adds positive-allocation keys to remove the remaining `Visible Allocations` dependency. Both use `security_invoker`; no physical list columns, materialized cache, maintenance triggers, accounting writes or extra grants.
- Text transport uses ` , `, with empty-list decoding. All live DEV key sets matched, including the allocation filter, and no ambiguous delimiter keys were found. Future reuse must preserve that key contract.
- Initial candidate202 replaced only three formulas. Its edit median3.429s and manual-sync median3.347s were both worse than baseline. V76/204 completed the dependent filter replacement; this intermediate result is retained, not hidden.
- Read-only PROD V58 query measurement on397 payments: median8.09ms,135,350 bytes of key strings across four lists, maximum3,111 bytes per row. This measures PostgreSQL query execution, not AppSheet transport/sync. No production view was created.
- [Exact formulas and lifecycle](formula-trial.json), [all timings and representative traces](measurements.json), [production aggregate measurement](production-query.json), [V76 catalog/data parity](v76-after-contract.json).

## Verification

Current GUI tests used only the task-owned synthetic receiving borrower/loan/accounts in canonical DEV. Owner-only delivery containment and one mapped owner actor were checked; no real record was deleted for testing.

| Check | Result |
| --- | --- |
| Original25/26-baht receipt corrections | Same repayment/allocation contents and order; normal save/sync refreshes lists |
| New5-baht receipt | Two repayments and allocations,4+1, appeared after normal save/sync; no extra refresh click |
| Child navigation | Repayment detail opened with correct amount and source-receipt guidance |
| Delete new5-baht receipt | Only original26-baht receipt remained |
| New synthetic loan close | Receipt1,034 baht, four repayments/allocations and one Related Loan; closed loan principal0 |
| Delete closing receipt | Loan reopened with principal1,000; original26-baht receipt retained |
| Final rollback | Four original formulas read back exactly; no helper mentions in AppDoc206; final runtime sync successful |
| Both editors | Saved, No issues found; OLAP unchanged |
| SQL | Full local SQL/concurrency/upgrade CI through V76 passed; synthetic view tests cover empty/multiple lists, amount correction, deletion and loan close |
| Cleanup/preservation | All exact task fixtures removed;22 existing source/audit tables match restored backup;0 non-owner delivery addresses,1 owner actor |

Offline/pending-local list behavior was not established; the candidate is not retained. No write-engine changes or separation of the seven receiving channels occurred. OLAP and reporting consumers were unaffected by this additive, unused view. [Final preservation](final-preservation.json) and [GUI closure](gui-results.json).

## Recovery and publication

Starting Git `a9e00a98af57d9134b6853f67f49a95837b40ef3`. OLTP200 is the recorded app rollback baseline; intermediate204 preserves the candidate. Backup at V74 was restored and26 table fingerprints matched before the coherent batch; the dump remains private outside Git. [Backup metadata](vm01-development-backup.json). Both migrations individually preserved25 non-Flyway data tables. Final fixture verification excludes regenerated Daily Analytics, Cash Account Daily Analytics and Statistics, plus expected Flyway history changes.

V75/V76 are already applied and immutable. Do not rewrite/delete them. The current app rollback is already complete; removing the dormant SQL view later requires a higher migration after dependency review. Earlier PR16 refinements remain in place. CI logs contain expected negative-test SQL errors; the full runner exited successfully. Repository publication and remote CI are recorded in the draft PR.

Validation closure: dictionary1,506 documents/zero errors; Python syntax and JSON checks passed. V76 retains its already-applied trailing blank line: this sole whitespace finding is preserved to avoid changing immutable migration bytes.
