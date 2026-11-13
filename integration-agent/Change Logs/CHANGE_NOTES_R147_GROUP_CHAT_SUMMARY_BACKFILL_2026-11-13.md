# Change notes — Group chat summary backfill (R147), 13 November 2026

## Purpose
Owner instruction of 13 November 2026: "I want the summary to be updated based on the existing messages in each group as per the defined summary window". R146 switched the summary on with its cutoff at the activation time, so a group shows a summary only after new substantive text arrives. This batch lets the existing cycle summarise the last 3 days of every eligible group once, and moves the cutoff back so that window is not cut short. Integration agent only; nothing is deployed.

## Changes
As built (Byte), final numbers pending Chase's review.
- `src/mw_integration_agent/group_chat_summary.py` (`mark_all`) and `cli.py`: the one-shot `group-chat-summary --mark-all`, on the same `run()` path. Refused with `GROUP_CHAT_SUMMARY_DISABLED` (switch or catalogue off), `GROUP_CHAT_SUMMARY_DEPENDENCY_DISABLED` (poll or shared receipt API off) and `GROUP_CHAT_SUMMARY_OPTIONS_EXCLUSIVE` (with `--dry-run`); `already_running` if the lock is held; inside the job fence (`JOB_OWNER_ACTIVE_OR_UNRESOLVED` while a timer run is active, so run it between firings or with the timer paused). Audit activity `group_chat_summary_mark_all` with plan `{"fields":"id,participants"}`; job record `{marked, groups}`. It reads `id,participants` only, skips small, ambiguous and no-subject groups, and a group whose participant list is paginated (counted as `incomplete`, nothing marked, the run continues; `--dry-run` is unchanged and still raises on a paginated list), and per group inserts the state row if missing and sets `changed_at` only where empty; it never touches `last_text_at`, `attempts` or `next_attempt_at` and makes no model call or post. Output is exactly `conversations`, `small`, `ambiguous`, `incomplete`, `groups`, `marked`, `already_due`; idempotent. Marked groups have no `last_text_at`, so they are due at once; the cycle takes 5 per 2-minute run, and a routine-only window gets a prune-only post with no model call.
- PROD configuration (Forge, at promotion, first): `group_chat_summary_cutoff` moves back to `2026-11-10T00:00:00+00:00`, so the 3-day window governs. Order matters: with the cutoff left at the activation time, marked groups read nothing before it and end as prune-only posts. Then the VM command `mw-integration-agent group-chat-summary --mark-all --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json`.
- Documents (Dewey): `docs/OPERATIONS.md` (the backfill step in the activation order), `docs/CONVERSATION_POLL.md` (the cutoff is now the earliest message ever read; a window never reaches before it), `SERVICE_CATALOGUE.md` prose, this note, and the release tracker (R147 scope).
- Not changed: the catalogue, the configuration schema, migrations, systemd units, SQL, the command service, the read path, the PWA, Terraform and infrastructure.

## Checks
| Command | Result |
| --- | --- |
| Byte's unittest `test_group_chat_summary`, `test_cli`, `test_postgres_state` | 99 OK (34 lab tests skipped without the lab), before the `incomplete` change |
| Byte's `python -m unittest tests.test_group_chat_summary tests.test_cli` after the `incomplete` change | 57 OK |
| Byte's agent lab PostgreSQL suites | 43 OK, before the `incomplete` change; `test_postgres_state` counts updated, not rerun (the pull request's lab job runs it) |
| Byte's state migration and retention tests | 23 OK, 2 skipped |
| Byte's `ruff` | Pass |
| Chase's review | Pass: diff review and a fake-API/SQLite probe. Only `id,participants` requested; a sentinel text never reached state or stdout; a two-person chat counted small, a duplicate username ambiguous, a referrer-only group skipped; a row in backoff unchanged; a second run marked 0 and `already_due` 2; in the next cycle a routine-only group got a prune-only post with no model call and was cleared, vanished subjects took the empty-list prune, and `due()` returned 5 of 12 |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request | Pass: `Development checks` run 43343023088 and `Agent tests` run 43343023109 on `f5266a34` |
| PROD verification | Pass, see the PROD promotion record |

## Not run
- The wide Playwright suite and the database CI: no PWA or SQL change.
- A live Claude call and live Instagram shape for the backfill: `--mark-all` itself makes no model call; the live Claude calls happen in the cycles that follow it, in PROD.
- DEV: there is no DEV agent, so the command is proven by unit and lab tests only.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's instruction of 13 November 2026 ("I want the summary to be updated based on the existing messages in each group as per the defined summary window"; the owner chose "Merge #301, ship to PROD"), relayed by the orchestrator as the scoped PROD approval for R147: the agent deploy, the cutoff change, one `--mark-all` run and the technical records. Agent only: no SQL, image, Hosting or Terraform change. Nothing was forced: no manual cycle, model call or post. No secret value, token, chat text or borrower data appears here. Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `a2fc30abd9e19354d5eebf4ffc26e8be29d6aedb` (merge of PR #302 on R146 `e80e1238` plus the R146 closure `3eb657e9`); CI `Development checks` run 43343023088 and `Agent tests` (test and lab) run 43343023109 on `f5266a34`. Changed agent modules: `cli.py`, `group_chat_summary.py` |
| Target | Host `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, identity `mw-integration-agent@`), agent database `mw_agent`, business database `loan_manager_prod` on `mw-credit-pg-20261017` (system id `7685391508477894672`), over IAP SSH as `codex-cloud` |
| Deploy | Checkout `e80e1238` to `a2fc30ab` (`update-from-github.sh`). Dry run: agent schema through V12, nothing missing. `deploy-runtime.py --release R147`: freeze 01:16:03Z (rollback directory `runtime-20261113T011604192350Z`; the summary timer was paused with the others), install 01:16:21Z, activate 01:16:26Z to 01:16:31Z (probe `ab4968f9-f6e6-4978-98ae-9866f470085e`), timers resumed. Catalogue revision 38 with `group_chat_summary` enabled (unchanged); `check` exit 0; `/ready` and the recognizer `/healthz` R147 and `a2fc30ab`; the chat relay reported R147 after the config change restarted it. The temporary operator file was shredded |
| Cutoff | `config-only-change.py apply --tag r147-gcs-cutoff` 01:16:49Z to 01:17:01Z: only `group_chat_summary_cutoff`, `2026-11-13T00:34:02+00:00` to `2026-11-10T00:00:00+00:00` (field-by-field diff); `check` exit 0 |
| Backfill | Timer stopped, then `group-chat-summary --mark-all` as `mwagent` 01:17:10Z to 01:17:15Z (exit 0): 42 conversations, 6 small, 0 ambiguous, 0 incomplete, 36 groups, 36 marked, 0 already due. Timer started again 01:17:15Z |
| Cycles | Nine timer runs 01:19:53Z to 01:38:10Z (five groups per run, then idle): 36 due, 36 summarised, 0 failed, 0 deferred; outcomes 12 stored, 24 cleared (a window with only routine messages posts prune-only), 0 unchanged, 0 superseded; no error codes. All exit 0 |
| Read-back | `pwa_group_chat_summaries`: 12 rows from 12 conversations, 0 shared, 12 with the last message within 72 hours, model `claude-opus-5-5`, generated 01:18:32Z to 01:26:57Z; last speaker borrower 6, partner 6. `runtime.group_chat_summary_state`: 36 rows, 0 with `changed_at` still set, 0 with `last_error`, 0 attempts outstanding. Heartbeat `group-chat-summary` COMPLETED, exit 0, code `a2fc30ab` |
| No chat text | Journal: count lines only. State: ids, times, hashes and codes (no text column). `runtime.job_runs` summaries carry `effect`, `exit_code`, `host`, `pid`, `reference_reads`, `start_token` only (at most 411 characters); the runs' `audit.events` carry `effect`, `exit_code`, `reference_reads` only. No warning or error in the summary, poll, receiver, recognizer or relay journals since 01:15Z |
| Tag | `R147` on `a2fc30abd9e19354d5eebf4ffc26e8be29d6aedb` (the package commit), created by the Release tag workflow, run [43346720159](https://github.com/welct0407/MW-Credit-App/actions/runs/43346720159) (success, 01:40:59Z to 01:41:28Z); confirmed with `git ls-remote --tags origin R147` on 13 November 2026 at about 01:45Z (the peeled tag points to `a2fc30ab`) |
| Components | `render --write` after the tag: the integration agent is R147 (changed); every other component keeps its earlier release |
| Rollback | `config-only-change.py restore --tag r147-gcs-cutoff` (cutoff back to the activation time); `deploy-runtime.py rollback --commit a2fc30abd9e19354d5eebf4ffc26e8be29d6aedb` restores `e80e1238`. Marked rows are harmless (each is summarised once); stored summaries stay and age into the muted state if the switch is turned off |

### Prune at closure
Deleted (inbound links repointed to commit `a2fc30ab`): `Change Logs/CHANGE_NOTES_R144_COMPONENT_VERSIONING_2026-11-12.md` and `integration-agent/Change Logs/CHANGE_NOTES_R144_AGENT_RELEASE_REPORTING_2026-11-12.md`, outside the window of the Open release and the three newest Released releases (R147, R146, R145); their links in the environment inventory now point at the permalink (the release tracker already used one). No section of `Development_Changes.md` belonged to an older released release (the R147 follow-up row was added), and `npm run check:docs` reports no uncited evidence.

## Recovery
Revert the pull request. In PROD, `config-only-change.py restore` of the cutoff tag. Turning the switch off stops the burst, but marked rows keep `changed_at`, so they run again when the switch is back on (each is summarised once); summaries already stored stay and age into the muted state while the switch is off.

## Open questions
None yet.

## Remaining work
PROD done (record above); tagged R147 and closed by the closure pull request. Owner-accepted in PROD on 13 November 2026 ("Accepted", after checking R146 and R147). Nothing else.
