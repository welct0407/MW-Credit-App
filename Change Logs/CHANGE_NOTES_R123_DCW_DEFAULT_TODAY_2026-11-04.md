# Change notes — Daily cash withdrawal default date and time, 4 November 2026

## Purpose
The owner asked on 4 November 2026 (Asia/Bangkok) to change the Daily cash withdrawal page so the date defaults to today and the time to the current time ("Let the team work on it"), then "Test it and push all the way to prod." This is release R123: PWA Hosting only.

## Changes
Design (Archie, with Echo's review; Echo DCW-UX-1 and DCW-UX-3 adopted):
- The page takes date and time from one Bangkok clock reading at page open: the date defaults to today (R115 used yesterday) and the time to now rounded down to 10 minutes. The 10-minute steps are unchanged because the API requires 10-minute slots.
- The date maximum is the later of the business date and Bangkok today.
- Defaults the person has not edited refresh when the app returns to the foreground; after the person edits the date or the time, the values stay as edited.
- DCW-UX-2 (step the time back when the device clock is ahead) is deferred: the existing "can no longer be used" alert already handles it. DCW-UX-4: no copy change.

Implementation (PWA client only; no SQL, server or infrastructure change):
- `apps/pwa/src/bangkok-clock.ts` (new; `bangkokClock` replaces `bangkokTimeNow`) and `apps/pwa/src/DailyCashWithdrawal.tsx` (Byte): defaults from one clock reading, date maximum = later of business date and Bangkok date, visibility refresh of untouched defaults. Chase found one defect, fixed: the refresh is a no-op while the confirm step is open, and the confirm summary shows the command's own date and time.
- Tests: `tests/unit/daily-cash-withdrawal.test.mjs`, Playwright `daily-cash-withdrawal-independent` and `cash-ledger-counterparty-independent` (the new step fails without the fix).
- Documents: Release Tracker and Development Changes (R123 scope), Solution Design (Daily Cash withdrawal paragraph). The Data Dictionary, PWA Data Model Overview and database README need no change (no schema, behavior of data or access change).

## Checks
All on base 673504d, uncommitted working tree.

| Command | Result |
| --- | --- |
| Biome lint, 4 files (Byte) | Clean |
| `npm run typecheck` (Byte) | 0 errors |
| `node --test tests/unit/daily-cash-withdrawal.test.mjs` (Byte) | 6/6 pass |
| Playwright daily-cash-withdrawal-independent and cash-ledger-counterparty-independent, desktop and mobile (Byte) | 12/12 pass |
| Chase adversarial review | One defect (confirm summary drift on refresh) fixed and re-reviewed: pass |
| Echo iPhone 13 viewport (Chromium), English and Thai, 12:07 and 00:03 with stale business date | Correct defaults, no alerts, no horizontal scroll |
| `npm run check:docs` (Dewey) | Pass |
| CI `Development checks` on PR #237 (`a8bbba8`) | Pass: run 41888055680, check, lint, e2e 3/3 |
| DEV smoke after Hosting deploy | Pass: R123 served on both origins, `sw.js` no-store (see the DEV promotion record) |
| PROD promotion (Hosting) | Pass: version `ee199ec4b344c29b`, read-only smoke pass, Flyway 135 unchanged (see the PROD promotion record) |

## Not run
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.
- Real iOS Safari (Echo used Chromium, no WebKit).
- Not fixed, noted: the basis refetch on offline to online during review is pre-R123 behavior; after Back from confirm, untouched defaults stay until the next foreground event; DCW-UX-5 (Thai as-of month shown in English) is pre-existing and out of scope.

## Recovery
Revert the commit of this batch (Git baseline 673504d) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- None for the release; it is Released and tagged `R123`.
- Owner acceptance: first real use of the page in PROD.

## DEV promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction of 4 November 2026, "Test it and push all the way to prod". Hosting only; no SQL, images, Terraform, notify or jobs, VM or Metabase. No backup was needed (no database change). No financial or test write. No secret value or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | PR #237 head `a8bbba8` (unmerged); `Development checks` run 41888055680 green (check, lint, e2e 3/3) |
| Baseline | DEV Hosting version `89deb290b5c1d5a4` (R122, release `1793809886101000`); PROD Hosting version `1d09a013dcdb5158` (R122, release `1793812690305000`), unchanged |
| Build | `npm run build:live-dev` in a detached worktree of `a8bbba8`; `.env.live-dev` written from Secret Manager `mw-credit-app-dev-firebase-web` plus the DEV read, command and chat origins, `dev-owner-testing` and notifications enabled (the R122 bundle's settings), then shredded. Build-version R123 `02ffdc5036007e9ccdecc2ef`, entry `/assets/index-DhQ2j64W.js` |
| Hosting | `deploy-hosting.mjs --live-dev --check` (site `mw-credit-app-dev-737787224638`, 16 files), then deploy: version `9bc58ecee792cda5`, release `1793817902324000`, live 18:45:02Z |
| Smoke (read-only) | `dev-lm.mw-credit.com` and the web.app origin serve build-version R123 `02ffdc50…`; `/sw.js` 200 `no-store`; the entry bundle carries `a8bbba8`, R123 and the DEV command origin |
| Rollback | Redeploy DEV Hosting version `89deb290b5c1d5a4` |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the same instruction. Hosting only; no SQL, so no backup was needed. No PROD payment, forced notification, backfill, PROD test write or financial correction. No secret value or borrower data appears here. Private records are in the operator bucket under `promotion-packages/r123/`.

| Step | Result |
| --- | --- |
| Freeze | Generic-v1 frontend-only package from `main` at `9eea22c` (merge of PR #237; tree identical to the CI-tested head `a8bbba8`), baseline tag R122 `b83bf3a`, package sha256 `5470a8fa…b1a1` |
| Baseline | Project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638`, Hosting version `1d09a013dcdb5158` (R122). Read `00045-7xg`, command `00050-r7q` and chat `00029-7lh` on `713c0638…dcce`; notify `00027-mkt` and jobs `00027-xch` on `a66cbf29…27ba` |
| SQL | None. `Invoke-CloudFlyway.py verify --target prod`, read-only as `codex-cloud-read`: `loan_manager_prod` schema 135, validation successful, nothing pending, 0 writes (18:48:02Z to 18:48:57Z; the tool counts 134 rows in state Success) |
| Build | `buildProductionBusinessCandidate` from a detached worktree of `9eea22c` with the pinned public config (sha256 `6eea01ac…7e92`, unchanged since R121): build-version R123 `f6c18468ac1420b0677246cb`, entry `/assets/index-jWlgL0v8.js`, 17 files |
| Hosting | Generic runner as `mw-credit-unattended-admin`; `--check`, then `--apply` 18:50:31Z to 18:51:10Z. Version `ee199ec4b344c29b`, release `1793818262544000`, 17 files, `no-store`; private receipt `R123-HOSTING-RECEIPT.json` (also in `promotion-receipts/`) |
| CI receipts | `check` and e2e 3/3: run 41888055680 (`a8bbba8`). terraform: run 41203206026 (`cb875ea`). Database guards and the four rebuilds: run 41854481914 (`74a5705`; no database-relevant file changed since) |
| Smoke (read-only) | `lm.mw-credit.com` and `web.app` serve build-version R123 `f6c18468…`; the entry bundle carries `9eea22c`, R123, the PROD command origin and `production-business`; `/sw.js` 200 `no-store`; `/health` 200 on read, command and chat; no PROD ERROR logs from 18:40Z to 18:52Z |
| Not deployed | Cloud Run images and revisions, Terraform, notify, jobs, VM-01 and Metabase (unchanged) |
| Rollback | Redeploy PROD Hosting version `1d09a013dcdb5158` (R122) |

### Limitations
- PROD acceptance is pending: the owner's first real use of the Daily cash withdrawal page. No authenticated PROD read was made.

### Tag record
Tag `R123` on `9eea22c` (annotated tag object `bffcd476ae90458e47034609e9a3cc209b07bd6a`) through Release tag workflow run 41891379264, with the GitHub Release published by the same run at 18:52:39Z.

### Closure and prune record
Closure pull request, records only: tracker (R123 Released, R124 opened, next unused number R125), Development Changes, Environment Inventory (Hosting rows; Cloud Run and Flyway stated unchanged) and this note.
- Deleted: `Change Logs/CHANGE_NOTES_R120_REFERRAL_REBATE_TERMS_2026-11-04.md` (R120 left the three-release window). Its inbound links in the tracker, Development Changes, the Environment Inventory and the Solution Design were first repointed to the permalink at `9eea22c`.
- Kept: the R121 and R122 notes (inside the window); `project/outputs/dictionary-r116-20261103/` and `project/outputs/dictionary-r120-20261104/`, still cited by Data Dictionary entries.
