# Universal payments clone — execution evidence

Date: 6 September 2026 (Asia/Singapore). App `1b901dff-2e47-477c-8d2c-28aad5556102`; database `eEwpmrK1Zr4_ao2UcQzF42`. Test configuration initially v1.000042, confirmed in Manage > Versions > Version History. Production is outside the mutation scope. This report is in progress and is not acceptance evidence for unexecuted cases.

## Synthetic fixtures

| Object | Synthetic identifier | Entered values |
| --- | --- | --- |
| Borrower A | `YSYPQyaxQ6lFGGfdZVD0xG` / `ZZ_TEST_PAY_A_20260906` | Description identifies disposable clone test data; phone blank |
| Daily-interest loan A1 | `SGX9mqcmiYgNemiN9vygLZ` | Loan Date 2026-09-03; principal ฿1,000; transfer fee ฿2; current daily interest ฿15; interval 1; synthetic arrangement text |
| Generated first-day charge | `0gEpwYmatO4pILlCDEFTM8` | Date 2026-09-03; amount ฿17 |
| Generated first-day receipt | `OV3x21izQP40QQnGWP7R91` | Date 2026-09-03; amount ฿17; Net-off at Disbursement; First-day Auto; correct synthetic borrower and target-charge references |

## Executed checks

| Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| T001 Borrower creation | New borrower, zero loan totals | Created through normal app form; searched by synthetic prefix; zero totals before loan | Pass |
| T002 Daily-interest loan creation | Loan with specified terms and outstanding principal ฿1,000 | Normal form accepted; detail shows September 3, ฿1,000, daily interest ฿15, interval 1, fee ฿2; active | Pass |
| T003 First-day charge creation | Exactly one first-day charge for interest plus fee ฿17 | Related Charges count 1, September 3, ฿17 outstanding; Create First-Day Charge monitor run Complete | Pass for this fixture |
| T004 First-day receipt creation | Exactly one receipt with loan date and intended references/method | One synthetic receipt ฿17; First-day Auto; Net-off at Disbursement; September 3; native DB references display the expected synthetic borrower/date; Auto Receive First-Day Charge monitor run Complete | Pass for creation |
| T005 First-day receipt posting | Posted; one allocation and one interest repayment ฿17; both differences zero | Initially Processing, no repayments; monitor event without bot run. First controlled retry created snapshot; second froze/posted but status Error; third after direct-query correction reached Posted with one allocation and one repayment | Initial fail; recovery passed for this receipt only |
| T006 Existing snapshot / posted-row retry | Preserve the same plan; no duplicate repayment | Allocation `R4s8enj9qX4B2tzXyU3vR2`, repayment `wMqiOle4xi4KugkWXpWWz8`; final received/planned/posted all ฿17; counts remain 1/1 after three retries | Pass for observed sequential retries; no atomic concurrency claim |
| T007 Second fresh daily-interest loan | Fresh first-day receipt should run automatically | A2 date September 4, principal ฿500, interest ฿5, interval 1, zero fee. Receipt `RFBTTAspn44AUDUNz00auc` initially stayed Processing with revised before-row-ID condition. After synthetic Error intervention and one Retry with direct-query checks, reached Posted | Add-trigger failure retained; one-attempt processing recovery passed |
| T008 Fresh daily-installment first-day chain | September 4–13 inclusive, principal ฿1,000, ฿150/day: first day P100/I50 | Created loan through normal form. Receipt `K6pu3VvjoD49eYJtjAlYb1` automatically Posted without intervention. Payment date September 4, Net-off at Disbursement, First-day Auto; one allocation and one repayment `DBUWtBjssB4IQPX5V_0Zx5`. Repayment detail P100/I50, total150; received/planned/posted150; differences0; Processed At present | Pass after event condition simplified to Status=Processing and direct-query processing changes |
| T009 Generated-repayment protection | No Edit/Delete on receipt-generated repayment | T008 repayment detail only exposes Expand in its header; P100/I50 read-only | Pass for standard detail navigation |
| T010 Posted receipt metadata edit | Preserve paid target and locked inputs; save optional metadata without reprocessing | T008 edit form shows borrower/target/payment method as noneditable content, date and amount disabled; Bank Reference and Notes editable. Saved `TEST-META-A3` and synthetic note; server expression table subsequently confirmed Posted, unchanged Processed At, one allocation and one repayment | Pass for observed save and subsequent server read |
| T011 Receipt amount formatting | Reconciliation values in whole baht | T008 detail shows received/planned/posted ฿150 and both differences ฿0 | Pass |
| T012 Existing charge generator, three loan fixtures | Generate one September 6 charge per loan using unchanged formulas; action disappears after creation | A1 charge `9c26vIkY6BQLWFz7RXgzm5`, ordinal444, I45/P0; A2 `ztsqMu6xyOHDDlmayKVboS`, ordinal445, I10/P0; A3 `uuqY1S4F93dhtrGOukM0zZ`, ordinal446, I100/P200. Eligible total355. Generator no longer displayed after each run | Pass for these three manual invocations; scheduled execution not tested |
| T013 Invalid lump-sum amounts | Reject zero, negative, fractional baht and above available balance | With available355, attempted 0, -1, 25.5 and356; form retained and positive whole-baht validation displayed; no receipt created for rejected attempts | Pass |
| T014 Payment-date boundaries | Reject a future receipt date and exclude charges after the receipt date | September7 rejected as invalid date. September5 showed eligible0 and rejected amount25. September6 restored eligible355 | Pass for fixture dates |
| T015 Lump sum25, same-date newest-first | Three snapshots in ordinal order446/445/444; I25 on446, two zero allocations | Receipt `qbxm6qA4LYh9A0rApHH9zE` instead saved only PA `ysr_EGWC9M40ERKQyXpvff` for oldest charge444, order1/I25; repayment `1-htBtNWcy4ZYc-Ghx9nu0`; incorrectly Posted with zero differences | **FAIL: wrong ordering and incomplete snapshot coverage. Preserved as failure evidence** |
| T016 Lump sum100 with server eligibility confirmed | All three saved charges considered, I100 to446 | Server expression test confirmed three eligible keys and available330. Receipt `mJ3CVzxNjTk66xSUuOvP2M` saved only PA `844SK3rRAN4dYStlm1vLd1` for444, order1/I20; no repayment; Error, planned20, allocation difference80, posting difference100 | **FAIL: incomplete snapshots; no financial posting** |
| T017 Discard unposted receipt / child cascade | Deleting T016 removes its owned allocation and leaves other receipts/allocations | Used app Delete with confirmation on T016 Error receipt, which had zero repayments. After sync, receipt absent; native PA table loaded8 rows (four blank and four other fixture allocations), with `844SK3rRAN4dYStlm1vLd1` absent | Pass for Payments→Payment Allocations cascade; borrower cascade subsequently passed in T034 |

Additional fixture keys: A2 loan `PREotDCoV52fkBzjUWRRqO`; A3 loan `D6Bfzvsm6DUviJXRpW0bS9`. A3 first-day charge `dsdxIVCSTD4dqUcnLppnn2` and allocation `pu3lshKvRz4Q6xO_0sk3f4`. All are disposable synthetic data in the isolated clone.

## Successful retests after snapshot-context and coverage corrections

| Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| T018 Lump sum100: same-date order and interest boundary | Snapshot all three remaining charges; order446/445/444; I100 on446; zero on445/444 | Receipt `UJFO93tHrZeQjeJGQUOU6f`, Bank Reference TEST-LS100-COVERAGE, Posted. PAs `Nw4AkCcOBe4REARZEdL1of` order1/I100, `a_uv91BcQw4H2vsaR9cNU9` order2/0, `JkTAJiiVgI4NiqR7JiEyn2` order3/0. Exactly one repayment `EMGcVaHZ0f4am4Zj2li546`. Amount/planned/posted100, differences0. Native snapshots and server receipt links agree | Pass |
| T019 Lump sum205: principal-only charge followed by another loan's partial interest | Newest446 remainingP200, next445 I10, oldest444 I20; allocate200/5/0 | Receipt `5JuiXm5ZwXq3IROfqCaejE`, TEST-LS205-SPLIT, Posted. PAs `YnM_nUcxtH4o2sWpuyJTq1` order1/P200, `7nOwd-OpRB4uevhthxJ2O6` order2/I5, `TVi0keO2rj4TIJ9eyH8ZI0` order3/0. Repayments `k_uy4NyvsE4Cagv5G9Yvtd`, `23QZ0xpNnA44Mi1tlHSyn2`; counts3/2; amounts205; differences0; remaining25 | Pass |
| T020 Existing Single Partial action / Cash | Prefilled borrower and charge444; amount2 affects only that charge, cash channel retained | Receipt `Evy6B5C0pkG1EgWtG7WEiT`, TEST-PARTIAL2-CASH, Cash / Single Partial, correct target444. One PA `hPrl2LwcLu44qzLpoA9ig7`, repayment `xpDHqiarRk4XUOQQWsoL-4`; Posted, amounts2, differences0, target remaining18 | Pass |
| T021 Existing Collection Receive All / zero-balance controls | One receipt settles18 on444 and5 on445; today total increases332→355, remaining23→0 | Receipt `jxMKqgQEbfS3FVpDyAvPcL`, Bank Transfer / Receive All, Posted23, blank target. Two PAs `cTx0_zjgt04Om87v0-Zcfd`, `WcVw4AiV9w4QqOPJy9Go36`; repayments `i7hO_9IJvX4xe6PAnyACy6`, `IhzMku1cGv4627hhe1CG35`. Amount/planned/posted23, differences0. Collection displayed332/23 before,355/0 after; payment action absent at zero balance | Pass |
| T022 Daily-interest Close Loan after interest paid | Add outstanding principal500 to existing today's charge445, post one principal receipt, then close A2 | Receipt `0NXvLqbpzcperuu5TIXwlA`, Loan Close / Bank Transfer, target445, Posted500. One PA `aXCLtMO1034sM6QzJcxRpe`, repayment `FhcdH7MOPu4ByS6yn6p5q0`; all totals500/differences0. A2 detail Closed, outstanding principal0, principal received500, total received515 | Pass for this closure path |

Manage > Versions read-back after these configuration changes: **1.000052**. These are bounded scenario results; they do not establish concurrent/offline safety or user acceptance.

## Future-charge and early-payment tests

| Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| T023 Fixed-date loan creation before due date | Existing workflow has no charge until generation is due | A4 loan `qpR8njfYm2Lj9eOVUtEgj7`, dateSep6, dueSep8, P1000/I100/fee0; Active, related charges0, no first-day payment. A temporary synthetic-only generator control then seeded future charge `KFRl5ZuSAh8dBshDD2RWsy`, ordinal447, dateSep8, P1000/I100 | Creation behavior passed; seeded future charge is a fixture, not scheduled-generation evidence |
| T024 Future single partial / interest-principal boundary / lump exclusion | Pay150 early on Sep6: I100/P50; future charge excluded from lump eligibility | Receipt `pSgf8UJJ0ODiVCMlAGsIFg`, TEST-FUTURE-PARTIAL150, Single Partial, correct future target, Posted150. PA `m6kpGYtYlJ4MiN_rIogz8b`: snapshot I100/P1000, allocatedI100/P50, amount150/order1; repayment `eTB5WkSdFJ4eiMEI4TNlT6`; differences0, remaining950. Server evaluation of Lump Sum receipt still showed eligible list empty/outstanding0 while future charge remained950 | Pass |
| T025 Future single full after partial / fixed-loan closure | Receive remaining950 principal once, retain prior partial, close loan | Existing Receive Payment action created receipt `684ukUWZho8XWYkntRAvzz`, Single Full, Posted950; PA `VBByonNlgk4BylWlnVzAS4`, repayment `AadjO3lOgw442pW7qJsGc7`; differences0. A4 detail Closed, principal received1000, total received1100, outstanding principal0, charge total paid1100 | Pass |

Fixture controls are recorded in ACT-030. The future-date override was restored to TODAY() and the prior synthetic-only guard immediately after seeding. Subsequent overdue fixtures and borrower B isolation/cascade tests are still in progress.

The initial Payments and Payment Allocations tables each contained four actual blank starter records. T035 subsequently removed all eight.

## Debugging / fault injection

- After v1.000042, changed the receipt event condition from `AND([_THISROW_AFTER].[Status] = "Processing", OR(ISBLANK([_THISROW_BEFORE].[Status]), [_THISROW_BEFORE].[Status] = "Error"))` to `AND([Status] = "Processing", OR(ISBLANK([_THISROW_BEFORE].[Row ID]), [_THISROW_BEFORE].[Status] = "Error"))`. The use of a defaulted Status value to distinguish an add was suspected; the underlying cause is not yet proven. Save performed; resulting version pending read-back.
- Changed **only** synthetic receipt `OV3x21izQP40QQnGWP7R91` Status Processing → Error in the cloned native database to exercise recovery. This is a deliberate diagnostic fixture intervention, not normal correction guidance and not a production migration step.
- Synced the app, verified Error and visible Payment - Retry action, then clicked Retry and synced. The first retry created one snapshot but no repayment. The second created one repayment but left Error with zero differences. After direct-query processing changes, the third retry reached Posted without duplicates.
- The second receipt also required a synthetic-only Status Processing → Error intervention before its one successful retry. The revised before-row-ID condition did not fix the fresh-add trigger. The final debugging condition became `[Status] = "Processing"`; the subsequent T008 fresh automatic chain passed.
- Display defects observed and corrected: Posting Difference `$`/two decimals → ฿/zero decimals; Planned Allocation Amount and Allocation Difference two → zero decimals, retaining ฿. T011 verified actual client output.
- Temporarily exposed Loans > Generate Today's Charge at Position Prominent (was Hide), with guard `AND([Ref Borrowers] = "YSYPQyaxQ6lFGGfdZVD0xG", <original guard>)`. Original charge formulas and eligibility remain within the guard. This test control is limited to synthetic Borrower A; restore its original guard and Hide after testing. It is not a production migration change.

## Remaining coverage

Cross-date ordering, final-installment rounding/closure, default paths (including zero-allocation snapshots), borrower isolation/cascade, multi-allocation partial-posting failures, competing receipts, processing-state form controls, broader Statistics reconciliation, offline behavior and access roles remain incomplete. Named completed tests above supersede this list as work continues. No blanket regression or full-testing claim is made. Three clone notification bots are disabled, and no messages have been sent.


## Later executed scenarios (September 6)

| Case | Observed | Result |
| --- | --- | --- |
| T026 Uneven final installment | A5 `QnDJLm5Cvs0KumGvdXXERb`, P101, 2 days at60. First day P51/I9; final charge `x8dOZsBKPKYOMRuc5q3E0v`, ordinal449, P50/I10. LS65 settles60 and closes loan; principal received101, total120, outstanding0 | Pass |
| T027 Cross-date newest-first and spill | LS65 `UkkE5r7H0B5iCPBU3qlQAS`, TEST-LS65-DATE-ISOLATION, Posted65. PAs `qIy2JhORfY4IUdxDyP5GD2` A5/Sep6/60, `AaP3ZAJivv4gQvRbrzWnd5` A6/Sep5/I5, `2tF0DhfC1X45aJuorqs8v2` A7/Sep4/0. Repayments `iixFsRPUA44aiywIPKXpde`, `1w1rMbqzLo4qQ4foXFTU5f`. Higher source ordinal of an older charge does not override date order; totals65/differences0 | Pass |
| T028 Borrower isolation | During A-LS65, B today charge `YbE03LAdHqiPo8GuCpDyQx` still I2 unpaid; B first-day2 unchanged. Collection2020 collected/820 remaining after A-LS65 versus1955/885 before | Pass |
| T029 Processing form controls and one-borrower pending guard | Paused receipt bot, created A receipt1 Processing with0PA/0repay. Edit unavailable. A second new receipt1 rejected with finish/retry message; discarded without row. After Error diagnostic/re-enable/Retry, receipt `WcON1DFvA1iVZ1XCAh4AZs` Posted1 at04:21:41, twoPAs/oneRepay, differences0 | Pass for sequential pending guard/recovery; not simultaneous concurrency |
| T030 Default after partial interest | A6 `gYLLLduWK1wAjdNl4E0vPK` overdue P500/I50 had I6 paid. Default retained old charge `11DFgH1DI3lbtQdfgH3KJM` with Pdue0/Idue6/rem0; new loss charge `wTxytF5O0KREtDZYgzqEN1` P500/I-500. Closed/defaulted/loss500, outstanding0, total received6, interest-494 | Pass for this fixture |
| T031 Zero-allocation default initial attempt | A7 writeoff rejected Interest Due=0 when Principal Due=0. Later group steps still created loss250 and closed loan; old charge remained275. Corrected validation then allowed manual fixture-only0/0 repair | **Initial fail with partial group commits; repair succeeded. Fresh test required** |
| T032 Fresh zero-allocation default | B2 fixedP10/I1 received a zero snapshot under B-LS1. Default retained old charge0, unchanged snapshot I1/P10/total11/order2/allocation0; added P10/I-10 direct default repayment with blank receipt refs; loan closed/loss10. Receipt Posted1/Processed At and counts unchanged | Pass after APP-047 |
| T033 Receipt processing with Trigger other bots=true | B-LS1 `zUBEI4YQZtmUF8A8AURWRA` automatically Posted04:46:06, two PAs/one repayment; totals1/differences0. All notification bots disabled | Pass for observed single run; no delivery test |
| T034 Borrower full cascade | Deleted B through normal Visible Borrowers detail. An intermediate sync check still showed two receipts and three allocations; after completed sync both branches were absent, including three repayments (448→445). A control records remained. No configuration fix required | **Pass after completed sync; initial FAIL label corrected** |

B cascade keys: borrower `ICQE1XF5rHCNcjjUkRIuiI`; loans `eIgPxv7edqbbhu2nuyYyX6`, `DJtdgGTUrMucQRcO3ZykTB`; charges `VT2rLjGYD44teZ5UZr7Lua`, `YbE03LAdHqiPo8GuCpDyQx`, `JcPeskT41fckssAMwfoXpc`, `S9mozSoGrB5R1xU5BDqclU`; repayments `SwK_Yh0sx64vqgvwkAhKo1`, `fMfRm3R48U4neMxcXGj4J9`, `xSsPZOIM53nqqUtfMoTKzP`. The temporary intermediate references subsequently disappeared after sync; see the completed-sync correction to TEST-009. Four blank records in each new table were removed in T035. Borrower A evidence is retained.

The original generator guard, TODAY() date and Hide position are restored, superseding the earlier temporary-control note. Still incomplete: multi-allocation partial-posting fault, stale-balance conflicts, offline/simultaneous use, access roles, scheduled execution, broader Statistics reconciliation and manual acceptance. No full-regression claim.


## Completed-sync correction (v1.000065)

**T034 final result: PASS for the disposable B fixture.** The earlier FAIL was an observation during sync, before all cascade deletions finished. Later server refresh shows zero B receipts; native PA table contains none of B's three allocation keys and retains A's zero snapshots. Native Borrowers contains A and neither B nor unused diagnostic C; three B repayments removed (448→445); B charge keys absent while A7's original/loss charges remain. No cascade fix or reparenting was performed. Precise elapsed sync latency was not measured. Inspect completed sync, not a partially applied cross-table state.

**T035 Empty-starter cleanup:** native Delete4rows confirmations applied separately to the four wholly blank first rows of each new table. Reload shows14 retained receipts and22 retained allocations, first records are the original A1 fixtures. No business-valued row selected. Unused diagnostic C was created and deleted without children. Pass.

**T036 Editor validation/default restoration:** v1.000065 confirmed in Manage. Only warning is the undeployed Daily00:05 scheduled event. Close Date/Due Date initial values read back blank. No configuration errors displayed. Scheduled invocation and notification delivery remain untested.

This correction supersedes the earlier open-cascade and blank-cleanup statements. Other remaining coverage is still pending; user acceptance has not been recorded.

## Final additional tests through v1.000068

| Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| T037 Partial posting failure and retry | Freeze15 across two allocations, post10 only, mark Error/difference5; after guard restoration Retry adds only missing5 and preserves the frozen plan | Fixture-only A1 Interest Due increased45→55 on 9c26vIkY6BQLWFz7RXgzm5 and17→27 on 0gEpwYmatO4pILlCDEFTM8 via normal Charge Edit. Receipt AW2Qm4npbTxtcOd8guxROu, TEST-PARTIAL-RECOVERY15, created05:26:16. Temporary receipt-specific Post Allocation guard suppressed order2. Error with planned15/posted10/difference5, two PAs and one repayment. Original guard restored and saved, then one normal Retry reached Posted05:28:25: same two PAs, original repayment retained, one added, planned/posted15 and differences0. App Retry disappeared. Restoration v1.000067 confirmed | Pass for controlled skipped-child posting and sequential retry |
| T038 Dashboard reconciliation | A subsequent5 interest payment reduces Pending Payment5, increases today's/total/MTD realized profit5 and leaves outstanding principal unchanged | Receipt g0PtONLMUWw6ptoZXFM2rq, TEST-DASHBOARD5, created05:32:48, Posted05:33:09, one PA K58m4hOVje4yaaUrjID913 and repayment IITBgeqoUU4S6NMel9Mpm8, totals5/differences0. Same-session synced dashboard deltas: Pending Payment -5; Today's Profit +5; Total Profit +5; Realized Profit MTD +5; Outstanding Principal0 | Pass for five displayed KPI deltas; not a whole-history audit |
| T039 Payments card actions | Posted receipt card shows allowed Edit; no Retry/Delete or email/reference shortcuts | After v1.000068 sync, TEST-DASHBOARD5 card reads Posted with Edit only. Manual configured action list is Delete, Edit, Payment - Retry; each retains its existing condition | Pass for Posted card; Error Retry was exercised before the layout refinement |
| T040 Final configuration validation | Restored test controls, saved version and no app errors | Manage > Versions shows1.000068, Save disabled. Errors & Warnings contains only undeployed Daily00:05 warning. Original Post Allocation guard was read back exactly after restoration. All16 retained synthetic A receipts are Posted; earlier wrong LS25 remains intentionally preserved as failed-test evidence | Pass for editor check; schedule not invoked |

T037 frozen rows: F8qtfglTO74_Y1D5H6NMj7 is September6/source444/order1, snapshot I10/P0/total10, allocatedI10/P0/total10. vCIBt6pYFB4TQP3NA_532f is September3/source441/order2, snapshot I10/P0/total10, allocatedI5/P0/total5. Original repayment4dGcjLQezW4eAJ2liVQzM2 remains; retry added MfxltEOfde4AUazAaMsrxa. No allocation was rebuilt or duplicated. The first-day supplemental balance then fell10→5→0 across T037/T038; the September6 supplemental10 was fully paid in T037. These intentional fixture changes supersede the older A1 totals; they are not production migration data.

Current pending coverage is the matrix in Documents/Universal_Payments_Clone_Migration_Runbook.md. Partial multi-allocation recovery and the five KPI deltas now have bounded evidence, superseding earlier pending statements. Offline/device loss, simultaneous independent clients, access roles, scheduled invocation, notification delivery, broad downstream reconciliation and user acceptance remain unverified. No test message or production change was made.
