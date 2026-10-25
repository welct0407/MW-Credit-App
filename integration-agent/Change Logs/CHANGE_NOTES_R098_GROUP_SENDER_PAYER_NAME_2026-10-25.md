# Change notes — R098 group sender learns the payer name, 2026-10-25

## Purpose
After R095 a slip that a borrower sends in a group with several enabled borrowers (context C4′) posted correctly but never saved the slip's payer name, while the same slip in the borrower's own chat or in the PWA did. The owner reported one such PROD receipt on 25 October 2026 (the borrower's payer name stayed empty). This batch makes C4′ learn the payer name like the borrower's own chat; the posting decision is unchanged.

## Changes
- `integration-agent/src/mw_integration_agent/receipt_identity.py`: the `group_sender` context has `fill` true, and `resolve_payer` returns `learned(borrower, slip)` for it as for `sender` and `forwarded`. The sender still decides the borrower; no hold, no candidate narrowing and no `payer_step` for C4′.
- `integration-agent/tests/test_payer_resolution.py`: the C4′ test now checks, through the poll capture and `process()`, that an empty payer name is filled, a new payer is appended as another line, a matching name changes nothing, and the borrower stays the sender.
- `integration-agent/docs/OPERATIONS.md`: the strong-context list names C4′.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache .` (in `integration-agent`) | Pass |
| `PYTHONPATH=src:tests python3 -m unittest discover -s tests` (in `integration-agent`) | 617 run, OK (70 skipped) |
| Agent PostgreSQL lab suites (CI list: `test_postgres_state` to `test_statement_snapshot`, disposable clusters from `tests/lab/setup.sh`) | 79 run, OK |
| Read-only trace of the reported receipt (PROD command journal, `mw_agent` jobs and reviews, command-prod logs) | Job after `payer_name_cutoff`, context C4′ (two candidate borrowers, no `payer_step`), slip payer name recognized, `payer_lines` null, posted automatically with `schemaVersion` 7 and no `payerLines`; the only agent receipt since the cutoff |

## Not run
Wide browser suite and SQL tests: no PWA, service or SQL change. The VM deploy is a promotion step.

## Recovery
Revert this commit and redeploy the previous agent commit with `deploy-runtime.py rollback`, or set `payer_name_cutoff` to null. A name already learned stays in `"Communication Name"`; the owner can edit it in the app.

## Open questions
None.

## Remaining work
Deploy to the VM. The borrower from the report has no payer name yet: the next slip in that group fills it, or the owner types it in the app.
