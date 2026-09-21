# R014 — Cash visibility and partial settlements

Date: 21 September 2026. Status: DEV complete, awaiting owner acceptance. Production promotion is not authorized.

## Scope and owner decisions

- OLAP Cash Position / manual Cash Ledger form: remove inline creation of bank/cash accounts from the account selector.
- OLTP Business Cash Held: account balances grouped by account owner, with summed owner balances.
- Dashboard Income MTD: retain operating income, negative expenses, net profit, negative current-month profit withdrawals to Tommy and Lisa personal accounts, current-month unsettled profit, remaining cash pool and total business cash held. Use concise English/Thai names. Owner's latest color decision: green income, red expenses/withdrawals, blue balances.
- Owner confirmed monthly unsettled profit means current-month net profit less completed withdrawals allocated to that month.
- Owner confirmed partial settlement accepts a positive amount up to Available to settle, leaving the remainder for later.
- Owner clarified FIFO: settlements start with the first business month and consume earlier unpaid profit before later months, independently per partner. No Profit Month field is required.

## Rollback and starting evidence

- Starting Git commit: `343800da2e9bddc7a8890ff808dfecdb95f7de70`; working tree clean before this task.
- DEV OLAP editor verified app ID `9f3422be-bc87-4a5a-a42a-67528ee80393`, saved version `1.000021`, Deployed, before edits.
- DEV OLTP verified `500b27b6-884a-41e8-a9ec-df801b0110ad`, saved version `1.000064`, Deployed, before edits.
- Database target verified: shared instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database `loan_manager_dev`, initially V30. Private pre-change custom dump and archive validation are recorded in [backup evidence](../outputs/r014-20260921/backup.json).

## Completed DEV implementation

- OLAP Cash Accounts update mode now uses `IF(OR(CONTAINS(CONTEXT("View"), "Cash Ledger"), CONTEXT("View") = "Cash Position"), "UPDATES_ONLY", "ADDS_AND_UPDATES")`. Saved at 1.000022. Current GUI: Cash Position > Record Cash Transfer > Dad > From Account lists existing accounts without New; separate Cash Accounts retains Add. Unsaved test form discarded.
- Added prominent partner action `Settle Exact Amount`, opening `LINKTOFORM("Settlements_Form", "Ref Partner", [Row ID], "Settlement Date", TODAY(), "Status", "Pending")`, conditional on `[Available to Settle] > 0`, with bilingual display `"ระบุยอด / Set Amount"`. Existing settle-all action and Amount validation retained. Initial display-label syntax issue was corrected; final GUI validation, exact-amount reservation and audited cancellation passed.
- V31 adds read-only `Cash Dashboard` and immutable arithmetic helper `fifo_current_month_settled`; no base columns, financial records, triggers or existing views changed. DEV migrated and validated. Isolated 31-migration rebuild, repeat no-op, checksum rejection and 12 FIFO boundary/independence assertions passed. `baselineRebuildMatch=False` is the runner's no-baseline-comparison flag, not a failed assertion.
- FIFO uses historical per-repayment rounded partner shares and allocated expenses, completed settlements with transfer date through the Bangkok reporting date, and prior-month net entitlement. Pending/cancelled settlements are excluded from withdrawals. Tommy is existing role A, Lisa role B, verified in DEV. Current-month net and expenses retain their signed values; no artificial positive clamp hides losses. Positive initialized account custody is summed; unknown openings remain unavailable.
- Live read-only SQL dashboard reconciliation passed: net = income + signed expenses; unsettled = net + signed partner withdrawals; both withdrawal signs nonpositive. Four initialized account balances reconcile to owner groups. Measured dashboard query execution 3.578 ms at this checkpoint.
- OLTP imports existing `Cash Account Balances` read-only: explicit Ref Cash Account key, Account Label label, Cash Accounts/Cash Holders references, currency columns. Business Cash Held now uses it, grouped by Holder Name with SUM :: Current Balance, Account Label primary header and Current Balance secondary. The former unused slice is retained. Generated holder reverse-reference is documented.
- OLTP imports new `Cash Dashboard` read-only: hidden stable Row ID key; eight Price fields, ฿ with zero decimals. New reference Detail view Income MTD uses Normal display, source-order columns, no desktop multicolumn. Dashboard entries are KPIs Small, Income MTD Tall, Business Cash Held Tall. The former MTD header and three metrics are removed from KPIs; other KPIs are retained.
- Three TRUE format rules target exactly two income fields (`#188038`), three expense/withdrawal fields (`#d93025`) and three balance fields (`#1a73e8`). Saved selections were read back. The 360 × 640 current-editor phone preview visually fits all labels/amounts and shows the expected colors. Desktop load/sync and owner/account totals passed.
- Final saved versions after editor reload: **OLTP 1.000070 / OLAP 1.000024**, both Deployed and **No issues found**. No pending unsaved change.
- Documentation: 19 R014 DEV differences appended to the data dictionary, prior values/formulas preserved; model overview, environment inventory, open development differences, tracker and database checkpoint updated. SQL changes are additive and do not alter existing export/Looker sources, integrations or notification routing.

## Checks and remaining work

R014 reservation published at `62ad5b2`. [DEV report](../outputs/r014-20260921/REPORT.md) records tests, limitations and recovery; [manifest](../outputs/r014-20260921/release-manifest.json) ties saved versions and migration hashes to Git. The synthetic ฿100 Pending settlement was audited to Cancelled with its amount and note retained, no cash-ledger effect, and restored availability. No completed transfer or forced notification was performed.

DEV development is complete. Remaining release work: owner acceptance and scoped production authorization, master promotion checklist, exact-commit SQL promotion preparation, frozen PROD-mapped RCs, App Upgrade and basic PROD validation. Physical-device/offline and separate-login tests remain unperformed; unchanged concurrency guards retain earlier evidence. No PROD changes or promotion performed.

Implementation checkpoint `59a9876` contains the tested V31 bytes and app/documentation evidence. The maintained `New-Release.ps1` runner revalidated DEV from that clean commit and generated [the pinned Flyway manifest](../outputs/r014-20260921/flyway-release.json). Final evidence publication is recorded by normal Git history/upstream verification; no R014 production tag is created before promotion.

## Owner refinements — 21 September

Rollback for this coherent app-only batch: Git `f1f15a4`, DEV OLTP 1.000070 and OLAP 1.000024, verified before editing. SQL V31 and financial data are unchanged.

- Extended OLAP Cash Accounts update-mode expression to include `CONTAINS(CONTEXT("View"), "Settlements")`. The running Settlements Form Paid From Account picker no longer offers New. The test form was cancelled without saving.
- Both Borrowers views now group by lightweight Text VC `Borrower Activity Group`, formula `IF([Has Active Loan], "Active / มีสินเชื่อ", "Inactive / ไม่ใช้งาน")`, ascending. Display name is `"สถานะ / Status"`. Existing activity flags remain authoritative. OLTP retains Visible Borrowers filtering; OLAP retains its Borrowers source. Secondary header changes from Total Amount Loaned to Total Outstanding Principal. Existing row sort and interest summary remain. No base table/column is added.
- Reviewed all 61 OLTP and 66 OLAP views. Set Slideshow mode FALSE in all 25 OLTP and 23 OLAP detail views: 44 changed, four already disabled. Every exposed Row Swiped Left/Right event was already Auto assign (None). Exact coverage is in [refinements.json](../outputs/r014-20260921/refinements.json). AppSheet detail slideshow controls previous/next record navigation; device/browser edge-back gestures are outside these app settings.
- Saved-state checks caught an OLAP group selection mismatch during configuration; it was corrected to Borrower Activity Group and saved before acceptance checks.
- Final DEV versions **OLTP 1.000072 / OLAP 1.000028**, both Deployed, saved and No issues found. Mobile preview checked active-first/inactive-later grouping and absence of previous/next arrows in borrower detail. Physical-phone touch gestures were not exercised. Original SQL/settlement arithmetic evidence remains valid because its dependencies are unchanged.
- Updated dictionary DEV differences, model overview, inventory, tracker, development differences and release manifest. No notifications, financial writes, Looker changes or production changes in this refinement.

## Forecast review and isolated trial — 21 September

Owner requested review of daily/monthly interest forecasts using existing loans and entered arrangements, with before/after results before implementation. [Review and methodology](../outputs/r014-20260921/forecast-review.md) records a proposed payment-date schedule, separate arrears, explicit daily labels, current-type/interval/anchor rules and loaded-plan precedence. Bounded PROD V30 and DEV V31 snapshots were read in READ ONLY REPEATABLE READ transactions; the trial ran locally with Decimal arithmetic. Baseline totals reconcile, both runs have zero projection diagnostics, and 25 synthetic boundary tests pass. Customer-level numerical results and snapshots remain private outside Git; owner-facing amounts are in the task response/private report. No live app/SQL/financial changes; this proposal is not yet integrated into DEV. Existing deployed definitions, dictionary, release manifest and rollback points are unchanged. Starting repository checkpoint `b025b20`; maintained read/trial/test scripts and this sanitized review are published under the standing repository authorization.
