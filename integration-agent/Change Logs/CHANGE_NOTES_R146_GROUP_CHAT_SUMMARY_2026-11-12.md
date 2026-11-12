# Change notes — Group chat summary, agent service (R146), 12 November 2026

## Purpose
The agent half of R146: a new service `group_chat_summary` that summarises the last three days of an eligible Instagram group with Claude Opus 5.5 and posts the summary to the command service. Installed disabled; no chat text is stored or logged. The app half is in the [root change note](../../Change%20Logs/CHANGE_NOTES_R146_GROUP_CHAT_SUMMARY_2026-11-12.md).

## Changes
As built, on the settled tree (HEAD `4406a42` plus the batch, to be committed by the orchestrator).
- `src/mw_integration_agent/group_chat_summary.py` (built) and the CLI command `group-chat-summary`. `--dry-run` bypasses both switches, requests `id,participants` only and prints counts; no state, heartbeat, model call or post (the Instagram and master reads are audited as usual). The command service answers 400 (mapped to `POST_REFUSED`), 422 (`POST_UNKNOWN_BORROWER`) or 503 (`RECEIPT_API_OUTCOME_UNCERTAIN`). Error codes are fixed (for example `POST_UNKNOWN_BORROWER`, `MODEL_OUTPUT_INVALID`, `GROUP_SUMMARY_FAILED`); the source digest excludes the effort.
- `systemd/mw-group-chat-summary.service` and `.timer` (every 2 minutes, installed disabled).
- Migration `database/migrations/V12__group_chat_summary_state.sql` (built; `runtime.group_chat_summary_state`: epoch-second times, `last_error` code pattern only, no chat text; registered under `receipt-processing.db` and skipped by the legacy journal import like `ingress_work`); `state.py` `TABLES` and the SQLite fallback.
- `conversation_poll.py`: marks an eligible group changed on new substantive text at or after the cutoff, or on a subject change, in the existing transaction; only with the switch on (the first state row comes from the first substantive text after the cutoff, so nothing is summarised at switch-on).
- Review corrections: (1) a mention `@name.` maps to the member token and keeps the period, since usernames cannot end in a period; (2) the model may name only tokens present in the transcript sent (senders and members a mention was replaced with), otherwise `MODEL_OUTPUT_INVALID`; (3) a borrower whose "Ref Referrer" is their own Row ID is not a referrer; (4) the legacy journal import skips an existing `group_chat_summary_state` table instead of refusing it as unmapped. The seen-storage correction is in the root note.
- `receipt_master.py`: reads "Ref Referrer"; `config.py` and `config.example.json`: the `group_chat_summary_*` keys and validation; known-services set.
- `service-catalogue.json` and `SERVICE_CATALOGUE.md`: revision 38, `enabled:false, implemented:true`.
- `scripts/deploy-runtime.py` (accepts 37 to 38 only when it adds exactly this service, disabled), `scripts/deploy-shared-receipt-api.py` (`UNITS` now includes `mw-group-chat-summary`, so a freeze stops the timer and the unit files must be installed by hand, disabled, before the first deploy that ships this). `scripts/config-only-change.py` is unchanged (it derives its timers from the unit files); only `tests/test_config_only_change.py` changed.
- Tests under `tests/` (subject rules, routine classification, window, validation, no chat text in output, state migration).
- Documents (Dewey): `SERVICE_CATALOGUE.md`, `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md` (V12 apply order, activation order, error codes), `README.md` Current state, as in the documentation impact map.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm test` | Pass: 1337 tests, 1336 pass, 1 skipped (final, settled tree) |
| Byte's `npm run typecheck`, `npm run lint` and `npm run build` | Clean and ok (final, uncommitted tree) |
| Byte's `mw-db-ci` migrations group | The main chain passed; the V145 route first failed for a clock reason (`Test-PaidDateOrder.sql` depended on the time zone between 17:00 and 24:00 UTC), fixed with `SET TIME ZONE 'Asia/Bangkok'`; the route rerun inside the failing window passed |
| Byte's phase 8 | Exit 0 |
| Byte's offline collection lab at V146 | 4 pass, 1 skipped (the day-change case needs the faketime lab) |
| Byte's ad-hoc lab, endpoint against the real function | stored, unchanged, 422 and cleared as expected |
| Byte's ad-hoc lab, reader guard | false, false, true, false for no grant, 9 of 10 columns, all columns, table missing |
| Byte's agent focused unittest | 233 OK earlier; final `python -m unittest tests.test_group_chat_summary tests.test_state_migration`: 51 OK |
| Byte's agent `discover` | 919 run, 73 skipped, 1 import error in `test_receipt_qr` (`zxingcpp` not installed in this session; unrelated to R146) |
| Byte's agent lab PostgreSQL state tests | 42 OK (supersedes 41; one test added) |
| Byte's agent state migration and retention tests | 23 OK |
| Byte's `ruff` | Pass (final) |
| Byte's Playwright (`collection-chat-summary`, `collection-read`, `collection-loading-shift`; mobile and desktop Chromium) | 14 passed (final) |
| Echo's UX review on a real WebKit iPhone 17 Pro Max (system dependencies installed) and desktop two-panel | Reviewed: list mark, detail collapsed and expanded, shared group, stale, Thai and English, desktop. Findings UX-CHAT-01, 02, 04 and 06 fixed; 03, 05 and 07 not taken. Measured collapsed card height now 246 px English and 184 px Thai (276 and 208 before the fixes; the design estimated about 150 px) |
| Chase's verification: fresh cluster, `Test-GroupChatSummary.sql` through `Test-MigrationsCloud.py --sql-only` | Pass: 146 migrations, `public-functions.sql` matches, checksum tamper rejected |
| Chase's verification: reader guard and chat roles | Pass: guard false, false, true; the chat roles cannot read the table |
| Chase's verification: request id | Python and Node derivations match, 5 of 5 vectors |
| Chase's verification: endpoint auth probe | Only valid claims answer 200; wrong audience, issuer, email, subject, `email_verified`, expired, future `iat`, missing `exp` and a bad token answer 401; a query string or trailing slash answers 404; an environment mismatch answers 400 |
| Chase's data-rule scan of the 4,547-line diff | Clean: no real chat text, username, phone or account number |
| `npm run check:docs` (Dewey, Chase) | Pass (0 failures, 0 warnings) |
| Chase's re-check of the review corrections | Pass: ping at a sentence end keeps the member token and the period; a silent unpinged `borrower_2` is rejected and a pinged `referrer_1` accepted; storage that refuses writes gives no mark after render; a self-referral gives no referrer; the state migration fix holds. PWA diff re-check pass (footer and expander row 44 px, stale hides the last-message line, Thai tags 13 px, sample CSS in step) |
| After Chase's last fix (`splitNameForMark`): typecheck and lint | Clean |
| `node --test tests/unit/chat-seen.test.mjs` | 5 pass |
| `collection-chat-summary` spec, mobile and desktop Chromium | 4 passed |
| `PLAYWRIGHT_WEBKIT=1` `--project=mobile-webkit` chat summary spec (real WebKit, iPhone 17 Pro Max) | 2 passed |
| `npm run build` | ok |
| Full `npm test` | 1337 tests, 1336 pass, 1 skipped before the last fix (the `chat-seen` test file grew since); the CI run is authoritative |
| CI on the pull request, DEV migration, reader grant and deploy | Pending |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- A live Claude call and the live Instagram message shape: the first real run happens at the PROD switch-on.
- The agent lab PostgreSQL suites and the database CI after the last corrections: those paths are untouched by them; CI runs the database groups.
- Concurrent puts under real concurrency (the advisory lock is tested serially).
- The full `mw-db-ci` migrations group on the final tree: CI runs it.
- `test_receipt_qr`: import error because `zxingcpp` is not installed in this session.
- The faketime day-change offline case: skipped without the faketime lab.
- DEV migration, the DEV reader grant, the DEV deploy and the synthetic summary rows: pending Forge.
- Every PROD step (migration, images, Hosting, agent deploy, timer install, dry run, switch-on): not authorized.

## Recovery
Revert the pull request; the service is disabled, so nothing on the VM changes until a deploy. After a PROD deploy, rollback is the config switch or the catalogue entry; the state table can stay.

## Open questions
None.

## Remaining work
Implementation, verification and the owner's promotion instruction. At activation: apply agent migration V12 with `scripts/agent-state-admin.py migrate`, set the cutoff, run `group-chat-summary --dry-run` and read the counts before enabling. Data Dictionary: the relation and routine records for `public.pwa_group_chat_summaries` and `pwa_put_group_chat_summary_v1` are captured from PROD with the helper after the PROD migration, in the closure batch (`agent-api.yaml` and `human-api.yaml` are already updated; `application.yaml` waits for the PWA facts).
