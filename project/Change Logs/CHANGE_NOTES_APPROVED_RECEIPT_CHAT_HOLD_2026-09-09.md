# Approved receipt blocked by earlier manual context — 2026-09-09

Status: Fixed; live payment and acknowledgment verified.

## Finding

The direct Instagram Approve reply was correctly recorded for Lisa's latest 300 THB receipt. Payment then failed the inbox hold check because two manual outbound messages preceding the receipt (a payment request and a GIF) retained a human-review hold. The job exhausted retries despite a valid approval.

## Change and rollback

collection-agent/agent/event_worker.py now audits earlier manual outbound context as superseded by the explicit linked reviewer approval before continuing the approved receipt. This applies only to the same borrower, a friend-confirmed receipt with quoted review evidence, and messages at or before the receipt's submission time. Newer manual messages, pending inbound, uncertain sends and financial checks remain untouched. Added regression test and updated REVIEWERS.md.

Rollback copy: collection-agent/local/before-approved-receipt-hold-20260909/event_worker.py. No AppSheet configuration/schema change. To roll back, temporarily disable processing, restore the code copy and restart worker, then restore processing state. Never undo the posted payment or replace current SQLite records as a code rollback.

## Validation and production result

34 Python tests passed. One initial suite run hit the existing financial-snapshot timing check; rerun passed. New regression verifies that only earlier manual messages are selected and a later message is preserved.

Worker/receiver restarted successfully at 01:02:47 Bangkok; health HTTP 200. Requeued only the previously held job, retaining authenticated approval. Worker completed normally: receipt ACK_SENT; AppSheet payment readback verified; 300 THB recorded with receipt transfer date September 8. Instagram acknowledgment confirms remaining outstanding 1,199 THB. No repeated approval was requested and the existing once-only payment dispatcher was used.

## Manual acceptance

Check Lisa's acknowledgment and the 300 THB payment in the app. Implementation fixes the pre-receipt manual-context blocker; new unrelated activity may still appropriately prevent automatic continuation.
