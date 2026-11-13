# Change notes — Review request built before the review row, agent (R152), 13 November 2026

## Purpose
Owner decision of 13 November 2026, "yes, fix it in R152", for the known limit recorded in the [R151 receipt note](CHANGE_NOTES_R151_RECEIPT_SENDER_FALLBACK_2026-11-13.md): when an approval request text is too long to send, the reserved `partner_reviews` row stays `PENDING` with nothing sent, the resend list shows it as a request and hides the hold, and the Reviewer gets only a hold alert. Fix: build every request text before the review row and the notices are reserved, so a failed build leaves a plain hold and no review row. PROD fact (Forge, 13 November 2026): 0 rows were ever affected and there are 0 `REVIEW_REQUEST_TOO_LONG` jobs. Nothing is deployed.

## Changes
As built.
- `src/mw_integration_agent/review_cycle.py` (Byte, commit `0097d973`): `propose_validated` builds every reviewer's request (Corrected-request prefix and length check) before it reserves the review row and the notices. On a build failure there is no row and no request notice; the job goes to `REVIEW` with the hold alert. A request that is too long holds as `REVIEW_REQUEST_TOO_LONG` (alert "approval request was too long"); other build failures still hold as `RECEIPT_PROPOSAL_UNAVAILABLE`. Automatic payment is unchanged.
- Audit: this was the only reserve-before-build site; loan close, pay-forward options and reconsider/recheck go through it; the options re-send and the `review` command re-send are unchanged.
- Tests: three new in `tests/test_review_cycle.py` (standard request too long, Corrected-prefix request too long, second reviewer fails), all failing on `5b07ebdb`.
- Documents (Dewey): `integration-agent/docs/PARTNER_REVIEW.md`, the R151 receipt note (known limit now fixed in R152), `project/Documents/Release_Tracker.md` and this note.
- Not changed: SQL, the command service contract, the catalogue (revision 38), the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's `ruff` 0.16.8 | Pass (clean export of `b0814b86` plus the patch, identical to `0097d973`) |
| Byte's focused review and payer modules | 188 OK |
| Byte's full `python -m unittest discover -s tests` | 970 OK, 74 skipped (lab suites) |
| Chase's PostgreSQL 18 lab scratch test (on `0097d973`) | Pass: `cycle()` with a `VALIDATED` job whose request is too long gives job `REVIEW` / `REVIEW_REQUEST_TOO_LONG`, 0 `partner_reviews` rows, only a `receipt-held:` notice and no `review:` notice, failures empty |
| Chase's adversarial review | Pass, no findings: the automatic-payment and `STALE` branches precede the change; `REVIEW_PROPOSAL_CHANGED` is still raised after all texts are built; no row means no notice and no reply match; `pending_items` lists a hold; all-or-nothing across reviewers; keyed reserves are idempotent |
| `npm run check:docs` (Dewey) | |
| CI on the pull request | |
| PROD verification | See the PROD promotion record |

## Not run
- Cleanup of old `PENDING` rows without a notice: not changed; PROD has none (read on 13 November 2026: 0 review rows tied to held jobs).

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's answers of 13 November 2026, "yes, fix it in R152", "include the upcoming fix of group chat … as before, you handle the merge and promotion" and "yes, apply V13 in the R152 deploy", relayed by the orchestrator as the scoped PROD approval for R152: a verified `mw_agent` backup, agent V13, the agent deploy, one `--mark-all` and the technical records. No business SQL, Terraform, configuration or catalogue change; no payment, notice, cycle or model call was forced. No secret value, token, chat text, borrower name, username or amount appears here. Both R152 agent items ship in this deploy; the [group chat summary note](CHANGE_NOTES_R152_GROUP_CHAT_SUMMARY_SENDERS_2026-11-13.md) points here. Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `cd4c721b95d58bd4f3e06c90be667fc1a212f062` (merge of PR #315, which includes the PR #314 merge `2c7c84f9`; baseline R151 `e0a08916`). CI: PR #315 head `46e8f3ef`, `Agent tests` run 43459797787 (test, and lab with V13) and `Development checks` run 43459797650; PR #314 head `e84bc3cf`, `Agent tests` run 43457289146 and `Development checks` run 43457289085 |
| Dry run | Host `vm-mw-credit-agent` over IAP SSH as `codex-cloud`. Checkout `e0a08916` to `cd4c721b` by `update-from-github.sh`; 16:13:16Z: 4 modules changed (`conversation_poll`, `group_chat_summary`, `review_cycle`, `state`), none added or removed, units unchanged, agent schema shipped through V13 and applied through V12 (`missing: [13]`, no drift), live and repository catalogue revision 38 with the same `implemented` flags |
| Freeze | `deploy-runtime.py --release R152` 16:13:44Z (rollback directory `runtime-20261113T161344507496Z`); all worker timers and the wake path inactive |
| Backup | `integration-agent/scripts/backup-agent-database.py` from the cloud session through the IAP tunnel (`--source-sslmode disable`, PostgreSQL 18 client tools), 16:13:52Z to 16:15:16Z: dump of `mw_agent` restored into a disposable PostgreSQL 18.6 cluster and compared: `restore_verified` true, 28 tables, 246,942 rows matched. Dump sha256 `cea26b6e3c73b00b2fd24a3cb52d1f1c9e4db1b5fdc46571b0f38d8d69b2312b` (19,781,769 bytes), stored with its verification file at `gs://mw-credit-operator-private-737787224638/prod-backups/agent-r152-v13-20261113T1614Z/` (bucket lifecycle 180 days); the local copies, the lab cluster and the private password file were removed |
| Agent V13 | `agent-state-admin.py migrate` as root with a temporary root-only operator connection file (`postgres` through the 5432 proxy, password from Secret Manager on stdin, never printed), 16:15:44Z to 16:15:45Z: applied `V13__group_chat_summary_members.sql` (checksum `2d0ed1506c02…`). Read-back (read identity): schema history top V13; `runtime.group_chat_summary_state.member_borrower_ids` text, not null, default `'[]'`; 36 rows, all `'[]'` |
| Install and activate | install 16:15:57Z to 16:16:01Z (no files removed, no unit changes; installed names and hashes equal source, so the PR #314 `review_cycle` order is live), activate 16:16:01Z to 16:16:05Z (probe `681efb09-e696-4154-b668-94b0794de8d1`), seven timers and the wake path resumed; operator file shredded 16:16:05Z. Chat relay restarted by hand 16:16:05Z; `check` exit 0; `/ready` and both `/healthz` report R152 and `cd4c721b`; configuration unchanged apart from `code_version` and `code_release`. Poll and receipt cycles after the deploy: no failures, 0 failed units. Rollback: `deploy-runtime.py rollback --commit cd4c721b95d58bd4f3e06c90be667fc1a212f062` (restores `e0a08916`); V13 stays (forward only; the column has a default, so the older package is unaffected) and the backup above is the restore point |
| Re-run | Summary timer stopped and its service inactive (last run idle); `group-chat-summary --mark-all` as `mwagent` 16:16:20Z to 16:16:24Z (exit 0): 42 conversations, 6 small, 0 ambiguous, 0 incomplete, 36 groups, 36 marked, 0 already due; timer started again 16:16:24Z |
| Cycles | Eight runs to about 16:38Z, then idle: 39 due (36 groups plus 3 retries), 35 summarised, 4 failed (`MODEL_OUTPUT_INVALID_HEADLINE_LENGTH`, one group each), 0 deferred; outcomes 8 stored, 27 cleared, 0 unchanged, 0 superseded (so no second `--mark-all`). Three of the four groups completed on the normal backoff; one group was still waiting at the read-back (2 attempts, next attempt 16:49:07Z, retried by the timer without manual action) |
| Read-back | `runtime.group_chat_summary_state`: 36 rows, 35 with a non-empty `member_borrower_ids`, 1 still due later with `last_error` (the group above). The incident group: its state row lists 2 member borrowers including the expected borrower, summarised 16:33:55Z with no error; in `pwa_group_chat_summaries` it has one row, for that borrower (last speaker role `partner`), and the referrer has no row at all (before: the referrer's card showed this group). `pwa_group_chat_summaries`: 9 rows, 9 conversations, 0 shared. Journal result lines carry counts, conversation-key hashes and codes only: no chat text |

## Recovery
Revert the pull request and redeploy the previous agent commit; no data, schema or configuration changed.

## Open questions
None.

## Remaining work
the PROD record; owner acceptance is not separately needed (no visible behaviour changes unless a request is too long).
