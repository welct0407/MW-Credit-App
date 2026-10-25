# Change notes — Agent test ResourceWarnings, 25 October 2026

## Purpose
The agent tests emitted 29 ResourceWarnings from unclosed SQLite connections. Close them deterministically as part of CI hygiene Batch 1; no behavior change.

## Changes
- `integration-agent/tests/test_state_migration.py`, `test_partner_notice.py`, `test_server.py`, `test_review_cycle.py`: connections wrapped in `contextlib.closing` (17 warnings cleared).
- `integration-agent/src/mw_integration_agent/state_migration.py` `backup_journals`: both SQLite connections wrapped in `contextlib.closing`; the inner `with` still commits or rolls back as before. Operator-only tool, behaviour otherwise identical; the only runtime file touched.

## Checks
| Command | Result |
| --- | --- |
| Agent tests (`-W error::ResourceWarning`) | 618 OK, 70 skipped; ResourceWarnings 29 to 0 (Byte) |
| `ruff` | Pass (Byte) |
| `npm run check:docs` | 0 failures, 0 warnings |
| Chase verification | `state_migration.py` closing preserves commit and rollback; no blocking defects (Chase) |

## Not run
No VM deploy, live journal migration or cutover. Source-only change; the VM picks it up at the next standard agent deploy.

## Recovery
Revert the batch commit.

## Open questions
None.

## Remaining work
Chase's verification; the main change note `Change Logs/CHANGE_NOTES_RELEASE_CLOSURE_AND_CI_HYGIENE_2026-10-25.md` covers the rest of the batch.
