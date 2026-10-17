# W4 PWA and API: busy commands, shared lock keys, dataset polling (16 October 2026)

## Purpose

Wave 4 app work for the independent review, on branch `claude/review-w4-app` from `main` 2b02f94 (head 80c57f4). It covers the Node and PWA side of DB-LOCK-01, DB-LOCK-03 and APP-OFFLINE-03. No schema change in this branch; the shared migration V93 is in the [database note](CHANGE_NOTES_W4_DATABASE_2026-10-16.md). No deployment and no PROD change. The other 21 W4 finding codes are recorded there.

**Deployment dependency.** `services/business/borrowers.mjs` now calls `public.pwa_lock_key_v1`, which V93 creates. Do not deploy this API to an environment before V93 is applied there. V93 is applied in DEV (16 October 2026) and this branch is deployed there (see "DEV migration record"). The branch is stacked on the database branch (`claude/review-w4-db`; merges 4153098 and 984d978), so it carries V93 and the tooling; merge the database branch first. In PROD, V93 was applied before the API and Hosting promotion (see "PROD execution record").

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
| Authenticated PROD write | No PROD test identity; the owner's next normal sign-in |

## DEV migration record

The V93 migration is recorded in the database note (done 16 October 2026). DEV app deploy (16 October 2026, from `claude/review-w4-app` `ba0a9d7`; the head differs only by the change note, which gcloud ignores):

- Build: Cloud Build `451f8ea6-46d5-4cb5-bc0f-9e8c32ab2b99` (`cloudbuild-command.yaml`) SUCCESS. Image `api@sha256:ec4ffe05b35808698def22bbddcafe3b4149667188e85ad3ea0c1fb82bd4a014`, keep tag `keep-dev-20261016-ec4ffe05`.
- Terraform (`infrastructure/dev` through `scripts/Invoke-Terraform.ps1`): plan 0 add, 4 change, 0 destroy (only `containers[0].image`), applied 14:18:37 to 14:19:13Z; activation file republished; re-plan no changes. Revisions command-00032-dsw, read-00025-mmc, jobs-00005-jbk, notify-00005-cbx, 100% traffic.
- Hosting (`live-dev`): version `e0ac761a1022e40e`, release `1792160410172000` (14:20:10Z), marker `a1b31ef75151e9ffe0995d12`, entry `/assets/index-BxJIaVkl.js`; `--check` first.
- Smoke, 14:20:27 to 14:20:54Z (21:20 Bangkok): reader and command `/health` 200; unauthenticated `/api/session` 401 `sign_in_required`; OPTIONS from the DEV origin 204 and from a foreign origin 403 `origin_denied`; the DEV domain and the web.app host serve the new marker and entry, the entry is byte-identical, `sw.js` carries the marker, `X-Frame-Options: DENY`; Cloud Run logs since 14:18:37Z show 0 errors and no `pwa_lock_key_v1` errors (4 warnings are the smoke 401 and 403 requests).
- Rollback: previous image `api@sha256:a86ce85d...` (`keep-dev-20261016-a86ce85d`; revisions read-00024-wqc, command-00031-fcg, notify-00004-8w7, jobs-00004-qkd) through the private pre-W4 activation file, then plan, apply and publish; Hosting `955fa49b579be5f9` (release `1792139161502000`).
- No authenticated business write was made.

## PROD execution record (16 October 2026)

Owner instruction, 16 October 2026 (Bangkok): "Go ahead to execute all the steps until wave 4 is fully done." V93 was applied in PROD first (22:16 Bangkok; database note). The promotion then followed from `claude/r064-promotion` `355f3a3` (parent runtime source `7c11863`), pinned and reused from existing CI:

- Checks reused: App CI 38926352236 on `355f3a3` (check, three e2e shards, terraform; non-blocking lint failed as for R063); database CI 38915135945 at `984d978`; `npm run check` 520 of 520; Hosting runner tests 23 of 23.
- Runtime: Cloud Build `cccc03e6-99fb-49fb-86e0-e5b061ca1938` (`cloudbuild-business.yaml`), digest `api@sha256:8611c23de05e2d488a1ba8eeb5479527c438f57fd5257259e6d82f16715044c8`, tag `keep-r064-runtime`. `infrastructure/production` plan 0 add, 4 change (image only), 0 destroy, applied 15:23:45 to 15:24:23Z, re-plan no changes. Revisions read-00007-tgd, command-00011-j4n, notify-00005-p8k, jobs-00005-fnc, Ready 100%.
- Hosting: version `2b6c25c065f1a45a`, release `1792166200421000` (15:56:13 to 15:56:47Z), marker `1a84bcdb5c851abf9dec4139`, entry `/assets/index-ClaA5ewz.js`, 15 files; package and receipt in `~/.mw-private/MW-Credit-App/promotion/r064/` and the private bucket.
- Smoke: API and Hosting checks passed (details in Development Changes, R064 production promotion); no `pwa_lock_key_v1` errors. The notify worker's connection drops at 15:46Z and 15:55Z coincide with the two instance restarts and recovered. Pre-existing 503s on the agent's `/internal/agent/query` and `/internal/agent/catalogue` calls also occurred on R063.
- Rollback baseline: all four services on `86d172de…` (`keep-r063-runtime`), Hosting `8154effa824f58e9` / release `1792149184194000`.
- Not done: authenticated PROD path (the owner's next normal sign-in is the proof); physical device. R064 was Released after the sync correction (verified 16 October 2026 23:57 Bangkok; tag `R064` on `9420c85`).

## Recovery

- `git revert` the branch commits and redeploy the previous image and Hosting build. The previous Node code (inline key) works with or without V93, so rolling the app back never needs a database change.
- A client that already received `409 command_busy` keeps the saved request and retries it; a rolled-back server answers the retry with the older 503 mapping, which the PWA also keeps queued.

## Open questions

1. Resolved by the owner on 17 October 2026: refresh every 30 seconds in the foreground and on every focus (implementation in progress for R067).
2. None open for this branch. The earlier phase5 fixture and stale-503 expectation failures are fixed in `ba0a9d7`.

## Remaining work

- One authenticated check by the owner on the next normal sign-in is the only proof of the busy-retry path in PROD; no PROD test identity.
- SQL bodies still use the inline lock expression; adopting `pwa_lock_key_v1` there is a later migration.
- SQL `lower()` and JavaScript `toLowerCase()` can differ for non-ASCII case mappings in the borrower-name key (pre-existing, unchanged).

## Optional follow-ups (R069)

Commits `2cf8dfd` and `c9cb4b0` on `claude/w4-optional`; code only, not deployed (R069 is Open).

- Lists hold swaps during touch/scroll and about 1 s after (10 s cap); the Cash workspace guard has a 10 s cap and clears on change, record open and unmount.
- A failed dataset domain backs off 30 s, 60 s, 2 min, 5 min, and resets on success, online or focus. The banner and "Updated" time use data domains only; receipts retry quietly. Read-cache held paths are bounded.
- UX-REFRESH-09 closed by the owner (17 October): the 30-second poll stays always, with no mobile-data back-off (iOS cannot detect cellular).
- UX-HOLD-01 to 08 reviewed: 04, 05, 06, 01 and 07 fixed in `c9cb4b0`; 03 and 08 done for R071 (`e63c90c`, [record](../project/Documents/Development_Changes.md#r071-refresh-hold-on-a-computer-and-named-paused-sections)); 02 deferred.
- Checks: tester on `2cf8dfd` `npm test` 559 of 559, refresh-hold and startup-generations x5 40 of 40, 173 other e2e passed; after `c9cb4b0` `npm test` 563 of 563, e2e 220 runs passed.
- Referrer list (`ba52508`): `/api/borrower-options` no longer caps at 25 (every match, 1000-row safety cap with `truncated:true` and a "Type to narrow the list" hint); the chosen referrer stays visible after a narrower search. Deployed to DEV only (image `1fb9d763…`, Hosting `1f5b3da6a513f360`), smoke passed. `b2b9eca`: the search box lists matches anywhere in the name or description below it to tap (the select no longer narrows); DEV Hosting `a9fae1d24659dfe0`; see [Development changes](../project/Documents/Development_Changes.md#r069-w4-optional-follow-ups).
