# Change notes — receipt cycle speed, batch A (agent code), 20 October 2026

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
| Pull request `Development checks` and Agent tests | Run on the pull request after push; result recorded there |

## Not run
- The pull request's `Development checks` and Agent tests: they run after push and are recorded on the pull request.
- The real VM operator connection file, and an end-to-end freeze, install, activate on a host (the preflight was verified on disposable clusters only).
- Deployment to `vm-mw-credit-agent` (`update-from-github.sh`, `deploy-runtime.py` dry-run, freeze, install, activate): waits for the owner's go for the exact commit.
- Measurement (baseline before, repeat after deployment): read-only on the VM, not run in this session. The baseline and the job inspection were done read-only before the change (results in Changes and Remaining work); the after-deployment run is not done.

## Recovery
Revert the merge commit. Live (after deployment): `deploy-runtime.py rollback --commit <previous-pin>` restores the previous package from the freeze backup; config keys are optional and ignored by the older code. V7 stays applied: the older package ignores `accepted_at`, and the migration is immutable.

## Open questions
None. Owner decisions taken on 20 October 2026: no warm Cloud Run instance, agent focus, A2 default 60 s, A4 threshold 1 h, A6 cap 6, A7 policy, the `accepted_at` column, one pull request for both batches.

## Remaining work
- Owner go, then deploy batch A: `update-from-github.sh`, `deploy-runtime.py` dry-run and freeze, apply V7 with `scripts/agent-state-admin.py migrate` (verified restorable `mw_agent` backup first), `install --state-connection-file <operator file>`, `activate --state-connection-file <operator file>` (the operator file must be on the VM); then measure again.
- Repeat the read-only measurement query after deployment and add the "After A" column below.

Baseline, read-only on the VM over the last 30 days (counts and seconds only):

| Measure | Baseline | After A |
| --- | --- | --- |
| Automatic posts via conversation poll: capture to POSTED | 103 posts; median 85.7 s, p90 362 s, max 8,007 s | pending deploy |
| Automatic posts via webhook | 0 (27 historical backfill excluded) | pending deploy |
| Reviewer-approved posts, reply to POSTED | 0 (all 130 POSTED are automatic); no baseline | pending deploy |
| Poll capture lag | median 171 s, p90 279 s, max 4,294 s | pending deploy |
| Retried jobs | 2 (`RECEIPT_PROCESSING_STARTED`) | pending deploy |
| Jobs by status | IGNORED 175, REVIEW_REQUESTED 153, REJECTED 5, PENDING 1 | pending deploy |
| Cycle runs in `job_runs`, last 24 h | 288; average 3.9 s, max 21.1 s | pending deploy |

`job_runs` does not record every run, so the result-notice time is read from `partner_notices.accepted_at` after V7 (rows before V7 are NULL; the baseline has no value for it).

- Targets from the plan: reply to POSTED median under 20 s; DM receipt to POSTED median under 30 s; five receipts together terminal within one run; Gemini timeout retry within 30 s.
- Known remaining loop case (A4): an `ARCHIVED` asset whose stored hash does not match keeps deferring the job 300 s; only the one-hour delayed alert flags it. Decide whether it needs a terminal rule.
- Held receipts do not re-run automatically (later item, not in this plan).
- Pins go to the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host) after deployment.
