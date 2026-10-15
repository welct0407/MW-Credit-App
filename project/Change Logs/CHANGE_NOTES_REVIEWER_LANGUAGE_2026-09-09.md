# Reviewer language preferences — 2026-09-09

Status: Implemented and running; user acceptance of wording pending.

## Scope and purpose

Added per-reviewer language preferences to the editable local reviewer list. Tommy is English (`en`). Receipt and exception review requests use the selected recipient's language; existing entries default to Thai when omitted. No AppSheet app, schema, borrower mapping, financial rule, or financial record was changed by this implementation.

## Changes

- `collection-agent/agent/reviewers.py`, `agent/routing.py`, and `mw-ai-collection/src/reviewers.mjs`: validate and propagate language preferences.
- `collection-agent/agent/ai_job.py`: reusable structured, tool-free Codex job for translation using existing configured model credentials.
- `collection-agent/agent/review_language.py` and `review-translation.schema.json`: cached translations with numeric/ID preservation checks and immutable action/recipient/source binding.
- `collection-agent/agent/dispatch.py`, `agent/reviewer_handoff.py`: render review sends in recipient language and allow an auditable language-specific outstanding-review edition.
- `mw-ai-collection/src/instagram_evidence.mjs`: accept translated text only through persisted source/recipient-bound proof and exact verified outbox text.
- Added Python and Node regression tests. Updated `collection-agent/REVIEWERS.md` and `reviewers.example.json`.
- Private local reviewers.json now sets Tommy's language to English. Local SQLite `review_presentations` stores original/rendered message evidence; no AppSheet data-model change.

## Rollback point

Pre-change copies and consistent database snapshots: `collection-agent/local/before-reviewer-language-20260909/`. Documentation and example copies also retained there. AppSheet/Looker version backups are not applicable because neither configuration was changed.

## Validation

- 31 Python tests passed; 57 Node tests passed (88 total).
- Initial root-directory Python invocation failed import resolution; rerun from collection-agent passed.
- Restarted installed event worker and webhook receiver at 00:20 Bangkok; both Running, health endpoint HTTP 200.
- Restored processing enabled after checks; existing hourly schedule unchanged.
- Two outstanding review requests delivered to Tommy in English, API readback VERIFIED. Inspected wording, amounts, record IDs, duplicate explanation and CASE reply instruction.
- Repeated handoff returned ALREADY_ASSIGNED for both, with no duplicate delivery.
- Existing payment and dispute holds preserved; no payment posted by this handoff.

## Manual acceptance and limitations

Please review the English requests in Tommy's Instagram and confirm the wording. Future reviewers can specify their own language in the same list. Other languages have not been manually reviewed. Translation adds one cached Codex inference per new non-Thai request; translation validation failure holds delivery. Already-sent messages remain immutable; a language change uses an explicit handoff to send one new edition.

## Rollback

Temporarily disable processing, restore changed code/config from the named backup, restart the installed worker/receiver, then restore the previous processing switch. Preserve current SQLite records and sent-message audit evidence; do not replace live databases with snapshots after new activity. Delivered Instagram messages cannot be undone by a code rollback.
