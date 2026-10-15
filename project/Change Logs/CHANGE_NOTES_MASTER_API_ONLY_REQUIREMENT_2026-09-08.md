# Master API-only requirement — 2026-09-08

User requires every master-cycle interaction to use APIs. Inspected API_CYCLE.md and the configured automation. AppSheet operational reads/writes are already API based; the prompt still allowed GUI investigation. Removed that runtime fallback and documented hold/report behavior for insufficient API evidence. No financial record or AppSheet definition changed; no app backup/model inventory update applies.

Rollback: restore the prior prompt clause permitting standalone GUI investigation and remove the added API-only requirement paragraph in API_CYCLE.md if the user later changes this preference. Previous full prompt is in local/before-api-cutover-20260908/automation.toml, but preserve all subsequent API migration instructions when reversing only this preference. Keep automation paused.

Remaining GUI work is Instagram inbox/receipt inspection, sends, exception receipt association and outbound verification. Instagram API migration is not implemented or claimed complete. Manual login/permission setup is outside the recurring cycle. Full API-only operation remains pending that migration and verification of messaging restrictions. No GUI or API message was sent in this task.

Checks: reviewed current runbook and prompt; updated existing automation without changing its name, target, hourly cadence or PAUSED status. Documentation/prompt change only; no unit-test rerun required.
