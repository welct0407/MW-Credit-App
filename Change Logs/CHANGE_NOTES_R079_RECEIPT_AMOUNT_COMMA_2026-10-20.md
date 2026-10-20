# Change notes — receipt amount with thousands comma in the command API (R079), 20 October 2026

## Purpose
Gemini returns slip amounts such as `1,480.00`. The command API's `slipFields` accepted only a plain decimal, so it warned `amount_unreadable` and the payment receiving form filled no amount; the failure is deterministic (model temperature 0), so a retry failed the same way. The integration agent already accepted the grouped comma (commit `f1cfbe4`, deployed at `55964c7`); the API rule had not been ported. Status: Frozen 2026-10-20T12:02Z at main `823e9e5` (PR #95); Released 20 October 2026 (applied and verified in DEV and PROD; owner acceptance is the owner's production instruction, and the real-slip re-check is pending).

## Changes
- API (Byte, commit `1ebe0cf`): `services/receipts/recognizer-rules.mjs` strips a correctly grouped thousands comma (`^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$`) before the unchanged plain-amount check. `5,00`, `1,2345` and `1,48,000` stay `amount_unreadable`; a non-zero fraction still warns `amount_fractional`. The unit test `tests/unit/receipt-recognition-rules.test.mjs` covers the cases.
- Delivery tooling (Dewey): `scripts/promotion/deploy-business-hosting.mjs` gains the R079 contract (`schemaVersion: 21`, `release: R079`, scope `runtime-workers-frontend`) on the R076 and R077 code path: no SQL, V98 with 98 verified history rows, source descending from the R078 release `68ce669` and the V98 commit `7ae8469` with no migration change since, plan 0/4/0 of the four images only, unchanged enabled recognizer pin, live timeouts (command 55 s, reader 15 s, notify and jobs 120 s), per-job CI gate, marker `R079`, operator audience `.../promotion/r079`. Unit tests in `tests/unit/business-hosting-delivery.test.mjs`; the earlier "unsupported release" assertions moved to R080. Section added to `scripts/promotion/README.md`.
- Records: `project/Documents/Solution_Design.md` (amount rule sentence), `project/Documents/Development_Changes.md` (outstanding row), this note.
- Not changed: SQL, infrastructure, PWA source, the integration agent, the notification work (branch `claude/r079-push-notification-content`, moved to R080).

## Checks
| Command | Result |
| --- | --- |
| `node --test tests/unit/business-hosting-delivery.test.mjs` | Pass, 72 of 72 (local, 20 October 2026) |
| `npx biome check` on the runner and its test | 0 errors; the same 3 warnings exist on `main` |
| `npm run check:docs` | Pass (local, 20 October 2026) |
| PR #95 CI on main `823e9e5` (receipt rule unit test, lint, typecheck, build, e2e) | `Development checks` run 39418704634 and `Database migrations` run 39418399589 |
| DEV promotion, 20 October 2026 (Forge, scratch clone at `823e9e5`) | Image built (Cloud Build SUCCESS 12:02:13Z) and applied on the four services (plan 0/4/0, 12:04:27Z to 12:09:05Z, re-plan No changes); Hosting deployed, label R079. Smoke: build-version R079, bundle carries `823e9e5` and `"R079"`, reader and command `/health` 200, unauthenticated `/api/session` 401, no ERROR logs 12:04Z to 12:11:33Z. Pins are in the inventory |
| PROD promotion, 20 October 2026 (Forge, scratch clone at `823e9e5`) | Cloud Build SUCCESS 12:12:57Z; read-only SQL readback V98, 98 rows, 0 failed (12:14:10Z); image on the four services (plan 0/4/0, image only, applied 12:15:36Z to 12:16:13Z, re-plan No changes); Hosting deployed, marker R079. CI cited by the package: check `39418704634` (evidence), e2e 1 to 3 `39292701581` (evidence), terraform `39219602724` (evidence), guards `39418399589` (input-equivalent), rebuild groups `39418399589` (evidence). Smoke: build-version R079, bundle carries `823e9e5` and `"R079"`, reader and command `/health` 200, unauthenticated `/api/session` 401, recognizer wiring unchanged, no ERROR logs 12:15Z to 12:20:26Z. Agent untouched; no payment, notification or job executed. Pins are in the inventory |

## Not run
- No SQL, database rebuild or browser suite: the change is API parsing and delivery tooling only; the database and e2e stages are covered by the lean check routine's evidence reuse.
- The owner's re-check of the real `1,480.00` slip in PROD: pending. The recognizer cache is in memory and the deploy cleared it, so the owner reopens or re-uploads the slip.

## Recovery
Restore the previous image on the four Cloud Run services and the previous Hosting version recorded as rollback in the [environment inventory](../project/Documents/Environment_Inventory.md) (the R078 pins in the inventory's rollback columns). No SQL or agent change is involved.

## Promotion authority
Owner instruction, 20 October 2026, in this session: "yes, fix it and promote to production. coordinate with [the notification session]. i want this fix goes in first into prod, while the notification team continue to be deployed later, after this fix is in." This is the scoped approval under the release workflow for R079: DEV and PROD, a new application image on the four Cloud Run services (all four share one image) and Hosting with marker R079, with the required promotion records and evidence. It covers no SQL, no financial correction, no forced notification and no agent change. The notification work moves to R080 and deploys after R079.

## Open questions
None.

## Remaining work
The owner re-checks the `1,480.00` slip in PROD (tracked in [Development changes](../project/Documents/Development_Changes.md)). R080 (push-notification content, V99) deploys next.

## Promotion record
- Owner instruction: see Promotion authority above.
- Freeze: R079 frozen 2026-10-20T12:02Z at main `823e9e593afde879fdb0ba94e198ea0351975aea` (PR #95); R080 opened in the same tracker update for the push-notification content work (V99), which deploys only after R079 is in PROD.
- Package: that commit; no SQL (PROD stays at V98, 98 rows); plan 0/4/0 of the four images; Hosting marker R079. Pins and references go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- Deviation, DEV build: `npm run build:live-dev` did not fetch Secret Manager `mw-credit-app-dev-firebase-web` itself. Forge wrote the ignored `.env.live-dev` from the secret plus the seven settings the live R078 DEV bundle carries (including `VITE_COMMAND_MODE=dev-owner-testing`), rebuilt, and deleted the file. [docs/Development.md](../docs/Development.md) now describes that step; no script changed in this release.
- Excluded: any SQL, financial correction, forced notification, agent change and anything merged after `823e9e5`.

### Closure pruning (release workflow, 20 October 2026)
- Inbound link repointed first to the commit permalink of `0bcd4b76` (the last commit where the target exists): the tracker's R076 record link.
- Development Changes: removed the R079 outstanding-work row; the owner's slip re-check is now part of the R075 follow-ups row.
- Change note deleted (R076 left the retention window of R079, R078 and R077): `Change Logs/CHANGE_NOTES_R076_RECEIPT_ACCOUNT_HOTFIX_2026-10-18.md`.
- Evidence deleted: none (see the `npm run check:docs` result).
