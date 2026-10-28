# Change notes — R103 dictionary capture on Linux, Metabase baselines and chat lookup status, 28 October 2026

## Purpose
R103 closes three R102 follow-ups under the owner's "do 2, 3 and 4 in R103": a PROD Data Dictionary capture that runs from a Linux cloud session, Metabase `Verify-*` baselines that no longer depend on VM-01, and a clearer waiting row in Chat.

## Changes
- Data Dictionary capture: `scripts/dictionary/capture_postgresql.py` now connects through a local Cloud SQL Auth Proxy endpoint (Linux opens the IAP tunnel of `scripts/database/Invoke-CloudFlyway.py`; Windows passes `--local-port`) as `codex-cloud-read`. The retired direct public-IP connection is removed; `Export-DataDictionary.ps1` and the `project/scripts/dictionary/capture_postgresql.py` shim stay. `reconcile_captures.py plan` gains `--postgres-only` and `--only kind:name`. New test `project/scripts/dictionary/test_capture_postgresql.py`; `requirements.txt` pins `psycopg[binary]==3.2.10`.
- Regenerated from the PROD capture (read-only, 115 Flyway rows, `metadata_sha256` `2aa78e2e…b3afb5`): `public.olap_borrowers_analytics`, `public.olap_portfolio_summary`, `public.pwa_chat_threads`, and the routines `pwa_chat_thread_create_v1` and `pwa_chat_thread_update_v1`, plus `index.json`. Validate: 0 errors. Evidence: `project/outputs/dictionary-r103-20261028/`.
- Metabase baselines: new `project/scripts/metabase/Baselines.mjs` (`baselineDir`, `MW_METABASE_PRIVATE_DIR` override, redaction of keys to `<private>`, `--refresh`). The baselines are rebuilt from live Metabase into `gs://mw-credit-operator-private-737787224638/metabase-baselines/`, latest only (noncurrent generations deleted after each refresh). The 237 older unredacted copies were deleted under the owner's decision; bucket soft delete keeps 7 days of recovery. The `Verify-*` readers, `ReportingApi`-based scripts and `CollectionMonitor.mjs` use `baselineDir`. `Verify-CollectionMonitor.mjs` was updated for `PromoteCollectionTab` and for the owner's 24 September removal of card 236. Test: `tests/unit/metabase-baselines.test.mjs`.
- Chat: the progress row reads "Looking up data…" / "กำลังค้นหาข้อมูล…" with the tool labels, plus elapsed seconds after 5 s (`aria-hidden`); "Round N" is dropped. `apps/pwa/src/chat/ChatWorkspace.tsx`, `chat-protocol.ts`, `chat-text.ts`, `chat.css`; PWA only.
- Prune: deleted the superseded evidence `project/outputs/dictionary-reconciliation-20260924/coverage.json` and `production-postgresql-observations.json`, which only the five regenerated entries cited; Git keeps them.
- Documents: `project/scripts/dictionary/README.md`, `project/scripts/metabase/README.md`, Development Changes, Release Tracker.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` (Byte) | Pass |
| Unit tests (Byte) | 28/28 |
| Dictionary tests (Byte) | Pass |
| Playwright `chat.spec.ts` (Byte) | 30/30 |
| PROD dictionary capture, `reconcile_captures.py plan`/`apply`, `dictionary.py validate` (Chase) | Read-only; 115 Flyway rows; `metadata_sha256` `2aa78e2e…b3afb5`; 5 entries regenerated; validate 0 errors |
| `Verify-CollectionMonitor.mjs` live (Chase) | 41 pass, 1 skip (data-dependent), 0 fail |
| DEV SSE trace (Chase) | Claude `tool` event at 6.4 s, first `delta` at 10.0 s; Gemini first `delta` at 18.4 s |
| Adversarial review (Chase) | 6 findings: 5 fixed, 1 accepted as inherent |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Pull request `Development checks` | pending (PR run) |

## Not run
- `Verify-RemainingPages.mjs`: its install state cannot be derived from live Metabase, so it is not runnable.
- The device pass for the new waiting row.
- A DEV capture of the dictionary (the dictionary records PROD only).

## Recovery
- Git baseline `f9424c7`; the dictionary entries and scripts revert with the pull request.
- Baselines: bucket soft delete keeps deleted objects for 7 days; after that, `node scripts/metabase/Baselines.mjs --refresh` rebuilds them from live Metabase. Nothing in PROD was changed by this batch.
- Chat: PWA-only; revert the Hosting build.

## Open questions
None.

## Remaining work
- Deploy the PWA change to DEV and PROD Hosting on the owner's instruction.
- `Verify-RemainingPages.mjs` needs a way to derive its install state before it can run.
- Closes R102 follow-ups 2 (Metabase `Verify-*` baselines), 4 (chat wait wording) and the Data Dictionary item. The deploy-script 0600 restore fix and the Meta 30-second gap stay open.
