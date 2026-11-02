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
- Principal write-off = sum of `"Principal Paid"` of the `df10:` loss-pair repayments, recognised on their Payment Date.
- Gross profit = sum of `"Interest Paid"` of non-`df10:` repayments. It is the same figure as today's "Operating Income MTD", which is relabelled "Gross Profit MTD".
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

Scope placeholders from the other session's pull request (not yet numbered; it has its own change note, `CHANGE_NOTES_R116_CASH_LEDGER_SORT_2026-11-03.md`):
- Cash Ledger Recent sorts by date and time (PR #TBD).
- Cash Ledger Recent shows borrower names (PR #TBD).

DEV findings and follow-up (V129, commit 95fc8a0):
- Chase's mismatch: two legacy DEV loans carry a Default Loss Amount of 6,000 between them, with no `df10:` pair. "Total Principal Loss" is 13,000 against a ledger figure of 7,000, so Total Profit - Total Business Expenses - write-offs did not equal Net Profit in Management Analytics.
- V129 (views only) appends "Principal Write-offs" (46th and last column) to `olap_portfolio_summary`: the lifetime ledger sum of `df10:` principal, undated pairs included. It is exactly what "Net Profit" subtracts. "Total Principal Loss" is unchanged. Analytics reads the new column (omitted when absent, no fallback to "Total Principal Loss"). The Dashboard "Principal Loss Recognized" is still the loan-level 13,000.
- Echo DSH-4b: the Expenses MTD sign. Fixed in 95fc8a0: the Dashboard and Cash pages negate the "Cash Dashboard" value, so Expenses MTD shows as a positive cost and a net-refund month shows a minus.
- Echo also found ANL-6 in the DEV smoke. It is the same issue as Chase's mismatch, fixed by V129 plus the Management Analytics change in 95fc8a0; Chase accepted it with no defects.
- V129 needs a second DEV apply (and the read, command and chat images again), because the DEV deployment below stopped at V128.

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
| Review of 95fc8a0 | Accepted with no defects; the Dashboard and borrower e2e tests pass, 4 tests on desktop-chromium (Chase) |
| DEV smoke, API reads | Pass; the legacy-loan mismatch above found (Chase) |
| DEV smoke, UI at 390x844 | Pass; DSH-4b and ANL-6 found (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
- The wide Playwright suite and the mobile project: left to the pull request's CI.
- Live Metabase (refine, rebaseline and verify runs) and the PROD dictionary capture: they belong to the promotion step (Metabase reads PROD only).
- V129 on DEV: not applied yet; the DEV deployment record covers V128 only.

Chase info finding: an undated `df10:` pair counts in lifetime portfolio net but not in the dated views. This is unchanged from before V128, and no such rows are known.

## Recovery
Git baseline: `main` 80fbf6b (branch `claude/r116-writeoff-segregation`). V128 is views only; a later migration restores the V127 bodies (the appended columns stay, unused). Metabase: restore the private baseline written by `Refine-WriteOffSegregation.mjs --prepare` and archive the new question.

## Open questions
- Owner decision: whether to reconcile legacy loans like the two DEV ones (a Default Loss Amount with no `df10:` pair). A PROD count of such loans comes before promotion.

## Remaining work
Second DEV apply of V129 with the read, command and chat images, then the PROD count of legacy loans without a `df10:` pair, then PROD promotion (V128 and V129, Metabase order in the Metabase README, PROD dictionary capture) only on the owner's instruction.

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
