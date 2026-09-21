# R014 — Cash visibility and partial settlements

Date: 21 September 2026. Status: production deployment and verification complete; final documentation/publication closure recorded in the promotion checklist. Owner authorized the complete integrated R014, including the AI Reviewer extension, on 21 September.

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

Owner decision, 21 September: forecast proposal rejected and excluded from R014. Review-only scripts/report were removed by revert `1844453` (recoverable in Git history). No forecast changes were applied to either app or database; existing R014 implementation and scope remain intact.

## AI Reviewer role — owner extension, 21 September

Owner clarified the flag belongs to Partners, not Borrowers. Add `AI Reviewer` Yes/No with false default and Tommy initially true; separate review request/decision authority from daily summaries and IG integration. Include schema, both affected app consumers and agent script changes in R014. No production promotion authorized by this extension.

Refinement baseline: Git `8a11cb656ed6ba1f77aa3ac750d00529d2a64e0d`; DEV OLAP 1.000028 verified before regeneration. Private DEV backup and hash: [reviewer backup](../outputs/r014-20260921/reviewer-backup.json). V32 is reserved/applied to DEV: additive non-null boolean with default false; existing Tommy identity explicitly selected. Existing reporting views use explicit Partner columns and require no definition change. OLAP owns editing; OLTP remains read-only. Live production activation must follow V32 promotion and coordinated reviewed agent deployment, preserving old request correlation and rejecting non-reviewers.

Implementation and GUI verification in progress; this extension reopens DEV completion. Prior R014 checks remain valid for untouched workflows. The old V31 release manifest is superseded for the expanded batch; rebuild its pinned manifest after completion.

AI Reviewer refinement completed in DEV: V32 / OLTP 1.000075 / OLAP 1.000031, both Deployed with zero editor issues. OLTP's live pre-edit rollback version was 1.000073; its intervening saved definition was preserved. Tommy Y/Lisa N verified in the current OLAP app; Tommy form save and SQL readback passed. OLAP owns editing, OLTP stays read-only. Four data-dictionary differences preserve prior values/formulas. [Complete reviewer verification and deployment dependency](../outputs/r014-20260921/reviewer-report.md).

Agent implementation is published at `MW-Integration-Agent@83e1b56`, with 102 local tests passing (two platform skips) and a real DEV master query passing. Source is staged, not installed on the production VM. Daily summaries/results retain Partner routing; only payment requests and decisions use current reviewers. The updater rejects installation before the V32 column exists. Production app/database promotion and VM deployment remain outstanding under R014, with no new approval gate beyond the existing release process.

Expanded SQL package pinned by New-Release.ps1 at tested commit `75f847d9ba31c580b8c8f336df92a606635b2f6e`, covering V31 and V32 after clean-checkout DEV validation. Updated flyway-release.json and release manifest replace the old V31-only package. No production tag or promotion was performed.

## Production promotion — 21 September

Owner: “I made another change in another codex session, also included in R014. now move R014 to production.” This supersedes the earlier pending-authorization statuses above. Forecast changes remain excluded.

Migrated production V30 to V32 from the exact tested package after restored-backup/schema/history checks. Definition-only RC copies excluded data and file copying. All 37 saved source mappings passed. Frozen Deployed RCs OLTP 1.000007 and OLAP 1.000006 upgraded the existing production IDs to **OLTP 3.000245 / OLAP 1.100194**, from rollback versions **3.000242 / 1.100191**. Production names, colours, logos, folders, companion links and separately enabled API access were preserved.

Both production editors show No issues found. Changed app entry points and sync passed, settlement form was discarded without saving, and dashboard SQL arithmetic reconciled. Current Tommy-only reviewer membership passed in SQL and the installed agent master query. Agent business code matches `83e1b56`; its source checkout also contains later documentation-only commits through `40076e6`. Reviewed updater backed up configuration/package/journals, passed all 102 tests on Debian and resumed all four existing timers. Both bounded AppSheet API probes authenticated with existing protected keys. Tailscale hardening required IAP SSH; no network protection was changed.

Rollback, exact mappings, checks, contained RC retention, remaining physical-device/real-reply limitations and publication are recorded in the [production report](../outputs/r014-20260921/production-report.md), [manifest](../outputs/r014-20260921/release-manifest.json) and single [promotion checklist](../outputs/r014-20260921/promotion-checklist.md). Dictionary rows 2880–2915 become the production reference, with open R014 differences closed. No Looker/export contract or unrelated automation changed.
