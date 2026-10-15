# Build 7 — daily forwarding batch and delivery tracking

Date: 8 September 2026, Asia/Bangkok. Status: implemented and scheduled; first scheduled live batch and user acceptance pending.

## Scope and purpose

The user authorized the daily 11:00 branch of the existing master to prepare and send one opening message per borrower on the complete production Collection Board, all to the configured friend for manual forwarding. Start 9 September; today's repaired manual batch is complete and explicitly suppresses another Lisa opening. This addresses the earlier rapid fill/Enter failure that sent only four of twenty prepared messages. All later reminders, fees, receipts and generic cases remain Lisa-only; Build5 remains on hold. No direct borrower account messaging.

## Changes

- Added batch_engine.mjs, batch_runner.mjs, batch.test.mjs and BUILD_7_RUNBOOK.md.
- Added three local SQLite tables: daily_batches (frozen source roster), daily_batch_items (unique date/borrower, reserved message/facts/version and status), daily_batch_events (append-only transition evidence). These are private execution records, not a replacement financial source.
- Statuses: QUEUED, PREPARED, SENDING, SENT, REVIEW, SKIPPED_PAID, SKIPPED_EXISTING. SENDING is committed before browser interaction. Only complete exact outbound evidence, empty composer and cleared Sending indicator allow SENT. Unknown/interrupted attempts cannot automatically reset or retry. Verified delivery can reconcile an unresolved item. Untouched items can resume with fresh facts during the 11:00 hour.
- Fresh balance and inbox observations expire after five minutes. Complete board roster, stable borrower IDs, complete charge evidence, amount reconciliation, explicit holds and exact configured friend destination are required. Existing opening reservations and pending Lisa receipts/cases are respected.
- Updated config, hourly entry, master runbook, README, cycle brief and master engine. The master retains Lisa's fee/day enrollment but delegates her 11:00 opening to the batch. Unresolved batch delivery blocks subsequent master collection sends.
- Updated the existing lisa-build-2-reminder-test heartbeat prompt through automation_update. Readback confirmed ACTIVE, same target task and hourly minute00/second00 schedule. No separate scheduler or model override.
- No AppSheet schema, configuration, financial records or dashboards changed. Shared data-model overview/workbook updates are not applicable to these local execution tables.

## Rollback point

Before implementation, copied changed existing files and automation.toml to ignored mw-ai-collection/local/before-build-7. Before initializing new SQLite tables, created a consistent SQLite backup there using VACUUM INTO. Prior AppSheet version 3.000011 remains reference only; no app-definition edit was performed.

Pause the master before rollback. Restore prior source/config/runbooks and use automation_update to restore the saved prompt, retaining the current schedule and notification settings. Preserve current SQLite history and explicitly carry forward unresolved batch delivery holds; never restore the old database over delivery records or retry previously attempted messages. New batch files may remain unused. No financial deletion or AppSheet version restoration is needed.

## Checks

31 Node tests passed, including batch persistence across reopen, unique daily roster reuse, serial pending-send blocking, incorrect composer/Sending evidence rejection, confirmed-send duplicate blocking, source freshness, wrong destination, paid skip, date/hour gating, Lisa opening ownership and incomplete batch quiet-hour routing. Existing receipt, exception, fee, reminder and ledger tests also passed. Live CLI initialization succeeded; brief correctly reports batch not due on 8 September. Today's scheduled-batch table is empty because the earlier manual sends were not fabricated as batch-engine delivery records.

## Manual verification and limits

- On 9 September at 11:00, verify one opening message per unpaid board borrower arrives at the friend, including Lisa only once. Compare roster count with SENT/paid/existing/held counts and check the friendly three-paragraph template.
- Confirm later hourly collection remains Lisa-only. Confirm live payment/exception holds are preserved.
- The first end-to-end scheduled batch remains untested. Browser observations are supplied by Codex; the CLI validates their structure and consistency but cannot independently authenticate Instagram delivery or the production board.
- A run starts at the scheduled hour; source review and sequential delivery take time. After 11:59 no automatic missed-opening sends occur. An incomplete/uncertain batch is surfaced for review, not reported complete or retried blindly. Existing unresolved review items require explicit investigation before resumption.
- Bank and borrower evidence remains in ignored local files and SQLite. No new test messages were sent for this implementation. Wait for user acceptance before proceeding to another build.
