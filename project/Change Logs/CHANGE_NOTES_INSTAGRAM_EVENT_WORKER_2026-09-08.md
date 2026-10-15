# Instagram event worker — 8 September 2026

Status: implemented and enabled for the existing friend/Lisa scope; hourly master remains PAUSED. Final startup evidence is recorded below.

## Scope

Replace hourly-only AI interpretation with a durable, webhook-triggered background Codex worker, while preserving the paused hourly master for scheduled collection work. Reuse saved ChatGPT authentication, current local model/effort, existing API clients, and financial coordinators. No AppSheet or Looker schema/configuration changes.

## Rollback point

Before development, backed up Python agent/tests, runtime and collection configurations, master runbook, automation definition and consistent copies of both SQLite databases into `collection-agent/local/before-event-worker-20260908/`. Node entrypoint rollback copies were also recorded by reversing this change's inserted guard imports and queue-summary line before later edits. New modules are separate additions. Earlier `before-master-integration` backups remain available. Preserve unrelated working-tree changes and all post-cutover audit data.

## Changes

- Added `agent/ai_job.py`, strict `decision.schema.json`, `agent/event_worker.py`, and `agent/coordination.py`.
- Added durable work jobs, arrival timestamps, health state and a renewable shared collection lease. Duplicate webhook deliveries do not create duplicate AI jobs. Bursts debounce for three seconds; idle checks use local SQLite only.
- Added scoped `src/event_actions.mjs` for receipt capture/assessment/posting/verification/acknowledgment and correlated exception handling. Reused current receipt matching, approval, payment allocation, idempotency, and exception policies.
- Added `src/runtime_lock.mjs` to master, batch, receipt, exception, API read/write and legacy entrypoints. Worker-owned subprocesses inherit the lease; competing master commands fail before acting.
- Added conversational-reply recovery, fresh borrower opt-in checks and last-moment pending-inbound checks. Manual messages are cleared only if included in the classifier's actual context. Newer inbound messages supersede obsolete conversational replies.
- Added worker CLI status and startup/self-test/restart scripts. Installed **MW Instagram Event Worker** at startup with S4U under the existing user, limited privileges and restart-on-failure. No credentials were copied into the service or source.
- Model/effort use the inspected existing local configuration: **gpt-6-astra / low**. No separate API key/billing mode introduced. Classifier context is limited to recent conversation and pending receipt/case metadata; AppSheet is fetched when an action requires it.

## Checks

- 51 Node tests and 21 Python tests passed. Worker-specific checks cover burst deduplication, exclusive locking, saved-decision recovery, bounded retry state, and receipt exception routing without posting.
- Real background Codex promise classification succeeded in 12.12 seconds and produced the correct next-day Bangkok 18:00 commitment.
- The installed S4U task's real Codex self-test passed in 10.67 seconds with zero Instagram sends and zero financial actions. This validates saved-login access under the installed account context.
- Signed duplicate webhook test against an isolated local receiver: HTTP 200 twice, one stored event, one completed AI job, zero unnecessary sends, second run IDLE. It used synthetic data outside production ledgers.
- Live shared-lock/AppSheet-context validation and final restart results are recorded below when complete.

## Documentation and downstream effects

Added `collection-agent/EVENT_WORKER.md`; update README, master API procedure and this log together. The hourly prompt must defer event interpretation to the worker and treat lease contention as another active job, not permission to bypass it. Hourly scheduling remains paused. Inbound response timing is now event-driven; promised-time checks, morning messages, and penalties remain hourly.

## Acceptance and rollback

No new production payment was created just to test the worker. An actual fresh receipt and PC reboot remain real-world acceptance observations, not prerequisites for finishing implementation. User asked for implementation and self-validation without repeated testing checkpoints.

Disable `event_worker_enabled` and action switches to stop new actions; stop only **MW Instagram Event Worker**. Restore task-owned code/configuration and the backed-up automation prompt if necessary. Retain all new SQLite records and reconcile uncertain messages/payments read-only. No AppSheet app-version restoration is required.

## Deployment and final checks

- Live cross-language lease test passed: an unrelated master command was blocked before execution, while the worker-owned subprocess retrieved fresh AppSheet context successfully (four charges, no open receipts).
- Updated the existing hourly automation through the app tool, preserving PAUSED and exact-hour cadence. It now defers inbound work to the event worker and honors lease contention without duplicate interpretation.
- Enabled `event_worker_enabled`, processing, Instagram sending and guarded AppSheet writes for the existing test scope after validation. No existing receipt was replayed and no artificial payment was posted.
- Both installed tasks restarted and returned Running with local health 200. A deeper process check found an orphaned old worker left by the initial PowerShell launcher. Corrected the task to launch Python directly and stopped only the verified project-owned orphan processes. The renewed shared lease had prevented overlapping actions even while the orphan existed.
- Documentation updated: README, EVENT_WORKER.md, INSTAGRAM_API_CYCLE.md, configuration example and this log. No AppSheet data-model documentation changes were needed.

The first hidden elevation request did not appear to the user and was canceled. The repeated visible request completed. Subsequent checks continued without another testing/acceptance interruption.

Final activation evidence: direct Python task reports Running. Its renewed real Codex self-test passed in 11.47 seconds with zero messages/financial actions. Worker health reports the new process PID and a fresh heartbeat; queue is empty. Public webhook health returned HTTP 200. Event worker and action switches are enabled in the existing friend/Lisa scope, while the hourly automation remains PAUSED. No PC reboot or new real receipt posting was performed as a validation shortcut.

Final elevated process inventory confirmed one worker process tree (venv launcher plus Python child), one receiver process tree, and no old orphaned worker. This closes the startup cleanup check.
