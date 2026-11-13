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
| CI on the pull request and the PROD verification | Pending |

## Not run
- The wide Playwright suite and the database CI: no PWA or SQL change.
- A live Claude call and live Instagram shape for the backfill: `--mark-all` itself makes no model call; the live Claude calls happen in the cycles that follow it, in PROD.
- DEV: there is no DEV agent, so the command is proven by unit and lab tests only.

## Recovery
Revert the pull request. In PROD, `config-only-change.py restore` of the cutoff tag. Turning the switch off stops the burst, but marked rows keep `changed_at`, so they run again when the switch is back on (each is summarised once); summaries already stored stay and age into the muted state while the switch is off.

## Open questions
None yet.

## Remaining work
Chase's review, then PROD (authorized by the owner on 13 November 2026): agent deploy, the cutoff config change first, `--mark-all`, and a read-back of the first summaries (counts and the stored rows, never chat text).
