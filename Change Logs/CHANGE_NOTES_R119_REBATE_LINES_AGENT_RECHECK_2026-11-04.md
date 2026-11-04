# Change notes — R119 every rebate line and the agent recheck, 4 November 2026

## Purpose
The owner deferred three items from R118 into R119 (3 November 2026) and instructed "There're some items queued for R119. Fix them", then answered "include the held-slip auto recheck" and "take R119 all the way to PROD". Status: Released to DEV and PROD on 4 November 2026 under the owner's "All the way to PROD" (package `0a8a8cd`, PR #228, tag `R119`); PROD acceptance is pending the first real payment that closes two referred loans and the first borrower-master change. The scope is two parts: show every rebate when one payment closes several referred loans (PWA, API, push), and let the integration agent recheck slips once their cause is fixed in the app. The agent part has its [own note](../integration-agent/Change%20Logs/CHANGE_NOTES_R119_AGENT_RECHECK_2026-11-04.md).

## Changes
Scope:
- **Every rebate line.** Since R117 each closed loan gets its own rebate and offset (`ro122:<payment>:<loan>`), but the payment record and the push read only the first one (`LIMIT 1`). Both now show all of them.
- **Agent recheck.** An ignored group slip is processed once its sender becomes an enabled borrower, and a held slip is requeued once its cause is fixed (borrower enabled, cash account number added). It is behind a switch that is off until activated (switched on in PROD on 4 November 2026).
- **PREPARED route.** `receipt-reconsider` accepts a `PREPARED` job from `receipt-prepare`, so Gun's case no longer needs a database edit.

Design decisions (Archie):
- No new table or column. V134 adds one function, as the v2 to v3 step did.
- `closeRebate` stays as `closeRebates[0] ?? null`, so a phone on the old PWA bundle keeps working. The new array is read first when present.
- The dispatcher tries `pwa_notify_content_v4`, then v3, v2 and v1, so a dispatcher deployed before the migration still works.
- The recheck trigger is a change in the borrower master (a snapshot file next to the poll lock), not a bounded re-read of every ignored row. No database column; the first run only writes the snapshot.
- An ignored row becomes `BORROWER`, not a new outcome value, so the identity code is unaffected. Meta's changing message ids are matched by time within 5 seconds.
- The held recheck reuses the reconsider logic through one shared `requeue`, keeps the saved extraction (no new OCR), never reopens a decided review and runs at most once per change.

Files and objects:
- `services/business/payments.mjs`: `readPaymentRecord` returns `closeRebates` (every rebate, in Payment Allocations order, then loan id), each with `loanDisplayKey`; `closeRebate` is the first. The correction preview gets the same.
- `apps/pwa/src/PaymentRecord.tsx`: one `close-rebate-line` per rebate (English and Thai); falls back to `closeRebate`.
- `database/migrations/V134__notify_every_rebate.sql` (functions only): `pwa_notify_content_v4` is v3 plus a last column `rebates jsonb`, every rebate of the event as `[{amount, payee, payable}]`. Owner, SECURITY DEFINER, configuration, comment and EXECUTE grantees copy v3 (`mw_notify_owner_<env>`; EXECUTE only for `mw_notify_dispatch_<env>`). v1 to v3 are unchanged. Preflight, a "before" table and a self-check follow V124 and V131. `database/current/public-functions.sql` regenerated; `services/chat/assets/schema-digest.json` moves to 134.
- `services/notifications/dispatcher.mjs` and `content.mjs`: v4 to v1 fallback; payable rebates summed per referrer; one referrer keeps the single-rebate wording.
- Agent: `config.py`, `conversation_poll.py`, `receipt_recheck.py` (new), `receipt_reconsider.py`, catalogue revision 35, `deploy-runtime.py` (see the agent note).
- Tests: `tests/unit/payment-close-rebate-read.test.mjs`, `notification-content.test.mjs`, `notifications.test.mjs`, `pinned-ux-read-independent.test.mjs`; `tests/integration/rebate-offset-independent.test.mjs`; `tests/e2e/rebate-offset-independent.spec.ts` (two-rebate case); `scripts/database/Test-RebateOffset.sql` (two-loan case, rebates 30 and 20), `Test-LateCharges.sql` (v4 equals v3 apart from `rebates`), `Test-AccessMatrix.sql`; agent tests listed in the agent note.
- Docs: Release Tracker, Development Changes, Solution Design, `database/README.md`, agent `CONVERSATION_POLL.md`, `OPERATIONS.md`, `PARTNER_REVIEW.md`, `RECEIPTS.md`, the service catalogue.

UX codes (Echo, accepted by the owner's instruction):
| Code | Decision |
| --- | --- |
| PR-1 | Two or more rebate lines on the payment record are each prefixed with the closed loan's key, as the allocations show it (`Loan <key> closed · rebate …`; Thai `ปิดสินเชื่อ <key> แล้ว · …`). A single line is unchanged. |
| PR-2 | The lines follow the Payment Allocations order, then the loan id. |
| PUSH-1 | The push sums the payable parts per referrer (exact, in satang); only payable (above 0) parts count. One referrer keeps today's wording with the sum. |
| PUSH-2 | Two or more referrers share one line: `Rebates 30 to A and 20 to B, transfer from Lisa` (three or more: commas, then "and"). |
| PUSH-3 | Thai joins with `และ`: `ค่าแนะนำ 30 ให้ A และ 20 ให้ B โอนจาก Lisa`. |
| PUSH-4 | Length budget: amounts and "Lisa" are never cut; the borrower name is shortened first, then every payee to one equal length of at least 6, and if it still does not fit the line collapses to a total (`Rebates 50 total to 2 referrers, transfer from Lisa`; Thai `ค่าแนะนำรวม 50 ให้ผู้แนะนำ 2 ราย โอนจาก Lisa`). |

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` and the type check | Pass (Byte, working tree) |
| `npm test` | 1136 pass (Byte, working tree) |
| `ruff check --no-cache integration-agent` | Clean (Byte) |
| `PYTHONPATH=src python3 -m unittest tests.test_conversation_poll tests.test_receipt_reconsider tests.test_receipt_prepare tests.test_receipt_recheck` (in `integration-agent/`) | 51 tests OK (Byte) |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 738 tests OK (Byte) |
| `python scripts/database/Test-MigrationsCloud.py --sql scripts/database/Test-RebateOffset.sql` | Pass; the chain migrates to V134 (Byte) |
| `python scripts/database/Test-MigrationsCloud.py --sql scripts/database/Test-LateCharges.sql` | Pass; v4 equals v3 apart from `rebates` (Byte) |
| `python scripts/database/Test-MigrationsCloud.py` (default batch) | Pass at schema 134 (Byte) |
| Schema digest test | Pass at 134 (Byte) |
| Integration test `tests/integration/rebate-offset-independent.test.mjs` | 14/14 (Byte) |
| E2E desktop `tests/e2e/rebate-offset-independent.spec.ts` | 15/15 (Byte) |
| `tests/integration/rebate-offset-independent.test.mjs` on a fresh V134 cluster | 15/15 (Chase); includes his new test that the lines follow the Payment Allocations order, which fails when the ordering is put back to Row ID |
| `tests/e2e/rebate-offset-independent.spec.ts --project=mobile-chromium` | 15/15 (Chase, Pixel 7) |
| Probe of `renderNotification` over 800 combinations | Nothing over the 80-grapheme budget; "Lisa" always present; every amount present unless the total form was used (Chase) |
| Agent: conversation_poll tests; `receipt_reconsider`, `receipt_recheck`, `deploy_runtime` tests; `ruff` | conversation_poll 43 OK with 2 new (an ambiguous time match is left alone; the snapshot is kept when a scan raises); the others and ruff pass (Chase) |
| Chase review (adversarial, against Archie's test plan) | Done: no high-severity defect. One medium finding, fixed by Byte: the dispatcher's v4 to v3 fallback happens only on SQLSTATE 42883 or 42501, so another error no longer quietly shows only the first rebate |
| Pull request `Development checks` and agent CI (`test`, `lab`) | Pass on head `778558d`: `Development checks` run 41767072377 (check, lint, three e2e shards; terraform skipped, no infrastructure input) and agent-tests run 41767072409. `main` `0a8a8cd` has the same tree; its `Database migrations` push run 41768071404 passed (guards and the four rebuilds) |
| `npm run check:docs` | Pass at the closure push |
| DEV: V134 applied, images, Hosting, bounded smoke test | Pass (Forge), see the DEV promotion record |
| PROD promotion record | Pass (Forge), see the PROD promotion record; tag `R119` |

## Not run
- Live push on a device and the agent against live Instagram: not exercised before PROD. The first live evidence is the first PROD payment that closes two referred loans and the first borrower-master change after activation.
- A 320 px layout check, WebKit, and a real Instagram or PROD recheck.
- No PROD payment, forced notification or financial correction is part of the promotion.

## Recovery
- Before deployment: revert the commit. After deployment:
  - V134 adds only a function; dispatchers before R119 read v3, and a later migration may drop v4. The old PWA bundle reads `closeRebate`.
  - Agent: set `conversation_poll_recheck_enabled` to false (restore the saved configuration backup), or `deploy-runtime.py rollback --commit <deployed>`.
  - Database backup reference: `prod-promotion-849c25f15a3148df94df42bed7b92de5` (PROD at V133, 4 November 2026 03:57:02Z, restore passed); DEV `dev-refresh-3a91772124864bebaaabebdc35607360` (V133).

## Open questions
None. Known limitations, accepted:
- The schema digest moves to 134, which starts a new chat history epoch (as at 133).
- The ignored-slip match tolerates a Meta time skew up to 5 seconds; a larger skew misses the match, and that slip then stays ignored.
- The held-slip recheck needs `receipt_archive_enabled`, because the worker reads the archived original again; a hold with no archived image is skipped.
- A slip whose message id changed, with another message from the group within 5 seconds, is skipped as ambiguous and stays ignored.
- Re-enabling a borrower replays their ignored slips from yesterday and today (intended).
- On a run where the master changed, `receipt-worker.lock` is held for the whole scan, so the worker skips that minute.
- The push lists payees in expense Row ID order, while the payment record follows allocation order.
- A held job with no archived original is counted as `held_skipped_no_archive` and retried on the next master change.
- The switch `conversation_poll_recheck_enabled` was switched on in PROD after the deploy, on 4 November 2026 at 04:12:53Z (covered by "take R119 all the way to PROD").

## Remaining work
None for the promotion. Open: PROD acceptance (the first real payment that closes two referred loans; the first borrower-master change with the recheck on).

## DEV promotion record (Forge, 4 November 2026, UTC)
No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in the operator bucket under `promotion-packages/r119/dev/`.

| Item | Result |
| --- | --- |
| Scope | V134, the read, command, chat, notify and jobs images and DEV Hosting labelled R119, from `main` `0a8a8cd` (merge of PR #228 head `778558d`, identical tree), in a detached worktree |
| Backup at V133 | 03:39:56Z, dump sha256 `3bafef85…6ef3`, listing and restore passed, 38 table fingerprints matched, folder `dev-refresh-3a91772124864bebaaabebdc35607360` |
| Owner window | The five DEV owners, 20 statements, opened 03:42:52Z, restored 03:49:47Z; readback inherit, set and CREATE all false |
| V134 | `Invoke-Flyway.ps1 -Environment development migrate`, installed 03:43:07Z (2.7 s), head 134, 134 rows all successful; the post-migrate reconcile reported 0 violations |
| Readback | `pwa_notify_content_v4` owned by `mw_notify_owner_dev`, SECURITY DEFINER, `search_path=pg_catalog, public`, EXECUTE for `mw_notify_dispatch_dev` only; v1 to v3 unchanged |
| Image | One Cloud Build image (`6a237898`, DEV builder) from a `git archive` of `0a8a8cd` |
| Terraform | Read, command, chat and workers images; plan 0 add, 5 change, 0 destroy (image only), applied 03:52:54Z to 03:53:30Z. Notify and jobs change too: the dispatcher and `content.mjs` reach `services/workers/server.mjs` (the runner's input rule) |
| Hosting | DEV version labelled R119, embeds `0a8a8cd`, released 03:54:35Z; `--check` passed first |
| Smoke | `/health` 200 on read, command and chat; unauthenticated 401; preflight 204; authenticated `/api/collection` 200 and a payment record carrying `closeRebates` as the DEV test Partner; no ERROR logs from 03:53Z |
| Not deployed | The agent: there is no DEV agent target |
| Rollback | The R118 settings generation and the previous Hosting version (see the inventory); V134 adds only a function, else restore the V133 backup |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's "All the way to PROD" for R119, recorded under Purpose. No PROD payment, forced notification, chat write or financial correction. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in the operator bucket under `promotion-packages/r119/`.

| Step | Result |
| --- | --- |
| Freeze | `main` at `0a8a8cd` (merge of PR #228 head `778558d`, identical tree), detached worktree. Runner derivation from R118 `22712b0`: all five services, migration V134 only, no infrastructure change |
| Baseline (03:56Z) | `loan_manager_prod` head 133 on `mw-credit-pg-20261017` in `clever-oasis-508610-n7`; R118 image on all five services; Hosting R118; agent `5c61fc4` (PR #227, deployed after R118; not in the inventory before this record), catalogue revision 34 |
| Backup at V133 | `prod-promotion-849c25f15a3148df94df42bed7b92de5`, 03:57:02Z, dump sha256 `079fce41…fdcb87`, listing and restore passed, 38 table fingerprints match |
| SQL package | Release manifest `release-r119-v134-0a8a8cd.json` (`2c77fdd5…e163`); connect preflight 04:00:12Z (`1cc3581e…ba27`; 18 retained consumers, 0 DEV sessions); `check` 04:00:45Z: 0 writes, pending exactly V134 |
| Owner window | `mw_notify_owner_prod`, 4 statements, opened 04:01:10Z, restored 04:02:36Z (the restore was given the production arguments, so the R118 refusal did not repeat); readback inherit, set and CREATE false |
| V134 | `Invoke-CloudFlyway.py apply`, grouped transaction; installed 04:01:49Z (2.8 s, checksum 468740600, as DEV); head 134, 134 rows, 0 failed; `verify --target prod` clean (04:08:19Z) |
| SQL readback | `pwa_notify_content_v4` owned by `mw_notify_owner_prod`, SECURITY DEFINER, pinned `search_path`, the v3 comment, EXECUTE for `mw_notify_dispatch_prod` only (no `mw_integration_agent` grant); v1 to v3 and the history functions unchanged |
| Image | One Cloud Build image (`78b9f9eb`, PROD builder `mw-credit-app-build-prod`, `cloudbuild-business.yaml` smoke passed) from the same `git archive` of `0a8a8cd` as DEV |
| Terraform | Read, command and chat overrides plus `workers.image` (notify, jobs: runner input rule); plan 0 add, 5 change, 0 destroy, image only; applied 04:04:44Z to 04:05:19Z; re-plan no changes |
| Revisions | All five services Ready at 100% on the new image |
| Hosting | `--check` passed (applied package); the first `--apply` (04:08:37Z) was refused before any Hosting change because the manifest lacked the Cloud Build source object; after adding it from the build record, `--check` and `--apply` 04:09:10Z to 04:09:53Z, 16 files, `no-store`; build-version R119, the bundle embeds `0a8a8cd`; both origins; private receipt `R119-HOSTING-RECEIPT.json` |
| Agent | See the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R119_AGENT_RECHECK_2026-11-04.md#deploy-record): `0a8a8cd`, catalogue revision 35, `receipt_archive_enabled` confirmed on, the configuration backed up and `conversation_poll_recheck_enabled` on at 04:12:53Z |
| Smoke (read-only) | `/health` 200 on read, command and chat; unauthenticated 401 on `/api/collection` and `/api/chat/models`; preflight 204; no Cloud Run ERROR logs from 04:04Z to 04:10:51Z. v4 cannot be called without a leased delivery, so its query body was run read-only (the lease condition replaced by the event id) against two existing `payment.posted` events and rendered with `content.mjs`, no send: the 26 October event with two payable rebates to one referrer renders the summed amount (v3 would show only the first), Lisa named, 38 graphemes; the 3 November event with two offset-settled rebates renders no rebate line, as designed. The agent's first poll after activation (04:13:48Z) reported `recheck: snapshot_written` |

### Limitations
- PROD acceptance is pending: the first real payment that closes two referred loans (payment record and push) and the first borrower-master change with the recheck on.
- The push is not exercised on a device; the dry render ran locally on read-only data.
- The schema digest at 134 starts a new chat history epoch.
- No authenticated PROD read was made (no PROD Partner token).
- The agent deploy needed a temporary root-only `mw_agent` operator connection file again (as in R113 and R118); it was shredded afterwards.

### Tag record
Tag `R119` on `0a8a8cd9292c5284bff917f8bb347387e361e7c1` through Release tag workflow run 41772000221, dispatched 04:14:35Z, completed successfully; the same run published the GitHub Release.

### Closure and prune record
Closure pull request on branch `claude/r119-closure`, records only: tracker (R119 Released, R120 opened, next unused number R121), Development Changes (R119 follow-up row, R120 row), Environment Inventory (DEV and PROD rows), `database/README.md` (V134 applied), the Data Dictionary and this note with the agent note.
- Data Dictionary: PROD capture at 04:14:52Z; targeted reconcile of `pwa_notify_content_v3` and `pwa_notify_content_v4` (two new entries, evidence `project/outputs/dictionary-r119-20261104/`); `dictionary.py index` and `validate` pass (479 documents, 0 errors).
- Deleted: `Change Logs/CHANGE_NOTES_R116_WRITEOFF_SEGREGATION_2026-11-02.md` and `Change Logs/CHANGE_NOTES_R116_CASH_LEDGER_SORT_2026-11-03.md` (R116 left the three-release retention window). Their inbound links in the tracker, Development Changes, the Environment Inventory and the Solution Design were first repointed to the permalink at `0a8a8cd`.
- Kept: the R117 and R118 notes (inside the window).
- Kept: `project/outputs/dictionary-r116-20261103/` (seven Data Dictionary entries cite it as their source). `npm run check:docs`: 0 failures, 0 warnings.
- Also updated: the agent `SERVICE_CATALOGUE.md`, `docs/CONVERSATION_POLL.md` and `docs/OPERATIONS.md` now say the recheck is on in PROD.
