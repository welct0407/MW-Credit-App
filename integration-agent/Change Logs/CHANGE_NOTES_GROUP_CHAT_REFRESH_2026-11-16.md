# Change notes — group chat summary refresh (agent), 16 November 2026

## Purpose
R165, owner request of 16 November 2026: the PWA's refresh button on the Collection summary card asks the agent for a fresh group chat summary. The owner approved the new capability, a PWA-triggered forced summary run, and that the PROD agent deploy happens only with the release promotion.

## Changes
- Catalogue revision 39 (`service-catalogue.json` revision and the `SERVICE_CATALOGUE.md` revision 39 paragraph and `group_chat_summary` row). No service is added, removed or switched; `group_chat_summary` stays disabled by default and under its own switch.
- Behaviour: each 2-minute run first reads `GET /internal/agent/group-chat-refreshes` (a 404 is read as no requests), summarises the requested groups first, oldest request first (a borrower's groups are every group whose remembered members include the borrower), without waiting for a marker or the quiet period, then posts the outcome (`stored`, `unchanged`, `cleared`, `no_group`, `failed`) to `POST /internal/agent/group-chat-refreshes`. `MAX_GROUPS` 5 and the 150 s budget apply to requested groups first; a request is reported only when all its groups ran; a failed requested group does not change the back-off. Contract details are in the root note. Same token, policy, model, validation and summary post as R146. No chat text at rest.
- Documents: `README.md` (R165 bullet), `docs/CONVERSATION_POLL.md` (Refresh requests), `docs/OPERATIONS.md` (activation, read-back and rollback).
- No agent migration (agent V13 stays), no new setting, unit, timer, secret or identity. The app database side is V150 (see the [root change note](../../Change%20Logs/CHANGE_NOTES_R165_GROUP_CHAT_REFRESH_2026-11-16.md)).
- Code and tests (Byte): `group_chat_summary.py`, `receipt_api.py`, `scripts/deploy-runtime.py` (`R165_REVISIONS`, a live revision 38 to 39 with an unchanged service set), `test_group_chat_summary.py`, `test_deploy_runtime.py`, `test_config.py` and `test_receipt_recognition.py`.
- Owner production approval of 16 November 2026, "push when it's all verified. promote all the way to prod.", covers the PROD deploy of catalogue revision 39 after V150, the grant and the images.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`) | 993 run; only `test_receipt_qr` fails, because `zxingcpp` is missing in the container (Byte, uncommitted tree on `58fc004`) |
| `ruff check` | Pass (Byte, same tree) |
| `python -m unittest tests.test_group_chat_summary` | 82 OK (Chase, uncommitted tree on `58fc004`); Chase's verdict on the whole batch is a pass, see the [root note](../../Change%20Logs/CHANGE_NOTES_R165_GROUP_CHAT_REFRESH_2026-11-16.md#checks) |
| Integration-agent workflow `test` and `lab` | Pending: the run id is added after the push |
| `npm run check:docs` | Pass, 0 failures (Dewey) |

## Not run
- No deployment yet. `test_receipt_qr` was not passed locally (missing `zxingcpp`). The agent half is not exercisable in DEV (there is no DEV agent). Not run either: the full `mw-db-ci` and Playwright suite locally (left to the pull request's CI) and live polling against the DEV API.

## Recovery
Before deployment: revert the commit. After deployment: `deploy-runtime.py rollback --commit <previous>`; the PWA then waits out its 6-minute cutoff and shows no new summary. V150 stays.

## Open questions
None.

## Remaining work
Byte's code and tests, Chase's evidence, the PROD agent deploy with the R165 promotion after V150, its grants and the command and read images, and its promotion record.
