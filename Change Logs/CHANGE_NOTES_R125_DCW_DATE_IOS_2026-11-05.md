# Change notes — Daily cash withdrawal date control on iOS, 5 November 2026

## Purpose
After R124 reached PROD, the owner's iPhone screenshot (5 November 2026, Asia/Bangkok) still showed the date pill overlapping the hour select by about 3px. The 168px label holds, but iOS Safari keeps the native date control's intrinsic width (about 183px) and ignores `width:100%`. This is release R125, the completion of the R124 fix: PWA Hosting only. Authority: the owner's "Yes, push it all the way to prod" for the overlap fix, applied to this completion of the same fix (DEV first).

## Changes
- `apps/pwa/src/live-style.css`: `.dcw-when>label input[type=date]` gets `appearance:none`, fills the label and left-aligns its value; the Chromium default is styled like the selects; an iOS-only `@supports (-webkit-touch-callout:none)` block gives the pill look of the native iOS selects (Byte).
- The e2e layout test now also asserts `appearance: none` (Byte).
- Documents: Release Tracker and Development Changes (R125 scope; R124 marked as not resolving the overlap on iOS) and the R124 change note (limitations and remaining work).

## Checks
| Command | Result |
| --- | --- |
| Biome lint (Byte) | Clean |
| Spec and cash-ledger e2e (Byte) | 14/14 pass on the first revision; daily-cash-withdrawal spec 8/8 after the iOS pill and chevron override (Chromium does not apply the `@supports (-webkit-touch-callout:none)` branch) |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | Pass by CSS reading (no device run); DCW-UX-7 adopted: chevron added on the iOS date pill; DCW-UX-8 already met (44px, left-aligned value) |
| Chase review | Pass (appearance:none keeps a 44px tappable box and the iOS picker; scoped to this page; valid iOS-only `@supports`; width fit estimated, about 95px text in 120px room) |
| CI `Development checks` on PR #241 (`9b9443a`) | Pass: run 41898036051, check, lint, e2e 3/3 |
| DEV smoke after Hosting deploy | Pass: R125 served on both origins, live CSS carries the rules (see the DEV promotion record) |
| PROD promotion (Hosting) | Pass: version `098bb131c27e2967`, read-only smoke pass, Flyway 135 unchanged (see the PROD promotion record) |

## Not run
- WebKit is not installed, so the fix is not proven on the owner's iPhone; the layout test guards the CSS contract, not the iOS rendering.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `e55f1e0`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Owner acceptance: confirmation on the iPhone that the overlap is gone, in PROD.

## DEV promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction "Yes, push it all the way to prod" for the overlap fix, applied to this completion (DEV first). Hosting only; no SQL, images, Terraform, notify or jobs, VM or Metabase. No backup was needed (no database change). No financial or test write. No secret value or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | PR #241 head `9b9443a`; `Development checks` run 41898036051 green (check, lint, e2e 3/3) |
| Baseline | DEV Hosting version `ed769dc0410fd7f3` (R124) |
| Build | `npm run build:live-dev` in a detached worktree of `9b9443a`; `.env.live-dev` written from Secret Manager `mw-credit-app-dev-firebase-web` plus the DEV origins and settings as for R124, then shredded. Build-version R125 `122eab0a11f4c892bce776a1`, entry `/assets/index-46bRtJk4.js` |
| Hosting | `deploy-hosting.mjs --live-dev --check` (site `mw-credit-app-dev-737787224638`, 16 files), then deploy: version `99bd5d7614ea517f`, release `1793821612088000`, 19:46Z |
| Smoke (read-only) | `dev-lm.mw-credit.com` and the web.app origin serve build-version R125 `122eab0a…`; `/sw.js` 200 `no-store`; the entry bundle carries `9b9443a`; the live CSS `/assets/index-BJasl3GQ.css` has `.dcw-when>label input[type=date]{-webkit-appearance:none;…}` and the `@supports (-webkit-touch-callout:none)` pill block |
| Rollback | Redeploy DEV Hosting version `ed769dc0410fd7f3` |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the same instruction. Hosting only; no SQL, so no backup was needed. No PROD payment, forced notification, backfill, PROD test write or financial correction. Private records are in the operator bucket under `promotion-packages/r125/`.

| Step | Result |
| --- | --- |
| Freeze | Generic-v1 frontend-only package from `main` at `2d4dd30` (merge of PR #241; tree `47ba410` identical to the CI-tested head `9b9443a`), baseline tag R124 `ac3edbf`, package sha256 `9fa9c61d…532c` |
| Baseline | Project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638`, Hosting version `36dd11f5affa432b` (R124). Read `00045-7xg`, command `00050-r7q` and chat `00029-7lh` on `713c0638…dcce`; notify `00027-mkt` and jobs `00027-xch` on `a66cbf29…27ba` |
| SQL | None. `Invoke-CloudFlyway.py verify --target prod`, read-only as `codex-cloud-read`: `loan_manager_prod` schema 135, validation successful, nothing pending, 0 writes (19:47:19Z to 19:47:59Z) |
| Build | `buildProductionBusinessCandidate` from a detached worktree of `2d4dd30` with the pinned public config (sha256 `6eea01ac…7e92`): build-version R125 `16d548b83d721ba3b27d8bc7`, entry `/assets/index-C-i9-_Xq.js`, 17 files |
| Hosting | Generic runner as `mw-credit-unattended-admin`; `--check`, then `--apply` 19:48:30Z to 19:49:08Z. Version `098bb131c27e2967`, release `1793821741184000`, 17 files, `no-store`; private receipt `R125-HOSTING-RECEIPT.json` (also in `promotion-receipts/`) |
| CI receipts | `check` and e2e 3/3: run 41898036051 (`9b9443a`). terraform: run 41203206026 (`cb875ea`). Database guards and the four rebuilds: run 41854481914 (`74a5705`; no database-relevant file changed since) |
| Smoke (read-only) | `lm.mw-credit.com` and `web.app` serve build-version R125 `16d548b8…`; the entry bundle carries `2d4dd30`, R125, the PROD command origin and `production-business`; the live CSS `/assets/index-BJasl3GQ.css` has the `input[type=date]{-webkit-appearance:none` rule and the `@supports (-webkit-touch-callout:none)` block; `/sw.js` 200 `no-store`; `/health` 200 on read, command and chat; no PROD ERROR logs from 19:40Z to 19:50Z |
| Not deployed | Cloud Run images and revisions, Terraform, notify, jobs, VM-01 and Metabase (unchanged) |
| Rollback | Redeploy PROD Hosting version `36dd11f5affa432b` (R124) |

### Limitations
- The control was not checked on a real iPhone during promotion; the owner's confirmation is pending.

### Tag record
Tag `R125` on `2d4dd30` (annotated tag object `fd7364983dac50246463a7f966e3b2d9fef12fe5`) through Release tag workflow run 41900739112, with the GitHub Release published by the same run at 19:50:13Z.

### Closure and prune record
Closure pull request, records only: tracker (R125 Released, R126 opened, next unused number R127), Development Changes, Environment Inventory (Hosting rows; Cloud Run and Flyway stated unchanged) and this note.
- Deleted: `Change Logs/CHANGE_NOTES_R122_BORROWER_DISPLAY_TRANSLATE_2026-11-04.md` (R122 left the three-release window). Its inbound links were first repointed to the permalink at `2d4dd30`.
- Kept: `integration-agent/Change Logs/CHANGE_NOTES_R122_CHAT_RELAY_THINKING_2026-11-04.md` (integration-agent notes are not pruned by the release window); its link to the deleted R122 note now points to the permalink at `2d4dd30`.
- Kept: the R123 and R124 notes (inside the window); `project/outputs/dictionary-r116-20261103/` and `project/outputs/dictionary-r120-20261104/`, still cited by Data Dictionary entries.
