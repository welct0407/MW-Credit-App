# AI Collection Master Cycle — 2026-09-07

## Scope and authorization

User approved starting one master cycle every 15 minutes and adding later builds to that same job. Reuse automation ID `lisa-build-2-reminder-test`, rename it AI Collection Master Cycle and activate it. Keep Lisa-only scope and existing send protections. This authorizes scheduling activation, not a real-borrower rollout, payment posting, or resetting the completed one-reminder test.

## Rollback point and changes

Before edits, copied the existing paused five-minute automation.toml, README.md and BUILD_2_RUNBOOK.md into ignored `mw-ai-collection/local/before-master-cycle/`. Added MASTER_CYCLE.md and this log. Updated README and Build 2 runbook to distinguish borrower-level holds from master-schedule lifecycle. No AppSheet, data-model, financial-record or Looker changes; historical app baseline 3.000011 remains unrelated to this local/scheduler change.

## Expected behavior and checks

One heartbeat performs reply observation, production balance checks and reminder evaluation. Existing AWAITING_ACCEPTANCE blocks further test reminders but does not stop the master. Daily opening sends and payment recording remain disabled. The check frequency is 15 minutes; promises use Thailand time and zero added grace, with action at the first due cycle. No duplicate job is created. Activation and first-cycle verification are recorded below when completed.

## Manual verification and rollback

First scheduler-triggered master cycle verified at approximately 12:45 UTC on 7 September: authenticated Instagram continuity and completed standalone production AppSheet sync succeeded. No new inbound or receipt; remaining balance still 900. Existing AWAITING_ACCEPTANCE suppressed sends as intended. Saved scheduled-cycle observation locally; the master stays active. This supersedes the earlier pending-first-scheduled-cycle checkpoint without changing the outstanding Build 1/2 configuration and acceptance requirements.

Activation completed: automation_update returned ACTIVE for the existing ID under the new name AI Collection Master Cycle with a 15-minute interval. Immediate verification read the exact Instagram conversation and synced Lisa's production Collection detail: 600 current plus 300 overdue, total 900. Captured the friend's superseding 19.00 Thailand promise from the inbound after the first reminder; no subsequent inbound or receipt was visible. Existing reminder state returned AWAITING_ACCEPTANCE and no message was sent. Saved cycle observation in ignored local/master-cycle-state.json. This verifies the immediate workflow; a future scheduler-triggered 15-minute execution has not yet occurred at this checkpoint. Master remains active for future checks.

Review the scheduler card showing one active 15-minute master job. Future scheduled-cycle execution is distinct from the immediate verification cycle. Review the next meaningful event and accept the first Build 2 reminder before extending sending. Pause this automation to stop all master checks. Restore the prior job definition through automation_update and the backed-up runbooks if rolling back; preserve ledgers and this change history.
