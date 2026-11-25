# Change notes — R186 Dashboard KPIs and receipt status text, 25 November 2026

## Purpose
Owner request of 25 November 2026 (verbatim, as typed): "Make following new changes: 1. In Dashboard KPIs, remove the first number "Pending Payment Amount", just keep the remaining 4 2. When automatically processing uploaded receipts for payment or close, make the status text more prominent. Let Echo review these changes, so me how to be look like". Three PWA changes: the Dashboard KPI group loses its first figure, "Pending Payment Amount", and keeps the other four; and the status text shown while an uploaded receipt is processed automatically for a payment or a loan close becomes more prominent. and, in a third request the same day with a PROD iPhone screenshot of the Dashboard (verbatim): "Also move "Available Cash Pool" next to total cash pool in iPhone's view". The owner thereby overrides the R185 UXR-DASH-01 choice, which kept "Total Cash Pool" and "Available Cash Pool" on full-width rows on phones: on iPhone the two now share one row. Tablet and desktop are unchanged. Echo reviews the changes and shows the owner a before and after. Status: Released to DEV and PROD on 25 November 2026 (PWA Hosting only; PR #390, package `dab1f2bf`; tag `R186`); owner acceptance pending.

Production instruction: the owner, 25 November 2026 (Asia/Bangkok), after seeing Echo's before and after: "Push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set: PWA Hosting only (the Dashboard change is display-only and the API is unchanged); no service image, no SQL, no backup. The owner's acceptance of the look is given by this instruction.

Authority: a frontend batch; no new table or column and no financial write is planned. The database column `"Pending Payment Amount"` of the OLAP summary and the chat's business rules are not part of this request and stay as they are.

Team: Byte (implementation), Echo (visual review, before and after for the owner), Chase (verification), Dewey (records). Archie: not applicable (no design question beyond Echo's review). Forge: applicable for the deployment only (DEV and PROD Hosting).

## Changes
Baseline `c75f3148` (`main`, R185 closed) on branch `claude/jolly-brahmagupta-csy64t`. Scope:
- Dashboard: remove "Pending Payment Amount" from the first KPI group; the remaining four KPIs keep their order and layout.
- Dashboard on iPhone (owner override of R185 UXR-DASH-01): "Total Cash Pool" and "Available Cash Pool" share one row on phones; tablet (768 px and wider) and desktop keep their current layout.
- Receipt processing: the status text of the automatic receipt flow for a payment or a loan close is a prominent status element with a tone (info, success, warning, neutral); the R142-UX-05 and R142-UX-08 contract of the status element is kept.
- Files: new `apps/pwa/src/ReceiptStatus.tsx`; `ReferrerRecords.tsx` (rows stay enabled while the list refreshes, a CI fix); `receiptTone` in `recognition-timing.ts`; the `.receipt-status[data-tone]` rules in `live-style.css`; the Dashboard edits (`Dashboard.tsx` and its CSS). Echo's two refinements (`14b31fa4`): UXR186-DASH-01, the cash-pool figures were 18 px below 400 px (CI then required 20 px or more, so they are 21 px down to 360 px); UXR186-DASH-02, the figures are aligned along the bottom.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, live-dev build | Pass | `875af188` |
| Byte | `npm test` | 1,444 passed, 1 skipped | `875af188` |
| Byte | targeted specs: desktop-chromium 24 passed; mobile-webkit 20 passed, 4 skipped; mobile-chromium (320 px) 4 passed | Pass | `875af188` |
| Byte | Echo's two refinements: lint, type check, build; Dashboard specs on mobile-chromium 320 px 4/4 and mobile-webkit F11 | Pass | `14b31fa4` |
| Chase | adversarial review: the status element keeps the R142-UX-05/08 contract, the tone mapping covers every stage and phase, no command logic changed, the KPI removal is clean | Pass, no defects | `875af188` |
| Chase | `receipt-recognition-independent` and `unified-receiving-independent` on mobile-webkit | 28 passed | `875af188` |
| Echo | local-build visual check, `c75f3148` (before) against `875af188` (after) | All three changes OK; findings UXR186-DASH-01 and -02, both fixed in `14b31fa4`; 14 before and after images shown to the owner on a private review page (not in Git) | `875af188`, `14b31fa4` |
| CI | pull request `Development checks`, [run 45637656779](https://github.com/welct0407/MW-Credit-App/actions/runs/45637656779) | 6 shards failed from 2 causes, both fixed in the product: (1) the typography rule `back-consumers-independent:324` (Dashboard values at least 20 px at 390 px): UXR186-DASH-01 had made the cash-pool figures 18 px below 400 px; now 21 px down to 360 px and 18 px only below 360 px (measured: a seven-digit value, -฿1,250,000, needs 21 px from 358 px and 20 px from 346 px); (2) `referrers-independent:106` on mobile-webkit, the same race as R185's Expenses Clear filter (the list refreshed 2 ms before the tap and its rows were disabled while busy, so the tap was dropped); it passes 10/10 locally at both `c75f3148` and R186, so R186 did not cause it; `ReferrerRecords.tsx` rows are no longer disabled while the list refreshes, since opening a referrer already overrides the refresh | `ee68cda7` |
| Byte | after the two fixes: Dashboard specs on mobile-chromium 320 px 4/4 and mobile-webkit F11; referrers spec on mobile-webkit x3 33 passed and on desktop 11 passed; lint, type check, build | Pass | – |
| CI | pull request `Development checks`, [run 45640886337](https://github.com/welct0407/MW-Credit-App/actions/runs/45640886337) (the one broad run on the head `95c48be0`, merged as `dab1f2bf` with an equal tree) | Success, all 17 jobs | `95c48be0` |
| Forge | PROD runner reused evidence: Terraform run 44874582128 and database run 45506845022 | Reused (no `infrastructure/**` or SQL change) | – |
| Dewey | `npm run check:docs` at closure | 0 failures, 0 warnings | – |

## Not run
- Real iPhone and the iPhone Home Screen app; the PROD Dashboard and a real receipt flow are seen only after deployment (no authenticated PROD read is planned).
- Database groups: no SQL or service input changed.

Known flaky tests, passed on retry in run 45637656779 and outside R186: `back-consumers-independent.spec.ts:209` (offline loan draft), `collection-chat-seen-sync:74`, `rebate-offset:116` and `collection-read.spec.ts:228` (already known).

## Recovery
Git baseline `c75f3148` (R185 closed). A Hosting-only revert (redeploy the previous Hosting version, pinned in the Environment inventory at promotion) restores the previous behaviour. No SQL, no backup, no service image.

## Open questions
- Owner acceptance of R186 in PROD, written into the next release's closure or product pull request. The look itself was accepted by the owner before promotion.

## Remaining work
The pull request and its Development checks, the merge, the DEV deploy, the PROD promotion (Hosting only), the R186 tag and the closure pull request, then owner acceptance in PROD.

## DEV deployment record (Forge, 25 November 2026 UTC)
Authority: the owner's "Push all the way to prod" (DEV first). Package: `main` `dab1f2bf224c0e4e757eba0089006d1ce7a160df` (PR #390); its tree equals the tested head `95c48be0`; CI run 45640886337 passed all 17 jobs. Hosting only (`scope: "frontend-only"`: the diff since R185 touches only `apps/pwa`, `tests` and Markdown files); the services stay on R185 `fc7c451`. No SQL.

| Step | Result |
| --- | --- |
| Build and deploy | Web build 15:20:20Z to 15:20:31Z (env file shredded afterwards); `--check` 17 files; deployed 15:20:36Z to 15:20:48Z: Hosting `363385bde5f2284b`, release `1795620047538000` |
| Verified | All three DEV origins serve R186 (index and entry 200, the entry contains `dab1f2b`, `sw.js` no-store). Signed-in browser check as the DEV test account (Chromium, write-guard probe blocked, no writes): the Dashboard KPIs show no "Pending Payment Amount" in English or in Thai (`ยอดรอรับชำระ`), and About shows R186 `dab1f2b` |

Rollback: Hosting back to `74b5946fad92ead6`.

## PROD promotion record (Forge, 25 November 2026 UTC)
Authority: the owner, 25 November 2026: "Push all the way to prod". Scope: PWA Hosting only; no service image, SQL, backup, authenticated PROD read, financial write or notification.

Freeze (pinned here): package `main` `dab1f2bf224c0e4e757eba0089006d1ce7a160df` (PR #390, tree equal to the tested head `95c48be0`); baseline tag R185 `fc7c4515`; next unused number R188. The runner reused evidence: Terraform run 44874582128 and database run 45506845022. No SQL: Flyway 155 with 155 history rows and 0 failed, read back read-only at 15:22:47Z. Package manifest (outside Git): `/root/.mw-private/MW-Credit-App/promotion/r186/promotion-package.json`, sha256 `3b74652bc600818507da8e1001030bdd7b7b29c43a2c2fb4ff6481a11d78524c`, with copies in the operator-private bucket; Hosting receipt `promotion-receipts/r186-hosting-receipt.json`. The Hosting version is in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Hosting | The generic runner `--check` passed with 18 files; `--apply` 15:23:33Z to 15:24:12Z: version `cd6f19ef6c5c8985`, release `1795620244466000`, public version `9c71873c…` |
| Verified, read-only (15:24Z) | All three PROD origins serve R186 (the entry contains `dab1f2b`, `sw.js` no-store); `/health` of read, command and chat still reports R185 `fc7c451`; requests without a token get 401; no ERROR, 42501 or response of 409 or higher from the five services between 15:21:40Z and 15:24:33Z; no authenticated PROD read, financial write or notification |

Rollback: Hosting back to `dde9a59785592cb7` (release `1795567692041000`). The services were not changed.

## Tag record (Dewey, 25 November 2026)
Annotated tag `R186` (object `4b8d583cb89323549c12e08011e62777bc35222e`) on `main` `dab1f2bf224c0e4e757eba0089006d1ce7a160df`, created by the Release tag workflow, run [45644940181](https://github.com/welct0407/MW-Credit-App/actions/runs/45644940181) (started 15:25:09Z). The tag exists on origin.

## Closure records (Dewey)
- Component versions (`derive --release R186 --commit dab1f2bf`): changed in R186 is the PWA frontend only; unchanged: the read, command and chat services (R185), notify and jobs (R175), database schema (R184, V155), integration agent (R181), Grafana dashboards (R180), Metabase reports (R144). `render --write` and `render --check` pass (R186).
- Drift (`component-versions.mjs drift --env all --observed`, Forge, with the R186 tag present, 25 November 2026): exit 0, drift 0, unverified 3. Everything else matches: the PWA on R186 `dab1f2bf`, the read, command and chat services on R185, notify and jobs on R175, schema 155. Unverified because their credentialed facts were not read: the PROD agent, the Grafana dashboards and the Metabase reports; R186 changes none of them. The observed facts are in the private R186 promotion folder and bucket. Clean-up: the `r186-wt` worktree was removed, no env or token files remain, and the tunnel is closed with its key shredded.
- Environment inventory: the R186 Hosting rows for DEV and PROD (the R185 rows are now previous); the Cloud Run and Flyway rows are unchanged (services on R185, no SQL).
- Solution design: an R186 paragraph.
- Pruned at closure (Open R187 has no note, plus the three newest Released: R186, R185, R184): `Change Logs/CHANGE_NOTES_R183_OVERDUE_ORDER_2026-11-23.md`, with its links (release tracker, Development Changes, environment inventory, Solution design) repointed to permalinks at `dab1f2bf`. R186's entry in Development Changes became its follow-up row.
