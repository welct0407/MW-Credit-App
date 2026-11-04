# Change notes — Daily cash withdrawal date and time layout, 5 November 2026

## Purpose
The owner reported with an iPhone screenshot (4 to 5 November 2026, Asia/Bangkok) that the date and time fields on the Daily cash withdrawal page overlap a little. This is release R124: PWA Hosting only. The owner then approved promotion ("Yes, push it all the way to prod").

## Changes
- `apps/pwa/src/live-style.css`: in `.dcw-when` the date label is a fixed `10.5em` and the date input is `width: 100%` with border-box sizing and `min-width: 0`. The rule applies to the Daily cash withdrawal page only (Byte).
- New e2e layout test at 390 by 844 that fails without the fix (Byte).
- Documents: Release Tracker and Development Changes (R124 scope). No other document describes this layout.

## Checks
| Command | Result |
| --- | --- |
| Biome lint (Byte) | Clean |
| e2e typecheck (Byte) | Pass |
| Spec and cash-ledger e2e (Byte) | 14/14 pass |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | Pass (Chromium estimates; 168px holds the iOS pill, "30 Sep 2026" about 135px, Thai about 130–140px; one row at 390px in English and Thai, no sideways scroll); DCW-UX-6 optional: at 320px the time wraps below the date, accepted |
| Chase review | Pass (rules scoped to `.dcw-when>label`, no other page affected; 320px wraps without overflow; the e2e test guards the CSS contract, not the iOS rendering) |
| CI `Development checks` on PR #239 (`6288d79`) | Pass: run 41893778373, check, lint, e2e 3/3 |
| DEV smoke after Hosting deploy | Pass: R124 served on both origins, live CSS carries the fix (see the DEV promotion record) |
| PROD promotion (Hosting) | Pass: version `36dd11f5affa432b`, read-only smoke pass, Flyway 135 unchanged (see the PROD promotion record) |

## Not run
- WebKit is not installed, and Chromium did not reproduce the original overlap, so the fix is not proven on the owner's iPhone.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `919cbc9`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Owner acceptance: confirmation on the iPhone that the overlap is gone, in PROD.

## DEV promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction "Yes, push it all the way to prod" (R124, DEV first). Hosting only; no SQL, images, Terraform, notify or jobs, VM or Metabase. No backup was needed (no database change). No financial or test write. No secret value or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | PR #239 head `6288d79`; `Development checks` run 41893778373 green (check, lint, e2e 3/3) |
| Baseline | DEV Hosting version `9bc58ecee792cda5` (R123) |
| Build | `npm run build:live-dev` in a detached worktree of `6288d79`; `.env.live-dev` written from Secret Manager `mw-credit-app-dev-firebase-web` plus the DEV origins and settings as for R123, then shredded. Build-version R124 `e6804fb1456613a1217b75ee`, entry `/assets/index-DZrgPXHV.js` |
| Hosting | `deploy-hosting.mjs --live-dev --check` (site `mw-credit-app-dev-737787224638`, 16 files), then deploy: version `ed769dc0410fd7f3`, release `1793819889515000`, 19:18Z |
| Smoke (read-only) | `dev-lm.mw-credit.com` and the web.app origin serve build-version R124 `e6804fb1…`; `/sw.js` 200 `no-store`; the entry bundle carries `6288d79`; the live CSS `/assets/index-DuU_Wmtg.css` has `.dcw-when>label{flex:0 0 10.5em;min-width:0}` |
| Rollback | Redeploy DEV Hosting version `9bc58ecee792cda5` |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the same instruction. Hosting only; no SQL, so no backup was needed. No PROD payment, forced notification, backfill, PROD test write or financial correction. Private records are in the operator bucket under `promotion-packages/r124/`.

| Step | Result |
| --- | --- |
| Freeze | Generic-v1 frontend-only package from `main` at `ac3edbf` (merge of PR #239; tree `0cd25d3` identical to the CI-tested head `6288d79`), baseline tag R123 `9eea22c`, package sha256 `ed21cd9b…81d2` |
| Baseline | Project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638`, Hosting version `ee199ec4b344c29b` (R123). Read `00045-7xg`, command `00050-r7q` and chat `00029-7lh` on `713c0638…dcce`; notify `00027-mkt` and jobs `00027-xch` on `a66cbf29…27ba` |
| SQL | None. `Invoke-CloudFlyway.py verify --target prod`, read-only as `codex-cloud-read`: `loan_manager_prod` schema 135, validation successful, nothing pending, 0 writes (19:18:52Z to 19:19:32Z) |
| Build | `buildProductionBusinessCandidate` from a detached worktree of `ac3edbf` with the pinned public config (sha256 `6eea01ac…7e92`): build-version R124 `fe35d0becd2c32b487b197d8`, entry `/assets/index-CA83pbTI.js`, 17 files |
| Hosting | Generic runner as `mw-credit-unattended-admin`; `--check`, then `--apply` 19:20:45Z to 19:21:23Z. Version `36dd11f5affa432b`, release `1793820075862000`, 17 files, `no-store`; private receipt `R124-HOSTING-RECEIPT.json` (also in `promotion-receipts/`) |
| CI receipts | `check` and e2e 3/3: run 41893778373 (`6288d79`). terraform: run 41203206026 (`cb875ea`). Database guards and the four rebuilds: run 41854481914 (`74a5705`; no database-relevant file changed since) |
| Smoke (read-only) | `lm.mw-credit.com` and `web.app` serve build-version R124 `fe35d0be…`; the entry bundle carries `ac3edbf`, R124, the PROD command origin and `production-business`; the live CSS `/assets/index-DuU_Wmtg.css` has `.dcw-when>label{flex:0 0 10.5em;min-width:0}`; `/sw.js` 200 `no-store`; `/health` 200 on read, command and chat; no PROD ERROR logs from 19:10Z to 19:22Z |
| Not deployed | Cloud Run images and revisions, Terraform, notify, jobs, VM-01 and Metabase (unchanged) |
| Rollback | Redeploy PROD Hosting version `ee199ec4b344c29b` (R123) |

### Limitations
- The layout was not checked in a browser during promotion; the owner's iPhone confirmation is pending.

### Tag record
Tag `R124` on `ac3edbf` (annotated tag object `4909f85a0f6eae56ee0202f06a3056060f6cd6e0`) through Release tag workflow run 41896313962, with the GitHub Release published by the same run at 19:22:59Z.

### Closure and prune record
Closure pull request, records only: tracker (R124 Released, R125 opened, next unused number R126), Development Changes, Environment Inventory (Hosting rows; Cloud Run and Flyway stated unchanged) and this note.
- Deleted: `Change Logs/CHANGE_NOTES_R121_RECEIPT_REFUSAL_2026-11-04.md` (R121 left the three-release window). Its inbound links in the tracker, Development Changes and the Environment Inventory were first repointed to the permalink at `ac3edbf`.
- Kept: the R122 and R123 notes (inside the window); `project/outputs/dictionary-r116-20261103/` and `project/outputs/dictionary-r120-20261104/`, still cited by Data Dictionary entries.
