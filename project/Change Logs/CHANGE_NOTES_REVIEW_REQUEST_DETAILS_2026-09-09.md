# Self-contained reviewer requests — 2026-09-09

Status: Implemented; wording acceptance pending user feedback.

## Scope

Receipt review sends now include the actual recorded reasons, borrower, amount, Bangkok transfer/submission/review times, transaction reference, masked account comparison and fresh timestamped AppSheet balance. Duplicate requests include earlier matching receipt details/status and state that approval cannot bypass the duplicate block. Reviewer language preferences remain in force. Existing exception messages retain their category, summary, evidence, balance and decision instructions.

## Files and rollback point

Changed collection-agent/agent/review_details.py (new), review_language.py, dispatch.py, reviewer_handoff.py, tests/test_review_language.py and REVIEWERS.md. Added local review_content evidence table; AppSheet schema/configuration and financial rules were not changed.

Pre-change code, config and runbook copies: collection-agent/local/before-review-details-20260909/. No AppSheet or Looker backup required because neither app/report was edited. Preserve live SQLite records on rollback.

## Checks and live result

32 Python tests passed, including explicit midnight/date-reason and evidence-content coverage. Initial read check exposed a missing Windows timezone-data package; rendering now uses Bangkok's UTC+07 offset without that dependency. Fresh AppSheet reads use the borrower's resolved route.

Updated pending receipt requests sent to configured English reviewer through API; both detailed receipt editions have VERIFIED readback. Inspected the latest 300 THB message: transfer September 8 at 17:59, submission September 9 at 00:27, review September 9 at 00:28, specific day mismatch, reference, bank comparison and fresh balance. The handoff also delivered an outstanding exception case through the existing case format. No financial record posted by these handoffs. Processing restored; worker and receiver restarted, HTTP 200 verified.

## Acceptance and downstream effects

User should verify that the latest English message provides sufficient decision context and that a correlated reply is understandable. Approval remains subject to existing final checks; this task does not relax prior-day receipt or duplicate rules. Long requests are translated/compressed within the existing message limit with numeric and identifier preservation checks; failures hold delivery instead of sending incomplete evidence. Historical messages are retained; a versioned details handoff produces one updated receipt edition.

## Rollback

Disable processing temporarily, restore backed-up code/config/runbook, restart installed worker/receiver and restore the prior processing state. Retain local review_content/presentation/outbox audit data and all subsequent financial activity. Previously delivered Instagram messages remain delivered.
