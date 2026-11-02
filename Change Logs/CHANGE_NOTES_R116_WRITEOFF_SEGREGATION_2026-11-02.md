# Change notes — R116 Principal write-off segregation, 2 November 2026

## Purpose
The owner asked to segregate principal write-offs from actual profit on the Dashboard page, show them in the income statement, exclude them from Realized MTD profit, and give Metabase the same visibility. Net profit becomes gross profit minus expenses minus write-offs. Built and tested in DEV first; promotion only under a later owner instruction.

## Changes
Outcomes (owner request, 2 November 2026):
1. Dashboard: principal write-offs are shown separately from actual profit.
2. Income statement: write-offs appear as their own line.
3. Realized MTD profit excludes write-offs.
4. Metabase: the same segregation is visible.
5. Net profit = gross profit - expenses - write-offs.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (UX and tests), Forge (infrastructure impact).

Design decisions (Archie, accepted):
- Principal write-off = sum of `"Principal Paid"` of the `df10:` loss-pair repayments, recognised on their Payment Date. From V130 the test is the shared predicate (a `df10:` row or any zero-cash loss pair; see below).
- Gross profit = sum of `"Interest Paid"` of repayments that are not write-offs. It is the same figure as today's "Operating Income MTD", which is relabelled "Gross Profit MTD".
- Net profit = gross profit - expenses - write-offs. Its value is unchanged, because a loss pair carries interest -amount and principal +amount.
- Realized, Today's, Yesterday's and Total Profit become gross (write-offs not counted). The Dashboard label is "Realized Profit MTD (before write-offs)".
- Unsettled Profit MTD, the partner shares and the cash reconciliation are unchanged.
- History restates automatically: past months' gross profit rises by the write-off and net profit is unchanged.
- The "Daily Analytics" snapshot trends are left as they are (out of scope).

Build (Byte):
- SQL V128 is views and functions only: no new table, column, view or grant. It appends write-off columns to `"Cash Dashboard"`, `olap_portfolio_summary`, `reporting_income_statement`, `reporting_income_statement_monthly`, `reporting_income_statement_daily` and `reporting_income_events`.
- Services `services/business/*.mjs`, the three PWA pages, `scripts/database/Test-WriteOffSegregation.sql`.
- Metabase models stay pass-through. A new targeted refine and verify script in `project/scripts/metabase/` adds a write-off scalar and a waterfall step; it runs only at PROD promotion.

Infrastructure (Forge): no infrastructure impact.

Deviations and details recorded by Byte (commit 3351c7c):
- Waterfall 204 ends at Net profit: Income, Expenses, Write-offs, then the Net profit total.
- Unsettled Profit MTD falls by the write-off as before. Business Cash Held and Cash Reconciliation are unchanged (no cash moves).
- `Test-LongOverdue.sql` and the default-loss column checks (V114, V120) are pinned to fixed column positions, because V128 appends a column to `olap_portfolio_summary`.
- The API reads "Principal Write-offs MTD" by name: omitted before V128, a non-numeric value is refused.
- The write-off column is a positive amount in all six views; Net Margin = net / gross; the view comments are unchanged.
- Dictionary: the six view definitions, appended columns and dependencies were read from a disposable PostgreSQL chain at V128, not from a PROD capture; a targeted PROD capture follows the promotion.

Images affected: read, command and chat, and Hosting. Notify and jobs stay as they are.

Scope from the other session's pull request (merged into this branch in 7b4dae4): Cash Ledger Recent sorts by date and time and shows borrower names (PR #216; [change note](CHANGE_NOTES_R116_CASH_LEDGER_SORT_2026-11-03.md)). The offline tag is now `business-offline-v6`, so phones rebuild their offline data once.

DEV findings and follow-up (V129, commit 95fc8a0):
- Chase's mismatch: two legacy DEV loans carry a Default Loss Amount of 6,000 between them, with no `df10:` pair. "Total Principal Loss" is 13,000 against a ledger figure of 7,000, so Total Profit - Total Business Expenses - write-offs did not equal Net Profit in Management Analytics.
- V129 (views only) appends "Principal Write-offs" (46th and last column) to `olap_portfolio_summary`: the lifetime ledger sum of `df10:` principal, undated pairs included. It is exactly what "Net Profit" subtracts. "Total Principal Loss" is unchanged. Analytics reads the new column (omitted when absent, no fallback to "Total Principal Loss"). The Dashboard "Principal Loss Recognized" is still the loan-level 13,000.
- Echo DSH-4b: the Expenses MTD sign. Fixed in 95fc8a0: the Dashboard and Cash pages negate the "Cash Dashboard" value, so Expenses MTD shows as a positive cost and a net-refund month shows a minus.
- Echo also found ANL-6 in the DEV smoke. It is the same issue as Chase's mismatch, fixed by V129 plus the Management Analytics change in 95fc8a0; Chase accepted it with no defects.
- Owner decision (2 November 2026), recorded and then superseded by a finding: reconcile the two legacy defaulted loans (ids `5l6eAKGu...` and `9uwkywNb...` only; 5,000 dated 26 August and 1,000 dated 28 August, the same in DEV and PROD) with dated `df10:` postings on each loan's Close Date, and refresh Daily Analytics from that date. Byte built that reconciliation as V130 (04d3a54).
- Finding (Chase and Forge, read-only in DEV and PROD): both loans already have loss pairs dated on their Close Dates (5,000 on 26 August and 1,000 on 28 August), under random Row IDs rather than `df10:`. They are the only such rows and together are exactly the 6,000 gap. Posting new pairs would have double-counted, so the reconciliation was reverted in 73b58de before it was ever pushed or applied. The owner's intent (dated write-off postings) is already met by the existing ledger: no data change, no Daily Analytics refresh, no partner or Cash Reconciliation effect. The owner is informed.
- New V130 (Byte, cb398ec) is views only. It adds the shared predicate `public.is_principal_writeoff`: a row counts as a write-off if it is a `df10:` row, or if all of these hold: a zero-cash loss pair (no Ref Payment, principal X and interest -X); its charge has Principal Due X and Interest Due -X; the charge is not `lc7:` or `ls2:`; the charge has exactly one repayment. It replaces the `df10:` test in `"Cash Dashboard"`, `olap_portfolio_summary` (including the V129 lifetime column), `reporting_income_monthly`, `reporting_income_daily` and `reporting_income_events`; `reporting_income_statement` passes through. No new columns; net values are unchanged. Effect: August gross +6,000 and write-offs 6,000; lifetime "Principal Write-offs" then equals "Total Principal Loss" (DEV 13,000, PROD 17,000). `Refine-WriteOffSegregation.mjs --verify` uses the same predicate.
- Follow-up, unchanged in R116: the `df10:`-only guards (`undo_loan_default`, `default_posting_guard`, `default_loan_transition` and the schedule exclusions) still key on `df10:`; a later release can move them onto the predicate.
- The first DEV deployment stopped at V128; the second DEV deployment (pinned to 515c1bb) applied V129 and V130, the images and Hosting.

Files and objects: `database/migrations/V128__principal_writeoff_segregation.sql`; `services/business/cash.mjs`, `management-analytics.mjs`; `services/chat/assets/schema-digest.json`, `conversation-business-rules.md`; `apps/pwa/src/Dashboard.tsx`, `CashWorkspace.tsx`, `ManagementAnalytics.tsx`, `live-style.css`; `project/scripts/metabase/Refine-WriteOffSegregation.mjs`, `WriteOffSegregation.mjs`, `ProposedLoanReports.mjs`, `StatementCleanup.mjs`, `live-income-period.sql`; tests `scripts/database/Test-WriteOffSegregation.sql`, `Test-StatementBatch.sql`, `Test-LongOverdue.sql`, `tests/unit/principal-writeoffs-read.test.mjs`, `tests/integration/default-loss-independent.test.mjs`. Records: this note, `Release_Tracker.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `project/scripts/metabase/README.md` and six `Data Dictionary` relation files with `index.json`.

## Checks
| Command | Result |
| --- | --- |
| `npx biome lint` | Pass at 84b516c (Byte) |
| Typecheck | Pass at 84b516c (Byte) |
| `npm test` | 1102 of 1103 pass at 84b516c, 1 skipped (needs a DB port) (Byte) |
| `Test-MigrationsCloud --sql-only` | Pass at 84b516c, including `Test-WriteOffSegregation.sql` and Chase's `Test-WriteOffSegregationEdges.sql` (now in `Test-StatementBatch`) (Byte) |
| Adversarial diff review at 38395b9 | No blocking findings; the edge SQL suite passes (Chase) |
| e2e "Page7 Dashboard source formats" and the R102/R109 Dashboard tests, desktop-chromium, at 38395b9 | Pass (Chase) |
| Local UI check at 390x844, EN and TH, present, zero and absent states, at 38395b9 | Pass; ANL-4 and DSH-6 were fixed in 84b516c (Echo) |
| `npx biome lint` and typecheck at 95fc8a0 | Pass (Byte) |
| `npm test` at 95fc8a0 | 1102 of 1103 pass, 1 skipped (Byte) |
| Chat schema digest test at V129 | 4 of 4 pass (Byte) |
| `Test-MigrationsCloud --sql-only` through V129 | Pass (Byte) |
| DEV deploy of V128, images and Hosting | Done (Forge); see the [DEV deployment record](#dev-deployment-record) |
| Second DEV deploy of V129, V130, images and Hosting, pinned to 515c1bb | Done (Forge); see the [second DEV deployment](#second-dev-deployment-v129-v130-pr-216) |
| Review of V130 at cb398ec | Accepted; the reader-only role test `Test-WriteOffPredicateReaders.sql` passed on a disposable database (Chase) |
| CI on 515c1bb | Development checks run 41522489884 green |
| Final DEV UI pass at 390x844 | No findings (Echo): DSH-4b 151 baht shown red; lifetime 428,386 - 7,191 - 13,000 = 408,195; PR #216 order; names in EN and TH; paging |
| Review of 95fc8a0 | Accepted with no defects; the Dashboard and borrower e2e tests pass, 4 tests on desktop-chromium (Chase) |
| `npx biome lint` and typecheck at cb398ec | Pass (Byte) |
| `npm test` at cb398ec | 1106 of 1107 pass (Byte) |
| Python unittest at cb398ec | OK (Byte) |
| Statement batch through V130, and the pre-V9 `Test-WriteOffLegacyPair` upgrade test | Pass at cb398ec (Byte) |
| `npx biome lint`, typecheck and the focused unit tests `cash-ledger-list` and `principal-writeoffs-read` after the merge at 7b4dae4 | Pass, 9 of 9 tests (orchestrator) |
| DEV smoke, API reads | Pass; the legacy-loan mismatch above found (Chase) |
| DEV smoke, UI at 390x844 | Pass; DSH-4b and ANL-6 found (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
- The wide Playwright suite and the mobile project: left to the pull request's CI.
- Live Metabase (refine, rebaseline and verify runs) and the PROD dictionary capture: they belong to the promotion step (Metabase reads PROD only).

Chase info finding: an undated `df10:` pair counts in lifetime portfolio net but not in the dated views. This is unchanged from before V128, and no such rows are known.

## Recovery
Git baseline: `main` 80fbf6b (branch `claude/r116-writeoff-segregation`). V128 is views only; a later migration restores the V127 bodies (the appended columns stay, unused). Metabase: restore the private baseline written by `Refine-WriteOffSegregation.mjs --prepare` and archive the new question.

## Open questions
None. The owner decided on 2 November 2026 (see Changes).

## Remaining work
The PROD promotion, only on the owner's instruction, in this order:
1. A verified restorable backup.
2. V128 to V130 (views only).
3. The read, command and chat images, and Hosting.
4. Metabase: `Refine-WriteOffSegregation.mjs --prepare`, then `--apply`.
5. `ProposedLoanReports.mjs --rebaseline-dashboard3=R116`, then `--refine --only=income.writeoffs,income.vs-previous,income.monthly,income`.
6. Both `--verify` runs.
7. The PROD dictionary capture (targeted).

Follow-ups for a later release: the reconcile-skip comment in the predicate, and moving the `df10:`-only guards (`undo_loan_default`, `default_posting_guard`, `default_loan_transition`, the schedule exclusions) onto the predicate.

Pointer: the observation at the end of the first DEV record below (13,000 against 7,000) is resolved by V130 (see Changes) and the [second DEV deployment](#second-dev-deployment-v129-v130-pr-216).

## DEV deployment record
Forge, 2 November 2026, UTC. Owner instruction: "deploy to dev and test it". DEV only: no PROD action, no Metabase action (Metabase reads `loan_manager_prod` only), the agent VM used only as the database tunnel.

| Step | Result |
| --- | --- |
| Source | `70179b0` (PR #215 head, branch `claude/r116-writeoff-segregation`). Development checks run 41500039224 passed. Clean checkout for the migration and Hosting; the image from a `git archive` of the same commit. No release manifest on the branch: it is written at freeze, as in R115 |
| Target check | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, `loan_manager_dev` at head 127 (127 rows, 0 failed), no other sessions, reporting date 2026-11-03; services `mw-credit-app-{read,command,chat,notify,jobs}-dev` on `00062-lz7`, `00079-vwg`, `00031-5h5`, `00027-2xq`, `00027-x99`. The six V128 views are owned by `postgres` (the runner) |
| `df10:` write-offs in DEV | 2026-10: 2 rows, principal 4,000.00; 2026-11 (current month): 1 row, principal 3,000.00; 3 in all, 7,000.00. The current month already has a write-off, so the MTD split is exercised without a fixture |
| Backup at V127, observed 18:34:36Z | Dump sha256 `ba4f06bc80a404593b30d129bc0e54b9c37453b70598cd85d973ffe6958d2d73`; archive listing and restore passed; 38 table fingerprints match; `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-5da72a1a36c54d7a9333fa8193b96b42/` |
| Owner window | 5 owners (`mw_chat_owner_dev`, `mw_notify_owner_dev`, `mw_jobs_owner_dev`, `mw_changes_owner_dev`, `mw_app_dev_journal_owner`), 20 statements, opened 18:37:56Z, restored 18:45:56Z (state `owner-authority-dev-prepare-c7810b45-fb0b-4a29-b71f-2bfef1475c51`); readback: inherit, set and admin false and no CREATE on `public` for all five |
| V128 | `Invoke-Flyway.ps1 -Environment development -Command migrate` (Flyway 13.6.0): installed 18:38:34Z (4.2 s, checksum 1813462493, self-check passed), head 128 (128 rows, 0 failed); post-migrate role reconcile 540 statements, 0 violations |
| Readback | Owners and ACLs of the six views identical to before V128 (`reporting_income_events` keeps `metabase_borrower_reader`); the write-off column is the last column of each. Net figures unchanged: "Cash Dashboard" and statement "Net Profit MTD" 10,209.00, "Unsettled Profit MTD" 10,209.00, portfolio "Net Profit" 408,195 and "Net Profit MTD" 10,209, monthly "Net Profit" 84,230 / 190,402 / 123,354 / 10,209 (Aug to Nov), daily net sum 408,195. Gross rises by the write-offs: "Operating Income MTD" and "Realized Profit MTD" 10,360 to 13,360, October "Operating Income" 127,514 to 131,514, "Total Profit" and the events "Income" sum 415,386 to 422,386; "Principal Write-offs MTD" 3,000 and monthly 4,000 (Oct) and 3,000 (Nov), daily and events sum 7,000 on 3 event rows. 13,360 - 151 - 3,000 = 10,209. "Projected Monthly Profit" follows the gross Realized MTD (385,054 to 388,054); "Total Principal Loss" 13,000 and "Total Unsettled Profit" 73,876 unchanged |
| Image | Cloud Build `d8b752c5-894d-4368-bc1a-633786de001d` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 18:47:35Z to 18:48:41Z, `api@sha256:ed583f03a389aa4e14588025a0f2a1d9592fe88507becd62d696d598f6a1c635`; read, command and chat (no file under `services/jobs`, `notifications` or `workers` imports the changed modules) |
| Terraform DEV | Plan 0 add, 3 change, 0 destroy (only the container image of `mw-credit-app-{read,command,chat}-dev`), plan sha256 `1faf7886…e1a`; applied 18:51:15Z to 18:51:43Z; re-plan no changes; settings generation `1793645472408937` (previous `1793638174711177`); read `00063-pdj`, command `00080-48v`, chat `00032-lnx`, 100% traffic; notify `00027-2xq` and jobs `00027-x99` stay on `87bfaa6f…` (R113). V128 rebuilds the chat schema digest, so each chat thread starts a new history epoch on its next turn |
| Smoke | `/health` 200 on read, command and chat; unauthenticated `/api/collection`, `/api/session` (read and command), `/api/chat/models` and `/api/chat/threads` 401; preflight 204; no ERROR logs on read, command or chat from 18:51Z to 18:53Z. Signed in as `claude-dev-test` (command service): `/api/dashboard` `incomeMtd` operating income 13,360.00, expenses -151.00, write-offs 3,000.00, net 10,209.00, `forecast.realizedProfitMtd` 13,360; `/api/cash-overview` the same four figures; `/api/management/analytics-overview` `realizedProfitMtd` 13,360, `principalWriteOffsMtd` 3,000, `netProfitMtd` 10,209, `netProfit` 408,195, `principalWriteOffs` 13,000 |
| Hosting | Bundle settings proven identical to R115: a rebuild of `4acea34` with them reproduced the live R115 entry `/assets/index-1rryC85o.js` and version `444cd917bce7f506ffbe6911`. `npm run build:live-dev` with `MW_RELEASE_NUMBER` unset (labelled R116 from the tracker); env file deleted; `--check` passed; deployed 18:55:31Z to 18:55:39Z; version `bcf65331ac692da4`, release `1793645739145000`; build-version R116 `c47a79aa1d166b57591c7c82`, entry `/assets/index-y31VljdK.js` embeds `70179b0`, on both origins, `no-store` |

Rollback: settings generation `1793638174711177` (R115 images) together with Hosting `a1808fdee4245541`; V128 is views only (a later migration restores the V127 bodies), and the backup above is the restore point.

Observation (not a deploy finding): "Total Principal Loss" and the analytics `principalWriteOffs` read 13,000 while the dated `df10:` postings sum to 7,000; both are unchanged by V128 (Chase's undated `df10:` note above is one possible source).

DEV left in place: no smoke row; the synthetic DEV write-off check, if any, is Chase's.

### Second DEV deployment (V129, V130, PR #216)
Forge, 2 November 2026, UTC. Same owner instruction; DEV only, no PROD or Metabase action. The 6,000 gap noted above is closed by V130: the two legacy loans already carried dated, zero-cash loss pairs under random Row IDs (2026-08-26, 5,000; 2026-08-28, 1,000), which the predicate now classifies as write-offs. No data was written.

| Step | Result |
| --- | --- |
| Source | `515c1bb` (PR #215 head, includes the merged PR #216). Development checks run 41522489884 passed. Clean checkout for the migrations and Hosting; the image from a `git archive` of the same commit |
| Target check | `loan_manager_dev` at head 128 (128 rows, 0 failed); a transient other session closed before the start; services on read `00063-pdj`, command `00080-48v`, chat `00032-lnx` (`ed583f03…`), notify `00027-2xq` and jobs `00027-x99` (`87bfaa6f…`). The import graph of `services/workers/server.mjs` (24 files) reaches none of the five changed service files, so the workers stay |
| Backup at V128, observed 20:59:13Z | Dump sha256 `3c4f01591c69f3ac0617b8ae1bb266c80ca2c89ed21d878338b1aaf8e85db6ad`; archive listing and restore passed; 38 table fingerprints match; `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-d701f4f87b904cb5a7f0011a6cf40fa3/` |
| Owner window | The same 5 owners, 20 statements, opened 21:02:22Z, restored 21:10:32Z (state `owner-authority-dev-prepare-6e948dfc-7947-4151-adaa-673f6e645828`); readback: inherit, set and admin false and no CREATE on `public` for all five |
| V129, V130 | One `Invoke-Flyway.ps1 -Environment development -Command migrate` run: V129 installed 21:02:57Z (2.9 s, checksum -1649282923), V130 21:03:04Z (4.9 s, checksum -1157115539), both self-checks passed; head 130 (130 rows, 0 failed); post-migrate role reconcile 542 statements, 0 violations |
| Readback | Owners and ACLs of the eight affected or read views (the six income relations, `olap_repayments_analytics`, `olap_charges_analytics`) identical to before; `reporting_income_events` keeps `metabase_borrower_reader`, which can execute the predicate. Net unchanged: net MTD 10,209.00, unsettled 10,209.00, lifetime net 408,195, monthly net 84,230 / 190,402 / 123,354 / 10,209, daily net sum 408,195. August gross 84,230 to 90,230 and August write-offs 0 to 6,000; October 4,000 and November 3,000 unchanged; November MTD gross 13,360 and write-offs 3,000 unchanged. Lifetime: the new portfolio "Principal Write-offs" 13,000 = "Total Principal Loss" 13,000; daily and events write-offs 13,000 on 5 event rows; lifetime gross 422,386 to 428,386; "Projected Monthly Profit" 388,054 unchanged |
| Known DEV/PROD ACL difference | `public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)` on DEV is `{=X/postgres,postgres=X/postgres,mw_app_dev=X/postgres}`: V130 leaves PUBLIC as the only grantee (its self-check passed), and the DEV-only post-migrate reconcile then added `GRANT EXECUTE … TO mw_app_dev` (the two extra reconcile statements). Harmless, since PUBLIC holds EXECUTE; PROD, which has no reconcile, keeps PUBLIC only. Accepted as is (V123 precedent); optional follow-up for a later release: the reconcile-skip governance comment on the predicate. No V131 in R116 |
| Image | Cloud Build `1b394926-af67-4520-bb04-ce79d748ed98` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 21:12:31Z to 21:13:10Z, `api@sha256:de6d98fb0d5199326080892c7a8cded8d1abbdf0d8188ecc31d87d0c97076c2b` |
| Terraform DEV | Plan 0 add, 3 change, 0 destroy (only the container image of `mw-credit-app-{read,command,chat}-dev`), plan sha256 `b4c2fc13…b3b3`; applied 21:14:39Z to 21:15:16Z; re-plan no changes; settings generation `1793654076334233` (previous `1793645472408937`); read `00064-nnr`, command `00081-b7g`, chat `00033-kc4`, 100% traffic; notify and jobs unchanged on `87bfaa6f…` |
| Hosting | Bundle settings taken from the live R116 bundle (the set proven in the first deployment); `npm run build:live-dev` labelled R116; env file deleted; `--check` passed; deployed 21:16:26Z to 21:16:32Z; version `b2dadbdb13ce8d4f`, release `1793654192329000`; build-version R116 `b8ee1e1179d2ebf2803b2183`, entry `/assets/index-VHPuQGpl.js` embeds `515c1bb`, on both origins, `no-store`; the offline delta hash tag is `business-offline-v6` |
| Smoke | `/health` 200 on read, command and chat; unauthenticated `/api/collection`, `/api/session` (read and command), `/api/chat/models` and `/api/chat/threads` 401; preflight 204; no ERROR logs on read, command or chat from 21:14:30Z to 21:17:37Z. Signed in as `claude-dev-test`: `/api/dashboard` and `/api/cash-overview` income 13,360.00, expenses -151.00, write-offs 3,000.00, net 10,209.00, Realized MTD 13,360; `/api/management/analytics-overview` `principalWriteOffsMtd` 3,000, `principalWriteOffs` 13,000 (now equal to the ledger), `expensesMtd` 151, `netProfitMtd` 10,209, `netProfit` 408,195. PR #216, `/api/management/cash-movements?limit=20`: three pages of 20 through the v2 cursor (Next works, no repeated row), 0 order violations by Movement Date then Created At descending across 58 same-date neighbours, and all 60 borrower rows (41 payment receipts, loan disbursements, rebate expenses) carry a borrower name |

Rollback: settings generation `1793645472408937` (the first R116 images) together with Hosting `bcf65331ac692da4`; V129 and V130 are views and a pure function only, and the V128 backup above is the restore point.

PROD promotion note (read-only catalog check of `loan_manager_prod`): `metabase_borrower_reader` holds SELECT on `olap_repayments_analytics` and `olap_charges_analytics` (every column `Refine-WriteOffSegregation.mjs --verify` reads, including "Ref Payment", "Ref Charges", "Principal Due" and "Interest Due"), and on `"Cash Dashboard"`, `reporting_income_events` and `reporting_statement_calendar`. Verify also calls `public.is_principal_writeoff`, which exists only once V130 is on PROD (PUBLIC EXECUTE), so the Metabase refine and verify follow V128 to V130.
