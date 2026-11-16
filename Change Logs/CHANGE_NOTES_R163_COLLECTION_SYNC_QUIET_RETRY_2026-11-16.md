# Change notes — Collection sync quiet retry and receipts business date (R163), 16 November 2026

## Purpose
Owner request of 16 November 2026: "yes start it, include the receipts date issue". The header showed "Collection not updated" after one-off failures that recovered on the next cycle, and the desktop app asked for Collection receipts with yesterday's business date after midnight. The owner approved one immediate quiet retry of a failed data-domain check, and a current business date for receipts.

## Changes
Problem 1, header "Collection not updated" from one-off failures (evidence):
- 15 November 2026, 23:19:22Z: the PROD command service answered 503 `command_unavailable`; the cause was SQL 57014 (statement timeout, 8 s command budget) while Cloud SQL `db-g1-small` CPU reached 92% during three devices' simultaneous full syncs. It recovered 40 seconds later.
- 16 November 2026, 06:05:03Z: the Windows desktop PWA (R162) rejected a 200 Collection answer client-side after a manifest and need round trip (`dataset-failed collection "200 client 8671ms"`, from the owner's encrypted troubleshooting file, decrypted with `scripts/troubleshooting/decrypt.mjs`; the decrypted copy was deleted after reading). The next cycle at 06:05:18Z succeeded.
- Collection checks are routinely 2 to 5 seconds, the slowest domain, so the window for a one-off failure is the widest there.
- Owner-approved fix: one immediate quiet retry of a failed data-domain check before the header shows a failure, and the `dataset-failed` troubleshooting event records which client check failed.

Problem 2, receipts business date:
- 16 November 2026, 03:45:29Z: the desktop app called collection-receipts with `businessDate` of the previous day and the server answered 409 `business_date_changed`; the app was likely open since before midnight.
- Fix: use the current business date, and refresh after the day change.

Scope: PWA only; no SQL, API, image or infrastructure change. Forge is not involved (no infrastructure).

Team: Archie (design and test plan), Byte (code), Chase (verification), Dewey (records), Echo (UX review).

Design (Archie, settled; PWA only; no SQL, API, image or infrastructure change):
1. Quiet retry (`apps/pwa/src/offline-dataset.ts`). A data-domain check that fails transiently is re-queued once at the front with a 3 s hold (`DATASET_QUIET_RETRY_MS`). Transient means a network failure or timeout (status 0), a server error (500 or above), or the app rejecting an OK answer for any reason except `not_authorized` or `no_revision`. The domain is not marked failed during the hold, so the header, the progress bar, `lastChecked` and the announcements do not change. One retry per domain per success. 401/403, 400, 409 and 429 are handled as before. A tap or a read invalidation clears the hold. Offline, the existing pause applies. A new client event `dataset-retry` records the first failure. Only a failed retry leads to `fail()`: one `dataset-failed` event and the header warning.
2. Reason codes. The untagged client rejections in `run()` get fixed codes: `no_revision`, `not_authorized`, `token_failed`, `invalid_json`, `invalid_unchanged`, `save_refused`, `invalid_manifest`, `invalid_reference`, `manifest_changed` and `generation_changed`, `invalid_content`, `missing_content`, `unsupported_protocol`, `invalid_segment`, `invalid_delta`, `cursor_not_advanced`, `progress_refused`, `base_changed`; fallback `client`; an abort stays `timeout`. They appear in the `dataset-failed` and `dataset-retry` events and in the domain diagnostics `lastCode` of the troubleshooting file.
3. Receipts date. Root cause: `CollectionReceipts` took its date from `CollectionRecords` page state, which can hold yesterday from the saved offline bundle (`read-cache` falls back to `readOfflineDataset`, whose envelope carries the bundle's business date) or from board state set before midnight; the early `/upcoming` fetch in the cached callback used the same stale date. Fix: receipts always ask with the Bangkok date of today. On a 409 `business_date_changed` they retry once silently. "Retry receipts" uses today. A change of date alone keeps the receipts shown, and the section reloads quietly when the app becomes visible on a new Bangkok day. The early `/upcoming` fetch runs only when the cached date is today. Archie's optional relaxation of the board's date guard was not adopted (orchestrator decision: keep the change small); the "The business date has changed" screen stays the only message (Echo R163-UX-09).
4. Echo R163-UX-01 to UX-10 are adopted; UX-08 and UX-10 are covered by item 3. The device check is iPhone WebKit only.
5. Roles. Byte owns `offline-dataset.ts`, `client-events.ts`, `CollectionReceipts.tsx` and `CollectionRecords.tsx`. Chase owns `tests/unit/offline-dataset-coordinator.test.mjs`, `tests/unit/troubleshooting.test.mjs` and `tests/e2e/collection-read.spec.ts`. Forge is not applicable.

Files:
- Code (Byte): `apps/pwa/src/offline-dataset.ts`, `apps/pwa/src/client-events.ts`, `apps/pwa/src/CollectionReceipts.tsx`, `apps/pwa/src/CollectionRecords.tsx`.
- Tests (Chase): `tests/unit/offline-dataset-coordinator.test.mjs`, `tests/unit/troubleshooting.test.mjs`, `tests/e2e/collection-read.spec.ts`.
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `project/Documents/PWA_Data_Model_Overview.md`. The data dictionary is unchanged (no column, constraint or routine change).

Implementation (Byte, complete). Files: `apps/pwa/src/offline-dataset.ts`, `apps/pwa/src/client-events.ts`, `apps/pwa/src/CollectionReceipts.tsx`, `apps/pwa/src/CollectionRecords.tsx`. No new helper: the receipts reuse `bangkokClock()` and `bangkokToday()`.
- New `dataset-retry` event kind; `DATASET_QUIET_RETRY_MS` is 3000.
- The reason-code list as designed, plus `save_refused` for a refused media save; media is never retried quietly.
- Receipts always ask for the Bangkok date of today and retry once on `business_date_changed`.
- Interpretations: (1) status 0 counts as transient only for `network` or `timeout`; (2) a domain that has failed visibly gets no quiet retry until it succeeds again (`fail()` adds it to `quietUsed`); (3) a receipts 409 during "Load more" restarts from the first page of the new day, because a cursor belongs to its day. A quiet reload on returning to the app on a new day keeps the receipts already shown and shows no error if it fails.

Data rules: no borrower data, account identifiers, addresses or secrets are recorded here; tests use invented data only.

## Checks
| Command | Result |
| --- | --- |
| `npx biome lint` on `offline-dataset.ts`, `client-events.ts`, `CollectionReceipts.tsx`, `CollectionRecords.tsx` | Pass, no findings (Byte; HEAD `f01cf01` plus the work tree, committed as `b93a00e`) |
| `npm run -s typecheck` | Pass, exit 0 (Byte; same content, `b93a00e`) |
| `node --test` on 9 unit files | Pass, 254 of 254 (Byte; same content, `b93a00e`) |
| `node --test` on the coordinator and troubleshooting unit files | Pass, 61 of 61 (Chase; `c98272c`) |
| `npx biome lint` on the edited e2e specs | Pass, clean (Chase) |
| `collection-read.spec.ts -g R163`, desktop-chromium | Pass, 4 (Chase). The same 4 fail against the `f01cf01` versions of `CollectionReceipts` and `CollectionRecords`, so they detect the defect |
| `payment-command.spec.ts -g "R163 a transient"`, desktop-chromium | Pass (Chase). It fails against the `f01cf01` `offline-dataset.ts` |
| Both R163 groups, mobile-chromium (Pixel 7) | Pass, 5 (Chase) |
| `payment-command.spec.ts -g "One refresh icon\|Full app preparation"` | Pass, 2 (Chase) |
| `refresh-hold-independent.spec.ts` "backs off" and "failing receipt" | Pass, 2, after the expectation update; the old test passes on the old code and fails on the new, so the expectation change is the only difference (Chase) |
| 22 coordinator cases across `offline-delta-independent`, `back-consumers-independent` and `dataset-replay-independent` | Pass, all, after `back-consumers-independent.spec.ts:267` was updated to expect 3 requests (503, quiet retry 503, after reload) (Chase) |
| `npx biome lint` and `npm run -s typecheck`, then `collection-read.spec.ts -g R163`, after the retryCursor fix (`95c1e0d`) | Clean, exit 0, 4 pass (Byte) |
| Chase's review | No blocking defects. Finding 1 (stale `retryCursor`) fixed by Byte in `95c1e0d`; finding 2 (the notifications domain also gets the quiet retry) accepted; finding 3 (a brief busy state during a quiet reload) accepted as cosmetic |
| CI's corrections: lint fix `c828c25` | The full-repo lint caught an assignment inside an expression in `offline-dataset-coordinator.test.mjs`; it moved out of the expression. The per-file lint had not covered that test file |
| Test fixes `d6a0a5c` | `payment-command.spec.ts:235` now seeds Bangkok-today answers, and the receipts date assertion in `phase5-final-ui-independent.spec.ts:138` now expects Bangkok today. Both were outdated expectations, not defects |
| `Development checks` run 43822656910 on `d6a0a5c` | Success: check, lint, 3 Chromium, 3 iPhone WebKit and 6 iPad WebKit shards. The merge `6c50945e` (PR #337) has the same tree |
| `Development checks` run 43820825611 on `c828c25` | Failed only on those two specs (fixed in `d6a0a5c`); its other failures passed on retry and are unrelated (R141 expenses, F12 borrower unsent reload, live-search clock, root swipe navigation) |
| DEV and PROD deployment | Pass: see the PROD promotion record below |

## Not run
- The local `mobile-webkit` device check: the WebKit binary is missing in this cloud session and `playwright install webkit` fails on host requirements. mobile-chromium (Pixel 7) was the substitute, and the iPhone WebKit device check is now covered by CI's WebKit shards (3 iPhone and 6 iPad shards green in run 43822656910).
- The quiet retry was not exercised live in PROD: no signed-in PROD session was used.
- Chase did not run the chat, error-recovery and late-charge specs (they produce 503s on other endpoints, not on the changed paths) or `reconcile-independent` and `own-receipt-seed-independent` (no failure-state assertions). The wide suite is left to CI.

## Recovery
Git baseline R162 `main` `9cf191f2` (the R163 package is `6c50945e`). A PWA-only release is undone by redeploying the previous Hosting version recorded in the [environment inventory](../project/Documents/Environment_Inventory.md); no backup is expected.

## PROD promotion record (Forge, 16 November 2026 UTC)
Authority: the owner's "push to prod when ready" (16 November 2026); R163 is PWA Hosting only, so no SQL, migration, backup, Terraform, service image or agent change. Freeze 07:37:27Z, package `6c50945e` (merge of PR #337), baseline R162 `9cf191f2`. `component-versions.mjs derive` at `6c50945e`: only the PWA changed (R163); read, command and chat stay R161; notify and jobs stay R159; schema R154 at V149; agent R153. Both bundles were built from a detached worktree at `6c50945e` with its own `npm ci`; unlike the git-archive export of R160 to R162, this gives the bundles source commit `6c50945` instead of `unknown`.

| Step | Result |
| --- | --- |
| Baseline | Project `clever-oasis-508610-n7`, region `asia-southeast1`. PROD Hosting `81660e7a5fec843c` (release `1794789095371000`, R162); read `00064-xnt`, command `00069-gnv`, chat `00048-zqm` (R161 image `a68fdedc…`), notify `00031-mzf`, jobs `00031-dmq` (R159 image `56f17745…`). DEV Hosting `a2e4ba6ee02291ae` (release `1794788879980000`, R162). Flyway read-only as `codex-cloud-read` through the IAP tunnel: `loan_manager_prod` V149, 149 rows, none failed (07:42:21Z); `loan_manager_dev` the same (07:42:29Z) |
| DEV | `build:live-dev` with `MW_RELEASE_NUMBER=R163`; the env file was written from `mw-credit-app-dev-firebase-web` plus the live DEV bundle's settings (read, command and chat DEV origins, `dev-owner-testing`, notifications on, DEV web app) and deleted after the build. `deploy-hosting.mjs --live-dev --check` (17 files), then apply 07:39:41Z to 07:39:49Z: version `576c3a4da920176e`, release `1794814789003000`, build R163 `86889a1f03ccf96925c3d072`. Smoke: three origins R163, index and entry 200, `sw.js` no-store, the entry carries `dataset-retry` and commit `6c50945`, unauthenticated read and command 401, no ERROR logs on any DEV service after 07:30Z |
| Hosting | The generic runner, frontend-only, from `buildProductionBusinessCandidate` (R158's pinned public config, sha `6eea01ac…`; PROD origins and web app only). Receipts: `Development checks` run 43822656910 on `d6a0a5c` (the merge has the same tree); terraform from run 43747953271 on `300ae4e3`; database from `Database migrations` run 43734374979 on `f12c6c3a`; the runner accepted both as input-equivalent. `--check` passed (18 files, services on their R161 and R159 pins). `--apply` 07:43:05Z to 07:43:40Z: version `d5ca4b365e2accf1`, release `1794815013729000`, build R163 `960cfb69465e5a0105dfb282`, package sha256 `1bebbc6e…c59c` |
| Smoke | Three origins R163 (`lm.mw-credit.com`, `web.app`, `firebaseapp.com`), index and entry 200, `sw.js` no-store, the entry carries `dataset-retry` and commit `6c50945`; unauthenticated read and command 401. Read, command and chat `/health` R161 `07b1d48a` (unchanged); notify `/health` R159 `5b887d09`; Cloud Run revisions unchanged; no ERROR logs on any PROD or DEV service after 07:35Z (checked 07:44:32Z) |
| Tag | `R163` on `6c50945e` (Release tag run [43826548381](https://github.com/welct0407/MW-Credit-App/actions/runs/43826548381), 07:49:46Z to 07:50:10Z; tag object `cdd4eee7…` peels to `6c50945eb293b96787cf670ff53bc9468d76c59e`, confirmed with `git ls-remote --tags origin` and by Forge at 07:50:19Z) |
| Closure | Components: PWA R163; read, command and chat R161; notify and jobs R159; schema R154 at V149; agent R153. `render --write` updated the inventory block to R163 (`render --check` ok). Drift 07:50:24Z (`--env all`, after the `R163` tag, which peels to `6c50945e`; notify and jobs facts from the 07:44Z readback, Flyway 149 read live in DEV and PROD at 07:42Z): 0 drift, 3 unverified (agent, Grafana, Metabase); PWA DEV and PROD match R163, read, command and chat match R161, notify and jobs match R159, schema matches V149 |

Rollback: PROD Hosting `81660e7a5fec843c` (release `1794789095371000`, R162); DEV `a2e4ba6ee02291ae` (release `1794788879980000`). No database or service step.

Limitations: jobs has no `/health`, so its version comes from the digest it shares with notify. The quiet retry was not exercised live (no signed-in PROD session); the owner's own use covers it. Owner acceptance of the quiet retry and the receipts date is pending. Private package: `gs://mw-credit-operator-private-737787224638/promotion-packages/r163/`; receipt `…/promotion-receipts/r163-hosting-receipt.json` (not in Git).

## Closure prune (Dewey, 16 November 2026)
R163 is Released. Deleted in the closure pull request:
- `Change Logs/CHANGE_NOTES_R160_COLLECTION_LIST_CHAT_BUTTON_2026-11-14.md`: outside the retention window (R163, R162 and R161 are the three most recent Released releases). Its six inbound links (two in the release tracker, one in Development Changes, three in the Environment Inventory) now point at commit `6c50945e`, the last commit where it exists.
- The R163 (open) row of Development Changes, replaced by the "R163 follow-up" row, as for earlier releases.
- No evidence directory was deleted: `npm run check:docs` reports none uncited.

## Open questions
None.

## Remaining work
Owner acceptance of the quiet retry and the receipts date.
