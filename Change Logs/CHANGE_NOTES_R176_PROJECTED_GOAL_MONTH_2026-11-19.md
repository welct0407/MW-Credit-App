# Change notes — R176 projected monthly profit counts this month's charges only, 19 November 2026

## Purpose
The "Projected Monthly Profit" goal counted every unpaid charge dated on or before today, of any age, so old unpaid interest inflated the goal and lowered the realization percentage. Owner instruction, 19 November 2026 (Asia/Bangkok): "limit the goal to this month's charges only. move to prod" (scoped PROD approval for this change).

## Changes
- `database/migrations/V152__projected_goal_month_charges.sql` (views only: no table, column, grant, trigger, function or data change). In `olap_portfolio_summary`, "Projected Monthly Profit" = Realized Profit MTD + the unpaid "Interest Remaining" on charges dated from the 1st of the current month to today + Forecast Remaining Interest. A new internal aggregate `month_interest` feeds only the projection; "Today's Outstanding Interest" and "Pending Payment Amount" are unchanged. In `olap_borrowers_analytics`, "Projected Monthly Profit Contribution" uses the same month rule through its `interest_remaining` aggregate.
- Dependents follow with no code change: "Forecast Monthly Return on ADO"; Metabase model 73 (Remaining Forecast Profit, Forecast Realization); the PWA Dashboard and Management Analytics "Projected Monthly Profit" (labels unchanged). Metabase question 380 is not edited: its goal "Projection = Projected Monthly Profit" stays true, so its dictionary entry is unchanged.
- PROD numbers on 19 November before the change, morning read: 114,191 received + 121,724 unpaid (71,111 of it charged before 1 November, oldest 25 August) + 80,794 forward = 316,709; after, about 245,598, realization about 36% to about 46%. Chase's later read-only read (Metabase db 2): 114,691 + 121,724 + 81,894 = 318,309; this-month unpaid interest 50,613; the new goal would be 247,198 (the 71,111 drops out). Both are estimates; PROD verification compares after apply.
- Records: `database/README.md` (V152), the two dictionary entries (`public.olap_portfolio_summary`, `public.olap_borrowers_analytics`: `development_definition` with the new view text, derived from the PROD definition; refreshed from the PROD capture at closure), `services/chat/assets/conversation-business-rules.md` (section 10), the release tracker. Byte owns the migration, the SQL tests and the schema digest.
- Promotion is SQL only: V152 to DEV and PROD after verified backups. No image, Hosting, Terraform, agent or Metabase change.
- Team: Archie design, Byte code, Chase verification, Dewey records, Forge and the orchestrator promotion. Echo not applicable: no UI change, labels unchanged.

## Checks
| Command | Result |
| --- | --- |
| Byte on `f0dadeb`: `mw-db-ci -Group migrations` | Exit 0: chain to 152, statement batch including the new `Test-ProjectedMonthGoal`, concurrency suites, pre-migration targets, public-functions match |
| Byte: `Test-ProjectedMonthGoal` on V151 and V152 | Fails on V151 (projected delta 225 vs expected 125), passes on V152; a second V152 run is refused; column counts 46 and 71 unchanged |
| Byte: `node --test tests/unit/chat-schema-digest.test.mjs` | 3 pass, 1 skipped; 4 pass with the lab digest port. No lint (no JS change) and no Playwright |
| Chase: adversarial review of `8e978bf..f0dadeb` | No blocking findings. PROD read-only (Metabase db 2, 19 November): each replaced fragment occurs exactly once in the live PROD view text and the preflight markers hold; current goal 318,309 (114,691 + 121,724 + 81,894); this-month unpaid interest 50,613; new goal would be 247,198 (71,111 drops out); Today's Outstanding Interest 121,724 and Pending Payment Amount 156,265 unaffected |
| `python3 project/scripts/dictionary/dictionary.py validate` | 0 errors |
| `npm run check:docs` | 0 failures (1 unrelated warning) |
| Pull request `Development checks` | pending |

## Not run
Playwright and e2e locally: no UI change, and CI covers them. The "after" figures are estimates until V152 is applied.

## Recovery
V152 is views only: re-create `olap_portfolio_summary` and `olap_borrowers_analytics` from their V151 definitions after a verified PROD backup, with no data change.

## Open questions
None.

## Applied
Pending: V152 to DEV and PROD.

## Remaining work
Apply V152 to DEV and PROD after verified backups, verify the PROD projection (about 247,198 on Chase's read, realization about 46%), refresh the two dictionary entries from the PROD capture at closure, and record owner acceptance.

## PROD promotion record (Forge, 19 November 2026 UTC)
Authority: owner, 19 November 2026 (Asia/Bangkok), in session: "limit the goal to this month's charges only. move to prod"; it covers V152, the backups, the standard DEV six-owner window and these records. SQL-only release: no image, Hosting, Terraform, agent, Metabase, notification, job or financial write.

Package: `main` 2636231b2be5f01a5fa2b9be850b4ce0b6f8f9c4 (merge of PR #366, head 05634034; no `database/` difference between them). CI: Development checks 44563748711; Database migrations 44564448787 on 2636231b (guards, changes, rebuild migrations/phase5/phase8/receiving), the V152 proof. V152 sha256 eed1be02a877f7d897809fae6fd8581f88c4c55e68ed4f67eb77805910032895. Run from a clean detached worktree (`npm ci` from the identical lockfile). Baseline: schema 151 in DEV and PROD (V151 installed 18 November 14:13:00Z DEV, 14:28:27Z PROD), only 152 pending.
Target: project clever-oasis-508610-n7, instance mw-credit-pg-20261017 (PostgreSQL 18, RUNNABLE), loan_manager_dev / loan_manager_prod; `database/environments.json` matches.

| Step | Result |
| --- | --- |
| PROD backup (V151) | 16:18:36Z–16:21:18Z; dump sha256 cf662d283819e9c5f6958600b9e6a8df0b11409631b4c2bad1d04c32ebf6b7ef; listing, isolated restore, 42 table fingerprints ok; record prod-promotion-3c827251f04b4361b051564fdf67af04 |
| DEV backup (V151) | 16:21:22Z–16:23:53Z; dump sha256 c649988d289058867917913925ad18c73ce51e5724a24f98590cf4a389abc48a; restore and 42 fingerprints ok; record dev-refresh-fbb351f94ae648579e4de412b326889f |
| DEV owner window | Opened before the migrate (avoids the R175 deviation): prepare 16:24:14Z–16:24:26Z, six DEV owners (notify, jobs, ledger, changes, journal, chat); state owner-authority-dev-prepare-7e598d13… |
| DEV V152 | Invoke-Flyway.ps1 -Environment development migrate 16:24:29Z–16:31:55Z; V152 installed 16:24:39Z (3.5 s); post-migrate reconcile applied, 0 violations (snapshot application-role-c7ce4f96…) |
| DEV window restore | 16:32:03Z–16:32:14Z (24 statements); read-back: head 152, 0 failed; six DEV owners inherit/set false; no owner has CREATE on public; both views `v`, owner postgres, ACLs unchanged |
| PROD release file | Invoke-CloudFlyway.py prepare 16:32:46Z–16:33:14Z (152 migrations, commit 2636231b) |
| CONNECT preflight | 16:33:17Z (sha256 7ce89b51…1a6f) for check; re-run 16:34:22Z–16:34:28Z for apply (10-minute freshness): sha256 ee3c706188d7e0498022de7236317850ea697f5fb08e5e1f5ceda31955e8810b; 18 retained roles, 0 DEV sessions |
| PROD check | 16:33:27Z–16:33:55Z: pending ["152"], 0 writes |
| PROD V152 | apply 16:34:33Z–16:35:52Z; V152 installed 16:35:15.89Z (3.4 s, checksum -1225883383), migrationsExecuted 1 |
| Read-back | verify DEV and PROD: validation ok, schema 152, nothing pending, 0 writes; PROD 0 failed rows; both views `v` (not materialized), owner postgres, ACLs unchanged (md5 2e046d3a… before and after); view definitions match DEV's post-V152 text (md5 726124ca… borrowers, b2e41250… portfolio) |
| Values (PROD, read-only) | Before (about 16:32Z): Realized 114,691, Outstanding 122,064, Forecast 81,554, Projected 318,309, Pending 158,805, borrower contribution sum 307,809. After 16:36Z: Realized 115,031, Outstanding 121,724, Forecast 79,134, Projected 244,778 (= Realized + this-month unpaid 50,613 + Forecast, as Chase's read predicted), Pending 156,265, contribution sum 234,278. The input movement between reads is ordinary user activity (payment commands 16:30:48Z and 16:33:29Z in `pwa_row_changes`), not V152; Today's Outstanding Interest is not changed by V152 |

Observation (not changed): `postgres` holds `mw_agent_owner` and `mw_business_audit_owner` with inherit/set true. Neither role is in the R176 window or touched by V152; pre-existing, with no prior read to compare.

Rollback: V152 is views only and forward-only; re-create both views from their V151 definitions after a verified PROD backup, no data change. Restore points: the V151 backups above.

Private evidence: backups under gs://mw-credit-operator-private-737787224638/prod-backups/prod-promotion-3c827251f04b4361b051564fdf67af04/ and dev-backups/dev-refresh-fbb351f94ae648579e4de412b326889f/ (180-day lifecycle); release file, CONNECT preflights, owner-window and application-role records in ~/.mw-private/AppSheet-Loan-Project/flyway/; step outputs and before/after reads in ~/.mw-private/r176/; detached worktree ~/.mw-private/MW-Credit-App/r176-src.
