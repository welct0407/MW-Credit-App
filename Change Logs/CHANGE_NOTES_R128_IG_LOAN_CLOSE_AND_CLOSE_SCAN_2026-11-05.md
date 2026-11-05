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
| Pull request `Development checks` (run 41987096715, PR #249 head `832d908`: check, lint, e2e 1 to 3; terraform skipped) | Pass |
| `npm run check:docs` (Dewey) | Pass, 0 failures (before any later edit) |

## Not run
- The wide Playwright suite, the `*Concurrency` scripts and the Flyway checksum-mutation step (its harness JSON parse error came after the build and SQL had passed): the pull request CI covers them.
- A real-PostgreSQL proof of a referral-rebate close through the agent actor (mocks only; the SQL path is the same as the PWA's).
- Real iOS Safari, and live Instagram (there is no DEV agent; the first real "Loan closed" exchange in PROD is the acceptance).
- Not done by decision: AG-17 transfer-from-account (no data without a server change; deferred) and the AG-19 "paid through" date (optional, skipped).
A skipped check is not a pass.

## Recovery
- Agent: set `loan_close_execution_enabled` to false (configuration only) or `deploy-runtime.py rollback --commit <deployed>`; the agent note has the detail.
- PWA and command service: Hosting and Cloud Run revisions are in the Environment Inventory once deployed; the previous R127 versions stay available. PROD before R128: read `00045-7xg`, command `00050-r7q`, chat `00029-7lh` on `713c0638…` (settings generation `1793811235115849`) and Hosting `4b3a9f8a6f4605fc` (R126); DEV before R128: settings generation `1793806096697744` and Hosting `cf0ed4a31026c97b`.
- V136: functions only and immutable; roll forward with a later migration restoring the V135 definitions of `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2`. Backup reference: PROD `prod-promotion-1d5539c813444f73985a1b774b2a3936` (07:58:10Z, restore passed), DEV `dev-refresh-5c369e4572584d17bbeeb49476dc75a5` (07:28:37Z, restore passed).
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
Authority: the owner's instruction "Move to dev, test and promote to prod" (5 November 2026, relayed by the orchestrator), covering V136, the backup, the standard owner window, the images, Hosting, the agent code and `loan_close_execution_enabled` on. No authenticated PROD read or write, no PROD payment, close, forced DM or notification, backfill or financial correction. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in the operator bucket under `promotion-packages/r128/` (DEV under `dev/`).

| Step | Result |
| --- | --- |
| Freeze (07:56:48Z) | `main` at `aaad6a87ea04eb6545036177e9ac1cb5de403a9e` (merge of PR #249; tree `146222c0` equal to the tested and DEV-applied head `832d908`, `git diff` empty). Tracker re-read: R128 Open, next unused R129. Baseline R127 `ebc1e3e8` (tag peeled on origin). Runner derivation: read, command and chat; V136; no infrastructure |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod` (head 135, 0 failed), services `mw-credit-app-{read,command,chat,notify,jobs}-prod` (read, command and chat on `713c0638…` (R122), notify and jobs on `a66cbf29…`), Hosting site `mw-credit-prod-737787224638` on `4b3a9f8a6f4605fc` (R126), receipt storage `receipts/prod/` unchanged |
| Backup at V135 | `prod-promotion-1d5539c813444f73985a1b774b2a3936`, 07:58:10Z, dump sha256 `4f55d911…814a`, listing and restore passed, 38 table fingerprints |
| V136 preflight (read-only) | Neither routine patched; each of the four replacement boundaries occurs once in the PROD bodies; `pwa_submit_operation_v2` owned by `mw_app_prod_journal_owner`, `pwa_apply_loan_close_v2` by `postgres` |
| SQL package | Manifest `release-r128-v136-aaad6a87.json` (`Invoke-CloudFlyway.py prepare` at `aaad6a87`; migrations equal to the DEV manifest `release-r128-v136-832d908.json`); connect preflight 08:02:10Z (`f314a72d…2040`, 18 retained consumers, 0 DEV sessions); `check` 08:02:51Z: 0 writes, pending exactly V136, V136 sha256 `2ac2fe82…da72` as on DEV |
| Image | Cloud Build `9b2872c7` (PROD builder `mw-credit-app-build-prod`, `cloudbuild-business.yaml` smoke passed) of a `git archive` of `aaad6a87`, 07:58:18Z to 07:58:55Z, digest `7f81a5a3…5c9c` |
| Owner window | `mw_app_prod_journal_owner`, 4 statements, opened 08:03:51Z, restored 08:06:11Z; readback inherit and set false, no `CREATE` on `public` |
| V136 | `Invoke-CloudFlyway.py apply`, one grouped transaction 08:03:58Z to 08:05:17Z, installed 08:04:40Z (3.1 s, checksum -1098120274, as DEV); `verify --target prod` clean at 08:06:46Z, head 136 |
| SQL readback | Both routines carry the R128 marker; owners, security and ACLs unchanged (`pwa_submit_operation_v2` {journal owner, `mw_app_prod`}, `pwa_apply_loan_close_v2` {postgres, journal owner, `mw_app_prod`}) |
| Terraform | `runtime_image_overrides` read, command and chat; plan 0 add, 3 change, 0 destroy, plan JSON readback image only (`02a8f846…ede1`, JSON `05067530…d987`); applied 08:05:22Z to 08:05:59Z; re-plan no changes; settings generation `1793866043320442` (previous `1793811235115849`) |
| Revisions | read `00046-6j2`, command `00051-qc8` (Ready 08:05:46Z), chat `00030-9gb`; notify and jobs unchanged |
| Hosting | Generic runner as `mw-credit-unattended-admin`: `--check` passed (17 files), `--apply` 08:11:32Z to 08:12:16Z, version `dd257824b2924626`, release `1793866329424000`, build-version R128 `8c5456120c1860787ba6ede9`, entry `/assets/index-I86rpr55.js`, `no-store`, package sha256 `72832d8d…6b65`; receipt `R128-HOSTING-RECEIPT.json` |
| Agent | `aaad6a87` on `vm-mw-credit-agent`, catalogue revision 36, `loan_close_execution_enabled` on 08:17:19Z; see the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_2026-11-05.md#prod-promotion-record-forge-5-november-2026-utc) |
| Smoke (read-only) | `/health` 200 on read, command and chat; unauthenticated read, command and chat 401; CORS preflight 204; `/internal/agent/loan-closes`, its status and quote routes 401 unauthenticated (the PROD agent policy is loaded), an unknown method 404; both origins on build-version R128 embedding `aaad6a8`; `sw.js` 200 `no-store`; no ERROR logs on the five services 08:03Z to 08:20:27Z |
| CI receipts | Check and e2e from run 41987096715 (`832d908`); terraform from 41203206026 (`cb875ea`, input-equivalent); database guards and the four rebuilds from 41985211638 (`4d513ad`); agent `test` and `lab` from 41987096724 |
| Not deployed | Notify, jobs, Metabase, Terraform outside the three images, the receipt recognizer wiring (unchanged) |
| Rollback | Settings generation `1793811235115849` (read, command and chat on `713c0638…`) plus Hosting `4b3a9f8a6f4605fc`; agent `deploy-runtime.py rollback` and `config-only-change.py restore --tag r128-loan-close` (agent note); V136 stays (an older image sends commands it still accepts), or restore the V135 backup `prod-promotion-1d5539c813444f73985a1b774b2a3936` |

### Limitations
- PROD acceptance is pending: the first real Instagram loan close approval and the first Loan Close slip scan in PROD. No test close was made.
- No authenticated PROD read (no PROD Partner token): the Loan Close page and its recognition were exercised on DEV only.
- The PROD release manifest was prepared at `aaad6a87`, not `832d908`, because the guarded runner requires the checkout commit; its migrations equal the DEV manifest's.

### Tag record
Tag `R128` on `aaad6a87ea04eb6545036177e9ac1cb5de403a9e` (annotated tag object `b124262df3adbf5f97565019a4ab4ae21dd8932e`) through Release tag workflow run 41993563262 (08:19:26Z, success), which also published the [GitHub Release](https://github.com/welct0407/MW-Credit-App/releases/tag/R128) at 08:19:42Z.

### Closure and prune record
<PENDING: closure pull request contents and deletions (R125 leaves the three-release window at R128 closure; repoint its inbound links to a permalink first).>
