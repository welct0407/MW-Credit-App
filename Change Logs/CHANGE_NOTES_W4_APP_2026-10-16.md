# W4 PWA and API: busy commands, shared lock keys, dataset polling (16 October 2026)

## Purpose

Wave 4 app work for the independent review, on branch `claude/review-w4-app` from `main` 2b02f94 (head 80c57f4). It covers the Node and PWA side of DB-LOCK-01, DB-LOCK-03 and APP-OFFLINE-03. No schema change in this branch; the shared migration V93 is in the [database note](CHANGE_NOTES_W4_DATABASE_2026-10-16.md). No deployment and no PROD change. The other 21 W4 finding codes are recorded there.

**Deployment dependency.** `services/business/borrowers.mjs` now calls `public.pwa_lock_key_v1`, which V93 creates. Do not deploy this API to an environment before V93 is applied there. V93 is applied in DEV (16 October 2026), so this branch can now be deployed to DEV; it is not deployed yet.

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
| Agent C phase5 | Fixture and stale-503 failures, being fixed on this branch |

## Not run

| Item | Reason |
| --- | --- |
| Deploy to DEV | Not yet done; V93 is in DEV, so it is unblocked. phase5 fixture and stale-503 failures from Agent C are being fixed on this branch first |
| iPhone Pro Max Home Screen check of the busy text in Thai (heading wrap, stable Retry button) | Device check; the layout reuses existing paragraph patterns |
| Any PROD step | Not authorized |

## DEV migration record

Not applicable to this branch. The DEV V93 migration is recorded in the database note (done 16 October 2026). Next, deploy the API and Hosting build and run one bounded smoke (borrower create and rename use the new function).

## Prepared for a later go

Deploy order: V93 in the target database, then the API images, then Hosting. For PROD this follows the V93 promotion in the database note. No other prepared step.

## Recovery

- `git revert` the branch commits and redeploy the previous image and Hosting build. The previous Node code (inline key) works with or without V93, so rolling the app back never needs a database change.
- A client that already received `409 command_busy` keeps the saved request and retries it; a rolled-back server answers the retry with the older 503 mapping, which the PWA also keeps queued.

## Open questions

1. Is a 5-minute foreground delay for other users' changes acceptable, or should focus-return trigger an immediate refresh after a long idle? (Focus and online already refresh immediately.)
2. Agent C reports phase5 fixture and stale-503 expectation failures; they are fixed on this branch before any deploy.

## Remaining work

- Deploy and smoke in DEV, then with the PROD promotion.
- SQL bodies still use the inline lock expression; adopting `pwa_lock_key_v1` there is a later migration.
- SQL `lower()` and JavaScript `toLowerCase()` can differ for non-ASCII case mappings in the borrower-name key (pre-existing, unchanged).
