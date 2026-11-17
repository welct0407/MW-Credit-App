# Change notes — R169 group chat refresh tap latency, 17 November 2026

## Purpose
Owner request, 17 November 2026: "go ahead with all three, promote R169 to prod", to make refresh taps faster. Integration agent only; the detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_GROUP_CHAT_REFRESH_FAST_2026-11-17.md). PROD promotion is approved.

## Changes
- Baseline (first R168 tap run, PROD 15:52:37Z to 15:53:01Z): total 24.8 s; listing 5.8 s; groups 18.4 s (model 8.9 s, post 0.2 s); `instagram_calls` 2; tap to run start 40 s (about 16 s of it waiting for the 1-minute timer), so tap to report about 65 s (corrected in R170: it was first recorded as 40 s to report). This is also the first non-idle run effect of R168 with `seconds` and `instagram_calls`.
- Design A: `history_since` gains `limit`; the summariser stops at 100 in-window messages (identical rows and digest); the poll is unchanged.
- Design B: a single-group node read was probed in PROD (Forge, read-only, once) and refused (HTTP 400, code 100, subcode 33, 0.59 s); a listing page of 25 x 100 took 7.94 s. `conversations()` therefore reads one small page first (`LIST_CONVERSATIONS_FIRST` 5), stops if every wanted group is on it, else runs the R168 pass (25 per page, early exit). Worst case: the R168 cost plus one small request.
- Design C: new `group-chat-refresh-watch` command (no job, heartbeat, audit or database row) every 15 s from `mw-group-chat-refresh-watch.timer` (`OnUnitInactiveSec=15s`, `AccuracySec=1s`) and `.service` (`LogLevelMax=notice`); an open request makes it touch `state/group-chat-refresh-wake`, and `mw-group-chat-refresh-wake.path` starts `mw-group-chat-summary.service`. Expected tap: about 12 to 20 s. Catalogue revision 42, services unchanged; `R169_REVISIONS` = (41, 42).
- Cost and logs (owner's questions): Cloud Run is request-billed with `cpu_idle` true; about 130,000 to 173,000 extra read-only GETs a month, under US$1. Empty checks write no audit, job or database row; only Cloud Run request log lines and journald grow, a few MB a day.
- Probe record: Forge's probe called the Instagram client's internal `_request` to avoid the per-call audit row, so the three probe reads have no audit row.
- Byte's deviations: `test_config_only_change.py` pins updated (the trigger list is built from the unit files); the watcher prints a status line only when it wakes (the journal drops it at `LogLevelMax=notice`).
- Promotion plan: Forge hand-installs the watcher `.service` and `.timer` before the deploy (disabled); the deploy installs the path; then `enable --now` of the path and timer. Rollback: `disable --now` of both.
- Read-back list for Forge at promotion: both new units active; `OnUnitInactiveUSec` 15s; no `job_runs` or audit rows from empty checks; journal at notice or above only; a tap starts a run within about 15 s and its effect shows `seconds` and `instagram_calls` (about 1 call and a listing of about 2 s expected).
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/docs/OPERATIONS.md`, `integration-agent/README.md`, `project/Documents/Resource_Monitoring.md`, `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (timer wording), `project/Documents/Solution_Design.md`, `project/Documents/Release_Tracker.md` (R169 scope, Open) and `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte: `PYTHONPATH=src:$PYTHONPATH python -m unittest discover -s tests` (in `integration-agent/`, base `dc7eb63`, uncommitted) | 1021 run, 76 skipped, 1 error: `test_receipt_qr` (`zxingcpp` is missing locally); not caused by this batch |
| Byte: `ruff check --no-cache .` (in `integration-agent/`) | Pass |
| Byte: PostgreSQL lab | Not run: no database path is touched |
| Chase: adversarial review and `test_group_chat_summary test_deploy_runtime test_conversation_poll test_cli test_systemd_units test_deploy_shared_receipt_api test_config_only_change` | Pass, no blocking defects. 264 OK; ruff pass. Reviewed: the `limit` path keeps every read page's validation and the poll's behaviour; `[:100]` equivalence; merge and `GROUP_NOT_FOUND`; the watcher writes only the wake file (`open('w')` gives `PathChanged`, as `mw-receipt-wake.path`) and no database, job, heartbeat or audit row, with its token from the metadata server and no cache write; a wake lost during a running summary is re-sent 15 s later; an open request re-wakes every 15 s until closed (unchanged groups make no model call). Minor, not fixed: `conversations()` with an empty `wanted` still makes the first request (never called that way). |
| `npm run check:docs` | 0 failures, 0 warnings (Chase, same tree) |
| PROD promotion and read-back | Pass: see the PROD promotion record below |
| `Development checks` run 44127710305 and integration-agent tests run 44127710350 on the tested head `7900c63` | Success (PR #349; merged as `d7b467c0`, tree identical) |
| Release tag | `R169` on `d7b467c0` (Release tag run 44129645702) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent half (the one-page listing, the 100-message stop and the watcher) is verified only in PROD after promotion.

## Recovery
After deployment, per the agent change note: `systemctl disable --now mw-group-chat-refresh-wake.path mw-group-chat-refresh-watch.timer` (taps are then served by the 1-minute timer), then `deploy-runtime.py rollback --commit 605f334e64bfcbbc9d805034b59bfd4c614ba886` if the code must go back. The watcher writes no state, so nothing else needs undoing.

## Open questions
None. The owner approved promotion on 17 November 2026: "go ahead with all three, promote R169 to prod".

## Remaining work
Owner acceptance; observe the first refresh tap on R169 (a run within about 15 s of `requestedAt`, `instagram_calls` 1, listing about 2 s). Everything else (pull request CI, merge, PROD promotion, tag, closure) is done.

## PROD promotion record (Forge, 17 November 2026 UTC)
Authority: owner, 17 November 2026, "go ahead with all three, promote R169 to prod". Package `main` `d7b467c039f70ee3c0253de972f3d1e4a585e75f` (merge of PR #349; tree `b036ee81` identical to the tested head `7900c63`; `Development checks` 44127710305 and the agent tests 44127710350, both success). Baseline R168 `605f334e`, catalogue 41. Target `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, zone `asia-southeast1-a`), state database `mw_agent` on `mw-credit-pg-20261017`. Integration agent only: no SQL, no agent migration, no Cloud Run, Hosting, Terraform, IAM, Grafana, collector or secret change.

| Step | Result |
| --- | --- |
| Baseline (16:41:01Z) | `/ready` true at R168 `605f334e`, catalogue 41; `mw-group-chat-summary.timer` `OnUnitInactiveUSec=1min`; no `mw-group-chat-refresh-*` unit on the host |
| Watcher units (before the deploy) | `update-from-github` `605f334e` to `d7b467c0`, clean. `mw-group-chat-refresh-watch.service` (sha256 `48e756bd5cf6c28ad75f89146374d92d1d59432c3f09193ee0cf5ad6dd316597`) and `.timer` (sha256 `0b5e25715eea07884432f944557a05f84a07a4742c168095bd6436490b01383d`) installed root:root 0644 at 16:41:17Z; `systemd-analyze verify` ok; `daemon-reload` 16:41:18Z; left disabled and inactive |
| Dry-run | Checkout matches, clean; `cli.py`, `conversation_poll.py` and `group_chat_summary.py` differ; ancestry ancestor; every service unit unchanged and `mw-group-chat-refresh-wake.path` missing on the host; the watcher timer is not in the pause list (inactive) |
| Agent | Temporary root-only `/root/r169-op` (`postgres` through the 5432 proxy, password on stdin from Secret Manager, never printed) created 16:41:31Z, shredded 16:41:48Z. Freeze `--release R169` 16:41:36Z to 16:41:38Z, backup `runtime-20261117T164136263443Z` (metadata sha256 `1d56f7f57143eccca0aeb965de9e9d552ce7d33b29bbc1e99bbb982de0097c8a`); install to 16:41:44Z (units changed: `mw-group-chat-refresh-wake.path` only, sha256 `f05495a2fd8a3165d02caf429312a350a49c503895e7ddef578f8c7c752a369a`, root 0644); activate to 16:41:48Z, probe `ad2d8193-5bdf-4e5f-841a-6d2d4d54c379`, the seven existing triggers resumed (the new path not, as designed); `mw-chat-relay` restarted 16:41:59Z. `/ready` true at R169 `d7b467c0` (started 16:41:46Z); recognizer (8790) and relay (8791) `/healthz` R169; catalogue 41 to 42 |
| Enable | `systemctl enable --now mw-group-chat-refresh-wake.path mw-group-chat-refresh-watch.timer` 16:42:03Z: both enabled and active; watcher timer `OnUnitInactiveUSec=15s`, `AccuracyUSec=1s`; summary timer still `1min` |
| Verification (to 16:44Z) | Watcher runs every about 15 s (16:42:19Z first, then for example 16:43:54Z and the next at 16:44:09Z), `Result=success`, exit 0, `NRestarts=0`; no journal line for the unit at all (`LogLevelMax=notice` also hides systemd's start and finish lines, so cadence is read from `list-timers` and `ExecMainStartTimestamp`). Since 16:42:03Z `runtime.job_runs` holds only `conversation-poll` 1 and `retry-cash-statement-email` 1, and `audit.operations` only `conversation-poll`, `instagram`, `business_read` and `retry-cash-statement-email` 1 each (the poll's and the retry's own); no row and no heartbeat for the watcher. No warning-level journal lines apart from the known `systemd-ssh-generator` AF_VSOCK lines at `daemon-reload`. Collector run 16:43:45Z exported (`webhook_code_version` `d7b467c0`; group chat waiting 0, oldest wait -1, back-off 0) |
| Refresh tap | Not yet observed (no tap during the session; none was forced). Expected at the first tap: the run starts within about 15 s of `requestedAt`, `instagram_calls` 1, listing about 2 s |

Observed before the deploy (R168, not caused by R169): the summary run of 16:18:37Z to 16:18:51Z failed with `RECEIPT_API_OUTCOME_UNCERTAIN` (1 group; listing 6.0 s, model 6.8 s, 1 Instagram call); the collector shows it as `failed_24h` 1 and the last error. The next run with work (16:29:28Z) completed. R168's other runs with work in this window (16:12:06Z, 16:29:28Z) each made 1 Instagram call with a listing of 5.0 to 5.1 s.

Drift (Forge, read-only, before the tag): `node scripts/promotion/component-versions.mjs drift --env all --observed <private drift-observed.json> --strict` reported drift 1 and unverified 4 (exit 1). The drift is the expected one: PROD agent observed R169 `d7b467c0` (catalogue 42) against the last tag's R168; it matches once `R169` is tagged. Notify R159 `5b887d09` (identity-token `/health`) and jobs R159 (same image digest as notify in each environment) in DEV and PROD; PostgreSQL `POSTGRES_18`. Unverified: schema (DEV and PROD), Grafana dashboards and Metabase reports (no credentialed read; R169 changes none of them). All other components match.

Rollback (if needed): `systemctl disable --now mw-group-chat-refresh-wake.path mw-group-chat-refresh-watch.timer` (taps fall back to the 1-minute timer), then `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 605f334e64bfcbbc9d805034b59bfd4c614ba886` (may need the same temporary operator file) and restart `mw-chat-relay`.

Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r169/` (6 objects: dry-run, freeze, install and activate outputs, the observed facts and the drift output).

Tag record: `R169` on `d7b467c039f70ee3c0253de972f3d1e4a585e75f`, created by Release tag run 44129645702 (success, 16:47Z), which also published the GitHub Release.

Component versions at this release (`component-versions.mjs derive --release R169 --commit R169`): the integration agent changed in R169 (revision 42); every other component keeps its earlier release (PWA, read, command, chat and schema R165; notify and jobs R159; Grafana dashboards R167; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied); the public PWA, read, command and chat builds match R165. Forge's pre-tag run with the credentialed facts gave drift 1, the PROD agent at R169 against the last tag's R168, which the tag clears; its unverified schema, Grafana and Metabase are untouched by R169. The credentialed run was not repeated after the tag.

Not yet observed: tap timing on R169 (no tap since the deploy). The R168 summary run at 16:18Z failed with `RECEIPT_API_OUTCOME_UNCERTAIN` before R169 was deployed (the next run completed); it is not an R169 effect. Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R169 closure pull request. Pruned (outside the window of Open plus the three newest Released releases): the R166 change notes `Change Logs/CHANGE_NOTES_R166_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md`; their links now point to commit `d7b467c0`.
