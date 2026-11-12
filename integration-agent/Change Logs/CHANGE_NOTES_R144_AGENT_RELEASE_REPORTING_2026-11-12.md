# Change notes — Agent release reporting (R144), 12 November 2026

## Purpose
Part of R144 component versioning ([project note](../../Change%20Logs/CHANGE_NOTES_R144_COMPONENT_VERSIONING_2026-11-12.md)): the agent reports which `Rnnn` its code belongs to, so drift against the registry can be checked.

## Changes
- `scripts/deploy-runtime.py prepare` writes `code_release` beside `code_version` in the configuration (Byte).
- `/ready` and `/healthz` report `release` and `commit` (Byte).
- `docs/OPERATIONS.md`: deploy bullet describes the new fields. The service catalogue revision (37) is unchanged and remains the agent's native counter; no switch, route or runtime behavior change.

## Checks
| Command | Result |
| --- | --- |
| Agent `ruff` (Byte, commit `080486f8`, tree `6e6493c4`) | Pass |
| Agent unittest `deploy_runtime` 24, `server` 16, `chat_relay` 20, `receipt_recognition` 81, `config` 18 (Byte, same tree) | Pass, all OK |
| `npm run check:docs` (Dewey) | Pass, 0 failures, 0 warnings |
| Verification report (Chase) and CI on the pull request | Pending |
## Not run
No Debian deploy in this batch; it waits for promotion. An agent deployed before this change reports no release and reads as unverified.

## Recovery
Revert the commit; the added fields are read only by the drift check.

## Open questions
None.

## Remaining work
Deploy with the R144 promotion.
