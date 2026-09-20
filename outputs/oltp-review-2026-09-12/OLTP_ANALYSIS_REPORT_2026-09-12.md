# OLTP application review: correctness and automation performance

**Application:** Loan Manager ผู้จัดการสินเชื่อ

**Review date:** 12 September 2026, Asia/Bangkok

**Live baseline:** deployed AppSheet version **3.000045**

**Status:** analysis only; no app, schema, bot, setting, or financial record changed. Recommendations are not implemented or accepted.

## 1. Assessment

The payment pipeline has substantial safeguards, but several edge cases can produce incorrect charges, inconsistent settlement displays, or receipts that cannot recover through the normal retry action. The highest priorities are consistent handling of future charge dates, selecting exactly one principal charge during closure, protecting financial history from deletion and unrestricted edits, and defining safe recovery after a partially completed payment.

The reported slowness is supported by live performance logs. Fifteen displayed payment additions on 12 September UTC took **14.336–18.536 seconds**, with a **16.141-second median**. By comparison, 77 displayed sync operations had a **1.320-second median**. One detailed 17.556-second payment operation spent **13.367 seconds inside the receipt-processing action**. This points first to the payment action chain and its repeated calculations and data operations, rather than general sync settings.

The strongest first step is a smaller, more efficient AppSheet payment pipeline using the existing stored snapshots and allocations. Moving historical analytics out of OLTP and avoiding recalculation of completed payment plans should also help. A transactional posting service could provide a larger long-term improvement, but it would change the system-of-record architecture and requires a separate design and approval. No speedup percentage is justified from this review alone.

### Priorities at a glance

| Priority | Finding | Evidence classification |
|---|---|---|
| High | F01: future charge dates can make final-charge interest negative | Formula inconsistency confirmed; live incident not reproduced |
| High | F02: closing a loan can assign its outstanding principal to multiple charges | Configuration-confirmed conditional defect |
| High | F03: closed-loan status can label an unpaid charge as paid | Formula behavior confirmed; current mismatched rows not audited |
| High | F04: parent deletion and legacy repayment deletion can remove financial history | Permissions and relationship weakness confirmed |
| High | F05: newly eligible charges can block a frozen payment plan's retry | Static recovery failure scenario |
| High | F06: an interrupted Processing receipt lacks normal recovery; its event is broad | Configuration weakness; no current stuck receipt established |
| High | F07: missed due-date execution can leave an obligation ungenerated | Date-filter behavior confirmed |
| High | F08: financial terms and charge amounts remain editable after activity | Configuration weakness; no unauthorized edit established |
| Medium | F09: first-day auto-receipt also matches manually added first-day charges | Broad event condition confirmed; business-intent dependent |
| Medium | F10: re-enabling automatic charges can include disabled days | Accrual behavior; pause-versus-deferral decision needed |
| Medium | F11: Closed Loan Principle includes principal repaid on active loans | Mathematical mismatch with metric name |
| Medium | F12: whole-baht receipt validation and decimal obligations can diverge | Precision policy inconsistency |
| Medium | F13: Quick sync requires validation with dependent balance calculations | Platform compatibility risk; stale display not reproduced |
| Medium | F14: operational access lacks row restrictions and financial-setting roles | Conditional access weakness; not public exposure |

“High” means material financial or workflow consequences in the stated scenario, not proof that the scenario has already occurred. This is a prototype review against the owner's documented business behavior, not an accounting or regulatory compliance assessment.

## 2. Scope, evidence, and limitations

### Evidence used

1. **Live generated app documentation**, inspected on 12 September, with a displayed generation time of approximately 22:52 Bangkok. This supplied table definitions, virtual columns, actions, views, slices, expressions, and permissions. [Current app documentation](https://www.appsheet.com/template/appdoc?appId=93844270-6aa5-420b-a960-bcdf08abd357).
2. **Live editor:** all seven bot event definitions, the receipt bot's execution options, the daily schedule, performance settings, and sign-in settings. Save and Undo remained disabled during the read-only inspection. [OLTP editor](https://www.appsheet.com/template/AppDef?appName=LoanManager-975338008-26-08-07&appId=93844270-6aa5-420b-a960-bcdf08abd357&quickStart=False).
3. **Live Performance Analyzer:** displayed operation summaries and one expanded payment trace. [Performance Analyzer](https://www.appsheet.com/manage/viewLog?perfOnly=true&appId=93844270-6aa5-420b-a960-bcdf08abd357).
4. Repository references: [business processes](../../Documents/archive/2026-09-20/OLTP_Business_Processes.md), [data-model overview](../../Documents/AppSheet_Data_Model_Overview.md), [payment migration runbook](../../Documents/archive/2026-09-20/Universal_Payments_Clone_Migration_Runbook.md), [production payment change notes](../../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md), and the [10 September integrity review](../oltp-integrity-review-2026-09-10/OLTP_INTEGRITY_REVIEW_2026-09-10.md).
5. Official AppSheet documentation, linked where relevant below.

The current configuration takes precedence over older design notes. The app-documentation page is a live link and may show a later version after future edits; the baseline and selected expression excerpts in this report preserve the review context. No raw borrower records, notification recipients, bank details, authentication data, or unrestricted app export are included.

### What was and was not verified

The review traced charge creation, daily scheduling, automatic first-day receipt, payment eligibility, snapshots, freezing, posting, reconciliation, retry, closure/default actions, relevant financial rollups, deletion/editing controls, and sync/security settings. It inventoried views and formatting but did not exhaustively exercise every screen, device layout, notification template, or recipient list.

No test payment, loan, deletion, notification, configuration save, or bot execution was initiated. Synthetic examples below illustrate expression behavior; they are not live AppSheet test results. This review did not repeat a full current-row integrity audit, test concurrent devices, simulate offline replay, or inject failures. The 10 September integrity report is useful historical evidence, not certification of today's ledger.

That earlier review reported reconciled receipt/allocation links and no duplicate-key or orphan findings in its inspected population. This is compatible with the conditional weaknesses identified here: ordinary transactions can reconcile while untested recovery and manual-edit paths remain fragile.

### Current application footprint

| Business table | Total columns | Virtual columns |
|---|---:|---:|
| Borrowers | 43 | 29 |
| Loans | 41 | 20 |
| Charges | 25 | 18 |
| Repayments | 16 | 5 |
| Payments | 23 | 9 |
| Payment Allocations | 19 | 5 |
| Statistics | 26 | 23 |
| Partners | 5 | 0 |
| Collection Bank Accounts | 10 | 3 |
| Collection Settings | 4 | 0 |
| **Total** | **212** | **112** |

The generated documentation's larger headline count of 22 tables and 596 columns includes internal/settings/process schemas. It should not be used as the business-data payload count. The document also inventories 80 actions, 41 views, 50 format rules, and three slices. Its legacy workflow-rule count does not describe the seven current Automation bots.

| Bot | Inspected trigger |
|---|---|
| Create First-Day Charge | Loans Adds; automatic charging enabled and supported daily loan type with positive applicable amount |
| Auto Receive First-Day Charge | Charges Adds; automatic charging enabled, supported daily type, charge date equals loan date, no payment and positive remaining amount |
| Generate Daily Charges | Daily 00:05, GMT+07 SE Asia, evaluated for qualifying Loans rows |
| Notification - New Loan Created | Loans Adds; no extra event condition |
| Notification - Loan Closed | Loans Updates; transition from not closed to closed |
| Notification - Charge Received | Payments Updates; transition from not Posted to Posted |
| Payments - Process Receipt | Payments Adds and Updates where Status is Processing |

The event panels inspected have security-filter bypass off. The receipt bot has **Trigger other bots on** and **Wait for execution to complete on**.

## 3. Correctness and configuration findings

### F01 — Future dates use inconsistent accrual boundaries

**High; static defect.** In Loans, `Last Interest Charge Date` filters related charges to `Charge Date <= TODAY()`. `Accrued Interest` uses that elapsed-day basis. However, `Create Final Charge` checks that accrued interest is positive, then calculates its new Interest Due using an unfiltered `MAX([Related Charges][Charge Date])`:

```text
[Current Daily Interest]
* IF(
  ISBLANK(MAX([Related Charges][Charge Date])),
  FLOOR(TOTALHOURS(TODAY() - [Loan Date])/24),
  FLOOR(TOTALHOURS(TODAY() - MAX([Related Charges][Charge Date]))/24)
)
```

With synthetic today = 12 September, daily interest = 100, the last nonfuture charge = 11 September, and a future charge = 20 September, the guard can see accrued interest of +100 while the assignment evaluates to **−800**. This is different from the owner's intentional negative-interest default adjustment.

The daily-installment generation expressions also use a maximum related charge date and elapsed days. Future manual or pregenerated dates deserve the same boundary check; a future maximum can create a negative interval when the remaining generation guards allow execution.

**Recommendation:** establish one governed accrual cutoff and use it consistently in the eligibility condition and assigned amount. Define what a future-dated charge covers before deciding whether it should suppress, replace, or coexist with current accrual. Do not merely clamp the final result to zero and hide an incorrect date basis.

**Clone checks:** no prior charge; ordinary prior charge; future-only charge; mixed past/future charges; existing charge today; automatic charging disabled; installment due date. Verify both generated amount and date.

### F02 — Closure can schedule the same principal more than once

**High; conditional defect.** The close sequence targets today's related charges for principal addition. `Add Outstanding Principal to Charge` runs on qualifying daily-interest charges with Principal Due = 0, and assigns the loan's full Outstanding Principal. There is no inspected rule guaranteeing that exactly one such charge exists on that date.

Two synthetic interest-only charges today, with loan outstanding principal of 1,000, can therefore each receive Principal Due = 1,000. The action creates obligations; it does not reduce loan outstanding principal through a repayment between those assignments. Existing unpaid principal obligations on other dates are another case needing reconciliation before adding principal again.

**Recommendation:** designate exactly one closure-principal target and reconcile principal already scheduled but unpaid. Closure should not depend on an implicit one-charge-per-date assumption when manual charges can violate it. Do not enforce universal date uniqueness without checking legitimate manual adjustments and the default workflow.

**Clone checks:** zero, one, and two charges today; existing unpaid principal on an earlier or future charge; partial principal already paid; repeated close action; simultaneous close/payment attempt. Total new principal obligation must match the intended remaining principal exactly once.

### F03 — Charge status can hide a remaining balance

**High; formula behavior confirmed.** `Charges[Payment Status]` starts with:

```text
IFS(
  [Ref Loans].[Loan Status] = "ปิดยอดแล้ว", "ชำระแล้ว",
  [Total Paid] = 0, "รอชำระ",
  [Amount Remaining] > 0, "ชำระบางส่วน",
  TRUE, "ชำระแล้ว"
)
```

A closed loan therefore labels its charge paid even if that charge has a positive remaining amount. The close action includes balance safeguards, which is good; later edits, an added charge, or removal of a legacy repayment can still create this contradiction. Collection visibility and the Statistics pending-amount calculation can then disagree because they do not all use the same status basis.

The same expression has no explicit overpaid state: a negative remaining balance falls through to paid. A zero-due/zero-paid charge on an active loan is classified pending. Unclamped negative remaining amounts can also offset positive amounts in aggregate totals.

**Recommendation:** separate loan lifecycle from charge settlement. Define paid, partial, unpaid, overpaid, zero-value adjustment, and default/write-off treatment from the intended posted amounts. Preserve the documented default-loss convention; do not relabel its intentional negative interest as an error. Display exceptions instead of hiding them through loan status.

**Clone checks:** closed loan with a later positive charge; reduction or removal of a historical repayment; overpayment; zero-value default adjustment; reconciliation between collection rows and pending totals.

### F04 — Deletion paths can remove financial history

**High; configuration weakness.** Borrowers has a prominent confirmed Delete action without a restrictive Only-if expression and has ALL_CHANGES permission. The relationship chain includes IsAPartOf ownership from Loans to Borrowers, Charges to Loans, Repayments to Charges, Payments to Borrowers, and Payment Allocations to Payments. A parent deletion can therefore reach financially material child records.

Loan and charge deletion guards check for Payment Allocations. That protects the new payment path but does not fully cover historical repayments without payment/allocation links. Repayments Delete and Edit allow the historical case where Ref Payment is blank. This legacy compatibility is intentional, but it leaves financial history less protected than newly linked receipts. A confirmation prompt is not an audit trail or a balance-preservation control.

**Recommendation:** prevent routine deletion of parents with financial history; use archive/inactive state and explicit reversal or adjustment where appropriate. Review all parent and direct-child paths together, including API/database permissions. Keep any cleanup exception narrow and separate from everyday actions.

**Clone checks only:** parent with legacy repayments; parent with posted receipts; unposted empty setup; child deletion; direct table versus grouped action. Do not test deletion against live borrower records.

### F05 — Frozen plans depend on changing eligibility during retry

**High; recovery scenario.** Snapshot creation is blocked once allocations are frozen or repayments exist. This preserves the audit plan. However, `Payment - Post Plan` and `Payment - Reconcile` also require:

```text
COUNT(
  [Eligible Charges]
  - SELECT(Payment Allocations[Ref Charge],
           [Ref Payment] = [_THISROW].[Row ID])
) = 0
```

Eligible Charges is computed from current charge balances and the receipt's method/date scope. If plan A is frozen, then a newly added backdated charge B becomes eligible before completion, retry cannot add B to the frozen plan, yet the above condition rejects the existing plan. A changed current balance can also cause a per-allocation post guard to stop remaining rows after earlier rows have posted.

The conservative refusal to post inconsistent amounts is useful. The weakness is that ordinary retry does not provide a complete recovery path for these cases.

**Recommendation:** explicitly define whether eligibility is fixed at plan creation or must remain current through posting. Preserve the original frozen plan and actual postings. Provide supervised resume, exception resolution, or auditable replacement/reversal; never delete partial history to make retry pass. Distinguish an unstarted receipt from a partially posted one.

**Clone checks:** add an eligible charge after freeze; reduce a charge after freeze; fail after first of several postings; retry twice; verify exactly one repayment per positive allocation and no false Posted status.

### F06 — Interrupted Processing state can block the borrower

**High; operational weakness.** The receipt event accepts every Add or Update whose resulting Status is Processing, rather than only a creation or controlled retry transition. The retry action requires Error and no other Processing receipt. Borrower-level guards also block new receipts and certain close/default operations while Processing exists. The seven-bot inventory contains no processing-timeout recovery bot.

If execution stops before reconciliation updates the status, a receipt can remain Processing outside the normal retry path. Meanwhile, the inspected payment Delete condition allows a non-Posted receipt with no repayments, including Processing. Deleting an in-flight request is an unsafe recovery substitute.

**Recommendation:** add a documented exception procedure first. Establish whether execution is still running, inspect frozen rows and actual repayments, then reconcile or transition to a controlled retry state. Tighten event transitions and prevent in-flight deletion. Do not implement a blind timer that starts a second worker while the first is still active.

The count-of-Processing guard is not an atomic borrower lock across every possible writer. AppSheet documents serialization of normal client requests and row-level last-writer behavior, so this report does not assert that ordinary simultaneous taps necessarily double-post. Cross-app/API writes, offline replay, and failure recovery still need explicit tests. [AppSheet concurrent usage](https://support.google.com/appsheet/answer/10104702?hl=en).

### F07 — Date-equality scheduling lacks complete catch-up behavior

**High; static scheduling weakness.** Generate Daily Charges runs at 00:05 Bangkok. Fixed-loan generation requires Due Date = TODAY(). A missed due-date run is not caught by the same ordinary condition on the following day. The installment branch also depends on a nonblank latest charge date and TODAY() not exceeding Due Date; a missing first charge or missed final-date generation can leave no normal recovery route. Daily-interest accrual has more catch-up capability because it can aggregate elapsed days, but its interval condition can postpone recovery to a later eligible run.

**Recommendation:** identify ungenerated scheduled obligations as of a defined date, retaining the obligation's original scheduled date and a repeat-safe identity. Do not simply replace equality with <=: that can generate duplicate obligations every day unless completion is checked at the same grain. Provide a previewable catch-up operation for a missed schedule.

**Clone checks:** skip a due-date run; rerun the same date; restart one and several days later; month boundary; missing first installment; final installment after due date; manual charge already covering the period.

### F08 — Terms and charge edits can invalidate previously posted calculations

**High; configuration weakness.** Inspected loan terms—including principal, loan date/type, payment interval, due date and applicable rate/payment fields—do not have lifecycle-dependent edit locks. Charge dates, amounts, and loan references similarly lack comprehensive posted-activity locks. Principal Due validation enforces a nonnegative amount but does not prevent reducing it below principal already received.

Such edits can change future calculations, move a charge's scope, or produce negative remaining amounts without an auditable amendment. This also feeds F03 and F05. General form validation does not by itself preserve historical meaning after payment activity.

**Recommendation:** distinguish corrections before activity from intentional amendments after activity. Preserve legitimate owner-approved rate/schedule changes through effective dates or explicit adjustments. Lock only fields and states that would silently rewrite posted history; do not blanket-disable the prototype's intended flexibility.

**Clone checks:** edit principal and loan type after a payment; move a paid charge to another loan; reduce due below paid; change terms with a frozen receipt; legitimate prospective rate change.

### F09 — First-day auto-receipt matches manual same-day charges

**Medium; intent-dependent weakness.** Auto Receive First-Day Charge matches supported daily loans when automatic charging is enabled, Charge Date equals Loan Date, Payment Count is zero, and Amount Remaining is positive. It does not distinguish the bot-created opening charge from an additional manual charge using the same date.

The intended initial net-off is supported by the documented workflow and is not a defect. A manually added or backdated extra charge can nevertheless enter the same automatic receipt path without an explicit net-off decision.

**Recommendation:** distinguish the intended opening charge or make automatic receipt eligibility explicit. A new physical origin field is only one option and requires approval; first examine whether the existing creation context can safely identify the intended row. Test two opening-date charges and automatic-charging-off cases.

### F10 — Automatic-charge flag does not record a paused accrual period

**Medium; business-rule clarification.** Auto Charge Enabled stops automatic generation. Re-enabling it can calculate elapsed days since the last covering charge, including days while the flag was off. There is no inspected effective-period history attached to that flag. Existing manual-charge procedures can cover the interval, but the switch alone does not mean “forgive interest while disabled.”

**Recommendation:** define whether disabled means manual administration, deferred generation, or a true interest pause. Show a catch-up preview on re-enable. Add period tracking only if a true pause is required; do not infer a write-off from a toggle.

### F11 — Closed Loan Principle mixes closed and active loan principal

**Medium; reporting logic.** Borrowers' `Closed Loan Principle` is Total Amount Loaned minus Total Outstanding Principal. That difference includes principal already repaid on active loans. A return measure using only closed-loan profit over this denominator therefore does not measure closed-loan return consistently.

Synthetic example: one closed loan originally 1,000 with profit 100, plus one active loan originally 1,000 with 400 principal repaid. The expression produces 2,000 − 600 = 1,400 and a return of 7.14%, while the closed loan alone gives 10% on 1,000.

**Recommendation:** confirm the desired denominator. If it means closed loans, aggregate that population explicitly. If it means all recovered principal, rename the metric and align its numerator. This historical analysis is a good candidate for OLAP ownership.

### F12 — Receipt and obligation precision are inconsistent

**Medium; policy weakness.** Payments requires a positive whole-number receipt, while some noninstallment principal/interest inputs can retain decimals. A Price field displayed with zero decimal places does not necessarily enforce integer storage. This can make the exact remaining amount impossible to enter through a validated manual receipt form, while action-generated receipts follow a different path.

**Recommendation:** choose and document the prototype's precision policy. Either enforce/round obligations at the appropriate creation boundary with an explicit residual rule, or allow receipts at the supported precision. Test fractional final balances, partial payments, and full-receipt actions against the same rule.

### F13 — Quick sync must be checked against dependent totals

**Medium; compatibility risk.** Quick sync is on, and the app has many cross-row balances and aggregations. AppSheet advises against Quick sync where virtual columns require a complete sync for correct computation. This does not prove today's totals are stale, but the app's dependency structure makes it an important two-device test. [Quick sync guidance](https://support.google.com/appsheet/answer/13865312?hl=en).

**Recommendation:** compare charge, loan, borrower, and dashboard values on a second device after a receipt posts, then after full sync. Base workflow decisions on validated server state, and decide the setting from results rather than switching it off as a presumed bot-speed fix.

### F14 — Access controls do not separate financial maintenance roles

**Medium; conditional access weakness.** Google sign-in is required and Allow all signed-in users is off. This is not a publicly open app. However, all ten inspected tables have no security filter and access data as the app creator. Seven operational tables, including Statistics, have ALL_CHANGES; Partners is read-only, Collection Bank Accounts permits adds/updates, and Collection Settings permits updates. No inspected financial-setting edit condition establishes an owner-versus-operator role boundary.

**Recommendation:** if every authorized user is intentionally a trusted owner, document that assumption. If collectors/operators have narrower duties, restrict financial terms, historical edits, deletion and collection-account settings accordingly. A slice or hidden view is not a substitute for a data-access boundary. Any row filtering must preserve the complete charge/payment context needed for allocations and reconciliation.

## 4. Existing safeguards to preserve

The new receipt design is considerably stronger than simply adding a repayment and treating its existence as paid:

- Frozen allocation amounts preserve the intended plan, with interest-first allocation and the documented **newest-first** charge ordering. Newest-first is intentional and is not flagged as a bug.
- Per-allocation posting checks positive allocated amount, frozen order, component totals, borrower consistency, existing repayment links, and remaining charge capacity.
- Reconciliation compares receipt amount, allocation amount, repayment components, row counts, distinct allocation references and cross-links. Matching a total alone is insufficient, and the current checks reflect that.
- Linked repayments have stronger edit/delete restrictions than legacy repayments.
- The latest close check uses due and repayment sums; loan closure is not based solely on the existence of a payment row.
- Posted-receipt and loan-closed notifications use transitions, reducing duplicate notifications from ordinary subsequent edits.
- Intentional default loss entries, initial net-off behavior, zero-allocation snapshot rows, and legacy blank payment links are recognized design choices. They must not be removed merely to simplify the review findings or speed up a bot.

## 5. Measured performance

### Observation window and sample limits

The analyzer query covered **5 September 15:56:51 UTC through 12 September 15:56:51 UTC**. Its maximum raw-log examination limit was 1,000 and 408 operation rows were displayed. The date-filtered sample below contains 125 displayed rows whose UTC date was 12 September. That corresponds to 07:00 through the query cutoff of approximately 22:56 Bangkok, not a complete Bangkok calendar day or an exhaustive seven-day log export.

| Displayed operation, 12 September UTC | Count | Median | Minimum | Maximum |
|---|---:|---:|---:|---:|
| Payments Add, nonpreview, Success | 15 | **16.141 s** | 14.336 s | 18.536 s |
| App sync, 75 nonpreview + 2 preview | 77 | **1.320 s** | 0.897 s | 3.554 s |
| Charges Edit | 3 | 0.847 s | 0.754 s | 0.888 s |

Mean payment-add duration was 16.274 seconds; mean displayed sync duration was 1.483 seconds. No failures were shown in the 125-row subset. This is not a claim that no failures occurred outside it.

There were also 15 receipt-bot and 15 notification summary entries displaying 0.000 seconds. These summary rows are not evidence of zero execution cost. Two older displayed Loans additions took 18.756 and 23.622 seconds. One timed scheduled-process entry took 7.973 seconds; that single entry cannot establish the duration or reliability of the entire daily run.

### One expanded payment trace

At **12 September 14:46:20 UTC / 21:46:20 Bangkok**, a Payments Add took **17.5556 seconds**. The nested trace contained a 4.1763-second internal add stage and a 13.3764-second downstream event-handling stage. Inside the latter, the grouped receipt action took **13.3672 seconds**:

| Sibling receipt-action stage | Duration | Share of grouped action, approximate |
|---|---:|---:|
| Payment - Create Snapshots | 4.4539 s | 33.3% |
| Payment - Freeze Plan | 2.8033 s | 21.0% |
| Payment - Post Plan | 4.4616 s | 33.4% |
| Payment - Reconcile | 1.2425 s | 9.3% |
| Payment - Close Paid Loans | 0.4058 s | 3.0% |

These are sibling stages. Parent spans must not be added to their children when calculating total duration. Attribution comes from this one sample, not all 15 payments.

The trace also showed broad table reads, repeated one-row Payments reads, and repeated Payments virtual-column calculation. One Payments virtual-column batch lasted approximately **1.853 seconds**; other batches were about 0.442 and 0.494 seconds. These are diagnostic clues, not independent additions to the table above. Eligibility calculations and cross-table borrower/charge dependencies appeared in the trace.

**Interpretation:** initial write overhead matters, but most of this sampled operation was downstream receipt processing. Snapshot creation and posting together account for about two thirds of the grouped action. A general sync-setting adjustment cannot be assumed to eliminate that work. AppSheet recommends using its analyzer to isolate expensive bot steps and notes that expressions involving other rows/tables can increase processing cost. [Improve bot performance](https://support.google.com/appsheet/answer/11918582?hl=en).

### Why this structure can become slower as history grows

Payments' Eligible Charges performs current-state selection even for historical receipts. Allocation helper calculations rank and sum candidate allocations. Freeze and post conditions repeat borrower-processing counts, plan sums and completeness checks. Reconcile repeats a large success predicate for both Status and Processed At. Each payment traverses several actions and related-row writes, while loan/charge/borrower rollups and OLTP analytics contribute dependencies.

These patterns plausibly amplify work with more history and more eligible charges per borrower. The exact marginal cost has not been isolated. The 112 virtual columns alone are not a performance diagnosis: formula dependencies and evaluated row populations matter more than the headline number. [AppSheet performance concepts](https://support.google.com/appsheet/answer/10105761?hl=en).

## 6. Performance improvement opportunities

### P01 — Stop recomputing historical payment plans

**First experiment; existing schema may suffice.** Inspect every dependency of Eligible Charges and the calculated allocation helpers. After a receipt is safely finalized, display its historical context from its stored allocation/repayment links rather than rescan current eligible charges. Where Allocation Order indicates a frozen row, use its stored frozen components instead of recalculating its rank and allocation prefix.

Preserve the calculations needed during snapshot creation, partial freezing, Error recovery and reconciliation. Do not introduce a circular dependency between calculated and stored values, or make all Error rows skip calculations without classifying their recovery state.

**Expected benefit:** less repeated work as completed receipts accumulate; plausible impact on both write-time virtual calculations and sync. **Evidence needed:** before/after trace with identical data and receipt shape, including interrupted/frozen receipts.

### P02 — Reduce repeated scans inside the receipt pipeline

**First experiment; preserve financial checks.** Use payment-scoped related lists and explicit action context where available, rather than repeatedly rediscovering the current Processing payment using table-wide COUNT/ANY expressions. Calculate stable stage invariants once where AppSheet semantics safely permit it. Review duplicate checks in Only-if and Referenced Rows and the repeated reconciliation predicate for Status and Processed At.

Keep checks that protect against data changes between stages: one repayment per allocation, matching borrower/charge, current remaining capacity, and final full reconciliation. Removing those checks to obtain a faster trace would weaken the design.

**Expected benefit:** smaller snapshot/freeze/post/reconcile costs, especially for borrowers with many charges. No particular SELECT-to-Ref rewrite is guaranteed faster; compare actual trace results.

### P03 — Separate operational totals from historical analytics

**Recommended architectural cleanup within the current app split.** Statistics has 23 virtual columns; Borrowers has 29 and Loans 20. OLTP includes historical profit/return measures, forecast calculations and repayment/principal-day dependencies. Move the analysis-oriented definitions and dependencies to Loan Business Insights, retaining the smallest set of current balances and indicators needed for collection and validation.

Hiding a view is insufficient if its columns still exist and are evaluated by dependent expressions. Trace action, label, format-rule, slice and virtual-column consumers before removing an OLTP definition. Preserve governed metric meaning and OLAP/downstream reconciliation.

**Expected benefit:** lower background calculation and improved scaling. The measured sync median is already much lower than receipt latency, so this cleanup alone should not be promised to reduce a 16-second receipt to one second.

### P04 — Review snapshot row volume and action fan-out

The existing plan creates snapshots for eligible charges, including zero allocations where the receipt is exhausted. The 10 September historical audit reported 34 zero allocations among 143 allocations; that is a prior dataset observation, not today's ratio. Such rows support current completeness semantics.

A redesign could identify the deterministic allocation prefix once and write only required detail, while retaining evidence of the eligibility boundary. That can reduce repeated row operations for borrowers with many open charges. It is a plan/recovery redesign, not a safe “delete zero rows” optimization. Compare narrow single-charge receipts, small lump sums over many charges, and loan-close receipts separately.

### P05 — Keep notification latency separate from posting latency

The current receipt chain triggers other bots and waits for execution. The sampled trace establishes expensive posting stages; it does not isolate a large notification-delivery cost. Measure that cost before blaming notifications.

Noncritical notification delivery could be decoupled from the posting response, with exactly-once intent or repeat-safe delivery tied to a confirmed Posted transition. Turning off waiting may reduce response latency without reducing total work. The UI and any consumer must distinguish receipt accepted, still Processing, and successfully Posted; a successful add response is not sufficient financial confirmation.

### P06 — Treat sync settings as a UX/freshness decision

Current settings: Server caching on; Delta sync off; Quick sync on; Sync on start on; Delayed sync on; Automatic updates on.

**Delayed sync on does not mean this app always waits for a manual sync:** with Automatic updates also on, AppSheet documents immediate/background submission behavior. Offline-to-online recovery can still defer submission. Measure tap-to-server arrival separately from server processing before attributing a user's delay to this setting. [Offline and sync settings](https://support.google.com/appsheet/answer/10107724?hl=en).

Quick sync needs the F13 correctness check. Delta sync may be evaluated later on a clone against this AppSheet Database configuration and its dependencies. Server caching primarily benefits rarely changed read-only data, so it is not a cure for write-heavy receipt chains. Do not switch these settings together; that would obscure cause and effect.

### P07 — Bound the operational dataset only with complete balance context

Security filtering or archiving could reduce history evaluated by OLTP as the dataset grows. A simple recent-date filter is unsafe: old repayments and charges can still determine current outstanding principal, payment eligibility and audit links. Any working-set design must include all obligations and receipts required for each active loan/borrower, or use reconciled opening balances with a documented cutoff.

Review unnecessary reverse-reference and display dependencies too, including effective collection-bank-to-borrower references that pull in broader borrower calculations. Optimize only after identifying their actual consumers; a small settings table is not necessarily the dominant cost.

### P08 — Make schedule catch-up efficient and observable

After correcting F07, compute the due population from explicit next obligation/completion state where feasible. Avoid scanning and recalculating every historical loan unnecessarily. Record or expose which obligations were generated, skipped, or failed so a missed run is distinguishable from a legitimately empty run.

Parallel work across independent loans may be useful, but do not fan out simultaneous writers for the same borrower/receipt. Faster scheduling must preserve repeat-safe charge creation and the opening-charge-to-receipt chain. AppSheet also imposes execution limits on automation; a sampled successful run is not a capacity guarantee. [Troubleshoot bots](https://support.google.com/appsheet/answer/11547467?hl=en).

## 7. Fundamental structural options

| Option | Change | Potential benefit | Main cost or risk | Assessment |
|---|---|---|---|---|
| A. Lean existing AppSheet pipeline | Reuse frozen state, reduce repeated scans, move analytics out of OLTP | Meaningful reduction in repeated receipt work without changing the system of record | Dependency and recovery regression risk | **Recommended first**; benchmark before larger migration |
| B. Materialized balances and a lean automation app/process boundary | Maintain validated current balances/next-obligation state; evaluate a small worker app over the shared database | Avoid rebuilding current state from all history for each operation | New fields/app ownership, stale summaries, cross-app event routing and multiple writers | Consider after A; needs dependency design and approval |
| C. Transactional posting service with authoritative transactional storage | Compute plan once; batch and commit ledger writes atomically; notify after commit | Strongest potential reduction in repeated row round trips and better failure/concurrency handling | Major system-of-record migration and operational responsibility | Appropriate if scale/latency requirements exceed measured AppSheet capability |

### Option B: materialization is a consistency design

Stored current balances can make operations cheaper, but they must be updated by every permitted payment, reversal, adjustment and historical correction. Define the authoritative ledger, the summary's as-of cutoff, reconciliation checks, failure handling and rebuild procedure. A scheduled total that is merely “usually current” is not sufficient for payment capacity checks.

A separate lean worker app is worth investigating because automation need not inherit the full operational/reporting expression graph. However, sharing a database does not by itself establish correct bot routing across apps. There must be one explicit posting entry point and no duplicate workers. This report does not assume a transparent move of existing bots would work.

### Option C: a database swap alone is insufficient

A substantial redesign would submit one receipt command with an idempotency identity, obtain an appropriate borrower/loan concurrency guard, calculate the ordered allocation once, and commit receipt status plus repayment/allocation writes in a transaction. A post-commit notification queue would separate delivery failures from financial posting.

AppSheet would remain the operational interface, with explicit queued/processing/posted/error feedback and repeat-safe submission. The transactional store would need to become the single authoritative source for the affected ledger, with a governed integration for OLAP and other consumers. Maintaining two independently editable financial truths would undermine the benefit.

This changes the current shared-AppSheet-database ownership model. It requires a separate approved design covering keys/Refs, existing legacy repayments, defaults, reversals, backdated charges, permissions, migration reconciliation, rollback and service operations. No existing collection service is assumed to be authorized for this responsibility.

## 8. Recommended sequence and acceptance checks

No implementation is authorized by this report. If development is commissioned, first record the then-current AppSheet version and create a safe test clone/dataset. New physical fields or tables require the project's explicit approval and dependency justification.

1. **Protect correctness and recovery:** resolve F01/F02 date and principal-generation behavior; define frozen-plan recovery; close destructive/editing gaps without breaking intentional legacy/default workflows.
2. **Benchmark A:** test P01/P02 independently, then remove OLTP analytics dependencies under P03. Use identical synthetic workloads and compare complete receipt confirmation time, not just the API response.
3. **Improve scheduling and freshness:** add repeat-safe catch-up behavior, test Quick sync on a second device, and distinguish local submission delay from server execution.
4. **Choose a structural option from measured results:** establish acceptable median/tail latency and expected borrower/charge volume before funding materialized balances or transactional migration.

### Correctness test matrix for a clone

| Area | Required scenarios | Acceptance evidence |
|---|---|---|
| Ordinary receipts | Full, partial, lump sum, single charge, loan close | Amount received = frozen allocated total = posted principal + interest; exact links/counts |
| Allocation order | Several charges with equal and different dates; receipt exhausted partway | Documented newest-first and interest-first behavior preserved |
| Recovery | Failure before freeze, midway through freeze, after first posting, before reconciliation | No duplicated repayment; safe resume or explicit actionable exception |
| Competing changes | Two clients; offline replay; eligible charge added or edited during processing | No silent over-allocation or permanent unexplained borrower lock |
| Charges and close | Future dates; multiple charges today; existing scheduled principal; repeated close | Correct accrued amount and one intended principal obligation |
| Schedule | Missed first/final/due-date run; same-date rerun; catch-up | Correct original obligation date, amount and no duplicate charge |
| Default/legacy | Intentional negative default interest; historical blank payment links | Existing prototype meaning and audit reconciliation retained |
| Precision/status | Fractional remainder; zero value; overpaid; closed with later charge | Explicit, consistent settlement and remaining amounts |
| Permissions | Owner versus operator; parent delete; paid-term edits; in-flight delete | Only intended operations allowed, with financial history preserved |
| Freshness/notifications | Second device after posting; full sync; repeated metadata update | Consistent totals and no duplicate business notification |

### Performance benchmark design

Use a clone with small, medium and larger synthetic histories. Vary eligible charges per receipt independently from total history. Include single-charge receipts, small lump sums across many eligible charges, full multi-loan receipts, first-day creation and loan closure. Record dataset size, receipt shape, app version, cold/warm state and device/network conditions.

Measure server add duration; snapshot/freeze/post/reconcile durations; total time until verified Posted; sync duration; row-operation counts; and failures/retries. Compare medians and upper-tail durations over repeated identical scenarios. Do not compare a warm single-charge receipt with a cold multi-loan receipt or claim statistical tail performance from a handful of runs.

Correctness checks must pass alongside faster timings. Removing reconciliation, weakening borrower guards or returning earlier while work continues is not evidence of faster completed posting.

## 9. Review completion and rollback

**Completed:** current configuration and bot-event review, selected dependency tracing, performance-log analysis, prioritized findings, structural options and proposed clone tests.

**Not performed:** implementation, production testing, ledger correction, exhaustive current data reconciliation, permission changes, notification delivery, or production deployment. No recommendation has passed live acceptance testing.

The live app remained at **3.000045**; this is an observed baseline, not a newly created data backup. No live rollback is required because nothing was changed. The report and its [change log](../../Change%20Logs/CHANGE_NOTES_OLTP_ANALYSIS_REVIEW_2026-09-12.md) are the only task deliverables. Data-model overview and dictionary updates are unnecessary for this analysis-only task because the model was not changed.

For a future implementation, record the current version before editing, update the applicable model documents and change log, and retain an explicit recovery plan for any financial-data effects. Restoring an app definition alone does not reverse posted records.
