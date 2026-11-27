# Change notes — R187 Dashboard profit KPIs, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim), with a screenshot of the desktop Dashboard KPI row: "replace the two numbers on the right with Realized Profit MTD (before write-offs) and last month Realized Profit (before write-offs)", followed by "push all the way to prod", and a second request the same day (verbatim): "Add the all time numbers (profit and write off) in another section of Dashboard, below month forecast". The Dashboard KPI row changes from Today's Profit, Yesterday's Profit, Net Profit and Principal Loss Recognized to Today's Profit, Yesterday's Profit, Realized Profit MTD (before write-offs) and Last month Realized Profit (before write-offs). The last-month figure is new. The Dashboard also gets a new "All time" / "ยอดสะสมทั้งหมด" sub-section directly after Monthly forecast; it shows Net Profit and Principal Loss Recognized, the lifetime figures that leave the KPI row, and Principal Loss shows ฿0 rather than being hidden, so both lifetime figures stay on the Dashboard. The Thai heading is a draft and needs the owner's or Lisa's check. Status: Released to DEV and PROD on 27 November 2026 (PWA Hosting plus the rebuilt shared business service image; PR #392, package `e55efc50`; tag `R187`); owner acceptance pending.

Production instruction: the owner, 27 November 2026: "push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set: PWA Hosting plus the rebuilt shared business service image (read, command, chat); no SQL, no backup.

Team: Archie (the definition of the last-month figure and where it is computed), Byte (implementation), Chase (verification, including real SQL), Echo (a quick visual check), Dewey (records), Forge (deployment).

## Changes
Baseline `ad890b9c` (`main`, R186 closed). Scope:
- Dashboard KPI row: the two right-hand figures are replaced by "Realized Profit MTD (before write-offs)" and "Last month Realized Profit (before write-offs)"; Today's Profit and Yesterday's Profit stay.
- New "All time" sub-section (owner request, second change): directly after Monthly forecast, with Net Profit and Principal Loss Recognized (lifetime); Principal Loss shows ฿0 when there is none.
- The last-month figure (Archie): `lastMonthRealizedProfit` in `GET /api/dashboard`, the V132 realized-profit rule (interest plus late charge paid, write-off loss pairs excluded) over the previous Bangkok month of `olap_reporting_date()`; read-only inline SQL under a savepoint, gated on the V130 predicate and the late-charge column, omitted on failure; no migration.
- Files: `services/business/dashboard.mjs` (`lastMonthRealizedProfit`, gated, under a savepoint); `apps/pwa/src/Dashboard.tsx` (KPI row and the All time section); `apps/pwa/src/live-style.css` (KPI figure alignment at every width); new `scripts/database/Test-LastMonthRealizedProfit.sql`; unit tests (`tests/unit/dashboard-read.test.mjs`, 5 new) and the Dashboard specs.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, live-dev build | Pass | `e6a17bcf` |
| Byte | `npm test` | 1,447 passed, 1 skipped, including 5 new Dashboard unit tests | `e6a17bcf` |
| Byte | specs: desktop 7; mobile-chromium 320 px 7; mobile-webkit 3 passed, 4 skipped | Pass | `e6a17bcf` |
| Byte | real SQL, `scripts/database/Test-LastMonthRealizedProfit.sql` on a disposable cluster at V155: the month boundary, the Bangkok 00:30 on the 1st edge, January to December, loss pairs excluded, and equality with the view under a shifted clock | 8/8 assertions pass | `e6a17bcf` |
| Chase | adversarial review: the inline SQL matches the V132 `rr`/`loss_pair` definition line by line; the savepoint is released on success and rolled back on failure, so the rest of `/api/dashboard` stays intact | Pass, no defects | `e6a17bcf` |
| Chase | real-SQL rerun with the canonical `Test-MigrationsCloud.py --sql ... --sql-only` as postgres, including the checksum-tamper step | 8/8 pass; tamper step passes | `e6a17bcf` |
| Echo | local-build visual check: iPhone and iPad, English and Thai, and the older API case (three KPIs) | OK; UXR187-DASH-01 (desktop label wrap misaligned the figures) fixed in `f0a86399`; UXR187-COPY-01 declined, the label is the owner's wording | `e6a17bcf` |
| Byte | after the alignment fix: lint, build; Dashboard specs desktop 4/4, mobile-chromium 320 px 4/4, mobile-webkit F11; typography test on desktop and tablet-webkit-portrait | Pass | `f0a86399` |
| CI | pull request `Development checks`, [run 45949024286](https://github.com/welct0407/MW-Credit-App/actions/runs/45949024286) (the one broad run on the head `157ff542`, merged as `e55efc50` with an equal tree) | Success, all 17 jobs first time | `157ff542` |
| Forge | PROD runner reused database evidence: run 45947820575 on `299e472e`, an input-equivalent run in which all four rebuild groups executed; nothing was dispatched | Reused | `299e472e` |
| Forge | DEV smoke: authenticated `GET /api/dashboard` on the command origin | 200, `lastMonthRealizedProfit` present as a numeric string (Chase's open point closed) | `e55efc50` |
| Dewey | `npm run check:docs` at closure | 0 failures, 0 warnings | – |

## Not run
- PROD authenticated `GET /api/dashboard`: no authenticated PROD read was made; the PROD grants were read back instead and match DEV (see the PROD record).
- Real iPhone and the iPhone Home Screen app; the PROD Dashboard is seen only after deployment (no authenticated PROD read is planned).
- Database migration groups: no migration or schema change.

## Recovery
Git baseline `ad890b9c` (R186 closed). A revert restores the previous KPI row; the image and Hosting pins will be in the Environment inventory at promotion. No SQL, no backup. An older service answers without the new field and the page then shows three KPIs.

## Open questions
- Owner acceptance of R187 in PROD, written into the next release's closure or product pull request.
- The Thai heading "ยอดสะสมทั้งหมด" is a draft for the owner's or Lisa's check.

- Thai wording: the "ยอดสะสมทั้งหมด" heading is a draft for the owner's or Lisa's check.

## Remaining work
The pull request and its Development checks, the merge, the DEV deploy (confirm `lastMonthRealizedProfit` in a real answer), the PROD promotion (Hosting plus the shared business service image), the R187 tag and the closure pull request.
Owner acceptance of R187 and the Thai heading check. Follow-ups: the first real PROD Dashboard view of the new KPI and the All time section; no real-iPhone check was made.

## DEV deployment record (Forge, 27 November 2026 UTC)
Authority: the owner's "push all the way to prod" (DEV first). Package: `main` `e55efc50a289b8f1b1c50f6c3ddec0abf729023e` (PR #392); its tree equals the tested head `157ff542`; CI run 45949024286 passed all 17 jobs. No SQL.

| Step | Result |
| --- | --- |
| Image | `mw-credit-app/api@sha256:824e5201308a97b0d0bacc4739e26961ae7e7905e1898feeed28451851fe9ffa`; Cloud Build `95e1fbd9`, 06:15:45Z to 06:16:21Z |
| Cloud Run | Plan 0 add, 3 change, 0 destroy, image only; applied 06:17:34Z to 06:18:10Z; re-plan clean. Revisions: read `00107-ffz`, command `00124-mhs`, chat `00076-2hg` |
| Hosting | Version `603945c00ccda057`, release `1795760358017000`, 06:19:10Z to 06:19:18Z; env file shredded |
| Verified | `/health` of all three services reports R187 `e55efc50`; unauthenticated requests get 401; all origins serve R187 with the commit in the entry; authenticated `GET /api/dashboard` on the command origin returned 200 with `lastMonthRealizedProfit` present as a numeric string; no ERROR, 42501 or 5xx in the logs |

Rollback: `dev.activation.before-r187.tfvars` (image `590e1ccf…`; read `00106-nsg`, command `00123-qgt`, chat `00075-4ts`) and Hosting `363385bde5f2284b`.

## PROD promotion record (Forge, 27 November 2026 UTC)
Authority: the owner, 27 November 2026: "push all the way to prod". Scope: PWA Hosting and the rebuilt shared business service image (read, command, chat); no SQL, backup, authenticated PROD read, financial write or notification.

Freeze (pinned here): package `main` `e55efc50a289b8f1b1c50f6c3ddec0abf729023e` (PR #392, tree equal to the tested head `157ff542`); baseline tag R186 `dab1f2bf`; next unused number R189. The runner reused database evidence from run 45947820575 on `299e472e`. Pre-apply read-back at 06:21:35Z: Flyway 155, 155 rows, 0 failed; grants unchanged (SELECT on all 10 columns and EXECUTE on both functions; the command login is a member of `mw_app_prod`), matching DEV, so DEV's field check stands for PROD. Package manifest (outside Git): `/root/.mw-private/MW-Credit-App/promotion/r187/promotion-package.json`, sha256 `2a4873fb44f5c70bf6e20b2ae1878a8fa2a8ab635a6bf1afc1b024813b0a12e8`, with a copy and the receipt in the operator-private bucket. Revisions, digests and the Hosting version are in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Image | `mw-credit-app-prod/api@sha256:d77b11c8c9a03eb8bc1055dbf69ec1cf6c0706d1baff038049e94b2eb811c843`; Cloud Build `e5175d4d`, 06:20:19Z to 06:20:45Z |
| Cloud Run | Plan 0 add, 3 change, 0 destroy, image only (plan sha `b55553cc…`); applied 06:22:35Z to 06:23:14Z; re-plan clean. Revisions: read `00073-lqn`, command `00078-crm`, chat `00057-fl4`; notify and jobs unchanged |
| Hosting | Runner `--check` 18 files; `--apply` 06:24:32Z to 06:25:16Z; version `d12cef58ba4c96a1`, release `1795760709542000` |
| Verified, read-only | All three origins serve R187 with the commit, `sw.js` no-store; `/health` reports R187 `e55efc50`; unauthenticated requests get 401; no ERROR, 42501 or response of 409 or higher from the five services between 06:19:53Z and 06:25:37Z; no authenticated PROD read, financial write or notification |

Rollback: `production.activation.before-r187.tfvars` (image `687dcfae…`; read `00072-v7c`, command `00077-wsf`, chat `00056-8c5`) and Hosting `cd6f19ef6c5c8985` (release `1795620244466000`). SQL unchanged.

## Tag record (Dewey, 27 November 2026)
Annotated tag `R187` (object `a9d344a17d1cf8bf836eec4294e88e758df4eadc`) on `main` `e55efc50a289b8f1b1c50f6c3ddec0abf729023e`, created by the Release tag workflow (dispatched at about 06:27Z; the coordinator confirmed the tag; the run number was not forwarded). The tag exists on origin.

## Closure records (Dewey)
- Component versions (`derive --release R187 --commit e55efc50`): changed in R187 are the PWA frontend and the API read, command and chat services; unchanged: notify and jobs (R175), database schema (R184, V155), integration agent (R181), Grafana dashboards (R180), Metabase reports (R144). `render --write` and `render --check` pass (R187).
- Drift (`component-versions.mjs drift --env all`, Forge, with the R187 tag present, 27 November 2026): exit 0, drift 0, unverified 4. Unverified because their facts were not read: the PROD agent, the Grafana dashboards, the Metabase reports and, this run, the Grafana version (the tool could not read it); R187 changes none of them. Everything else matches. Clean-up: the `r187-wt` worktree was removed, the tunnel closed and its key shredded; no env, token or dashboard-response files remain; the private package, receipt and drift files are kept.
- Environment inventory: the R187 Hosting and Cloud Run rows for DEV and PROD (the R186 Hosting rows and the R185 Cloud Run rows are now previous); Flyway rows unchanged (no SQL).
- Released wording: the R187 paragraphs of the Solution design, the read service notes, the PWA API dictionary and the data model overview say Released.
- Pruned at closure (Open R188 has no note, plus the three newest Released: R187, R186, R185): `Change Logs/CHANGE_NOTES_R184_PARTIAL_REBATE_SETTLEMENT_2026-11-24.md`, with its 13 inbound links repointed to permalinks at `e55efc50`, and `Change Logs/CHANGE_NOTES_EVOLUTION_TIMELINE_2026-11-12.md` (older than 14 days and linked by no current document), which clears that `check:docs` warning. Also deleted: the evidence directory `project/outputs/dictionary-r184-20261124/` (3 files), which nothing current cites any more by path after the R184 note went (`check:docs`); Git keeps it. R187's entry in Development Changes became its follow-up row.
