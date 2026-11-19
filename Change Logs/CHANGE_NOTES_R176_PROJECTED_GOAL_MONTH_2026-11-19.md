# Change notes — R176 projected monthly profit counts this month's charges only, 19 November 2026

## Purpose
The "Projected Monthly Profit" goal counted every unpaid charge dated on or before today, of any age, so old unpaid interest inflated the goal and lowered the realization percentage. Owner instruction, 19 November 2026 (Asia/Bangkok): "limit the goal to this month's charges only. move to prod" (scoped PROD approval for this change).

## Changes
- `database/migrations/V152__projected_goal_month_charges.sql` (views only: no table, column, grant, trigger, function or data change). In `olap_portfolio_summary`, "Projected Monthly Profit" = Realized Profit MTD + the unpaid "Interest Remaining" on charges dated from the 1st of the current month to today + Forecast Remaining Interest. A new internal aggregate `month_interest` feeds only the projection; "Today's Outstanding Interest" and "Pending Payment Amount" are unchanged. In `olap_borrowers_analytics`, "Projected Monthly Profit Contribution" uses the same month rule through its `interest_remaining` aggregate.
- Dependents follow with no code change: "Forecast Monthly Return on ADO"; Metabase model 73 (Remaining Forecast Profit, Forecast Realization); the PWA Dashboard and Management Analytics "Projected Monthly Profit" (labels unchanged). Metabase question 380 is not edited: its goal "Projection = Projected Monthly Profit" stays true, so its dictionary entry is unchanged.
- PROD numbers on 19 November before the change: 114,191 received + 121,724 unpaid (71,111 of it charged before 1 November, oldest 25 August) + 80,794 forward = 316,709. After: about 245,598; realization about 36% to about 46%.
- Records: `database/README.md` (V152), the two dictionary entries (`public.olap_portfolio_summary`, `public.olap_borrowers_analytics`: `development_definition` with the new view text, derived from the PROD definition; refreshed from the PROD capture at closure), `services/chat/assets/conversation-business-rules.md` (section 10), the release tracker. Byte owns the migration, the SQL tests and the schema digest.
- Promotion is SQL only: V152 to DEV and PROD after verified backups. No image, Hosting, Terraform, agent or Metabase change.
- Team: Archie design, Byte code, Chase verification, Dewey records, Forge and the orchestrator promotion. Echo not applicable: no UI change, labels unchanged.

## Checks
| Command | Result |
| --- | --- |
| Byte: `Test-ProjectedMonthGoal.sql`, `Test-StatementBatch.sql`, migrations chain to 152 | pending |
| Byte: unit tests, lint, `tsc`, `chat-schema-digest` | pending |
| Chase: adversarial review | pending |
| Pull request `Development checks` and `Database migrations` runs | pending |
| `python3 project/scripts/dictionary/dictionary.py validate` | 0 errors |
| `npm run check:docs` | 0 failures (1 unrelated warning) |

## Not run
Nothing is skipped yet. The "after" figures are an estimate until V152 is applied.

## Recovery
V152 is views only: re-create `olap_portfolio_summary` and `olap_borrowers_analytics` from their V151 definitions after a verified PROD backup, with no data change.

## Open questions
None.

## Applied
Pending: V152 to DEV and PROD.

## Remaining work
Apply V152 to DEV and PROD after verified backups, verify the PROD projection (about 245,598, realization about 46%), refresh the two dictionary entries from the PROD capture at closure, and record owner acceptance.
