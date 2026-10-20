# Change notes — receipt cycle speed, batch A (agent code) (R082), 20 October 2026

## Purpose
Owner plan of 20 October 2026: cut the Debian agent's receipt handling from about 30–60 s after capture to about 10–20 s for automatic posting and reviewer approval, with agent code only. Batch B (wake path unit and one-minute conversation poll) has its own note: [wake and poll](CHANGE_NOTES_RECEIPT_WAKE_AND_POLL_2026-10-20.md).

## Changes
- A1 `src/mw_integration_agent/receipt_run.py`, `review_cycle.py`: a `Run` object with phase methods; a review is executed at most once per run; run order is ingest, expire, replies, execute, notify, images, propose, execute, notify, projection, so an approval no longer waits behind an image.
- A2 `receipt_run.py`, `config.py`: all pending images under `receipt_cycle_image_budget_seconds` (integer, default 60, allowed 10–180); controls re-read per image; a master failure defers the job 300 s; `pending()` takes an exclude list; with Partner review off the image loop runs first as before.
- A3 `receipt_journal.py` (`retry(delay)`), `receipt_run.py`: retry ladder for `RECEIPT_PROCESSING_UNAVAILABLE` (next run, then 60 s; attempt 3 still REVIEW); 300 s kept for the other codes; a job deferred in a run is not re-picked in it.
- A4 `receipt_run.py`, `receipt_hold.py`, `partner_notice.py`: archive exit, `SOURCE_UNAVAILABLE` / `INTEGRITY_CONFLICT` end REVIEW `RECEIPT_ARCHIVE_UNAVAILABLE` with the existing hold alert in both languages; `receipt_archive_alert_seconds` (integer 600..86400, default 3600) sends a "Receipt delayed" alert (key `receipt-archive-pending:<job>:<reason>`) on a long PENDING archive without changing the job. Investigation of the 18 October 16:57:47Z job (read-only, VM): PENDING / `RECEIPT_ARCHIVE_PENDING`, 0 job attempts, asset `SOURCE_PENDING`, 9 archive attempts, last error `RECEIPT_DOWNLOAD_FAILED` (probably an expired Instagram URL); it would reach `SOURCE_UNAVAILABLE` at 11 attempts and then loop forever before this change. Decision: no extra terminal rule; the one-hour alert (key `receipt-archive-pending:<job>:<reason>`, reason the asset's last error code, text says no reply needed, replies ignored) informs the reviewers, and terminal states exit to REVIEW `RECEIPT_ARCHIVE_UNAVAILABLE`, which clears the job's source URL and image (the reviewer asks the borrower to resend). Other terminal codes: `RECEIPT_SOURCE_MISSING`, `RECEIPT_SOURCE_CONFLICT`, `RECEIPT_SPOOL_MISSING`.
- A5 `receipt_run.py`, `review_cycle.py`, `partner_notice.py`: a `Directory` caches the conversation directory pages for the whole run (a few minutes old at the post-image checks with a 60 to 180 s budget) for identity and notice recipients; profile lookups and forwarded-group reads stay live; a failed read is not cached; fail-closed rules unchanged.
- A6 `review_cycle.py`: result notices of reviews POSTED in this run go first; cap six per notify pass (was two), two passes per run; order: this run's terminal results, other results, hold-reply/command results, review requests, held alerts, archive-pending alerts.
- A7 `review_proposal.py` (`same_posting_outcome` replaces `same_proposal_facts`), `review_cycle.py`: approval survives a charge edit when the posting outcome is unchanged; detail `FACTS_CHANGED_SAME_OUTCOME` (`OWNER_AUTHORIZED_AUTO_PAYMENT:FACTS_CHANGED_SAME_OUTCOME` for automatic rows); a fresh Loan Close ends MANUAL_REQUIRED with `LOAN_CLOSE_REQUIRED`; the result notice gets a one-line note. Label-only changes (the loan display key) do not count as facts changes. The detail is written only at terminal states; the posting audit plan records `requestId`, `reviewId`, `mode` and `factsOutcome`; the payload hash is unchanged; a not-yet-delivered request is still sent after a same-outcome edit. The rule that interrupted proposals with changed facts become STALE is unchanged.
- Other source: `receipt_api.py`, `config.py` (key validation). Tests: `test_review_cycle`, `test_receipts`, `test_receipt_archive`, `test_hold_reply`, `test_receipt_identity`, `test_review_execution`, `test_native_receipt_facts`, `test_receipt_transport_retirement_independent`.
- `config.example.json`: `receipt_cycle_image_budget_seconds` and `receipt_archive_alert_seconds`.
- Docs: `docs/RECEIPTS.md` (run order, image budget, retry ladder, archive exit, directory read, notice cap, two settings rows), `docs/PARTNER_REVIEW.md` (A7 revision replacing "changed facts invalidate approval"; one image per cycle sentence; archive hold reason), `docs/RECEIPT_EVIDENCE.md` (archive exit).
- Measurement column (owner decision 20 October 2026, replacing the plan's "no new column" and the earlier open question): `database/migrations/V7__notice_accepted_at.sql` adds nullable `runtime.partner_notices.accepted_at timestamptz` to the agent state database `mw_agent`; no backfill. `partner_notice.py` sets it only when Instagram becomes ACCEPTED or the email fallback becomes SENT, otherwise it stays NULL; the SQLite journal gets `accepted_at REAL`. Tests: `test_partner_notice`; lab suites `test_postgres_state`, `test_state_migration_postgres`, `test_audit_retention_postgres` (latest version V7). Docs: `docs/POSTGRESQL_OPERATIONS.md` (agent V7 section), `docs/OPERATIONS.md` (deploy order).
- `scripts/deploy-shared-receipt-api.py` (shared engine, so `deploy-runtime.py` too): agent schema preflight in `install` (after the freeze checks, before pip) and `activate` (before the probe and config write). It refuses when any shipped migration is missing or mismatched (version, name, checksum) in `deployment.schema_history`; a database ahead of the package passes; SQLite-state hosts skip it; `freeze` and `rollback` do not run it. It reads the history read-only through the operator connection file given with `--state-connection-file` (no new grants; prints only version, name and checksum); a Postgres host refuses without the file. `dry-run` reports `agent_schema`. Tests: `test_deploy_shared_receipt_api`, `test_deploy_runtime` (50 tests with the systemd units, all pass).
- No new service, no catalogue revision, no unit change, no business-database change. The delivery is one pull request (`claude/receipt-wake-and-poll`) for batch A, this column and [batch B](CHANGE_NOTES_RECEIPT_WAKE_AND_POLL_2026-10-20.md); batch B's units are enabled in their own window after batch A.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 636 tests OK, 86 skipped (lab suites) on the combined tree including V7 and the preflight (Chase, uncommitted tree before the final commit); earlier runs: batch A alone 612 OK, 85 skipped |
| `ruff check --no-cache integration-agent` | Clean |
| Lab suites against a disposable PostgreSQL 18 cluster | 11 modules including the fresh-cluster ones (`MW_AGENT_FRESH_PG_DSN`): 123 OK, 0 skipped on disposable PostgreSQL 18 clusters; `receipt_payment` audit plan verified on PostgreSQL |
| Canonical migration runner on disposable clusters | V1 to V7 on a fresh cluster; V7 alone on a V6-populated cluster; reruns apply nothing |
| Agent schema preflight on disposable clusters | Checksums equal what `migrate` records; refuses a cluster one migration behind and passes after V7; a database ahead of the package passes; no secret printed |
| `npm run check:docs` | 0 failures, 0 warnings |
| Pull request `Development checks` and Agent tests | PR #101 head `d5034e6` (input-equivalent to merge `7716176`): `Development checks` run 39456537628 success (check, lint, e2e and terraform skipped, agent-only); agent tests run 39456537639 success (unit and lab); `Database migrations` run 39456528336 guards success, rebuild skipped |
| Deploy of batch A with V7 on `vm-mw-credit-agent` (16:25Z to 16:39Z, 20 October 2026) | Backup `mw_agent-before-r082-20261020.dump` restore-verified (33 tables, 702,060 rows); checkout `7716176`; dry-run `agent_schema` showed missing `[7]`, so install would have refused (preflight worked); freeze 16:29:40Z; `migrate` applied V7 16:29:48Z; install 16:29:59Z (schema check passed); activate 16:30:10Z, `/ready` true at `7716176`, workers paused about 30 s |
| After the deploy, 16:30Z to 16:39Z | 21 receipt runs, 0 failures; no failed units; monitor all 1 except `receipts` 2, the same as before the deploy (the 18 October archive job) |

## Not run
- Lab suites on the VM and any real-receipt timing: the after-deployment measurement needs real receipts and is not done (follow-up row in Development Changes).
- The 18 October 16:57:47Z job was not changed by the deploy: it is still `PENDING`; it now gets the one-hour delayed alert and becomes REVIEW `RECEIPT_ARCHIVE_UNAVAILABLE` when the archive gives up.
- Owner real-device or reviewer-approval check of the new run order: no real capture happened in the verification window.

## Recovery
Revert the merge commit. Live: `deploy-runtime.py rollback --commit 771617637b34e9a99ee9b218b067a31eeee93076` restores `55964c7` from the freeze backup `runtime-20261020T162940148900Z`; config keys are optional and ignored by the older code. V7 stays applied: the older package ignores the nullable `accepted_at` column, and the migration is immutable. The `mw_agent` backup is in the private operator bucket under `promotion-packages/r082/`.

## Open questions
None. Owner decisions taken on 20 October 2026: no warm Cloud Run instance, agent focus, A2 default 60 s, A4 threshold 1 h, A6 cap 6, A7 policy, the `accepted_at` column, one pull request for both batches.

## Remaining work
- Deployed (batch A with V7, 20 October 2026): pins and rollback are in the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host).
- After-deployment measurement (one follow-up row in Development Changes): wait for the first real receipt and reviewer approval, rerun the read-only query, and read the result-notice time from `partner_notices.accepted_at`; then fill the "After A" column below. It does not block R082 Released.
- Watch the 18 October 16:57:47Z archive job: still `PENDING`, now alerted after one hour, REVIEW `RECEIPT_ARCHIVE_UNAVAILABLE` when the archive gives up.
- Known remaining loop case (A4): an `ARCHIVED` asset whose stored hash does not match keeps deferring the job 300 s; only the one-hour delayed alert flags it. Decide whether it needs a terminal rule.
- Held receipts do not re-run automatically (later item, not in this plan).

Baseline, read-only on the VM over the last 30 days (counts and seconds only):

| Measure | Baseline | After A |
| --- | --- | --- |
| Automatic posts via conversation poll: capture to POSTED | 103 posts; median 85.7 s, p90 362 s, max 8,007 s | pending real receipts |
| Automatic posts via webhook | 0 (27 historical backfill excluded) | pending real receipts |
| Reviewer-approved posts, reply to POSTED | 0 (all 130 POSTED are automatic); no baseline | pending real receipts |
| Poll capture lag | median 171 s, p90 279 s, max 4,294 s | pending real receipts |
| Retried jobs | 2 (`RECEIPT_PROCESSING_STARTED`) | pending real receipts |
| Jobs by status | IGNORED 175, REVIEW_REQUESTED 153, REJECTED 5, PENDING 1 | pending real receipts |
| Cycle runs in `job_runs`, last 24 h | 288; average 3.9 s, max 21.1 s | pending real receipts |

`job_runs` does not record every run, so the result-notice time is read from `partner_notices.accepted_at` after V7 (rows before V7 are NULL; the baseline has no value for it).

## Promotion record

Release R082, agent only (no Hosting, Cloud Run or business-database change), frozen 2026-10-20T16:23:47Z.

- **Authority:** the owner's production instruction of 20 October 2026, "go ahead with Batch A and B and deploy once R081 is out", relayed again by the R081 session as "go ahead". It covers the agent migration V7 on `mw_agent`, the verified backup, the standard freeze and the required technical records. It does not cover a Cloud Run warm instance, the receiving page, financial corrections or forced notifications.
- **Package:** main `7716176` (PR #101 merge). CI ran on the PR head `d5034e6`, input-equivalent to the merge: see Checks. The sibling note [wake and poll](CHANGE_NOTES_RECEIPT_WAKE_AND_POLL_2026-10-20.md) covers batch B.
- **Sequence:** batch A with V7 first: `update-from-github.sh`, `deploy-runtime.py` dry-run and freeze, verified `mw_agent` backup, `scripts/agent-state-admin.py migrate`, `install` and `activate` with `--state-connection-file`, then verify. Batch B in its own window after A is verified: the one-minute poll timer (manual install after a copy of the host timer) and `mw-receipt-wake.path`. R082 is Released only when both are applied.
- **Recovery:** see Recovery above; pins and rollback go to the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host) after deployment.
- **Follow-up:** the after-deployment measurement needs real receipts and stays one follow-up row in Development Changes; it does not block Released.

Deployment (R082, agent only), 20 October 2026. Batch A with V7: backup `mw_agent-before-r082-20261020.dump` (sha256 `caff614166aef6cf2a28b6d5ab208872cb2f4981c4ca7a6918b7caee15e08229`), 16:25Z to 16:28Z; freeze 16:29:40Z; V7 applied 16:29:48Z (checksum `7dff9fb95e2f124fe05eee554b40778992585727d6d5af6f93f19444670f5b3d`); install 16:29:59Z (changed `mw-receipt-summary.service` and `mw-receipt-wake.path`); activate 16:30:10Z. Operator access was a temporary root-only connection file with a one-hour IAM token, removed after batch B. Batch B: see the [batch B note](CHANGE_NOTES_RECEIPT_WAKE_AND_POLL_2026-10-20.md). Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host).

### Closure pruning (release workflow, 20 October 2026)
- Deleted `Change Logs/CHANGE_NOTES_R079_RECEIPT_AMOUNT_COMMA_2026-10-20.md` (R079 is outside the retention window of R082, R081 and R080); its tracker link now points to commit `7716176`, where it still exists.
- Deleted the two R082 rows from Development Changes; one follow-up row for the measurement remains. Agent change notes are not pruned.
