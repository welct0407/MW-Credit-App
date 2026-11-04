# Change notes — Daily cash withdrawal date and time design, 5 November 2026

## Purpose
On R125's iPhone screenshot the owner said (5 November 2026, Asia/Bangkok): "It looks very ugly. Fix it in dev properly, let echo review it. I'll review in dev before any further prod promotion." This is release R126: PWA Hosting only. Scope was DEV only at first. The owner reviewed it in DEV and then said "promote R126", which approved PROD promotion; the approval given for R125 did not carry over.

## Changes
Design (Echo DCW-UX-9 to DCW-UX-13):
- The date uses the Cash Statement Date pattern (`.cash-date-picker`): visible date text with the year (`displayDateWithYear`), a calendar icon and a transparent native date input; 164px wide, 8px gap, 20px #565656 icon.
- The hour and minute selects sit in matching 44px boxes: appearance none, 1px #767676 border, 4px radius, white background, chevron.
- Labels stay on one line.
- All R124 and R125 date rules are removed.

Implementation (PWA client only; no SQL, server or infrastructure change):
- `apps/pwa/src/live-style.css` and `apps/pwa/src/DailyCashWithdrawal.tsx` (Byte), with the layout test.
- Documents: Release Tracker and Development Changes (R126 scope; R125 visual outcome rejected) and the R125 change note (limitations and remaining work).

## Checks
| Command | Result |
| --- | --- |
| Biome lint, typecheck (Byte) | Clean |
| Spec and cash-ledger e2e (Byte) | 14/14 pass on the first R126 build; daily-cash-withdrawal spec 8/8 after DCW-UX-12/13 |
| Cash Statement Date e2e (Byte) | 6/6 pass |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | First build: DCW-UX-12 (date 164px, 8px gap before the icon) and DCW-UX-13 (20px #565656 icon) raised and applied; the 390px close-ups in English and Thai then show one aligned row of matching 44px boxes |
| Chase review | Pass (R123 default, refresh and confirm logic intact; aria-hidden text with labelled, focusable input; shared `.cash-date-picker` CSS unchanged; no R124/R125 date rules left; iOS picker behaviour follows the Cash page pattern, not device-tested) |
| CI `Development checks` on PR #243 (`e500787`) | Pass: run 41902099966 |
| DEV smoke after Hosting deploy | Pass: R126 served on both origins, live CSS carries the rules (see the DEV promotion record) |
| PROD promotion (Hosting) | Pass after the owner's DEV review and "promote R126": version `4b3a9f8a6f4605fc`, read-only smoke pass, Flyway 135 unchanged (see the PROD promotion record) |

## Not run
- WebKit is not installed; the owner's iPhone is the check of the iOS look.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `db79f44`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the owner's DEV review is done; the first real use in PROD is pending.

## DEV promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction "Fix it in dev properly, let echo review it. I'll review in dev before any further prod promotion." DEV only: no merge, PROD action or tag. Hosting only; no SQL, images, Terraform, notify or jobs, VM or Metabase. No backup was needed (no database change). No financial or test write. No secret value or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | PR #243 head `e500787` (unmerged); `Development checks` run 41902099966 green |
| Baseline | DEV Hosting version `99bd5d7614ea517f` (R125) |
| Build | `npm run build:live-dev` in a detached worktree of `e500787`; `.env.live-dev` written from Secret Manager `mw-credit-app-dev-firebase-web` plus the DEV origins and settings as for R125, then shredded. Build-version R126 `c6188466a835b0011d892d83`, entry `/assets/index-BpFVHGfK.js` |
| Hosting | `deploy-hosting.mjs --live-dev --check` (site `mw-credit-app-dev-737787224638`, 16 files), then deploy: version `cf0ed4a31026c97b`, release `1793822940257000`, 20:09Z |
| Smoke (read-only) | `dev-lm.mw-credit.com` and the web.app origin serve build-version R126 `c6188466…`; `/sw.js` 200 `no-store`; the entry bundle carries `e500787`; the live CSS `/assets/index-DI2xl-vf.css` has `.dcw-when>label{flex:0 0 164px;min-width:0}` and `.daily-cash-withdrawal .dcw-time-selects select{-webkit-appearance:none;appearance:none;…}` |
| Rollback | Redeploy DEV Hosting version `99bd5d7614ea517f` |
| PROD | Unchanged: Hosting `098bb131c27e2967` (R125). Promotion waits for the owner's DEV review |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction "promote R126", given after the owner's DEV review. Hosting only; no SQL, so no backup was needed. No PROD payment, forced notification, backfill, PROD test write or financial correction. No secret value or borrower data appears here. Private records are in the operator bucket under `promotion-packages/r126/`.

| Step | Result |
| --- | --- |
| Freeze | Generic-v1 frontend-only package from `main` at `646b2aa` (merge of PR #243; tree `9f1dfee` identical to the CI-tested and DEV-reviewed head `e500787`), baseline tag R125 `2d4dd30`, package sha256 `bb3e96af…1d7e` |
| Baseline | Project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638`, Hosting version `098bb131c27e2967` (R125). Read `00045-7xg`, command `00050-r7q` and chat `00029-7lh` on `713c0638…dcce`; notify `00027-mkt` and jobs `00027-xch` on `a66cbf29…27ba` |
| SQL | None. `Invoke-CloudFlyway.py verify --target prod`, read-only as `codex-cloud-read`: `loan_manager_prod` schema 135, validation successful, nothing pending, 0 writes (20:48:41Z to 20:49:22Z) |
| Build | `buildProductionBusinessCandidate` from a detached worktree of `646b2aa` with the pinned public config (sha256 `6eea01ac…7e92`): build-version R126 `970846ee1326a03eff13fd2f`, entry `/assets/index-Bd3MkfHd.js`, 17 files |
| Hosting | Generic runner as `mw-credit-unattended-admin`; `--check`, then `--apply` 20:49:55Z to 20:50:34Z. Version `4b3a9f8a6f4605fc`, release `1793825427302000`, 17 files, `no-store`; private receipt `R126-HOSTING-RECEIPT.json` (also in `promotion-receipts/`) |
| CI receipts | `check` and e2e 3/3: run 41902099966 (`e500787`). terraform: run 41203206026 (`cb875ea`). Database guards and the four rebuilds: run 41854481914 (`74a5705`; no database-relevant file changed since) |
| Smoke (read-only) | `lm.mw-credit.com` and `web.app` serve build-version R126 `970846ee…`; the entry bundle carries `646b2aa`, R126, the PROD command origin and `production-business`; the live CSS `/assets/index-DI2xl-vf.css` has `.dcw-when>label{flex:0 0 164px;…}` and `.dcw-time-selects select{-webkit-appearance:none;appearance:none;…}`; `/sw.js` 200 `no-store`; `/health` 200 on read, command and chat; no PROD ERROR logs from 20:40Z to 20:51Z |
| Not deployed | DEV (already R126 `cf0ed4a31026c97b` from the same tree), Cloud Run images and revisions, Terraform, notify, jobs, VM-01 and Metabase (unchanged) |
| Rollback | Redeploy PROD Hosting version `098bb131c27e2967` (R125) |

### Limitations
- The PROD page was not opened in a browser during promotion; the owner reviewed the same tree in DEV.

### Tag record
Tag `R126` on `646b2aa` (annotated tag object `8eb046dc732dd570cb3a1b8f646e85af22f2e848`) through Release tag workflow run 41910547869, with the GitHub Release published by the same run at 20:51:45Z.

### Closure and prune record
Closure pull request, records only: tracker (R126 Released, R127 opened, next unused number R128), Development Changes, Environment Inventory (Hosting rows; Cloud Run and Flyway stated unchanged) and this note.
- Deleted: `Change Logs/CHANGE_NOTES_R123_DCW_DEFAULT_TODAY_2026-11-04.md` (R123 left the three-release window). Its inbound links were first repointed to the permalink at `646b2aa`.
- Kept: the R124 and R125 notes (inside the window); `project/outputs/dictionary-r116-20261103/` and `project/outputs/dictionary-r120-20261104/`, still cited by Data Dictionary entries.
