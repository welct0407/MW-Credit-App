# Change notes — DEV refresh plan, 21 October 2026

## Purpose
The owner asked for a plan that Codex can follow to refresh `loan_manager_dev` from PROD safely. The repository has a refresh runbook but no maintained refresh runner, so the plan spells out the repository-specific traps and the phased procedure.

## Changes
- New owner-requested document [project/outputs/dev-refresh-plan-20261021/README.md](../project/outputs/dev-refresh-plan-20261021/README.md): traps to watch (shared instance and cluster-wide roles, environment-suffixed owner roles, push subscriptions as live credentials, trigger rules, Flyway history, DEV schedulers, receipt objects), a go or no-go checklist, eight phases from route proof to records, rollback, owner decisions and stop conditions.
- No code, configuration, SQL or live target changed.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | Pass on this commit |

## Not run
Database and CI checks: no SQL, runner or application change in this batch. No live read or write was performed while drafting; facts come from the current documents and scripts.

## Recovery
Delete the two new files; nothing else changed.

## Open questions
The five decisions listed in section 5 of the plan (receipt object copy, DEV push subscriptions, maintained tooling, code refresh, write test).

## Remaining work
Execution by Codex under the owner's refresh instruction, including the one-line `--expected-version 100` addition to `scripts/database/Backup-ProductionPromotion.py` and the reviewed refresh script the plan asks for.
