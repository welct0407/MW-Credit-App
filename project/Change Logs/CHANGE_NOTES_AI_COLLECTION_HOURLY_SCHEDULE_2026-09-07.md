# AI Collection Master Cycle — hourly schedule

Date: 7 September 2026. Status: configured and read back; next scheduled start awaits runtime verification.

User explicitly requested reducing the master frequency to hourly, on the exact hour. Updated existing heartbeat `lisa-build-2-reminder-test` through automation_update to hourly, minute00, second00. Preserved ACTIVE state, target task, Lisa-only scope, financial and message rules, and notification preferences. Updated prompt, MASTER_CYCLE.md and README.md. No AppSheet configuration or financial record changes.

Rollback: previous automation.toml, master runbook and README copied to ignored mw-ai-collection/local/before-hourly-schedule before editing. Restore the previous definition through automation_update and restore these two docs if needed. Preserve all fee/send ledgers. No AppSheet version backup required for this scheduler-only change.

Verification: saved automation readback confirms ACTIVE, hourly at minute00/second00, same target task. No code change or new tests needed. Scheduled start is aligned to the hour; processing and message delivery can occur later. Reply/payment observation now occurs hourly. Manual check: next hourly wakeup and one eligible reminder only; existing duplicate controls and quiet hours remain in force.
