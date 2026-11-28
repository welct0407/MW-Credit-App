# Change notes — R189 Borrower details unpaid charges, 28 November 2026

## Purpose
Owner request of 28 November 2026 (verbatim): "In borrowers details page, under Active Loans section, add two more items: If all loans of this borrower have auto charge disabled, show the current unpaid charges and total outstanding unpaid charges, including current and future ones. Engage the team to work on it. Push to production." Status: Released to DEV and PROD on 28 November 2026 (read, command and chat services on a new image and PWA Hosting; no SQL; PR #396, package `fe931f48`; tag `R189`); owner acceptance pending.

Production instruction: the owner, 28 November 2026: "Push to production". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set (confirmed by Forge): a new image for the read, command and chat Cloud Run services (`borrowers.mjs` reaches all three through `genericRoleClosures`; the Terraform plan is expected to show 0 to add, 3 to change, 0 to destroy, image only, as in R187) and PWA Hosting, DEV first and then PROD through `deploy-business-hosting.mjs`. Notify, jobs and the agent stay on their pins. No SQL (Flyway stays at 155), so no backup. The chat schema digest and the command catalogue are unaffected. No Terraform file, IAM, secret or network change.

Team: Archie (design), Byte (implementation), Echo (UX review), Chase (review), Dewey (records), Forge (deployment).

## Changes
Baseline `9cba809` (R188 closed). Scope:
- New borrower details keys `unpaidChargesCurrent` and `unpaidChargesTotal`, from inline read-only SQL (`services/business/borrowers.mjs`); no migration, table or column.
- Shown only when the borrower has at least one open loan ("Loan Status" = 'ยังไม่ปิดยอด', defaulted-open included) and every open loan has Auto Charge Enabled off (NULL counts as off); otherwise both keys are null and the rows are hidden. A value of ฿0 is shown.
- Current Unpaid Charges = Σ "Amount Remaining" of recorded charges dated on or before the Bangkok business day on those loans. Total Unpaid Charges incl. Future = all unpaid recorded charges, future-dated and late charges included. No projected rows. The query also excludes `df10:` default-posting charges, as `services/business/loans.mjs` does; their remaining is 0, so the totals do not change. Charges of closed loans are excluded (reading of the request).
- Rows sit straight after Outstanding Principal under Active Loans: "Current Unpaid Charges" / "ยอดเรียกเก็บค้างชำระปัจจุบัน" and "Total Unpaid Charges incl. Future" / "ยอดเรียกเก็บค้างชำระรวมงวดอนาคต" (`apps/pwa/src/live/BorrowerRecord.tsx`).
- Offline viewed copies carry both keys (`viewed-snapshot.ts`, `OfflineViewedRecord.tsx`, offline delta); offline "current" is as of the last sync. No offline delta fix was needed; the offline dataset shape version is unchanged.
- Known limitation: a cached record shows the rows only once that borrower changes or the day rolls over; online viewing shows them at once.
- Echo findings, all adopted:
  - BRD-UX-01 Labels: the amounts use the existing ยอดเรียกเก็บค้างชำระ wording (`rollover-statement.ts`), not ค่างวด, in Title Case. "incl. Future" separates Total from Current and avoids reusing "Outstanding". Archie's alternative Thai labels are not used.
  - BRD-UX-02 Position: straight after Outstanding Principal, before the earnings rows.
  - BRD-UX-03 Format: whole baht through `display()`/`wholeBaht`, key names not ending in Return, plain `<strong>` without profit colour.
  - BRD-UX-04 Zero and visibility: ฿0 shows when the rows are shown; both rows are hidden, with no placeholder, when any open loan has Auto Charge on.
- Records (Dewey): [Solution design](../project/Documents/Solution_Design.md) R189 clause. Checked and unchanged: the chat asset `services/chat/assets/conversation-business-rules.md` (it documents no borrower details fields, so the chat digest does not change), the PWA data model, the Data Dictionary (no schema change) and the Release tracker (R189 row changes at closure).

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | `npm run lint` | Pass (1 warning and 1 info, both in untouched files) | `097d0e2e` tree (merged as `fe931f48`) |
| Byte | `npm run typecheck` | Pass | `097d0e2e` tree (merged as `fe931f48`) |
| Byte | `node --test tests/unit/viewed-snapshot.test.mjs tests/unit/expense-display-read.test.mjs` | 16/16 pass | `097d0e2e` tree (merged as `fe931f48`) |
| Byte | `tests/integration/phase5-borrower-independent.test.mjs` on a disposable PostgreSQL at V96 plus the V114 views | 13/13 pass | `097d0e2e` tree (merged as `fe931f48`) |
| CI | Pull request `Development checks`, [run 46140312173](https://github.com/welct0407/MW-Credit-App/actions/runs/46140312173) (the one broad run on the head `097d0e2e`, merged as `fe931f48` with an equal tree): 16 jobs passed, `terraform` skipped; database migrations run 46140293857 passed (6 jobs) | Success | `097d0e2e` |
| Chase | Adversarial review | Pass, no defects found | `097d0e2e` tree (merged as `fe931f48`) |
| Chase | Late-charge proof: `scripts/database/Test-MigrationsCloud.py --sql-only` as postgres on a disposable PostgreSQL at the migration head, rolled back. Interest 10 plus late charge 50 gives Amount Remaining 60.00; two manual loans with charges of 60 and 105 due and 10 in the future give current 165.00 and total 175.00; an open manual loan with no charges gives 0.00 / 0.00; mixed auto and manual loans give null; no open loan gives null; a NULL flag counts as manual | Pass | `097d0e2e` tree (merged as `fe931f48`) |
| Dewey | `npm run check:docs` at closure | 0 failures, 0 warnings | – |

## Not run
- A real iPhone and the iPhone Home Screen app; Echo's iPhone visual check of the built change is not recorded here.
- An authenticated PROD read: the first PROD view of a manual-charge borrower is owner acceptance.
- The Bangkok 17:00 UTC rollover: only today and tomorrow were checked in Asia/Bangkok.
- The `df10:` exclusion: code review only.
- Performance: the query is indexed and reads a single borrower.
- E2E: the only affected spec, `tests/e2e/phase5-borrower-independent.spec.ts`, mocks borrower details without the new keys, so the rows stay hidden and nothing changes.

## Recovery
Git baseline `9cba809` (R188 closed). Revert the batch to restore the previous borrower details page. Cloud Run activation files and Hosting versions for rollback are in the DEV and PROD records below. No SQL, no backup.

## Open questions
- Owner acceptance of R189 in PROD, written into the next release's closure or product pull request.

## Remaining work
Owner acceptance of R189: the first PROD view of a manual-charge borrower; no real-iPhone check was made. Known limitation: offline cached records show the rows after the borrower changes or the day rolls over.

## DEV deployment record (Forge, 28 November 2026 UTC)
Forge, 28 November 2026 UTC. Authority: the owner's "Push to production" of 28 November 2026 (DEV first). Package: `main` `fe931f482db892d649cb0e544b42c56c0dc26638` (PR #396); its tree equals the tested head `097d0e2e`. Development checks run 46140312173 passed (16 jobs passed, `terraform` skipped). Database migrations run 46140293857 passed (6 jobs). Changed services, derived by `genericChangedRoles` from baseline R188 `3fdc2ebf`: read, command and chat (`services/business/borrowers.mjs` is the only image input changed). No SQL.

| Step | Result |
| --- | --- |
| Image | `mw-credit-app/api@sha256:832815ecf7320d4f29a396f21e59d303768160a475df4caae26361fdc8ed668b`; Cloud Build `8647f8e9`, 11:52:59Z to 11:53:37Z, `_MW_RELEASE=R189` |
| Cloud Run | The previous activation file reproduced live DEV (no-op plan). Plan 0 add, 3 change, 0 destroy, image only; applied 11:54:56Z to 11:55:31Z; re-plan clean. Revisions: read `00108-w6b`, command `00125-gsc`, chat `00077-jtq`; notify and jobs unchanged on `06c6ba44` |
| Hosting | The env settings were first proved by rebuilding R188 `3fdc2ebf`, which reproduced the live DEV entry `index-DvSFWrTW.js` and version `35488cce…` exactly. Web build 11:57:42Z (env file shredded); deployed 11:58:16Z to 11:58:23Z: version `bf555537c1a2a5e0`, release `1795867103171000` |
| Verified | The three origins serve R189 (index and entry 200, the entry contains `fe931f4`, `sw.js` no-store). `/health` of all three services reports R189 `fe931f48`. Unauthenticated requests get 401. The test account read 12 borrower records on the command origin (`GET /api/borrower-records/{id}`): all returned 200 with both `unpaidChargesCurrent` and `unpaidChargesTotal`, numeric for 5 and null for the rest. No ERROR, 42501 or 5xx from the five DEV services between 11:54Z and 11:59:56Z |

Rollback: `dev.activation.before-r189.tfvars` (image `824e5201…`; read `00107-ffz`, command `00124-mhs`, chat `00076-2hg`) and Hosting `0c7a947171d862a4` (release `1795771751881000`).

## PROD promotion record (Forge, 28 November 2026 UTC)
Authority: the owner, 28 November 2026: "Push to production". Scope: PWA Hosting and the rebuilt shared business service image (read, command, chat). No SQL, backup, authenticated PROD read, financial write or notification.

Freeze (pinned here) at 11:52:39Z:
- Package `main` `fe931f482db892d649cb0e544b42c56c0dc26638` (PR #396, tree equal to the tested head `097d0e2e`); baseline tag R188 `3fdc2ebf`.
- CI: run 46140312173 (check and e2e), Terraform job reused from run 44874582128 (no infrastructure change), database run 46140293857.
- Read-only readback at 12:01:40Z: Flyway 155, 155 rows, 0 failed (`Invoke-CloudFlyway.py verify --target prod`: validation successful, nothing pending, 0 writes).
- `mw_app_prod` holds SELECT on the eight Charges and Loans columns the new read uses, the same as `mw_app_dev`, so DEV's field check stands for PROD.
- Package manifest (outside Git): `/root/.mw-private/MW-Credit-App/promotion/r189/promotion-package.json`, sha256 `c8ec5f5d44ee602d37c2516c3573dcd45683aa0f414f022f10167ccc5cffa6c0`. A copy is under `promotion-packages/r189/` in the operator-private bucket and the receipt is under `promotion-receipts/`.

| Step | Result |
| --- | --- |
| Image | `mw-credit-app-prod/api@sha256:3eb240b58e7140990d83d2dd3fe7bbcc688441c23c1a0984f0444d0f70165713`; Cloud Build `79e21012`, 12:02:13Z to 12:02:51Z |
| Cloud Run | The previous activation file reproduced live PROD (no-op plan). Plan 0 add, 3 change, 0 destroy, image only (plan sha `3694bfb2…`). A `prepared` runner `--check` passed before the apply. Applied 12:05:31Z to 12:06:06Z; re-plan clean; the activation file in the state bucket was updated. Revisions: read `00074-8wb`, command `00079-m69`, chat `00058-6bw`; notify and jobs unchanged (`00032-khj`, `00032-9nr`, `237a3d22`) |
| Hosting | Runner `--check` 18 files; `--apply` 12:07:03Z to 12:07:46Z; version `94beb4c181a5df55`, release `1795867659581000` |
| Verified, read-only | All three origins serve R189 with the commit, and `sw.js` is no-store. `/health` reports R189 `fe931f48`. Unauthenticated requests get 401. No ERROR, 42501 or response of 409 or higher from the five services between 12:01:48Z and 12:08:17Z. No authenticated PROD read, financial write or notification |

Rollback: `production.activation.before-r189.tfvars` (image `d77b11c8…`; read `00073-lqn`, command `00078-crm`, chat `00057-fl4`) and Hosting `3250649b8b4fba9a` (release `1795772093747000`). SQL unchanged.

## Tag record (Dewey, 28 November 2026)
Annotated tag `R189` on `main` `fe931f482db892d649cb0e544b42c56c0dc26638`, created by the Release tag workflow, run [46143356192](https://github.com/welct0407/MW-Credit-App/actions/runs/46143356192).

## Closure records (Dewey)
- Component versions (`derive --release R189 --commit fe931f48`): changed in R189 are the PWA frontend and the read, command and chat services; unchanged: notify and jobs (R175), database schema (R184, V155), integration agent (R181), Grafana dashboards (R180), Metabase reports (R144). `render --write` and `render --check` pass (R189). The drift tool was not run in this session (it needs Forge's read-only observed file).
- Environment inventory: the R189 Hosting rows for DEV and PROD and the R189 Cloud Run rows (the R188 Hosting rows and R187 Cloud Run rows are now previous); the database rows are unchanged (V155).
- Released wording: the R189 clause of the Solution design says Released.
- Pruned at closure (the three newest Released are R189, R188 and R187): `Change Logs/CHANGE_NOTES_R186_DASHBOARD_KPI_RECEIPT_STATUS_2026-11-25.md`, with its inbound links (release tracker, Development Changes, environment inventory, Solution design) repointed to permalinks at `fe931f48`. R189's entry in Development Changes is its follow-up row.
