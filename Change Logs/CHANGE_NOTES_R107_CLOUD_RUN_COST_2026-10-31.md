# Change notes — R107 Cloud Run cost cut (request-based CPU for command and chat), 2026-10-31

## Purpose
Cut the Cloud Run bill by returning the command and chat services to request-based CPU (`cpu_idle=true`). R090 batch 2 set `cpu_idle=false` so a post-commit wake could finish after the response; the 2-minute MW-Resource-Monitor `/health` probe then keeps each instance alive 24/7. Batch 1 was DEV only; PROD is now approved (see Production approval).

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

### Production approval and PROD source batch (31 October 2026)
- Scoped production approval: the owner said "Let's move it to prod too" on 31 October 2026, approving the R107 promotion to PROD (per [Release workflow, Promotion](../project/Documents/Rules/Release_Workflow.md#promotion)). It was given before the owner's iPhone device check and the 48 h billing readback completed; both remain open and still run.
- Forge: `infrastructure/production/runtime.tf` (command `cpu_idle` true), `chat-service.tf` (chat `cpu_idle` true), `tests/inert.tftest.hcl` and `tests/chat-service.tftest.hcl`. `terraform fmt` and `validate` pass, `terraform test` 23/23. The PROD baseline was captured read-only; its pins go to the inventory only at promotion. The preview plan 0 add, 2 change, 0 destroy (`cpu_idle` only, current images) is review-only and must not be applied: the old R106 code relies on CPU after the response.
- Byte: a hand-written R107 promotion kind in `scripts/promotion/deploy-business-hosting.mjs` (the generic kind refuses infrastructure and non-image changes): schemaVersion 38, baseline `e57e77d` (the R106 tag), no migration (V119 readback only), an infrastructure allow-list of the four Forge files, plan exactly 0 add, 3 change, 0 destroy (read image; command image and `cpu_idle` false to true; chat image and `cpu_idle` false to true), notify and jobs pinned on the R091 business image, and a live readback that requires `cpu_idle` true on command and chat. The generic kind now also requires true. `scripts/promotion/README.md` has an R107 section. Checks: lint and typecheck exit 0; business-hosting-delivery 132/132; `npm test` 1052 pass, 0 fail, 1 skip; `check:docs` 0.
- Decision: notify and jobs are not redeployed. Their code does not need R107; the lockfile audit fix reaches them in a later release (follow-up).
- Next: Chase review, push, PR CI, merge, PROD build (`cloudbuild-business.yaml`, `mw-credit-app-build-prod`, keep tag `keep-r107-runtime`), runner deploy, verify, closure pull request with the `R107` tag.

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
- PROD apply, PROD readback and the PROD billing readback: approved but not yet run; they follow Chase's review, PR CI, merge and the PROD build.

## Recovery
- Git: revert the batch commit; the baseline is `main` at the R106 closure.
- Infrastructure: set `cpu_idle=false` again in `infrastructure/dev/command-service.tf` and `chat-service.tf` and apply (the prior revisions are in the [environment inventory](../project/Documents/Environment_Inventory.md)).
- Fallback if the DEV proof of chat with the app closed fails: chat back to `cpu_idle=false`, and remove the chat `/health` probe from `project/scripts/monitoring/debian-health.py` so the instance is no longer held warm for nothing.

## Open questions
- None. The owner's device check and the 48 h billing readback stay open after the PROD approval; a bad result would be handled as a follow-up or a revert of `cpu_idle`.

## Remaining work
- Read the 48 h billing readback at about 2026-11-02T09:40Z and fill that Checks row.
- DEV cleanup done: 5 synthetic chat threads archived (the app has no delete); 6 immutable `preference.update` command rows remain; preferences restored.
- Owner device check pending: a real-device save push, and chat close-app then `chat.reply` push on the installed PWA.
- Environment inventory DEV rows are updated for the apply (new R107 row, line 71 and the chat service row); PROD rows stay until the PROD promotion.
- PROD source batch is written (Forge and Byte, see Production approval). Left: Chase review, push, PR CI, merge, PROD build, runner deploy and verify, the PROD inventory rows and promotion record, and the closure pull request with the `R107` tag.
- Follow-up: redeploy notify and jobs on an image with the lockfile audit fix in a later release.

## Promotion record (Forge, 31 October 2026, UTC)
Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Scope and authority**
- **Scope:** R107 to PROD: read image, command and chat images with `cpu_idle` false to true on command and chat (request-based CPU), and Hosting. No SQL, no VM; notify and jobs unchanged.
- **Authority:** the owner's instruction "Let's move it to prod too" (31 October 2026), given before the owner's device check and the 48 h billing readback finished (both remain open).
- **Freeze:** the package is pinned at the PROD build (start 11:40:13Z, 31 October 2026) on `1befbb8` (PR #194 merge on `main`, descends from the R106 tag `e57e77d`); delivery tool: the R107 hand-written kind in `scripts/promotion/deploy-business-hosting.mjs` (schemaVersion 38); baseline R106 `e57e77d`. Next unused number R108.

| Item | Result |
| --- | --- |
| Baseline (read-only, before) | read `00031-4fm`, command `00036-xct`, chat `00014-x2z` on `9786f91c…`; notify `00022-4lt`, jobs `00022-42m` on `50953149…`; settings generation `1793384469780863`; Hosting `142a1d8e3cbf1152` (R106 release `1793384580702000`) |
| SQL | None. V119 readback only (read-only, 11:42:36Z): 119 history rows, latest 119, all successful |
| Image | Cloud Build `bc1da6f0-2ac9-484d-9750-6660afe6d49a`, SUCCESS 11:40:13Z to 11:40:48Z, PROD builder `mw-credit-app-build-prod`, `cloudbuild-business.yaml`, `git archive` of `1befbb8`, tag `keep-r107-runtime` |
| Terraform | Plan 0 add, 3 change, 0 destroy (read image; command and chat image and `cpu_idle` false to true), plan sha256 `2b02ec70…`, JSON `3ed72c2b…`; applied 11:43:47Z to 11:44:23Z; re-plan no changes; settings generation `1793447075020076` (previous `1793384469780863`) |
| Runner | The R107 kind `--check` passed before the apply, citing CI per job: check and terraform run 41197337977 (`75aa6c2`); e2e shards run 41185900531 (`aea6a7c`); guards and rebuilds run 41185896777 (`aea6a7c`). `--apply` 11:45:27Z to 11:46:10Z: live readback passed (`cpu_idle` true on command and chat; notify and jobs pinned on the R091 image) |
| Hosting | Version `6477338972a89aae`, release `1793447163231000`, 16 files; `lm.mw-credit.com` serves build-version R107 (version `e698dbafba6fa5ad0be3d255`). The R106 frontend was served against the R107 API from 11:44:23Z to 11:46:10Z (the API change is compatible) |
| Revisions after | read `00032-4rw`, command `00037-qns`, chat `00015-vmr` (cpu-throttling true, image `b45cb7c9…`); notify and jobs unchanged |
| Smoke (read-only) | `/health` 200 on the three services; `/api/session` 401 on read and command; no ERROR logs from 11:43:47Z to 11:46:51Z. No PROD save, payment or notification was forced |
| Private records | Receipt `gs://mw-credit-operator-private-737787224638/promotion-receipts/R107-HOSTING-RECEIPT.json`; package and records under `gs://mw-credit-operator-private-737787224638/promotion-packages/r107/`, outside Git |
| Rollback | Restore the activation copy `production.activation.before-r107-1793384469780863.tfvars` (images), revert the `cpu_idle` source for command and chat, plan 0/3/0, apply, `-PublishActivation`; the R106 revisions can also take traffic. The runner readback requires true, so a rollback needs a hand-written kind or a manual check. Hosting: redeploy version `142a1d8e3cbf1152` |

Applied and verified. Not owner-accepted: the device check and the billing readback are open.

## Closure (31 October 2026)
Tag record: the annotated tag `R107` (object `97ec40945549e6f8fbc54f19a17e678d950bd993`) points at the package commit `1befbb87fa4604262d799b13529a954c004c3ff3` (PR #194 on `main`), created by the Release tag workflow (checked with `git ls-remote origin refs/tags/R107`, peeled to the package commit). Baseline R106 `e57e77d`. R108 is opened in this closure and is the next unused number.

Open follow-ups (visible, not blocking Released: DEV proofs passed and the PROD readback is clean):
- Owner device check: a real-device save push, and chat close-app then `chat.reply` push on the installed PWA.
- 48 h billing readback, scheduled for about 2026-11-02T09:45Z (DEV started 2026-10-31T09:39:40Z; PROD from the 11:44Z apply): the Cloud Run Instance-based CPU cost of command and chat should fall to request time only.
- Redeploy notify and jobs in a later release (the lockfile audit fix).
- Rolling back needs a hand-written kind or a manual check, because the runner readback requires `cpu_idle` true.

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R104_RECORD_PROJECTED_CHARGE_2026-10-28.md` (R104 left the retention window: R108 Open; R107, R106, R105 Released). Its links in the Release tracker (two), Development Changes and the Environment inventory now point to the commit permalink `1befbb8`, the last commit where it exists. No other change note or evidence file is outside the window or uncited.
