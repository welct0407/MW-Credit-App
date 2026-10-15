# R051 — common receipt and sync performance

Completed investigation and bounded DEV verification, 6 October 2026. Starting commit `dd985cbd65ff127c24768a19ba18320b14e44620`, existing branch `codex/r051-receipt-corrections`, draft PR15. The completed [V73 trigger optimization](../r051-trigger-performance/README.md) remains in place. This batch adds measurement tools and evidence; it retains no speculative app or SQL optimization.

## Boundaries and recovery

- Canonical DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`; initial restorable version **1.000194**, final **1.000198**, saved and No issues found. Only Payments.Eligible Charges was trialled, then restored exactly to194. Final runtime sync passed. OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`, **1.000056**, unchanged, saved and No issues found. Previously verified Deployed modes retained.
- DEV target `appsheet-pg-prod-20260914 / 34.21.174.215:5432 / loan_manager_dev`, V73/checksum1165230041. No database definitions changed in this batch; no V74 allocated/applied.
- Fresh private dump and all-26-table restore parity: [backup evidence](vm01-development-backup.json). Its provisional filename mentions V74, but no such migration was created. Backup stays outside Git.
- Existing Chrome work account and owner-only DEV Partner delivery verified. Source records used for GUI tests are exclusively the bounded `SYN-R051-RECV-` borrower, loan, charges and accounts, with their generated receipts. No real record is changed for testing.
- All seven payment methods retain the existing unified `post_payment` engine. Posting, accounting, transaction locks, retry protection and reversal logic are unchanged. AppSheet eligibility is a form calculation, not another posting engine.
- Exact fixture cleanup is complete. [Final preservation](final-preservation.json) matches all23 pre-existing source/audit/history tables including Flyway; three derived analytics/statistics tables are excluded because they are recomputed. Zero non-owner delivery addresses and exactly one owner actor mapping. No PROD, merge, credential/access or instance changes.

## Database measurements

Each case used one discarded warm-up followed by five local samples or three live DEV samples, with all triggers and deferred constraints executed. Live samples were rolled back and all table fingerprints matched. Local measurements use a fresh clone of the verified private backup. They are database timings, not end-to-end AppSheet times.

| Path | Local median ms | DEV DML + deferred median ms |
|---|---:|---:|
| Single Full command | 31.40 | 43.48 |
| Single Partial receipt | 28.71 | 38.80 |
| Receive All, 5 charges | 35.81 | 45.91 |
| Receive All, 20 charges | 57.70 | 68.46 |
| Lump Sum | 31.89 | 36.71 |
| Loan Close command | 41.03 | 48.17 |

Full results: [local](v73-baseline.json), [DEV](dev-v73-baseline.json). Live function-profile arrays were empty despite accepting the tracking setting; no live function timing is claimed. The local clone records it. These samples do not isolate every provider/network/bot component, but do not support attributing the entire AppSheet wait to triggers. No new SQL optimization is justified merely by a theoretical small saving when measured AppSheet waits are seconds.

## Confirmed AppSheet profile and candidate

The current Performance Analyzer was opened from Manage > Monitor. An existing own synthetic receipt correction at 14:12:48 UTC took5.580s; its subsequent sync at14:12:54 took3.300s. Expanding its trace showed:

- 23 tables (22 editor business tables plus `_Per User Settings`), parallelism10; table-reading phase3.123s. Parallel costs must not be added together.
- Payments3.099s: row read0.568s, virtual columns2.513s, including Eligible Charges2.466s and Correction Guidance0.031s.
- Borrowers3.040s, Loans2.453s, Statistics1.700s. These include dependencies; they are not exclusive CPU times.
- Forecast1.582s, Context1.512s, Coverage0.828s and Summary0.573s. Cash Dashboard0.207s, recent cash summary0.261s, cash statement context0.116s.

OLTP196 first preserved the exact scope predicates but checked borrower and method scope before allocation membership. OLTP195 was an unsuccessful intermediate save: AppSheet rejected a chained list dereference; it was immediately corrected, not accepted or tested as runnable. OLTP197 trialled a direct target check for Single Full, Single Partial and First-day Auto; other methods retained their selection scope and own-allocation add-back. An unsaved LOOKUP attempt failed validation and was not applied. No views, permissions, recipient expressions, table bindings, caching or sync-mode settings changed.

The197 trace at14:55:34 UTC was4.581s: parallel phase4.329s, Payments4.220s, row read0.511s, virtual columns3.685s, Eligible Charges3.373s, Borrowers3.425s and Loans2.228s. The trial introduced a borrower reverse-reference dependency and did not establish a speed gain. Other197 syncs ranged2.652–5.471s; these are uncontrolled observations, not a statistically valid before/after experiment. The trial was rejected and the exact original formula restored in198. No candidate benefit is claimed. [Original/final expression](app-formula.json).

## Current GUI verification

- OLTP196: Single Full10 and Single Partial5 posted to the synthetic Dad account; SQL and GUI agree.
- OLTP197: additional Single Full10 posted; existing Single Partial capacity remained10 after its own5 posting. Attempted11 was rejected in the form. Correction5→6 posted, leaving4 on the target charge, with no duplicate posting.
- OLTP197: Lump Sum form displayed24 eligible; submitted4 and Posted4.
- OLTP197: Selected Charges offered only the two remaining eligible charges; selected one and Posted10. Receive All Posted the last10; Collection showed Fully Paid and0 remaining.
- OLTP197: Loan Close Posted1010 (principal1000 + current-day interest10). GUI showed Closed, principal0, total received1060 and interest60; SQL agrees. All seven submitted receipts are Posted in the [readback](gui-posted-readback.json).
- OLTP198: original formula readback exactly matches194; saved No issues found; runtime Sync complete. First-day Auto was not newly created in this GUI batch; unchanged SQL and previous R051 GUI coverage are reused, with no new timing claim. Candidate tests remain experimental evidence because the trial was not retained.
- Full local `Test-CI.ps1` completed with exit0: 73 migrations, financial/CRUD/historical cases and nine concurrency suites. [Log](local-ci.log).
- Exact synthetic cleanup completed with all triggers enabled; all23 existing source/audit/history fingerprints match. Final both-app diagnostics and selected dictionary/release records are reconciled. Publication and exact-head CI are verified on PR15.

Analyzer operation observations: Single Full6.719s/8.947s, Single Partial add4.100s, correction4.691s, Lump Sum4.841s, Selected Charges12.092s, Receive All8.128s, Loan Close13.162s. Associated displayed bots succeeded; zero-second entries are not independent delivery proof. Routes were unchanged and final owner-only data/actor checks passed. No production or uncontrolled recipient delivery is claimed.

## Review of table reduction

Twenty-three includes AppSheet user settings;22 business tables are configured. The count alone is not a reason to remove a table. Current OLTP navigation includes cash statements and upcoming charges; their supporting tables are not unused. Operational tables, cash accounts/holders and Partner mappings support forms, balances, receipts, references or notification routing.

The four Upcoming Charge tables are a possible reduction only if those OLTP screens and borrower upcoming summaries move to OLAP; Statistics supports the operational dashboard. This would change product scope, and savings cannot be inferred by summing their parallel trace times. No table removal has been applied. At14:55:34 their elapsed times were Forecast1.048s, Context0.822s, Coverage0.539s and Summary0.568s, while Payments was4.220s. Removing them cannot be assumed to shorten the critical path by their summed durations.

The22 business tables comprise eight core tables (Borrowers, Loans, Charges, Payments, Payment Allocations, Repayments, Business Expenses, Partners), Loan Form Context, Statistics, eight cash tables (Accounts, Holders, Account Balances, Holder Balances, Dashboard, Account Daily Summary Recent, Account Statement Recent, Statement Context), and four Upcoming Charge tables. No unused group was established. Cash Statement has operational value; its removal is not an appropriate count-only optimization.

The next target is the Payments eligibility/related-table calculation dependency chain, with controlled same-data comparisons before retaining a change. Moving computation into an existing SQL view may merit a scoped design; new tables/columns require owner schema approval. Historical row reduction needs a dependency-complete retention rule so corrections, references and balances remain available. No arbitrary date cutoff was applied.

Slices do not reduce the source data downloaded; database security filters can reduce rows, but an arbitrary historical cutoff would risk receipt correction and related balances. Quick sync is unsuitable as a blanket shortcut for server-computed financial changes. References: [security filters versus slices](https://support.google.com/appsheet/answer/10104706?hl=en), [performance concepts](https://support.google.com/appsheet/answer/10105761?hl=en), [Quick sync limitations](https://support.google.com/appsheet/answer/13865312?hl=en).

[Current manifest](completion-manifest.json) ties the final app/database state to this evidence batch. R051 remains Open and PR15 draft; no production readiness, owner acceptance or promotion is implied. Previous CRUD and V73 completion records remain dated evidence.
