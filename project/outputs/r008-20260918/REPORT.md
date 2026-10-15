# R008 DEV implementation and verification

**Current candidate: [revision 2 sync repair](r2/REPORT.md), DEV OLTP 1.000178.** The following revision-1 implementation/evidence is retained; unchanged tests are reused. Promote only the complete revision-2 delta after separate owner acceptance/authorization.

DEV only, 18 September 2026. Owner acceptance and production authorization have not been given. The supplied design specifies the feature; it does not authorize production writes. Production remains R007: SQL V22 / OLTP 3.000173 / OLAP 1.100131.

## Implemented state

Verified DEV host **34.158.38.171**, instance **appsheet-pg-dev-20260915**, database **loan_manager_prod**. SQL **V24**, OLTP **1.000176**, OLAP **1.000169**, both **Prototype**. SQL-backed table/view counts are 13 OLTP and 19 OLAP; internal process-state tables are excluded.

The release adds the account master, one active default per holder, optional borrower preference, account references for all six payment paths and other cash movements, account balances and controlled SQL-only opening allocation. The three quick actions open one-field confirmation forms backed by dedicated update-only slices. Account and fresh request token commit together; SQL recomputes the amount and posts through the existing canonical payment engine. This is the design section 9.3 fallback; owner acceptance of its UX remains separate.

V24 makes new quick receipt identities reproducible by AppSheet. Existing V23 identities remain intact and their retries remain idempotent. Three originating-command bots send an exact-receipt notification and, only when applicable, a closure summary. All six DEV tasks target only `welct0407@mw-credit.com`. No real bank transfer, production write or new external sharing occurred.

## Saved configuration evidence

- [Structured delta](release-delta.json): exact DEV values and proposed promotion targets, including generated account references, view definitions, ordered slice membership and nested automation steps. New objects are grouped; existing changed properties are separate. Review alongside the [running edit record](appsheet-edit-record.md), which retains superseded experiments and failures.
- [Independent AppDoc readback](dev-appdoc-readback.json): 57 affected OLTP sections and 96 OLAP sections, generated from saved versions 1.000176 and 1.000169. Redundant nested referenced-type copies are omitted; direct qualifiers are retained.
- [Saved bot readback](dev-bots-readback.json): event conditions, exact templates, recipient expressions, branches and links read from the current editor. These were not inferred from edit payloads.
- Current-editor bindings independently observed: R008 Receive All → R008 Borrower Commands; R008 Receive Full → R008 Charge Commands; R008 Close Loan → R008 Loan Commands.
- [Global saved editor diagnostics](saved-global_diagnostics.json): only OLTP `Daily 00:05` and OLAP `Every Hour` scheduled-event execution limitations in Prototype mode. No other configuration errors/warnings. These are the same specifically recorded owner-excluded DEV limitations from R007; schedules and Prototype mode were preserved. No DEV Deployment Check was run.
- [Production recipient baseline](prod-recipient-baseline.json): read-only inspection of existing receipt/closure tasks at 3.000173 found the same Partners-email expression excluding receipt Created By. Proposed new-bot PROD expressions look up Created By on the exact receipt because their event row is a Borrower/Charge/Loan. They require owner acceptance and target validation at promotion; no PROD task was edited.

The app-documentation capture is affected-scope evidence, not a whole-app audit. The delta helper validates shape and comparison only; it cannot establish that an omitted change was captured. Receive All retains inert action metadata (`To this value` from the abandoned action-input experiment); its saved action type is NAVIGATE_APP and active payload is NavigateTarget. The inert value is recorded, not silently discarded.

## Functional evidence

| Area | Observed result |
| --- | --- |
| SQL chain and safeguards | Restored-copy V23/V24 rehearsal; core-payment and atomic-close regressions; six allocation methods; required/active/matching accounts; default replacement and concurrent default rejection; stale-token and same-token idempotence; competing Receive All produces one receipt and movement. All passed. |
| Historical compatibility | Existing seven source-table fingerprints and R007 reporting values preserved in rehearsal. Historical NULL-account metadata edits passed SQL. No invented historical account assignment. |
| Opening allocation | Isolated SQL tests reject incomplete or nonreconciling allocations and verify exact sum of account balances to existing holder balances. Live DEV openings intentionally remain uninitialized. |
| Quick actions | Receive All, Single Full and Loan Close posted selected accounts through the compact form. Cancel created no payment; a blank required account was rejected. Ordinary Edit opens the full form after moving compact forms to dedicated slices. |
| Other payment methods | Single Partial 10; Lump Sum 15; First-day Auto 10 using the selected Lisa loan account. Full/partial amounts and holder/account propagation checked in SQL. |
| Preferences/defaults | Preferred Dad 1/Dad 2, manual Lisa override, blank-preference Dad default, default switching and inactive-preference fallback tested. Dad 1 reactivated; Dad 2 remains default. Five synthetic account records, no account numbers. |
| Cash movements | GUI same-holder transfer 5 Dad 2→Dad 1; cross-holder transfer 7 Dad 2→Lisa; Tommy manual expense 12 and linked Lisa→Tommy reimbursement 12. No actual external funds moved. |
| Settlement | Synthetic settlement `Cc8f5jij9Hr0CVCISu65n9`, amount 3, selected Lisa Account 2. Complete Transfer retained the selection; Cancel Transfer returned Pending/NULL date and removed the derived ledger projection under existing R005 semantics. SQL verified it. |
| Custody correction | Receipt `3vDYFamdywqPlAWH5aWhIv`, amount 10, changed Lisa→Dad 1 through Payments edit with an appended reason. Same single repayment, same total 10, same single ledger movement, new account/holder. No repost. |

Notification monitor evidence (UTC, 18 September):

| Path | Run | Saved version | Result |
| --- | --- | --- | --- |
| Receive All / synthetic I | `29b0bce3-6f83-4308-b4d6-77f44f9b92da` | 1.000175 | Complete 15:45:27; amount 30, interest 30, principal 0; owner-only and exact receipt link. |
| Single Full / synthetic J | `2b250c0f-b9ba-4c00-a6e6-fff2613d42bc` | 1.000175 | Complete 15:45:35; amount 30, interest 30, principal 0; owner-only and exact receipt link. |
| Loan Close / synthetic L | `9e0946e5-24fd-4935-8114-ed600923afb7` | 1.000176 | Complete 15:54:46; amount 130, interest 30, principal 100. Closure summary: one loan, principal 100, lifetime interest 40. Both owner-only, same exact receipt link. |

Loan Close's event still contained the event-time cross-table lookup at 1.000175 despite an earlier running-note statement. Independent readback found it; 1.000176 corrects it to the nonblank changed-token condition used by the other two bots. SQL only commits a changed command after successful posting. The L test supersedes the K test that did not trigger a bot. Receipt templates use the exact Payment's Related Repayments; older zero-total notification observations are retained as failed intermediate tests, not passing final evidence. Physical-device push receipt was not independently confirmed.

## Recovery and promotion prerequisites

Starting Git `a12bc904516117100bbb1f78f93b36a0cea3d4cb`; initial clean tree. Restorable app versions before changes: OLTP **1.000134**, OLAP **1.000142**. Private backup directory is outside Git under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r008-20260918`.

V22 backup `development-before.dump`, SHA256 `dd00d6783a564578fac5af0651327de33f39797f99e4af995d091fa1d7f47319`, restored and schema matched after the documented associative-AND deparser normalization. Pre-V24 backup `development-before-v24.dump`, SHA256 `18BDEF10A0E80497AE698AB39E2CA674207F33E6D3C3F4012287AF9B04F54728`, restored and schema matched. Forward correction is preferred after financial writes; never restore either snapshot over newer activity without a coordinated recovery decision.

[Flyway manifest](flyway-manifest-r1.json) includes all 24 versioned SQL files; Flyway validation reported 25 successful history entries including the baseline. Pending PROD migrations are exactly V23 then V24, on top of released V22. V23 SHA256 `72553729411d9ae6944eea85a05df079b603fe00ce8086eb7a2a44b6280994a2`; V24 SHA256 `81e46d32fdfa4cc04666448eb3746c42bffe75112cf92ab85be9612ad2e3b594`. Both applied DEV migrations are immutable.

Production promotion must first obtain scoped owner acceptance/authorization, confirm production drift and recovery, establish real account/default records, and receive explicit opening allocations reconciled to each holder. Never copy synthetic DEV financial data or guess account splits. Then apply frozen SQL/configuration in dependency order and independently verify every target, current-editor diagnostics and affected workflows before closing the release.

## Remaining acceptance and limitations

Ready only subject to listed checks/owner decisions: acceptance of the one-field-form fallback and its physical-phone UX; exact opening allocations; production recipient-context expression review; production authorization. Live account Current Balance remains NULL while Initialized is false, rather than displaying a fabricated zero. SQL reconciliation is tested, but a real live account opening balance is not claimed. Historical NULL compatibility has SQL coverage; a separate current-GUI historical edit is not claimed. Desktop automation timings are not a phone performance benchmark. Unrelated Looker reports were not audited or published.

Final supplementary default test: synthetic M, no borrower preference, actual prominent Receive All opened one field preselected to Dad Account 2. One Save posted 25; after sync the action disappeared and displayed interest was 25. Action-to-observed-form: 1.485 seconds. Sync still active at 10.819 seconds, observed complete at 74.493 seconds; observation interval includes documentation work, so no exact processing-time claim. The canceled cold-form URL experiment and unsuccessful viewport override do not establish mobile UX. Final [synthetic SQL readback](dev-synthetic-sql-readback.txt) shows 20 posted receipts and zero holder/account mismatches. The counter named syntheticAccounts counts four prefixed IDs; a fifth synthetic account was GUI-created.

[DEV target comparison](dev-comparison-r1.json): 167/167 mapped saved observations match. [Dictionary verification](dictionary-verification.json): 217 appended DEV rows; all prior values/formulas retained, with rendered samples reviewed. No SQL was changed after the passing V24 regressions. New fields do not add an export route or expose Account Number in notifications. Current affected AppDoc exposes no export/template configuration; scheduled export delivery and external Looker consumption were not executed or certified, and no dashboard was published. The candidate checklist's production documentation closure is reserved for a separately authorized promotion.
