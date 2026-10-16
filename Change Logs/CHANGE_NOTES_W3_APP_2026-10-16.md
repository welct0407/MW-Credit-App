# R063 Wave 3, app branch — 16 October 2026

Branch `claude/review-w3-app`, from `main` 3678eb6. Owner decisions of 16 October 2026 apply.

## Purpose

Close the Wave 3 findings that belong to the PWA, the Node services, DEV application infrastructure and their documents. No schema migration. No PROD change. Shared migrations are untouched.

## Changes

- ALL-ARCH-01 and APP-ARCH-01: DEV reader and command services run `services/production/business-server.mjs` with `APP_ENV=dev`, a DEV capability policy (owner only, all four capabilities) and DEV origins. `loadBusinessConfig` selects the DEV or PROD profile; `loadProductionBusinessConfig` stays as an alias. Files: `services/production/business-{config,policy,runtime,server}.mjs`, `services/payment-command/{handler,store}.mjs`, `infrastructure/dev/{command-service,read-service,command-identity,capability-policy}.tf`, `infrastructure/dev/tests/business-runtime.tftest.hcl`. `dev-server.mjs`, `dev-read-server.mjs`, `dev-config.mjs`, `dev-target.mjs` and `dev-api.mjs` are deleted. DEV schedulers stay paused.
- ALL-ARCH-02: Solution_Design.md records reviewer DML as the approved second write path. The DEV target (configurable database, role `mw_reviewer_dml_dev`) is in the agent branch and is unusable until a W4 migration relaxes the V33 `session_user` checks. Files: `project/Documents/Solution_Design.md`.
- ALL-ARCH-05: removed the foundation DEV API (`services/api/server.mjs`, `guards.mjs`, `tests/unit/guards.test.mjs`), `.github/workflows/deploy-dev.yml`, `scripts/verify-dev.mjs`, the `start` and `start:read-dev` scripts, the Dockerfile `CMD` and the unused `@google-cloud/secret-manager` dependency. Terraform: Cloud Run service `api`, service account `mw-credit-app-dev`, its IAM and `google_sql_user.runtime` leave `infrastructure/dev/main.tf`. Files: `package.json`, `Dockerfile`, `cloudbuild-command.yaml`, `infrastructure/dev/main.tf`.
- ALL-ARCH-06 and APP-SEC-04: `react`, `react-dom` and `firebase` moved to devDependencies. `web-push` stays. Files: `package.json`, `package-lock.json`.
- ALL-ARCH-07: `infrastructure/modules/dev-workers` renamed to `infrastructure/modules/workers`; both `source` lines updated, including `infrastructure/production/workers.tf` (one line).
- ALL-STD-01, ALL-STD-02, ALL-STD-04 (Node side): one business-date module, one identity module for project, region, instance and owner constants (APP-SEC-03), one structured log helper. Files: `services/lib/{business-date,identity,log}.mjs` and their importers.
- ALL-INFRA-06 (DEV part): Artifact Registry cleanup policy in `infrastructure/dev/main.tf`. Keep the 20 most recent versions and any tag with prefix `keep`. Delete other versions older than 30 days. First apply is a dry run (`artifact_cleanup_dry_run`).
- APP-ARCH-02: `services/api/dev-read-handler.mjs` renamed to `read-handler.mjs`; `loadDevReadConfig` removed.
- APP-ARCH-03 and APP-ARCH-04: shared `services/lib/{pool,connection-guard,ids}.mjs`; `business-target.mjs` became the connection guard.
- APP-ARCH-05: `check` also builds `live-dev`. File: `package.json`.
- APP-ARCH-06: `apps/pwa/src/live-main.tsx` split into `apps/pwa/src/live/{LiveHeader,StartupStatus,WorkspaceViews}.tsx`. No state change.
- APP-AUTH-02: one strict claims check, `services/lib/firebase-claims.mjs`. The DEV verifiers are deleted.
- APP-AUTH-03: one HTTP boundary helper, `services/lib/http-boundary.mjs`. Notification preflight now needs a valid Origin, method and headers; a verifier throw returns 401 `session_invalid`.
- APP-AUTH-04: documentation only. The text goes to Environment_Inventory.md through the orchestrator.
- APP-AUTH-05: `POST /health` on the command service returns 405. File: `services/payment-command/handler.mjs`.
- APP-AUTH-06: workers pin the caller `sub` (`WORKER_CALLER_SUBJECTS_JSON`, fail closed); 403 on a wrong `sub`. Files: `services/workers/{config,runtime,server}.mjs`, `infrastructure/modules/workers/main.tf`, `infrastructure/dev/workers.tf`.
- APP-DATE-02: `normalizeTimestamp` truncates fractions to three digits. File: `apps/pwa/src/display-date.ts`.
- APP-NOTIFY-01: dictionary records that subscription, revoke and preference are read-capability actions, accepted by the owner on 16 October 2026. File: `systems/pwa/notifications-jobs.yaml`.
- APP-OFFLINE-04: offline datasets, media, cache and snapshots are deleted after 7 days without a successful online check. Pending and draft rows are never deleted. The sweep covers every owner's offline database of the same environment on the device, once per page load, without delaying the current user. Files: `apps/pwa/src/owner-offline.ts`, `OfflinePayments.tsx`, `tests/e2e/offline-retention-independent.spec.ts`, Solution_Design.md.
- APP-OFFLINE-06: protocol 1 is retired. Both dataset routes require `protocol=2` or `3`. Files: `services/payment-command/{handler,store}.mjs`, `services/business/offline-dataset.mjs`, `services/notifications/{handler,store}.mjs`, `docs/Development_Read_Service.md`.
- APP-PAY-03: request budget under the 15 s Cloud Run timeout (connect 3 s, statement 8 s, request timeout 14 s, wake 1.5 s). The timeout is not raised. Files: `services/lib/{budget,pool}.mjs`, `services/payment-command/store.mjs`, `services/production/business-server.mjs`, `services/agent-conversations/{read,command}-provider.mjs` (8 s statement timeout from the budget, was 10 s). Follow-up after merge: main's phase8 run timed out one agent read at 8 s on a cold Linux runner. The cause was PostgreSQL JIT compilation (about 50 ms query, 0.7 ms without JIT; the slowest catalogue read spent 4.7 s of 5 s compiling), not the query. The read provider now sets `SET LOCAL jit=off`; the catalogue test fell from 8.7 s to 4.1 s locally, and the 8 s budget is unchanged.
- APP-PAY-05: removed `validIdentity`, `outcome` and `classifyReplay`. File: `services/contracts/payment-command.mjs`.
- APP-PAY-06: the answer is `command_outcome_unknown` only when COMMIT started or ROLLBACK failed after the write was attempted. A successful ROLLBACK is a known non-outcome and returns `command_unavailable`. This is narrower than the design, to avoid new false "unknown" answers. File: `services/payment-command/store.mjs`.
- APP-PAY-07: dictionary records the disbursing-partner rule (`ch:lisa` accounts for loans, `ch:tommy` expenses for management; a change needs a code release). Files: `systems/postgresql/relations/cash-holders.yaml`, `systems/pwa/application.yaml`.
- APP-PERF-01: logos resized, duplicate logo deleted, Management screens lazy-loaded through one shared import, preloaded when the Management group opens or when the browser is idle (UX finding W3-UX-PERF-01), `/assets/**` immutable cache rule. Main bundle 822 kB → 735 kB. Files: `apps/pwa/src/assets/*`, `scripts/hosting-headers.mjs`, `firebase.json`.
- APP-QUALITY-01: `tsconfig.services.json` and `tsconfig.e2e.json`; `typecheck` script. Files: `package.json`, both tsconfig files.
- APP-SEC-01: Content-Security-Policy with `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Files: `scripts/hosting-headers.mjs`, `scripts/deploy-hosting.mjs`, `scripts/promotion/deploy-business-hosting.mjs`, `firebase.json`.
- APP-SEC-03: project, region, instance and owner literals moved to `services/lib/identity.mjs`.
- APP-TEST-01: canonical fixture uses `--proxy-server=direct://` and fails loudly when it served nothing. Files: `tests/e2e/fixtures/canonical-server.ts` and six specs. `collection-read.spec.ts:24` waited on a brief empty moment during a 503 refresh and failed under load on the old code too (2/20); it now waits for the saved charges and asserts the "Showing saved data" state (20/20).
- APP-TEST-02: implemented on the ops branch (`ci.yml`, `database.yml`).
- APP-TEST-03: new tests `tests/unit/{display-money,cash-view}.test.mjs` and `tests/integration/business-money-reads-independent.test.mjs`.
- APP-TEST-04 and ALL-CI-08: not reproduced. Done in W1 (root `outputs/` removed, `test-results/` ignored, CI retry present).
- web-push removal: not reproduced. `services/notifications/web-push.mjs` imports it at runtime in the notify worker. It stays.
- Dictionary path fixes: `modules/workers/main.tf` in `notifications-jobs.yaml`; `read-handler.mjs` and the protocol-1 text in `human-api.yaml`. Dictionary validate: 414 documents, 0 errors.

## Checks

| Check | Result |
| --- | --- |
| `npm run check` (final tree) | pass: three type checks, synthetic and live-dev builds, 489 unit tests |
| Integration, Phase5 default / journal / anchor / settings (disposable PostgreSQL 18) | 9 / 78 / 4 / 4 pass |
| Integration, management and money reads | 30 pass |
| Integration, Phase8 R053 / legacy / agent | 20 / 2 / 1 pass |
| Integration, Phase4 receiving | 15 pass |
| Integration, unified receiving | 20 pass |
| Integration, payment-command API | 18 pass, 4 fail, identical to baseline |
| Playwright, independent Testing agent (15 affected specs, both projects) | 313 pass, 0 fail, 7 skipped by design |
| Playwright after the final fixes (coder) | collection-read 20/20 (both projects ×10), offline-retention 12, canonical specs 1/1/1/4/2/66, back-consumers 104, cash-two-workspaces 10, offline-delta 12 |
| Independent review (Testing agent) | APP-PAY-06, APP-PAY-03, APP-AUTH-02/03/06, ALL-ARCH-01, APP-SEC-01, APP-OFFLINE-04 checked; one gap found and fixed (agent-conversations 10 s statement timeout); new tests fail on the old code |
| UX review (Agent E, desktop 1280×800 and iPhone Pro Max) | no regression in header, drawer, language switch, startup status, logo; W3-UX-PERF-01 fixed; CSP on the live DEV sign-in incl. Google popup and iframe: 0 violations |
| Dictionary `validate` | 414 documents, 0 errors |
| Relative links in edited documents | checked, none broken |

## Not run

| Check | Reason |
| --- | --- |
| `agent-native-operation-independent` | Needs `powershell.exe`, not available in this environment |
| Anything against PROD | Not authorized in this wave |

## Live changes applied

| What | Command | Readback |
| --- | --- | --- |
| DEV Artifact Registry keep tag `keep-dev-20261016-abe73330` | Tag on the deployed digest before the cleanup policy | Recorded by the orchestrator |
| DEV Artifact Registry keep tag `keep-dev-20261016-ccb475d6` | Tag on the rollback digest | Recorded by the orchestrator |
| DEV keep tags on the new images | `gcloud artifacts docker tags add` | `keep-dev-20261016-91ce1c28` (first deploy), `keep-dev-20261016-d35ff75e` (final) |
| DEV capability policy secret `mw-credit-app-dev-capability-policy` v1 (owner only; payload never printed, private file deleted) | `gcloud secrets versions add` | payload sha256 `d7ae7224…`; evidenceSha256 `175831e3eef5b2608d4dec34a1c58178ba342c473a34b63bee0d0f864030abcc` set as `capability_policy_sha256` |
| DEV Terraform (`infrastructure/dev`), first deploy | state-only deletion-protection change on the foundation API (0/1/0); targeted apply of the policy secret and two accessors (3 added); main plan 0 add / 5 change / 11 destroy, SQL user released not deleted; AR cleanup dry-run then enforce (1 change) | re-plan: no changes. Foundation API `mw-credit-app-api-dev` and SA `mw-credit-app-dev@` gone |
| DEV Terraform, final redeploy from the final tree (08:24Z) | image-only plan 0 add / 4 change / 0 destroy | re-plan: no changes; revisions command-00030, read-00023, jobs-00003, notify-00003 on `api@sha256:d35ff75e92fa7382df5520e63a51ba5e52f485a8c1c40303aa0f8ed6340084b6`, 100% traffic |
| DEV Hosting | `node scripts/deploy-hosting.mjs` (live-dev build, `--check` first) | version `955fa49b579be5f9` (release `1792139161502000`); CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `/assets/**` immutable |
| DEV smoke (bounded) | curl from the session | reader and command `/health` 200; unauthenticated `/api/session` and `/api/dashboard` 401 `sign_in_required`; OPTIONS from `https://dev-lm.mw-credit.com` 204, foreign origin 403 `origin_denied`; no ERROR logs since 08:24Z; the three DEV schedulers PAUSED |
| DEV grant for the reader's membership check (applied by the ops worker) | `GRANT SELECT ("Partner Role") ON public."Partners" TO "mw-credit-app-read-dev@…iam"` in `loan_manager_dev` | readback mirrors PROD; recorded in the ops note |

## Prepared for a later go

PROD Hosting header block, from `hostingHeaders('live-prod')` in `scripts/hosting-headers.mjs` (applied by `deploy-business-hosting.mjs` at the next promotion). The `**` rule carries these headers besides the existing `nosniff`, `Referrer-Policy` and `Cache-Control: no-store`:

```
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app; frame-src https://clever-oasis-508610-n7.firebaseapp.com https://accounts.google.com; worker-src 'self'; manifest-src 'self'
```

A separate rule `/assets/**` adds `Cache-Control: public,max-age=31536000,immutable`.

PROD workers environment `WORKER_CALLER_SUBJECTS_JSON` is a prerequisite of the next PROD promotion. The workers fail closed without it. PROD plan for `infrastructure/production`: 0 to add, 2 to change, 0 to destroy (the env addition on the two worker services). Apply it with the promotion.

## Recovery

- Git: revert the commit.
- DEV Hosting: roll back to version `ae32fb05bfc17a38` (first W3 deploy) or `edf06b9da5841b1d` (before W3).
- DEV services: re-pin the previous digests (`keep-dev-20261016-abe73330` reader/command, `keep-dev-20261016-ccb475d6` workers) and apply `infrastructure/dev` from the previous commit; the foundation API returns only with a Git revert of ALL-ARCH-05 and a fresh apply (its SQL user was dropped by ops and would be re-created by Terraform).
- DEV policy secret is `prevent_destroy`; leaving it in place is harmless.

## Open questions

- DB-ACCESS-05: only `mw-credit-app-dev@...iam` (the foundation API user) is dropped. `mw-credit-app-read-dev@...iam` is kept because the DEV reader still uses it under ALL-ARCH-01. The owner's condition "after the DEV read service is removed" is not met. Please confirm.
- `web-push` stays. Removing it needs a rewrite of the VAPID path and is not recommended.
- DEV capability policy lists the owner only. A read-only second member needs a second Google identity with a DEV `Partners` row.

## Remaining work

- W4 migration to relax the V33 `session_user` checks, then create `mw_reviewer_dml_dev` and use the DEV reviewer target.
- Owner sign-in once on `dev-lm` to prove the signed-in paths (capability policy, Partners grant) and the CSP popup with a real account.
- W5: retention note styling (W3-UX-OFFLINE-01) and the saved-change card width on phones (W3-UX-OFFLINE-02, pre-existing).
- PROD promotion: done with R063 on 16 October 2026 (Hosting headers, `WORKER_CALLER_SUBJECTS_JSON`, module rename a no-op; plan 0 add / 4 change / 0 destroy because the four images changed too). See the [R063 promotion record](../project/Documents/Development_Changes.md#r063-production-promotion).
- Ops-owned documents (Environment_Inventory.md DEV composition and APP-AUTH-04, docs/Development.md, Development_Changes.md) are updated on the ops branch.
- Merge notes: `package-lock.json` must be regenerated with `npm install --package-lock-only` when the ops branch (Biome) and this branch are both merged; `tests/integration/Run-Phase5.ps1` carries the same one-line addition on both branches (merges cleanly). No other file is changed by two branches.
