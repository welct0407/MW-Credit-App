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

## DEV deployment (Forge, 28 October 2026, UTC): Hosting only, `d544950`
- **Source:** PR #180 head `d544950567de8d976e4ba71ed9e3b52658534148`. Its CI is green: check, lint, e2e ×3, database ×4, guards and agent tests.
- **Scope:** the only runtime change is the PWA chat progress row. There is no service, SQL or Terraform change, so the DEV images and Cloud Run revisions stay as they are.
- **Authority:** the orchestrator's DEV deploy for the owner's review. DEV only; nothing in PROD.

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| DEV Hosting | Clean clone at `d544950`. Built with a temporary 0600 `.env.live-dev`: the Firebase values come from `mw-credit-app-dev-firebase-web`, with the DEV project, auth domain and app id asserted. The service origins, `VITE_COMMAND_MODE=dev-owner-testing`, `VITE_NOTIFICATIONS=enabled` and the chat origin are the live R102 bundle's settings. The file was deleted after the build. `MW_RELEASE_NUMBER=R103 npm run build:live-dev` exited 0. `deploy-hosting.mjs --live-dev --check` passed (15 files). Deploy 14:36:17Z to 14:36:24Z | Version `10189f82a6043d36`, release `1793198184174000`. The live `build-version.json` on `dev-lm.mw-credit.com` shows release R103, version `6d61ecad45b377c37f06b5da` and entry `/assets/index-Dy0UqhaZ.js`. The served entry bundle embeds `d544950` and `"R103"`. The chat chunk carries "Looking up data". `no-store` on `build-version.json` and `sw.js`. `/health` returns 200 on read, command and chat | Redeploy version `18ff0ae926b872e9` (R102 DEV, release `1793170488940000`) |

## Promotion record (Forge, 28 October 2026, UTC)
[Template](../project/scripts/releases/templates/promotion-checklist.md). Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value or borrower data appears here.

**Scope and authority**
- **Scope:** Hosting only. No SQL (Flyway stays at 115), no image, no Terraform and no VM change. The dictionary and Metabase items are tooling and records.
- **Authority:** the owner's "push directly to prod after dev" for R103, relayed by the orchestrator, after the DEV deploy above. It does not cover forced notifications, payments, jobs or chat turns.

**Freeze, at 2026-10-28T14:46:18Z**
- Package: `main` at `f5766653139155c2bf53372bd408e51e85732cfa`, the PR #180 merge. Its tree equals `f21080d`.
- The R103 runner kind (schemaVersion 34) is in the package, so no delivery-tool commit was needed.
- Next unused release number: R104.

**Baseline, used for recovery**
- PROD Hosting version `83c857918dfcbeb4`, release `1793175980087000` (R102).
- Services, all at 100%:
  - read `00029-tzt`, command `00034-8m8` and chat `00012-7lz` on `599e19b6…`;
  - notify `00022-4lt` and jobs `00022-42m` on `50953149…`.
- `Invoke-CloudFlyway.py verify --target prod` at 14:47:26Z: schemaVersion 115, validation successful, 0 pending.

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| 1. Build | `buildProductionBusinessCandidate` from a clean clone at `f576665`, release `R103`, with the R102 PROD public config input | Marker version `9750bbbf9fa6ff44ff7cfae5`, entry `/assets/index-DT0UrcKc.js`, 16 files. Public config sha256 `6eea01ac…`, equal to R102's. The entry embeds `f576665` and `"R103"`, and the chat chunk carries "Looking up data". Private package `promotion-packages/r103/promotion-package.json`, sha256 `4d157948…6c79` | n/a |
| 2. Runner | `deploy-business-hosting.mjs` (R103 kind) as `mw-credit-unattended-admin`: `--check`, then `--apply` 14:48:58Z to 14:49:32Z. CI cited per job, all as stage-hash evidence except guards: check from run 40708459428 (`f21080d`); e2e ×3 from run 40706078961 (`d544950`); terraform from run 40653479949 (`b216968`, the same terraform inputs); rebuild ×4 from run 40706034374 (`d544950`); guards from run 40709074631 (`f576665`, executed) | Version `a9fb9266ce9f5c70`, release `1793198965889000`, 16 files, `no-store`. The runner's live readback passed for the five R102 services and the R102 chat check. Receipt `promotion-receipts/R103-HOSTING-RECEIPT.json` (private) | Redeploy version `83c857918dfcbeb4`, release `1793175980087000` (R102) |
| 3. Smoke (read-only) | Unauthenticated probes and log reads | The live `build-version.json` on `lm.mw-credit.com` and on the `web.app` host shows release R103, version `9750bbbf…`. The served entry embeds `f576665` and `"R103"`. `no-store` on `build-version.json` and `sw.js`. `/health` returns 200 on read, command and chat. All five services are unchanged at their baseline revisions, 100%. No ERROR logs in the five PROD services since 14:40Z, and no PROD `chat_turn` since 14:40Z (checked 14:50:03Z) | — |

## Recovery
- Git baseline `f9424c7`; the dictionary entries and scripts revert with the pull request.
- Baselines: bucket soft delete keeps deleted objects for 7 days; after that, `node scripts/metabase/Baselines.mjs --refresh` rebuilds them from live Metabase. Nothing in PROD was changed by this batch.
- Chat: PWA-only; revert the Hosting build.

## Open questions
None.

## Remaining work
- Deployed to DEV and PROD Hosting (see the promotion record).
- `Verify-RemainingPages.mjs` needs a way to derive its install state before it can run.
- Closes R102 follow-ups 2 (Metabase `Verify-*` baselines), 4 (chat wait wording) and the Data Dictionary item. The deploy-script 0600 restore fix and the Meta 30-second gap stay open.

## Closure (28 October 2026)
Tag record: the annotated tag `R103` points at the package commit `f5766653139155c2bf53372bd408e51e85732cfa` (PR #180 on `main`), created by the Release tag workflow; the [GitHub Release](https://github.com/welct0407/MW-Credit-App/releases/tag/R103) was published at 14:51:16Z. Baseline R102 `b216968`.

Open follow-ups:
- `Verify-RemainingPages.mjs` cannot run because its install state cannot be derived.
- The device pass for the chat row "Looking up data…" has not been done.
- The Meta 30-second gap (R102) cannot be verified from logs.
- Owner acceptance: the owner's first PROD use of the new chat row.

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R100_TEST_ROBUSTNESS_2026-10-25.md`, which left the retention window (R104 Open; R103, R102, R101 Released); its links in the Release tracker and Development Changes now point to the commit permalink `f576665`. No other change note or evidence file is outside the window or uncited (`npm run check:docs`: 0 failures, 0 warnings).
