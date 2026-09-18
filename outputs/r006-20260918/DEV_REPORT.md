# R006 DEV implementation — 18 September 2026

Four approved OLTP App formulas are saved in **DEV OLTP 1.000134**. The related-list SELECT syntax was accepted without substitution. No other app property, SQL definition, migration, type, Ref, action, bot, slice, view or formatting rule was changed. Production remains at the recorded R005 baseline; no production writes were authorized or performed.

**Recommendation: Ready subject to owner review and the limited checks below before production promotion.** The implemented behavior passed the exercised current-GUI workflows. Owner acceptance and production authorization remain pending. The design document supplied requirements, not additional operational authorization; standing project rules require recording DEV model differences now.

## Exact scope, identities and readback

- DEV OLTP: `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`, `database-3`, baseline **1.000131**, final **1.000134**. Versions 1.000132, 1.000133 and 1.000134 saved the eligibility gates, allocation selection and collection status respectively.
- DEV SQL: instance `appsheet-pg-dev-20260915`, host `34.158.38.171`, database `loan_manager_prod`, Flyway **V21** throughout. Database name alone was not used to establish identity.
- DEV OLAP: `494cd013-0d9b-482f-9559-c9d83059de91`. Final current-editor Version History explicitly showed **1.000129**, while the incoming inventory recorded 1.000128. R006 made no OLAP definition/save change; this observed version difference is recorded without attributing it to R006 or reverting it.
- Both DEV apps remain **Prototype / Not Deployed**. Final saved current-editor diagnostics contained only `Daily 00:05` (OLTP) and `Every Hour` (OLAP) notices saying scheduled events run only in deployed state. There were **zero other editor configuration errors/warnings**. These are excluded deployment-only execution limitations under the owner's Prototype rule. No DEV deployment check was run.
- [Delta](release-delta.json) records four exact literal expressions. [Independent saved observations](saved-editor-observations.json) were read from input values after reloading the current editor. [Comparison](dev-comparison-r1.json) verifies all four observations against the candidate hash.

The original SELECT body is unchanged inside the Processing/Error gate; Posted takes LIST()/0. Related Payment Allocations remains `REF_ROWS("Payment Allocations", "Ref Payment")`. The allocation filter still uses strictly positive Allocated Amount. The collection formula changes only the overdue SELECT source/removal of redundant membership; Thai enums, branch order, today's charge selector and status-order expression are retained. Current-editor Process sequence was Create Snapshots → Freeze Plan → Post Plan → Reconcile → Close Paid Loans; eligibility-dependent Reconcile expressions were inspected without editing them.

## Performance

Same Chrome desktop DEV app Dashboard, one excluded warmup then seven syncs, client wall-clock from sync click until the Sync button was enabled. No financial data writes occurred between sets; synthetic regression fixtures were created afterwards.

| Sample | Before, seconds | After, seconds |
| --- | ---: | ---: |
| 1 | 5.463 | 4.626 |
| 2 | 5.717 | 3.321 |
| 3 | 6.375 | 4.032 |
| 4 | 5.406 | 2.568 |
| 5 | 6.322 | 3.733 |
| 6 | 5.233 | 2.636 |
| 7 | 6.137 | 2.547 |
| Median | **5.717** | **3.321** |

Observed reduction **2.396 seconds / 41.91%**, classified **Strong** under the supplied design's thresholds. [Raw data/method](benchmark.json). The after warmup was 4.631s; the before warmup completed but its duration was not retained. Sequential, non-interleaved samples include automation overhead and network/cache effects, so this is not a causal server-side VC timing or a production prediction. Performance Analyzer details were not captured. No additional OLTP optimization was added.

## Current-GUI functional results

All new receipts below used isolated synthetic `R006-*` borrowers. SQL saved readback independently reconciles Posted status, planned allocation, posted amount, repayment sum and allocation identities in [fixture-readback.jsonl](fixture-readback.jsonl).

| Test | Observed result |
| --- | --- |
| Single Partial | Form eligible outstanding 120; amount 121 rejected, 30 accepted. Posted 30 / one allocation; remaining 90; Partially Paid. |
| Single Full | Current collection inline action posted remaining 90 / one allocation. Remaining 0; Fully Paid; loan closed with closing-payment Ref. |
| Receive All | Confirmation on R006-All posted 240 across two loans, two allocations of 120. Both loans closed; Fully Paid. |
| Lump Sum | Form eligible outstanding 240, receipt 150. Newest charge received 120, older charge 30; Posted with two allocations; remaining 90. Overdue still takes priority despite a paid charge and a partial charge both collected today. |
| Loan Close | Current loan detail/confirmation posted 130: final current charge 110 plus old interest charge 20. Loan closed; Fully Paid; matching repayment total. |
| First-day Auto | New current-GUI daily-interest loan, principal 100, interest 10, transfer fee 0 and Auto Charge Y produced a Posted receipt of 10 with one allocation/repayment. Collection showed Fully Paid. A preceding input attempt accidentally cleared the default Y flag and created no first-day receipt; it was a test-input issue, not a formula change. Both synthetic loans are retained and disabled for further automatic charges. |
| Posted history | Existing synthetic Lump Sum `RwHV5kZ0QSZfOXPr6pesPj` still showed Posted 150, two repayments and two allocations (120/30), zero allocation/posting differences. Its edit form showed eligible outstanding **0**, with amount/date disabled; cancelled without saving. |
| Allocation identity/order | Historical Lump Sum showed keys `pc6:22:RwHV5kZ0QSZfOXPr6pesPj:CP6GUI-Lump-C1` then `...:CP6GUI-Lump-C2`; current Receive All showed `pc6:22:e3OKRUrtQclBnaEocikdAV:R006-All-C2` then `...:R006-All-C1`. Keys, amounts and Allocation Order match the independently queried positive rows, i.e. the original predicate's result. |
| Collection states/navigation | Not Paid before receiving; Partially Paid after 30; Fully Paid after settlement; Overdue retained on Lump; no-charge R006-Blank absent from collection, SQL count 0 and unchanged first IFS branch yields blank. Board/detail and Borrower Ref navigation worked; due/collected/remaining values matched. Final visual inspection showed purple Overdue and green Fully Paid, original group ordering and action visibility. |
| Statistics, same data | Before and after formula edits, visible dashboard counts were Overdue **32** and Fully Paid **1**. No fixture/data writes occurred between these observations. Partially Paid/Not Paid zero groups were not displayed, so those exact stored VC values were not directly measured. |

The one-positive cases have matching SQL receipts/children; the explicit row-ID GUI comparison covered historical and new multi-allocation receipts. No historical synthetic payment with no allocations or nonpositive allocation was found by the bounded query; no artificial invalid Posted record was inserted. The empty-list behavior follows the retained SELECT/filter semantics but was not separately exercised on a persisted zero-allocation payment. Error-state retry was not deliberately induced (optional under the design); its original eligibility expression is retained behind the Error gate. Direct GUI display of the blank status, orange/red colors and all four Statistics VCs remains a focused follow-up if strict line-by-line execution of every design test is required. No failure or mismatch was observed in those branches; the coverage limitation is explicit, rather than claiming an unrun test passed.

An expression-assistant Test link opened an old Table Data page during exploration; it was immediately closed, and no output from it is used as verification. All behavioral evidence above comes from the current application GUI and read-only SQL.

## Recovery and test-data disposition

- Clean starting Git commit `63a21a2efb4c87b27af6eacbe1b1822ef0d215eb`.
- AppSheet Version History confirmed restorable OLTP **1.000131** before edits. Prefer restoring the four recorded original expressions; full-version restore only if it will not overwrite intervening work.
- Before synthetic writes, a full DEV dump was captured outside the repository at `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\r006-dev-before-fixtures.dump`; SHA-256 `8BCF8FECC09292F2F841AAA1397F9E2EA9C6156C9896529C8BB845AD5CEA055D`. Existing backup tester successfully restored it in a local temporary PostgreSQL instance and verified normalized schema parity. No PROD backup/write was needed.
- Synthetic data setup is maintained in `scripts/database/Invoke-R006Lab.ps1`, with fixed DEV target checks and external credentials. Test records, including posted financial history, were retained. All six R006 borrowers were marked Hidden and all eight R006 loans had Auto Charge disabled after tests; final SQL readback confirms this. Hidden does not remove these rows from every existing view: the current Collection view still displayed the synthetic R006 receipts/balance after sync. The tests therefore remain identifiable DEV data, not a promise of restoring all aggregate totals to their pre-test values. No integrity trigger was disabled. No database definition/migration changed; synthetic DML is test evidence only and must never be promoted.

## Documentation and promotion handoff

The data-model overview and four rows in the dictionary's **Dev Differences** record the unpromoted formulas; production inventory and DB sheets stay unchanged. All workbook sheet values/formulas survived export/import checks; affected rows were rendered and reviewed.

Candidate R006 revision 1 hash: `d2814e156a81f89c5d7bb245012edb7a70ad1e96027fc2baf07c8e8b03f4c262`. The commit containing this report/delta is the implementation checkpoint; identify it from Git history rather than changing the immutable candidate with a self-referential commit hash. R005 is the dependency. No Flyway manifest is added because no migration exists. Before promotion, resolve any required focused coverage above, obtain owner acceptance/scoped production authorization, verify PROD identity and four-property drift, capture PROD rollback, and promote/independently verify the complete four-item delta using the release workflow. Do not copy current DEV blindly or include synthetic rows.
