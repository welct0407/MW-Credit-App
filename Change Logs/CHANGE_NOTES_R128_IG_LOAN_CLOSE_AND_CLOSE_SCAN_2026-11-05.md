# Change notes — R128 loan close through Instagram and slip recognition on Loan Close, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "If payment could close the loan, give me the option to respond to close the loan through ig. I want to avoid manual work. In addition, when uploading the receipt in close loan page, there's no scanning and recognition … Add it similar to payment receiving page. Engage team … Move to dev, test and promote to prod". Status: In development (not merged, deployed or tagged). The integration agent half is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_2026-11-05.md).

## Changes
Scope:
- **Close through Instagram.** When a slip exactly matches today's loan payoff and the new catalogue switch `loan_close_execution_enabled` is on, the reviewer request becomes "Loan close approval requested". An approved request makes the agent post a contract-2 `loan.close` operation through three new command-service routes. Without the switch (default off, turned on at PROD after deployment) a payoff slip stays a manual Loan Close as before.
- **V136.** `loan.close` accepts optional `bankReference` and `transferTime`, written to the Payments `"Bank Reference"` and `"Created At"` columns, so slip evidence and duplicate detection work for closes (the same fields manual command v7 already carries).
- **Slip recognition on Loan Close.** The PWA Loan Close page recognizes an uploaded slip like Receive payment (R075, R076) through the existing recognition endpoint.

Design decisions (Archie):
- No new table or column. V136 is functions only.
- The agent uses the same OIDC policy as the receipt routes and the existing validation path (`pwa_submit_operation_v2`, `pwa_apply_loan_close_v2`); no new write path.
- Idempotency: `requestId` is derived from `['mw-credit-agent-loan-close-v1', env, reviewId]`, so a retry or a second approval cannot close twice.
- The quote is read before posting. If it changed since the request was sent the review ends `STALE` and nothing is posted.
- The referral rebate follows the PWA default path: offset when the referrer has an open loan with coverage, the previous path if there is one, otherwise expense. The DM states the path.
- Requests sent before the deploy stay manual; the change applies only to requests created after the agent is updated.
- Slip recognition on Loan Close fills the account and notes the amount only (match or mismatch, no amount fill, because the payoff is computed); the slip date is not used.
- Behaviour added by Byte beyond the brief: the agent also checks that the `rebatePath` and the rebate amount are unchanged before posting; a slip without a bank reference or transfer time gets the manual close request; a 404 or 422 on the re-quote ends STALE (`LOAN_CLOSE_QUOTE_CHANGED`) while a transport fault retries; a 401 or 403 is retried after 15 minutes like receipt payments; the posted DM splits the rebate into its offset and pay-out parts; the agent readback counts Late Charge Paid for all payments.
- PWA upload: when online, Loan Close now uploads the slip at once, even with the offline queue on, so it can be scanned; offline, or when the upload fails, the slip is kept locally and sent unread with the close, as before.
- Deferred: the pay-forward note "Remainder settles … record in the app" stays manual (a different write path).

Files and objects (Byte to confirm names and counts at the final commit):
- `database/migrations/V136__loan_close_slip_reference.sql` (functions only; no table, column, grant or trigger change; V135 stays): `pwa_submit_operation_v2` accepts optional `bankReference` (1 to 256 bytes, not blank, no CR or LF) and `transferTime` (HH:MM) on `loan.close`, each only when present (the `rebatePath` pattern, so a command saved by an older PWA stays valid), and either needs `paymentMethod` Bank Transfer; `pwa_apply_loan_close_v2` writes `"Bank Reference"` and `"Created At"` (paymentDate and transferTime) on the closing payment, else null as before, so the receipt image links after posting as for an agent payment. Preflight needs V135; the self-check confirms owner, ACL, security, volatility, configuration and comment are unchanged. `database/current/public-functions.sql` is regenerated. Rollback is a later migration restoring the V135 bodies (a command with the new keys would then be refused).
- Command service: `services/agent-receipts/contract.mjs` and `runtime.mjs` (the three routes `GET /internal/agent/loan-closes/quote/{loanId}`, `POST /internal/agent/loan-closes` and `GET /internal/agent/loan-closes/{requestId}`; contract 2, reviewed-only, same OIDC policy as `receipt-payments`), `services/payment-command/store.mjs` (`readLoanCloseQuote`) and `services/contracts/operation-command.mjs` (the PWA `loan.close` accepts the two optional keys, Bank Transfer only). `services/chat/assets/schema-digest.json` is regenerated at V136, so the chat image changes and starts a new chat history epoch, as in R119 and R120.
- PWA: `apps/pwa/src/LoanClose.tsx`, new `apps/pwa/src/close-recognition.ts` and `live-style.css`: account fill, amount match and mismatch note, already-recorded reference, new Bank reference field; Echo LC-UX-1 to LC-UX-9.
- Agent (see the agent note): `review_proposal.py`, `review_cycle.py`, `review_execution.py`, `receipt_api.py`, `partner_review.py`, `config.py`, `cli.py`, `scripts/deploy-runtime.py`, catalogue revision 36, Echo AG-13 to AG-23.
- Tests: `scripts/database/Test-AgentLoanClose.sql` (wired into `Test-StatementBatch.sql`), `tests/unit/close-recognition.test.mjs`, `tests/unit/agent-receipt-command.test.mjs`, `integration-agent/tests/test_review_close.py`.
- Deployment order (Archie and Byte): V136 and the command service first, then Hosting, then the agent code and the switch, because a server without V136 refuses the new keys.
- Docs: Release Tracker and Development Changes (R128 rows), Solution Design, PWA Data Model Overview, the Data Dictionary agent API definition, `integration-agent/docs/PARTNER_REVIEW.md`, `OPERATIONS.md` and `RECEIPTS.md`; `database/README.md` (V136 paragraph), `integration-agent/SERVICE_CATALOGUE.md` (revision 36 link) and `integration-agent/README.md`; the PostgreSQL routine definitions follow the V136 apply (see Remaining work).

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck`; `npm run build` (Byte, uncommitted tree on `3b8ee37`) | Pass |
| `npm test` (Byte) | 1168 pass, 1 skip (needs a DB port; passed against the lab) |
| biome (Byte) | Clean |
| `PYTHONPATH=src python3 -m unittest discover -s tests` in `integration-agent/` and `ruff` (Byte) | 787 pass, 70 skipped; ruff pass |
| `Test-AgentLoanClose.sql` and the full `Test-StatementBatch.sql` on a disposable V136 cluster (Byte) | Pass |
| `Test-MigrationsCloud.py --sql-only` (Byte) | Pass (136 migrations) |
| Echo UI pass at 390 px in Chromium with fixtures, and the DM texts read in code (AG-13..23, LC-UX-1..9) | Pass after fixes: LC-UX-D1 (Thai double dot, fixed in Loan Close and Receive payment), AG-20a (the close-failure line only for the change, day-passed and rejected reasons) and AG-20b (a neutral line for switch off and for the new STALE detail `LOAN_CLOSE_QUOTE_UNAVAILABLE` on a quote 404) |
| Byte fix batch after Chase (`close-recognition.ts`, `SelectedCharges.tsx`, `partner_review.py`, `receipt_api.py`, `review_proposal.py`, `review_cycle.py`, `test_review_close.py`, `close-recognition.test.mjs`) | 789 agent tests OK, ruff clean; focused node tests 16/16; typecheck and biome clean |
| Chase verification on `4d513ad`: chain to V136 on a disposable PG 18.6 cluster, second run a no-op, full `Test-StatementBatch.sql` including `Test-AgentLoanClose`, Rebate offset, Late charge, Atomic Loan Close, Access matrix and Chat | Pass |
| Chase: `database/current/public-functions.sql` drift check | Matches |
| Chase: concurrency probe (4 parallel resubmits, then a different payload) | The resubmits returned `applied` as replays, the different payload returned conflict, one payment only |
| Chase: real `readLoanCloseQuote` against `loan_close_calculation_v83` | `planHash` and `sourceVersion` equal; closed loan 422, unknown loan 404 |
| Chase: cross-language request id and posting (Python and Node) | Ids equal; applied, then replay, then status recorded; Bank Reference and Created At written |
| Chase: `npm test`, `tsc`, biome; agent unit tests | 1168 pass, 1 skip; tsc and biome clean; agent 787 OK, 70 skipped (before the fix batch) |
| Chase: Playwright desktop and mobile Chromium (back-consumers receipt controls, restored close receipt, phase5 F6, phase5 F12 twice) | 5/5 each |
| Chase verdict | PASS on `4d513ad` (before the fix batch; Chase's check of the fix batch follows if the orchestrator requests it) |
| `<PENDING: pull request Development checks run and head commit>` | Pending |
| `npm run check:docs` (Dewey) | Pass, 0 failures (before any later edit) |

## Not run
- The wide Playwright suite, the `*Concurrency` scripts and the Flyway checksum-mutation step (its harness JSON parse error came after the build and SQL had passed): the pull request CI covers them.
- A real-PostgreSQL proof of a referral-rebate close through the agent actor (mocks only; the SQL path is the same as the PWA's).
- Real iOS Safari, and live Instagram (there is no DEV agent; the first real "Loan closed" exchange in PROD is the acceptance).
- Not done by decision: AG-17 transfer-from-account (no data without a server change; deferred) and the AG-19 "paid through" date (optional, skipped).
A skipped check is not a pass.

## Recovery
- Agent: set `loan_close_execution_enabled` to false (configuration only) or `deploy-runtime.py rollback --commit <deployed>`; the agent note has the detail.
- PWA and command service: Hosting and Cloud Run revisions are in the Environment Inventory once deployed; the previous R127 versions stay available. <PENDING Forge: prior revisions and Hosting version>
- V136: functions only and immutable; roll forward with a later migration restoring the V135 definitions of `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2`. Backup reference: <PENDING Forge: verified backup at V135>.
- Git baseline: R127 `5f3bcaf`.

## Open questions
None. Kept as is: with the switch off a payoff approval stays `MANUAL_REQUIRED`, and the bank reference is kept when the slip is replaced, as on Receive payment.

## Remaining work
- Owner acceptance in PROD: the first real slip-matched loan close through Instagram, and the first Loan Close slip scan.
- The pay-forward "Remainder settles" note stays manual (deferred).
- After V136 is applied to PROD: refresh the PostgreSQL routine definitions for `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2` through the dictionary helper, and put the DEV and PROD apply times into the `database/README.md` V136 paragraph.

## DEV promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's instruction "Move to dev, test and promote to prod" (relayed by the orchestrator). DEV only here: no PROD action, merge or tag. There is no DEV agent, so the agent code is not deployed to DEV (see the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_2026-11-05.md#dev-promotion-record-forge-5-november-2026-utc)). No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Item | Result |
| --- | --- |
| Package | PR #249 head `832d908` (unmerged), from a clean clone; `Development checks` run 41987096715, Agent tests run 41987096724 (`test`, `lab`) and Database migrations run 41985211638 (on `4d513ad`; later commits touch no database path) green |
| Scope | V136, the read, command and chat images and DEV Hosting labelled R128. The generic changed-services rule gives read, command and chat (chat for the schema digest); notify and jobs stay on `4bda921c…` |
| Preflight | DEV at V135 (134 successful rows), V136 the only pending; neither routine patched; each of the four V136 replacement boundaries occurs once in the live DEV bodies; `pwa_submit_operation_v2` owned by `mw_app_dev_journal_owner`, `pwa_apply_loan_close_v2` by `postgres` |
| Backup at V135 | 07:28:37Z, archive listing and restore passed, 38 table fingerprints matched, dump sha256 `a081e020…98d3`, folder `dev-refresh-5c369e4572584d17bbeeb49476dc75a5` (`dev-backups/`) |
| Image | Cloud Build `4c0d5351` (`cloudbuild-command.yaml`, container smoke passed), 07:30:21Z to 07:30:59Z, digest `720d7cb6…b353` |
| Owner window | The five DEV owners (notify, jobs, ledger, changes, journal), 20 statements, 07:38:08Z to 07:50:58Z. The post-migrate reconcile then needed `mw_chat_owner_dev` as well (below), opened 07:43:04Z and closed 07:50:48Z (4 statements). Readback: `postgres` holds every DEV owner with inherit and set false again |
| V136 | Installed 07:38:35Z (3.2 s, checksum -1098120274) by `Invoke-Flyway.ps1 -Environment development -Command migrate` |
| Reconcile | The runner's post-migrate reconcile failed on its first run (07:41:50Z, `permission denied for table pwa_chat_threads`, one transaction, rolled back, nothing written): the five-owner window lacked the chat owner. With the chat owner window open, `application-role-cli.mjs --action post-migrate --apply` alone was rerun (as R091): 547 statements, 0 violations, 07:43:08Z to 07:49:56Z |
| Validate | `Invoke-CloudFlyway.py verify --target dev`: validation successful, head 136, nothing pending |
| SQL readback | Both routines carry the R128 marker; owners unchanged; ACLs `pwa_apply_loan_close_v2` {postgres, `mw_app_dev_journal_owner`, `mw_app_dev`}, `pwa_submit_operation_v2` {`mw_app_dev_journal_owner`, `mw_app_dev`}, no PUBLIC |
| Terraform | Plan with the R128 settings: 0 add, 3 change, 0 destroy (read, command and chat image only; the plan before the change was clean); applied 07:51:11Z to 07:51:46Z; re-plan no changes; settings generation `1793865141900575` (previous `1793806096697744`) |
| Revisions | read `00071-ljm`, command `00088-sg9`, chat `00040-flw` (100%) |
| Hosting | Build-version R128 `9a1c30728eebbf4e16b5fc35`, entry `/assets/index-DG8w5nqe.js`, embeds `832d908`; build settings identical to the live R126 bundle; `.env.live-dev` from Secret Manager, shredded after the build; `--check` passed (16 files); version `172e9094f02fb9b9`, release `1793865157386000`, 07:52:38Z |
| Smoke | `/health` 200 on read, command and chat; unauthenticated command 401 and chat models 401; CORS preflight 204; `/internal/agent/loan-closes` (POST, status GET) and `/internal/agent/loan-closes/quote/…` answer 404 unauthenticated and with a non-agent Google identity (the DEV agent API is off by design, so every `/internal/agent/` route is 404); both DEV origins serve build R128, `sw.js` 200 `no-store`; the entry bundle that carries Loan Close is served byte-identical; Loan Close quote (`close-preview`) 200 for an open synthetic loan as the DEV test Partner; recognition on Loan Close's route: a synthetic slip image ("SYNTHETIC TEST IMAGE - NOT A REAL TRANSFER") uploaded for the R101 synthetic borrower and read: `recognized`, amount 1234, reference `R128DEVSMOKE0001`, 2026-11-05 14:05, Bank Transfer, warning `account_unmatched`, Gemini; no ERROR logs on the three services 07:38Z to 07:54Z |
| DEV release manifest | `release-r128-v136-832d908.json` (private, sha256 `eb0c3051…a2b7`), commit `832d908`, 136 migrations, V136 sha256 `2ac2fe82…da72` |
| Not done on DEV | No Loan Close or payment was posted; the browser UI was not driven (Echo's built-UI check covers it); the agent close path has no DEV route |
| Rollback | Settings generation `1793806096697744` (image `c6609e5c…`) plus Hosting `cf0ed4a31026c97b` (R126); V136 stays (older commands remain valid), or restore the V135 backup |

Synthetic DEV records left in place: one receipt image (receipt `9dbb7ca4…`, request `5cb4d45e…`, sha256 `1bd9f0b4…`) for the R101 synthetic borrower `21c2c949…`, not attached to any payment.

## PROD promotion record (Forge, 5 November 2026, UTC)
<PENDING Forge: authority (the owner's instruction above), freeze package, baseline R127, verified backup at V135, V136, command image (read and chat if the shared image changes), Hosting, agent code on `vm-mw-credit-agent` with `loan_close_execution_enabled` on, readback, smoke, rollback, not deployed. No secret value or borrower data appears here.>

### Limitations
<PENDING>

### Tag record
<PENDING: tag `R128` on the package commit, workflow run.>

### Closure and prune record
<PENDING: closure pull request contents and deletions (R125 leaves the three-release window at R128 closure; repoint its inbound links to a permalink first).>
