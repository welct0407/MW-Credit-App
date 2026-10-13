# R009 — Partner identity and payment notifications

## RC retirement — 19 September 2026

After R009 release closure, the owner explicitly authorized deletion of both frozen RC apps. Deleted OLTP `MW-OLTP-R009-RC1-578763613` (`b21a5069-4897-4937-a62c-993563fcf572`) and OLAP `MW-OLAP-R009-RC1-578763613` (`5fce331d-68d5-49b8-923f-01dc1b524c9f`). Reloading each former editor redirected to My Apps; the owned inventory contains exactly the four canonical DEV/PROD apps. This removes the live RC definitions as recovery sources. The immutable Git/private captures, source mapping, PROD version-history rollback points and restore-tested V24 database backup remain. No DEV, PROD, database, notification or schedule configuration changed.

## Production promotion — 19 September 2026

Owner explicitly requested promotion under the latest runbook. Captured integrated DEV **V26 / OLTP 1.000033 / OLAP 1.000015**, including the complete owner-edited OLTP GUI definition; this supersedes the earlier open checkpoint. Starting clean implementation commit **7fc856102101fdf93c54e5927a4b6ec36e1ffd6b**.

PROD backup restored successfully and V24 drift matched. Exact V25/V26 migrated and validated. Copied definition-only RC1 apps, rebound all 32 SQL sources, restored per-app production theme/logo/folder/links, verified owner-only access and retained canonical schedule guards. Both RCs deployed and frozen at **1.000006**. App Upgrade, OLAP then OLTP, produced **PROD V26 / OLTP 3.000231 / OLAP 1.100181** in the existing IDs. Both editors report No issues found; current runtime smoke, Partner identity prerequisites and rate reconciliation passed. No financial test writes or forced notifications.

[Production report and recovery](../outputs/r009-20260919/production/REPORT.md), [manifest](../outputs/r009-20260919/release-manifest.json), [source mapping](../outputs/r009-20260919/production/source-mapping-validation.json), [all-document closure](../outputs/r009-20260919/production/documentation-checklist.md). Updated tracker, inventory, Development Changes, overview/dictionary, process annotation and documentation index. Exact affected model rows and retained environment differences are reconciled; historical records stay dated. Workbook and publication checks are recorded with final evidence. First natural post-upgrade PROD OLAP hourly run completed at 22:00 Bangkok with the analytics action successful; the RC event had empty data and no process steps. Final tag: **R009**.

Rollback: restorable PROD **3.000228 / 1.100178**, private restore-tested V24 dump; normally retain compatible SQL V26 and forward-fix. The owner subsequently retired/deleted both RC apps, so they are no longer recovery sources. Physical-device receipt and actual Lisa-signed-in GUI transaction remain declared limitations, covered in part by prior SQL identity tests. Optional initial RC metadata/cache/menu recommendations were recorded without changing tested business behavior; final editor issues are zero.

The remaining sections are historical implementation checkpoints; their earlier no-authorization/pending statements do not describe the completed production deployment.


## Owner GUI work in progress — 19 September 2026

The owner is making additional OLTP GUI changes directly in the DEV editor under R009. The complete owner-edited scope and final AppSheet version are not yet confirmed. OLTP **1.000014** remains the last fully scoped R009 checkpoint, not the current release candidate. R009 is back **In development**; recapture the completed GUI scope, final saved version, editor diagnostics and affected checks before making a new readiness recommendation. PROD remains unchanged.

Current observed DEV OLTP is **1.000032**. At the owner's request, all four loan-closure push-notification body templates now display `<<[Loan Key]>>` after `สินเชื่อ Loan:` instead of `<<[Row ID]>>`: `R009 closure summary Task - 1` (Borrowers), `Send closure summary when loans closed Task - 1` (Charges), `Task for Send closure summary when loans closed` (Loans), and `Send closure summary Task - 1` (Payments). Their Row ID selectors, receipt matching, titles, amounts, interest, recipients, deep links, channels and conditions are unchanged. After save/reload, all four bodies independently read back with Loan Key and no displayed Row ID; no notification was fired.

The same current checkpoint changes the existing `Loans[Effective Daily Interest Rate]` virtual column only: each loan-type daily-income numerator is now divided by `Outstanding Principal`, with a zero result when the balance is zero. `Loan Key` remains unchanged and may therefore reflect the current effective rate in its label. Flyway **V26** applies the same calculation to `public.olap_loans_analytics` without changing the view signature or OLAP AppSheet configuration. The full migration chain and synthetic full/partial/zero-balance cases passed; live DEV readback found 129 loans, 7 partial-balance loans, zero nonzero rates on zero balances and zero calculation mismatches. The saved OLTP formula was independently read back from AppSheet documentation, and the editor reports **No issues found**. Database rollback point: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/development-schema-20260919-204149.sql`; app rollback version: **1.000031**. This targeted check does not close or validate the owner's other ongoing GUI edits, so R009 remains In development and PROD remains unchanged.

## Current extension — 19 September 2026

Owner approved separate login/delivery identities and implementation under R009. This supersedes the first-stage deferral and direct DEV recipient overrides below. Starting commit 7b5d2606c97e7c77956407ac523edc5717e443b0; tree was clean. This section records the verified **1.000014** checkpoint; later owner GUI work above has reopened development. Production promotion remains unauthorized.

Implemented **V25 / OLTP 1.000014 / OLAP 1.000015**. V25 adds nullable, normalized-unique Partners.Login Email and backfills prior emails before the separate DEV delivery override. Existing Email remains the delivery column. Both DEV Email values are welct0407@mw-credit.com, with distinct login identities retained. Twelve push tasks exclude the actor Partner ID and deduplicate nonblank delivery addresses; unknown actors select nobody. Existing channels, content, event conditions and closure gates are retained. Both apps regenerate Partners; generated Compose Email (Login Email) action retained. OLAP edit form shows both fields and was cancelled without data changes.

Both saved editors **No issues found**. [Current test results](../outputs/r009-20260919/IDENTITY_TESTS.md), [exact saved expressions](../outputs/r009-20260919/identity-routing.json), [manifest](../outputs/r009-20260919/release-manifest.json). Full migration chain with populated V24 backfill, uniqueness/blank checks, shared-delivery exclusion/deduplication and Flyway validate passed. Initial migration attempt rolled back due to deferred Partner trigger events before DDL; corrected ordering was retested before successful application. Applied V25 is immutable. Current-GUI positive and zero-closure runs passed; positive receipt and summary task output both target the owner. SQL covers both actor identities. Physical-device receipt and a transaction under Lisa's actual sign-in remain unverified; recommend that focused owner acceptance test before promotion.

Updated AGENTS, release/refresh/preparation and promotion-documentation procedures, templates, database guide, tracker, environment inventory, development differences, overview and dictionary. R009 scripts/evidence capture exact expressions and bounded DEV fixture/data operations. Production reference remains R008. The earlier mapping is marked superseded and must not be restored into RC. No Looker/export logic change. New login values should be maintained as trimmed canonical sign-in emails. Before V25 in PROD, verify existing Email values really identify the two sign-ins; preserve delivery data and handle any divergence explicitly.

Rollback: restorable DEV OLTP **1.000011**, OLAP **1.000013** recorded before this batch. Retain additive V25 on ordinary app rollback; old owner-literal DEV definition still isolates notifications. Private DEV backup before identity change: C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-20260919/dev-before-login-identity.dump; SHA256 82022F579A1E8277832A8AFAE00453C746CCA9E736F135B4E35CBCA9F3934DB5. Archive listing passed; restoration not tested. Do not restore over later shared work or assume Login Email always reconstructs an earlier delivery address; the backup preserves prior mappings. Synthetic receipts remain auditable DEV history, auto-charge off. SQL/app rollback does not undo notifications already sent.

The DEV-only Set-R009DevRecipients runner is pinned to the current host and exactly two mapped partners; review it if partner population changes. Never run DEV overrides against PROD. Refresh applies retained migrations then reapplies delivery-data isolation before jobs resume. Normal RC/App Upgrade keeps identical expressions and uses PROD contacts; existing schedule guards and theme/binding steps remain required. No RC/PROD edits or final production tag in this task.

## Historical first-stage R009 implementation

The following is dated evidence. Its earlier direct-recipient approach and no-model-change applicability statements are superseded by the extension above.

Owner request: fix both diagnosed notification issues in DEV as R009. Production promotion is not authorized. Starting Git commit `acbdc4fd492b2087ded27223a2841a36b61e5e5c`; working tree clean.

Scope: R008 Receive All Confirmed, R008 Single Full Confirmed and R008 Loan Close Confirmed. Correct creator exclusion by explicitly referencing the originating command row inside Partner recipient selection. Move Send closure summary into the Yes branch of Notify payment-closed loans so zero closures send no closure message. DEV notification recipient settings remain directly owner-only; record corrected production expressions for RC substitution and verify their logic separately.

Target DEV OLTP: `500b27b6-884a-41e8-a9ec-df801b0110ad`, internal name `MW-OLTP-DEV-20260919-578763613`. Companion DEV OLAP: `9f3422be-bc87-4a5a-a42a-67528ee80393`. SQL V24 unchanged.

Status: **Ready for review — DEV closure fix verified; corrected production recipient expressions prepared under required DEV override.** Ready subject to owner acceptance and future RC preparation/authorization. No PROD edit, financial write or notification is authorized by this release. Reviewed synthetic DEV workflow tests and owner-only DEV notification delivery use standing project authorization.

## Implementation and runbook

Re-read the latest 19 September [Release Workflow Gate A](../Documents/Rules/Release_Workflow.md#61-develop-and-integrate--gate-a), AGENTS and [DEV recipient procedure](../Documents/Rules/Development_Environment_Preparation.md#dev-recipient-override-procedure) following the owner's reminder. Preserve Deployed mode, owner-only direct notification settings, existing schedules/guards and environment isolation. The R009 request authorizes correction of the diagnosed creator-exclusion bug; it does not authorize the broader deferred Partner-ID redesign or removal of DEV isolation.

DEV OLTP **1.000010 → 1.000011**. In all three quick-payment processes, recreated the existing custom push closure task in the Yes branch of Notify payment-closed loans and removed its unconditional predecessor. Original title/body/deep link retained. Receive All child is named `R009 closure summary`; Charges/Loans children are `Send closure summary when loans closed`. The exact receipt count must exceed zero. Payment notification steps and event conditions remain unchanged.

The erroneous production recipient lookup used the Partner row's unqualified Row ID. The [R009 mapping](../outputs/r009-20260919/recipient-mapping.json) contains corrected originating-row expressions for both tasks in each process. DEV still directly targets only the owner, as required by the latest runbook. Corrected production recipient selection is therefore prepared/validated separately, not activated against other Partners in DEV. Future RC must apply this mapping instead of restoring R008's defective expression.

## Verification and affected assets

[Five current-GUI cases and Automation Monitor results](../outputs/r009-20260919/TESTS.md): both zero-closure cases skipped closure tasks; three positive cases executed them; all five runs Complete and receipts Posted. [SQL readback](../outputs/r009-20260919/sql-readback.jsonl) resolves all five creator identities and confirms expected closure counts. All three production expressions accepted by current Expression Assistant; no multi-user delivery claim. Physical-device delivery is not independently verified.

Both editors **No issues found** at saved OLTP **1.000011** / unchanged OLAP **1.000013**. No schema/model/table/column/Ref/slice/view changes, so overview/dictionary workbook changes are not applicable. No Looker/export/report impact. Model reference remains PROD; notification differences belong in this log and mapping. SQL fixtures are confined to `R009GUI-*` and existing synthetic cash accounts on verified DEV; no migration or production data copy.

Repository assets: this log, tracker, environment inventory, development differences, R008 regression notice, [manifest](../outputs/r009-20260919/release-manifest.json), mapping/tests/SQL evidence and [DEV lab runner](../scripts/database/Invoke-R009Lab.ps1). The completed concurrent DEV-refresh cleanup commit `b3fefee` is preserved.

## Rollback and continuation

Recorded current restorable DEV OLTP **1.000010** before changes. Restore that definition only if appropriate; it reintroduces the two known notification defects and does not undo synthetic receipts. DEV OLAP is unchanged. Starting code commit and reservation `db59eb7` establish local rollback; use a scoped revert preserving later work.

Before synthetic writes, created private DEV dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-20260919/dev-before-fixtures.dump`, SHA-256 `32C00553BA4FA41D1E0109DA5B029C7538D281878B21051E4262D274568838C0`; archive listing passed, restoration not executed. Do not restore the shared database merely to remove test fixtures or overwrite later work. Synthetic history retained with no continuing auto-charge on open fixtures.

Next: owner review, then separately authorized integrated RC preparation/App Upgrade under the current runbook. No RC or PROD mutations occurred. Production still has the diagnosed defects until an authorized promotion. No final R009 production tag is created during DEV completion.
