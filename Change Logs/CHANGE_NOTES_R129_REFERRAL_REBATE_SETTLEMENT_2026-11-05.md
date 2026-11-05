# Change notes — R129 referral rebate pending payment, Referrers page and settlement, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "I want the referral expenses (not offsetting open loans) to be recorded and marked as pending payment, and a way to settle those outstanding payment. Expense will still be recorded and recognized at the time of loan closure. Just the cash payment will be delayed", plus a Referrers page with each referrer's unpaid and accruing rebates, a detail page and the settlement history. Status: built and tested for DEV review; DEV deployment is covered by the owner's instruction and PROD needs its own instruction with a verified backup. Design: Archie's R129 Referral Rebate Settlement design (decisions D1 to D9).

## Changes
Scope:
- **Pending rebates.** From V137 every referral rebate that is not fully settled by offset (including the uncovered remainder of an offset) is booked as an expense on the close date with Rule Version `REFERRAL_REBATE_V3`, and no cash moves at close. The expense is still recognized on the close date, so profit and the Partner split are unchanged. Rows booked before V137 (V1, V2) keep their meaning: Lisa paid them on the close date, and they are never converted.
- **Settlement.** One settlement pays whole pending rebates of one referrer (any subset, default all) as one cash movement out of Lisa's chosen account on the settlement date (movement type `Rebate Settlement`). Deleting a settlement returns its rebates to pending and removes the cash entry. Deleting a closing payment whose rebate is paid is refused ("Remove the settlement first").
- **Referrers page.** A new menu item "Referrers" / "ผู้แนะนำ" lists every borrower who is the referrer of at least one borrower, with unpaid and accruing amounts; a detail page shows tiles, unpaid rebates, unsettled rebates on open loans and the settlement history; a settlement detail page and a Pay rebates page (online only) complete the flow.
- **Wording.** Loan Close, Receive payment, Payment record, push and chat say "฿300 pending to Mai (฿900 owed)" instead of "transfer from Lisa"; Expenses rows get a status chip; the Borrower page shows "Rebates owed" and a link to the referrer page.

Design decisions (Archie):
- D1: every rebate booked after V137 that is not fully offset is pending; older rows are never converted.
- D2: V3 versus V1/V2 tells the kinds apart; no column is relaxed, so the cash payer guards stay as they are. The pending state is derived (Rule Version and the links), not stored.
- D3: "accruing" is an estimate, never money owed: for each open, non-defaulted referred loan, min(round((interest + late charges received so far) × rate / 100), cap) at the referrer's terms today; self-referred loans excluded.
- D4: holder fixed to Lisa, account selectable among Lisa's active accounts; method Bank Transfer or Cash; optional bank reference text (no slip upload).
- D5 to D8: the Referrers page is business workspace only; every referrer is listed, unpaid amount first; history shows settlements, offsets and legacy paid-at-close rows; corrections as above.
- D9, out of this release: slip upload on the settle page, a settlement push, the chat creating settlements, a reminder for old pending rebates, a menu badge, and owed balances on the Borrowers list.
- **One legacy rebate made unsettled (owner instruction, 5 November 2026: "include the 20 baht referral rebate booked today as unsettled" (paraphrased)).** V137 also carries a postgres-only administrative function `public.pwa_convert_legacy_rebate_v1(expense_id)` that converts one legacy V1/V2 referral rebate to `REFERRAL_REBATE_V3` and re-syncs its ledger projection. It is not granted to the application roles and is tested on disposable data only; it is never run on DEV data. The owner's message covers exactly one PROD row, run once at promotion after V137 and its verification: expense `rr1:4880c5c5-e3a5-40dc-a5cf-e2b2e5444aaa` (the owner-named legacy rebate: Amount 20.00, V2, no offset, Expense Date 2026-11-05). Expected result: Rule Version V3, the ledger row `cash:EXPENSE:rr1:4880c5c5-e3a5-40dc-a5cf-e2b2e5444aaa` (20.00 out of Lisa) removed, pending 20, the payee owed 20. This is the only exception to D1 (no conversion of rows booked before V137); any other legacy row needs its own instruction.
- Cash rule: `sync_cash_ledger` projects a V3 expense for the offset amount only (nothing when there is no offset), so Lisa's cash on an offset day still nets to zero; the settlement produces one `Rebate Settlement` movement of the summed pending amounts. Lisa's cash reads higher between a close and its settlement; the Cash Position page gains a "Rebates payable" line so this is not read as free cash.

Files and objects (Byte to confirm names and counts at the final commit):
- `database/migrations/V137__referral_rebate_settlement.sql` (additive; V136 stays): new table `public.pwa_rebate_settlements` (owner `postgres`; immutable rows) with its index, guard trigger, grants, the new trigger function `rebate_settlement_cash_source()` for the `zz_cash_source` trigger (`cash_source_changed` and `business_source_delete` are untouched) and a dedicated BEFORE DELETE trigger that removes the ledger projection; new columns `"Business Expenses"."Ref Rebate Settlement"` and `"Cash Ledger"."Ref Rebate Settlement"`; `"Business Expenses_check2"` accepts V3 with terms; the Cash Ledger system-row CHECK gains a fifth branch; counted replacements in `calculate_business_expense()` (the V15 expense trigger: the link change under `pwa.rebate_settlement`, and the "Remove the settlement first" refusal in its delete branch), `create_referral_rebate(text)`, `pwa_referral_rebate_projection_v1` (adds `owedBefore`), `sync_cash_ledger`, `guard_cash_ledger`, `cash_ledger_source` (its Manual branch gains `"Ref Rebate Settlement"` IS NULL), `pwa_submit_operation_v2` (operations `rebate-settlement.create` and `rebate-settlement.delete`) and `payment_crud_prepare_core_v83` (the refusal for a paid rebate is in the expense trigger, so this one only carries the dependency message if Byte patches it); new `pwa_apply_rebate_settlement_v1`, the postgres-only `pwa_convert_legacy_rebate_v1` (Byte), `pwa_rebate_settlement_version_v1`, `pwa_rebate_pending_v1`, `pwa_rebates_owed_v1` and `pwa_notify_content_v5`. Preflight needs V136; the self-check compares owner, ACL, security, volatility, configuration and comment of every replaced routine. `database/current/public-functions.sql` and `services/chat/assets/schema-digest.json` are regenerated (the digest starts a new chat history epoch after the chat image deploy).
- Command service (from git status): new `services/contracts/rebate-settlement-command.mjs`, `services/business/referrers.mjs` (`GET /api/referrers`, `GET /api/referrers/:id`, `GET /api/rebate-settlements/:id`) and `services/business/rebate-state.mjs`; changed `services/contracts/operation-command.mjs`, `services/business/expenses.mjs`, `payments.mjs`, `borrowers.mjs`, `cash.mjs`, `management-financial.mjs`, `management-position.mjs`, `services/payment-command/handler.mjs` and `store.mjs`, `services/notifications/content.mjs` and `dispatcher.mjs` (v5 first, then v4 and older).
- PWA: new `apps/pwa/src/ReferrerRecords.tsx`, `RebateSettlementForm.tsx` and `referrer-text.ts`; changed `BorrowerRecord.tsx`, `ExpenseRecords.tsx`, `Icon.tsx`, `LoanClose.tsx`, `ManagementPosition.tsx`, `OperationConfirm.tsx`, `PaymentRecord.tsx`, `SelectedCharges.tsx`, `domain-draft.ts`, `live-main.tsx`, `live-style.css`, `live/LiveHeader.tsx`, `live/WorkspaceViews.tsx`, `offline-sync.ts` (rebate-settlement operations are online only, never queued) and `read-cache.ts`.
- Access: `scripts/database/app-role-policy.mjs` keeps the new table read-only for the application role (DML only through the journal owner). `rebate-settlement.*` is open to the same roles as the expense operations.
- Tests: new `scripts/database/Test-RebateSettlement.sql`, `tests/integration/rebate-settlement-independent.test.mjs`, `tests/unit/rebate-settlement.test.mjs`, `tests/unit/rebate-settlement-pwa.test.mjs` and `tests/e2e/fixtures/referrers-fixture.ts`; changed `Test-StatementBatch.sql`, `Test-AccessMatrix.sql`, `Test-RebateOffset.sql`, `Test-LateCharges.sql`, `tests/integration/Run-UnifiedReceiving.ps1`, `rebate-offset-independent.test.mjs` and the unit tests for cash ledger list, chat proposals, notification content, notifications and the payment close rebate read. The Playwright spec `tests/e2e/referrers-independent.spec.ts` is Chase's.
- Agent: `integration-agent/src/mw_integration_agent/partner_review.py` `rebate_lines` composes the rebate sentence itself and moves to the pending wording (Byte), with its own [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R129_AGENT_REBATE_PENDING_WORDING_2026-11-05.md); no catalogue change.
- Docs: Release Tracker and Development Changes (R129), Solution Design, PWA Data Model Overview (Expenses and Cash rows), `database/README.md` (V137 paragraph), `services/chat/assets/conversation-business-rules.md` (pending rule, owed and accruing definitions; the chat cannot create a settlement; `command-catalogue.json` unchanged). The Environment Inventory DEV pins follow Forge's apply. The Data Dictionary entries (table, columns, routines, API) follow the PROD capture at promotion.
- Deviations from the design (Byte), recorded as built:
  1. The settlement version hash covers `created_at` in UTC.
  2. The Partner split is kept on settlement link, unlink and conversion.
  3. "Remove the settlement first" lives in the V15 expense trigger; `payment_crud_prepare_core_v83` is unchanged and the P5B05 mapping is in `pwa_apply_payment_v2`.
  4. Loan Close `pending` and `owedTotal` are computed before the journal row, under the referrer lock.
  5. The v5 push state is `offset` whenever an offset paid part, and the push names only the pending part.
  6. The `Test-LateCharges` upgrade assertion is narrowed to the tables that exist at V131.
  7. Settlement cash rows are mapped to `REBATE_SETTLEMENT` in `cash.mjs` and `management-financial.mjs`, not in the views; `ledger-counterparty.ts` is unchanged.
  8. The reads compute pending inline, so pre-V137 images keep working; the Referrers routes answer empty or 404 before V137.
  9. The delete confirm uses the standard `OperationConfirm`.
- Operational notes: `pwa_convert_legacy_rebate_v1` refuses V1 rows and must be run as `postgres` inside the ledger-owner window at PROD. The two operations are not in the chat catalogue. The schema digest is rebuilt at V137, so a new chat history epoch starts after the chat image deploy.
- Fix round after Chase and Echo (Byte):
  - The v5 push reports `paid` first for a settled V3 rebate and carries `ruleVersion`; the renderer never gives a V3 rebate the legacy "transfer from Lisa" sentence.
  - `rebate-settlement.*` uses a new online-only send path: it is never queued, and an unknown outcome offers "Check again", which reconciles under the same request id. `loan.close` offline behaviour is unchanged.
  - NAV-1: the Referrers page opens in place from the Borrower and expense pages, with Back to the borrower or expense; `referrer-link.ts` is removed.
  - Byte edited one expectation in Chase's spec (the RF-2 wording).
- Echo findings (Chromium 390×844 and 1280×900, English and Thai): must-fix PAY-1, PAY-2, EX-1; should-fix PAY-3, EX-2, NAV-1, RF-1, PR-1; later RF-2, RF-3, SET-1, LC-1, BR-1. All fixed. PAY-4, RF-4 and RF-5 are deferred.
- Known limitation: two mutually referring borrowers closing at the same instant can hit a deadlock (40P01); it is safe to retry.
- Known behaviour: every expense version hash changes once at V137 (the hash covers the whole row), so a queued phone edit of an expense hits `source_conflict` once in a short window, as recorded for R120.

## Checks
Pull request checks and DEV evidence are still pending (a row marked Pending is not a pass).

| Command | Result |
| --- | --- |
| `Test-RebateSettlement.sql` and the full `Test-StatementBatch.sql` on a disposable PostgreSQL 18.6 lab at V137 (Byte, final after the fix round) | Pass |
| `mw-db-ci` migrations, main route (Byte): rebuild 1 to 137, repeat run a no-op, statement batch, 9 concurrency suites, `public-functions.sql` drift check, checksum tamper rejected | Pass |
| `mw-db-ci` V131 upgrade route (Byte) | Failed first on the `Test-LateCharges` upgrade assertion; fixed by narrowing it to tables existing at V131 (deviation 6); re-run green with `Test-MigrationsCloud.py --pre-target` |
| Receiving, phase5 and phase8 scripts (Byte) | Exit 0 |
| `database/current/public-functions.sql` regenerated and verified (Byte) | Pass |
| biome; `npm run typecheck`; vite build `live-dev` (final, Byte) | 0 errors; typecheck pass; build pass |
| `node --test tests/unit` (final, Byte) | 1187 tests, 1186 pass, 0 fail, 1 skipped ("builder output equals the committed digest on a rebuild" needs a lab database port, `MW_CHAT_DIGEST_PORT`) |
| `tests/e2e/referrers-independent.spec.ts` (Byte, after the fix round) | 16 passed |
| `rebate-offset-independent` and `rebate-settlement-independent` integration tests (Byte) | 16 and 5 pass |
| `PYTHONPATH=src python3 -m unittest discover -s tests` and `ruff` in `integration-agent/` (Byte) | 789 OK, 70 skipped; ruff clean |
| Chase verification: spec 8/8 on its first run, typecheck, biome on the spec, code review of V137 and the services and PWA changes; reused Byte's database and unit evidence | PASS, 3 low defects (fixed or recorded in the fix round above) |
| Echo UI pass, Chromium 390×844 and 1280×900, English and Thai | Pass after fixes (findings above) |
| PR #251 first `Development checks` run 42030489214 on `89a9091` | Partly green: DB groups (migrations, receiving, phase5, phase8), check, lint, unit test, lab, GitGuardian and e2e shard 1 pass; e2e shards 2 and 3 failed. Cause 1: `rebate-offset-independent.spec.ts` (7 tests, both projects) still expected "transfer from Lisa" and "Pay out as expense". Cause 2: the `w5-ux-independent` desktop sidebar overflowed by 4px at 1280×800 with the new Referrers item |
| Fix for those two failures (Byte) | Spec updated to the R129 wording (pre-R129 rows keep the legacy sentence); sidebar items 44px (was 48), gaps 2px, list padding 8px. Local: those two specs plus `referrers-independent` 75 passed, 1 skipped; biome and typecheck pass |
| PR #251 second `Development checks` run 42033590990 on `3c30f3b` | Pass: Development checks result, e2e shards 1 to 3, check, lint, GitGuardian. The database inputs are identical to `89a9091`, whose Database migrations run 42030436293 is green |
| V137 self-check ACL ordering (found by DEV attempt 1, fixed by Byte) | Every ordered comparison in V137's self-checks uses one expression with `COLLATE "C"` on both sides; an aggregate `ORDER BY 1` in the function ACL check is fixed; the `pwa_submit_operation_v2` settlement key check uses `COLLATE "C"`; `public-functions.sql` regenerated and verified. Proof: an en_US.UTF-8 lab (V136 with PROD default privileges) reproduced the DEV failure with the old V137 and passed with the fix (Flyway migrate, `Test-RebateSettlement`, `Test-StatementBatch`); the C lab passes; `mw-db-ci` migrations exit 0; the 8 affected unit files 193 pass; biome clean. The fix commit's own CI run is Pending |
| `npm run check:docs` (Dewey) | Pass at this record (final run after any later edit) |

## Not run
The wide Playwright suite locally (the pull request CI is the one broad run); real iOS Safari (the owner's DEV review); the push on a device; a settlement on PROD data. A skipped check is not a pass.

## Recovery
- Placeholder until Forge reports: DEV before R129 is settings generation `1793865141900575` (read `00071-ljm`, command `00088-sg9`, chat `00040-flw`, notify `00029-njw`, jobs `00029-9k6`) and Hosting `172e9094f02fb9b9` (R128); the backup reference at V136 comes from the DEV record below.
- V137 is additive and immutable; roll forward with a later migration restoring the V136 bodies of the replaced routines and keeping the table and columns. Rebates already booked as V3 would then never move cash, so prefer a forward fix. Settlements already made remain correct ledger history.
- Git baseline: R128 `57a7855` (origin/main when R129 was started).

## Open questions
Owner confirmations the design assumed (first option of each): D3 accruing = rebate on interest and late charges received so far at today's terms, not a projection to the loan's end; D1 no conversion of rebates booked before V137, except the one owner-named legacy rebate above (if some others were in fact never paid, the owner sends the list for a separate authorized correction); D9 deferrals accepted; the menu item name "Referrers" / "ผู้แนะนำ".

## Remaining work
- Owner review in DEV, then a separate promotion instruction (verified PROD backup, owner window, images, Hosting, tag).
- At promotion, after V137 and its verification: run `pwa_convert_legacy_rebate_v1` once on PROD expense `rr1:4880c5c5-e3a5-40dc-a5cf-e2b2e5444aaa` (the owner-named 20 baht rebate, see Changes), read back the Rule Version, the removed ledger row, pending 20 and owed 20, and record it in the PROD promotion record. Not run on DEV data.
- At promotion: repeat the optional chat read grant (`GRANT SELECT ON pwa_rebate_settlements TO mw_chat_read_<env>`), and refresh the Data Dictionary after the PROD capture.
- Follow-up, not in R129: CI database labs run C collation while DEV and PROD are en_US.UTF8, which hid the V137 failure; a contained opt-in en_US collation for the migrations group (`Test-MigrationsCloud.py`) would catch it.
- Deferred (D9): settlement push, slip upload on the settle page, chat-created settlements, a reminder for old pending rebates, a menu badge, owed balances on the Borrowers list.

## DEV promotion record (Forge, UTC)
Placeholders for Forge's evidence. Authority: the owner's 5 November 2026 instruction to implement, test and deploy to DEV for review; DEV only, no PROD action, merge or tag. No secret value, token or borrower data appears here. Pins go only in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Item | Result |
| --- | --- |
| Package | Attempt 1: PR #251 head `3c30f3b`, `Development checks` run 42033590990 green. Attempt 2: Pending (head with the collation fix and its runs) |
| Scope | Pending (expected: V137, read, command, chat, notify and jobs images, DEV Hosting labelled R129) |
| Preflight | Attempt 1 run at `3c30f3b`. Attempt 2: Pending |
| Backup at V136 | Attempt 1: 13:22:23Z to 13:24:52Z, restore verified, 38 table fingerprints, dump sha256 `0725d799d20bf156ec3974ff81416b32012ded36aedb75a4867d93c94cf884f5`, folder `dev-refresh-7d34fd34db3647acbacc0e087ccee308`. Attempt 2: Pending |
| Image | Attempt 1: Cloud Build `6556604f-a774-4e9b-b110-58b801900c84` SUCCESS, digest `sha256:c9ab98bd…388bca9`; built, not deployed. Attempt 2: Pending |
| Owner window | Attempt 1: all six DEV owners open 13:25:51Z to 13:26:03Z; closed 13:28:22Z to 13:28:33Z. Attempt 2: Pending |
| V137 | Attempt 1: `Invoke-Flyway.ps1 migrate` 13:26:14Z to 13:26:44Z FAILED and rolled back with "V137: unexpected access to pwa_rebate_settlements". Cause: V137's self-check compared ACL arrays ordered differently, which diverge under DEV and PROD's en_US.UTF8 collation (CI labs use C). Readback: head 136, no V137 objects, nothing written. Terraform, Hosting and smoke were not run and the pins are unchanged. Attempt 2 (after Byte's fix): Pending |
| Reconcile | Pending (post-migrate application-role reconcile: expected 0 violations with the new table read-only) |
| Validate | Pending (`Invoke-CloudFlyway.py verify --target dev`: head 137, nothing pending) |
| SQL readback | Pending (owners, ACLs, R129 marker on every replaced routine, the ledger CHECK text; no synthetic settlement written on DEV unless the owner asks) |
| Terraform | Pending (plan, apply, re-plan clean, settings generation) |
| Revisions | Pending |
| Hosting | Pending (build-version, embeds the source commit, `--check`, version) |
| Smoke | Pending (`/health`, 401 unauthenticated, CORS 204, `/api/referrers` 200 as the DEV test Partner with the expected shape, both origins on the new build, `sw.js` no-store, no ERROR logs) |
| Chat read role | Pending (optional operator grant on `pwa_rebate_settlements` to `mw_chat_read_dev`) |
| Not done on DEV | Pending |
| Rollback | Pending |
