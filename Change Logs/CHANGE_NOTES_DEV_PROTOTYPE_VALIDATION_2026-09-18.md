# DEV prototype validation — 18 September 2026

Status: Documentation updated and checked. Owner clarified that both DEV AppSheet apps are in Prototype phase and must not be switched to Deployed mode. No app setting, database, refresh or production operation was performed; no product release number is required.

## Changes

- [AGENTS.md](../AGENTS.md): records the standing DEV Prototype-mode rule and separates DEV editor validation from PROD editor/deployment checks.
- [Release workflow](../Documents/Rules/Release_Workflow.md): DEV deployment checks are excluded, not pending or blockers. This supersedes earlier deployment-check blockers, including R005, without automatically clearing other tests, owner acceptance or production authorization.
- [Development preparation](../Documents/Rules/Development_Environment_Preparation.md): retains Prototype mode, saved-state editor diagnostics and applicable functional testing; no deployment check or mode switch.
- [DEV refresh](../Documents/Rules/Development_Refresh_Runbook.md): replacement apps retain/use Prototype mode, and all refresh modes exclude deployment checks. Removed wording that could encourage deployment to make schedules run; preserve definitions and record actual prototype-mode execution limitations instead.

DEV still requires zero editor configuration warnings/errors, including pre-existing issues. Prototype status and deployment-only findings are not DEV blockers. PROD still requires editor diagnostics and deployment checks with zero outstanding warnings/errors. Existing notification isolation, automation definitions/parity, same-environment links and replacement recovery/deletion gates remain applicable.

## Verification and recovery

Reviewed all deployment-check references in the affected procedures, checked local links and the intended Git diff. No live tests or model-workbook edits are applicable to this documentation-only task. Older dated release evidence was not rewritten and no R005 readiness status was independently reassessed. Concurrent R005 scripts and promotion artifacts were preserved.

Starting Git commit: `2054384831a58a89842a42a123381fb1dc032141`. Recovery is a scoped revert of this documentation commit, preserving later/concurrent work; it would not change any live app mode. Commit/push follows the standing repository rule.
