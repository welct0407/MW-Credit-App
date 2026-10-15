# Direct Instagram reviewer decisions — 2026-09-09

Status: Implemented and enabled; live reviewer acceptance pending.

## Behavior

An active reviewer uses Instagram Reply on a delivered review and writes Approve or Reject. The persisted reply_to.mid and verified outbound recipient bind the decision to its receipt/case. The worker processes these commands deterministically before AI classification, including multiple linked commands in one burst. No copied reference, repeated amount/date, CASE prefix or separate acceptance phrase is required. Receipt approval accepts disclosed exceptions with the extracted transfer date and amount; duplicate protection and final posting checks remain. Receipt rejection records rejection without posting. General case decisions use the existing case workflow; unspecified financial changes are not inferred.

Unlinked short approval/rejection words are marked unlinked and never converted into borrower disputes. Earlier verified review editions can also be replied to. Historical approvals/rejections were not replayed and no financial records were changed as a validation step.

## Changes

- collection-agent/agent/direct_review.py: deterministic reply targeting.
- collection-agent/agent/event_worker.py: pre-classifier routing and existing scoped payment continuation.
- mw-ai-collection/src/instagram_evidence.mjs: independently verifies actual persisted reply linkage, reviewer role, recipient, verified send, chronology and exact decision words.
- mw-ai-collection/src/event_actions.mjs: linked receipt approval/rejection and case decision, with borrower binding and repeat guards.
- mw-ai-collection/src/exception_engine.mjs: accepts independently verified linked decisions, simplifies new case instructions.
- collection-agent/agent/review_details.py and reviewer_handoff.py: simple reply instructions; REVIEWERS.md updated.
- Python and Node regression tests cover AI bypass, both decisions, wrong recipient, removed reviewer, unknown message and unverified send rejection.

## Rollback and checks

Pre-change code/config: collection-agent/local/before-direct-review-20260909/. No AppSheet or Looker configuration was edited, so app/report version backup is not applicable. Restore those code/config copies with processing temporarily disabled, restart installed worker/receiver and restore prior processing state. Preserve live SQLite/outbox and all financial activity. Do not restore old databases over current records.

33 Python tests passed. Full Node suite passed before the added targeted test (57 tests); updated evidence suite passed all 3 tests, including the new linked-review test. Installed worker and receiver restarted successfully, both Running and health HTTP 200; processing enabled. New decision handling avoids a Codex inference for linked commands.

## Manual acceptance

Reply directly to the latest Lisa review with Approve, or reply to an unwanted review with Reject. Confirm that it records the intended decision and, for an approvable receipt, proceeds through normal posting and acknowledgment. A live financial posting was not fabricated for testing. Existing unrelated case holds may still require their own decisions through the same reply mechanism.
