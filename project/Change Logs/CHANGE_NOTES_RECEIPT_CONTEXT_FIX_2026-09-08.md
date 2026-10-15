# Receipt context false-positive correction — 2026-09-08

Status: Code corrected; 27 Python and 55 Node tests passed. Live reassessment/posting of the held 400 receipt is in progress and recorded below when verified.

## Problem and authorization
The user reported that a second clear receipt was unnecessarily sent for operator confirmation. Inspection showed the 400 receipt was held because the same Instagram account serves as borrower and collection operator: the AI saw another borrower's 300 review request, old message balances and an operator review mentioning another name. It also added a generic lack-of-bank-settlement concern. Those were implementation false positives, not genuine extraction problems. The existing standing user policy authorizes automatic posting when there is no actual receipt exception.

## Change
- Receipt image classification now sees only the new receipt/caption burst and its borrower identity, not historic balance messages or other open reviews.
- Operator review messages are explicitly marked and excluded from ordinary borrower context. Other borrowers' open records are included for an operator only when the new reply explicitly contains that record ID.
- Classifier instructions expressly disallow requiring independent bank confirmation, full unmasked numbers, payer-name equality, or agreement with old chat totals. It still reports unreadable fields, conflicting images, explicit samples and apparent alteration. The existing deterministic coordinator remains responsible for current bank/date/balance/duplicate checks.
- Added audited reassessExtraction for an unposted, nonduplicate receipt. It must retain the original authenticated source and identical amount, transfer time, bank, account, reference and sample classification. It cannot change financial identity, bypass duplicate holds or reprocess a dispatched payment. Old review details remain in receipt_audit; stale confirmations cannot approve a superseded review.
- New regression tests cover isolated receipt context, automatic approval after correcting irrelevant context, and rejection of changed amounts/real duplicates.

## Rollback and files
Private rollback copies of agent/source code, runtime config and consistent SQLite snapshots: collection-agent/local/before-receipt-context-fix-20260908. Processing was disabled during the change. Files: agent/event_worker.py, agent/ai_job.py, receipt_engine.mjs, event_actions.mjs and corresponding Python/Node tests; runbook policy notes updated. No AppSheet schema/app definition changes, so app version restoration does not apply.

Disable processing before code rollback and restart the worker/receiver afterward. Do not restore old SQLite snapshots over live payments or outbox records. Any posted payment requires a separately authorized auditable financial correction, not deletion or replay.

## Validation and acceptance
The original stored 400 image was visually inspected, then re-read by the corrected background classifier: confidence 0.99, requires_human false, no receipt concerns, amount unchanged. The receiving masked digits and current transfer date match. This is visual receipt acceptance under user policy, not an assertion that the bank independently verified settlement.

All 82 automated tests pass. Manual acceptance: a fresh clear receipt should post and acknowledge without operator confirmation; a reused transaction reference, wrong receiving account or unreadable essential field should still be held with a specific reason. The earlier 300 duplicate remains held and must not be posted again.

## Verified production outcome
The unchanged 400 receipt was reassessed under its existing record b5b4cac7-41ef-4ac2-be6a-2ba354aa3392. All objective checks passed and the normal standing-policy coordinator auto-approved and posted exactly one payment. The API dispatch is VERIFIED, receipt is ACK_SENT, and the acknowledgment outbox is VERIFIED. Remaining outstanding reported: 799. No friend confirmation was required. The prior review and job result remain in receipt_audit and ai_job_reassessments. The original 300 duplicate was left unchanged. Processing is enabled, the restarted worker is healthy, and the existing hourly schedule remains active.
