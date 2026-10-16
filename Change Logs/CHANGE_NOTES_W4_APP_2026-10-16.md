# W4 PWA and API: busy commands, shared lock keys, dataset polling (16 October 2026)

## Purpose

Wave 4 app work for the independent review, on branch `claude/review-w4-app` from `main` 2b02f94 (head 80c57f4). It covers the Node and PWA side of DB-LOCK-01, DB-LOCK-03 and APP-OFFLINE-03. No schema change in this branch; the shared migration V93 is in the [database note](CHANGE_NOTES_W4_DATABASE_2026-10-16.md). No deployment and no PROD change. The other 21 W4 finding codes are recorded there.

**Deployment dependency.** `services/business/borrowers.mjs` now calls `public.pwa_lock_key_v1`, which V93 creates. Do not deploy this API to an environment before V93 is applied there. V93 is applied in DEV (16 October 2026) and this branch is deployed there (see "DEV migration record"). The branch is stacked on the database branch (`claude/review-w4-db`; merges 4153098 and 984d978), so it carries V93 and the tooling; merge the database branch first. PROD: V93 must be applied before the PROD API and Hosting promotion.

## Changes

- **DB-LOCK-01.** A command that fails before `COMMIT` with a lock wait (`55P03`), deadlock victim (`40P01`), statement timeout (`57014`) or an SQL try-lock refusal (`P0001`, "... is busy; retry" and "... are busy; sync and retry/request ...") after a confirmed `ROLLBACK` applied nothing. The API now returns `409 command_busy` instead of `503`. A started commit or a failed rollback still gives `command_outcome_unknown`; other clean rollbacks still give `command_unavailable`. Read-only requests keep their current mapping. Files: `services/payment-command/store.mjs` (`commandBusy`), `services/payment-command/handler.mjs` (code registered). The PWA keeps the row queued under the same request id and resends it with the existing backoff after a fresh status read, never as "outcome unknown": `apps/pwa/src/offline-sync.ts` (`classify`, `isBusyOutcome`, `busyMessage`, a 503 `command_unavailable` also stays queued), `SelectedCharges.tsx` (new `busy` state: "Busy - not saved yet", "Nothing was applied. Retrying automatically.", Thai equivalents, no warning heading), `LoanRecord.tsx` (delete: "Busy - delete not applied. Try again."), `LoanForm.tsx`, `BorrowerRecord.tsx`.
- **DB-LOCK-03.** Node lock keys come from SQL: `services/business/borrowers.mjs` uses `SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,$2))` with `('borrower', id)` and `('borrower-name', name.trim().toLowerCase())`. The key is byte-identical to the previous inline expression, so a mixed R063/V93 period is safe; the function must exist first. The SQL bodies keep the inline form (database note).
- **APP-OFFLINE-03.** `apps/pwa/src/offline-dataset.ts`: the background dataset poll is `DATASET_POLL_MS = 5 * 60 * 1000` instead of 60 seconds. Focus, visibility, online and own-write invalidation still refresh immediately; nothing changes on the server. The 60-second service-worker update check is separate and unchanged. A second user's change can take up to 5 minutes to appear in a foreground tab.
- **Tests.** `tests/unit/command-outcome-known.test.mjs` (55P03, 40P01, 57014 and both P0001 forms map to 409 `command_busy`; "Source changed" stays 503; failed rollback stays unknown; read-only 55P03 stays 503), `tests/unit/offline-sync-outcomes.test.mjs`, new `tests/unit/borrower-lock-key.test.mjs`, `tests/e2e/payment-command.spec.ts` (routed 409 shows the busy text and retries with the same request id), `tests/e2e/offline-delta-independent.spec.ts` (clock advance 5 minutes).
- **Documents.** None beyond this note and the shared records written in the database branch (Development_Changes R064 Wave 4 section).

## Checks

Results from the working sessions; the orchestrator re-confirms on the final commit.

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, synthetic and live-dev builds, unit tests) | Pass: 514 of 514 tests (Agent C later run: 517 of 517) |
| Playwright `payment-command.spec.ts`, desktop | First run 19 of 20 (the new busy test failed); after the fix the busy test passed 2 of 2 (desktop and mobile) |
| Playwright `payment-command.spec.ts`, mobile | 20 of 20 |
| Wider Playwright run | 89 passed (Agent C later run: 129 passed, 1 skipped) |
| Agent C real-SQL DB-LOCK-01 race, DB-LOCK-03 | Pass |
| Agent C phase5 | Fixture and stale-503 failures; fixed in ba0a9d7 (below) |
| Suite fixes `ba0a9d7`: phase5 | 9 of 9; management 78 of 78; 4 of 4; 1 and 30; 4 of 4 (fixture ordering and the stale-503 expectations updated for `command_busy`; no product code change) |
| Suite fixes `ba0a9d7`: receiving, `npm run check` | Receiving pass; `npm run check` 517 of 517 |

## Not run

| Item | Reason |
| --- | --- |
| Authenticated business write in the DEV smoke | Not done; smoke is unauthenticated plus log review |
| iPhone Pro Max Home Screen check of the busy text in Thai (heading wrap, stable Retry button) | Device check; the layout reuses existing paragraph patterns |
| Any PROD step | Not authorized |

## DEV migration record

The V93 migration is recorded in the database note (done 16 October 2026). DEV app deploy (16 October 2026, from `claude/review-w4-app` `ba0a9d7`; the head differs only by the change note, which gcloud ignores):

- Build: Cloud Build `451f8ea6-46d5-4cb5-bc0f-9e8c32ab2b99` (`cloudbuild-command.yaml`) SUCCESS. Image `api@sha256:ec4ffe05b35808698def22bbddcafe3b4149667188e85ad3ea0c1fb82bd4a014`, keep tag `keep-dev-20261016-ec4ffe05`.
- Terraform (`infrastructure/dev` through `scripts/Invoke-Terraform.ps1`): plan 0 add, 4 change, 0 destroy (only `containers[0].image`), applied 14:18:37 to 14:19:13Z; activation file republished; re-plan no changes. Revisions command-00032-dsw, read-00025-mmc, jobs-00005-jbk, notify-00005-cbx, 100% traffic.
- Hosting (`live-dev`): version `e0ac761a1022e40e`, release `1792160410172000` (14:20:10Z), marker `a1b31ef75151e9ffe0995d12`, entry `/assets/index-BxJIaVkl.js`; `--check` first.
- Smoke, 14:20:27 to 14:20:54Z (21:20 Bangkok): reader and command `/health` 200; unauthenticated `/api/session` 401 `sign_in_required`; OPTIONS from the DEV origin 204 and from a foreign origin 403 `origin_denied`; the DEV domain and the web.app host serve the new marker and entry, the entry is byte-identical, `sw.js` carries the marker, `X-Frame-Options: DENY`; Cloud Run logs since 14:18:37Z show 0 errors and no `pwa_lock_key_v1` errors (4 warnings are the smoke 401 and 403 requests).
- Rollback: previous image `api@sha256:a86ce85d...` (`keep-dev-20261016-a86ce85d`; revisions read-00024-wqc, command-00031-fcg, notify-00004-8w7, jobs-00004-qkd) through the private pre-W4 activation file, then plan, apply and publish; Hosting `955fa49b579be5f9` (release `1792139161502000`).
- No authenticated business write was made.

## Prepared for a later go

Deploy order: V93 in the target database, then the API images, then Hosting. PROD: apply V93 first (request (a) in the database note: drift check, backup, authority window, migrate, validate, restore), then promote the same tested API image and Hosting build with the usual freeze, pinned package and one bounded smoke. The PROD API calls `pwa_lock_key_v1`, so promoting it before V93 would break borrower create and rename. No other prepared step.

## Recovery

- `git revert` the branch commits and redeploy the previous image and Hosting build. The previous Node code (inline key) works with or without V93, so rolling the app back never needs a database change.
- A client that already received `409 command_busy` keeps the saved request and retries it; a rolled-back server answers the retry with the older 503 mapping, which the PWA also keeps queued.

## Open questions

1. Is a 5-minute foreground delay for other users' changes acceptable, or should focus-return trigger an immediate refresh after a long idle? (Focus and online already refresh immediately.)
2. None open for this branch. The earlier phase5 fixture and stale-503 expectation failures are fixed in `ba0a9d7`.

## Remaining work

- PROD promotion after V93 in PROD. One authenticated check by the owner on the next normal sign-in is the only proof of the busy-retry path in PROD; no PROD test identity.
- SQL bodies still use the inline lock expression; adopting `pwa_lock_key_v1` there is a later migration.
- SQL `lower()` and JavaScript `toLowerCase()` can differ for non-ASCII case mappings in the borrower-name key (pre-existing, unchanged).
