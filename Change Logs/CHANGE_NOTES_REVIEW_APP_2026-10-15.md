# Independent review — App (PWA + services) — 15 October 2026

Baseline 0995868. Scope: `apps/pwa`, `services/*`, `tests/unit`, `tests/e2e`, build/deploy config (`vite.config.ts`, `Dockerfile`, `firebase.json`, `infrastructure/production/runtime.tf`, hosting deploy scripts). Checklist items 1–7 and 9 of the App brief; item 8 (UX) is appended by the UX worker.

Method: read the two PROD entry points and every handler they compose (`production/*`, `payment-command/handler.mjs`, `api/dev-read-handler.mjs`, `notifications/handler.mjs`, `agent-receipts/runtime.mjs`, `agent-conversations/handler.mjs` + `policy.mjs`), `services/payment-command/store.mjs` and `services/contracts/payment-command.mjs` end to end, `result.mjs`, `postcommit.mjs`, `web-push.mjs`, `worker.mjs`, `workers/runtime.mjs`, `jobs/runner.mjs`, the PWA offline layer (`owner-offline.ts`, `offline-sync.ts`, `read-cache.ts`, `offline-dataset.ts`), `sw.js`, `app-update-safety.ts`, `display-date.ts` and the session paths in `live-main.tsx`. Ran `npm run check`, `npm run test:e2e` (25 min cap), `npm audit --omit=dev`. Ran two synthetic probes (slow receipt upload against the real command handler; naive-timestamp serialization through node-pg on the scratch cluster) and one Playwright diagnostic of the e2e fixture routing. One read-only `EXPLAIN ANALYZE` on DEV through the tunnel. Read-only; no source, DEV, Debian or PROD change.

Orchestrator: Claude Fable 5.1, medium effort (owner setting). An earlier Opus draft was re-verified, not copied.

Tool limitation: workers are Claude Opus/Sonnet family at the effort set by the orchestrator; exact model ids in `Model_Work_Mapping.md` are not selectable.

## Checks executed

| Check | Command | Result |
| --- | --- | --- |
| Type check + synthetic build + unit tests | `npm run check` (repo root) | Pass, exit 0. `tsc --noEmit` clean; synthetic build 35 modules, `dist/assets/index-*.js` 257.91 kB (80.33 kB gz); unit tests `tests 427, pass 427, fail 0, skipped 0`, 12.1 s. The production-candidate unit test also built `live-prod`: 110 modules, `index-*.js` 807.70 kB (227.36 kB gz), Vite ">500 kB chunk" warning. |
| Browser tests (synthetic) | `npm run test:e2e -- --reporter=line`, 25 min cap (`timeout 1500`) | Exit 1. 450 tests across 32 specs × 2 projects (desktop-chromium, mobile-chromium): `364 passed, 75 failed, 11 skipped (14.3m)`, wall clock 14 m 16 s. All 75 failures are in the six live-shell specs that build a `live-dev` bundle and serve it from a local HTTPS fixture mapped to `dev-lm.mw-credit.com` (`phase5-final-ui-independent` 66, `startup-back-independent` 4, `startup-generations-independent` 2, `payment-offline-sdk` 1, `phase5-offline-sdk-independent` 1, `pwa-canonical` 1); 72 fail with `TypeError: Cannot read properties of undefined (reading 'fixtureSignIn')`, the other three with locator/predicate timeouts on the same misrouted page. Every spec that uses the synthetic web server on port 4173 passed. Root cause is environmental (next row). After the run, `git status --short outputs` listed 185 modified tracked PNGs; restored with `git -C /home/user/MW-Credit-App checkout -- outputs` (APP-TEST-04). | |
| E2E failure diagnosis | `node scratchpad/review-app-c/sdkdiag/diag2.mjs <built fixture dir>` (Playwright Chromium 153, same `--host-resolver-rules`/`--no-proxy-server` args as the specs, local HTTPS fixture) | Page loaded `https://dev-lm.mw-credit.com/` with title `MW Credit Development` and script `/assets/index-BMDLDRQr.js` (not the fixture's `index-CRPNHkIV.js`); local fixture server log `served []`; `https://synthetic-fixture.invalid/` → `net::ERR_TUNNEL_CONNECTION_FAILED`. Chromium in this container tunnels through the sandbox egress proxy and ignores the host mapping, so every "static fixture" spec read the real DEV Hosting site (GET only). |
| Dependency audit | `npm audit --omit=dev` | `found 0 vulnerabilities` |
| Slow receipt upload probe (synthetic, loopback) | `node scratchpad/review-app-c/probe/slow-upload.mjs` (real `createPaymentCommandHandler`, stub principal and store; 64 KiB every 500 ms) | `status 400 body {"ok":false,"code":"invalid_request"} after_ms 5515 storeCalled false` |
| Naive timestamp serialization (scratch cluster 15501) | `TZ=UTC node -e '<pg query of TIMESTAMP ''2026-10-15 10:00:00.123456''>'` then `display-date.ts` logic | `{"naive":"2026-10-15T10:00:00.123Z","naive_text":"2026-10-15 10:00:00.123456"}`; text path → `15 Oct, 10:00`; Date path → `15 Oct, 17:00`; 6-digit fraction parses in V8 |
| Offline fingerprint cost (DEV, read-only) | `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` of the records-domain source fingerprint from `services/business/offline-dataset-delta.mjs` (20 tables, `md5(string_agg(...))` consumed) | Cold: `Planning Time: 114.087 ms`, `shared hit=1900 read=2`; warm: `Planning Time: 14.745 ms`, `Execution Time: 113.904 ms`, `shared hit=1902`. DEV `sum(n_live_tup)` over public tables = 4131 |

Scratch evidence (not committed, under 1 MB): `/tmp/claude-0/-home-user-MW-Credit-App/a3be400f-616f-5c17-bdf6-15111aa41b1d/scratchpad/review-app-c/` (`check.log`, `e2e.log`, `fingerprint-records.sql`, `probe/slow-upload.mjs`, `sdkdiag/diag2.mjs`).

## Checks not run

| Check | Reason |
| --- | --- |
| `tests/integration/*.test.mjs` (82 files) against local PostgreSQL | Optional in the brief; they need the PowerShell fixture harness (`scripts/database/Test-*.ps1`). Left to the DB review. |
| WebKit / iPhone browser project | Only Chromium is installed at `/opt/pw-browsers`; `PLAYWRIGHT_WEBKIT=1` not run. |
| E2E rerun after `npm run build:live-dev` | The failures are environmental (see TEST-01), not a missing build; the earlier draft's rerun log shows the same `fixtureSignIn` error after building. Not repeated. |
| Authenticated DEV or any PROD request | Out of scope (no DEV test identity; no PROD access). |

## Findings

### AUTH (item 1)

Route trace of the two PROD handlers. PROD Cloud Run services run with `ingress = "INGRESS_TRAFFIC_ALL"` and `invoker_iam_disabled = true` (`infrastructure/production/runtime.tf:61-62`), so these checks are the only gate. `args` selects `business-server.mjs` when `business_runtime_authorized`, else the foundation `server.mjs` (`runtime.tf:105`). Both run one instance, concurrency 5, 15 s timeout (`runtime.tf:96-100`).

Foundation server (`services/production/server.mjs` → `runtime.mjs` → `handler.mjs`):

| Route | Method | Auth check applied | Capability | file:line |
| --- | --- | --- | --- | --- |
| `/health` | GET | none (static body) | none | `production/handler.mjs:18,27` |
| `/api/session` | GET | Firebase `verifyIdToken(token,true)`, strict claims, uid pin + owner email | owner only | `handler.mjs:29-31`; `principal.mjs:5-18` |
| any other raw URL | any | 403 `foundation_disabled` before auth | n/a | `handler.mjs:18` |
| preflight | OPTIONS | Origin allowlist, method GET, header `authorization` only | n/a | `handler.mjs:15,20-24` |

Business server, reader role (`business-runtime.mjs:32-34` → `api/dev-read-handler.mjs` + `api/borrower-read-store.mjs`). Every data route calls `verifyPrincipal` (`dev-read-handler.mjs:55-56`); the store then re-resolves the member by `Partners` row and policy capability `read` inside a READ ONLY transaction (`business-policy.mjs:19-26`, `business-runtime.mjs:33`).

| Route | Method | Auth check applied | Capability | file:line |
| --- | --- | --- | --- | --- |
| `/health` | GET | none | none | `dev-read-handler.mjs:54` |
| `/api/session` | GET | Firebase + membership | read | `:58` |
| `/api/borrowers`, `/api/borrowers/{id}`, `/{id}/loans`, `/{id}/loans/{loanId}` | GET | Firebase + membership | read | `:80-97` |
| `/api/collection`, `/api/collection/{id}/charges` | GET | Firebase + membership | read | `:69-79` |
| `/api/(collection\|borrowers)/{id}/upcoming[/{date}]` | GET | Firebase + membership | read | `:59-68` |
| anything else | GET | Firebase, then 404 | n/a | `:98` |
| non-GET | any | 405 before auth | n/a | `:50` |

Business server, command role. Composition order (outermost first): agent conversations → agent receipts → notifications (if enabled) → command handler (`business-runtime.mjs:41-45`).

| Route | Method | Auth check applied | Capability | file:line |
| --- | --- | --- | --- | --- |
| `/internal/agent/(catalogue\|query\|commands)[/{uuid}]` | POST / GET status | 404 when policy absent; Google OIDC: audience, issuer, exact caller email + sub, `email_verified`, exp, iat skew 60 s; actor partner must be in policy `readPartnerIds` (`reviewerPartnerIds` for writes) and a `Partners` row with `IG Integration Enabled` (reviewer flag for writes) | policy read / reviewer | `agent-conversations/handler.mjs:11-16`; `policy.mjs:28-35,39-48` |
| `/internal/agent/receipt-payments[/{uuid}]` | POST / GET | 404 when policy absent; Google OIDC as above; actor partner per mode (`automaticPartnerId` or `reviewerPartnerIds`), `Partners` row checked in SQL | policy automatic / reviewer | `agent-receipts/runtime.mjs:25-34,39,48-49` |
| any other `/internal/agent/*` | any | 404; never falls through to human routes | n/a | `agent-receipts/runtime.mjs:26-27` |
| `/api/notifications/*` (history, status, push-config, target, subscriptions, preference, offline-dataset) | GET/POST/PUT/DELETE | Firebase (business verifier); store resolves member | **read for every action, including writes** | `notifications/handler.mjs:11-35`; `store.mjs:10` |
| `/health` | GET | none | none | `payment-command/handler.mjs:109` |
| all other `/api/*` command routes | per route | Firebase first (`handler.mjs:111-112`), method allowlist (`:116-118`), then store `run()`: `principalAllowed` + `resolveActor(capability)` inside the transaction (`store.mjs:40,50`) | reads `read` in READ ONLY tx; writes (`POST /api/payment-commands`, `POST /api/operations`, `POST/PATCH/DELETE /api/borrower-records`, `PATCH …/metadata`) `command`; `GET …/receipts/{id}` and `/api/payment-records/{id}/receipt` `receipt.read`; `POST …/receipts/{id}` `receipt.write` | route table `handler.mjs:12-66`; dispatch `:121-189`; capabilities `store.mjs:45,50,163,313` |

Result: no unauthenticated or wrongly scoped financial path found in either PROD handler. Every store method reaches `run()` (including `selectAll`, `autoAssign` and `review`, which go through `draft`), and read-capability calls run in READ ONLY transactions (`store.mjs:45`), so a `read`-only member cannot write through SQL. The `fixture` branch (`store.mjs:206-207,228,304`) is inert in PROD because `createEnvironmentCommandStore` passes no fixture and `ownerTesting:true` (`store.mjs:343`).

DEV handler diff (`payment-command/dev-server.mjs`): same `buildHandler`/`buildStore` code, but the DEV store has no `resolveActor` and no capability policy. It authorizes by the pinned owner UID plus `OWNER_EMAIL` (`store.mjs:38`; `payment-command/principal.mjs:4-6`; `api/firebase-principal.mjs:12`) and resolves the actor by a `Partners` email lookup (`store.mjs:51-53`). DEV notifications use an owner-pinned `resolveActor` (`notifications/dev-api.mjs:8-12`). DEV can also run in `synthetic-only` fixture mode (`dev-config.mjs:8-19`), which PROD config forbids (`business-config.mjs:15`). So the PROD capability checks (`read` vs `command`, `receipt.*`, second member) are never exercised on DEV. See APP-ARCH-01.

CORS: three handlers (`production/handler.mjs:15-24`, `dev-read-handler.mjs:41-49`, `payment-command/handler.mjs:101-107`) reject unknown Origins with 403, validate preflight method and headers, and echo only allowlisted Origins. The notification handler differs (APP-AUTH-03).

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-AUTH-01 | risk | S3 | confirmed | `production/business-principal.mjs:7`, `production/principal.mjs:7`, `api/firebase-principal.mjs:7-8`: any exception from `verifyIdToken(token,true)` returns 401 `session_invalid`. `checkRevoked=true` makes a Firebase Auth backend call per request (plus the public-key fetch on a cold instance; `min_instance_count = 0`, `runtime.tf:99`), so a network or backend error is reported as an invalid session. | A transient Google-side failure looks like a revoked session to the PWA, which then signs the user out and purges local data (APP-OFFLINE-01). | Map only `auth/id-token-expired`, `auth/id-token-revoked`, `auth/argument-error`, `auth/user-disabled` and similar to 401. Map every other error to 503 `session_check_unavailable`. | S | none |
| APP-AUTH-02 | std | S4 | confirmed | Four verifiers differ. DEV (`api/firebase-principal.mjs:10`) uses `Number.isFinite` (not integers), has no `iat < exp`, checks `auth_time` against now instead of `iat`, has no control-character check on `sub`. Foundation (`production/principal.mjs:9-15`) is strict. Business (`business-principal.mjs:9-11`) is strict but omits `\u007f` in the `sub` check. | DEV accepts claims PROD rejects. A fix applied to one copy will miss the others. | One shared `createFirebaseVerifier({projectId, uidPin?, emailAllowlist?})` used by all four entry points. | S | none |
| APP-AUTH-03 | std | S4 | confirmed | Notifications CORS (`notifications/handler.mjs:8-10`) answers any preflight with 204, including requests without `Origin`, and does not check `Access-Control-Request-Method`/`-Headers` (the other three handlers do). It sends no `X-Content-Type-Options`, no `X-Request-ID`, has no completion log, returns 503 when the verifier throws (`:11`, the command handler returns 401) and 401 for every non-ok principal. | Inconsistent behaviour and no request logging on the notification surface. No data exposure found: the browser still enforces the Origin echo. | Reuse one small CORS/headers helper across all handlers. | S | none |
| APP-AUTH-04 | arch | S4 | confirmed | DEV and PROD share one Firebase project and issuer (`business-config.mjs:4`, `api/dev-read-config.mjs:1`, `business-principal.mjs:9`). A token minted by signing in on `dev-lm` is accepted by the PROD API verifier; authorization then relies on the PROD capability policy and the Origin allowlist. | Acceptable for two users; it means DEV sign-in is also PROD authentication. | Record as an accepted design in the environment inventory, or use a separate Firebase project for DEV. | S | owner decision |
| APP-AUTH-05 | bug | S4 | confirmed | `payment-command/handler.mjs:109,116-118,189`: an authenticated POST/PATCH/DELETE to `/health` is in no method list and falls to `store.status(principal, undefined)` → 400 `invalid_request`. | Wrong status code only. | Return 405 for non-GET `/health`; make the final `else` an explicit `command_status` branch. | S | none |
| APP-AUTH-06 | std | S4 | confirmed | The worker OIDC check pins the caller by email only (`workers/runtime.mjs:32`: `config.callers.includes(p.email)`), whereas the agent policies pin email **and** `sub` (`agent-receipts/runtime.mjs:33`, `agent-conversations/policy.mjs:33`). | A recreated service account with the same email would be accepted by the workers but not by the agent APIs. Low risk; inconsistent rule. | Add the caller `sub` to the worker config and check it like the agent policies. | S | infra change |

### PAY (item 2)

`store.mjs run()` (`:39-84`): BEGIN (READ ONLY for reads; READ COMMITTED for `receipt.read`), `statement_timeout 10 s`, `lock_timeout 3 s`, guard, actor, operation, COMMIT. A failure after `markAttempted()` or during COMMIT returns 503 `command_outcome_unknown` (`:76`); a failed COMMIT or ROLLBACK quarantines the client (`:42,72-78`). Replay is looked up by request id + issuer + subject (`:197`) and compared on receipt id, actor and canonical JSON (`:201-204`); the SQL function `pwa_submit_selected_charges_v1` owns the final replay decision. `result.mjs:12` uses `FOR UPDATE` only for metadata edits (`store.mjs:286`) and compares the live `Payments` row with the original command (`result.mjs:15-22`). The client always reconciles by `GET /api/payment-commands/{id}` before resending (`offline-sync.ts:107-109`), treats a non-JSON 504 as unknown and keeps the row queued (`:134-136`), and stores the command durably before the online POST (`SelectedCharges.tsx:203-206`). This part is sound.

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-PAY-01 | bug | S2 | confirmed | Request bodies have a fixed 5 s read timer, including 5 MiB receipt images (`payment-command/handler.mjs:75,78`). On timeout the error has no `bodyCode`, so it becomes 400 `invalid_request` (`:184`). Probe re-run on 0995868: `status 400 ... after_ms 5515 storeCalled false`. The offline sync treats 400 as permanent and marks the saved payment **blocked** (`offline-sync.ts:97,131`). The PWA does not downscale photos; it only checks type and size ≤ 5 MiB (`SelectedCharges.tsx:173-175`). | On a slow mobile uplink, a queued payment with a phone photo becomes "blocked — invalid details" and needs manual action. Online, the receipt upload fails repeatedly. | Return 408/503 `body_timeout` (retryable) on timer/abort. Size the timer to the body limit (about 12 s, inside the 15 s Cloud Run timeout). Downscale receipts on the client (canvas → JPEG about 1600 px, under 1 MB). | S | none |
| APP-PAY-02 | risk | S3 | likely | The post-commit notification wake is awaited **before** the HTTP response (`store.mjs:82`). It may take up to `min(client deadline − 1 s, now + 14 s)` (`payment-command/handler.mjs:88`; `notifications/postcommit.mjs:12-29`). Cloud Run timeout is 15 s (`runtime.tf:96`). | With a cold or slow notify service, a committed payment can return late or as a platform 504. The user sees "unknown" and must check status, although the payment succeeded. | Send the response first, then wake in the background with a short cap (about 1.5 s). The minute recovery already owns missed wakes. | S | none |
| APP-PAY-03 | risk | S3 | likely | Timeout budget exceeds the platform timeout: pool connect 5 s + statement 10 s (+ lock 3 s) + Firebase revocation call + wake (`business-server.mjs:11`; `store.mjs:46-47`). `server.requestTimeout = 20000` (`business-server.mjs:13`) vs Cloud Run `timeout = "15s"` (`runtime.tf:96`). | Slow requests are cut by the platform with an opaque 504 while the DB work continues. Safe because of status-first reconciliation, but users see avoidable "unknown" states. | Fit the budget under 15 s (connect 3 s, statement 8 s, wake per APP-PAY-02), or raise the Cloud Run timeout to 30 s. | S | infra change |
| APP-PAY-04 | risk | S3 | likely | GCS calls run while a DB transaction is open: receipt upload/retrieve (`store.mjs:306-313`), source image download (`:146-163`), receipt binding inside submit/operation/metadata (`:112,212,292`). The PROD pool has `max:2` (`business-server.mjs:11`), one instance with concurrency 5 (`runtime.tf:97,100`). | Two concurrent receipt operations take the whole pool; other requests wait up to 5 s, then return 503. Likely when both users work at once or during offline media preparation. | Do the GCS I/O outside the transaction, then bind or re-check in a short transaction (the image read already re-checks the row). Or raise the pool to 4. | M | none |
| APP-PAY-05 | arch | S4 | confirmed | `classifyReplay`/`validIdentity`/`outcome` (`contracts/payment-command.mjs:83-115`) are imported only by `tests/unit/payment-command-contract.test.mjs` and `payment-command-independent.test.mjs` (grep over `services` and `tests`). Real replay classification is in SQL. | Two sources of truth; the JS copy can drift silently. | Delete the JS classifier, or label it a test oracle and test it against the SQL function. | S | none |
| APP-PAY-06 | std | S4 | likely | `store.mjs:71-76`: after `markAttempted()`, any SQL error (for example `lock_timeout` 55P03 or `statement_timeout` 57014) returns `command_outcome_unknown`, even when ROLLBACK succeeded and COMMIT never started. | The outcome is in fact "not applied". Reconciliation recovers, but the user sees "unknown" for a known failure. | When `!commitStarted` and the rollback succeeded, return 503 `command_unavailable` (retry the same request id). | S | none |
| APP-PAY-07 | std | S4 | confirmed | Business rules hard-coded as cash-holder Row IDs: `store.mjs:123` limits loan-option accounts to one holder (`h."Row ID"='ch:<holder>'`); `ManagementExpenseReference.tsx:3` filters on another `ch:<holder>` literal. | Changing who disburses loans needs a code release, and the rule is undocumented. | Move the rule into a SQL view or a flagged column, or at least document it in the data dictionary. | S | owner decision |

### OFFLINE (item 3)

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-OFFLINE-01 | bug | S1 | confirmed | Any 401/403 from a read or command request wipes the whole offline store, including **unsynced queued payments and their receipt images**. Hops: server returns 401 when `verifyIdToken` throws (APP-AUTH-01; `business-principal.mjs:7`; `payment-command/handler.mjs:111-112`), or 403 when the actor does not resolve or SQL raises 42501 (`store.mjs:55,75`). Client: `offline-sync.ts:88` and `read-cache.ts:94` call `access.authFailure(status)`; `live-main.tsx:409` (command access) and `:224` (read access) route 401 → `expireSession()` and 403 → `purge()`; `expireSession()` calls `offlineRepositoryRef.current?.purge()` (`live-main.tsx:207-208`); `purge()` runs `store.clear()` on the namespace (`owner-offline.ts:162`). Pending rows live in the same store (`owner-offline.ts:6`, kind `'pending'`, key `pending:<requestId>`, `:67`). The e2e suite asserts the 401 purge as intended (`phase5-final-ui-independent.spec.ts:129`). | A payment recorded offline (cash received in the field) is silently deleted if one transient auth-check failure, a grant regression after a migration (42501) or a `Partners` row edit causes a single 401/403 before sync. Nothing was written to the server, so the payment is lost unless re-entered from memory. | Never delete `pending:*` rows on an involuntary 401/403. Keep them in the same UID-keyed namespace and resume sync after the same UID signs in again. Purge only snapshots, caches and datasets. Also fix APP-AUTH-01. | S | none |
| APP-OFFLINE-02 | ux | S2 | confirmed | The Sign out button (`live-main.tsx:407`) calls `logout()`, which purges the namespace (`:331-335`) without checking for pending rows. Tested as intended: `tests/e2e/phase5-offline-sdk-independent.spec.ts:8` ("… then signout purges"). | One tap discards queued payments that have not synced. | When pending > 0, block sign-out or require an explicit "discard N unsynced requests" confirmation. Offer "sync now" first. | S | owner decision |
| APP-OFFLINE-03 | risk | S3 | confirmed | Each protocol-3 dataset poll recomputes a source fingerprint by hashing every row of up to 20 tables (`business/offline-dataset-delta.mjs:7-12`, `to_jsonb(s)::text||xmin` per row). The PWA polls every domain every 60 s while visible, plus on focus/online (`offline-dataset.ts:154,158`). DEV readback: records domain 114 ms execution, about 1,900 shared buffers per call (planning 15–114 ms), with 4.1k live rows. | About 0.5 s of DB CPU per minute per open tab today across four domains, on the shared `db-f1-micro` that also serves PROD. Cost is linear in row count and grows with every table added. | Cheap change detector: compare `pg_stat_user_tables` counters plus `max(xmin)` per table, or a one-row revision counter bumped by statement-level triggers (schema change). Short term: poll every 5 min and on focus only. | M | schema change |
| APP-OFFLINE-04 | risk | S3 | likely | Financial datasets and receipt images are stored unencrypted in IndexedDB (`owner-offline.ts:6` kinds `dataset`, `dataset-media`; `:103-106`). Firebase uses `browserLocalPersistence` (`live-main.tsx:308`). The 24 h lease (`owner-offline.ts:3,114`) gates the app, not the disk. | A lost or shared device keeps borrower financial data and receipt photos until the next sign-out. | Owner decision. Smallest step: delete datasets and media (not pending rows) after N days without an online check, and say so in the privacy notes. | S | owner decision |
| APP-OFFLINE-05 | ux | S3 | likely | The service worker `notificationclick` calls `existing.navigate(url)` on an open window (`apps/pwa/pwa/sw.js:76`). This bypasses the in-app update/edit blockers (`app-update-safety.ts`). | Tapping a notification while a form is open reloads that tab. Unsaved in-memory state is lost; autosaved drafts survive. | `postMessage` the event id to the existing client and route in-app; use `navigate`/`openWindow` only when no client is controlled. | S | none |
| APP-OFFLINE-06 | arch | S4 | confirmed | Three dataset protocols are still served: v1 (no `protocol` param, `payment-command/handler.mjs:12` → `store.mjs:90` `readOfflineDataset`), v2 chunks, v3 delta; the notification handler accepts 1/2/3 (`notifications/handler.mjs:14-23`). The current client only requests 2 or 3 (`offline-dataset.ts:80`). Logic is split across `api/offline-dataset-delta.mjs`, `api/offline-dataset-cursor.mjs`, `business/offline-dataset*.mjs`. | Unused server code path (`business/offline-dataset.mjs` v1 reader) to maintain and test. | Remove protocol 1 after one release. Move the delta helpers next to the business reader. | S | none |

### NOTIFY (item 4)

Survey claim "hand-rolled Web Push crypto, unused `web-push` dependency" did not hold: encryption and VAPID use `web-push` `generateRequestDetails` (`notifications/web-push.mjs:18,23`); only the HTTPS send is custom, with an 8 s cap and no redirect following. Push payload is generic ("An update is available."), no borrower data (`web-push.mjs:23`, `sw.js:70`). The wake path (`postcommit.mjs:11-34`) is a bounded hint with metadata-server identity; failures are logged as `deferred_to_recovery`. The worker tick (`worker.mjs`, `dispatcher.mjs`) claims one delivery at a time with lease generations and completes with a fixed result vocabulary. `scheduledBoundary` (`workers/runtime.mjs:5-13`) is checked under DATE. Job idempotency is delegated to SQL `pwa_job_run_v1` (`jobs/runner.mjs:7`) with request ids `job|day|scope` (`workers/runtime.mjs:39`); see the DB note for the SQL side.

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-NOTIFY-01 | risk | S4 | confirmed | The notification store resolves the actor with capability `read` for every action, including subscribe, revoke, preference and the notification dataset (`notifications/store.mjs:10`). | A read-only member can register push devices for themselves. Low risk, but it does not match the `command`-for-writes rule used elsewhere. | Decide whether device subscription is a "read" privilege. If not, pass the capability per action. | S | owner decision |
| APP-NOTIFY-02 | ux | S4 | confirmed | The push endpoint allowlist covers FCM, Apple and Mozilla only (`notifications/web-push.mjs:7-8`). | Edge on Windows (WNS `*.notify.windows.com`) subscriptions are rejected as `invalid_subscription`. | Add `*.notify.windows.com` if Windows Edge is used; otherwise document the supported browsers. | S | none |

### SEC (item 5)

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-SEC-01 | risk | S3 | confirmed | Hosting headers are only `X-Content-Type-Options` and `Referrer-Policy` (`firebase.json`; `scripts/deploy-hosting.mjs:40`; PROD `scripts/promotion/deploy-business-hosting.mjs:67,235`). No `Content-Security-Policy`, no `frame-ancestors`/`X-Frame-Options`, no HSTS header configured. | The app, which posts payments on a tap, can be framed by another site (clickjacking). There is no CSP backstop against injected script. | Add `Content-Security-Policy: frame-ancestors 'none'` plus a compatible `default-src`/`connect-src` list (Firebase, the two Cloud Run origins) and `X-Frame-Options: DENY`, in both deploy scripts. | S | PROD change |
| APP-SEC-02 | ux | S4 | confirmed | `index.html:1` viewport `maximum-scale=1,user-scalable=no`; `zoom-guard.ts` also cancels pinch and ctrl-wheel gestures inside `#root`. | Blocks text zoom (WCAG 1.4.4). The UX worker covers visual checks. | Remove `user-scalable=no`/`maximum-scale`; keep only the double-tap guard if needed. | S | owner decision |
| APP-SEC-03 | std | S4 | confirmed | Project id literal `clever-oasis-508610-n7` in 12 files under `services/` and `apps/pwa/src` (grep). Owner email literal in `api/dev-read-config.mjs:3`, `notifications/policy.mjs:10`, `production/config.mjs:34`. | Identity and target changes need edits in many places. | One `services/lib/identity.mjs` (and one PWA constant) exporting project, instance and owner. | S | none |
| APP-SEC-04 | std | S4 | confirmed | `package.json` lists `react`, `react-dom` and `firebase` (client SDK) under `dependencies`; the server image runs `npm ci --omit=dev` (`Dockerfile:4`). | Browser-only packages are installed in every Cloud Run image (size, attack surface, audit noise). | Move them to `devDependencies` (Vite bundles them). | S | none |

### ARCH (item 6)

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-ARCH-01 | arch | S3 | confirmed | DEV and PROD compose different authorization code. DEV uses the default owner-email `principalAllowed` and a `Partners` lookup with no capability (`store.mjs:38,51-53`; `dev-server.mjs` `createDevCommandStore`, `store.mjs:336-338`); DEV notifications pin the owner tuple (`notifications/dev-api.mjs:8-12`). PROD uses `createEnvironmentCommandStore` with policy capabilities (`store.mjs:341-344`; `business-runtime.mjs:41,43`). | Capability behaviour (`read` vs `command`, `receipt.*`, second partner) is first exercised in PROD. A capability regression cannot be caught by DEV testing. | Run DEV through `createEnvironmentCommandStore` with a DEV capability policy (owner plus a synthetic second member) and retire the owner-only branch. | M | none |
| APP-ARCH-02 | std | S4 | confirmed | PROD imports DEV-named modules: `business-runtime.mjs:15` (`createDevReadHandler`), `store.mjs:32` (`DEV_PROJECT, OWNER_EMAIL` from `api/dev-read-config.mjs`). | Reviewers misread PROD code as DEV-only; release risk through confusion. | Rename to neutral names (`read-handler.mjs`, `identity.mjs`). | S | none |
| APP-ARCH-03 | std | S4 | confirmed | Five pool setups with their own timeouts (`api/server.mjs:14`, `api/dev-read-server.mjs:19`, `payment-command/dev-server.mjs:24`, `production/business-server.mjs:11`, `workers/server.mjs:9`), four connection guards (`payment-command/application-target.mjs`, `dev-target.mjs`, `production/business-target.mjs`, `workers/target.mjs`) and 10 local `const uuid=` regexes across `services` and `apps/pwa/src` (two accept any UUID version, eight require v4). | Fixes and timeout policy drift between services. | One `services/lib/` with `createIamPool(config)`, `createConnectionGuard(spec)` and `ids.mjs`. | M | none |
| APP-ARCH-04 | arch | S4 | confirmed | No package boundary between service folders: 100 cross-folder relative imports (`../business/` 30, `../api/` 26, `../receipts/` 12, `../notifications/` 12, `../contracts/` 7, `../payment-command/` 6, others 7). `services/api` serves as a shared library. | Hard to see which code each Cloud Run role ships or depends on. | A plain `services/lib/` for shared code is enough. Workspaces or packages are not warranted at this size. | S | none |
| APP-ARCH-05 | arch | S4 | confirmed | Two app shells: synthetic `main.tsx` (29 KB) and live `live-main.tsx` (72 KB, 498 lines). `npm run build`, `npm run dev`, `npm run check` and the Playwright web server use synthetic mode (`package.json`; `playwright.config.ts`; `vite.config.ts:10,15`). The live bundle is built by `build:live-dev` in CI (`ci.yml:23`) and by one unit test, but not by `npm run check`. | Behaviour verified in the synthetic shell can differ from the shipped shell; a local `npm run check` passes while the live build is broken. | Short term: add `build:live-dev` to `npm run check`. Longer term: let synthetic mode mount `live-main` with the synthetic adapter. | S | none |
| APP-ARCH-06 | arch | S4 | likely | No router (view state in `live-main.tsx`), inline `t(en, th)` pairs, no state library. | At two users and about 45 components, a router library or i18n framework is not warranted. The real cost is the 72 KB single component. | Split `live-main.tsx` by view (borrowers, collection, cash, management, settings) and keep `t()`. Do not add a router or i18n library. | M | none |
| APP-QUALITY-01 | std | S4 | confirmed | No lint or format tooling (`package.json` has no eslint/prettier/biome). 515 lines over 400 characters in `apps/pwa/src/*.ts(x)` + `services/*/*.mjs` (`awk 'length>400'`). 400 `any` usages in `apps/pwa/src` (`:any`, `<any>`, `as any`). `tsconfig.json` includes only `apps/pwa/src`, so `services/**/*.mjs` and `tests/e2e/*.ts` are never type-checked. | Review and diff quality suffer; type errors in services surface only at runtime or in tests. | Add a formatter (Prettier or Biome, format-only). Add `tsconfig.services.json` with `allowJs`+`checkJs` over `services/`, run in `npm run check`, with `// @ts-nocheck` opt-outs fixed gradually. | M | none |
| APP-PERF-01 | std | S4 | confirmed | The live builds ship both 1254×1254 logos: `loan-manager-logo-prod-pink` 1,438.64 kB and `loan-manager-logo-dev-orange` 1,568.93 kB (`check.log`, `build-live-dev.log`). Both `new URL()` branches are emitted (`live-main.tsx:51`), and the service worker precaches every `assets/*.png` (`vite.config.ts` APP_ASSETS; `sw.js:6-24`). Main chunk 807.70 kB (prod) / 678.62 kB (dev). PROD Hosting sends `Cache-Control: no-store` on every path (`deploy-business-hosting.mjs:67`), so hashed assets are never HTTP-cached. | About 3 MB of logos and 0.8 MB of JS on every service-worker install over mobile. | Resize the logo to about 256 px with one asset per mode. Lazy-load management/analytics views. Use `public, max-age=31536000, immutable` for `/assets/*`. | S | none |

### TEST (item 7)

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-TEST-01 | risk | S4 | confirmed | 75 of 450 e2e tests fail in this container, all in the six specs that serve a built live bundle from a local HTTPS fixture via `--host-resolver-rules=MAP dev-lm.mw-credit.com 127.0.0.1:<port>` and `--no-proxy-server` (`payment-offline-sdk.spec.ts:21`; `fixtures/canonical-server.ts`). Diagnostic with the same launch args: the page loaded the **real** DEV Hosting bundle (`index-BMDLDRQr.js`, not the fixture's), the fixture logged `served []`, and a mapped `.invalid` host failed with `net::ERR_TUNNEL_CONNECTION_FAILED`, so Chromium 153 here tunnels every request through the sandbox egress proxy and ignores the host mapping. The built bundle does contain the bridge (`grep -c __syntheticSdk` = 1). The specs then sign in against whatever page answered, and only fail later with `fixtureSignIn` undefined. | In cloud sessions the live-shell suite cannot be validated and the specs silently read the real DEV site (GET only). The remaining 364 synthetic tests passed, and the earlier draft's rerun after `build:live-dev` showed the same error, so the failure is not a stale build. The repository has no check that the fixture actually served the page. | Assert the fixture served the shell before signing in (`fixture.requests.length > 0` from `fixtures/canonical-server.ts`) so a misrouted environment fails with a clear message instead of `fixtureSignIn` undefined, and document in `docs/Development.md` that the live-shell specs need direct loopback networking (CI runners have it; cloud sessions do not). | S | none |
| APP-TEST-02 | risk | S3 | confirmed | `database.yml:5,7` trigger paths are `database/**`, `scripts/database/**`, `tests/integration/**` … but not `services/**`. `ci.yml` runs units plus e2e only on push to main or the `ci:checkpoint` label (`ci.yml:27-30`). `tests/integration` (82 files) is the only suite that exercises SQL issued by `services/business/*` and `payment-command/store.mjs`. | A change to service SQL (read models, store) merges without running the integration suite that exercises it. | Add `services/**` to `database.yml` paths. A Linux runner would be cheaper; see the DB note. | S | none |
| APP-TEST-03 | risk | S3 | confirmed | Modules with no reference from `tests/unit`, `tests/integration` or `tests/e2e` (grep by path/basename): services `business/cash.mjs`, `collection-receipts.mjs`, `management-assessments.mjs`, `management-financial.mjs`, `management-openings.mjs`, `management-position.mjs`, `preferences.mjs`, `contracts/management-command.mjs`, `management-tools-command.mjs`, `receipts/gcs-transport.mjs`, `agent-conversations/virtuals.mjs`, `relationships.mjs`; PWA `CashWorkspace.tsx`, `SharedBorrowerDetail.tsx`, `ReceiptPicker.tsx`, `CollectionReceipts.tsx`, `CompactPager.tsx`, `display-money.ts`, `cash-view.ts`, `domain-draft.ts`. (`charges.mjs`, `dashboard.mjs`, `upcoming.mjs`, `result.mjs`, `catalogue.mjs`, `PaymentGroups.tsx`, `Notifications.tsx` have at least one reference.) Some are exercised indirectly through e2e pages. | Money-reading SQL (cash, management financial, position) has no unit or Linux-run test. Regressions show up only in DEV/PROD. | Add small Linux `node:test` cases against the scratch PostgreSQL for `cash.mjs`, `management-financial.mjs`, `management-position.mjs`. Add unit tests for `display-money.ts` and `cash-view.ts`. | M | none |
| APP-TEST-04 | std | S4 | confirmed | `npm run test:e2e` writes screenshots into the tracked `outputs/` directory (`grep -o "outputs/..." tests/e2e/*.ts`: `r052-collection-read`, `r052-unified-receiving`, `r052-loan-read`, `r052-collection-shift`, `r052-receiving-ux`, `r052-phase5-completion`, `r052-phase1b`, …). After this run `git status --short outputs` showed 185 modified tracked PNGs across 12 `outputs/r052-*` folders; restored with `git checkout -- outputs`. | Running the suite dirties committed evidence; a careless `git add -A` after a local run commits regenerated screenshots, and the tracked PNGs change whenever rendering differs. | Write screenshots to the ignored `test-results/` (Playwright `outputDir`) or a `.gitignore`d `outputs/e2e-local/`; keep committed evidence as explicit copies made at release time. | S | none |

### DATE (item 9)

Contract check. The server emits two timestamp forms.
- Business columns are `timestamp without time zone` holding Bangkok local time (defaults and writes use `… AT TIME ZONE 'Asia/Bangkok'` in the migrations; `store.mjs:61` and `offline-dataset-delta.mjs:18` derive `businessDate` the same way). Read models select them with `::text`, giving `YYYY-MM-DD HH:MM:SS[.ffffff]` (`payment-command/result.mjs:11`; `"Created At"::text` ×10, `"Uploaded Receipt At"::text` ×5, `"Receipt Received At"::text` ×2 across `services/business`).
- Envelope instants (`asOf`, `recordedAt`, notification `occurredAt`) are ISO UTC with `Z` (`store.mjs:61`; `result.mjs:7`; `notifications/store.mjs:16,21`).

`displayTimestamp` (`apps/pwa/src/display-date.ts:6`) appends `+07:00` to naive strings (space or `T`), passes `Z` strings through, then formats in `Asia/Bangkok`. Date-only values are validated with `T00:00:00Z` and formatted without shifting (`display-date.ts:5`). The client's "today/yesterday" uses `Intl` with `Asia/Bangkok` (`cash-view.ts:1`); `statementTime` slices `HH:MM` from the naive text (`cash-view.ts:3`). `scheduledBoundary` adds a fixed +7 h (`workers/runtime.mjs:12`); Bangkok has no DST. Scheduler jobs are `5 0 * * *` and `0 * * * *` (`infrastructure/modules/dev-workers/main.tf:109-110`), and the runtime rejects a run whose Bangkok day/hour no longer matches the intended boundary (`workers/runtime.mjs:56-58`, lag cap 1 h daily / 10 min hourly), so a late retry cannot run for the wrong day.

Verdict: **confirmed consistent** for every displayed value (reproduced: text path shows `15 Oct, 10:00` for a Bangkok 10:00 value). One latent exception below.

| Code | Type | Sev | Conf | Evidence | Impact | Recommendation | Effort | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-DATE-01 | bug | S3 | confirmed | Three read models select a naive Bangkok timestamp **without** `::text`: `business/collection-receipts.mjs:13`, `business/offline-dataset.mjs:88`, `business/offline-dataset-chunks.mjs:115` (`CASE … "Uploaded Receipt At" ELSE "Receipt Received At" END AS "receiptAt"`). node-pg turns type 1114 into a JS Date in the container time zone (UTC), so JSON carries `…T10:00:00.123Z`. `displayTimestamp` then shows 17:00. Reproduced on the scratch cluster: Date path → `15 Oct, 17:00`. Today `receiptAt` from these three queries is only used as a React effect key (`CollectionReceipts.tsx:8`). | No wrong display today. The first UI that shows this field will be 7 h off. | Add `::text` at the three sites. Optionally register `pg.types.setTypeParser(1114, v => v)` in the shared pool factory so naive timestamps are never converted to Date. | S | none |
| APP-DATE-02 | risk | S4 | hypothesis | `display-date.ts:6` builds `YYYY-MM-DDTHH:MM:SS.ffffff+07:00` (6-digit fraction from `::text`). ECMAScript's date-time format defines 3 fraction digits; longer fractions rely on engine leniency. V8 accepts it (reproduced). WebKit (iPhone) was not available here. | If WebKit rejects it, timestamps render as `—` on iPhone. | Truncate the fraction to 3 digits before parsing, or emit `to_char(…,'YYYY-MM-DD"T"HH24:MI:SS.MS')` server-side. | S | none |

## UX

Merged by the orchestrator from Agent E — User Experience Officer (UX focus-group orchestrator, Claude Fable 5.1, medium effort). Screenshots referenced by name are kept in the session scratchpad, not in Git; measurements come from Playwright runs against the synthetic preview and one unauthenticated GET pass on DEV.

**UX checks executed**

| Check | Command | Result |
| --- | --- | --- |
| Live shell, five flows, desktop 1280 | `node ux/flows.mjs desktop` | 19 screenshots `*-desktop1280.png`; no page errors; no horizontal overflow on any screen (scrollW = innerW = 1280) |
| Live shell, five flows, mobile 430 | `node ux/flows.mjs mobile` | 19 screenshots `*-mobile430.png`; no page errors; no horizontal overflow (430) |
| Signed-out menu, drawer geometry, sub-44px targets per screen, currency sign, nested scroll | `node ux/extra.mjs` | Drawer rect `[0,0,300,932]`; small targets listed under A11Y; `฿-120` vs `-฿200` |
| Contrast of 14 text/background pairs | `node ux/contrast.mjs` | Lowest 4.0:1 (dashboard pending amount `rgb(255,0,0)` 21.6px bold; disabled Auto-assign 4.0 with opacity .7); all others ≥ 4.6:1 |
| Zoom lock | `node ux/zoom.mjs` | `user-scalable=no, maximum-scale=1`; ctrl+wheel and `gesturestart` inside `#root` are `preventDefault`ed |
| Bilingual completeness | `python3 -I ux/i18n.py` | 1174 `t()` calls, 55 ternaries, 31 `{en,th}` objects: 0 missing `th`, 0 empty `th`, 0 Thai-less `th`; 7 raw English attributes/strings (see I18N) |
| DEV unauthenticated pass | `node ux/dev-pass.mjs` | 200; HSTS `max-age=31556926`; no CSP, no X-Frame-Options, no Permissions-Policy; `cache-control: no-store` on every file incl. hashed assets; SW registered and controlling, scope `/`; manifest valid; FCP 632 ms, TTFB 211 ms; landing transfers: JS 816,721 B, CSS 87,872 B, logo PNG 1,568,929 B |
| Synthetic preview smoke on :5174 | `node ux/synth.mjs` (earlier worker, re-read) | Design preview only; not used for findings |

**UX checks not run**

| Check | Reason |
| --- | --- |
| Authenticated DEV UX | No DEV test identity in the repository; brief forbids sign-in |
| axe / automated a11y | Excluded by brief; manual checks only |
| Real offline sync round-trip, update prompt, Google popup | Not reachable in the stubbed shell; reviewed from source, marked likely |
| `npm run build`, e2e suite | Another worker owns them |

#### RECEIVE (receive payment online / offline)

**APP-UX-RECEIVE-01** · Type ux · Severity S3 · Confidence confirmed
Evidence: `05-receive-form-mobile430.png`; `extra.mjs` → `receive icon-only buttons: ["Clear allocations","Review payment"]`; mobile `receive-buttons` shows `Clear draft` 44×44 (icon only), `Clear allocations` 44×44, `Review payment` 44×44. `live-style.css:309-313` styles the allocation header; `SelectedCharges.tsx` renders the primary action as `.icon-action`.
Impact: On a phone the only way to proceed from the allocation form is an unlabeled clipboard icon in the grey summary bar; two different eraser icons sit on the same screen (clear draft vs clear allocations). A first-time or hurried user can wipe the draft instead of reviewing, or not find the next step at all.
Recommendation: Give "Review payment" a labelled primary button below the form (full width on ≤600px) and keep the icon as a secondary shortcut; use distinct icons or a text label for "Clear draft".
Effort S · Needs none

**APP-UX-RECEIVE-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `extra.mjs` → `receive nested scroll: [["payment-charge-scroll",371,617]]`; `05-receive-form-mobile430.png` shows the 07-Oct row clipped mid-text inside an inner scroll box while the page itself also scrolls.
Impact: Nested scrolling on touch devices hides charges (4 rows need 617px, box is 371px) and makes it easy to scroll the page instead of the list; users may miss charges they wanted to allocate.
Recommendation: On ≤1050px let `.payment-charge-scroll` grow to content (`max-height:none`) and rely on page scroll; keep the sticky summary.
Effort S · Needs none

**APP-UX-RECEIVE-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `07-receive-review-mobile430.png`; `review-text`: "Synthetic Borrower One / Synthetic Borrower One / … / Synthetic cash box / 08-Oct · Bank Transfer". `SelectedCharges.tsx:255` renders `<p>{draft.accounts.find(...)?.label}</p><p>{displayValue(draft.businessDate)} · method</p>` without field titles.
Impact: The review screen repeats the borrower name twice and shows the receiving account and date/method as bare values with no caption. For a money-confirming step the reader must infer what "Synthetic cash box" means.
Recommendation: Drop the duplicate heading; prefix account, date and method with `field-title` captions ("Receiving account", "Business date · method").
Effort S · Needs none

**APP-UX-RECEIVE-04** · Type ux · Severity S3 · Confidence confirmed
Evidence: After `ctx.setOffline(true)` + `offline` event, `review-offline-text` contains no offline wording anywhere in the body and the button still reads "Confirm payment" (`confirm-offline-label`); `live-main.tsx:186-191` keeps `status==='ready'` when `liveOfflineEnabled`; `SelectedCharges.tsx:255` only changes the label when `!queueEnabled`. Only after tapping does `09-receive-saved-offline-mobile430.png` say "Saved on this device. Will sync when connected."
Impact: The user cannot tell before confirming that the payment will be queued rather than posted. Receipts/notifications will not happen until sync, which they only learn afterwards.
Recommendation: Show a persistent "Offline – changes will be saved on this device" status strip in the header when `!navigator.onLine`, and label the button "Save payment for sync" while offline.
Effort S · Needs none

**APP-UX-RECEIVE-05** · Type ux · Severity S4 · Confidence confirmed
Evidence: `09-receive-saved-offline-mobile430.png`: a 36-character UUID "Request reference" wraps across two lines with a "Copy" button; `18-receive-thai-mobile430.png` same in Thai.
Impact: The UUID is meaningless to the two operators; the useful next action (open "Waiting to sync") is not offered here.
Recommendation: Collapse the reference under a `<details>` and add a "View saved changes" button that opens `OfflinePayments`.
Effort S · Needs none

**APP-UX-RECEIVE-06** · Type ux · Severity S4 · Confidence confirmed
Evidence: `contrast.mjs` → Auto-assign (disabled) `rgb(119,119,119)` on `rgb(242,242,242)` ratio 4.0 at opacity .7 (`live-style.css:313`); `05-receive-form-mobile430.png`.
Impact: Disabled-until-amount button is barely readable and there is no hint that typing an amount enables it.
Recommendation: Keep opacity 1 with `#666` text, or add helper text "Enter amount received to auto-assign".
Effort S · Needs none

#### COLLECT (collection day view)

**APP-UX-COLLECT-01** · Type ux · Severity S4 · Confidence confirmed
Evidence: `03-collection-mobile430.png`: group chips show remaining (฿1,200 / ฿1,500 / ฿500) for the first three groups but collected (฿700) for "Fully paid"; `live-style.css:322` `.paid-group-total{color:#237b39}`.
Impact: Same chip position carries two meanings; the legend "Left: remaining · Right: collected today" does not cover the chip.
Recommendation: Caption the chip ("remaining" / "collected") or show both numbers for every group.
Effort S · Needs none

**APP-UX-COLLECT-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `03-collection-mobile430.png` / `-desktop1280.png`: borrower names and left amounts are coloured by status (red/orange/purple/green, `live-style.css:309`), with no icon or text on the tile itself; the status is only in the group heading above.
Impact: After scrolling past a heading, colour is the only status cue; fails WCAG 1.4.1 for colour-blind readers.
Recommendation: Add a short status word or dot-with-text to `.collection-tile-right` (reuse the group label).
Effort S · Needs none

**APP-UX-COLLECT-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `extra.mjs` small@collection-detail: four `SYN-L1 · Synthetic loan` link buttons 177×32 (`live-style.css:317` `.record-field-link{min-height:32px}`); `04-collection-detail-mobile430.png`.
Impact: Loan links inside charge rows are under the 44px target the rest of the app enforces; mis-taps open the charge instead of the loan.
Recommendation: `min-height:44px` on `.record-field-link` inside `.collection-charge-row`.
Effort S · Needs none

**APP-UX-COLLECT-04** · Type ux · Severity S4 · Confidence confirmed
Evidence: `04-collection-detail-mobile430.png`, header shows `0%` progress bar; `live-main.tsx:479` renders `offlinePreparation.syncActive` progress with only an aria-label.
Impact: A bare "0%" next to the search icon has no visible caption; operators cannot tell what is loading or whether it is stuck (in this run it stayed at 0% because the dataset endpoint was stubbed to 503).
Recommendation: Replace with a short text "Preparing offline data 0%" or hide the percent below 1%.
Effort S · Needs none

#### BORROWER (borrower / loan detail + edit)

**APP-UX-BORROWER-01** · Type ux · Severity S4 · Confidence confirmed
Evidence: `12-borrower-detail-mobile430.png` and `borrower-detail-text`: caption "Borrower Name - TE", value "Synthetic Borrower One - " (trailing dash); `BorrowerRecord.tsx:60` `t('Borrower Name - TE','ชื่อผู้กู้ - ไทย/อังกฤษ')`; `borrower-label.ts:2` always joins `name + ' - ' + description` even when description is null. Edit mode labels the same field "Borrower Name - Thai" (`13-borrower-edit-mobile430.png`).
Impact: "TE" is an AppSheet-era abbreviation the English UI never explains, and an empty English name leaves a dangling separator. Read and edit modes name the same field differently.
Recommendation: English caption "Borrower name (Thai / English)"; in `borrowerLabel` omit the separator when one side is empty.
Effort S · Needs none

**APP-UX-BORROWER-02** · Type ux · Severity S3 · Confidence confirmed
Evidence: `zoom.mjs` / `extra.mjs` small@borrower-edit: checkboxes "AI Collection Enabled" and "Hide from Borrowers List" are 13×13 px with a 23 px label; `live-style.css:218` excludes `[type=checkbox]` from the 44px rule.
Impact: Two consequential toggles (one enables automated collection messaging) are the smallest targets in the app; easy to miss or hit by accident on a phone.
Recommendation: Style these as 24px checkboxes inside a 44px-tall flex label (same pattern as `.payment-allocation-row label`).
Effort S · Needs none

**APP-UX-BORROWER-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `edit-unlabelled` → `<select><option value="">—</option><option value="SYN-B2">…` (Referrer) has no `<label>`/`aria-label`; `extra.mjs` lists its label text as "Referrer—Synthetic Two" i.e. the heading text is a sibling, not an associated label.
Impact: Screen readers announce an unnamed combo box; clicking the caption does not focus it.
Recommendation: Wrap the select in the existing `<label>` like the other fields in `BorrowerRecord.tsx`.
Effort S · Needs none

**APP-UX-BORROWER-04** · Type ux · Severity S4 · Confidence confirmed
Evidence: `12-borrower-detail-desktop1280.png`: "New loan · Payment history · Edit borrower · Delete borrower" are four identical outlined buttons in one row; on mobile four identical icon squares (`borrower-detail-buttons` 44×44 each).
Impact: The destructive action sits beside the most-used ones with no visual distinction; on mobile it is an unlabeled trash icon one tap away.
Recommendation: Move "Delete borrower" to the end of the form or a `<details>` "More", and give it the danger colour already used for `.payment-status-error`.
Effort S · Needs none

**APP-UX-BORROWER-05** · Type ux · Severity S4 · Confidence confirmed
Evidence: `zoom.mjs` → Save button at y=1121 of a 1270px form; `13-borrower-edit-mobile430.png` shows no Save in the first viewport; `extra.mjs` → all 13 edit fields `required:false`, `inputmode:null`, `autocomplete:null`.
Impact: On a phone the user fills 12 fields before seeing Save/Cancel, and the numeric/phone-style fields open the default keyboard. No field is marked required even though the form cannot save without a name.
Recommendation: Sticky bottom action bar for Save/Cancel on ≤1050px; mark name `required`; add `inputmode`/`autocomplete` where applicable.
Effort S · Needs none

**APP-UX-BORROWER-06** · Type ux · Severity S4 · Confidence confirmed
Evidence: `borrowers negative` → `-฿200` (`LoanRecords.tsx:33`/`live-main.tsx:342` Intl currency) vs `dashboard negative` → `฿-120` (`Dashboard.tsx:13-15` `'฿'+numeric(...)`); `02-dashboard-mobile430.png`.
Impact: Negative money is formatted two ways across adjacent screens.
Recommendation: Use one shared `money()` helper (Intl currency with `narrowSymbol`) in `Dashboard.tsx`, `CashWorkspace.tsx` and `display-money.ts`.
Effort S · Needs none

#### CASH (cash workspace)

**APP-UX-CASH-01** · Type ux · Severity S4 · Confidence confirmed
Evidence: `14-cash-mobile430.png`: Statement Date native `<input type="date">` renders `10/08/2026` (browser locale mm/dd/yyyy) while every other date in the app is `08-Oct` (`display-date.ts`).
Impact: Two date notations on one screen; for a Thai operator on an en-US device the month/day order is ambiguous.
Recommendation: Show the selected date formatted with `displayDate()` next to the picker, or use the preference `dates` list as a select (the API already returns `dates`).
Effort S · Needs none

**APP-UX-CASH-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `14-cash-mobile430.png`: seven KPI rows then a "Cash Statement" card; "Account and date filters are temporary until saved as defaults" + "Save as defaults" sits between filters and results (`cash-text`).
Impact: On mobile the statement (the actionable part) is below ~1,300px of KPIs that the Dashboard already shows; the "temporary until saved" note reads as a warning on every visit.
Recommendation: Collapse the KPI block into a `<details>` on ≤1050px (open on desktop) and show the note only when the selection differs from the saved default.
Effort S · Needs none

**APP-UX-CASH-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `Dashboard.tsx:15`, `CashWorkspace.tsx:20`: labels `'Tommy Withdrawn MTD'`, `'Lisa Withdrawn MTD'` hard-coded (Thai `'ทอมมี่ถอนเดือนนี้'`).
Impact: Partner names are baked into UI strings; the Management › Partners screen already carries partner records, so a rename or third partner needs code changes.
Recommendation: Derive the two labels from partner display names (or accept as-is for a two-partner business). Needs owner decision.
Effort S · Needs owner decision

#### SETTINGS (notifications / language / sign-in / updates)

**APP-UX-SETTINGS-01** · Type ux · Severity S3 · Confidence likely
Evidence: `live-main.tsx:325-330` `login()`: `catch { clear(); setStatus(offlineBlocked.current ? 'offline' : 'signed_out'); }` — a blocked popup, cancelled popup or `auth/unauthorized-domain` returns to the same "Sign in to continue" card with no message (`01-signin-mobile430.png`).
Impact: A user whose popup was blocked (common in iOS standalone PWAs) sees nothing happen and retries blindly.
Recommendation: Keep the error code and render one line under the button ("Sign-in window was closed or blocked. Allow pop-ups and try again."), reusing `ErrorReference`.
Effort S · Needs none

**APP-UX-SETTINGS-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `extra.mjs` signed-out header: `[["Open navigation",false],["Refresh Borrowers — return to first page",true]]` while the title reads "Dashboard"; signed-out drawer contains only "Close menu | EN | ไทย" (`20-signedout-menu-mobile430.png`).
Impact: Before sign-in the header advertises a Dashboard, a disabled refresh with a Borrowers label, and a hamburger that opens an almost empty drawer; the language switch is hidden behind it on mobile.
Recommendation: On `status!=='ready'` hide the refresh button and show EN/ไทย inline on the sign-in card instead of in the drawer.
Effort S · Needs none

**APP-UX-SETTINGS-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `16-notifications-mobile430.png`: three equal secondary buttons "Enable on this device / Turn off for your account / Check notification status" with no current state shown; `notif-text` has no "Enabled/Disabled" line before interaction.
Impact: The user cannot see whether notifications are on for this device without pressing "Check notification status".
Recommendation: Call status on mount and render a one-line state ("Off on this device") above the buttons; hide "Check…" once status is known.
Effort S · Needs none

**APP-UX-SETTINGS-04** · Type ux · Severity S4 · Confidence likely
Evidence: `usePwa.ts:153` auto-runs `update()` (activate waiting SW then reload) whenever `safe && visible`; `live-main.tsx:66` restores view from `sessionStorage` after the reload. The menu's "Update and reload" button (`live-main.tsx:404`) is therefore rarely reachable.
Impact: The app may reload itself mid-session (list position, search, expanded groups lost) without telling the user why; editors block it, but read-only screens do not.
Recommendation: Keep auto-update but show a 2-second "Updating app…" toast before `reload()` (the `app-update-status` span already exists) or defer until the next navigation.
Effort S · Needs none

**APP-UX-SETTINGS-05** · Type ux · Severity S4 · Confidence confirmed
Evidence: `21-menu-settled-mobile430.png`, `menu-buttons` (mobile): "Waiting to sync", "Notifications", EN/ไทย, "Sign out" are the same outlined button style stacked under the nav; "Sign out" is directly below the language toggle.
Impact: Sign-out is one mis-tap from the language switch; signing out purges the offline repository (`live-main.tsx:333`) including unsynced payments' lease.
Recommendation: Separate "Sign out" with a divider and spacing, and confirm sign-out when `WaitingToSyncButton` count > 0.
Effort S · Needs none

#### NAV (shell / navigation)

**APP-UX-NAV-01** · Type ux · Severity S4 · Confidence confirmed
Evidence: Every mobile and desktop screenshot after sign-in (`02-…`, `03-…`, `14-…`) shows "Offline data preparation incomplete" with the Retry button touching the text; `live-style.css:536` `.offline-preparation-status{margin:4px 0;font-size:12px}`, no gap. The banner persists on every view (`live-main.tsx:483`).
Impact: 12px text, no spacing and permanent placement make the single most frequent status message in the app the least readable; after the first retry it becomes noise.
Recommendation: `gap:8px`, 14px font, and auto-dismiss (or collapse to an icon in the header) once the user has retried or after preparation succeeds.
Effort S · Needs none

**APP-UX-NAV-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `02-dashboard-desktop1280.png`: 180px sidebar with 64px-tall items (`live-style.css:322`), bottom account controls cut off at 800px height ("Notifications" clipped); `15-menu-open-desktop1280.png` same.
Impact: On a 1280×800 laptop the sidebar needs its own scroll to reach EN/ไทย, install and Sign out.
Recommendation: Reduce desktop nav items to 48px (`live-vertical-nav button` default) or collapse Management sub-items by default.
Effort S · Needs none

**APP-UX-NAV-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `03-collection-mobile430.png` vs `04-collection-detail-mobile430.png`: the header's left control switches between hamburger and back arrow (`live-main.tsx:477`), and the bottom nav remains while a detail is open; the "Receive" icon in the group heading (`collection-tile-right .icon-action`) and the bottom "Payments" tab use the same hand-coin icon.
Impact: Two identical icons on one screen do different things (open receive form vs. go to Payments list).
Recommendation: Use a distinct icon for the per-borrower "Receive payment" action (e.g. plus-in-circle) or label it.
Effort S · Needs none

#### A11Y (accessibility, manual)

**APP-UX-A11Y-01** · Type ux · Severity S3 · Confidence confirmed
Evidence: `index.html:1` `maximum-scale=1,user-scalable=no`; `zoom.mjs` → `{ctrlWheelPrevented:true, gesturePrevented:true}`; `zoom-guard.ts:3-7` cancels `gesturestart/gesturechange`, two-finger `touchmove` and ctrl+wheel inside `#root`; `live-style.css:324` `#root{touch-action:pan-x pan-y}`. The DEV site serves the same meta (`dev-pass.mjs` → `meta viewport … user-scalable=no`).
Impact: Pinch-zoom and ctrl+wheel zoom are blocked (WCAG 1.4.4 / 1.4.10). iOS ignores the meta but the JS guard still cancels the gesture. Low-vision use of the 12–14px captions depends on OS-level accessibility zoom.
Recommendation: Remove `maximum-scale=1,user-scalable=no` and the gesture guard (keep `touch-action: pan-x pan-y` only if accidental zoom was the original problem), or gate the guard behind an in-app "Lock zoom" preference.
Effort S · Needs owner decision

**APP-UX-A11Y-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `contrast.mjs`: dashboard "Pending Payment Amount" `rgb(255,0,0)` on white = 4.0:1 at 21.6px bold (passes large-text 3:1 only); group total chip `rgb(99,103,107)` on `rgb(230,232,234)` = 4.64:1 at 16px; partially-paid name `rgb(184,92,0)` = 4.6:1. All other measured pairs ≥ 5.1:1. Focus ring: `focus` arrays show `outline solid 3px rgb(68,68,68)` on every tab stop (good).
Impact: The pure-red KPI colour is the weakest text colour in the app and is used for the most important number; it would fail if the font were reduced.
Recommendation: Use the existing `#c62828` (5.6:1) for the KPI instead of `red`.
Effort S · Needs none

**APP-UX-A11Y-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `extra.mjs` small@receive: four allocation checkboxes 24×24 (label row is 44px tall, `live-style.css:202-203`, acceptable); `zoom.mjs` dashboard text sizes include 12px (×2) and 14px (×4); offline banner 12px; `.cash-transactions` table 12px on ≤800px (`live-style.css:304`).
Impact: Several informational texts sit at 12px on a phone, below the 14px the rest of the app uses for captions.
Recommendation: Raise 12px captions to 14px; keep tabular numbers at 14px with horizontal scroll (already `.cash-table-scroll`).
Effort S · Needs none

#### I18N (bilingual completeness)

**APP-UX-I18N-01** · Type ux · Severity S4 · Confidence confirmed
Evidence: `i18n.py` → 1174 `t()` pairs, 55 ternaries, 31 `{en,th}` objects, 0 missing/empty Thai. Raw English strings (7): `CompactPager.tsx:5` `aria-label="Pagination"`, `live-main.tsx:478` `alt="Loan Manager"`, `main.tsx:103` `alt="Loan Manager"`, `main.tsx:144` `aria-label="Language"` (preview shell), `CashWorkspace.tsx:12` / `SelectedCharges.tsx:18` (false positives: TypeScript `Promise` generics). Also `index.html:1` `lang="en"` fixed and `offline.html` `<html lang="en">` with Thai body text under `lang="th"` (acceptable).
Impact: Thai screen-reader users hear "Pagination" and "Loan Manager" (the old product name) in English; otherwise Thai coverage is complete.
Recommendation: `aria-label={t('Pagination','การแบ่งหน้า')}`; logo `alt={t('MW Credit','MW Credit')}` or empty alt since the title text follows.
Effort S · Needs none

**APP-UX-I18N-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `17-collection-thai-mobile430.png` / `thai-collection-text`: bottom tabs "ภาพรวม / งานติดตาม / รับชำระ / ผู้กู้" fit; drawer label "รายการเรียกเก็บล่วงหน้า" (Upcoming Charges) is 24 characters at 16px in a 244px button (fits, single line). Thai money uses `th-TH` locale which yields the same `฿1,200`. No overflow at 430 (`overflow-thai` 430/430).
Impact: None observed; recorded so the owner knows Thai layout was checked at both widths.
Recommendation: None.
Effort S · Needs none

#### PERF (DEV unauthenticated load)

**APP-UX-PERF-01** · Type ux · Severity S3 · Confidence confirmed
Evidence: `dev-pass.mjs` → `/assets/loan-manager-logo-dev-orange-DNZr_iCT.png` 1,568,929 bytes (br) on the sign-in page; repo `apps/pwa/src/assets/loan-manager-logo-dev-orange.png` 1,568,929 B, `loan-manager-logo-prod-pink.png` 1,438,635 B; rendered at 32–36px (`live-style.css:127,168`). Landing total ≈ 2.5 MB of which the logo is ~63%; JS 816,721 B, CSS 87,872 B.
Impact: Every cold load and every cache miss (see PERF-02) pulls a 1.5 MB image for a 36px logo; on mobile data this dominates first paint after sign-in and the SW precache.
Recommendation: Export the logos at 192px PNG/WebP (expected < 20 KB) and keep the originals outside `src/assets`.
Effort S · Needs none

**APP-UX-PERF-02** · Type ux · Severity S4 · Confidence confirmed
Evidence: `dev-pass.mjs` → `cache-control: no-store` on `/`, `/assets/index-*.js`, `/assets/index-*.css`, the logo PNG, `manifest.webmanifest`, `sw.js`, `build-version.json`, `offline.html`. `firebase.json` sets no `Cache-Control`, so the hosting config for the DEV site adds `no-store` globally (not in this repo's `firebase.json`; the deployed headers were measured).
Impact: Hashed, immutable assets are refetched on every navigation that bypasses the service worker (first load, SW update, private tab); `sw.js`/`build-version.json` no-store is correct, the assets are not.
Recommendation: `Cache-Control: public, max-age=31536000, immutable` for `/assets/**`; keep `no-store` for `/`, `sw.js`, `build-version.json`, `manifest.webmanifest`.
Effort S · Needs infra change

**APP-UX-PERF-03** · Type ux · Severity S4 · Confidence confirmed
Evidence: `dev-pass.mjs` → FCP 632 ms, TTFB 211 ms, DOMContentLoaded 537 ms (sign-in page, cold); SW registered with scope `/` and controlling; manifest valid (`display: standalone`, 192/512 icons, `purpose: any` only). Headers: HSTS present (`max-age=31556926`, no `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy` set; no CSP, no `X-Frame-Options`/`frame-ancestors`, no `Permissions-Policy`.
Impact: Load performance is good. The missing headers are already item 5 of the App brief (A + F); noted here only as the measured DEV readback. Manifest lacks a `maskable` icon, so Android shows the logo in a white circle.
Recommendation: Add a `purpose: "maskable"` 512px icon to the manifest in `vite.config.ts`; headers per the A/F finding.
Effort S · Needs none

**Top 5 UX recommendations**

1. APP-UX-RECEIVE-01 — on phones the "Review payment" step is an unlabeled icon beside two eraser icons; give it a labelled primary button.
2. APP-UX-RECEIVE-04 — nothing tells the user they are offline before they confirm a payment; add an offline strip and change the button label.
3. APP-UX-PERF-01 — the 1.5 MB logo PNG is 63% of the DEV landing payload for a 36px image; export it at 192px.
4. APP-UX-A11Y-01 — zoom is locked by meta and JS guard; remove the lock or make it an opt-in preference.
5. APP-UX-BORROWER-02 — the two 13px checkboxes (AI Collection, Hide) are the smallest targets in the app; style them like the allocation checkboxes.

## Summary

| Severity | Count |
| --- | --- |
| S1 | 1 |
| S2 | 2 |
| S3 | 18 |
| S4 | 53 |
| Total | 74 |

Top 5 items for the owner:
1. APP-OFFLINE-01 (S1): one 401/403 (including a transient Firebase check failure or a grant slip after a migration) deletes payments recorded offline that have not synced yet. Keep pending rows on involuntary sign-out.
2. APP-PAY-01 (S2): receipt uploads slower than 5 s fail as "invalid", and the queued payment becomes blocked. Make the timeout retryable and shrink photos on the phone.
3. APP-OFFLINE-02 (S2): Sign out discards unsynced payments without a warning. Add a confirmation or block.
4. APP-ARCH-01 (S3): DEV never runs the PROD capability policy, so authorization changes are first tested in PROD. Run DEV through the same store with a DEV policy.
5. APP-SEC-01 (S3): the PROD site has no frame-ancestors/CSP header, so the payment UI can be framed by another site. Two header lines in the deploy scripts fix it.
