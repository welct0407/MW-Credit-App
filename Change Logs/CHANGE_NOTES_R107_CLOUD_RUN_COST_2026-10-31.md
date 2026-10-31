# Change notes — R107 Cloud Run cost cut (request-based CPU for command and chat), 2026-10-31

## Purpose
Cut the Cloud Run bill by returning the command and chat services to request-based CPU (`cpu_idle=true`). R090 batch 2 set `cpu_idle=false` so a post-commit wake could finish after the response; the 2-minute MW-Resource-Monitor `/health` probe then keeps each instance alive 24/7. Batch 1 is DEV only (owner-approved). PROD stays unchanged until the owner says "promote R107".

## Changes
Cost evidence (billing export, read 31 October 2026):
- Cloud Run has cost about S$10.2 a day since 24 October 2026 (about S$310 a month). October gross Cloud Run S$73.82 of the S$161 project total.
- Almost all of it is "Services CPU (Instance-based billing)" on `command-{dev,prod}` and `chat-{dev,prod}`, S$17 to 19 each in October (about S$75 a month per service at the current rate).
- Request-based services with the same probes stay warm almost free: read-prod had 8 cold starts in 7 days and cost S$0.036 for the week. The probes are deliberately kept.

Design decision (Archie): Option A, hand the wake off before the response. Cloud Tasks is not needed. Measured notify wake latency in PROD over 3 days: p50 0.06 s, p90 1.3 s, max 2.6 s, so a 2 s race covers almost every wake inside the request, and a slower wake keeps running (never aborted) on a request-billed instance that stays up for a while after the response.

Implemented (one writer per path):
- Byte, `services/notifications/postcommit.mjs`: `createPostCommitWake` races the full wake against `HANDOFF_MS=2000` and returns before the response; a slow wake keeps running and is never aborted. The jobs worker keeps an uncapped full wait (option).
- Byte, `services/payment-command/store.mjs`: awaits the wake before returning (was `setImmediate` after the response).
- Byte, `services/agent-receipts/runtime.mjs`: no longer passes the response-close abort signal to the wake.
- Chat has no file change but is affected: it uses the same shared adapter, so its previous full in-request wait (up to 30 s) is now capped at `HANDOFF_MS` 2 s and a slow wake runs on after the reply. DEV proof 2 (chat with the app closed) covers it.
- The jobs worker keeps the full wait (`handoffMs: null`, `services/workers/runtime.mjs:31`).
- Forge, `infrastructure/dev/command-service.tf` and `chat-service.tf`: `cpu_idle=true`; DEV tftests updated. DEV plan 0 add, 2 change, 0 destroy saved, not applied (apply after the PR CI passes, carrying the new image).
- Dewey, records: this note, `docs/Development.md` (service description), the Release tracker R107 scope line, the notifications-jobs dictionary dispatch text.

Dependency fix (orchestrator, CI `check` failed on `npm audit --omit=dev`, new moderate advisories GHSA-3g3m-2fjr-6pw4 glob and GHSA-g3hv-75wg-m249 minimatch, not caused by this diff): `npm audit fix` changed `package-lock.json` only. `google-gax` 5.0.8 to 5.0.4 and its `gcp-metadata` 8.1.4 to 8.1.2 (both inside `@google-cloud/sql`'s range, under `@google-cloud/cloud-sql-connector`), which drops the `rimraf`/`glob`/`minimatch` chain; production audit 0 vulnerabilities.

Wake failure behaviour is unchanged: a failed or slow wake never changes the committed payment result; the notifications schedule (every minute) recovers it.

## Test plan
- Unit: the wake returns within about `HANDOFF_MS` when the notify call is slow, leaves it running, and does not abort it; a fast wake is awaited fully; a wake failure does not change the commit result or the response; the jobs worker still waits without a cap; the command store awaits the wake; the receipts runtime passes no abort signal.
- Terraform: DEV tftests assert `cpu_idle=true` on command and chat; plan 0/2/0.
- DEV proof 1 (command): record a synthetic payment, confirm the notification event is dispatched and the push arrives with the app closed, and read the request latency.
- DEV proof 2 (chat with the app closed): start a chat turn, close the app, confirm the reply is committed, `detached_at` is set and the `chat.reply` push arrives.
- 48 h billing readback: DEV command and chat Instance-based CPU cost falls to request-time only.
- PROD is not touched in this batch.

## Checks
| Command | Result |
| --- | --- |
| Byte, base `e4be5ec`, uncommitted tree: `npm run lint` | Pass, exit 0 (580 files) |
| Byte: `npm run typecheck` | Pass, exit 0 |
| Byte: focused unit (notification-wakeup, postcommit-order, agent-receipt-command, worker-runtime) | Pass, 29/29 |
| Byte: `npm test` | Pass, 1049 pass, 0 fail, 1 skip |
| Byte: r053 wakeup and agent-receipt integration, worker-http (disposable PG18, before a comment-only edit) | Pass, 5/5 and 2/2 |
| Forge: `terraform fmt` and `validate` | Pass |
| Forge: `terraform test` (DEV) | Pass, 36/36 |
| Forge: DEV plan | 0 add, 2 change, 0 destroy (`cpu_idle` false to true on `chat_api[0]` and `command_api[0]`); to be re-planned with the new image |
| Chase: `npm run check:docs` | Pass, 0 failures, 0 warnings |
| Chase: `git diff --check` | Pass |
| Chase: adversarial review | 5/5 pass, 0 defects, 3 notes: N1 fixed (chat wake wording); N2 throttling risk, covered by the DEV proofs; N3 PROD follow-ups (listed under Remaining work) |
| Measured notify wake latency, PROD, 3 days | p50 0.06 s, p90 1.3 s, max 2.6 s |
| PR `Development checks`, first run on `68bb384` | `check` failed at `npm audit` (new upstream advisories, above); fixed by the lockfile change |
| Orchestrator after the lockfile fix: `npm audit --omit=dev`, lint, typecheck, `npm test` | Pass: 0 vulnerabilities; lint and typecheck exit 0; 1049 pass, 0 fail, 1 skip |
| PR `Development checks`, run on `14ef7a8` | `rebuild (phase8)` failed: `r053-worker-http-independent` generated a random VAPID key whose private key can be 31 bytes (about 0.4% of keys, 17 of 4,000 locally), which the worker config rejects. Pre-existing fixture flaw; fixed with the 32-byte loop the unit tests already use |
| PR #194 `Development checks` | Pass on `aea6a7c` (run 41185900531). Earlier runs failed on new npm audit advisories (fixed by the lockfile) and a pre-existing VAPID fixture flake (fixed) |
| DEV `terraform apply` (Forge, 31 October 2026, 09:33:38Z to 09:34:15Z) | Pass: image built by Cloud Build from `aea6a7c` (SUCCESS, 09:31:39Z to 09:32:13Z); `read_image`, `command_image`, `chat_image` set to it, `workers.image` unchanged; plan 0 add, 3 change, 0 destroy (chat and command image and `cpu_idle` false to true, reader image only); re-plan no changes; revisions at 100%, cpu-throttling true on all three, `/health` 200, no ERROR logs since 09:33Z. Revisions, digest, build id and generations are in the [environment inventory](../project/Documents/Environment_Inventory.md) |
| DEV proof 1 (Chase, 31 October 2026): command save and wake | Pass. Six synthetic `preference.update` saves (reversible English and Thai, restored) on the new DEV command revision, all 200 applied; server p50 0.336 s, p95 about 0.57 s (the first likely cold) against the prior 7 days of the same operation at p50 about 0.31 s, p95 about 0.5 s, so no regression. The notify `/internal/dispatch` call from command arrived 0.31 to 0.46 s after each save, all 200; no `deferred_to_recovery`, no ERROR logs since 09:34Z |
| DEV proof 2 (Chase, 31 October 2026): chat open and with the client dropped | Pass. Open: short turn 200 in 4.54 s (first byte 1.1 s), attended long turn 200 in 13.93 s. Client dropped: presence `hidden` 204 (`detached` true), connection destroyed about 6 s in; request log 200 with 15.40 s latency (full turn, baseline 13.93 s); reply row completed; the reply-push wake reached notify-dev in 18 ms, 200, at completion. The chat fallback is not needed |
| 48 h billing readback (DEV command and chat) | To fill: window starts 2026-10-31T09:39:40Z; read at about 2026-11-02T09:40Z |

## Not run
- Echo: the device check is deferred to the owner (Echo cannot drive the owner's iPhone): a real-device save push, and chat close-app then `chat.reply` push on the installed PWA.
- `payment-command-api-independent`: Windows-only harness whose path does not pass `afterCommit`.
- PROD apply, PROD readback and the PROD billing readback: PROD waits for "promote R107".

## Recovery
- Git: revert the batch commit; the baseline is `main` at the R106 closure.
- Infrastructure: set `cpu_idle=false` again in `infrastructure/dev/command-service.tf` and `chat-service.tf` and apply (the prior revisions are in the [environment inventory](../project/Documents/Environment_Inventory.md)).
- Fallback if the DEV proof of chat with the app closed fails: chat back to `cpu_idle=false`, and remove the chat `/health` probe from `project/scripts/monitoring/debian-health.py` so the instance is no longer held warm for nothing.

## Open questions
- None for batch 1. The owner decides the PROD promotion ("promote R107") after the DEV proofs and the billing readback.

## Remaining work
- Read the 48 h billing readback at about 2026-11-02T09:40Z and fill that Checks row.
- DEV cleanup done: 5 synthetic chat threads archived (the app has no delete); 6 immutable `preference.update` command rows remain; preferences restored.
- Owner device check pending: a real-device save push, and chat close-app then `chat.reply` push on the installed PWA.
- Environment inventory DEV rows are updated for the apply (new R107 row, line 71 and the chat service row); PROD rows stay until the PROD promotion.
- PROD batch (after "promote R107"): `scripts/promotion/deploy-business-hosting.mjs` (about L889, 955 to 975: the readback requires `cpu_idle` false); `tests/unit/business-hosting-delivery.test.mjs` (about 1720, 1723, 1826); `scripts/promotion/README.md:204`; `infrastructure/production/tests/inert.tftest.hcl:155` and `chat-service.tftest.hcl:87-89`; then the PROD command and chat `cpu_idle=true`, the inventory PROD rows and the promotion record.
